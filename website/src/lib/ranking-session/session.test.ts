import { beforeEach, describe, expect, it, vi } from 'vitest';

import { COLD_START_THRESHOLD } from '@/lib/ranking/constants';
import { scoreForPosition } from '@/lib/ranking/score';
import { showConfidence } from '@/lib/ranking/confidence';

/**
 * A small in-memory fake standing in for the session-aware Supabase client, covering exactly the
 * calls `session.ts` makes: `.auth.getUser()`, and `.from(table)` chains for
 * `episodes`/`episode_rankings`/`episode_comparisons` (select/eq/in/order reads, insert/upsert
 * writes). Modeled as a real (tiny) in-memory database — rows actually get inserted/updated and
 * later reads reflect it — rather than hand-scripting per-call return values, since the flows
 * under test (cold start -> threshold crossing -> comparative placement -> tie-break) span many
 * sequential reads/writes and a faithful fake is far less brittle than enumerating each call.
 *
 * Read chains are "thenable" builders (`select().eq().order()` etc. resolve when awaited directly,
 * with no terminal call) since that's exactly how `session.ts` uses them — mirrors real
 * `@supabase/supabase-js` query builder behavior.
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

/** A fixed, arbitrary `created_at` for seed rows in tests that don't care about its exact value. */
const SEED_CREATED_AT = '2026-01-01T00:00:00.000Z';

interface FakeComparisonRow {
  id: string;
  user_id: string;
  episode_a_id: string;
  episode_b_id: string;
  result: string;
}

interface FakeQueryBuilder<T> extends PromiseLike<{ data: T[]; error: null }> {
  select: (columns?: string) => FakeQueryBuilder<T>;
  eq: (column: string, value: unknown) => FakeQueryBuilder<T>;
  in: (column: string, values: unknown[]) => FakeQueryBuilder<T>;
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
    in: (column, values) => {
      const set = new Set(values);
      filters.push((row) => set.has(asRecord(row)[column]));
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
  in: (column: string, values: unknown[]) => FakeDeleteBuilder;
}

/**
 * Mirrors `makeReadBuilder`'s thenable-chain shape, but for `.delete().eq()/.in()...` — removes
 * every row matching *all* accumulated filters from the backing array in place (splice, not
 * reassignment) so the array reference the fake's `rankings`/`comparisons` fields point at stays
 * live for callers that captured it before the delete (matching how a real Supabase delete affects
 * the underlying table without the caller needing to re-fetch a new array reference).
 */
function makeDeleteBuilder<T extends object>(rows: T[]): FakeDeleteBuilder {
  const filters: Array<(row: T) => boolean> = [];
  const asRecord = (row: T) => row as unknown as Record<string, unknown>;
  const builder: FakeDeleteBuilder = {
    eq: (column, value) => {
      filters.push((row) => asRecord(row)[column] === value);
      return builder;
    },
    in: (column, values) => {
      const set = new Set(values);
      filters.push((row) => set.has(asRecord(row)[column]));
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
  episodes: FakeEpisodeRow[] = [];
  rankings: FakeRankingRow[] = [];
  comparisons: FakeComparisonRow[] = [];
  currentUserId: string | null = 'user-1';
  private comparisonIdCounter = 0;
  private rankingCreatedAtCounter = 0;

  auth = {
    getUser: async () => ({
      data: { user: this.currentUserId ? { id: this.currentUserId } : null },
    }),
  };

  /**
   * Mirrors `episode_rankings.created_at timestamptz not null default now()`: a fresh, monotonically
   * increasing timestamp assigned whenever a row is actually inserted for the first time — never
   * passed explicitly by the production `insert`/`upsert` call sites in `session.ts`, exactly like a
   * real DB-side default wouldn't be either.
   */
  private nextCreatedAt(): string {
    return new Date(Date.UTC(2026, 1, 1, 0, 0, this.rankingCreatedAtCounter++)).toISOString();
  }

  from(table: string) {
    if (table === 'episodes') {
      return makeReadBuilder(this.episodes);
    }
    if (table === 'episode_rankings') {
      const builder = makeReadBuilder(this.rankings);
      return {
        ...builder,
        insert: (row: Omit<FakeRankingRow, 'created_at'>) => {
          this.rankings.push({ ...row, created_at: this.nextCreatedAt() });
          return Promise.resolve({ data: null, error: null });
        },
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature-compatible with the real `.upsert(rows, options)`; the fake ignores `onConflict` since it always matches on (user_id, episode_id).
        upsert: (rows: Omit<FakeRankingRow, 'created_at'>[], _opts?: { onConflict: string }) => {
          for (const row of rows) {
            const idx = this.rankings.findIndex(
              (r) => r.user_id === row.user_id && r.episode_id === row.episode_id
            );
            if (idx >= 0) {
              // Real upsert only updates columns present in the row being written — `created_at`
              // isn't one of them (see `persistRankedPositions`), so the existing value survives.
              this.rankings[idx] = { ...this.rankings[idx], ...row };
            } else {
              this.rankings.push({ ...row, created_at: this.nextCreatedAt() });
            }
          }
          return Promise.resolve({ data: null, error: null });
        },
        delete: () => makeDeleteBuilder(this.rankings),
      };
    }
    if (table === 'episode_comparisons') {
      const builder = makeReadBuilder(this.comparisons);
      return {
        ...builder,
        insert: (row: Omit<FakeComparisonRow, 'id'>) => {
          const id = `cmp-${this.comparisonIdCounter++}`;
          this.comparisons.push({ id, ...row });
          return Promise.resolve({ data: null, error: null });
        },
        delete: () => makeDeleteBuilder(this.comparisons),
      };
    }
    throw new Error(`Unexpected table in test: ${table}`);
  }
}

let fake: FakeSupabase;

vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: async () => fake,
}));

