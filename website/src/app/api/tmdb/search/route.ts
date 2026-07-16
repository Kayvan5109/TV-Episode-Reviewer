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
 * client-triggered call would double the round trips for no benefit.
 *
 * Uses the *session-aware* Supabase client (`serverSession.ts`), never the service-role client,
 * for the `user_shows` lookup — this must only ever reflect the caller's own rows, enforced by
 * both RLS and an explicit `user_id` filter (defense in depth). The caller's identity always comes
 * from `getUser()`, never a client-supplied value. If there's no signed-in user (e.g. this route
 * were ever hit unauthenticated), every result is simply reported as not-added rather than
 * guessed — this page already requires auth, so that's a defensive fallback, not the expected path.
 */

import { NextRequest, NextResponse } from 'next/server';
import { tmdbErrorBody, tmdbFetch } from '@/lib/tmdb/client';
import { mapShowSearchResult } from '@/lib/tmdb/mappers';
import type { ShowSearchResult, TmdbTvSearchResponse } from '@/lib/tmdb/types';
import { createSupabaseServerClient } from '@/lib/supabase/serverSession';
import {
  annotateAlreadyAdded,
  type ShowIdentity,
  type ShowSearchResultWithStatus,
} from '@/lib/shows/searchAnnotation';

export async function GET(request: NextRequest) {
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

/**
 * Looks up which of `results`' TMDB ids are already-imported shows (`shows`), and which of those
 * the signed-in user has added (`user_shows`), then annotates accordingly. Isolated from `GET` so
 * the TMDB-calling path above stays easy to read; the actual cross-referencing logic lives in
 * `annotateAlreadyAdded` (pure, unit-tested separately).
 */
async function annotateResultsForCurrentUser(
  results: ShowSearchResult[]
): Promise<ShowSearchResultWithStatus[]> {
  if (results.length === 0) {
    return [];
  }

  const notAdded = () => results.map((result) => ({ ...result, alreadyAdded: false, showId: null }));

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return notAdded();
  }

  const tmdbShowIds = results.map((result) => result.tmdbShowId);
  const { data: knownShowsData, error: knownShowsError } = await supabase
    .from('shows')
    .select('id, tmdb_show_id')
    .in('tmdb_show_id', tmdbShowIds);

  // Fail open on lookup errors: worst case the UI shows "Add show" for something already added
  // (the pre-existing, harmless behavior this feature improves on), never the reverse.
  if (knownShowsError || !knownShowsData || knownShowsData.length === 0) {
    return notAdded();
  }

  const knownShows: ShowIdentity[] = knownShowsData.map((row) => ({
    id: row.id as string,
    tmdbShowId: row.tmdb_show_id as number,
  }));

  const { data: userShowsData, error: userShowsError } = await supabase
    .from('user_shows')
    .select('show_id')
    .eq('user_id', user.id)
    .in(
      'show_id',
      knownShows.map((show) => show.id)
    );

  if (userShowsError) {
    return notAdded();
  }

  const addedShowIds = new Set((userShowsData ?? []).map((row) => row.show_id as string));

  return annotateAlreadyAdded(results, knownShows, addedShowIds);
}
