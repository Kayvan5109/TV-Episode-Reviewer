import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TmdbApiError,
  TmdbConfigError,
  buildTmdbUrl,
  posterUrlFromPath,
  tmdbErrorBody,
  tmdbFetch,
} from './client';

describe('buildTmdbUrl', () => {
  it('builds a URL against the TMDB v3 base with no params', () => {
    const url = buildTmdbUrl('/search/tv');
    expect(url.toString()).toBe('https://api.themoviedb.org/3/search/tv');
  });

  it('attaches provided search params', () => {
    const url = buildTmdbUrl('/search/tv', { query: 'Breaking Bad', page: 2 });
    expect(url.toString()).toBe(
      'https://api.themoviedb.org/3/search/tv?query=Breaking+Bad&page=2'
    );
  });

  it('omits params whose value is undefined', () => {
    const url = buildTmdbUrl('/tv/123/season/1', { extra: undefined });
    expect(url.toString()).toBe('https://api.themoviedb.org/3/tv/123/season/1');
  });
});

describe('posterUrlFromPath', () => {
  it('prefixes a poster_path with the TMDB image CDN base', () => {
    expect(posterUrlFromPath('/abc123.jpg')).toBe('https://image.tmdb.org/t/p/w500/abc123.jpg');
  });

  it('returns null when there is no poster path', () => {
    expect(posterUrlFromPath(null)).toBeNull();
  });
});

describe('tmdbFetch', () => {
  const ORIGINAL_TOKEN = process.env.TMDB_API_READ_ACCESS_TOKEN;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.TMDB_API_READ_ACCESS_TOKEN = ORIGINAL_TOKEN;
  });

  it('throws TmdbConfigError when the token env var is missing', async () => {
    delete process.env.TMDB_API_READ_ACCESS_TOKEN;
    await expect(tmdbFetch('/search/tv', { query: 'x' })).rejects.toBeInstanceOf(TmdbConfigError);
  });

  it('calls fetch with the built URL and a Bearer auth header', async () => {
    process.env.TMDB_API_READ_ACCESS_TOKEN = 'test-token-123';
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    await tmdbFetch('/search/tv', { query: 'Breaking Bad' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    expect(String(calledUrl)).toBe(
      'https://api.themoviedb.org/3/search/tv?query=Breaking+Bad'
    );
    const headers = new Headers(calledInit?.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-token-123');
    expect(headers.get('Accept')).toBe('application/json');
  });

  it('returns the parsed JSON body on success', async () => {
    process.env.TMDB_API_READ_ACCESS_TOKEN = 'test-token-123';
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ hello: 'world' }), { status: 200 })
    );

    const result = await tmdbFetch<{ hello: string }>('/search/tv');
    expect(result).toEqual({ hello: 'world' });
  });

  it('throws TmdbApiError when TMDB responds with a non-2xx status', async () => {
    process.env.TMDB_API_READ_ACCESS_TOKEN = 'test-token-123';
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('not found', { status: 404 })
    );

    await expect(tmdbFetch('/tv/999999')).rejects.toMatchObject({
      name: 'TmdbApiError',
      status: 404,
    });
  });
});

describe('tmdbErrorBody', () => {
  it('maps TmdbConfigError to a 500', () => {
    expect(tmdbErrorBody(new TmdbConfigError())).toMatchObject({ status: 500 });
  });

  it('forwards a 4xx TmdbApiError status as-is', () => {
    expect(tmdbErrorBody(new TmdbApiError(404, 'not found'))).toMatchObject({ status: 404 });
  });

  it('maps a 5xx TmdbApiError to a 502 (upstream failure)', () => {
    expect(tmdbErrorBody(new TmdbApiError(500, 'tmdb is down'))).toMatchObject({ status: 502 });
  });

  it('maps an unknown error to a 502', () => {
    expect(tmdbErrorBody(new Error('boom'))).toMatchObject({ status: 502 });
  });
});
