/**
 * GET /api/tmdb/discover?genre=<TMDB genre id, optional>
 *
 * Server-side proxy over TMDB's `/discover/tv` endpoint (see `src/lib/tmdb/client.ts`), sorted by
 * `popularity.desc` — this is what powers the "browse popular shows" grid shown on `/shows/search`
 * when the search input is empty (see `BrowseShows.tsx`). Passing `genre` adds TMDB's `with_genres`
 * param, same endpoint/sort, otherwise identical to the unfiltered popular list. First page only
 * (~20 results) — no pagination for v1, matching this project's existing preference for small,
 * complete scope over half-finished pagination.
 *
 * This is a distinct route from `/api/tmdb/search`, not a `?genre=` param bolted onto it: TMDB's
 * `/search/tv` has no genre filter at all, so combining "typed search" and "genre filter" would
 * mean client-side post-filtering TMDB search hits — out of scope for v1. The genre filter only
 * ever applies to this browse endpoint, never to typed search results.
 *
 * Also annotates each result with the *signed-in* caller's "already added this show" status, via
 * the exact same `annotateResultsForCurrentUser` that `/api/tmdb/search` uses (see
 * `@/lib/shows/searchAnnotation`) — shared, not duplicated, so browse results render through the
 * identical `ShowSearchResultWithStatus` shape and UI as search results.
 *
 * Uses the *session-aware* Supabase client (`serverSession.ts`), never the service-role client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { tmdbErrorBody, tmdbFetch } from '@/lib/tmdb/client';
import { mapShowSearchResult } from '@/lib/tmdb/mappers';
import type { ShowSearchResult, TmdbDiscoverResponse } from '@/lib/tmdb/types';
import { createSupabaseServerClient } from '@/lib/supabase/serverSession';
import { annotateResultsForCurrentUser } from '@/lib/shows/searchAnnotation';

export async function GET(request: NextRequest) {
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

  const genreParam = request.nextUrl.searchParams.get('genre');
  const genre = genreParam && genreParam.trim().length > 0 ? genreParam.trim() : undefined;

  let results: ShowSearchResult[];
  try {
    const data = await tmdbFetch<TmdbDiscoverResponse>('/discover/tv', {
      sort_by: 'popularity.desc',
      with_genres: genre,
    });
    results = data.results.map(mapShowSearchResult);
  } catch (error) {
    const { status, body } = tmdbErrorBody(error);
    return NextResponse.json(body, { status });
  }

  const annotated = await annotateResultsForCurrentUser(results);
  return NextResponse.json({ results: annotated });
}
