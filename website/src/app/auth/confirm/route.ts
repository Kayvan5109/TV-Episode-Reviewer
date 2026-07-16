import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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
 *
 * IMPORTANT: redirects are built explicitly via `NextResponse.redirect(...)` rather than calling
 * `redirect()` from `next/navigation`, and on success every cookie written by `verifyOtp`'s
 * `setAll` (via `createSupabaseServerClient`'s cookie store) is copied onto that specific response
 * object before it's returned — mirroring `src/proxy.ts`'s "cookies + response" pattern, the one
 * other place in this codebase that has to solve the same "attach cookies set mid-request onto a
 * manually built response" problem, and which is known to work. This was done after a real
 * hands-on bug: clicking a real confirmation link landed the user back on `/login` with no
 * session, even though `verifyOtp()` had already succeeded server-side (confirmed by a follow-up
 * manual login succeeding immediately, with no "email not confirmed" error) — meaning the session
 * cookies weren't reliably reaching the browser via `redirect('/dashboard')`. See `Docs/STATUS.md`
 * for this fix's history and what still needs hands-on re-verification via a real email
 * click-through (a Route Handler's cookie/redirect behavior can't be fully proven from unit tests
 * alone).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL('/login?error=confirmation-link-invalid', request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    return NextResponse.redirect(new URL('/login?error=confirmation-failed', request.url));
  }

  const response = NextResponse.redirect(new URL('/dashboard', request.url));

  // Re-read the same request-scoped cookie store `createSupabaseServerClient` just wrote the new
  // session into (calling `cookies()` again returns the same underlying store, not a fresh copy —
  // see `src/lib/supabase/serverSession.ts`), and copy every cookie onto *this* response object
  // directly rather than trusting that `next/navigation`'s `redirect()` would have done so itself.
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    response.cookies.set(cookie);
  }

  return response;
}
