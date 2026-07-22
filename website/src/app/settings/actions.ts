'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

export type UpdateProfileState = { status: 'error'; error: string } | { status: 'success' } | undefined;

const DISPLAY_NAME_MAX_LENGTH = 40;

/**
 * Server Action backing `/settings` (Docs/AppSpec.md's Tier B Detailed Design — Social Layer, Phase
 * 1 of the build). Lets the signed-in user edit `display_name` and toggle `rankings_visibility`.
 *
 * Uses the session-aware client, not the service-role client -- unlike signup's account creation,
 * this is a normal per-user write, and `user_profiles` now has an UPDATE policy scoped to
 * `user_id = auth.uid()` (see `supabase/migrations/20260722010000_follows_and_profile_settings.sql`)
 * specifically so this can work without one. The explicit `.eq('user_id', user.id)` below is
 * defense-in-depth on top of that policy, matching this codebase's existing convention (e.g.
 * `removeShow` in `@/app/shows/[showId]/actions.ts`) of never relying on RLS alone when the caller
 * already has the authoritative id in hand.
 *
 * Deliberately does NOT accept a `username` field -- changing your username after signup is not
 * designed anywhere in the Tier B doc (it's set once, at signup) and is explicitly out of scope for
 * this build.
 */
export async function updateProfile(
  _prevState: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const rawDisplayName = String(formData.get('display_name') ?? '').trim();
  const visibility = String(formData.get('rankings_visibility') ?? '');

  if (visibility !== 'private' && visibility !== 'public') {
    return { status: 'error', error: 'Invalid visibility value.' };
  }

  if (rawDisplayName.length > DISPLAY_NAME_MAX_LENGTH) {
    return {
      status: 'error',
      error: `Display name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`,
    };
  }

  // An empty submission clears display_name back to null, which falls back to the username
  // elsewhere in the app (per AppSpec.md's Tier B `user_profiles` note: "falls back to username if
  // unset").
  const displayName = rawDisplayName.length > 0 ? rawDisplayName : null;

  const { error } = await supabase
    .from('user_profiles')
    .update({ display_name: displayName, rankings_visibility: visibility })
    .eq('user_id', user.id);

  if (error) {
    return { status: 'error', error: error.message };
  }

  revalidatePath('/settings');
  return { status: 'success' };
}
