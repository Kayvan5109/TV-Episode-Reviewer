import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
// Chainable query-builder stub: `.from(table).select(...).eq(...).in(...)` /
// `.from(table).select(...).in(...)` both need to resolve to `{ data, error }` — every method
// below returns `this` except the final one actually awaited, matching how the route uses it.
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

// Imported after the mock so `route.ts` picks up the mocked module.
const { GET } = await import('./route');

const ORIGINAL_TOKEN = process.env.TMDB_API_READ_ACCESS_TOKEN;

beforeEach(() => {
  // `clearAllMocks` (not `restoreAllMocks`): the latter would strip the `from`/`getUser` mocks'
  // module-scope implementations back to a no-op, since they were never real functions to
  // "restore" to (see `@/lib/shows/searchAnnotation`-consuming tests elsewhere for the same
  // pattern) — clearing just resets call history, and every test below sets its own return
  // values explicitly anyway.
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

function requestFor(query: string | null) {
  const url = query
    ? `http://localhost/api/tmdb/search?query=${encodeURIComponent(query)}`
    : 'http://localhost/api/tmdb/search';
  return new NextRequest(url);
}

describe('GET /api/tmdb/search', () => {
  it('returns 400 when the query param is missing', async () => {
    const response = await GET(requestFor(null));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/query/i);
  });

  it('returns 500 with a clear message when the TMDB token is not configured', async () => {
    delete process.env.TMDB_API_READ_ACCESS_TOKEN;
    const response = await GET(requestFor('Breaking Bad'));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/TMDB_API_READ_ACCESS_TOKEN/);
  });

  it('calls TMDB search/tv with the query and a Bearer auth header, and reshapes the response', async () => {
    const sampleTmdbResponse = {
      page: 1,
      results: [
        {
          id: 1396,
          name: 'Breaking Bad',
          poster_path: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
          overview: 'A high school chemistry teacher...',
          first_air_date: '2008-01-20',
        },
        {
          id: 42009,
          name: 'Breaking Bad: Original Minisodes',
          poster_path: null,
          overview: '',
          first_air_date: '2009-02-01',
        },
      ],
      total_pages: 1,
      total_results: 2,
    };

    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(sampleTmdbResponse), { status: 200 }));

    const response = await GET(requestFor('Breaking Bad'));
    expect(response.status).toBe(200);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    expect(String(calledUrl)).toBe(
      'https://api.themoviedb.org/3/search/tv?query=Breaking+Bad'
    );
    const headers = new Headers(calledInit?.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-token-123');

    const body = await response.json();
    // Only the app's own shape should come back — not TMDB's raw fields (overview, first_air_date, ...).
    // No shows/user_shows rows configured in this test, so both come back not-added.
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
          tmdbShowId: 42009,
          title: 'Breaking Bad: Original Minisodes',
          posterUrl: null,
          alreadyAdded: false,
          showId: null,
        },
      ],
    });
  });

  it('forwards TMDB failures as an upstream (502) error without crashing', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('server error', { status: 500 }));

    const response = await GET(requestFor('Breaking Bad'));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });
});

describe('GET /api/tmdb/search — "already added" annotation', () => {
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

    const response = await GET(requestFor('Breaking Bad'));
    const body = await response.json();

    expect(body.results).toEqual([
      expect.objectContaining({ tmdbShowId: 1396, alreadyAdded: true, showId: 'show-uuid-1396' }),
      expect.objectContaining({ tmdbShowId: 60059, alreadyAdded: false, showId: null }),
    ]);
    expect(from).toHaveBeenCalledWith('user_shows');
  });

  it('never queries user_shows for another user — scopes the lookup by the signed-in user\'s id', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'the-real-signed-in-user' } } });
    showsResult = { data: [{ id: 'show-uuid-1396', tmdb_show_id: 1396 }], error: null };
    userShowsResult = { data: [], error: null };

    await GET(requestFor('Breaking Bad'));

    // The `.eq('user_id', ...)` call on the user_shows query builder must use the id that came
    // back from `getUser()`, never anything client-supplied (there's no client-supplied id here
    // at all — this asserts the only id in play is the session's).
    const userShowsBuilder = from.mock.results.find(
      (r, i) => from.mock.calls[i][0] === 'user_shows'
    )?.value;
    expect(userShowsBuilder.eq).toHaveBeenCalledWith('user_id', 'the-real-signed-in-user');
  });

  it('reports every result as not-added when there is no signed-in user, without querying the DB', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(requestFor('Breaking Bad'));
    const body = await response.json();

    expect(body.results.every((r: { alreadyAdded: boolean }) => r.alreadyAdded === false)).toBe(
      true
    );
    expect(from).not.toHaveBeenCalled();
  });

  it('fails open (reports not-added) if the shows lookup errors, without crashing the search', async () => {
    showsResult = { data: null, error: { message: 'db down' } };

    const response = await GET(requestFor('Breaking Bad'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results.every((r: { alreadyAdded: boolean }) => r.alreadyAdded === false)).toBe(
      true
    );
  });

  it('fails open (reports not-added) if the user_shows lookup errors, without crashing the search', async () => {
    showsResult = { data: [{ id: 'show-uuid-1396', tmdb_show_id: 1396 }], error: null };
    userShowsResult = { data: null, error: { message: 'db down' } };

    const response = await GET(requestFor('Breaking Bad'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results.every((r: { alreadyAdded: boolean }) => r.alreadyAdded === false)).toBe(
      true
    );
  });
});
