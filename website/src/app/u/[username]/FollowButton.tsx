'use client';

import { useActionState } from 'react';

import { followUser, unfollowUser, type FollowActionResult } from './actions';

const initialState: FollowActionResult = undefined;

/**
 * Follow/Unfollow toggle for `/u/[username]`. Only ever rendered when the profile page has already
 * determined the target is public and isn't the viewer's own profile (see `page.tsx`) -- this
 * component itself doesn't re-derive that, it just reflects `initialIsFollowing`.
 *
 * A successful follow/unfollow calls `revalidatePath` server-side (see `./actions.ts`), which
 * refreshes this route's Server Component payload -- `page.tsx` re-renders with a fresh
 * `initialIsFollowing` next paint, which is what actually flips which button shows. This component
 * only needs to render its own pending/error state locally, not track "did it succeed" itself.
 */
export function FollowButton({ username, initialIsFollowing }: { username: string; initialIsFollowing: boolean }) {
  const [followState, followFormAction, followPending] = useActionState(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature-compatible with useActionState's (prevState, formData) calling convention; this adapter ignores both and just calls followUser(username).
    async (_prevState: FollowActionResult, _formData: FormData) => followUser(username),
    initialState
  );
  const [unfollowState, unfollowFormAction, unfollowPending] = useActionState(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature-compatible with useActionState's (prevState, formData) calling convention; this adapter ignores both and just calls unfollowUser(username).
    async (_prevState: FollowActionResult, _formData: FormData) => unfollowUser(username),
    initialState
  );

  if (initialIsFollowing) {
    return (
      <form action={unfollowFormAction} className="flex flex-col items-start gap-1">
        <button
          type="submit"
          disabled={unfollowPending}
          className="rounded border border-black/20 px-4 py-2 text-sm disabled:opacity-50 dark:border-white/30"
        >
          {unfollowPending ? 'Unfollowing…' : 'Unfollow'}
        </button>
        {unfollowState?.error && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {unfollowState.error}
          </p>
        )}
      </form>
    );
  }

  return (
    <form action={followFormAction} className="flex flex-col items-start gap-1">
      <button
        type="submit"
        disabled={followPending}
        className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {followPending ? 'Following…' : 'Follow'}
      </button>
      {followState?.error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {followState.error}
        </p>
      )}
    </form>
  );
}