const {
  deleteShowRankingData,
  getEpisodeComparisonRecord,
  getNextRankingStep,
  getNextStepForEpisode,
  getShowRankingDisplay,
  resetEpisodeRanking,
  submitColdStartAnswer,
  submitComparisonAnswer,
} = await import('./session');

/** Adds `count` episodes (ids `ep1..epN`) to the fake show in season/episode order. */
function seedEpisodes(count: number, showId = 'show-1'): string[] {
  const ids = Array.from({ length: count }, (_, i) => `ep${i + 1}`);
  fake.episodes = ids.map((id, i) => ({
    id,
    show_id: showId,
    season_number: 1,
    episode_number: i + 1,
  }));
  return ids;
}

const SHOW_ID = 'show-1';

beforeEach(() => {
  fake = new FakeSupabase();
});

describe('getNextRankingStep — no signed-in user', () => {
  it('rejects rather than deriving anything, without querying the DB', async () => {
    seedEpisodes(3);
    fake.currentUserId = null;

    await expect(getNextRankingStep(SHOW_ID)).rejects.toThrow('Not signed in.');
  });
});

describe('cold-start progression and threshold crossing', () => {
  it('walks episodes through cold start in season/episode order, then crosses into a comparative question once COLD_START_THRESHOLD is reached', async () => {
    // One extra episode beyond the threshold so there's something to compare the first
    // comparatively-placed episode against.
    const ids = seedEpisodes(COLD_START_THRESHOLD + 1);
    const buckets: Array<'liked' | 'neutral' | 'disliked'> = ['liked', 'neutral', 'disliked', 'liked'];

    for (let i = 0; i < COLD_START_THRESHOLD; i++) {
      const step = await getNextRankingStep(SHOW_ID);
      expect(step).toEqual({ type: 'coldStart', episode: ids[i] });

      // Cold-start submissions always resolve to 'alreadyRanked' for the submitted episode
      // itself — there's never a same-episode follow-up question for cold start.
      const result = await submitColdStartAnswer(SHOW_ID, ids[i], buckets[i % buckets.length]);
      expect(result).toEqual({ type: 'alreadyRanked' });
    }

    // The threshold just crossed on the last submission above: cold-start entries fold into
    // comparative ranking immediately, and since there's one more unranked episode, the very next
    // global step should already be a real comparison question, not "done" or another cold-start
    // prompt.
    const finalStep = await getNextRankingStep(SHOW_ID);
    expect(finalStep.type).toBe('compare');
    if (finalStep.type === 'compare') {
      expect(finalStep.subject).toBe(ids[COLD_START_THRESHOLD]);
      // Cold-start seed order is liked (most-recent-first) > neutral > disliked (see
      // @/lib/ranking/coldStart.ts) — with buckets [liked, neutral, disliked, liked] assigned to
      // ep1..ep4, the seeded ranked order is [ep4, ep1, ep2, ep3], and binary search starts at the
      // midpoint (index 1) of that 4-long list.
      expect(finalStep.reference).toBe(ids[0]);
    }
  });

  it('routes a small show (fewer than COLD_START_THRESHOLD total episodes) through the global next-step entry point the same way getNextStepForEpisode does', async () => {
    // Same scenario as getShowRankingDisplay's "too small to ever leave cold start" test below,
    // but driven through getNextRankingStep/deriveNextStep (the season/episode-order global path)
    // rather than getNextStepForEpisode (the per-episode picker path) — both call sites share the
    // same isColdStart(state, totalShowEpisodeCount) semantics, but this exercises deriveNextStep's
    // own loop directly rather than assuming that from the per-episode test alone.
    const ids = seedEpisodes(3);

    await expect(getNextRankingStep(SHOW_ID)).resolves.toEqual({ type: 'coldStart', episode: ids[0] });
    await submitColdStartAnswer(SHOW_ID, ids[0], 'neutral');

    // Episode 1 alone already meets the effective threshold (1) for a 3-episode show, so the very
    // next global step is a real comparison question, not a second cold-start bucket.
    await expect(getNextRankingStep(SHOW_ID)).resolves.toEqual({
      type: 'compare',
      subject: ids[1],
      reference: ids[0],
    });
    await submitComparisonAnswer(SHOW_ID, ids[1], ids[0], 'better');
    // ranked = [ids[1], ids[0]]

    await expect(getNextRankingStep(SHOW_ID)).resolves.toEqual({
      type: 'compare',
      subject: ids[2],
      reference: ids[1],
    });
    await submitComparisonAnswer(SHOW_ID, ids[2], ids[1], 'worse');
    await expect(getNextRankingStep(SHOW_ID)).resolves.toEqual({
      type: 'compare',
      subject: ids[2],
      reference: ids[0],
    });
    await submitComparisonAnswer(SHOW_ID, ids[2], ids[0], 'better');
    // ranked = [ids[1], ids[2], ids[0]]

    await expect(getNextRankingStep(SHOW_ID)).resolves.toEqual({ type: 'done' });
  });

  it('rejects a cold-start submission for an episode that does not belong to the show, without writing anything', async () => {
    seedEpisodes(COLD_START_THRESHOLD + 2);

    await expect(submitColdStartAnswer(SHOW_ID, 'not-an-episode', 'liked')).rejects.toThrow(
      /Unexpected cold-start submission/
    );
    expect(fake.rankings).toHaveLength(0);
  });

  it('rejects a duplicate cold-start submission for an episode that already has ranking data, without writing anything again', async () => {
    const ids = seedEpisodes(COLD_START_THRESHOLD + 2);

    await submitColdStartAnswer(SHOW_ID, ids[0], 'liked');
    await expect(submitColdStartAnswer(SHOW_ID, ids[0], 'disliked')).rejects.toThrow(
      /Unexpected cold-start submission/
    );
    expect(fake.rankings).toHaveLength(1);
  });
});

