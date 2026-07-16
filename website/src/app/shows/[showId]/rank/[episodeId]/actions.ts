'use server';

import { revalidatePath } from 'next/cache';

import type { ColdStartBucket } from '@/lib/ranking/types';
import { submitColdStartAnswer, submitComparisonAnswer } from '@/lib/ranking-session';
import type { ComparisonResult, EpisodeId } from '@/lib/ranking-session';

/**
 * Result shape both actions below return: `undefined` on success (the caller just re-renders with
 * whatever `getNextStepForEpisode` now reports for this route's episode), `{ error }` if the
 * underlying `ranking-session` function threw (e.g. a stale/out-of-order submission, or the user
 * got signed out mid-session).
 */
export type RankingActionResult = { error: string } | undefined;

/**
 * Thin wrapper around `submitColdStartAnswer`: catches thrown errors into a plain return value the
 * client component can display without crashing, and revalidates this specific episode's rank
 * page on success.
 *
 * The `revalidatePath` call is required, not optional, in this Next.js version: a Server Action
 * only gets its calling route re-rendered in the same response if it calls
 * `revalidatePath`/`refresh`/`redirect` or mutates cookies — a plain return value alone does not
 * trigger a re-render (see `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`). Since
 * this page derives what to show entirely from live Supabase state (via `getNextStepForEpisode`)
 * rather than anything cached, invalidating its own path is exactly what's needed for the next
 * request to reflect the just-submitted answer.
 */
export async function submitColdStart(
  showId: string,
  episodeId: EpisodeId,
  bucket: ColdStartBucket
): Promise<RankingActionResult> {
  try {
    await submitColdStartAnswer(showId, episodeId, bucket);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to submit cold-start answer.',
    };
  }

  revalidatePath(`/shows/${showId}/rank/${episodeId}`);
}

/**
 * Same shape as `submitColdStart`, wrapping `submitComparisonAnswer` instead. `subjectId` is
 * always this route's own `episodeId` — the caller (`ComparisonPrompt`) is fixed to that subject,
 * it just also needs `referenceId` to know which pending question it's answering.
 */
export async function submitComparison(
  showId: string,
  subjectId: EpisodeId,
  referenceId: EpisodeId,
  result: ComparisonResult
): Promise<RankingActionResult> {
  try {
    await submitComparisonAnswer(showId, subjectId, referenceId, result);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to submit comparison answer.',
    };
  }

  revalidatePath(`/shows/${showId}/rank/${subjectId}`);
}
