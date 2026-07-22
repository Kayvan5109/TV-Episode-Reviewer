'use client';

import { useActionState } from 'react';

import { acceptFollowRequest, denyFollowRequest, type FollowRequestActionResult } from './actions';

const initialState: FollowRequestActionResult = undefined;

/**
 * Accept/Deny controls for one row of the dashboard's "Follow requests" section (Docs/AppSpec.md's
 * "Follow requests (private profiles only)" feature flow: "a plain list of requesters' usernames
 * with Accept/Deny buttons is enough, no need for anything fancier" -- matches this codebase's
 * existing "keep the widget simple" precedent for the Following list itself). Same shape as
 * `FollowButton`/`FollowRequestButton`: reflects local pending/error state only, relies on the
 * actions' own `revalidatePath('/dashboard')` to refresh this row away once resolved.
 */
export function IncomingFollowRequestActions({ requesterId }: { requesterId: string }) {
  const [acceptState, acceptFormAction, acceptPending] = useActionState(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature-compatible with useActionState's (prevState, formData) calling convention; this adapter ignores both and just calls acceptFollowRequest(requesterId).
    async (_prevState: FollowRequestActionResult, _formData: FormData) => acceptFollowRequest(requesterId),
    initialState
  );
  const [denyState, denyFormAction, denyPending] = useActionState(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature-compatible with useActionState's (prevState, formData) calling convention; this adapter ignores both and just calls denyFollowRequest(requesterId).
    async (_prevState: FollowRequestActionResult, _formData: FormData) => denyFollowRequest(requesterId),
    initialState
  );

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2">
        <form action={acceptFormAction}>
          <button
            type="submit"
            disabled={acceptPending || denyPending}
            className="rounded bg-black px-3 py-1 text-xs text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {acceptPending ? 'Accepting…' : 'Accept'}
          </button>
        </form>
        <form action={denyFormAction}>
          <button
            type="submit"
            disabled={acceptPending || denyPending}
            className="rounded border border-black/20 px-3 py-1 text-xs disabled:opacity-50 dark:border-white/30"
          >
            {denyPending ? 'Denying…' : 'Deny'}
          </button>
        </form>
      </div>
      {acceptState?.error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {acceptState.error}
        </p>
      )}
      {denyState?.error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {denyState.error}
        </p>
      )}
    </div>
  );
}
