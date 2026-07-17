'use client';

import { useActionState } from 'react';
import type { FormEvent } from 'react';

import { removeShow, type ShowActionResult } from './actions';

const initialState: ShowActionResult = undefined;

/**
 * Destructive "Remove show" control: deletes every ranking the signed-in user has for this show
 * (`removeShow`, in `./actions.ts`) and takes them back to `/dashboard`. Irreversible — clicking
 * through loses all of this show's ranking work — so this gates the submit behind
 * `window.confirm`, with the show's own title in the message so it's specific about what's about
 * to be lost, not a generic "are you sure?".
 *
 * `removeShow`'s own signature (`showId: string) => Promise<ShowActionResult>`) doesn't fit
 * `useActionState`'s `(prevState, formData) => state` calling convention the way `addShow`'s does
 * in `AddShowButton.tsx` (that action was deliberately shaped with extra, otherwise-unused params
 * to fit it). Rather than reshape the exported Server Action just for this UI concern, this wraps
 * it locally with a small adapter that ignores `prevState`/`formData` and just calls
 * `removeShow(showId)` — still gets the same `useActionState` pending/error ergonomics
 * `AddShowButton` uses, without changing `removeShow`'s signature.
 */
export function RemoveShowButton({ showId, showTitle }: { showId: string; showTitle: string }) {
  const [state, formAction, pending] = useActionState(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature-compatible with useActionState's (prevState, formData) calling convention; this adapter ignores both and just calls removeShow(showId).
    async (_prevState: ShowActionResult, _formData: FormData) => removeShow(showId),
    initialState
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        `Remove "${showTitle}"? This deletes all your rankings for this show. This can't be undone.`
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
        className="whitespace-nowrap rounded border border-red-600 px-3 py-1.5 text-sm text-red-600 disabled:opacity-50 dark:border-red-400 dark:text-red-400"
      >
        {pending ? 'Removing…' : 'Remove show'}
      </button>
      {state?.error && (
        <p role="alert" className="max-w-xs text-right text-xs text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
