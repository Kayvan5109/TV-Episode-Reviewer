import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A small in-memory fake covering exactly the calls `accountView.ts` makes:
 * `user_shows` (embedded `shows` select), `episodes` (per-show, `.eq('show_id', ...)`), and
 * `episode_rankings` (`.eq('user_id', ...)` only -- see that module's own URL-length-lesson comment
 * for why there's no `.in('episode_id', ...)` to mirror here). Read chains are "thenable" builders
 * that resolve when awaited directly, mirroring real `@supabase/supabase-js` query builder behavior
 * -- same style as `./session.test.ts`'s own `FakeSupabase`.
 */
interface FakeUserShowRow {
  user_id: string;
  show_id: string;
  created_at: string;
}

interface FakeShowRow {
  id: string;
  title: string;
  poster_url: string | null;
}

interface FakeEpisodeRow {
  id: string;
  show_id: string;
  season_number: number;
  episode_number: number;
  title: string;
}

interface FakeRankingRow {
  user_id: string;
  episode_id: string;
  rank_position: number | null;
  cold_start_bucket: string | null;
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

class FakeSupabase {
  userShows: FakeUserShowRow[] = [];
  shows: FakeShowRow[] = [];
  episodes: FakeEpisodeRow[] = [];
  rankings: FakeRankingRow[] = [];

  from(table: string) {
    if (table === 'user_shows') {
      // Embedded `shows(id, title, poster_url)` select -- the fake resolves the join itself rather
      // than modeling PostgREST's embed syntax.
      const joined = this.userShows.map((row) => ({
        show_id: row.show_id,
        user_id: row.user_id,
        created_at: row.created_at,
        shows: this.shows.find((s) => s.id === row.show_id) ?? null,
      }));
      return makeReadBuilder(joined);
    }
    if (table === 'episodes') {
      return makeReadBuilder(this.episodes);
    }
    if (table === 'episode_rankings') {
      return makeReadBuilder(this.rankings);
    }
    throw new Error(`Unexpected table in test: ${table}`);
  }
}

const fakeSupabase = new FakeSupabase();

vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: vi.fn(async () => fakeSupabase),
}));

import { getAccountShows } from './accountView';

