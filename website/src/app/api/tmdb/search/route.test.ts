import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const ORIGINAL_TOKEN = process.env.TMDB_API_READ_ACCESS_TOKEN;

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.TMDB_API_READ_ACCESS_TOKEN = 'test-token-123';
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
    expect(body).toEqual({
      results: [
        {
          tmdbShowId: 1396,
          title: 'Breaking Bad',
          posterUrl: 'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
        },
        {
          tmdbShowId: 42009,
          title: 'Breaking Bad: Original Minisodes',
          posterUrl: null,
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
