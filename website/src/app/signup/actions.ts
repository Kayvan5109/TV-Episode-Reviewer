'use server';

import { redirect } from 'next/navigation';

import { isValidUsername, syntheticEmailForUsername } from '@/lib/auth/username';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

export type SignupFormState = { status: 'error'; error: string } | undefined;

const USERNAME_TAKEN_ERROR = 'That username is already taken. Please choose another.';

/**
 * Server Action backing the signup form. Username+password signup (Docs/STATUS.md Bucket 1 item 1
 * -- see that entry and Docs/AppSpec.md's Tier B `user_profiles` note for the full, already-decided
 * design; this is just the implementation).
 *
 * Supabase Auth has no native username-only signup -- it's fundamentally email-based. The
 * workaround: generate a synthetic, unreachable email from the username
 * (`{username}@users.episode-ranker.internal`, see lib/auth/username.ts) and create the account via
 * the **Admin API** (`auth.admin.createUser`, service-role client) rather than the regular client
 * `signUp()`. This matters because this project's live Supabase settings have "Confirm email" ON --
 * a plain client-side `signUp()` to an unreachable synthetic address would leave the account
 * permanently stuck unconfirmed, since the confirmation email can never arrive. `admin.createUser`
 * with `email_confirm: true` marks the account confirmed immediately regardless of that
 * project-wide setting, bypassing it only for these synthetic accounts. `admin.createUser` is a
 * service-role operation and does NOT itself establish a browser session, so this action follows up
 * with a normal `signInWithPassword` via the session-aware client to actually log the user in --
 * same ending as before: redirect to `/dashboard`.
 *
 * Race-safe creation sequence (see the numbered steps below): an optimistic pre-check catches the
 * common "username taken" case before any auth account is created at all, but the *real* guarantee
 * against a race (two signups for the same username landing between the pre-check and the insert)
 * is `user_profiles`' own `unique index on lower(username)` -- if the insert fails because someone
 * else won the race, the just-created auth account is rolled back via `admin.deleteUser` so it never
 * becomes an orphaned, profile-less account.
 */
export async function signup(_prevState: SignupFormState, formData: FormData): Promise<SignupFormState> {
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!username || !password) {
    return { status: 'error', error: 'Enter both a username and a password.' };
  }

  if (!isValidUsername(username)) {
    return {
      status: 'error',
      error: 'Usernames must be 3-20 characters, using only letters, numbers, and underscores.',
    };
  }

  const serviceClient = createSupabaseServiceClient();

  // Step 1: optimistic pre-check -- no auth account created yet. ILIKE is used for a
  // case-insensitive match (matching the DB's own `unique index on lower(username)`); the
  // username's charset is already constrained to [a-zA-Z0-9_] by the check above, so the only
  // ILIKE wildcard character that can appear is `_`, escaped here so it's matched literally rather
  // than as an "any single character" pattern.
  const escapedUsername = username.replace(/_/g, '\\_');
  const { data: existingProfile, error: lookupError } = await serviceClient
    .from('user_profiles')
    .select('user_id')
    .ilike('username', escapedUsername)
    .maybeSingle();

  if (lookupError) {
    return { status: 'error', error: 'Something went wrong. Please try again.' };
  }

  if (existingProfile) {
    return { status: 'error', error: USERNAME_TAKEN_ERROR };
  }

  // Step 2: create the auth account server-side via the Admin API.
  const syntheticEmail = syntheticEmailForUsername(username);
  const { data: createdUser, error: createUserError } = await serviceClient.auth.admin.createUser({
    email: syntheticEmail,
    password,
    email_confirm: true,
  });

  if (createUserError) {
    // Supabase's own error message (e.g. its password-strength rule text) -- surfaced as-is,
    // matching this file's existing convention.
    return { status: 'error', error: createUserError.message };
  }

  const userId = createdUser.user.id;

  // Step 3: insert the user_profiles row.
  const { error: profileInsertError } = await serviceClient.from('user_profiles').insert({
    user_id: userId,
    username,
    auth_email: syntheticEmail,
    has_real_email: false,
    rankings_visibility: 'private',
  });

  if (profileInsertError) {
    // Step 4: a genuine race -- someone else's insert won between the pre-check and here. Roll
    // back the just-created auth account so it doesn't become an orphaned, profile-less account.
    await serviceClient.auth.admin.deleteUser(userId);
    return { status: 'error', error: USERNAME_TAKEN_ERROR };
  }

  // Step 5: establish the actual browser session via the normal session-aware client, then finish
  // exactly like today's flow. The account already exists at this point even if this sign-in call
  // somehow fails (e.g. a transient error) -- not rolled back, since the account itself is valid
  // and complete; the user could still log in normally afterward from the login page.
  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: syntheticEmail,
    password,
  });

  if (signInError) {
    return { status: 'error', error: signInError.message };
  }

  redirect('/dashboard');
}
