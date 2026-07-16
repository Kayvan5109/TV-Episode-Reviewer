'use server';

import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

export type LoginFormState = { error: string } | undefined;

/**
 * Server Action backing the login form. Runs entirely server-side (never trust a client-only
 * check), using the session-aware Supabase client so a successful sign-in writes the session back
 * as cookies (see `createSupabaseServerClient`'s `setAll`).
 */
export async function login(_prevState: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Enter both an email and a password.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Supabase's own message (e.g. "Invalid login credentials") — surfaced as-is rather than
    // swallowed, per the task's validation requirements. Never logged: just returned to the form.
    return { error: error.message };
  }

  redirect('/dashboard');
}
