import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

import { ShowSearchForm } from './ShowSearchForm';

export const metadata: Metadata = {
  title: 'Find a show — Episode Ranker',
};

// Same reasoning as `/dashboard`: this page's content depends on the caller's session, so it must
// never be served from a static/prerendered cache, and must not be rendered at build time (no
// request/session exists then).
export const dynamic = 'force-dynamic';

/**
 * Show search page: pick a TMDB show to import and add to your list. Authoritative session check
 * (via `getUser()`, not just `src/proxy.ts`'s optimistic cookie check) since this page leads
 * directly into a mutation (the "Add show" Server Action).
 */
export default async function ShowSearchPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Find a show</h1>
      <ShowSearchForm />
    </div>
  );
}
