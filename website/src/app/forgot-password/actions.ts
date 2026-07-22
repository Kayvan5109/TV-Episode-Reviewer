'use server';

import { escapeIlikePattern } from '@/lib/auth/username';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

export type ForgotPasswordFormState =
  | { status: 'error'; error: string }
  | { status: 'sent' }
  | { status: 'noRecovery' }
  | undefined;

/**
 * Server Action backing the "forgot your password" form. Accepts either a username or an email
 * (Docs/STATUS.md Bucket 1 item 1 -- see that entry for the full, already-decided design), using
 * the same `@`-detection resolution as `login/actions.ts`.
 *
 * Security note: for an email, never reveal whether it actually has an account -- unchanged from
 * before. Supabase's own `resetPasswordForEmail` already fails silently (no `error`) for an unknown
 * email for exactly this reason, so a real Supabase-side error from that call means something else
 * went wrong (e.g. rate limiting), not "no such account." **That privacy property deliberately does
 * NOT extend to the username case** -- the user necessarily already knows their own username to
 * have typed it correctly, so an unrecognized username surfaces its own distinct error rather than
 * a misleading generic "sent" state.
 *
 * A username that resolves to an account with no real email on file (`has_real_email: false`, i.e.
 * every account created by the current username+password signup flow, since the "add an email"
 * flow doesn't exist yet) has no recovery path at all -- returns a distinct `noRecovery` state with
 * a message describing the still-to-be-built "add an email" account-page flow as a future
 * capability, per the already-decided design.
 */
export async function forgotPassword(
  _prevState: ForgotPasswordFormState,
  formData: FormData
): Promise<ForgotPasswordFormState> {
  const identifier = String(formData.get('identifier') ?? '').trim();

  if (!identifier) {
    return { status: 'error', error: 'Enter your username or email address.' };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    return { status: 'error', error: 'Password reset is not available right now. Please try again later.' };
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
      .select('auth_email, has_real_email')
      .ilike('username', escapedIdentifier)
      .maybeSingle();

    if (lookupError || !profile) {
      // Deliberately specific, unlike the email branch's silent "sent" fallback -- see the doc
      // comment above for why this privacy property doesn't apply to the username case.
      return { status: 'error', error: 'No account found with that username.' };
    }

    if (!profile.has_real_email) {
      return { status: 'noRecovery' };
    }

    email = profile.auth_email;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: siteUrl });

  if (error) {
    // Supabase's own message — surfaced as-is (see the doc comment above for why this branch is
    // safe to be specific in: `resetPasswordForEmail` never reaches here just because the email is
    // unknown, it already swallows that case as a non-error).
    return { status: 'error', error: error.message };
  }

  return { status: 'sent' };
}
