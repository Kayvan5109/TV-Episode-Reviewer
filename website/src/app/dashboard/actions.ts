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

/** Result shape for the incoming-follow-request Accept/Deny actions below. */
export type FollowRequestActionResult = { error: string } | undefined;

/**
 * Server Action backing "Accept" on an incoming follow request in the dashboard's "Follow requests"
 * section (Docs/AppSpec.md's "Follow requests (private profiles only)" feature flow).
 *
 * Thin wrapper around `accept_follow_request` (see
 * `supabase/migrations/20260722030000_follow_requests_and_private_profile_visibility.sql`), the
 * `security invoker` Postgres function that atomically moves the pending `follow_requests` row into
 * `follows`. Deliberately does not attempt the two writes itself from application code -- a
 * client-side "delete then insert" could leave inconsistent state if the second call failed; the DB
 * function is what actually guarantees both happen or neither does. The function itself independently
 * re-verifies the caller is the real target of a pending request from `requesterId` before doing
 * anything (see its own doc comment) -- this action doesn't duplicate that check, just surfaces
 * whatever the function decides.
 */
export async function acceptFollowRequest(requesterId: string): Promise<FollowRequestActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { error } = await supabase.rpc('accept_follow_request', { p_requester_id: requesterId });

  if (error) {
    return { error: "Couldn't accept that follow request." };
  }

  revalidatePath('/dashboard');
}

/**
 * Server Action backing "Deny" on an incoming follow request -- just a plain delete, scoped to rows
 * where the signed-in user is the target. `follow_requests`' own DELETE policy ("Either party can
 * remove a follow request") is the actual enforcement; a requester_id that isn't actually pending
 * against this user simply matches zero rows, a harmless no-op rather than an error.
 */
export async function denyFollowRequest(requesterId: string): Promise<FollowRequestActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { error } = await supabase.from('follow_requests').delete().eq('requester_id', requesterId).eq('target_id', user.id);

  if (error) {
    return { error: "Couldn't deny that follow request." };
  }

  revalidatePath('/dashboard');
}
