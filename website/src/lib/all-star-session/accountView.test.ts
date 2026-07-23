import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A small in-memory fake covering exactly the calls `accountView.ts` makes: `all_star_rankings`
 * (`.eq('user_id', ...).order('rank_position', ...)`), `episodes` and `shows` (both `.in('id', ...)`
 * lookups, bounded by the small set of ids the stored pool actually references). Same "thenable
 * builder" style as `./session.test.ts` and `@/lib/ranking-session/accountView.test.ts`.
 */
interface FakeAllStarRankingRow {
  user_id: string;
  show_id: string;
  episode_id: string;
  rank_position: number;
}

interface FakeEpisodeRow {
  id: string;
  title: string;
  season_number: number;
  episode_number: number;
}

interface FakeShowRow {
  id: string;
  title: string;
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
    // Deliberately does NOT actually sort -- the fake mirrors this app's own documented caution
    // (Docs/STATUS.md's all-star ordering-bug fix) that `.order()` can't be trusted alone; the real
    // guarantee under test comes from `accountView.ts`'s own explicit application-code sort.
    order: () => builder,
    then: (onFulfilled, onRejected) => {
      const data = rows.filter((row) => filters.every((f) => f(row)));
      return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

class FakeSupabase {
  allStarRankings: FakeAllStarRankingRow[] = [];
  episodes: FakeEpisodeRow[] = [];
  shows: FakeShowRow[] = [];

  from(table: string) {
    if (table === 'all_star_rankings') return makeReadBuilder(this.allStarRankings);
    if (table === 'episodes') return makeReadBuilder(this.episodes);
    if (table === 'shows') return makeReadBuilder(this.shows);
    throw new Error(`Unexpected table in test: ${table}`);
  }
}

const fakeSupabase = new FakeSupabase();

vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: vi.fn(async () => fakeSupabase),
}));

import { getAccountTopEpisodes } from './accountView';

describe('getAccountTopEpisodes', () => {
  beforeEach(() => {
    fakeSupabase.allStarRankings = [];
    fakeSupabase.episodes = [];
    fakeSupabase.shows = [];
  });

  it('returns [] when the target user has no stored pool (or none survive RLS)', async () => {
    expect(await getAccountTopEpisodes('them')).toEqual([]);
  });

  it('returns the stored pool ordered best-to-worst with derived scores, joined to episode/show display data', async () => {
    fakeSupabase.allStarRankings = [
      { user_id: 'them', show_id: 'show-1', episode_id: 'ep-1', rank_position: 1 },
      { user_id: 'them', show_id: 'show-2', episode_id: 'ep-2', rank_position: 2 },
      { user_id: 'them', show_id: 'show-3', episode_id: 'ep-3', rank_position: 3 },
    ];
    fakeSupabase.episodes = [
      { id: 'ep-1', title: 'Ozymandias', season_number: 5, episode_number: 14 },
      { id: 'ep-2', title: 'Pine Barrens', season_number: 3, episode_number: 11 },
      { id: 'ep-3', title: 'International Assassin', season_number: 3, episode_number: 8 },
    ];
    fakeSupabase.shows = [
      { id: 'show-1', title: 'Breaking Bad' },
      { id: 'show-2', title: 'The Sopranos' },
      { id: 'show-3', title: 'The Leftovers' },
    ];

    const result = await getAccountTopEpisodes('them');

    expect(result).toEqual([
      {
        episodeId: 'ep-1',
        showId: 'show-1',
        showTitle: 'Breaking Bad',
        episodeTitle: 'Ozymandias',
        seasonNumber: 5,
        episodeNumber: 14,
        rank: 1,
        score: 10,
      },
      {
        episodeId: 'ep-2',
        showId: 'show-2',
        showTitle: 'The Sopranos',
        episodeTitle: 'Pine Barrens',
        seasonNumber: 3,
        episodeNumber: 11,
        rank: 2,
        score: expect.any(Number),
      },
      {
        episodeId: 'ep-3',
        showId: 'show-3',
        showTitle: 'The Leftovers',
        episodeTitle: 'International Assassin',
        seasonNumber: 3,
        episodeNumber: 8,
        rank: 3,
        score: expect.any(Number),
      },
    ]);
    // Best-to-worst: score strictly decreases with rank.
    expect(result[0].score).toBeGreaterThan(result[1].score);
    expect(result[1].score).toBeGreaterThan(result[2].score);
  });

  it('sorts by rank_position in application code even when the query result arrives out of order', async () => {
    fakeSupabase.allStarRankings = [
      { user_id: 'them', show_id: 'show-2', episode_id: 'ep-2', rank_position: 2 },
      { user_id: 'them', show_id: 'show-1', episode_id: 'ep-1', rank_position: 1 },
    ];
    fakeSupabase.episodes = [
      { id: 'ep-1', title: 'First', season_number: 1, episode_number: 1 },
      { id: 'ep-2', title: 'Second', season_number: 1, episode_number: 2 },
    ];
    fakeSupabase.shows = [
      { id: 'show-1', title: 'Show One' },
      { id: 'show-2', title: 'Show Two' },
    ];

    const result = await getAccountTopEpisodes('them');

    expect(result.map((e) => e.episodeId)).toEqual(['ep-1', 'ep-2']);
    expect(result.map((e) => e.rank)).toEqual([1, 2]);
  });

  it('does no reconciliation or placeholder splicing -- an entry with no matching episodes/shows row still renders with fallback labels', async () => {
    fakeSupabase.allStarRankings = [
      { user_id: 'them', show_id: 'show-missing', episode_id: 'ep-missing', rank_position: 1 },
    ];
    // No matching episodes/shows rows -- unlike `getAllStarDisplay`, this module never removes or
    // re-derives a stale/orphaned entry; it just renders the pool exactly as currently stored.

    const result = await getAccountTopEpisodes('them');

    expect(result).toEqual([
      {
        episodeId: 'ep-missing',
        showId: 'show-missing',
        showTitle: 'Unknown show',
        episodeTitle: 'Unknown episode',
        seasonNumber: 0,
        episodeNumber: 0,
        rank: 1,
        score: 10,
      },
    ]);
  });

  it('scopes strictly to the target user_id', async () => {
    fakeSupabase.allStarRankings = [
      { user_id: 'them', show_id: 'show-1', episode_id: 'ep-1', rank_position: 1 },
      { user_id: 'someone-else', show_id: 'show-2', episode_id: 'ep-2', rank_position: 1 },
    ];
    fakeSupabase.episodes = [
      { id: 'ep-1', title: 'Mine', season_number: 1, episode_number: 1 },
      { id: 'ep-2', title: 'Not Mine', season_number: 1, episode_number: 1 },
    ];
    fakeSupabase.shows = [
      { id: 'show-1', title: 'Show One' },
      { id: 'show-2', title: 'Show Two' },
    ];

    const result = await getAccountTopEpisodes('them');

    expect(result).toHaveLength(1);
    expect(result[0].episodeId).toBe('ep-1');
  });
});
