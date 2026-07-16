/**
 * Small server-only TMDB API client.
 *
 * Isolated on purpose: all TMDB-specific URL-building and auth lives here in one place, so if a
 * path/param turns out wrong (this was written from memory of TMDB's v3 API, not verified against
 * live docs/a real API key — see the specific call-outs below) it only needs fixing here, not in
 * every route handler that uses it.
 *
 * Never import this from client components — it reads a server-only secret
 * (`TMDB_API_READ_ACCESS_TOKEN`) from `process.env`.
 */

export const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';

// TMDB's image CDN serves posters at a handful of fixed widths (w92/w154/w185/w342/w500/original).
// w500 is a reasonable default for list/detail views; not verified against a live account, so
// treat this as easy to change in one place if it turns out to be the wrong size.
export const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

/** Thrown when the server isn't configured with a TMDB token — a deploy/config problem, not a bad request. */
export class TmdbConfigError extends Error {
  constructor(message = 'TMDB_API_READ_ACCESS_TOKEN is not configured on the server.') {
    super(message);
    this.name = 'TmdbConfigError';
  }
}

/** Thrown when TMDB itself responds with a non-2xx status. */
export class TmdbApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'TmdbApiError';
    this.status = status;
  }
}

/**
 * Builds a fully-qualified TMDB API URL for `path` (e.g. `/search/tv`), attaching `searchParams`
 * as query string params. Kept as its own small function so the URL shape is easy to eyeball/fix.
 */
export function buildTmdbUrl(
  path: string,
  searchParams?: Record<string, string | number | undefined>
): URL {
  const url = new URL(`${TMDB_API_BASE_URL}${path}`);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url;
}

/** Turns a TMDB poster_path (e.g. "/abc123.jpg") into a full image URL, or null if there isn't one. */
export function posterUrlFromPath(posterPath: string | null): string | null {
  return posterPath ? `${TMDB_IMAGE_BASE_URL}${posterPath}` : null;
}

/** Fields used to build the JSON error body returned by both TMDB route handlers on failure. */
export interface TmdbErrorBody {
  status: number;
  body: { error: string };
}

/**
 * Shapes any error thrown by `tmdbFetch` into a consistent (status, body) pair so both TMDB route
 * handlers fail the same clear, non-crashing way instead of throwing an unhandled exception.
 */
export function tmdbErrorBody(error: unknown): TmdbErrorBody {
  if (error instanceof TmdbConfigError) {
    return { status: 500, body: { error: error.message } };
  }
  if (error instanceof TmdbApiError) {
    // Forward TMDB's own status where it makes sense (e.g. 404 for an unknown id), otherwise
    // treat it as an upstream failure (502).
    const status = error.status >= 400 && error.status < 500 ? error.status : 502;
    return { status, body: { error: error.message } };
  }
  return { status: 502, body: { error: 'Unexpected error contacting TMDB.' } };
}

/**
 * Fetches `path` from TMDB, authenticated with `TMDB_API_READ_ACCESS_TOKEN` as a Bearer token
 * (TMDB v3 API's read-access-token auth style — the token itself, not "api_key=" query auth).
 * Throws `TmdbConfigError` if the token isn't set, or `TmdbApiError` if TMDB responds with an
 * error status.
 */
export async function tmdbFetch<T>(
  path: string,
  searchParams?: Record<string, string | number | undefined>
): Promise<T> {
  const token = process.env.TMDB_API_READ_ACCESS_TOKEN;
  if (!token) {
    throw new TmdbConfigError();
  }

  const url = buildTmdbUrl(path, searchParams);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new TmdbApiError(
      response.status,
      `TMDB request to ${path} failed with status ${response.status}${body ? `: ${body}` : ''}`
    );
  }

  return (await response.json()) as T;
}
