'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { escapeIlikePattern } from '@/lib/auth/username';
import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

export type FollowActionResult = { error: string } | undefined;

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Resolves a `/u/[username]` URL segment to that account's `user_id`, the same case-insensitive,
 * wildcard-escaped lookup `login`/`forgot-password`/the profile page itself use (see
 * `@/lib/auth/username`'s `escapeIlikePattern` doc comment for why the escaping matters). Goes
 * through the session-aware client, so this is itself subject to `user_profiles`' widened SELECT
 * policy -- it can only resolve a username that's public or the caller's own, which is fine here:
 * following/unfollowing a private-and-not-mine user is never a valid outcome anyway (see the INSERT
 * policy below), so failing to resolve it at all is an acceptable, honest failure mode, not a gap.
 */
async function resolveUsernameToUserId(supabase: SupabaseServerClient, username: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_profiles')
    .select('user_id')
    .ilike('username', escapeIlikePattern(username))
    .maybeSingle();

  return (data as { user_id: string } | null)?.user_id ?? null;
}

/**
 * Server Action backing the Follow button on `/u/[username]` (Docs/AppSpec.md's Tier B Detailed
 * Design — Social Layer, Phase 1 of the build).
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

  const targetUserId = await resolveUsernameToUserId(supabase, username);
  if (!targetUserId) {
    return { error: "Couldn't find that user." };
  }

  if (targetUserId === user.id) {
    return { error: "You can't follow yourself." };
  }

  const { error } = await supabase.from('follows').insert({ follower_id: user.id, followee_id: targetUserId });

  if (error) {
    // Covers both a genuine race (the target flipped to private between page load and this submit)
    // and a direct call bypassing the UI entirely -- either way, the INSERT policy is what actually
    // rejected this, and that rejection is surfaced here rather than swallowed.
    return { error: "Couldn't follow this user. Their rankings may not be public." };
  }

  revalidatePath(`/u/${username}`);
  revalidatePath('/dashboard');
}

/** Server Action backing the Unfollow button on `/u/[username]`. */
export async function unfollowUser(username: string): Promise<FollowActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const targetUserId = await resolveUsernameToUserId(supabase, username);
  if (!targetUserId) {
    return { error: "Couldn't find that user." };
  }

  const { error } = await supabase.from('follows').delete().eq('follower_id', user.id).eq('followee_id', targetUserId);

  if (error) {
    return { error: "Couldn't unfollow this user." };
  }

  revalidatePath(`/u/${username}`);
  revalidatePath('/dashboard');
}