describe('fully ranked show — nothing left to do', () => {
  it('reports done once every episode already has a ranking row, even one seeded as all-cold-start data', async () => {
    // 3 episodes, all with a cold_start_bucket row and no rank_position — a state a real small
    // show can no longer reach post-fix (episode 2+ now go through comparative placement, see the
    // "small shows" describe block below), but still a valid `episode_rankings` shape to defend
    // against (e.g. pre-fix data, or a future direct seed) for the "done" detection itself.
    const ids = seedEpisodes(3);
    fake.rankings = ids.map((id, i) => ({
      user_id: 'user-1',
      episode_id: id,
      rank_position: null,
      cold_start_bucket: 'neutral',
      cold_start_sequence: i,
      created_at: SEED_CREATED_AT,
    }));

    await expect(getNextRankingStep(SHOW_ID)).resolves.toEqual({ type: 'done' });
  });
});

/** Seeds a show already past cold start: 4 already-ranked episodes (A-D) plus N more unranked. */
function seedComparativePool(extraUnranked: number) {
  const rankedIds = ['A', 'B', 'C', 'D'];
  const extraIds = Array.from({ length: extraUnranked }, (_, i) => `X${i + 1}`);
  const allIds = [...rankedIds, ...extraIds];

  fake.episodes = allIds.map((id, i) => ({
    id,
    show_id: SHOW_ID,
    season_number: 1,
    episode_number: i + 1,
  }));
  fake.rankings = rankedIds.map((id, i) => ({
    user_id: 'user-1',
    episode_id: id,
    rank_position: i + 1, // A=1 (best) .. D=4 (worst)
    cold_start_bucket: null,
    cold_start_sequence: null,
    // Distinct per episode (rather than SEED_CREATED_AT for all) so tests can assert
    // getShowRankingDisplay actually threads each episode's own created_at through, not just a
    // single shared value that would pass even if every row got the same one by mistake.
    created_at: `2026-01-0${i + 1}T00:00:00.000Z`,
  }));

  return { rankedIds, extraIds, allIds };
}

describe('comparative placement — resolves without a tie-break', () => {
  it('completes placement across two decisive comparison answers, then reports alreadyRanked for that episode', async () => {
    const { extraIds } = seedComparativePool(1);
    const subject = extraIds[0]; // 'X1'

    // ranked = [A, B, C, D]; binary search starts at mid index 1 -> B.
    const step = await getNextRankingStep(SHOW_ID);
    expect(step).toEqual({ type: 'compare', subject, reference: 'B' });

    // X1 worse than B -> lo=2, hi=3, mid=2 -> next pivot C.
    let targetedStep = await submitComparisonAnswer(SHOW_ID, subject, 'B', 'worse');
    expect(targetedStep).toEqual({ type: 'compare', subject, reference: 'C' });

    // X1 better than C -> hi=1, lo(2) > hi(1) -> placement completes, inserted at index 2:
    // [A, B, X1, C, D]. Nothing left to ask about X1 specifically.
    targetedStep = await submitComparisonAnswer(SHOW_ID, subject, 'C', 'better');
    expect(targetedStep).toEqual({ type: 'alreadyRanked' });

    const positions = new Map(fake.rankings.map((r) => [r.episode_id, r.rank_position]));
    expect(positions.get('A')).toBe(1);
    expect(positions.get('B')).toBe(2);
    expect(positions.get(subject)).toBe(3);
    expect(positions.get('C')).toBe(4);
    expect(positions.get('D')).toBe(5);
    // Cold-start columns are cleared for anything now in the comparative ranked list.
    expect(fake.rankings.find((r) => r.episode_id === subject)?.cold_start_bucket).toBeNull();
  });

  it('rejects a comparison submission for the wrong pending pair without writing anything', async () => {
    const { extraIds } = seedComparativePool(1);
    const subject = extraIds[0];

    await expect(submitComparisonAnswer(SHOW_ID, subject, 'D', 'better')).rejects.toThrow(
      /Unexpected comparison submission/
    );
    expect(fake.comparisons).toHaveLength(0);
  });
});

