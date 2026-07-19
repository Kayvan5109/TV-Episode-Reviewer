import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
// Chainable query-builder stub: `.from(table).select(...).eq(...).in(...)` /
// `.from(table).select(...).in(...)` both need to resolve to `{ data, error }` — every method
// below returns `this` except the final one actually awaited, matching how
// `annotateResultsForCurrentUser` uses it (see `search/route.test.ts` for the same pattern).
function makeQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(async () => result),
  };
  return builder;
}

let showsResult: { data: unknown; error: unknown } = { data: [], error: null };
let userShowsResult: { data: unknown; error: unknown } = { data: [], error: null };

const from = vi.fn((table: string) => {
  if (table === 'shows') return makeQueryBuilder(showsResult);
  if (table === 'user_shows') return makeQueryBuilder(userShowsResult);
  throw new Error(`Unexpected table in test: ${table}`);
});

vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, from }),
}));

// Imported after the mock so `route.ts` (and the `searchAnnotation` module it calls into) picks up
// the mocked module.
const { GET } = await import('./route');

const ORIGINAL_TOKEN = process.env.TMDB_API_READ_ACCESS_TOKEN;

beforeEach(() => {
  // `clearAllMocks` (not `restoreAllMocks`): see `search/route.test.ts` for why.
  vi.clearAllMocks();
  process.env.TMDB_API_READ_ACCESS_TOKEN = 'test-token-123';
  // Default: signed-in user, nothing already added — most tests only care about the TMDB shape.
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  showsResult = { data: [], error: null };
  userShowsResult = { data: [], error: null };
});

afterEach(() => {
  process.env.TMDB_API_READ_ACCESS_TOKEN = ORIGINAL_TOKEN;
});

function requestFor(genre: string | null) {
  const url = genre
    ? `http://localhost/api/tmdb/discover?genre=${encodeURIComponent(genre)}`
    : 'http://localhost/api/tmdb/discover';
  return new NextRequest(url);
}

describe('GET /api/tmdb/discover', () => {
  it('returns 401 and never calls TMDB when there is no signed-in user', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const fetchSpy = vi.spyOn(global, 'fetch');

    const response = await GET(requestFor(null));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toMatch(/signed in/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 500 with a clear message when the TMDB token is not configured', async () => {
    delete process.env.TMDB_API_READ_ACCESS_TOKEN;
    const response = await GET(requestFor(null));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/TMDB_API_READ_ACCESS_TOKEN/);
  });

  it('calls TMDB discover/tv sorted by popularity, with no genre filter when none is given, and reshapes the response', async () => {
    const sampleTmdbResponse = {
      page: 1,
      results: [
        { id: 1396, name: 'Breaking Bad', poster_path: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg' },
        { id: 60059, name: 'Better Call Saul', poster_path: null },
      ],
      total_pages: 1,
      total_results: 2,
    };

    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(sampleTmdbResponse), { status: 200 }));

    const response = await GET(requestFor(null));
    expect(response.status).toBe(200);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    expect(String(calledUrl)).toBe(
      'https://api.themoviedb.org/3/discover/tv?sort_by=popularity.desc'
    );
    const headers = new Headers(calledInit?.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-token-123');

    const body = await response.json();
    // Only the app's own shape should come back — not TMDB's raw fields. No shows/user_shows rows
    // configured in this test, so both come back not-added.
    expect(body).toEqual({
      results: [
        {
          tmdbShowId: 1396,
          title: 'Breaking Bad',
          posterUrl: 'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
          alreadyAdded: false,
          showId: null,
        },
        {
          tmdbShowId: 60059,
          title: 'Better Call Saul',
          posterUrl: null,
          alreadyAdded: false,
          showId: null,
        },
      ],
    });
  });

  it('adds with_genres to the TMDB request when a genre param is given', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));

    const response = await GET(requestFor('18'));
    expect(response.status).toBe(200);

    const [calledUrl] = fetchSpy.mock.calls[0];
    expect(String(calledUrl)).toBe(
      'https://api.themoviedb.org/3/discover/tv?sort_by=popularity.desc&with_genres=18'
    );
  });

  it('forwards TMDB failures as an upstream (502) error without crashing', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('server error', { status: 500 }));

    const response = await GET(requestFor(null));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });
});

describe('GET /api/tmdb/discover — "already added" annotation', () => {
  const sampleTmdbResponse = {
    results: [
      { id: 1396, name: 'Breaking Bad', poster_path: null },
      { id: 60059, name: 'Better Call Saul', poster_path: null },
    ],
  };

  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(sampleTmdbResponse), { status: 200 })
    );
  });

  it('marks a result already added when it is a known show in the signed-in user\'s user_shows', async () => {
    showsResult = {
      data: [
        { id: 'show-uuid-1396', tmdb_show_id: 1396 },
        { id: 'show-uuid-60059', tmdb_show_id: 60059 },
      ],
      error: null,
    };
    userShowsResult = { data: [{ show_id: 'show-uuid-1396' }], error: null };

    const response = await GET(requestFor(null));
    const body = await response.json();

    expect(body.results).toEqual([
      expect.objectContaining({ tmdbShowId: 1396, alreadyAdded: true, showId: 'show-uuid-1396' }),
      expect.objectContaining({ tmdbShowId: 60059, alreadyAdded: false, showId: null }),
    ]);
    expect(from).toHaveBeenCalledWith('user_shows');
  });

  it('fails open (reports not-added) if the shows lookup errors, without crashing the request', async () => {
    showsResult = { data: null, error: { message: 'db down' } };

    const response = await GET(requestFor(null));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results.every((r: { alreadyAdded: boolean }) => r.alreadyAdded === false)).toBe(
      true
    );
  });
});
