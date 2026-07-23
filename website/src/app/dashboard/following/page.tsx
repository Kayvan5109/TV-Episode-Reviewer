import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppHeader } from '@/components/AppHeader';
import { lookupProfileIdentitiesByUserIds } from '@/lib/profiles/profileIdentity';
import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

export const metadata: Metadata = {
  title: 'Following — Episode Ranker',
};

// Session-dependent (auth guard, own-row follow list) -- never statically cached, same reasoning as
// every other authenticated page in this app.
export const dynamic = 'force-dynamic';

/**
 * Plain list of who the signed-in user follows (the click-through target for the "following" count
 * on `/dashboard`'s profile header -- see Docs/STATUS.md's dated entry for the `/dashboard` +
 * `/settings` merge that introduced this page). Scoped via `.eq('follower_id', user.id)`, fully
 * covered by `follows`' own SELECT policy ("Users can read their own follow relationships",
 * `follower_id = auth.uid() OR followee_id = auth.uid()`) -- no new RLS needed.
 *
 * Identity is resolved via `lookupProfileIdentitiesByUserIds` (`@/lib/profiles/profileIdentity`),
 * the same SECURITY DEFINER safe-projection RPC `/dashboard`'s own "Following" list already uses --
 * so a private followee still shows up here with their real username/avatar, not hidden or broken.
 * This page is a fuller, dedicated version of that same list (with avatars); `/dashboard` keeps its
 * own inline "Following" list too -- see that page's doc comment for why both exist.
 */
export default async function FollowingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data } = await supabase.from('follows').select('followee_id').eq('follower_id', user.id);
  const followeeIds = ((data ?? []) as { followee_id: string }[]).map((row) => row.followee_id);
  const profiles = await lookupProfileIdentitiesByUserIds(followeeIds);

  return (
    <>
      <AppHeader />
      <div className="flex flex-1 flex-col items-center gap-6 p-8">
        <div className="flex w-full max-w-2xl flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Following</h1>
            <Link href="/dashboard" className="text-sm underline underline-offset-2">
              Back to My Profile
            </Link>
          </div>

          {profiles.length === 0 ? (
            <p className="text-sm text-black/60 dark:text-white/60">
              You&apos;re not following anyone yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {profiles.map((profile) => (
                <li key={profile.user_id}>
                  <Link
                    href={`/u/${profile.username}`}
                    className="flex items-center gap-3 rounded border border-black/10 p-3 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5"
                  >
                    {profile.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage CDN image.
                      <img
                        src={profile.avatar_url}
                        alt=""
                        width={36}
                        height={36}
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/10 text-sm font-medium dark:bg-white/10">
                        {profile.username.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="text-sm">
                      {profile.display_name ?? profile.username} (@{profile.username})
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
