import { beforeEach, describe, expect, it, vi } from 'vitest';

import { scoreForPosition } from '@/lib/ranking/score';

/**
 * In-memory fake standing in for the session-aware Supabase client, covering every table this
 * module (and, transitively, `@/lib/ranking-session`'s `getShowRankingDisplay`, which the live-pool
 * computation calls per tracked show) touches: `user_shows`, `episodes`, `episode_rankings`,
 * `episode_comparisons`, `all_star_rankings`, `all_star_comparisons`. Mirrors
 * `@/lib/ranking-session/session.test.ts`'s `FakeSupabase` style closely (thenable read-chain
 * builders, a real in-memory table array rather than scripted per-call responses) -- see that
 * file's own doc comment for the full rationale.
 *
 * No `.in()` support is needed on any read builder here: this module never issues an `.in()` read
 * against `all_star_rankings`/`all_star_comparisons` (see Docs/STATUS.md Bucket 1 item 1 and this
 * module's own doc comment) -- everything is scoped by `.eq('user_id', ...)` alone and filtered in
 * application code. `.eq()` is still needed on delete chains (single ids), which `makeDeleteBuilder`
 * supports.
 */
interface FakeEpisodeRow {
  id: string;
  show_id: string;
  season_number: number;
  episode_number: number;
}

interface FakeRankingRow {
  user_id: string;
  episode_id: string;
  rank_position: number | null;
  cold_start_bucket: string | null;
  cold_start_sequence: number | null;
  created_at: string;
}

interface FakeComparisonRow {
  id: string;
  user_id: string;
  episode_a_id: string;
  episode_b_id: string;
  result: string;
}

interface FakeUserShowRow {
  user_id: string;
  show_id: string;
}

interface FakeAllStarRankingRow {
  user_id: string;
  show_id: string;
  episode_id: string;
  rank_position: number;
  created_at: string;
}

interface FakeAllStarComparisonRow {
  id: string;
  user_id: string;
  episode_a_id: string;
  episode_b_id: string;
  result: string;
}

interface FakeQueryBuilder<T> extends PromiseLike<{ data: T[]; error: null }> {
  select: (columns?: string) => FakeQueryBuilder<T>;
  eq: (column: string, value: unknown) => FakeQueryBuilder<T>;
  order: (column: string, opts?: { ascending: boolean }) => FakeQueryBuilder<T>;
}