describe('comparative placement — tie-break via a common reference episode', () => {
  it('asks a follow-up question against the closest decisive-relationship partner when a comparison ties', async () => {
    seedComparativePool(1); // ranked = [A, B, C, D], one unranked episode "X1"
    const e = 'X1';

    // Give B a decisive prior relationship with D (B better than D) — this is what
    // findCommonReference's first tier should surface once B ties with the new subject.
    fake.comparisons.push({
      id: 'seed-1',
      user_id: 'user-1',
      episode_a_id: 'B',
      episode_b_id: 'D',
      result: 'a_better',
    });

    // Binary search starts at mid index 1 -> B.
    const step = await getNextRankingStep(SHOW_ID);
    expect(step).toEqual({ type: 'compare', subject: e, reference: 'B' });

    // Tie against B -> tie-break should ask about D (B's closest decisive partner), not just
    // re-ask about B or fall back to plain rank proximity (which would pick A or C instead).
    let targetedStep = await submitComparisonAnswer(SHOW_ID, e, 'B', 'neutral');
    expect(targetedStep).toEqual({ type: 'compare', subject: e, reference: 'D' });

    // E better than D resolves the tie in E's favor, standing in for the neutral B comparison —
    // narrows hi to 0, so the search continues against A next rather than completing outright.
    targetedStep = await submitComparisonAnswer(SHOW_ID, e, 'D', 'better');
    expect(targetedStep).toEqual({ type: 'compare', subject: e, reference: 'A' });
    // Nothing should be persisted to rank_position yet — the placement isn't finished.
    expect(fake.rankings.find((r) => r.episode_id === e)).toBeUndefined();

    // E worse than A completes the placement: inserted right after A -> [A, E, B, C, D].
    targetedStep = await submitComparisonAnswer(SHOW_ID, e, 'A', 'worse');
    expect(targetedStep).toEqual({ type: 'alreadyRanked' });

    const positions = new Map(fake.rankings.map((r) => [r.episode_id, r.rank_position]));
    expect(positions.get('A')).toBe(1);
    expect(positions.get(e)).toBe(2);
    expect(positions.get('B')).toBe(3);
    expect(positions.get('C')).toBe(4);
    expect(positions.get('D')).toBe(5);
  });
});

describe('getNextStepForEpisode', () => {
  it('returns a coldStart step for an unranked episode while the show is still in cold start', async () => {
    const ids = seedEpisodes(COLD_START_THRESHOLD + 1);

    await expect(getNextStepForEpisode(SHOW_ID, ids[2])).resolves.toEqual({
      type: 'coldStart',
      episode: ids[2],
    });
  });

  it('returns a compare step for an unranked episode once the show is past cold start', async () => {
    const { extraIds } = seedComparativePool(1);
    const subject = extraIds[0];

    await expect(getNextStepForEpisode(SHOW_ID, subject)).resolves.toEqual({
      type: 'compare',
      subject,
      reference: 'B',
    });
  });

  it('returns alreadyRanked for an episode that already has a rank_position', async () => {
    const { rankedIds } = seedComparativePool(1);

    await expect(getNextStepForEpisode(SHOW_ID, rankedIds[0])).resolves.toEqual({
      type: 'alreadyRanked',
    });
  });

  it('returns alreadyRanked for an episode that already has a cold-start entry', async () => {
    const ids = seedEpisodes(COLD_START_THRESHOLD + 2);
    await submitColdStartAnswer(SHOW_ID, ids[0], 'liked');

    await expect(getNextStepForEpisode(SHOW_ID, ids[0])).resolves.toEqual({ type: 'alreadyRanked' });
  });

  it('throws for an episode that does not belong to the show', async () => {
    seedEpisodes(3);

    await expect(getNextStepForEpisode(SHOW_ID, 'not-an-episode')).rejects.toThrow();
  });
});

describe('ranking episodes out of season/episode order', () => {
  it('lets the user cold-start and comparatively place episodes in whatever order they pick, not forced season/episode order', async () => {
    const ids = seedEpisodes(5);
    const [ep1, ep2, ep3, ep4, ep5] = ids;

    // Deliberately scrambled order: ep4 first, then ep1, ep2, ep3 — none of the first three
    // submissions is "next" in season/episode order (that would have been ep1 first). The old
    // "must equal nextUnrankedEpisode" validation would have rejected all of these except the
    // very first coincidental match; the whole point of this rework is that they succeed.
    await expect(submitColdStartAnswer(SHOW_ID, ep4, 'liked')).resolves.toEqual({
      type: 'alreadyRanked',
    });
    await expect(submitColdStartAnswer(SHOW_ID, ep1, 'liked')).resolves.toEqual({
      type: 'alreadyRanked',
    });
    await expect(submitColdStartAnswer(SHOW_ID, ep2, 'liked')).resolves.toEqual({
      type: 'alreadyRanked',
    });

    // ep3 and ep5 are still unranked; ask specifically about ep3 via the targeted lookup.
    await expect(getNextStepForEpisode(SHOW_ID, ep3)).resolves.toEqual({
      type: 'coldStart',
      episode: ep3,
    });

    // Crossing COLD_START_THRESHOLD (4 total) on this submission folds cold start into
    // comparative ranking the next time some episode needs placing. Seed order via
    // orderColdStartIds: all 'liked', so most-recently-judged first -> [ep3, ep2, ep1, ep4].
    await expect(submitColdStartAnswer(SHOW_ID, ep3, 'liked')).resolves.toEqual({
      type: 'alreadyRanked',
    });

    // ep5 is the only unranked episode left; place it entirely via targeted per-episode steps
    // (as the per-episode rank page will), proving that flow works end to end.
    let step = await getNextStepForEpisode(SHOW_ID, ep5);
    // ranked seed = [ep3, ep2, ep1, ep4]; binary search starts at mid index 1 -> ep2.
    expect(step).toEqual({ type: 'compare', subject: ep5, reference: ep2 });

    // ep5 worse than ep2 -> lo=2, hi=3, mid=2 -> next pivot ep1.
    step = await submitComparisonAnswer(SHOW_ID, ep5, ep2, 'worse');
    expect(step).toEqual({ type: 'compare', subject: ep5, reference: ep1 });

    // ep5 better than ep1 -> hi=1, lo(2) > hi(1) -> placement completes, inserted at index 2:
    // [ep3, ep2, ep5, ep1, ep4].
    step = await submitComparisonAnswer(SHOW_ID, ep5, ep1, 'better');
    expect(step).toEqual({ type: 'alreadyRanked' });

    const positions = new Map(fake.rankings.map((r) => [r.episode_id, r.rank_position]));
    expect(positions.get(ep3)).toBe(1);
    expect(positions.get(ep2)).toBe(2);
    expect(positions.get(ep5)).toBe(3);
    expect(positions.get(ep1)).toBe(4);
    expect(positions.get(ep4)).toBe(5);
  });
});

