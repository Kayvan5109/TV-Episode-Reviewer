import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';
import { AppHeader } from '@/components/AppHeader';
import { getAllStarDisplay } from '@/lib/all-star-session';
import { lookupProfileIdentitiesByUserIds } from '@/lib/profiles/profileIdentity';
import { getShowRankingDisplay, topEpisodeOf } from '@/lib/ranking-session';
import { ensureShowSynced } from '@/lib/shows/refreshShow';

import { logout } from './actions';
import { IncomingFollowRequestActions } from './IncomingFollowRequestActions';
import { TopEpisodesSection } from './TopEpisodesSection';

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

interface FollowingProfile {
  user_id: string;
  username: string;
  display_name: string | null;
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

  // "Following" section (Docs/AppSpec.md's Tier B Detailed Design — Social Layer): a plain list of
  // who this user follows, usernames linking to their profiles -- the design doc explicitly leaves
  // this widget's exact shape open ("not designing that widget in detail here since it's
  // presentation, not architecture"), so this is deliberately just a list, nothing fancier. Two
  // queries rather than one embedded join: `follows.followee_id` and `user_profiles.user_id` both
  // reference `auth.users`, not each other directly, so there's no FK path between the two tables
  // for Postgrest to auto-embed through -- same batched-lookup shape this page already uses for
  // `topEpisodeIds`/`allStarEpisodeIds` above.
  //
  // **Revised 2026-07-22** (fixes the display bug from Docs/STATUS.md's "Kayvan's hands-on testing
  // of Phase 1" History entry): previously resolved via a direct `user_profiles` query, which the
  // widened-but-still-public-or-you SELECT policy silently dropped once a followee went private --
  // the entry just vanished from this list, even though the underlying `follows` row (the actual
  // relationship) was never deleted. Now goes through `lookupProfileIdentitiesByUserIds`
  // (`@/lib/profiles/profileIdentity`), the SECURITY DEFINER safe-projection RPC that resolves ANY
  // existing user_id -- so a followed-then-gone-private user still appears here, with whatever
  // identity info is safe to show (username at minimum), instead of silently disappearing.
  const { data: followingData } = await supabase.from('follows').select('followee_id').eq('follower_id', user.id);
  const followeeIds = ((followingData ?? []) as { followee_id: string }[]).map((row) => row.followee_id);
  const followingProfiles: FollowingProfile[] = await lookupProfileIdentitiesByUserIds(followeeIds);

  // "Follow requests" section -- incoming pending requests to follow this user's (private) profile,
  // for this user to accept/deny (Docs/AppSpec.md's "Follow requests (private profiles only)"
  // feature flow: "a plain list of requesters' usernames with Accept/Deny buttons is enough, no need
  // for anything fancier" -- matches the Following list's own "keep it simple" precedent above).
  // Same batched-lookup shape as Following: `follow_requests.requester_id` isn't an FK Postgrest can
  // auto-embed `user_profiles` through, and the safe-projection RPC is what makes any requester's
  // identity resolvable here regardless of their own rankings_visibility (a request can only ever
  // come from someone requesting to follow a private profile, but the *requester's own* visibility
  // is unrelated and could be either).
  const { data: incomingRequestsData } = await supabase.from('follow_requests').select('requester_id').eq('target_id', user.id);
  const requesterIds = ((incomingRequestsData ?? []) as { requester_id: string }[]).map((row) => row.requester_id);
  const incomingRequestProfiles: FollowingProfile[] = await lookupProfileIdentitiesByUserIds(requesterIds);

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
  // That show's current #1-ranked episode id, when it has at least one comparatively-ranked
  // episode — `display.ranked` is already best-to-worst by construction (rank 1 first), so
  // `ranked[0]` is the top episode. Populated in the same loop as `progressByShowId` to avoid a
  // second pass over `getShowRankingDisplay`.
  const topEpisodeIdByShowId = new Map<string, string>();
  await Promise.all(
    myShows
      .filter((row) => row.shows !== null)
      .map(async (row) => {
        const display = await getShowRankingDisplay(row.show_id);
        const rankedCount = display.ranked.length + (display.done ? 0 : display.coldStartPending.length);
        const total = display.done
          ? display.ranked.length
          : display.ranked.length + display.coldStartPending.length + display.unranked.length;
        const topEpisodeId = topEpisodeOf(display);
        if (topEpisodeId) {
          topEpisodeIdByShowId.set(row.show_id, topEpisodeId);
        }
        if (total === 0) return;
        const percent = Math.round((rankedCount / total) * 100);
        progressByShowId.set(row.show_id, { percent, rankedCount, total });
      })
  );

