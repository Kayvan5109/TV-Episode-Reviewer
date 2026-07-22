'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { lookupProfileIdentityByUsername } from '@/lib/profiles/profileIdentity';
import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

export type FollowActionResult = { error: string } | undefined;

// Every action below resolves its target username via `lookupProfileIdentityByUsername`
// (`@/lib/profiles/profileIdentity`) -- a SECURITY DEFINER "safe projection" RPC that resolves ANY
// existing username, not just public-or-your-own the way a direct `user_profiles` query would.
//
// **Revised 2026-07-22**: previously this file queried `user_profiles` directly under its own
// widened SELECT policy, which meant a private target simply failed to resolve -- an "acceptable,
// honest failure mode" back when following a private-and-not-mine user was never a valid outcome at
// all. That's no longer true: `requestToFollow` below needs to resolve a private target too (to send
// a follow request), so every action in this file now goes through the same safe-projection lookup.
// This doesn't loosen any actual write path -- `follows`'/`follow_requests`' own INSERT/DELETE
// policies (see `supabase/migrations/20260722030000_follow_requests_and_private_profile_visibility.sql`)
// remain the real enforcement for what each action is allowed to do with the resolved id.

/**
 * Server Action backing the Follow button on `/u/[username]` (Docs/AppSpec.md's Tier B Detailed
 * Design — Social Layer) -- public profiles only; a private target goes through `requestToFollow`
 * instead (the page never renders this button for a private, not-yet-followed target).
 *
 * Deliberately does NOT pre-check the target's `rankings_visibility` in application code before
 * inserting -- `follows`' own INSERT policy's `WITH CHECK` subquery (see
 * `supabase/migrations/20260722010000_follows_and_profile_settings.sql`) is the actual enforcement,
 * so a direct call to this action against a private profile is rejected by Postgres itself, not just
 * hidden in the UI. The self-follow check below is app-level purely for a clearer error message --
 * the `follows_no_self_follow` CHECK constraint is the real backstop either way, matching this
 * project's existing app-check-plus-DB-constraint pattern (e.g. `isValidUsername` alongside
 * `user_profiles`' own username CHECK constraint).
 */
export async function followUser(username: string): Promise<FollowActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const target = await lookupProfileIdentityByUsername(username);
  if (!target) {
    return { error: "Couldn't find that user." };
  }

  if (target.user_id === user.id) {
    return { error: "You can't follow yourself." };
  }

  const { error } = await supabase.from('follows').insert({ follower_id: user.id, followee_id: target.user_id });

  if (error) {
    // Covers both a genuine race (the target flipped to private between page load and this submit)
    // and a direct call bypassing the UI entirely -- either way, the INSERT policy is what actually
    // rejected this, and that rejection is surfaced here rather than swallowed.
    return { error: "Couldn't follow this user. Their rankings may not be public." };
  }

  revalidatePath(`/u/${username}`);
  revalidatePath('/dashboard');
}

/** Server Action backing the Unfollow button on `/u/[username]` -- works regardless of the target's
 * current visibility, since an already-accepted follow relationship survives a target going private
 * (see `follows`' own table comment) and must still be unfollowable. */
export async function unfollowUser(username: string): Promise<FollowActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const target = await lookupProfileIdentityByUsername(username);
  if (!target) {
    return { error: "Couldn't find that user." };
  }

  const { error } = await supabase.from('follows').delete().eq('follower_id', user.id).eq('followee_id', target.user_id);

  if (error) {
    return { error: "Couldn't unfollow this user." };
  }

  revalidatePath(`/u/${username}`);
  revalidatePath('/dashboard');
}

/**
 * Server Action backing the "Request to follow" button on `/u/[username]` for a private target
 * (Docs/AppSpec.md's "Follow requests (private profiles only)" feature flow).
 *
 * If the target has since gone public (a race between page load and this submit), routes through the
 * normal instant-follow path instead of attempting a `follow_requests` insert -- `follow_requests`'
 * own INSERT policy requires the target be private, so an insert against a now-public target would
 * simply be rejected; doing the *correct* thing (an instant follow, exactly what a fresh page load
 * would have offered) is more useful than surfacing that rejection as an error. This mirrors
 * `follows`' own INSERT policy requiring the target be public -- the two paths are mutually exclusive
 * by the target's current visibility, enforced at the DB layer either way.
 *
 * Also pre-checks whether the caller is already an accepted follower (a `follows` row already
 * exists) before attempting anything -- the page never renders this action's button in that case
 * (see `page.tsx`'s own doc comment: an existing accepted follower is never asked to re-request), but
 * a direct call bypassing the UI should still be rejected explicitly rather than silently creating a
 * dangling `follow_requests` row that would show up on the target's dashboard asking them to accept
 * someone who already follows them.
 */
export async function requestToFollow(username: string): Promise<FollowActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const target = await lookupProfileIdentityByUsername(username);
  if (!target) {
    return { error: "Couldn't find that user." };
  }

  if (target.user_id === user.id) {
    return { error: "You can't follow yourself." };
  }

  const { data: existingFollowRow } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('follower_id', user.id)
    .eq('followee_id', target.user_id)
    .maybeSingle();
  if (existingFollowRow) {
    return { error: "You're already following this user." };
  }

  if (target.rankings_visibility === 'public') {
    const { error } = await supabase.from('follows').insert({ follower_id: user.id, followee_id: target.user_id });
    if (error) {
      return { error: "Couldn't follow this user." };
    }
    revalidatePath(`/u/${username}`);
    revalidatePath('/dashboard');
    return;
  }

  const { error } = await supabase.from('follow_requests').insert({ requester_id: user.id, target_id: target.user_id });

  if (error) {
    // Covers a duplicate request (already pending), a direct call bypassing the UI, and the race
    // where the target went private->public->private again between page load and this submit --
    // follow_requests' own INSERT policy (target must be currently private) is the actual
    // enforcement, surfaced here rather than swallowed.
    return { error: "Couldn't send a follow request." };
  }

  revalidatePath(`/u/${username}`);
}

/** Server Action backing "Cancel" on a pending outgoing follow request, on `/u/[username]`. */
export async function cancelFollowRequest(username: string): Promise<FollowActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const target = await lookupProfileIdentityByUsername(username);
  if (!target) {
    return { error: "Couldn't find that user." };
  }

  const { error } = await supabase
    .from('follow_requests')
    .delete()
    .eq('requester_id', user.id)
    .eq('target_id', target.user_id);

  if (error) {
    return { error: "Couldn't cancel that request." };
  }

  revalidatePath(`/u/${username}`);
}