describe('getShowRankingDisplay', () => {
  it('reports a mix of comparatively-ranked and unranked episodes while placement is still in progress', async () => {
    seedComparativePool(1); // ranked A-D at positions 1-4, X1 unranked

    const display = await getShowRankingDisplay(SHOW_ID);
    expect(display.done).toBe(false);
    if (display.done) return;

    expect(display.ranked).toEqual([
      { episodeId: 'A', score: scoreForPosition(1, 4), rank: 1, createdAt: '2026-01-01T00:00:00.000Z' },
      { episodeId: 'B', score: scoreForPosition(2, 4), rank: 2, createdAt: '2026-01-02T00:00:00.000Z' },
      { episodeId: 'C', score: scoreForPosition(3, 4), rank: 3, createdAt: '2026-01-03T00:00:00.000Z' },
      { episodeId: 'D', score: scoreForPosition(4, 4), rank: 4, createdAt: '2026-01-04T00:00:00.000Z' },
    ]);
    expect(display.coldStartPending).toEqual([]);
    expect(display.unranked).toEqual(['X1']);
  });

  it('reports a mix of cold-start-judged and unranked episodes while still in cold start', async () => {
    const ids = seedEpisodes(COLD_START_THRESHOLD + 2);
    await submitColdStartAnswer(SHOW_ID, ids[0], 'liked');
    await submitColdStartAnswer(SHOW_ID, ids[1], 'disliked');

    const display = await getShowRankingDisplay(SHOW_ID);
    expect(display.done).toBe(false);
    if (display.done) return;

    expect(display.ranked).toEqual([]);
    expect(display.coldStartPending).toEqual(
      expect.arrayContaining([
        { episodeId: ids[0], bucket: 'liked', createdAt: expect.any(String) },
        { episodeId: ids[1], bucket: 'disliked', createdAt: expect.any(String) },
      ])
    );
    expect(display.coldStartPending).toHaveLength(2);
    expect(display.unranked).toEqual(ids.slice(2));
  });

  it('reports done: true with a full best-to-worst order for a show too small to ever leave cold start, folding cold-start into comparative placement after episode 1', async () => {
    // Fewer than COLD_START_THRESHOLD episodes total: per Docs/DevelopmentPlan.md's "Decided
    // 2026-07-17, not yet built: small shows skip cold-start bucketing after episode 1", only the
    // first episode gets a coarse bucket judgment — episodes 2 and 3 go straight to real pairwise
    // comparative placement instead of a second/third cold-start bucket.
    const ids = seedEpisodes(3);

    const firstStep = await submitColdStartAnswer(SHOW_ID, ids[0], 'disliked');
    expect(firstStep).toEqual({ type: 'alreadyRanked' });

    // Episode 1 alone already meets the effective threshold (1) for a 3-episode show, so episode
    // 2 is asked a real comparison question against episode 1 rather than a second cold-start
    // bucket — submitColdStartAnswer would now throw for it.
    await expect(getNextStepForEpisode(SHOW_ID, ids[1])).resolves.toEqual({
      type: 'compare',
      subject: ids[1],
      reference: ids[0],
    });
    let step = await submitComparisonAnswer(SHOW_ID, ids[1], ids[0], 'better');
    expect(step).toEqual({ type: 'alreadyRanked' });
    // ranked = [ids[1], ids[0]]

    // Episode 3 is also placed comparatively: binary search over [ids[1], ids[0]] starts at
    // ids[1] (mid index 0).
    await expect(getNextStepForEpisode(SHOW_ID, ids[2])).resolves.toEqual({
      type: 'compare',
      subject: ids[2],
      reference: ids[1],
    });
    step = await submitComparisonAnswer(SHOW_ID, ids[2], ids[1], 'worse');
    expect(step).toEqual({ type: 'compare', subject: ids[2], reference: ids[0] });
    step = await submitComparisonAnswer(SHOW_ID, ids[2], ids[0], 'better');
    expect(step).toEqual({ type: 'alreadyRanked' });
    // ranked = [ids[1], ids[2], ids[0]]

    // Reconstructed history mirrors exactly what reconstructShowRankingState builds from the three
    // submitted comparisons above (both sides recorded, inverted per episode's own perspective) —
    // used to compute the expected confidence via the same pure showConfidence function under test,
    // rather than hand-deriving/hardcoding a float.
    const expectedHistory = new Map<string, { with: string; result: 'better' | 'worse' | 'neutral' }[]>([
      [ids[1], [{ with: ids[0], result: 'better' }, { with: ids[2], result: 'better' }]],
      [ids[0], [{ with: ids[1], result: 'worse' }, { with: ids[2], result: 'worse' }]],
      [ids[2], [{ with: ids[1], result: 'worse' }, { with: ids[0], result: 'better' }]],
    ]);
    const expectedConfidence = showConfidence([ids[1], ids[2], ids[0]], expectedHistory, 3);

    await expect(getShowRankingDisplay(SHOW_ID)).resolves.toEqual({
      done: true,
      ranked: [
        { episodeId: ids[1], score: scoreForPosition(1, 3), rank: 1, createdAt: expect.any(String) },
        { episodeId: ids[2], score: scoreForPosition(2, 3), rank: 2, createdAt: expect.any(String) },
        { episodeId: ids[0], score: scoreForPosition(3, 3), rank: 3, createdAt: expect.any(String) },
      ],
      confidence: expectedConfidence,
    });
  });

  it('reports done: true with the full comparative order once every episode is placed', async () => {
    const { extraIds } = seedComparativePool(1);
    const subject = extraIds[0];

    await submitComparisonAnswer(SHOW_ID, subject, 'B', 'worse');
    await submitComparisonAnswer(SHOW_ID, subject, 'C', 'better');

    // Reconstructed history mirrors exactly what reconstructShowRankingState builds from the two
    // submitted comparisons above (A and D were never compared, so they have no history at all).
    const expectedHistory = new Map<string, { with: string; result: 'better' | 'worse' | 'neutral' }[]>([
      [subject, [{ with: 'B', result: 'worse' }, { with: 'C', result: 'better' }]],
      ['B', [{ with: subject, result: 'better' }]],
      ['C', [{ with: subject, result: 'worse' }]],
    ]);
    const expectedConfidence = showConfidence(['A', 'B', subject, 'C', 'D'], expectedHistory, 5);

    await expect(getShowRankingDisplay(SHOW_ID)).resolves.toEqual({
      done: true,
      ranked: [
        { episodeId: 'A', score: scoreForPosition(1, 5), rank: 1, createdAt: '2026-01-01T00:00:00.000Z' },
        { episodeId: 'B', score: scoreForPosition(2, 5), rank: 2, createdAt: '2026-01-02T00:00:00.000Z' },
        { episodeId: subject, score: scoreForPosition(3, 5), rank: 3, createdAt: expect.any(String) },
        { episodeId: 'C', score: scoreForPosition(4, 5), rank: 4, createdAt: '2026-01-03T00:00:00.000Z' },
        { episodeId: 'D', score: scoreForPosition(5, 5), rank: 5, createdAt: '2026-01-04T00:00:00.000Z' },
      ],
      confidence: expectedConfidence,
    });
  });

  it('threads each episode\'s 1-based rank and its own episode_rankings.created_at through for a done: true show', async () => {
    // Fully seeded (extraUnranked: 0) so every episode's created_at comes straight from
    // seedComparativePool's fixed per-episode dates, not a dynamically-assigned one from the
    // fake's insert-time counter — makes this test about `rank`/`createdAt` specifically, not
    // about re-deriving whatever the fake happened to assign.
    seedComparativePool(0); // A, B, C, D ranked at positions 1-4, nothing left unranked

    const display = await getShowRankingDisplay(SHOW_ID);
    expect(display.done).toBe(true);
    if (!display.done) return;

    expect(display.ranked).toEqual([
      { episodeId: 'A', score: scoreForPosition(1, 4), rank: 1, createdAt: '2026-01-01T00:00:00.000Z' },
      { episodeId: 'B', score: scoreForPosition(2, 4), rank: 2, createdAt: '2026-01-02T00:00:00.000Z' },
      { episodeId: 'C', score: scoreForPosition(3, 4), rank: 3, createdAt: '2026-01-03T00:00:00.000Z' },
      { episodeId: 'D', score: scoreForPosition(4, 4), rank: 4, createdAt: '2026-01-04T00:00:00.000Z' },
    ]);
  });

  it('reports null confidence while nothing has gone through comparative placement yet', async () => {
    const ids = seedEpisodes(COLD_START_THRESHOLD + 2);
    await submitColdStartAnswer(SHOW_ID, ids[0], 'liked');

    const display = await getShowRankingDisplay(SHOW_ID);
    expect(display.done).toBe(false);
    if (display.done) return;
    expect(display.confidence).toBeNull();
  });

  it('keeps confidence low (0) when every recorded comparison is neutral — no decisive information', async () => {
    seedComparativePool(0); // A, B, C, D already ranked, nothing left unranked
    fake.comparisons.push(
      { id: 'n1', user_id: 'user-1', episode_a_id: 'A', episode_b_id: 'B', result: 'neutral' },
      { id: 'n2', user_id: 'user-1', episode_a_id: 'B', episode_b_id: 'C', result: 'neutral' },
      { id: 'n3', user_id: 'user-1', episode_a_id: 'C', episode_b_id: 'D', result: 'neutral' }
    );

    const display = await getShowRankingDisplay(SHOW_ID);
    expect(display.done).toBe(true);
    if (!display.done) return;
    expect(display.confidence).toBe(0);
  });

  it('rises toward 100 as decisive comparisons accumulate, capped there rather than exceeding it', async () => {
    seedComparativePool(0); // A, B, C, D ranked; log2(4) = 2
    fake.comparisons.push(
      { id: 'd1', user_id: 'user-1', episode_a_id: 'A', episode_b_id: 'B', result: 'a_better' },
      { id: 'd2', user_id: 'user-1', episode_a_id: 'A', episode_b_id: 'C', result: 'a_better' },
      { id: 'd3', user_id: 'user-1', episode_a_id: 'B', episode_b_id: 'C', result: 'a_better' },
      { id: 'd4', user_id: 'user-1', episode_a_id: 'B', episode_b_id: 'D', result: 'a_better' },
      { id: 'd5', user_id: 'user-1', episode_a_id: 'C', episode_b_id: 'D', result: 'a_better' },
      { id: 'd6', user_id: 'user-1', episode_a_id: 'D', episode_b_id: 'A', result: 'b_better' }
    );

    // Every episode now has >= 2 decisive comparisons, meeting log2(4)=2 — each episodeConfidence
    // is capped at 100, so the show average is exactly 100, not something that overshoots it.
    const display = await getShowRankingDisplay(SHOW_ID);
    expect(display.done).toBe(true);
    if (!display.done) return;
    expect(display.confidence).toBe(100);
  });
});

