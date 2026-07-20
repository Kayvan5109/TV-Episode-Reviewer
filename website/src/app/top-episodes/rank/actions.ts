'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { submitAllStarComparisonAnswer } from '@/lib/all-star-session';
import type { ComparisonResult, EpisodeId } from '@/lib/all-star-session';

/**
 * Result shape: `undefined` on success (the caller just re-renders/redirects), `{ error }` if the
 * underlying `all-star-session` call threw — same convention as `RankingActionResult` in
 * `@/app/shows/[showId]/rank/[episodeId]/actions.ts`.
 */
export type AllStarActionResult = { error: string } | undefined;

/**
 * Thin wrapper around `submitAllStarComparisonAnswer`: records the answer, then auto-advances —
 * same "revalidate if there's more to do, redirect once nothing's left" pattern as
 * `@/app/shows/[showId]/rank/[episodeId]/actions.ts`'s `submitComparison`, just simpler (no
 * `rankAllMode`/`seasonScope` to thread through — this pool has no per-episode picker, there's
 * always exactly one linear queue).
 */
export async function submitAllStarComparison(
  subjectId: EpisodeId,
  referenceId: EpisodeId,
  result: ComparisonResult
): Promise<AllStarActionResult> {
  let step;
  try {
    step = await submitAllStarComparisonAnswer(subjectId, referenceId, result);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to submit comparison answer.',
    };
  }

  if (step.type === 'done') {
    redirect('/dashboard');
  }

  revalidatePath('/top-episodes/rank');
}
