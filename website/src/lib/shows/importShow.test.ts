import { beforeEach, describe, expect, it, vi } from 'vitest';

const tmdbFetch = vi.fn();
vi.mock('@/lib/tmdb/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tmdb/client')>();
  return {
    ...actual,
    tmdbFetch: (...args: unknown[]) => tmdbFetch(...args),
  };
});

const showsUpsertSingle = vi.fn();
const showsUpsert = vi.fn(() => ({
  select: () => ({ single: showsUpsertSingle }),
}));
const episodesUpsert = vi.fn();
const from = vi.fn((table: string) => {
  if (table === 'shows') {
    return { upsert: showsUpsert };
  }
  if (table === 'episodes') {
    return { upsert: episodesUpsert };
  }
  throw new Error(`Unexpected table: ${table}`);
});
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: () => ({ from }),
}));

import { importShowFromTmdb, seasonNumbersFor, toEpisodeRows } from './importShow';

describe('seasonNumbersFor', () => {
  it('returns 1..N inclusive for a show with N seasons', () => {
    expect(seasonNumbersFor(3)).toEqual([1, 2, 3]);
  });

  it('returns a single-element array for a 1-season show', () => {
    expect(seasonNumbersFor(1)).toEqual([1]);
  });

  it('returns an empty array for 0 or negative seasons', () => {
    expect(seasonNumbersFor(0)).toEqual([]);
    expect(seasonNumbersFor(-1)).toEqual([]);
  });

  it('truncates a non-integer season count', () => {
    expect(seasonNumbersFor(2.9)).toEqual([1, 2]);
  });
});

describe('toEpisodeRows', () => {
  it('maps episode summaries into episodes-table insert rows for the given show id', () => {
    expect(
      toEpisodeRows('show-uuid', [
        { tmdbEpisodeId: 1, seasonNumber: 1, episodeNumber: 1, title: 'Pilot' },
        { tmdbEpisodeId: 2, seasonNumber: 1, episodeNumber: 2, title: 'Cat' },
      ])
    ).toEqual([
      {
        show_id: 'show-uuid',
        tmdb_episode_id: 1,
        season_number: 1,
        episode_number: 1,
        title: 'Pilot',
      },
      {
        show_id: 'show-uuid',
        tmdb_episode_id: 2,
        season_number: 1,
        episode_number: 2,
        title: 'Cat',
      },
    ]);
  });

  it('returns an empty array for an empty episode list', () => {
    expect(toEpisodeRows('show-uuid', [])).toEqual([]);
  });
});

describe('importShowFromTmdb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    showsUpsertSingle.mockResolvedValue({ data: { id: 'show-uuid' }, error: null });
    episodesUpsert.mockResolvedValue({ data: null, error: null });
  });

  it('fetches show details, upserts the show, loops over every season, and upserts all episodes', async () => {
    tmdbFetch.mockImplementation(async (path: string) => {
      if (path === '/tv/1396') {
        return { id: 1396, name: 'Breaking Bad', poster_path: '/abc.jpg', number_of_seasons: 2 };
      }
      if (path === '/tv/1396/season/1') {
        return {
          episodes: [
            { id: 100, name: 'Pilot', season_number: 1, episode_number: 1 },
            { id: 101, name: 'Cat', season_number: 1, episode_number: 2 },
          ],
        };
      }
      if (path === '/tv/1396/season/2') {
        return {
          episodes: [{ id: 200, name: 'Season 2 Ep 1', season_number: 2, episode_number: 1 }],
        };
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    const result = await importShowFromTmdb(1396);

    // Show details + both seasons were fetched (not just season 1).
    expect(tmdbFetch).toHaveBeenCalledWith('/tv/1396');
    expect(tmdbFetch).toHaveBeenCalledWith('/tv/1396/season/1');
    expect(tmdbFetch).toHaveBeenCalledWith('/tv/1396/season/2');
    expect(tmdbFetch).toHaveBeenCalledTimes(3);

    // Show upserted keyed on tmdb_show_id.
    expect(showsUpsert).toHaveBeenCalledWith(
      { tmdb_show_id: 1396, title: 'Breaking Bad', poster_url: 'https://image.tmdb.org/t/p/w500/abc.jpg' },
      { onConflict: 'tmdb_show_id' }
    );

    // All 3 episodes across both seasons upserted keyed on tmdb_episode_id.
    expect(episodesUpsert).toHaveBeenCalledTimes(1);
    const [rows, options] = episodesUpsert.mock.calls[0];
    expect(options).toEqual({ onConflict: 'tmdb_episode_id' });
    expect(rows).toEqual([
      { show_id: 'show-uuid', tmdb_episode_id: 100, season_number: 1, episode_number: 1, title: 'Pilot' },
      { show_id: 'show-uuid', tmdb_episode_id: 101, season_number: 1, episode_number: 2, title: 'Cat' },
      {
        show_id: 'show-uuid',
        tmdb_episode_id: 200,
        season_number: 2,
        episode_number: 1,
        title: 'Season 2 Ep 1',
      },
    ]);

    expect(result).toEqual({ showId: 'show-uuid', episodeCount: 3 });
  });

  it('skips the episodes upsert entirely for a show with no seasons/episodes', async () => {
    tmdbFetch.mockResolvedValue({ id: 5, name: 'Empty Show', poster_path: null, number_of_seasons: 0 });

    const result = await importShowFromTmdb(5);

    expect(tmdbFetch).toHaveBeenCalledTimes(1);
    expect(episodesUpsert).not.toHaveBeenCalled();
    expect(result).toEqual({ showId: 'show-uuid', episodeCount: 0 });
  });

  it('throws a clear error if the show upsert fails', async () => {
    tmdbFetch.mockResolvedValue({ id: 1, name: 'X', poster_path: null, number_of_seasons: 0 });
    showsUpsertSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(importShowFromTmdb(1)).rejects.toThrow(/Failed to upsert show/);
  });

  it('throws a clear error if the episodes upsert fails', async () => {
    tmdbFetch.mockImplementation(async (path: string) => {
      if (path === '/tv/1') {
        return { id: 1, name: 'X', poster_path: null, number_of_seasons: 1 };
      }
      return { episodes: [{ id: 1, name: 'Ep', season_number: 1, episode_number: 1 }] };
    });
    episodesUpsert.mockResolvedValue({ data: null, error: { message: 'dup key' } });

    await expect(importShowFromTmdb(1)).rejects.toThrow(/Failed to upsert episodes/);
  });
});
