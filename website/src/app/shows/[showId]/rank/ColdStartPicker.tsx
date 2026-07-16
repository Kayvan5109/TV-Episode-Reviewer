'use client';

import { useState, useTransition } from 'react';

import type { ColdStartBucket } from '@/lib/ranking/types';
import type { EpisodeId } from '@/lib/ranking-session';

import { submitColdStart } from './actions';

const BUCKETS: { bucket: ColdStartBucket; label: string }[] = [
  { bucket: 'liked', label: 'Liked' },
  { bucket: 'neutral', label: 'Neutral' },
  { bucket: 'disliked', label: 'Disliked' },
];

/**
 * Cold-start judgment picker: three buttons sharing one pending/error state, since only one of
 * them can ever actually be "the" answer for a given episode. Calls the `submitColdStart` Server
 * Action directly from the click handler (wrapped in `startTransition`) rather than via a
 * `<form>` — a Server Action can be invoked either way (see the server-actions doc), and a plain
 * transition is simpler here than juggling `useActionState` across three separately-submittable
 * buttons.
 */
export function ColdStartPicker({ showId, episodeId }: { showId: string; episodeId: EpisodeId }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handlePick(bucket: ColdStartBucket) {
    setError(null);
    startTransition(async () => {
      const result = await submitColdStart(showId, episodeId, bucket);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-3">
        {BUCKETS.map(({ bucket, label }) => (
          <button
            key={bucket}
            type="button"
            disabled={isPending}
            onClick={() => handlePick(bucket)}
            className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
