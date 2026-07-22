'use client';

import { useActionState } from 'react';

import { claimUsername, type ClaimUsernameState } from './actions';

const initialState: ClaimUsernameState = undefined;

/**
 * Shown on `/settings` instead of the edit form when the signed-in user has no `user_profiles` row
 * yet (a legacy, pre-username account -- see `claimUsername` in `./actions.ts` for the full story).
 * On success, the parent Server Component re-fetches (via `claimUsername`'s `revalidatePath` plus
 * this form's own action-triggered refresh) and swaps this out for the normal edit form once the row
 * exists -- no client-side redirect needed.
 */
export function ClaimUsernameForm() {
  const [state, formAction, pending] = useActionState(claimUsername, initialState);

  return (
    <>
      <p className="text-sm text-black/60 dark:text-white/60">
        Your account doesn&apos;t have a username yet. Claim one to unlock display name and privacy
        settings.
      </p>
      <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="username" className="text-sm font-medium">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            minLength={3}
            maxLength={20}
            required
            placeholder="3-20 characters: letters, numbers, underscores"
            className="rounded border border-black/20 px-3 py-2 dark:border-white/30"
          />
        </div>

        {state?.status === 'error' && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}
        {state?.status === 'success' && (
          <p role="status" className="text-sm text-green-600 dark:text-green-400">
            Username claimed.
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {pending ? 'Claiming…' : 'Claim username'}
        </button>
      </form>
    </>
  );
}
