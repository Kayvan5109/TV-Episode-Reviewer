import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AppHeader } from '@/components/AppHeader';
import { lookupProfileIdentityByUsername } from '@/lib/profiles/profileIdentity';
import { resolveProfileView } from '@/lib/profiles/resolveProfileView';
import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

import { FollowButton } from './FollowButton';
import { FollowRequestButton } from './FollowRequestButton';

// Session-dependent (auth guard) and reads per-viewer follow state -- never statically cached, same
// reasoning as every other authenticated page in this app.
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return { title: `${username} — Episode Ranker` };
}

interface FollowCountsRow {
  follower_count: number;
  following_count: number;
}

/**
 * Public profile page (Docs/AppSpec.md's Tier B Detailed Design — Social Layer). Displays identity
 * (username, display name, follower/following counts) and a Follow/Unfollow/Request-to-follow
 * control -- only the rankings/comparison data stays hidden for a private profile (there's no page
 * that shows another user's rankings yet, for anyone, so nothing functional changes there).
 *
 * **Revised 2026-07-22** (see this build's task brief, and `Docs/AppSpec.md`'s "Follow requests"
 * feature flow, for the full reasoning): a private profile is now identifiable, not a 404 --
 * `lookupProfileIdentityByUsername` (`@/lib/profiles/profileIdentity`) resolves ANY existing
 * username via a SECURITY DEFINER "safe projection" function, bypassing `user_profiles`' own
 * public-or-your-own-row SELECT policy entirely for this one narrow, safe-columns-only purpose. A
 * **genuinely nonexistent** username still 404s -- `resolveProfileView` now treats `null` from that
 * lookup as exactly that (see its own doc comment for the history of what `null` used to mean here).
 *
 * Following a public profile is still instant (`FollowButton`, unchanged). Following a private
 * profile now goes through a request/accept flow (`FollowRequestButton`) -- unless the viewer is
 * already an accepted follower (a `follows` row already exists, e.g. because the target was public
 * when the viewer followed and has since gone private), in which case the existing
 * Following/Unfollow state is shown instead, exactly as for a public profile -- an existing accepted
 * follower is never asked to re-request.
 *
 * Requires sign-in (unlike Tier B's later `/c/[shareToken]` collections page, which is deliberately
 * the app's first unauthenticated route) -- every RLS policy and RPC here is scoped `to
 * authenticated`, so an anonymous request would get nothing back from Supabase even without this
 * explicit redirect; the redirect just makes that an intentional, readable behavior instead of an
 * accidental empty page.
 */
export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // SECURITY DEFINER RPC -- returns the safe identity columns for ANY existing username, regardless
  // of rankings_visibility, and nothing for a genuinely nonexistent one. See the migration's and this
  // function's own doc comments for why this replaces the old direct `user_profiles` query here.
  const profileData = await lookupProfileIdentityByUsername(username);

  const view = resolveProfileView(profileData, user.id);

  if (!view.found) {
    notFound();
  }

  const { profile, isOwnProfile } = view;

  // SECURITY DEFINER RPC -- returns only the two aggregate counts, never a row of `follows` itself
  // (see the migration's `follow_counts` doc comment for the full reasoning). Widened 2026-07-22 to
  // return counts for any existing profile, not just public-or-you -- private profiles show counts
  // too now, per the updated design.
  const { data: countsRows } = await supabase.rpc('follow_counts', { target_user_id: profile.user_id });
  const counts = (countsRows as FollowCountsRow[] | null)?.[0] ?? { follower_count: 0, following_count: 0 };

  // Only relevant when some follow control will actually render (not your own profile) -- `follows`'
  // own SELECT policy already lets the caller read rows where they're the follower, so this is a
  // normal RLS-scoped read, not a special case.
  let isFollowing = false;
  let hasPendingRequest = false;
  if (!isOwnProfile) {
    const { data: followRow } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('follower_id', user.id)
      .eq('followee_id', profile.user_id)
      .maybeSingle();
    isFollowing = followRow !== null;

    // Only meaningful for a private target you're not already following -- an already-accepted
    // follower never sees the request flow (see this page's own doc comment), and a public target
    // never has a follow_requests row to begin with (its own INSERT policy forbids that).
    if (!isFollowing && profile.rankings_visibility === 'private') {
      const { data: requestRow } = await supabase
        .from('follow_requests')
        .select('requester_id')
        .eq('requester_id', user.id)
        .eq('target_id', profile.user_id)
        .maybeSingle();
      hasPendingRequest = requestRow !== null;
    }
  }

  return (
    <>
      <AppHeader />
      <div className="flex flex-1 flex-col items-center gap-6 p-8">
        <div className="flex w-full max-w-sm flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold">{profile.display_name ?? profile.username}</h1>
            <p className="text-sm text-black/60 dark:text-white/60">@{profile.username}</p>
            {profile.rankings_visibility === 'private' && !isOwnProfile && (
              <p className="text-xs text-black/50 dark:text-white/50">This account is private.</p>
            )}
          </div>

          <div className="flex gap-4 text-sm">
            <span>
              <span className="font-medium">{counts.follower_count}</span>{' '}
              {counts.follower_count === 1 ? 'follower' : 'followers'}
            </span>
            <span>
              <span className="font-medium">{counts.following_count}</span> following
            </span>
          </div>

          {isOwnProfile ? (
            <Link href="/settings" className="text-sm underline underline-offset-2">
              Edit your profile
            </Link>
          ) : isFollowing || profile.rankings_visibility === 'public' ? (
            <FollowButton username={profile.username} initialIsFollowing={isFollowing} />
          ) : (
            <FollowRequestButton username={profile.username} initialHasPendingRequest={hasPendingRequest} />
          )}
        </div>
      </div>
    </>
  );
}
