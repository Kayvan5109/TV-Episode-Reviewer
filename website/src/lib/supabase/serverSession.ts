/**
 * Session-aware Supabase server client factory, using the *publishable* (anon) key plus the
 * signed-in user's own auth cookies — this respects Row-Level Security as that user (see
 * `supabase/migrations`), unlike `server.ts`'s service-role client, which bypasses RLS entirely.
 *
 * Use this (not `server.ts`) from Server Components, Server Actions, and Route Handlers that need
 * to read/write data *as* the currently signed-in user (auth, and later, per-user ranking data).
 *
 * Follows `@supabase/ssr`'s current cookie-based pattern for the Next.js App Router: cookies are
 * read/written via `next/headers`' `cookies()` API, which is async in this Next.js version. The
 * library requires `getAll`/`setAll` (not the deprecated singular `get`/`set`/`remove`) — see
 * `@supabase/ssr`'s docs.
 *
 * Cookie *writes* only actually take effect from a Server Action or Route Handler; Server
 * Components can only read cookies; the `try/catch` below absorbs that and is safe as long as
 * `src/proxy.ts` is refreshing/persisting the session on navigation (which it does).
 *
 * A fresh client must be created for each request — never share one across requests/renders.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set ' +
        '(see website/.env.local.example) to create a Supabase server client.'
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component (read-only cookies) — safe to ignore since
          // `src/proxy.ts` refreshes the session cookie on every navigation instead.
        }
      },
    },
  });
}
