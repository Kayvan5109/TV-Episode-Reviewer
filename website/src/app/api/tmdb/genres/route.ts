/**
 * GET /api/tmdb/genres
 *
 * Server-side proxy over TMDB's `/genre/tv/list` endpoint — populates the genre `<select>` on the
 * "browse popular shows" view (`BrowseShows.tsx`), which then feeds the chosen id to
 * `/api/tmdb/discover?genre=<id>`.
 *
 * JUDGMENT CALL: fetches live from TMDB on every request rather than hardcoding TMDB's genre list.
 * Hardcoding was also a legitimate choice here — TMDB's TV genre list is small and documented as
 * stable — but fetching live matches this app's existing "prefer live data over anything that can
 * go stale" posture (e.g. episode credits are fetched live on every page view, no caching), the
 * call is cheap (one small JSON payload), and it means a genre TMDB adds later shows up here
 * without a code change.
 *
 * Same auth gate as `/api/tmdb/search` and `/api/tmdb/discover`, copied verbatim (see
 * `/api/tmdb/search/route.ts`'s doc comment for the full "why" — this project had a real security
 * incident, `Docs/CriticalReview.md` Finding 3.1, from a TMDB proxy route reachable without auth):
 * checked before touching TMDB, not after.
 */

import { NextResponse } from 'next/server';
import { tmdbErrorBody, tmdbFetch } from '@/lib/tmdb/client';
import type { TmdbGenreListResponse } from '@/lib/tmdb/types';
import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

export async function GET() {
  // Auth gate: this route calls out to TMDB using this server's own read-access token
  // (TMDB_API_READ_ACCESS_TOKEN, see tmdb/client.ts) — without this check, `proxy.ts`'s matcher
  // deliberately excludes `/api` (so it never runs on this route at all), so this was previously
  // reachable by anyone on the internet, burning the token with no auth and no rate limit. Checked
  // before touching TMDB, not after — the point is to never spend the call on an unauthenticated
  // request in the first place.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  try {
    const data = await tmdbFetch<TmdbGenreListResponse>('/genre/tv/list');
    return NextResponse.json({ genres: data.genres });
  } catch (error) {
    const { status, body } = tmdbErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
