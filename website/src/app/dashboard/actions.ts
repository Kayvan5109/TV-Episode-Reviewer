'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { resetAllStarRanking } from '@/lib/all-star-session';
import { isValidUsername } from '@/lib/auth/username';
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

export type UpdateProfileState = { status: 'error'; error: string } | { status: 'success' } | undefined;

export type ClaimUsernameState = { status: 'error'; error: string } | { status: 'success' } | undefined;

export type UpdateAvatarState = { status: 'error'; error: string } | { status: 'success' };

const DISPLAY_NAME_MAX_LENGTH = 40;

const USERNAME_TAKEN_ERROR = 'That username is already taken. Please choose another.';

// Postgres SQLSTATE for a unique-constraint violation -- what user_profiles_username_lower_idx (the
// existing unique index on lower(username), from supabase/migrations/20260722000000_user_profiles.sql)
// raises when two claims race for the same username. Checked specifically (rather than treating any
// insert error as a race, the way signup/actions.ts does after its own pre-check) because
// claimUsername below has no pre-check to have already ruled out other failure modes -- a non-race
// error (e.g. a rejected RLS policy) should surface as-is, not get mislabeled "username taken".
const UNIQUE_VIOLATION_CODE = '23505';

/**
 * Server Action backing `/dashboard`'s profile section (Docs/AppSpec.md's Tier B Detailed Design —
 * Social Layer, Phase 1 of the build; moved here from `/settings` when the two pages were merged
 * into one "My Profile" page -- see Docs/STATUS.md's dated entry for that merge). Lets the signed-in
 * user edit `display_name` and toggle `rankings_visibility`.
 *
 * Uses the session-aware client, not the service-role client -- unlike signup's account creation,
 * this is a normal per-user write, and `user_profiles` now has an UPDATE policy scoped to
 * `user_id = auth.uid()` (see `supabase/migrations/20260722010000_follows_and_profile_settings.sql`)
 * specifically so this can work without one. The explicit `.eq('user_id', user.id)` below is
 * defense-in-depth on top of that policy, matching this codebase's existing convention (e.g.
 * `removeShow` in `@/app/shows/[showId]/actions.ts`) of never relying on RLS alone when the caller
 * already has the authoritative id in hand.
 *
 * Deliberately does NOT accept a `username` field -- changing your username after signup is not
 * designed anywhere in the Tier B doc (it's set once, at signup) and is explicitly out of scope for
 * this build.
 */
export async function updateProfile(
  _prevState: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const rawDisplayName = String(formData.get('display_name') ?? '').trim();
  const visibility = String(formData.get('rankings_visibility') ?? '');

  if (visibility !== 'private' && visibility !== 'public') {
    return { status: 'error', error: 'Invalid visibility value.' };
  }

  if (rawDisplayName.length > DISPLAY_NAME_MAX_LENGTH) {
    return {
      status: 'error',
      error: `Display name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`,
    };
  }

  // An empty submission clears display_name back to null, which falls back to the username
  // elsewhere in the app (per AppSpec.md's Tier B `user_profiles` note: "falls back to username if
  // unset").
  const displayName = rawDisplayName.length > 0 ? rawDisplayName : null;

  const { error } = await supabase
    .from('user_profiles')
    .update({ display_name: displayName, rankings_visibility: visibility })
    .eq('user_id', user.id);

  if (error) {
    return { status: 'error', error: error.message };
  }

  revalidatePath('/dashboard');
  return { status: 'success' };
}

