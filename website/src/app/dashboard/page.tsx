import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';
import { AppHeader } from '@/components/AppHeader';
import { getShowRankingDisplay } from '@/lib/ranking-session';
import { ensureShowSynced } from '@/lib/shows/refreshShow';

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

interface MyShowRow {
  show_id: string;
  shows: {
    id: string;
    title: string;
    poster_url: string | null;
    tmdb_show_id: number;
    last_synced_at: string;
  } | null;
}

/**
 * Authenticated landing page: "my shows" (see `user_shows` — the design decision for tracking
 * "shows I've added", documented in `supabase/migrations/20260715010000_user_shows.sql`) plus a
 * link to search for a new one. The actual ranking flow is piece 2b's work, built on top of this.
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

  // RLS already scopes `user_shows` to this user's own rows (see the migration's policies); the
  // explicit `.eq` below is defense-in-depth, not the security boundary — `user.id` comes from the
  // revalidated session above, never from client input.
  const { data: myShowsData, error: myShowsError } = await supabase
    .from('user_shows')
    .select('show_id, shows(id, title, poster_url, tmdb_show_id, last_synced_at)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const myShows = (myShowsData ?? []) as unknown as MyShowRow[];

  // Best-effort background refresh of every tracked show's episode list from TMDB (throttled to
  // once per SYNC_STALE_AFTER_MS per show — see `ensureShowSynced`). This page doesn't display any
  // episode-derived data itself, so there's nothing to re-query afterward; it just keeps `episodes`
  // fresh for the next time the user opens one of these shows.
  await Promise.all(
    myShows
      .map((row) => row.shows)
      .filter((show): show is NonNullable<MyShowRow['shows']> => show !== null)
      .map((show) =>
        ensureShowSynced({
          tmdbShowId: show.tmdb_show_id,
          lastSyncedAt: show.last_synced_at,
        })
      )
  );

  // Per-show ranking progress for the list below — same `getShowRankingDisplay` call and the same
  // "ranked = some opinion given" convention the show detail page uses for its own progress line
  // (see `shows/[showId]/page.tsx`'s `display`/`rankedCount`/`total`/`percent`).
  const progressByShowId = new Map<string, { percent: number; rankedCount: number; total: number }>();
  await Promise.all(
    myShows
      .filter((row) => row.shows !== null)
      .map(async (row) => {
        const display = await getShowRankingDisplay(row.show_id);
        const rankedCount = display.ranked.length + (display.done ? 0 : display.coldStartPending.length);
        const total = display.done
          ? display.ranked.length
          : display.ranked.length + display.coldStartPending.length + display.unranked.length;
        if (total === 0) return;
        const percent = Math.round((rankedCount / total) * 100);
        progressByShowId.set(row.show_id, { percent, rankedCount, total });
      })
  );

  return (
    <>
      <AppHeader />
      <div className="flex flex-1 flex-col items-center gap-8 p-8">
        <div className="flex w-full max-w-2xl items-center justify-between">
          <p className="text-lg">
            Logged in as <span className="font-medium">{user.email}</span>
          </p>
          <form action={logout}>
            <button
              type="submit"
              className="rounded border border-black/20 px-4 py-2 dark:border-white/30"
            >
              Log out
            </button>
          </form>
        </div>

        <div className="flex w-full max-w-2xl flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">My shows</h1>
            <Link
              href="/shows/search"
              className="rounded bg-black px-4 py-2 text-sm text-white dark:bg-white dark:text-black"
            >
              Find a show
            </Link>
          </div>

          {myShowsError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              Couldn&apos;t load your shows: {myShowsError.message}
            </p>
          )}

          {!myShowsError && myShows.length === 0 && (
            <p className="text-sm text-black/60 dark:text-white/60">
              You haven&apos;t added any shows yet — search for one to get started.
            </p>
          )}

          {!myShowsError && myShows.length > 0 && (
            <ul className="flex flex-col gap-3">
              {myShows
                .filter((row) => row.shows !== null)
                .map((row) => {
                  const progress = progressByShowId.get(row.show_id);
                  return (
                    <li key={row.show_id}>
                      <Link
                        href={`/shows/${row.show_id}`}
                        className="flex items-center gap-3 rounded border border-black/10 p-3 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5"
                      >
                        {row.shows?.poster_url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- external TMDB CDN image.
                          <img
                            src={row.shows.poster_url}
                            alt=""
                            width={46}
                            height={69}
                            className="h-[69px] w-[46px] rounded object-cover"
                          />
                        ) : null}
                        <span className="flex flex-col gap-1">
                          <span className="font-medium">{row.shows?.title}</span>
                          {progress && (
                            <span className="flex items-center gap-2">
                              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                                <span
                                  className="block h-full rounded-full bg-black dark:bg-white"
                                  style={{ width: `${progress.percent}%` }}
                                />
                              </span>
                              <span className="text-xs text-black/60 dark:text-white/60">
                                {progress.percent}% ({progress.rankedCount}/{progress.total})
                              </span>
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
