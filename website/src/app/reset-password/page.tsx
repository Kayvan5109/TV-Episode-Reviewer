import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

import { ResetPasswordForm } from './ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Reset your password — Episode Ranker',
};

// Session-dependent (auth guard below) — never statically cached. See `src/app/dashboard/page.tsx`
// for the same reasoning.
export const dynamic = 'force-dynamic';

/**
 * "Set a new password" screen — the landing page after clicking a password-recovery email link.
 * Reachable only via the temporary recovery session `src/proxy.ts`'s `handleCodeExchange`
 * (`type=recovery` branch) establishes via cookies right before redirecting here.
 *
 * Does its own authoritative session check (via `getUser()`, matching every other authenticated
 * page in this app — e.g. `src/app/dashboard/page.tsx`, `src/app/shows/[showId]/page.tsx`) rather
 * than trusting that a request only ever reaches here via a valid recovery redirect: `/reset-
 * password` is not in `src/proxy.ts`'s `PROTECTED_ROUTES`, so someone navigating here directly
 * with no session at all must still see a clear redirect rather than a broken form bound to no
 * session.
 */
export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Set a new password</h1>
      <ResetPasswordForm />
    </div>
  );
}
