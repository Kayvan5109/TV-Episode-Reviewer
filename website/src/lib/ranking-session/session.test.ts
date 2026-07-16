import { beforeEach, describe, expect, it, vi } from 'vitest';

import { COLD_START_THRESHOLD } from '@/lib/ranking/constants';

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
}

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

class FakeSupabase {
  episodes: FakeEpisodeRow[] = [];
  rankings: FakeRankingRow[] = [];
  comparisons: FakeComparisonRow[] = [];
  currentUserId: string | null = 'user-1';
  private comparisonIdCounter = 0;

  auth = {
    getUser: async () => ({
      data: { user: this.currentUserId ? { id: this.currentUserId } : null },
    }),
  };

  from(table: string) {
    if (table === 'episodes') {
      return makeReadBuilder(this.episodes);
    }
    if (table === 'episode_rankings') {
      const builder = makeReadBuilder(this.rankings);
      return {
        ...builder,
        insert: (row: FakeRankingRow) => {
          this.rankings.push({ ...row });
          return Promise.resolve({ data: null, error: null });
        },
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature-compatible with the real `.upsert(rows, options)`; the fake ignores `onConflict` since it always matches on (user_id, episode_id).
        upsert: (rows: FakeRankingRow[], _opts?: { onConflict: string }) => {
          for (const row of rows) {
            const idx = this.rankings.findIndex(
              (r) => r.user_id === row.user_id && r.episode_id === row.episode_id
            );
            if (idx >= 0) {
              this.rankings[idx] = { ...this.rankings[idx], ...row };
            } else {
              this.rankings.push({ ...row });
            }
          }
          return Promise.resolve({ data: null, error: null });
        },
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
      };
    }
    throw new Error(`Unexpected table in test: ${table}`);
  }
}

let fake: FakeSupabase;

vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: async () => fake,
}));

const { getNextRankingStep, submitColdStartAnswer, submitComparisonAnswer } = await import(
  './session'
);

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

    let step = await getNextRankingStep(SHOW_ID);
    for (let i = 0; i < COLD_START_THRESHOLD; i++) {
      expect(step).toEqual({ type: 'coldStart', episode: ids[i] });
      step = await submitColdStartAnswer(SHOW_ID, ids[i], buckets[i % buckets.length]);
    }

    // The threshold just crossed on the last submission above: cold-start entries fold into
    // comparative ranking immediately, and since there's one more unranked episode, the very next
    // step should already be a real comparison question, not "done" or another cold-start prompt.
    expect(step.type).toBe('compare');
    if (step.type === 'compare') {
      expect(step.subject).toBe(ids[COLD_START_THRESHOLD]);
      // Cold-start seed order is liked (most-recent-first) > neutral > disliked (see
      // @/lib/ranking/coldStart.ts) — with buckets [liked, neutral, disliked, liked] assigned to
      // ep1..ep4, the seeded ranked order is [ep4, ep1, ep2, ep3], and binary search starts at the
      // midpoint (index 1) of that 4-long list.
      expect(step.reference).toBe(ids[0]);
    }
  });

  it('rejects a cold-start submission for the wrong (non-next) episode without writing anything', async () => {
    const ids = seedEpisodes(COLD_START_THRESHOLD + 2);

    await expect(submitColdStartAnswer(SHOW_ID, ids[1], 'liked')).rejects.toThrow(
      /Unexpected cold-start submission/
    );
    expect(fake.rankings).toHaveLength(0);
  });
});

describe('fully ranked show — nothing left to do', () => {
  it('reports done once every episode already has a ranking row, even a show too small to ever leave cold start', async () => {
    const ids = seedEpisodes(3); // fewer than COLD_START_THRESHOLD; can never cross into comparative mode
    fake.rankings = ids.map((id, i) => ({
      user_id: 'user-1',
      episode_id: id,
      rank_position: null,
      cold_start_bucket: 'neutral',
      cold_start_sequence: i,
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
  }));

  return { rankedIds, extraIds, allIds };
}

describe('comparative placement — resolves without a tie-break', () => {
  it('completes placement across two decisive comparison answers, then advances to the next unranked episode', async () => {
    const { extraIds } = seedComparativePool(1);
    const subject = extraIds[0]; // 'X1'

    // ranked = [A, B, C, D]; binary search starts at mid index 1 -> B.
    let step = await getNextRankingStep(SHOW_ID);
    expect(step).toEqual({ type: 'compare', subject, reference: 'B' });

    // X1 worse than B -> lo=2, hi=3, mid=2 -> next pivot C.
    step = await submitComparisonAnswer(SHOW_ID, subject, 'B', 'worse');
    expect(step).toEqual({ type: 'compare', subject, reference: 'C' });

    // X1 better than C -> hi=1, lo(2) > hi(1) -> placement completes, inserted at index 2:
    // [A, B, X1, C, D]. No more unranked episodes -> done.
    step = await submitComparisonAnswer(SHOW_ID, subject, 'C', 'better');
    expect(step).toEqual({ type: 'done' });

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
    let step = await getNextRankingStep(SHOW_ID);
    expect(step).toEqual({ type: 'compare', subject: e, reference: 'B' });

    // Tie against B -> tie-break should ask about D (B's closest decisive partner), not just
    // re-ask about B or fall back to plain rank proximity (which would pick A or C instead).
    step = await submitComparisonAnswer(SHOW_ID, e, 'B', 'neutral');
    expect(step).toEqual({ type: 'compare', subject: e, reference: 'D' });

    // E better than D resolves the tie in E's favor, standing in for the neutral B comparison —
    // narrows hi to 0, so the search continues against A next rather than completing outright.
    step = await submitComparisonAnswer(SHOW_ID, e, 'D', 'better');
    expect(step).toEqual({ type: 'compare', subject: e, reference: 'A' });
    // Nothing should be persisted to rank_position yet — the placement isn't finished.
    expect(fake.rankings.find((r) => r.episode_id === e)).toBeUndefined();

    // E worse than A completes the placement: inserted right after A -> [A, E, B, C, D].
    step = await submitComparisonAnswer(SHOW_ID, e, 'A', 'worse');
    expect(step).toEqual({ type: 'done' });

    const positions = new Map(fake.rankings.map((r) => [r.episode_id, r.rank_position]));
    expect(positions.get('A')).toBe(1);
    expect(positions.get(e)).toBe(2);
    expect(positions.get('B')).toBe(3);
    expect(positions.get('C')).toBe(4);
    expect(positions.get('D')).toBe(5);
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
