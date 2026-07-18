'use server';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

export type ForgotPasswordFormState = { status: 'error'; error: string } | { status: 'sent' } | undefined;

/**
 * Server Action backing the "forgot your password" form. Uses the session-aware Supabase client
 * (matching `login/actions.ts` — see that file's comment: this call doesn't need to be signed in,
 * but there's no separate "unauthenticated-only" client in this codebase, so the same one is used).
 *
 * Security note: never reveal whether `email` actually has an account. Supabase's own
 * `resetPasswordForEmail` already fails silently (no `error`) for an unknown email for exactly this
 * reason, so a real Supabase-side error here means something else went wrong (e.g. rate limiting),
 * not "no such account" — that's the one case surfaced as-is; everything else gets the same generic
 * "sent" state regardless of whether an email actually went out.
 */
export async function forgotPassword(
  _prevState: ForgotPasswordFormState,
  formData: FormData
): Promise<ForgotPasswordFormState> {
  const email = String(formData.get('email') ?? '').trim();

  if (!email) {
    return { status: 'error', error: 'Enter an email address.' };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    return { status: 'error', error: 'Password reset is not available right now. Please try again later.' };
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
