'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { resetAllStarRanking } from '@/lib/all-star-session';
import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

/** Server Action: signs the current user out and redirects to `/login`. */
export async function logout() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}

/**
 * Result shape for the "Re-rank from scratch" full-reset action below: `undefined` on success
 * (the caller just re-renders, same convention as `RankingActionResult` in
 * `@/app/shows/[showId]/rank/[episodeId]/actions.ts`), `{ error }` if it threw.
 */
export type ResetTopEpisodesResult = { error: string } | undefined;

/**
 * The Top Episodes section's explicit "manual full re-rank" escape hatch (Docs/STATUS.md Bucket 4
 * item 15's UX spec) — wraps `resetAllStarRanking` (`@/lib/all-star-session`), which deletes every
 * `all_star_rankings`/`all_star_comparisons` row for the signed-in user, scoped only by `user_id`.
 * Offered alongside the targeted reconciliation notice for a user who'd rather redo the whole
 * comparison from scratch than trust the automatic targeted patch — not the default/primary
 * action, just an unobtrusive alternative.
 */
export async function resetTopEpisodes(): Promise<ResetTopEpisodesResult> {
  try {
    await resetAllStarRanking();
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to reset Top Episodes.' };
  }
  revalidatePath('/dashboard');
}
