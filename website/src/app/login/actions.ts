'use server';

import { redirect } from 'next/navigation';

import { escapeIlikePattern } from '@/lib/auth/username';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

export type LoginFormState = { error: string } | undefined;

// Matches Supabase's own generic invalid-credentials message as closely as practical, so an
// unknown username fails exactly the same way as a correct username with a wrong password --
// never reveals whether a given username actually exists (Docs/STATUS.md Bucket 1 item 1).
const GENERIC_LOGIN_ERROR = 'Invalid login credentials';

/**
 * Server Action backing the login form. Accepts either a username or an email in one field
 * (Docs/STATUS.md Bucket 1 item 1 -- see that entry for the full, already-decided design).
 *
 * Resolution: a value containing `@` is treated as an email and goes straight to
 * `signInWithPassword` -- this keeps existing real-email accounts (including Kayvan's own) working
 * exactly as before, no migration needed. Otherwise the value is treated as a username: looked up
 * in `user_profiles.auth_email` via the **service-role client**, since this lookup has to happen
 * before authentication and therefore can't go through the normal RLS-scoped session client (there's
 * no `auth.uid()` yet for an unauthenticated request). If no matching username is found, this
 * surfaces the same generic failure as a wrong password (`GENERIC_LOGIN_ERROR`) rather than a
 * different message that would leak whether the username exists.
 *
 * Runs entirely server-side (never trust a client-only check); the actual sign-in call still goes
 * through the session-aware client so a successful sign-in writes the session back as cookies (see
 * `createSupabaseServerClient`'s `setAll`).
 */
export async function login(_prevState: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const identifier = String(formData.get('identifier') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!identifier || !password) {
    return { error: 'Enter both a username or email and a password.' };
  }

  let email: string;

  if (identifier.includes('@')) {
    email = identifier;
  } else {
    const serviceClient = createSupabaseServiceClient();
    // ILIKE for a case-insensitive match (matching user_profiles' own `unique index on
    // lower(username)`); both ILIKE wildcards (`%`, `_`) are escaped so the identifier is matched
    // literally rather than as a pattern -- see escapeIlikePattern's doc comment for why this
    // matters here specifically (unlike signup/actions.ts's pre-check, this identifier has no
    // upstream format check that would already rule `%` out).
    const escapedIdentifier = escapeIlikePattern(identifier);
    const { data: profile, error: lookupError } = await serviceClient
      .from('user_profiles')
      .select('auth_email')
      .ilike('username', escapedIdentifier)
      .maybeSingle();

    if (lookupError || !profile) {
      return { error: GENERIC_LOGIN_ERROR };
    }

    email = profile.auth_email;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Supabase's own message (e.g. "Invalid login credentials") -- surfaced as-is rather than
    // swallowed, per the task's validation requirements. Never logged: just returned to the form.
    return { error: error.message };
  }

  redirect('/dashboard');
}
