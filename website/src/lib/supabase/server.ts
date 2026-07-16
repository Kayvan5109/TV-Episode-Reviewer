/**
 * Server-only Supabase client factory, using the *secret* key.
 *
 * This client bypasses Row-Level Security entirely (see `supabase/README.md`) — that's exactly
 * what's needed for server-side writes to global reference data (`shows`/`episodes`), which are
 * populated by the TMDB proxy route rather than directly by users. Never import this from a
 * client component or expose its result to the browser; `SUPABASE_SECRET_KEY` must stay
 * server-only.
 *
 * This is a plain service-role client with no user session — for user-session-aware server-side
 * Supabase access (needed once Phase 1 builds real auth/data flows), use `@supabase/ssr`'s
 * cookie-based server client instead, keyed to the signed-in user's session.
 */

import { createClient } from '@supabase/supabase-js';

export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set ' +
        '(see website/.env.local.example) to create a Supabase service client.'
    );
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
