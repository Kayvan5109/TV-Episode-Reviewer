'use client';

import { useActionState } from 'react';
import type { FormEvent } from 'react';

import type { EpisodeId } from '@/lib/ranking-session';

import { reRankEpisode, type ShowActionResult } from './actions';

const initialState: ShowActionResult = undefined;

/**
 * Destructive "Re-rank" control for one already-ranked episode, rendered next to its score
 * (Kayvan's own placement request from earlier hands-on testing). Clears that episode's score and
 * every comparison it's been part of (`reRankEpisode`, in `./actions.ts` — see
 * `resetEpisodeRanking`'s doc comment in `@/lib/ranking-session` for why comparisons are cleared
 * too, not just the position), then drops the user straight into re-ranking it. Irreversible, so
 * this gates the submit behind `window.confirm` naming the specific episode.
 *
 * Not sharing a generic component with `RemoveShowButton`: the two bound actions take a different
 * number of arguments (`showId` alone vs. `showId` + `episodeId`) and confirm different things, so
 * a shared abstraction would mostly just be indirection around two thin, easy-to-read forms — same
 * "don't force it" judgment call `ColdStartPicker`/`ComparisonPrompt` already make elsewhere in
 * this app for a similar near-duplicate. Same `useActionState`-adapter reasoning as
 * `RemoveShowButton` does apply here, though: `reRankEpisode`'s signature doesn't fit
 * `useActionState`'s calling convention directly, so this wraps it locally instead of reshaping
 * the exported action.
 */
export function ReRankButton({
  showId,
  episodeId,
  episodeLabel,
}: {
  showId: string;
  episodeId: EpisodeId;
  episodeLabel: string;
}) {
  const [state, formAction, pending] = useActionState(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature-compatible with useActionState's (prevState, formData) calling convention; this adapter ignores both and just calls reRankEpisode(showId, episodeId).
    async (_prevState: ShowActionResult, _formData: FormData) => reRankEpisode(showId, episodeId),
    initialState
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        `Re-rank "${episodeLabel}"? This clears its score and comparison history. This can't be undone.`
      )
    ) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={pending}
        className="whitespace-nowrap rounded border border-red-600 px-2 py-0.5 text-xs text-red-600 disabled:opacity-50 dark:border-red-400 dark:text-red-400"
      >
        {pending ? 'Resetting…' : 'Re-rank'}
      </button>
      {state?.error && (
        <p role="alert" className="max-w-[12rem] text-right text-xs text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
