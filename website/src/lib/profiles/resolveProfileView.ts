/**
 * Decides what `/u/[username]` should render, given the row (or lack of one) returned by
 * `user_profiles`' own RLS-scoped query -- see `src/app/u/[username]/page.tsx` and
 * `supabase/migrations/20260722010000_follows_and_profile_settings.sql` for the full RLS reasoning
 * this depends on.
 *
 * Deliberately a single, tested code path for both "no such user" and "user exists but is private
 * and isn't you": the widened `user_profiles` SELECT policy only ever returns a row when it's
 * public, or it's the caller's own row regardless of visibility -- so a private-and-not-mine row and
 * a genuinely nonexistent row are indistinguishable by the time a query result reaches this
 * function. That's exactly the point (see this build's information-disclosure decision: visiting a
 * nonexistent username and visiting a private username must render identically, so the *page* must
 * never be able to tell them apart) -- there is no branch here, or in the page that calls this, that
 * treats them differently.
 */

export interface ProfileRow {
  user_id: string;
  username: string;
  display_name: string | null;
  rankings_visibility: 'private' | 'public';
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
