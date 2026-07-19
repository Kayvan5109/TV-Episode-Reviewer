/**
 * GET /api/tmdb/search?query=<show name>
 *
 * Server-side proxy over TMDB's `/search/tv` endpoint (see `src/lib/tmdb/client.ts`) — never call
 * TMDB directly from the browser or iOS, so `TMDB_API_READ_ACCESS_TOKEN` stays server-only.
 * Returns only the fields the app needs, not TMDB's raw response.
 *
 * Also annotates each result with the *signed-in* caller's "already added this show" status (see
 * `src/lib/shows/searchAnnotation.ts`), so the live/autocomplete search UI (`ShowSearchForm`) gets
 * TMDB results and per-user added-status in one round trip instead of two separate client-side
 * calls. This is the one place that can safely see both the session cookie (to know *who's*
 * asking) and our own `shows`/`user_shows` tables, so it's the natural place to combine them —
 * a client component can't query Postgres directly, and doing the annotation as a second
 * client-triggered call would double the round trips for no benefit. The annotation itself
 * (`annotateResultsForCurrentUser`) is shared with `/api/tmdb/discover`, not duplicated here — see
 * its doc comment in `searchAnnotation.ts` for the session-client/RLS reasoning.
 */

import { NextRequest, NextResponse } from 'next/server';
import { tmdbErrorBody, tmdbFetch } from '@/lib/tmdb/client';
import { mapShowSearchResult } from '@/lib/tmdb/mappers';
import type { ShowSearchResult, TmdbTvSearchResponse } from '@/lib/tmdb/types';
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

  const query = request.nextUrl.searchParams.get('query');

  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: 'Missing required "query" search parameter.' },
      { status: 400 }
    );
  }

  let results: ShowSearchResult[];
  try {
    const data = await tmdbFetch<TmdbTvSearchResponse>('/search/tv', { query });
    results = data.results.map(mapShowSearchResult);
  } catch (error) {
    const { status, body } = tmdbErrorBody(error);
    return NextResponse.json(body, { status });
  }

  const annotated = await annotateResultsForCurrentUser(results);
  return NextResponse.json({ results: annotated });
}
