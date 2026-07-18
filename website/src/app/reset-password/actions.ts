'use server';

import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

export type ResetPasswordFormState = { error: string } | undefined;

/**
 * Server Action backing the "set a new password" form. Relies on the temporary recovery session
 * `src/proxy.ts`'s `handleCodeExchange` (`type=recovery` branch) already established via cookies
 * before the user ever lands on `/reset-password` — `updateUser({ password })` needs an
 * authenticated context, which is exactly what that session provides. The page component itself
 * (`page.tsx`) already guards against there being no session at all before this form is even shown.
 */
export async function resetPassword(
  _prevState: ResetPasswordFormState,
  formData: FormData
): Promise<ResetPasswordFormState> {
  const password = String(formData.get('password') ?? '');

  if (!password) {
    return { error: 'Enter a new password.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    // Supabase's own message (e.g. its password-strength rule text, or a stale/expired recovery
    // session) — surfaced as-is, matching `login/actions.ts` and `signup/actions.ts`.
    return { error: error.message };
  }

  // The recovery session established by proxy.ts is now a normal signed-in session — the user is
  // both password-reset and signed in, so this goes straight to /dashboard rather than back to
  // /login.
  redirect('/dashboard');
}
