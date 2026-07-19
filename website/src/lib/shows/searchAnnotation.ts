/**
 * Cross-references TMDB show-search results against our own `shows`/`user_shows` tables to answer
 * "has the *signed-in* user already added this show?" — used by `/api/tmdb/search` and
 * `/api/tmdb/discover` to annotate results so the UI can render a "Go to show" link instead of a
 * confusing, no-op-looking "Add show" button for shows the user has already imported (see
 * `/api/tmdb/search/route.ts`'s doc comment for the full data-flow reasoning).
 *
 * `annotateAlreadyAdded` below is pure and DB/network-free on purpose — isolated for unit testing
 * against mocked data. `annotateResultsForCurrentUser` is its DB-touching wrapper (fetches
 * `knownShows`/`addedShowIds`, session-aware, scoped to the caller's own `user_shows` rows, then
 * calls `annotateAlreadyAdded`) — it lives here too, rather than duplicated in both route handlers,
 * since both `/api/tmdb/search` and `/api/tmdb/discover` need the exact same annotation step.
 */

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';
import type { ShowSearchResult } from '@/lib/tmdb/types';

/** The minimal identity of a `shows` row needed to cross-reference a TMDB id to our own show id. */
export interface ShowIdentity {
  id: string;
  tmdbShowId: number;
}

/** A TMDB search result annotated with the signed-in user's "already added" status. */
export interface ShowSearchResultWithStatus extends ShowSearchResult {
  /** True only when this show exists in `shows` AND the signed-in user has a `user_shows` row for it. */
  alreadyAdded: boolean;
  /** This app's own `shows.id`, present only when `alreadyAdded` is true — used to link straight to `/shows/[showId]`. */
  showId: string | null;
}

/**
 * Annotates `results` with `alreadyAdded`/`showId`, given:
 * - `knownShows`: which of the result set's TMDB ids already exist in our `shows` table (may be a
 *   strict subset of `results`, or empty — most TMDB search hits won't be imported yet).
 * - `addedShowIds`: which `shows.id` values the *signed-in* user has a `user_shows` row for.
 *
 * A result only gets `alreadyAdded: true` if it's in both sets — existing in `shows` alone just
 * means *some* user (possibly a different one) imported it already, which the current caller
 * still needs to see an "Add show" button for (adding is idempotent either way).
 */
export function annotateAlreadyAdded(
  results: ShowSearchResult[],
  knownShows: ShowIdentity[],
  addedShowIds: ReadonlySet<string>
): ShowSearchResultWithStatus[] {
  const showIdByTmdbId = new Map(knownShows.map((show) => [show.tmdbShowId, show.id]));

  return results.map((result) => {
    const knownShowId = showIdByTmdbId.get(result.tmdbShowId) ?? null;
    const alreadyAdded = knownShowId !== null && addedShowIds.has(knownShowId);
    return { ...result, alreadyAdded, showId: alreadyAdded ? knownShowId : null };
  });
}

/**
 * Looks up which of `results`' TMDB ids are already-imported shows (`shows`), and which of those
 * the signed-in user has added (`user_shows`), then annotates accordingly. Shared by
 * `/api/tmdb/search` and `/api/tmdb/discover` so the TMDB-calling path in each route stays easy to
 * read and neither duplicates this ~50-line DB-touching wrapper; the actual cross-referencing logic
 * lives in `annotateAlreadyAdded` (pure, unit-tested separately, above).
 *
 * Uses the *session-aware* Supabase client (`serverSession.ts`), never the service-role client, for
 * the `user_shows` lookup — this must only ever reflect the caller's own rows, enforced by both RLS
 * and an explicit `user_id` filter (defense in depth). The caller's identity always comes from
 * `getUser()`, never a client-supplied value. This function does its own internal `getUser()` call
 * and its own no-user fallback (harmless redundancy, left as-is rather than threading a user
 * through) — each route's own auth gate is a separate, earlier check whose job is different: it
 * requires a signed-in caller at all, full stop, before the route will spend the server's own TMDB
 * token on anyone's behalf (see `/api/tmdb/search/route.ts`'s guard comment for why).
 */
export async function annotateResultsForCurrentUser(
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