describe('getAccountShows', () => {
  beforeEach(() => {
    fakeSupabase.userShows = [];
    fakeSupabase.shows = [];
    fakeSupabase.episodes = [];
    fakeSupabase.rankings = [];
  });

  it('returns [] when the target user has no tracked shows (or none survive RLS)', async () => {
    const result = await getAccountShows('them');
    expect(result).toEqual([]);
  });

  it('computes rankedCount/total/percent from stored episode_rankings rows, no algorithm advancement', async () => {
    fakeSupabase.userShows = [{ user_id: 'them', show_id: 'show-1', created_at: '2026-01-01T00:00:00Z' }];
    fakeSupabase.shows = [{ id: 'show-1', title: 'Breaking Bad', poster_url: 'https://example.com/poster.jpg' }];
    fakeSupabase.episodes = [
      { id: 'ep-1', show_id: 'show-1', season_number: 1, episode_number: 1, title: 'Pilot' },
      { id: 'ep-2', show_id: 'show-1', season_number: 1, episode_number: 2, title: "Cat's in the Bag..." },
      { id: 'ep-3', show_id: 'show-1', season_number: 1, episode_number: 3, title: '...and the Bag\'s in the River' },
      { id: 'ep-4', show_id: 'show-1', season_number: 1, episode_number: 4, title: 'Cancer Man' },
    ];
    fakeSupabase.rankings = [
      { user_id: 'them', episode_id: 'ep-1', rank_position: 1, cold_start_bucket: null },
      { user_id: 'them', episode_id: 'ep-2', rank_position: 2, cold_start_bucket: null },
    ];

    const result = await getAccountShows('them');

    expect(result).toEqual([
      {
        showId: 'show-1',
        title: 'Breaking Bad',
        posterUrl: 'https://example.com/poster.jpg',
        rankedCount: 2,
        total: 4,
        percent: 50,
        topEpisode: { title: 'Pilot', seasonNumber: 1 },
      },
    ]);
  });

  it('counts a cold-start-only row (rank_position null, cold_start_bucket set) as ranked', async () => {
    fakeSupabase.userShows = [{ user_id: 'them', show_id: 'show-1', created_at: '2026-01-01T00:00:00Z' }];
    fakeSupabase.shows = [{ id: 'show-1', title: 'Small Show', poster_url: null }];
    fakeSupabase.episodes = [
      { id: 'ep-1', show_id: 'show-1', season_number: 1, episode_number: 1, title: 'Only Episode' },
    ];
    fakeSupabase.rankings = [
      { user_id: 'them', episode_id: 'ep-1', rank_position: null, cold_start_bucket: 'liked' },
    ];

    const result = await getAccountShows('them');

    expect(result[0].rankedCount).toBe(1);
    expect(result[0].topEpisode).toBeNull(); // cold-start, not yet comparatively placed at #1
  });

  it('reports no top episode when nothing is comparatively ranked yet (percent 0, topEpisode null)', async () => {
    fakeSupabase.userShows = [{ user_id: 'them', show_id: 'show-1', created_at: '2026-01-01T00:00:00Z' }];
    fakeSupabase.shows = [{ id: 'show-1', title: 'Fresh Show', poster_url: null }];
    fakeSupabase.episodes = [
      { id: 'ep-1', show_id: 'show-1', season_number: 1, episode_number: 1, title: 'Pilot' },
    ];

    const result = await getAccountShows('them');

    expect(result).toEqual([
      {
        showId: 'show-1',
        title: 'Fresh Show',
        posterUrl: null,
        rankedCount: 0,
        total: 1,
        percent: 0,
        topEpisode: null,
      },
    ]);
  });

  it('handles a show with zero imported episodes without dividing by zero', async () => {
    fakeSupabase.userShows = [{ user_id: 'them', show_id: 'show-1', created_at: '2026-01-01T00:00:00Z' }];
    fakeSupabase.shows = [{ id: 'show-1', title: 'Not Yet Imported', poster_url: null }];

    const result = await getAccountShows('them');

    expect(result).toEqual([
      {
        showId: 'show-1',
        title: 'Not Yet Imported',
        posterUrl: null,
        rankedCount: 0,
        total: 0,
        percent: 0,
        topEpisode: null,
      },
    ]);
  });

  it('scopes rankings strictly to each show, never mixing another tracked show\'s episode_rankings rows in', async () => {
    fakeSupabase.userShows = [
      { user_id: 'them', show_id: 'show-1', created_at: '2026-01-02T00:00:00Z' },
      { user_id: 'them', show_id: 'show-2', created_at: '2026-01-01T00:00:00Z' },
    ];
    fakeSupabase.shows = [
      { id: 'show-1', title: 'Show One', poster_url: null },
      { id: 'show-2', title: 'Show Two', poster_url: null },
    ];
    fakeSupabase.episodes = [
      { id: 'ep-1', show_id: 'show-1', season_number: 1, episode_number: 1, title: 'S1 Pilot' },
      { id: 'ep-2', show_id: 'show-2', season_number: 1, episode_number: 1, title: 'S2 Pilot' },
    ];
    fakeSupabase.rankings = [
      { user_id: 'them', episode_id: 'ep-1', rank_position: 1, cold_start_bucket: null },
    ];

    const result = await getAccountShows('them');

    const showOne = result.find((s) => s.showId === 'show-1')!;
    const showTwo = result.find((s) => s.showId === 'show-2')!;
    expect(showOne).toMatchObject({ rankedCount: 1, total: 1, topEpisode: { title: 'S1 Pilot', seasonNumber: 1 } });
    expect(showTwo).toMatchObject({ rankedCount: 0, total: 1, topEpisode: null });
  });

  it('filters user_shows rows with no matching shows row (defensive -- mirrors dashboard/page.tsx\'s own filter)', async () => {
    fakeSupabase.userShows = [{ user_id: 'them', show_id: 'orphan-show', created_at: '2026-01-01T00:00:00Z' }];
    // No matching row in fakeSupabase.shows.

    const result = await getAccountShows('them');

    expect(result).toEqual([]);
  });
});
