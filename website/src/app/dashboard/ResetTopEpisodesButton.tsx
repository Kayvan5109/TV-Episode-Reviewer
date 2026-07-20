'use client';

import { useActionState } from 'react';
import type { FormEvent } from 'react';

import { resetTopEpisodes, type ResetTopEpisodesResult } from './actions';

const initialState: ResetTopEpisodesResult = undefined;

/**
 * Small, unobtrusive "Re-rank from scratch" link for the Top Episodes section — the manual
 * full-reset escape hatch (Docs/STATUS.md Bucket 4 item 15's UX spec: offered alongside the
 * targeted reconciliation notice, but deliberately not the primary/default action, and shown even
 * in the "up to date" state, not just while something's pending). Gated behind `window.confirm`,
 * same destructive-action pattern as `RemoveShowButton` — resetting throws away every comparison
 * the user has made in this pool.
 */
export function ResetTopEpisodesButton() {
  const [state, formAction, pending] = useActionState(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature-compatible with useActionState's (prevState, formData) calling convention; this adapter ignores both and just calls resetTopEpisodes().
    async (_prevState: ResetTopEpisodesResult, _formData: FormData) => resetTopEpisodes(),
    initialState
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        "Re-rank Top Episodes from scratch? This throws away every comparison you've made in this list. This can't be undone."
      )
    ) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit}>
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-black/60 underline underline-offset-2 disabled:opacity-50 dark:text-white/60"
      >
        {pending ? 'Resetting…' : 'Re-rank from scratch'}
      </button>
      {state?.error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
