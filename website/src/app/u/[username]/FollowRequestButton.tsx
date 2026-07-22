'use client';

import { useActionState } from 'react';

import { cancelFollowRequest, requestToFollow, type FollowActionResult } from './actions';

const initialState: FollowActionResult = undefined;

/**
 * Request-to-follow control for a private profile's `/u/[username]` page (Docs/AppSpec.md's "Follow
 * requests (private profiles only)" feature flow) -- only ever rendered when the profile page has
 * already determined the target is private, the viewer isn't already an accepted follower, and it
 * isn't the viewer's own profile (see `page.tsx`). Mirrors `FollowButton`'s shape: reflects
 * `initialHasPendingRequest` locally, and relies on the server actions' `revalidatePath` to refresh
 * this route's Server Component payload on success rather than tracking "did it succeed" itself.
 */
export function FollowRequestButton({
  username,
  initialHasPendingRequest,
}: {
  username: string;
  initialHasPendingRequest: boolean;
}) {
  const [requestState, requestFormAction, requestPending] = useActionState(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature-compatible with useActionState's (prevState, formData) calling convention; this adapter ignores both and just calls requestToFollow(username).
    async (_prevState: FollowActionResult, _formData: FormData) => requestToFollow(username),
    initialState
  );
  const [cancelState, cancelFormAction, cancelPending] = useActionState(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature-compatible with useActionState's (prevState, formData) calling convention; this adapter ignores both and just calls cancelFollowRequest(username).
    async (_prevState: FollowActionResult, _formData: FormData) => cancelFollowRequest(username),
    initialState
  );

  if (initialHasPendingRequest) {
    return (
      <form action={cancelFormAction} className="flex flex-col items-start gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-black/60 dark:text-white/60">Request sent</span>
          <button
            type="submit"
            disabled={cancelPending}
            className="rounded border border-black/20 px-3 py-1 text-xs disabled:opacity-50 dark:border-white/30"
          >
            {cancelPending ? 'Canceling…' : 'Cancel'}
          </button>
        </div>
        {cancelState?.error && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {cancelState.error}
          </p>
        )}
      </form>
    );
  }

  return (
    <form action={requestFormAction} className="flex flex-col items-start gap-1">
      <button
        type="submit"
        disabled={requestPending}
        className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {requestPending ? 'Requesting…' : 'Request to follow'}
      </button>
      {requestState?.error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {requestState.error}
        </p>
      )}
    </form>
  );
}
