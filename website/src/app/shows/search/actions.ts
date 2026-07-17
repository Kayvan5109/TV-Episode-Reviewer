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

  // Deliberately does NOT write a `user_shows` row here: merely importing/viewing a show
  // shouldn't count as "added to my shows" (hands-on testing found clicking "Rank episodes" and
  // then navigating away without ranking anything still left the show marked as added). That
  // per-user "I've added this show" record is written instead the first time a ranking answer is
  // actually submitted for one of this show's episodes — see `submitColdStart`/`submitComparison`
  // in `src/app/shows/[showId]/rank/[episodeId]/actions.ts`.
  redirect(`/shows/${showId}`);
}
