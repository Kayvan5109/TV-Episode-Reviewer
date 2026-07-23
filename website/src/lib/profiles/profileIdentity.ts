/**
 * Thin wrappers around the two safe-projection identity RPCs added in
 * `supabase/migrations/20260722030000_follow_requests_and_private_profile_visibility.sql`
 * (`profile_identity_by_username`, `profile_identities_by_user_ids`) -- SECURITY DEFINER functions
 * that return only the columns safe to show any other user (`user_id`, `username`, `display_name`,
 * `rankings_visibility`, `avatar_url` -- never `auth_email`/`has_real_email`) for ANY existing user,
 * regardless of `rankings_visibility`, and nothing at all for a nonexistent user/username.
 *
 * Widened 2026-07-23 (`supabase/migrations/20260723010000_account_page_visibility.sql`) to also
 * return `avatar_url` -- same safe tier as the rest, needed for the account page's avatar display.
 *
 * This is the app's first deliberate safe-projection pattern for cross-user `user_profiles` reads
 * (Docs/STATUS.md Bucket 4 item 22) -- callers that need to resolve or display another user's
 * identity (public or private) should go through these, not a direct `.from('user_profiles')` query,
 * which is still RLS-scoped to "public or your own row only" and cannot see a private-and-not-yours
 * row at all (see the migration's header comment for the full reasoning).
 *
 * Each function creates its own session-aware client internally (via `createSupabaseServerClient`),
 * matching this codebase's existing lib-layer convention (see e.g. `@/lib/ranking-session/session.ts`,
 * where every exported function does the same) rather than accepting one as a parameter -- a fresh
 * client per call is the documented, accepted cost of that pattern here.
 */

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

export interface ProfileIdentity {
  user_id: string;
  username: string;
  display_name: string | null;
  rankings_visibility: 'private' | 'public';
  avatar_url: string | null;
}

/**
 * Resolves a `/u/[username]` URL segment (or any other username string) to that account's full safe
 * identity, for ANY existing user -- `null` only when the username genuinely doesn't exist. Exact,
 * case-insensitive match (mirrors the `lower(username)` unique index every other username lookup in
 * this app uses) -- not an ILIKE pattern, so there's no wildcard-escaping concern here.
 */
export async function lookupProfileIdentityByUsername(username: string): Promise<ProfileIdentity | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc('profile_identity_by_username', { p_username: username });
  return (data as ProfileIdentity[] | null)?.[0] ?? null;
}

/**
 * Batch version, keyed by `user_id` instead of username -- for call sites that already have a list of
 * user ids on hand (e.g. the dashboard's "Following" and "Follow requests" lists, resolving
 * `follows.followee_id`/`follow_requests.requester_id` values) rather than a single username from a
 * URL. Returns one row per id that actually exists; an id with no matching row is simply absent from
 * the result, not represented as an error.
 */
export async function lookupProfileIdentitiesByUserIds(userIds: string[]): Promise<ProfileIdentity[]> {
  if (userIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc('profile_identities_by_user_ids', { p_user_ids: userIds });
  return (data as ProfileIdentity[] | null) ?? [];
}
