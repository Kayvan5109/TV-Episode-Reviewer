import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';
import type { EmailOtpType } from '@supabase/supabase-js';

// Always runs per-request (reads query params and mutates the session cookie) — never cached or
// statically generated. See `src/app/dashboard/page.tsx` for the same reasoning.
export const dynamic = 'force-dynamic';

/**
 * Handles Supabase's email-confirmation link for signup (and other OTP-email flows).
 *
 * This uses the `token_hash` + `verifyOtp` pattern Supabase currently recommends for SSR apps,
 * rather than the old `{{ .ConfirmationURL }}` (which points straight at the Supabase Auth server
 * and doesn't cleanly hand a session back to this app). For this route to actually receive
 * `token_hash`/`type` query params, the confirmation email template must link here — see this
 * agent's report for the exact template change needed in the Supabase dashboard (Auth -> Email
 * Templates -> "Confirm signup"), since that's a dashboard setting this code can't change.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  if (!tokenHash || !type) {
    redirect('/login?error=confirmation-link-invalid');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    redirect('/login?error=confirmation-failed');
  }

  redirect('/dashboard');
}
