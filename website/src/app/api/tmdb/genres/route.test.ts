import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();

vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));

// Imported after the mock so `route.ts` picks up the mocked module.
const { GET } = await import('./route');

const ORIGINAL_TOKEN = process.env.TMDB_API_READ_ACCESS_TOKEN;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TMDB_API_READ_ACCESS_TOKEN = 'test-token-123';
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
});

afterEach(() => {
  process.env.TMDB_API_READ_ACCESS_TOKEN = ORIGINAL_TOKEN;
});

describe('GET /api/tmdb/genres', () => {
  it('returns 401 and never calls TMDB when there is no signed-in user', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const fetchSpy = vi.spyOn(global, 'fetch');

    const response = await GET();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toMatch(/signed in/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 500 with a clear message when the TMDB token is not configured', async () => {
    delete process.env.TMDB_API_READ_ACCESS_TOKEN;
    const response = await GET();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/TMDB_API_READ_ACCESS_TOKEN/);
  });

  it('calls TMDB genre/tv/list with a Bearer auth header, and returns the genre list', async () => {
    const sampleTmdbResponse = {
      genres: [
        { id: 18, name: 'Drama' },
        { id: 35, name: 'Comedy' },
      ],
    };

    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(sampleTmdbResponse), { status: 200 }));

    const response = await GET();
    expect(response.status).toBe(200);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    expect(String(calledUrl)).toBe('https://api.themoviedb.org/3/genre/tv/list');
    const headers = new Headers(calledInit?.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-token-123');

    const body = await response.json();
    expect(body).toEqual({
      genres: [
        { id: 18, name: 'Drama' },
        { id: 35, name: 'Comedy' },
      ],
    });
  });

  it('forwards TMDB failures as an upstream (502) error without crashing', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('server error', { status: 500 }));

    const response = await GET();
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });
});