function makeReadBuilder<T extends object>(rows: readonly T[]): FakeQueryBuilder<T> {
  const filters: Array<(row: T) => boolean> = [];
  const asRecord = (row: T) => row as unknown as Record<string, unknown>;
  const builder: FakeQueryBuilder<T> = {
    select: () => builder,
    eq: (column, value) => {
      filters.push((row) => asRecord(row)[column] === value);
      return builder;
    },
    order: () => builder,
    then: (onFulfilled, onRejected) => {
      const data = rows.filter((row) => filters.every((f) => f(row)));
      return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

interface FakeDeleteBuilder extends PromiseLike<{ error: null }> {
  eq: (column: string, value: unknown) => FakeDeleteBuilder;
}

/** Mirrors `session.test.ts`'s `makeDeleteBuilder` -- splices matching rows out in place. */
function makeDeleteBuilder<T extends object>(rows: T[]): FakeDeleteBuilder {
  const filters: Array<(row: T) => boolean> = [];
  const asRecord = (row: T) => row as unknown as Record<string, unknown>;
  const builder: FakeDeleteBuilder = {
    eq: (column, value) => {
      filters.push((row) => asRecord(row)[column] === value);
      return builder;
    },
    then: (onFulfilled, onRejected) => {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (filters.every((f) => f(rows[i]))) {
          rows.splice(i, 1);
        }
      }
      return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

class FakeSupabase {
  userShows: FakeUserShowRow[] = [];
  episodes: FakeEpisodeRow[] = [];
  rankings: FakeRankingRow[] = [];
  comparisons: FakeComparisonRow[] = [];
  allStarRankings: FakeAllStarRankingRow[] = [];
  allStarComparisons: FakeAllStarComparisonRow[] = [];
  currentUserId: string | null = 'user-1';
  private allStarComparisonIdCounter = 0;
  private allStarCreatedAtCounter = 0;

  auth = {
    getUser: async () => ({
      data: { user: this.currentUserId ? { id: this.currentUserId } : null },
    }),
  };

  private nextAllStarCreatedAt(): string {
    return new Date(Date.UTC(2026, 2, 1, 0, 0, this.allStarCreatedAtCounter++)).toISOString();
  }

  from(table: string) {
    if (table === 'user_shows') {
      return makeReadBuilder(this.userShows);
    }
    if (table === 'episodes') {
      return makeReadBuilder(this.episodes);
    }
    if (table === 'episode_rankings') {
      return makeReadBuilder(this.rankings);
    }
    if (table === 'episode_comparisons') {
      return makeReadBuilder(this.comparisons);
    }
    if (table === 'all_star_rankings') {
      const builder = makeReadBuilder(this.allStarRankings);
      return {
        ...builder,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature-compatible with the real `.upsert(rows, options)`; the fake always matches on (user_id, show_id).
        upsert: (rows: Omit<FakeAllStarRankingRow, 'created_at'>[], _opts?: { onConflict: string }) => {
          for (const row of rows) {
            const idx = this.allStarRankings.findIndex(
              (r) => r.user_id === row.user_id && r.show_id === row.show_id
            );
            if (idx >= 0) {
              this.allStarRankings[idx] = { ...this.allStarRankings[idx], ...row };
            } else {
              this.allStarRankings.push({ ...row, created_at: this.nextAllStarCreatedAt() });
            }
          }
          return Promise.resolve({ data: null, error: null });
        },
        delete: () => makeDeleteBuilder(this.allStarRankings),
      };
    }
    if (table === 'all_star_comparisons') {
      const builder = makeReadBuilder(this.allStarComparisons);
      return {
        ...builder,
        insert: (row: Omit<FakeAllStarComparisonRow, 'id'>) => {
          const id = `astar-cmp-${this.allStarComparisonIdCounter++}`;
          this.allStarComparisons.push({ id, ...row });
          return Promise.resolve({ data: null, error: null });
        },
        delete: () => makeDeleteBuilder(this.allStarComparisons),
      };
    }
    throw new Error(`Unexpected table in test: ${table}`);
  }
}

let fake: FakeSupabase;

vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: async () => fake,
}));

const { getAllStarDisplay, getNextAllStarStep, resetAllStarRanking, submitAllStarComparisonAnswer } = await import(
  './session'
);

/**
 * Adds a tracked show (`user_shows` row) whose per-show ranking is already fully placed, with
 * `rankedEpisodeIds.length` episodes at positions 1..N (best to worst) -- so
 * `getShowRankingDisplay(showId)` reports `done: true` with that exact order, and its live #1 is
 * `rankedEpisodeIds[0]`.
 */
function addFullyRankedShow(showId: string, rankedEpisodeIds: string[], userId = 'user-1') {
  fake.userShows.push({ user_id: userId, show_id: showId });
  rankedEpisodeIds.forEach((episodeId, i) => {
    fake.episodes.push({ id: episodeId, show_id: showId, season_number: 1, episode_number: i + 1 });
    fake.rankings.push({
      user_id: userId,
      episode_id: episodeId,
      rank_position: i + 1,
      cold_start_bucket: null,
      cold_start_sequence: null,
      created_at: '2026-01-01T00:00:00.000Z',
    });
  });
}

/** A tracked show with episodes but nothing ranked yet -- no live #1, must be excluded from the pool. */
function addUnrankedShow(showId: string, episodeIds: string[], userId = 'user-1') {
  fake.userShows.push({ user_id: userId, show_id: showId });
  episodeIds.forEach((episodeId, i) => {
    fake.episodes.push({ id: episodeId, show_id: showId, season_number: 1, episode_number: i + 1 });
  });
}

/** Four already-eligible shows (A1-A4 .. D1-D4), each with a single-episode "show" so its #1 is unambiguous. */
function seedFourEligibleShows() {
  addFullyRankedShow('show-a', ['a1']);
  addFullyRankedShow('show-b', ['b1']);
  addFullyRankedShow('show-c', ['c1']);
  addFullyRankedShow('show-d', ['d1']);
}

beforeEach(() => {
  fake = new FakeSupabase();
});

describe('eligibility threshold', () => {
  it('reports not eligible with fewer than 4 shows with a live #1', async () => {
    addFullyRankedShow('show-a', ['a1']);
    addFullyRankedShow('show-b', ['b1']);
    addFullyRankedShow('show-c', ['c1']);

    await expect(getAllStarDisplay()).resolves.toEqual({ eligible: false });
  });

  it('excludes shows with zero ranked episodes from the eligibility count -- a 5th tracked-but-unranked show does not push a 3-eligible-show user over the threshold', async () => {
    addFullyRankedShow('show-a', ['a1']);
    addFullyRankedShow('show-b', ['b1']);
    addFullyRankedShow('show-c', ['c1']);
    addUnrankedShow('show-unranked', ['u1', 'u2']);

    await expect(getAllStarDisplay()).resolves.toEqual({ eligible: false });
  });

  it('becomes eligible at exactly 4 shows with a live #1', async () => {
    seedFourEligibleShows();

    const display = await getAllStarDisplay();
    expect(display.eligible).toBe(true);
  });
});

describe('placement -- first entrant into an empty pool needs no comparison', () => {
  it('auto-places the very first entrant with zero questions, then asks a real question for the second', async () => {
    seedFourEligibleShows();

    const display = await getAllStarDisplay();
    expect(display.eligible).toBe(true);
    if (!display.eligible) return;

    // The first entrant (show-a's a1, first in user_shows order) needed no comparison at all --
    // it's already placed. The second (show-b's b1) needs a real question against it.
    expect(display.done).toBe(false);
    expect(display.ranked).toEqual([{ episodeId: 'a1', showId: 'show-a', rank: 1, score: scoreForPosition(1, 1) }]);
    expect(display.pendingCount).toBe(3);

    await expect(getNextAllStarStep()).resolves.toEqual({ type: 'compare', subject: 'b1', reference: 'a1' });
  });
});

describe('full replay-then-ask loop across multiple pending entrants', () => {
  it('places every entrant end to end via submitAllStarComparisonAnswer, ending done with the full order persisted', async () => {
    seedFourEligibleShows();

    // a1 auto-places. b1 needs a1.
    let step = await getNextAllStarStep();
    expect(step).toEqual({ type: 'compare', subject: 'b1', reference: 'a1' });

    // b1 better than a1 -> ranked = [b1, a1].
    step = await submitAllStarComparisonAnswer('b1', 'a1', 'better');
    // c1 is next: binary search over [b1, a1] starts at mid index 0 -> b1.
    expect(step).toEqual({ type: 'compare', subject: 'c1', reference: 'b1' });

    // c1 worse than b1 -> lo=1, hi=1, mid=1 -> next pivot a1.
    step = await submitAllStarComparisonAnswer('c1', 'b1', 'worse');
    expect(step).toEqual({ type: 'compare', subject: 'c1', reference: 'a1' });

    // c1 better than a1 -> hi=0, lo(1) > hi(0) -> placement completes: [b1, c1, a1].
    step = await submitAllStarComparisonAnswer('c1', 'a1', 'better');
    // d1 is next: binary search over [b1, c1, a1] starts at mid index 1 -> c1.
    expect(step).toEqual({ type: 'compare', subject: 'd1', reference: 'c1' });

    // d1 worse than c1 -> lo=2, hi=2, mid=2 -> pivot a1.
    step = await submitAllStarComparisonAnswer('d1', 'c1', 'worse');
    expect(step).toEqual({ type: 'compare', subject: 'd1', reference: 'a1' });

    // d1 better than a1 -> hi=1, lo(2) > hi(1) -> placement completes: [b1, c1, d1, a1]. Nothing left pending.
    step = await submitAllStarComparisonAnswer('d1', 'a1', 'better');
    expect(step).toEqual({ type: 'done' });

    const positions = new Map(fake.allStarRankings.map((r) => [r.episode_id, r.rank_position]));
    expect(positions.get('b1')).toBe(1);
    expect(positions.get('c1')).toBe(2);
    expect(positions.get('d1')).toBe(3);
    expect(positions.get('a1')).toBe(4);

    const display = await getAllStarDisplay();
    expect(display.eligible).toBe(true);
    if (!display.eligible) return;
    expect(display.done).toBe(true);
    expect(display.ranked.map((e) => e.episodeId)).toEqual(['b1', 'c1', 'd1', 'a1']);
    expect(display.ranked.map((e) => e.showId)).toEqual(['show-b', 'show-c', 'show-d', 'show-a']);
    expect(display.pendingCount).toBe(0);
  });

  it('rejects a comparison submission for the wrong pending pair without writing anything', async () => {
    seedFourEligibleShows();
    await getNextAllStarStep(); // a1 auto-places; pending step is now b1 vs a1.

    await expect(submitAllStarComparisonAnswer('b1', 'z1', 'better')).rejects.toThrow(
      /Unexpected all-star comparison submission/
    );
    expect(fake.allStarComparisons).toHaveLength(0);
  });
});

describe('reconciliation -- stale entries', () => {
  it('detects a show whose #1 changed, clears its old entry and comparisons, and leaves unrelated shows untouched', async () => {
    seedFourEligibleShows();
    // Fully place all four (b1 > c1 > d1 > a1, same order as the loop test above).
    await submitAllStarComparisonAnswer('b1', 'a1', 'better');
    await submitAllStarComparisonAnswer('c1', 'b1', 'worse');
    await submitAllStarComparisonAnswer('c1', 'a1', 'better');
    await submitAllStarComparisonAnswer('d1', 'c1', 'worse');
    await submitAllStarComparisonAnswer('d1', 'a1', 'better');

    const comparisonsBeforeCount = fake.allStarComparisons.length;
    expect(comparisonsBeforeCount).toBeGreaterThan(0);

    // Show B's #1 changes: re-rank show-b so its live #1 is now a brand new episode, "b2".
    fake.episodes.push({ id: 'b2', show_id: 'show-b', season_number: 1, episode_number: 2 });
    fake.rankings = fake.rankings.filter((r) => r.episode_id !== 'b1');
    fake.rankings.push({
      user_id: 'user-1',
      episode_id: 'b2',
      rank_position: 1,
      cold_start_bucket: null,
      cold_start_sequence: null,
      created_at: '2026-01-02T00:00:00.000Z',
    });

    const display = await getAllStarDisplay();
    expect(display.eligible).toBe(true);
    if (!display.eligible) return;

    // show-b is reported as stale.
    expect(display.staleShowIds).toEqual(['show-b']);
    // The old b1 entry (and its comparisons) are gone; the other three shows' data survives,
    // with b2 now queued as a pending entrant.
    expect(fake.allStarRankings.find((r) => r.episode_id === 'b1')).toBeUndefined();
    expect(
      fake.allStarComparisons.find((c) => c.episode_a_id === 'b1' || c.episode_b_id === 'b1')
    ).toBeUndefined();
    expect(fake.allStarRankings.find((r) => r.show_id === 'show-c')).toBeDefined();
    expect(fake.allStarRankings.find((r) => r.show_id === 'show-d')).toBeDefined();
    expect(fake.allStarRankings.find((r) => r.show_id === 'show-a')).toBeDefined();
    // A comparison unrelated to b1 (e.g. c1 vs a1) survives untouched.
    expect(
      fake.allStarComparisons.some(
        (c) =>
          (c.episode_a_id === 'c1' && c.episode_b_id === 'a1') ||
          (c.episode_a_id === 'a1' && c.episode_b_id === 'c1')
      )
    ).toBe(true);

    // b2 is now a pending entrant, needing a fresh comparison (no stale history reused).
    expect(display.pendingCount).toBe(1);
    const step = await getNextAllStarStep();
    expect(step.type).toBe('compare');
    if (step.type === 'compare') {
      expect(step.subject).toBe('b2');
    }
  });

  it('removes an orphaned entry whose show is no longer in the live pool at all, without touching other shows', async () => {
    seedFourEligibleShows();
    await submitAllStarComparisonAnswer('b1', 'a1', 'better');
    await submitAllStarComparisonAnswer('c1', 'b1', 'worse');
    await submitAllStarComparisonAnswer('c1', 'a1', 'better');
    await submitAllStarComparisonAnswer('d1', 'c1', 'worse');
    await submitAllStarComparisonAnswer('d1', 'a1', 'better');

    // Simulate show-d being untracked/removed: drop its user_shows row and its per-show ranking
    // data entirely (its live #1 is now gone), but its stale all_star_rankings/all_star_comparisons
    // rows are left behind, as if the show-removal cleanup path were somehow skipped.
    fake.userShows = fake.userShows.filter((r) => r.show_id !== 'show-d');
    fake.rankings = fake.rankings.filter((r) => r.episode_id !== 'd1');
    fake.episodes = fake.episodes.filter((e) => e.show_id !== 'show-d');

    await getAllStarDisplay();

    expect(fake.allStarRankings.find((r) => r.show_id === 'show-d')).toBeUndefined();
    expect(
      fake.allStarComparisons.find((c) => c.episode_a_id === 'd1' || c.episode_b_id === 'd1')
    ).toBeUndefined();
    // The other three shows are untouched.
    expect(fake.allStarRankings.find((r) => r.show_id === 'show-a')).toBeDefined();
    expect(fake.allStarRankings.find((r) => r.show_id === 'show-b')).toBeDefined();
    expect(fake.allStarRankings.find((r) => r.show_id === 'show-c')).toBeDefined();
  });
});

describe('resetAllStarRanking', () => {
  it('deletes every all-star ranking and comparison row for the signed-in user only, leaving another user\'s rows untouched', async () => {
    seedFourEligibleShows();
    await submitAllStarComparisonAnswer('b1', 'a1', 'better');

    fake.allStarRankings.push({
      user_id: 'user-2',
      show_id: 'show-a',
      episode_id: 'a1',
      rank_position: 1,
      created_at: '2026-01-01T00:00:00.000Z',
    });
    fake.allStarComparisons.push({
      id: 'other-user-cmp',
      user_id: 'user-2',
      episode_a_id: 'a1',
      episode_b_id: 'b1',
      result: 'a_better',
    });

    await resetAllStarRanking();

    expect(fake.allStarRankings.filter((r) => r.user_id === 'user-1')).toHaveLength(0);
    expect(fake.allStarComparisons.filter((c) => c.user_id === 'user-1')).toHaveLength(0);
    expect(fake.allStarRankings.filter((r) => r.user_id === 'user-2')).toHaveLength(1);
    expect(fake.allStarComparisons.filter((c) => c.user_id === 'user-2')).toHaveLength(1);
  });
});

describe('per-user isolation', () => {
  it('never lets one user\'s pool leak into another user\'s live-pool computation or display', async () => {
    seedFourEligibleShows(); // all seeded for user-1

    fake.currentUserId = 'user-2';
    // user-2 has no tracked shows at all.
    await expect(getAllStarDisplay()).resolves.toEqual({ eligible: false });

    fake.currentUserId = 'user-1';
    const display = await getAllStarDisplay();
    expect(display.eligible).toBe(true);
  });
});

describe('no signed-in user', () => {
  it('rejects rather than deriving anything', async () => {
    seedFourEligibleShows();
    fake.currentUserId = null;

    await expect(getAllStarDisplay()).rejects.toThrow('Not signed in.');
  });
});