describe('getEpisodeComparisonRecord', () => {
  it('returns all zeros for an episode with no recorded comparisons at all', async () => {
    seedComparativePool(1); // A-D ranked, X1 unranked, no comparisons seeded

    await expect(getEpisodeComparisonRecord('A')).resolves.toEqual({ wins: 0, losses: 0, ties: 0 });
  });

  it('tallies wins/losses/ties across comparisons where the episode is on either side', async () => {
    seedComparativePool(1); // ranked A-D, X1 unranked

    fake.comparisons.push(
      // B on the 'a' side: a_better -> win, b_better -> loss, neutral -> tie.
      { id: 'c1', user_id: 'user-1', episode_a_id: 'B', episode_b_id: 'A', result: 'a_better' },
      { id: 'c2', user_id: 'user-1', episode_a_id: 'B', episode_b_id: 'C', result: 'b_better' },
      { id: 'c3', user_id: 'user-1', episode_a_id: 'B', episode_b_id: 'D', result: 'neutral' },
      // B on the 'b' side: b_better -> win, a_better -> loss, neutral -> tie.
      { id: 'c4', user_id: 'user-1', episode_a_id: 'A', episode_b_id: 'B', result: 'b_better' },
      { id: 'c5', user_id: 'user-1', episode_a_id: 'C', episode_b_id: 'B', result: 'a_better' },
      { id: 'c6', user_id: 'user-1', episode_a_id: 'D', episode_b_id: 'B', result: 'neutral' }
    );

    await expect(getEpisodeComparisonRecord('B')).resolves.toEqual({ wins: 2, losses: 2, ties: 2 });
  });

  it('only counts the signed-in user\'s own comparisons, never another user\'s rows for the same episode', async () => {
    seedComparativePool(1);
    fake.comparisons.push({
      id: 'other-user',
      user_id: 'user-2',
      episode_a_id: 'A',
      episode_b_id: 'B',
      result: 'a_better',
    });

    await expect(getEpisodeComparisonRecord('A')).resolves.toEqual({ wins: 0, losses: 0, ties: 0 });
  });
});