  // Batched lookup of title/season for every tracked show's #1 episode, scoped to just the ids
  // collected above — one query total, not one per show (this page otherwise never touches
  // `episodes` at all; see `ensureShowSynced` above for the only other episode-adjacent work here).
  const topEpisodeIds = [...new Set(topEpisodeIdByShowId.values())];
  const topEpisodeById = new Map<string, { title: string; season_number: number }>();
  if (topEpisodeIds.length > 0) {
    const { data: topEpisodesData } = await supabase
      .from('episodes')
      .select('id, title, season_number')
      .in('id', topEpisodeIds);
    for (const episode of topEpisodesData ?? []) {
      topEpisodeById.set(episode.id, { title: episode.title, season_number: episode.season_number });
    }
  }

  // "Top Episodes" (Docs/STATUS.md Bucket 4 item 15, "All Stars Mode") — cross-show ranking of
  // every tracked show's current #1 episode. `getAllStarDisplay` runs its own reconciliation
  // (comparing the live pool against durable state) fresh on every call — see
  // `@/lib/all-star-session`'s module comment — so this always reflects any #1 changes since the
  // last time this page loaded, not a stale snapshot.
  const allStarDisplay = await getAllStarDisplay();

  // Batched lookup of show titles (for both the stale-show notice and the ranked list's "which
  // show" label) plus episode title/season/episode for the ranked list itself — scoped to just the
  // small set of ids this section actually needs, same accepted-exception pattern as
  // `topEpisodeIds` above (bounded by how many shows this user tracks, not by any single show's
  // episode count).
  const allStarShowIds = allStarDisplay.eligible
    ? [...new Set([...allStarDisplay.ranked.map((e) => e.showId), ...allStarDisplay.staleShowIds])]
    : [];
  const allStarShowTitleById = new Map<string, { title: string }>();
  if (allStarShowIds.length > 0) {
    const { data: allStarShowsData } = await supabase.from('shows').select('id, title').in('id', allStarShowIds);
    for (const show of allStarShowsData ?? []) {
      allStarShowTitleById.set(show.id, { title: show.title });
    }
  }

  const allStarEpisodeIds = allStarDisplay.eligible ? allStarDisplay.ranked.map((e) => e.episodeId) : [];
  const allStarEpisodeById = new Map<string, { title: string; season_number: number; episode_number: number }>();
  if (allStarEpisodeIds.length > 0) {
    const { data: allStarEpisodesData } = await supabase
      .from('episodes')
      .select('id, title, season_number, episode_number')
      .in('id', allStarEpisodeIds);
    for (const episode of allStarEpisodesData ?? []) {
      allStarEpisodeById.set(episode.id, {
        title: episode.title,
        season_number: episode.season_number,
        episode_number: episode.episode_number,
      });
    }
  }

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
                  const topEpisodeId = topEpisodeIdByShowId.get(row.show_id);
                  const topEpisode = topEpisodeId ? topEpisodeById.get(topEpisodeId) : undefined;
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
                              {topEpisode && (
                                <span className="text-xs text-black/60 dark:text-white/60">
                                  Best: {topEpisode.title} (S{topEpisode.season_number})
                                </span>
                              )}
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

        <div className="flex w-full max-w-2xl flex-col gap-3">
          <h2 className="text-lg font-semibold">Following</h2>
          {followingProfiles.length === 0 ? (
            <p className="text-sm text-black/60 dark:text-white/60">
              You&apos;re not following anyone yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {followingProfiles.map((profile) => (
                <li key={profile.user_id}>
                  <Link
                    href={`/u/${profile.username}`}
                    className="text-sm underline underline-offset-2"
                  >
                    {profile.display_name ?? profile.username} (@{profile.username})
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {incomingRequestProfiles.length > 0 && (
          <div className="flex w-full max-w-2xl flex-col gap-3">
            <h2 className="text-lg font-semibold">Follow requests</h2>
            <ul className="flex flex-col gap-2">
              {incomingRequestProfiles.map((profile) => (
                <li
                  key={profile.user_id}
                  className="flex items-center justify-between gap-3 rounded border border-black/10 p-3 dark:border-white/20"
                >
                  <Link href={`/u/${profile.username}`} className="text-sm underline underline-offset-2">
                    {profile.display_name ?? profile.username} (@{profile.username})
                  </Link>
                  <IncomingFollowRequestActions requesterId={profile.user_id} />
                </li>
              ))}
            </ul>
          </div>
        )}

        <TopEpisodesSection
          display={allStarDisplay}
          showTitleById={allStarShowTitleById}
          episodeById={allStarEpisodeById}
        />
      </div>
    </>
  );
}
