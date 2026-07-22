import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppHeader } from '@/components/AppHeader';
import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

import { ClaimUsernameForm } from './ClaimUsernameForm';
import { SettingsForm } from './SettingsForm';

export const metadata: Metadata = {
  title: 'Settings — Episode Ranker',
};

// Session-dependent (auth guard, own-row profile read) -- never statically cached, same reasoning
// as every other authenticated page in this app.
export const dynamic = 'force-dynamic';

interface ProfileRow {
  username: string;
  display_name: string | null;
  rankings_visibility: 'private' | 'public';
}

/**
 * Profile settings (Docs/AppSpec.md's Tier B Detailed Design — Social Layer, Phase 1 of the build).
 * Lets a signed-in user edit `display_name` and toggle `rankings_visibility` -- see
 * `./actions.ts`'s `updateProfile`. Deliberately doesn't offer username editing at all -- not
 * designed anywhere in the Tier B doc (username is set once, at signup, or claimed later below).
 *
 * Reads its own row via the session-aware client, which now hits both of user_profiles' SELECT
 * policies (own row unconditionally, or any public row) -- irrelevant here since a user always has
 * an unconditional read of their own row regardless of visibility, but noted since this is the
 * first page in the app reading a table with more than one SELECT policy in play.
 *
 * A signed-in user can have no `user_profiles` row at all -- every account created via the *new*
 * username+password signup flow gets one automatically, but accounts that predate that table
 * (created via the old email+password flow) don't. Rather than dead-ending with an error, this
 * renders `<ClaimUsernameForm />` (`./actions.ts`'s `claimUsername`) so those accounts can claim a
 * username whenever convenient, per the original "no forced migration" decision (Docs/STATUS.md's
 * Tier B Phase 1 history).
 */
export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profileData, error } = await supabase
    .from('user_profiles')
    .select('username, display_name, rankings_visibility')
    .eq('user_id', user.id)
    .maybeSingle();

  const profile = profileData as ProfileRow | null;

  return (
    <>
      <AppHeader />
      <div className="flex flex-1 flex-col items-center gap-8 p-8">
        <div className="flex w-full max-w-sm flex-col gap-4">
          <h1 className="text-xl font-semibold">Settings</h1>

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              Couldn&apos;t load your profile: {error.message}
            </p>
          )}

          {!error && !profile && <ClaimUsernameForm />}

          {!error && profile && (
            <>
              <p className="text-sm text-black/60 dark:text-white/60">
                Your username is <span className="font-medium">@{profile.username}</span>. Usernames
                can&apos;t be changed.
                {profile.rankings_visibility === 'public' && (
                  <>
                    {' '}
                    Your public profile:{' '}
                    <Link href={`/u/${profile.username}`} className="underline underline-offset-2">
                      /u/{profile.username}
                    </Link>
                  </>
                )}
              </p>
              <SettingsForm
                displayName={profile.display_name}
                rankingsVisibility={profile.rankings_visibility}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