describe('deleteShowRankingData', () => {
  it('deletes every ranking and comparison row (both sides) for the show\'s episodes, leaving other shows untouched', async () => {
    seedComparativePool(1); // ranked A-D at positions 1-4, X1 unranked, all show-1
    fake.comparisons.push({
      id: 'seed-1',
      user_id: 'user-1',
      episode_a_id: 'A',
      episode_b_id: 'B',
      result: 'a_better',
    });

    // A different show's data must survive: same fake, a distinct show_id and episode id.
    fake.episodes.push({ id: 'other-ep', show_id: 'show-2', season_number: 1, episode_number: 1 });
    fake.rankings.push({
      user_id: 'user-1',
      episode_id: 'other-ep',
      rank_position: 1,
      cold_start_bucket: null,
      cold_start_sequence: null,
      created_at: SEED_CREATED_AT,
    });

    await deleteShowRankingData(SHOW_ID);

    expect(fake.rankings.filter((r) => r.user_id === 'user-1')).toEqual([
      {
        user_id: 'user-1',
        episode_id: 'other-ep',
        rank_position: 1,
        cold_start_bucket: null,
        cold_start_sequence: null,
        created_at: SEED_CREATED_AT,
      },
    ]);
    expect(fake.comparisons).toHaveLength(0);
  });

  it('is a no-op for a show with no episodes, rather than throwing', async () => {
    seedComparativePool(1);
    const rankingsBefore = [...fake.rankings];
    const comparisonsBefore = [...fake.comparisons];

    await expect(deleteShowRankingData('show-with-no-episodes')).resolves.toBeUndefined();

    expect(fake.rankings).toEqual(rankingsBefore);
    expect(fake.comparisons).toEqual(comparisonsBefore);
  });

  it('only deletes the signed-in user\'s rows, never another user\'s ranking data for the same show', async () => {
    seedComparativePool(1); // seeds user-1's rankings for A-D
    fake.rankings.push(
      {
        user_id: 'user-2',
        episode_id: 'A',
        rank_position: 1,
        cold_start_bucket: null,
        cold_start_sequence: null,
        created_at: SEED_CREATED_AT,
      },
      {
        user_id: 'user-2',
        episode_id: 'B',
        rank_position: 2,
        cold_start_bucket: null,
        cold_start_sequence: null,
        created_at: SEED_CREATED_AT,
      }
    );
    fake.comparisons.push({
      id: 'seed-u2',
      user_id: 'user-2',
      episode_a_id: 'A',
      episode_b_id: 'B',
      result: 'a_better',
    });

    await deleteShowRankingData(SHOW_ID);

    expect(fake.rankings.filter((r) => r.user_id === 'user-1')).toHaveLength(0);
    expect(fake.rankings.filter((r) => r.user_id === 'user-2')).toHaveLength(2);
    expect(fake.comparisons.filter((c) => c.user_id === 'user-2')).toHaveLength(1);
  });
});