/**
 * Server Action backing `/dashboard`'s "claim your username" form -- shown instead of the profile
 * header/edit form when the signed-in user has no `user_profiles` row at all (Docs/STATUS.md's Tier
 * B Phase 1 history: every account created via the *new* username+password signup flow gets a row
 * automatically, but accounts that predate that table -- created via the old email+password flow,
 * before this table existed -- have none. The original design decision when username+password
 * signup shipped was "existing accounts keep working by email, username stays nullable, settable
 * later via settings whenever convenient" -- this is that "later" path, finally implemented).
 *
 * Uses the session-aware client, not the service-role client -- this is a normal per-user write, and
 * `user_profiles` now has an INSERT policy scoped to `user_id = auth.uid()` (see
 * `supabase/migrations/20260722020000_user_profiles_insert_policy.sql`) specifically so this can work
 * without one, matching `updateProfile`'s own reasoning above.
 *
 * Unlike a synthetic-email signup account (see signup/actions.ts), a legacy account claiming a
 * username here already has a real, reachable email on `auth.users.email` -- every pre-existing
 * account was created through the old email+password flow, and no phone auth exists in this app. So
 * the new row is created with that real email as `auth_email` and `has_real_email: true` (NOT the
 * `false` default a synthetic-email signup account gets) -- this is what makes forgot-password
 * correctly offer real recovery for these accounts once claimed, instead of the "no recovery
 * available" message meant for synthetic-email-only accounts.
 *
 * Race safety: two concurrent claims for the same username are caught by user_profiles' own unique
 * index on lower(username) (see UNIQUE_VIOLATION_CODE above) -- surfaced as a clean "taken" error.
 * Unlike signup's flow, there's no auth account to roll back here: claimUsername never creates an
 * `auth.users` row (the user is already signed in), only a `user_profiles` row, so a failed claim
 * just means the user retries with a different username -- nothing to undo.
 */
export async function claimUsername(
  _prevState: ClaimUsernameState,
  formData: FormData
): Promise<ClaimUsernameState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const username = String(formData.get('username') ?? '').trim();

  if (!isValidUsername(username)) {
    return {
      status: 'error',
      error: 'Usernames must be 3-20 characters, using only letters, numbers, and underscores.',
    };
  }

  if (!user.email) {
    // Not expected in practice -- every account old enough to be missing a user_profiles row was
    // created via the old email+password flow, which requires an email. Defensive only.
    return { status: 'error', error: 'Something went wrong. Please try again.' };
  }

  const { error } = await supabase.from('user_profiles').insert({
    user_id: user.id,
    username,
    auth_email: user.email,
    has_real_email: true,
    rankings_visibility: 'private',
  });

  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) {
      return { status: 'error', error: USERNAME_TAKEN_ERROR };
    }
    return { status: 'error', error: error.message };
  }

  revalidatePath('/dashboard');
  return { status: 'success' };
}

/**
 * Server Action backing `/dashboard`'s avatar upload control (`./AvatarUploadForm.tsx`). Called
 * directly from the client component as a normal async function (not wired through
 * `useActionState`/`<form action>`, since the actual upload -- `supabase.storage.from('avatars')
 * .upload(...)` -- has to happen client-side via the browser Supabase client; this action only
 * persists the resulting public URL onto `user_profiles.avatar_url` once that upload has already
 * succeeded).
 *
 * Deliberately does NOT touch Supabase Storage itself -- by the time this is called, the file is
 * already uploaded (the object-level RLS on `storage.objects`, restricted to a
 * `{auth.uid()}/...` path prefix -- see
 * `supabase/migrations/20260723010000_account_page_visibility.sql` -- is what actually enforced that
 * only the signed-in user could write to their own folder; this action just needs to trust the URL
 * it's given came from a real upload this same session performed, which is why it re-derives the
 * signed-in user itself rather than accepting one).
 *
 * Uses the session-aware client, not the service-role client -- same reasoning as `updateProfile`
 * above: a normal per-user write, backed by `user_profiles`' existing `user_id = auth.uid()` UPDATE
 * policy, with the explicit `.eq('user_id', user.id)` below as defense-in-depth on top of it.
 *
 * Only a minimal shape check on `avatarUrl` (non-empty string) -- the real validation (file type,
 * size cap) already happened client-side in `AvatarUploadForm` before the upload was even attempted;
 * this action has no way to re-validate an already-uploaded object's contents anyway.
 */
export async function updateAvatar(avatarUrl: string): Promise<UpdateAvatarState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  if (typeof avatarUrl !== 'string' || avatarUrl.trim().length === 0) {
    return { status: 'error', error: 'Invalid avatar URL.' };
  }

  const { error } = await supabase.from('user_profiles').update({ avatar_url: avatarUrl }).eq('user_id', user.id);

  if (error) {
    return { status: 'error', error: error.message };
  }

  revalidatePath('/dashboard');
  return { status: 'success' };
}
