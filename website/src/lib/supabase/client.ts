/**
 * Browser/client-component Supabase client factory.
 *
 * Uses the publishable (anon) key, which is safe to ship to the browser — RLS policies (see
 * `supabase/migrations`) are what keep this client from reading/writing another user's data, not
 * secrecy of this key. Call this from client components once auth/data UI exists (Phase 1) —
 * nothing in Phase 0 uses it yet.
 */

import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set ' +
        '(see website/.env.local.example) to create a Supabase browser client.'
    );
  }

  return createBrowserClient(url, publishableKey);
}