describe('resetEpisodeRanking', () => {
  /** Seeds 5 already-ranked episodes (A-E, positions 1-5) — enough that removing one still leaves the show at COLD_START_THRESHOLD, i.e. still in comparative mode, not reverted to cold start. */
  function seedFiveRanked() {
    const ids = ['A', 'B', 'C', 'D', 'E'];
    fake.episodes = ids.map((id, i) => ({
      id,
      show_id: SHOW_ID,
      season_number: 1,
      episode_number: i + 1,
    }));
    fake.rankings = ids.map((id, i) => ({
      user_id: 'user-1',
      episode_id: id,
      rank_position: i + 1,
      cold_start_bucket: null,
      cold_start_sequence: null,
      created_at: SEED_CREATED_AT,
    }));
    return ids;
  }

  it('clears the episode\'s rank_position, deletes every comparison touching it, and renormalizes the remaining positions', async () => {
    seedFiveRanked();
    // A comparison recorded against C from its original placement (decisive: C better than D) —
    // the whole point of this test is that this does NOT survive the reset.
    fake.comparisons.push({
      id: 'seed-c-d',
      user_id: 'user-1',
      episode_a_id: 'C',
      episode_b_id: 'D',
      result: 'a_better',
    });
    // An unrelated comparison, not touching C, which must survive.
    fake.comparisons.push({
      id: 'seed-a-d',
      user_id: 'user-1',
      episode_a_id: 'A',
      episode_b_id: 'D',
      result: 'a_better',
    });

    await resetEpisodeRanking(SHOW_ID, 'C');

    expect(fake.rankings.find((r) => r.episode_id === 'C')).toBeUndefined();
    const positions = new Map(fake.rankings.map((r) => [r.episode_id, r.rank_position]));
    expect(positions.get('A')).toBe(1);
    expect(positions.get('B')).toBe(2);
    expect(positions.get('D')).toBe(3);
    expect(positions.get('E')).toBe(4);

    // C's old comparison is gone; the unrelated one is untouched.
    expect(fake.comparisons.find((c) => c.episode_a_id === 'C' || c.episode_b_id === 'C')).toBeUndefined();
    expect(fake.comparisons.find((c) => c.id === 'seed-a-d')).toBeDefined();

    // The whole point: the system asks a *fresh* question for C rather than instantly replaying
    // its old (now-deleted) placement history. If the stale C-vs-D comparison had survived, replay
    // could answer straight through to 'alreadyRanked' without ever asking again. Instead, with
    // ranked = [A, B, D, E] (4 episodes), binary search starts at mid index 1 -> B, a genuinely new
    // question C was never asked before (its old history only ever covered C vs D).
    await expect(getNextStepForEpisode(SHOW_ID, 'C')).resolves.toEqual({
      type: 'compare',
      subject: 'C',
      reference: 'B',
    });
  });

  it('reverts the show to cold start for what gets placed next if the reset drops the total below COLD_START_THRESHOLD (documented, accepted consequence)', async () => {
    seedComparativePool(1); // ranked A-D (4 total, exactly at threshold), X1 unranked

    await resetEpisodeRanking(SHOW_ID, 'B');

    // Total ranked-episode count just dropped to 3, below COLD_START_THRESHOLD (4) — isColdStart
    // is purely derived from the live count, so the show is back in cold start for whatever gets
    // placed next, B included.
    await expect(getNextStepForEpisode(SHOW_ID, 'B')).resolves.toEqual({
      type: 'coldStart',
      episode: 'B',
    });
  });

  it('throws for an episode that does not belong to the show, without deleting anything', async () => {
    seedComparativePool(1);
    const rankingsBefore = [...fake.rankings];

    await expect(resetEpisodeRanking(SHOW_ID, 'not-an-episode')).rejects.toThrow(/does not belong to show/);
    expect(fake.rankings).toEqual(rankingsBefore);
  });

  it('throws for an episode with no ranking data to reset, without deleting anything', async () => {
    const { extraIds } = seedComparativePool(1); // X1 is unranked
    const subject = extraIds[0];
    const rankingsBefore = [...fake.rankings];

    await expect(resetEpisodeRanking(SHOW_ID, subject)).rejects.toThrow(/has no ranking to reset/);
    expect(fake.rankings).toEqual(rankingsBefore);
  });

  it('only resets the signed-in user\'s own ranking/comparison rows, never another user\'s data for the same episode', async () => {
    seedFiveRanked();
    fake.rankings.push({
      user_id: 'user-2',
      episode_id: 'C',
      rank_position: 3,
      cold_start_bucket: null,
      cold_start_sequence: null,
      created_at: SEED_CREATED_AT,
    });
    fake.comparisons.push({
      id: 'seed-u2-c-d',
      user_id: 'user-2',
      episode_a_id: 'C',
      episode_b_id: 'D',
      result: 'a_better',
    });

    await resetEpisodeRanking(SHOW_ID, 'C');

    expect(fake.rankings.find((r) => r.user_id === 'user-2' && r.episode_id === 'C')).toBeDefined();
    expect(
      fake.comparisons.find((c) => c.user_id === 'user-2' && (c.episode_a_id === 'C' || c.episode_b_id === 'C'))
    ).toBeDefined();
  });
});

describe('per-user isolation', () => {
  it('scopes ranking state by the signed-in user, never seeing another user\'s progress', async () => {
    const ids = seedEpisodes(COLD_START_THRESHOLD + 1);

    fake.currentUserId = 'user-1';
    await submitColdStartAnswer(SHOW_ID, ids[0], 'liked');
    await submitColdStartAnswer(SHOW_ID, ids[1], 'liked');

    // A second user looking at the very same show should still be right at the start — user-1's
    // progress must not leak across the user_id boundary.
    fake.currentUserId = 'user-2';
    const step = await getNextRankingStep(SHOW_ID);
    expect(step).toEqual({ type: 'coldStart', episode: ids[0] });

    expect(fake.rankings.filter((r) => r.user_id === 'user-1')).toHaveLength(2);
    expect(fake.rankings.filter((r) => r.user_id === 'user-2')).toHaveLength(0);
  });
});
