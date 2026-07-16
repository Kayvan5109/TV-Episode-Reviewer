'use server';

import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

export type SignupFormState =
  | { status: 'error'; error: string }
  | { status: 'confirmEmail' }
  | undefined;

/**
 * Server Action backing the signup form.
 *
 * Supabase's `signUp` behaves differently depending on the project's Auth setting for email
 * confirmation (Settings -> Authentication -> "Confirm email"):
 *   - If confirmation is OFF, `data.session` comes back populated — the user is signed in
 *     immediately, so this redirects straight to `/dashboard`.
 *   - If confirmation is ON (Supabase's default for new projects), `data.session` is null and
 *     `data.user` is present but unconfirmed — this returns a "check your email" state instead of
 *     redirecting, since there's no session yet to redirect into.
 * Both cases are handled here rather than assuming one; see the accompanying report for which one
 * this project's live Supabase settings actually are.
 */
export async function signup(_prevState: SignupFormState, formData: FormData): Promise<SignupFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { status: 'error', error: 'Enter both an email and a password.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    // Supabase's own message (e.g. its password-strength rule text) — surfaced as-is.
    return { status: 'error', error: error.message };
  }

  if (data.session) {
    redirect('/dashboard');
  }

  return { status: 'confirmEmail' };
}
