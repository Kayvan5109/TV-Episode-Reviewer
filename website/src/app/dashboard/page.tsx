import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

import { logout } from './actions';

export const metadata: Metadata = {
  title: 'Dashboard — Episode Ranker',
};

// This page reads the caller's session on every request (via `createSupabaseServerClient`) and
// must never be served from a static/prerendered cache — one user's "logged in as" placeholder
// must never be shown to another. `force-dynamic` also sidesteps a build-time footgun: without it,
// `next build`'s static-generation pass would try to render this page with no request present,
// throwing our own "env vars missing"/"no session" errors as build failures instead of leaving the
// page to render per-request.
export const dynamic = 'force-dynamic';

/**
 * Placeholder authenticated landing area — Phase 1's auth-only scope stops here. The real
 * dashboard content (show search, ranking flows) is the next piece of work, built on top of this.
 *
 * This page does its own authoritative session check (via `getUser()`, which revalidates against
 * Supabase Auth) rather than relying solely on `src/proxy.ts`'s optimistic cookie check — Next.js's
 * authentication guide is explicit that Proxy alone isn't a sufficient guard for a protected route.
 */
export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <p className="text-lg">
        You&apos;re logged in as <span className="font-medium">{user.email}</span>
      </p>
      <form action={logout}>
        <button type="submit" className="rounded border border-black/20 px-4 py-2 dark:border-white/30">
          Log out
        </button>
      </form>
    </div>
  );
}
