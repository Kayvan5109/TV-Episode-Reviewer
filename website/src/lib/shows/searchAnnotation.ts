/**
 * Cross-references TMDB show-search results against our own `shows`/`user_shows` tables to answer
 * "has the *signed-in* user already added this show?" — used by `/api/tmdb/search` to annotate
 * results so the UI can render a "Go to show" link instead of a confusing, no-op-looking
 * "Add show" button for shows the user has already imported (see `website/AGENTS.md`'s sibling
 * doc comment in `route.ts` for the full data-flow reasoning).
 *
 * Pure and DB/network-free on purpose — isolated for unit testing against mocked data. The route
 * handler is what fetches `knownShows`/`addedShowIds` (session-aware, scoped to the caller's own
 * `user_shows` rows) and calls `annotateAlreadyAdded`.
 */

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
