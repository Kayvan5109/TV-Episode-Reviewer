'use client';

import { useActionState } from 'react';

import { addShow, type AddShowFormState } from './actions';

const initialState: AddShowFormState = undefined;

/**
 * "Rank episodes" button for one search result (labeled from the user's perspective — what it
 * does under the hood is still import/add the show, see `addShow` in `actions.ts` — but clicking
 * it is how the user gets to ranking, so that's what it should say). Binds the Server Action to
 * this specific `tmdbShowId` (see `actions.ts`'s doc comment on why `bind` rather than a hidden
 * form field) so each button only ever triggers an import for the show it was rendered for.
 */
export function AddShowButton({ tmdbShowId }: { tmdbShowId: number }) {
  const boundAddShow = addShow.bind(null, tmdbShowId);
  const [state, formAction, pending] = useActionState(boundAddShow, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={pending}
        className="whitespace-nowrap rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? 'Adding…' : 'Rank episodes'}
      </button>
      {state?.error && (
        <p role="alert" className="max-w-xs text-right text-xs text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
