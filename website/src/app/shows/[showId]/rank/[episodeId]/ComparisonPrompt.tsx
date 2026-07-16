'use client';

import { useState, useTransition } from 'react';

import type { ComparisonResult, EpisodeId } from '@/lib/ranking-session';

import { submitComparison } from './actions';

const OPTIONS: { result: ComparisonResult; label: string }[] = [
  { result: 'better', label: 'Better' },
  { result: 'neutral', label: 'About the same' },
  { result: 'worse', label: 'Worse' },
];

/**
 * Comparison answer picker: three buttons ("subject" is better/worse/about the same as
 * "reference"), sharing one pending/error state — same reasoning as `ColdStartPicker`.
 */
export function ComparisonPrompt({
  showId,
  subjectId,
  referenceId,
}: {
  showId: string;
  subjectId: EpisodeId;
  referenceId: EpisodeId;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handlePick(result: ComparisonResult) {
    setError(null);
    startTransition(async () => {
      const outcome = await submitComparison(showId, subjectId, referenceId, result);
      if (outcome?.error) {
        setError(outcome.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-3">
        {OPTIONS.map(({ result, label }) => (
          <button
            key={result}
            type="button"
            disabled={isPending}
            onClick={() => handlePick(result)}
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
