import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AppHeader } from '@/components/AppHeader';
import { escapeIlikePattern } from '@/lib/auth/username';
import { resolveProfileView, type ProfileRow } from '@/lib/profiles/resolveProfileView';
import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

import { FollowButton } from './FollowButton';

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
 * Public profile page (Docs/AppSpec.md's Tier B Detailed Design — Social Layer, Phase 1 of the
 * build): display name/username, follower/following counts, and a Follow/Unfollow button.
 *
 * **A real information-disclosure decision, already made** (see this build's task brief): visiting
 * this page for a username that doesn't exist at all, and visiting it for a username that exists but
 * is private, MUST render identically -- a generic "profile not found" -- so this page never learns
 * which case it's in. That falls naturally out of `user_profiles`' widened SELECT policy (see
 * `supabase/migrations/20260722010000_follows_and_profile_settings.sql`): the query below only
 * returns a row when it's public, or it's the signed-in viewer's own row -- a private-and-not-mine
 * row and a genuinely nonexistent row both come back as `null`, indistinguishably. `resolveProfileView`
 * (`@/lib/profiles/resolveProfileView`) makes that single code path explicit and unit-testable; there
 * is no `if (private) {...} else if (nonexistent) {...}` branch anywhere in this file.
 *
 * Requires sign-in (unlike Tier B's later `/c/[shareToken]` collections page, which is deliberately
 * the app's first unauthenticated route) -- every `follows`/widened `user_profiles` RLS policy here
 * is scoped `to authenticated`, so an anonymous request would get nothing back from Supabase even
 * without this explicit redirect; the redirect just makes that an intentional, readable behavior
 * instead of an accidental empty page.
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

  // Case-insensitive, wildcard-escaped match against the same `unique index on lower(username)`
  // login/signup/settings all key off -- see `escapeIlikePattern`'s doc comment for why the
  // escaping matters for a raw URL segment.
  const { data: profileData } = await supabase
    .from('user_profiles')
    .select('user_id, username, display_name, rankings_visibility')
    .ilike('username', escapeIlikePattern(username))
    .maybeSingle();

  const view = resolveProfileView(profileData as ProfileRow | null, user.id);

  if (!view.found) {
    notFound();
  }

  const { profile, isOwnProfile } = view;

  // SECURITY DEFINER RPC -- returns only the two aggregate counts, never a row of `follows` itself
  // (see the migration's `follow_counts` doc comment for the full reasoning, including why it
  // independently re-checks visibility rather than trusting that this page already did).
  const { data: countsRows } = await supabase.rpc('follow_counts', { target_user_id: profile.user_id });
  const counts = (countsRows as FollowCountsRow[] | null)?.[0] ?? { follower_count: 0, following_count: 0 };

  // Only relevant when the button will actually render (not your own profile) -- `follows`' own
  // SELECT policy already lets the caller read rows where they're the follower, so this is a normal
  // RLS-scoped read, not a special case.
  let isFollowing = false;
  if (!isOwnProfile) {
    const { data: followRow } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('follower_id', user.id)
      .eq('followee_id', profile.user_id)
      .maybeSingle();
    isFollowing = followRow !== null;
  }

  return (
    <>
      <AppHeader />
      <div className="flex flex-1 flex-col items-center gap-6 p-8">
        <div className="flex w-full max-w-sm flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold">{profile.display_name ?? profile.username}</h1>
            <p className="text-sm text-black/60 dark:text-white/60">@{profile.username}</p>
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
          ) : (
            <FollowButton username={profile.username} initialIsFollowing={isFollowing} />
          )}
        </div>
      </div>
    </>
  );
}
