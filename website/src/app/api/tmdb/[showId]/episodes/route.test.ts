import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();

vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));

// Imported after the mock so `route.ts` picks up the mocked module — matches
// `api/tmdb/search/route.test.ts`'s established pattern for this codebase.
const { GET } = await import('./route');

const ORIGINAL_TOKEN = process.env.TMDB_API_READ_ACCESS_TOKEN;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TMDB_API_READ_ACCESS_TOKEN = 'test-token-123';
  // Default: signed-in user — most tests only care about the TMDB shape, not the auth gate itself.
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
});

afterEach(() => {
  process.env.TMDB_API_READ_ACCESS_TOKEN = ORIGINAL_TOKEN;
});

function requestFor(showId: string, season: string | null) {
  const url = season
    ? `http://localhost/api/tmdb/${showId}/episodes?season=${encodeURIComponent(season)}`
    : `http://localhost/api/tmdb/${showId}/episodes`;
  return GET(new NextRequest(url), { params: Promise.resolve({ showId }) });
}

describe('GET /api/tmdb/[showId]/episodes', () => {
  it('returns 401 and never calls TMDB when there is no signed-in user', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const fetchSpy = vi.spyOn(global, 'fetch');

    const response = await requestFor('1396', '1');

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toMatch(/signed in/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-numeric showId', async () => {
    const response = await requestFor('not-a-number', '1');
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/showId/);
  });

  it('returns 400 when season is missing', async () => {
    const response = await requestFor('1396', null);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/season/i);
  });

  it('returns 400 when season is not a valid non-negative integer', async () => {
    const response = await requestFor('1396', 'one');
    expect(response.status).toBe(400);
  });

  it('returns 500 with a clear message when the TMDB token is not configured', async () => {
    delete process.env.TMDB_API_READ_ACCESS_TOKEN;
    const response = await requestFor('1396', '1');
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/TMDB_API_READ_ACCESS_TOKEN/);
  });

  it('calls TMDB tv/{id}/season/{season} and reshapes the response', async () => {
    const sampleTmdbResponse = {
      _id: 'abc',
      air_date: '2008-01-20',
      name: 'Season 1',
      overview: '',
      id: 3572,
      season_number: 1,
      poster_path: '/season1.jpg',
      episodes: [
        {
          id: 62085,
          name: 'Pilot',
          overview: '...',
          season_number: 1,
          episode_number: 1,
          air_date: '2008-01-20',
          still_path: '/still1.jpg',
        },
        {
          id: 62086,
          name: "Cat's in the Bag...",
          overview: '...',
          season_number: 1,
          episode_number: 2,
          air_date: '2008-01-27',
          still_path: '/still2.jpg',
        },
      ],
    };

    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(sampleTmdbResponse), { status: 200 }));

    const response = await requestFor('1396', '1');
    expect(response.status).toBe(200);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    expect(String(calledUrl)).toBe('https://api.themoviedb.org/3/tv/1396/season/1');
    const headers = new Headers(calledInit?.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-token-123');

    const body = await response.json();
    expect(body).toEqual({
      episodes: [
        {
          tmdbEpisodeId: 62085,
          seasonNumber: 1,
          episodeNumber: 1,
          title: 'Pilot',
          seasonPosterUrl: 'https://image.tmdb.org/t/p/w500/season1.jpg',
        },
        {
          tmdbEpisodeId: 62086,
          seasonNumber: 1,
          episodeNumber: 2,
          title: "Cat's in the Bag...",
          seasonPosterUrl: 'https://image.tmdb.org/t/p/w500/season1.jpg',
        },
      ],
    });
  });

  it('forwards a TMDB 404 (unknown show/season) as-is', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('not found', { status: 404 }));

    const response = await requestFor('999999', '1');
    expect(response.status).toBe(404);
  });
});
