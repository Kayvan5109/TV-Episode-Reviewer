'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { isValidUsername } from '@/lib/auth/username';
import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

export type UpdateProfileState = { status: 'error'; error: string } | { status: 'success' } | undefined;

export type ClaimUsernameState = { status: 'error'; error: string } | { status: 'success' } | undefined;

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
 * Server Action backing `/settings` (Docs/AppSpec.md's Tier B Detailed Design — Social Layer, Phase
 * 1 of the build). Lets the signed-in user edit `display_name` and toggle `rankings_visibility`.
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

  revalidatePath('/settings');
  return { status: 'success' };
}

/**
 * Server Action backing `/settings`'s "claim your username" form -- shown instead of the edit form
 * when the signed-in user has no `user_profiles` row at all (Docs/STATUS.md's Tier B Phase 1 history:
 * every account created via the *new* username+password signup flow gets a row automatically, but
 * accounts that predate `user_profiles` -- created via the old email+password flow, before this table
 * existed -- have none. The original design decision when username+password signup shipped was
 * "existing accounts keep working by email, username stays nullable, settable later via settings
 * whenever convenient" -- this is that "later" path, finally implemented).
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

  revalidatePath('/settings');
  return { status: 'success' };
}
