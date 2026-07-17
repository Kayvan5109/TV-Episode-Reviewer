'use server';

import { redirect } from 'next/navigation';

import { importShowFromTmdb } from '@/lib/shows/importShow';
import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

export type AddShowFormState = { error: string } | undefined;

/**
 * Server Action backing each "Rank episodes" button in `ShowSearchForm`. Bound with a specific
 * `tmdbShowId` per result via `Function.prototype.bind` (the documented way to pass an extra,
 * server-trusted argument to a Server Action — see `next/dist/docs/01-app/02-guides/forms.md`),
 * so the client only ever picks *which* TMDB show, never supplies anything written to the DB.
 *
 * Runs entirely server-side. Never trusts a client-supplied user id: the signed-in user comes from
 * `getUser()` against the session-aware client, which revalidates against Supabase Auth.
 */
export async function addShow(
  tmdbShowId: number,
  // Required by useActionState's (prevState, formData) calling convention (with `tmdbShowId`
  // bound in ahead of them) — unused here since there's nothing to read from either.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prevState: AddShowFormState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _formData: FormData
): Promise<AddShowFormState> {
  if (!Number.isInteger(tmdbShowId) || tmdbShowId <= 0) {
    return { error: 'Invalid show.' };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  let showId: string;
  try {
    // Global writes to `shows`/`episodes` happen inside here via the service-role client — see
    // `src/lib/shows/importShow.ts`. Safe to call even if this show was already imported by
    // another user: it upserts rather than assuming it needs to insert.
    const result = await importShowFromTmdb(tmdbShowId);
    showId = result.showId;
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `Couldn't import this show from TMDB: ${error.message}`
          : "Couldn't import this show from TMDB.",
    };
  }

  // Per-user "I've added this show" record — written with the session-aware client (respects
  // RLS as this user), never the service-role client. `ignoreDuplicates` (ON CONFLICT DO NOTHING)
  // rather than a merge-on-conflict upsert: there's nothing to update on a re-add (no mutable
  // columns), and `user_shows`'s RLS policies (see
  // supabase/migrations/20260715010000_user_shows.sql) deliberately have no `update` policy, so a
  // DO UPDATE variant would fail RLS the second time the same show is added — DO NOTHING only
  // needs the `insert` policy, which exists.
  const { error: userShowError } = await supabase
    .from('user_shows')
    .upsert(
      { user_id: user.id, show_id: showId },
      { onConflict: 'user_id,show_id', ignoreDuplicates: true }
    );

  if (userShowError) {
    return { error: `Show was imported, but couldn't add it to your list: ${userShowError.message}` };
  }

  redirect(`/shows/${showId}`);
}
