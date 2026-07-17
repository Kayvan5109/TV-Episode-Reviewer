'use server';

import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

/**
 * App-wide Server Action (not page-specific, unlike the other `actions.ts` files under
 * `src/app/**`) since sign-out is invoked from `AppHeader`, which is shared across every
 * authenticated page rather than belonging to any one route.
 *
 * Uses the session-aware Supabase client (never the service-role client) so the sign-out is
 * scoped to the current user's session and clears their auth cookies via `setAll` — see
 * `createSupabaseServerClient`.
 */
export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  redirect('/login');
}
