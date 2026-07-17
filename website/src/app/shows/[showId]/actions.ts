'use server';

import { redirect } from 'next/navigation';

import { deleteShowRankingData, resetEpisodeRanking } from '@/lib/ranking-session';
import type { EpisodeId } from '@/lib/ranking-session';
import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

/**
 * Result shape both destructive actions below return: `undefined` on success (the caller
 * redirects itself, so there's nothing left for the UI to do), `{ error }` if something failed —
 * surfaced by the UI rather than silently swallowed, same convention as `AddShowFormState` in
 * `@/app/shows/search/actions.ts`.
 */
export type ShowActionResult = { error: string } | undefined;

/**
 * Removes a show from the signed-in user's list. Deletes all of this user's ranking data for it
 * (`deleteShowRankingData`, in `@/lib/ranking-session` — see its doc comment for exactly what that
 * touches) and then this user's `user_shows` row — a clean slate, not an instant-restore-on-re-add
 * (decided mechanics for this feature). Doesn't touch the global `shows`/`episodes` reference
 * tables.
 *
 * The `user_shows` delete happens directly here (session-aware client, scoped to
 * `user_id`+`show_id`) rather than being folded into `ranking-session` — that module's concern is
 * ranking state, not the "which shows has this user added" join table, matching how `addShow` in
 * `@/app/shows/search/actions.ts` writes `user_shows` directly rather than through that module.
 *
 * On success, redirects to `/dashboard` rather than staying on `/shows/[showId]` — that page itself
 * doesn't 404 (it only depends on the show existing in the global `shows` table, not on
 * `user_shows`, so it would still render, just showing every episode as unranked again), but
 * staying on a page for a show the user just deliberately removed would be a confusing dead end.
 * On failure, returns `{ error }` instead of redirecting, so the UI can show what went wrong rather
 * than silently losing it.
 */
export async function removeShow(showId: string): Promise<ShowActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  try {
    await deleteShowRankingData(showId);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to remove this show.',
    };
  }

  const { error: userShowError } = await supabase
    .from('user_shows')
    .delete()
    .eq('user_id', user.id)
    .eq('show_id', showId);

  if (userShowError) {
    return {
      error: `Removed your rankings for this show, but couldn't remove it from your list: ${userShowError.message}`,
    };
  }

  redirect('/dashboard');
}

/**
 * Clears an already-ranked episode's placement and comparison history (`resetEpisodeRanking`, in
 * `@/lib/ranking-session` — see its doc comment for the full reasoning behind clearing comparisons
 * too, not just the position) and sends the user straight into re-ranking that specific episode via
 * the already-working per-episode route, rather than dumping them back on the show list to click
 * "Rank" again themselves.
 */
export async function reRankEpisode(showId: string, episodeId: EpisodeId): Promise<ShowActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  try {
    await resetEpisodeRanking(showId, episodeId);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to reset this episode.',
    };
  }

  redirect(`/shows/${showId}/rank/${episodeId}`);
}
