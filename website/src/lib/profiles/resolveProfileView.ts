/**
 * Decides what `/u/[username]` should render, given the row (or lack of one) returned by
 * `profile_identity_by_username` (`@/lib/profiles/profileIdentity`) -- see
 * `src/app/u/[username]/page.tsx` and
 * `supabase/migrations/20260722030000_follow_requests_and_private_profile_visibility.sql` for the
 * full RLS/SECURITY DEFINER reasoning this depends on.
 *
 * **Revised 2026-07-22** (see `Docs/AppSpec.md`'s "Follow requests" feature flow and this build's
 * task brief for the full reasoning): a private profile is now identifiable, not collapsed with a
 * nonexistent one -- `profile_identity_by_username` returns a row for ANY existing user regardless
 * of `rankings_visibility`, so a `null` result reaching this function now means "genuinely no such
 * user," full stop. (Previously this function's `null` case covered *both* "nonexistent" and
 * "private and not yours," by construction, back when the caller queried `user_profiles` directly
 * under its own public-or-your-own-row SELECT policy -- that policy is unchanged, but this page no
 * longer uses it for the profile-being-viewed lookup, precisely so private profiles stop 404ing.)
 *
 * **Widened 2026-07-23** (account page build): `ProfileRow` now carries `avatar_url` too, mirroring
 * `ProfileIdentity`'s own widening in the same migration -- the account page needs it to render the
 * viewed profile's avatar.
 */

export interface ProfileRow {
  user_id: string;
  username: string;
  display_name: string | null;
  rankings_visibility: 'private' | 'public';
  avatar_url: string | null;
}

export type ProfileView =
  | { found: false }
  | { found: true; profile: ProfileRow; isOwnProfile: boolean };

export function resolveProfileView(profileRow: ProfileRow | null, viewerUserId: string): ProfileView {
  if (!profileRow) {
    return { found: false };
  }

  return {
    found: true,
    profile: profileRow,
    isOwnProfile: profileRow.user_id === viewerUserId,
  };
}
