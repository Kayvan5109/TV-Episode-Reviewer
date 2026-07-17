'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { ColdStartBucket } from '@/lib/ranking/types';
import { getNextStepForEpisode, submitColdStartAnswer, submitComparisonAnswer } from '@/lib/ranking-session';
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
 * client component can display without crashing.
 *
 * On success, checks what's next for this episode. If the submission fully resolved this
 * episode's placement (`'alreadyRanked'`), there's nothing left to ask here, so this redirects
 * straight back to the show page rather than leaving the user on a "you're done" screen they'd
 * have to click off of themselves. Otherwise (more cold-start/comparison questions pending for
 * this same episode) it revalidates this specific episode's rank page instead, same as before.
 *
 * Either `revalidatePath` or `redirect` is required, not optional, in this Next.js version: a
 * Server Action only gets its calling route re-rendered in the same response if it calls
 * `revalidatePath`/`refresh`/`redirect` or mutates cookies — a plain return value alone does not
 * trigger a re-render (see `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`). Since
 * this page derives what to show entirely from live Supabase state (via `getNextStepForEpisode`)
 * rather than anything cached, invalidating its own path is exactly what's needed for the next
 * request to reflect the just-submitted answer when there's still something to show here.
 */
export async function submitColdStart(
  showId: string,
  episodeId: EpisodeId,
  bucket: ColdStartBucket
): Promise<RankingActionResult> {
  let step;
  try {
    step = await submitColdStartAnswer(showId, episodeId, bucket);
  } catch (error) {
    // A stale page (e.g. the user pressed back after already submitting this episode's answer)
    // can resubmit against an episode that's now fully ranked. `submitColdStartAnswer` correctly
    // rejects that as an error, but from the user's point of view it's not a failure at all — just
    // send them on to the show page like the success path already does for 'alreadyRanked'. Any
    // other thrown error (a real bug, or this recheck itself failing) falls through to the
    // original error below, unchanged.
    const current = await getNextStepForEpisode(showId, episodeId).catch(() => null);
    if (current?.type === 'alreadyRanked') {
      redirect(`/shows/${showId}`);
    }

    return {
      error: error instanceof Error ? error.message : 'Failed to submit cold-start answer.',
    };
  }

  if (step.type === 'alreadyRanked') {
    redirect(`/shows/${showId}`);
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
  let step;
  try {
    step = await submitComparisonAnswer(showId, subjectId, referenceId, result);
  } catch (error) {
    // Same stale-resubmission case as `submitColdStart` above: a back-button page can resubmit a
    // comparison for a subject that's already fully ranked. `submitComparisonAnswer` correctly
    // rejects that (the pending step it finds no longer matches `referenceId`), but it's a benign
    // "you're already done here" situation, not a real error — redirect instead of showing it. Any
    // other thrown error (including this recheck itself failing) falls through unchanged.
    const current = await getNextStepForEpisode(showId, subjectId).catch(() => null);
    if (current?.type === 'alreadyRanked') {
      redirect(`/shows/${showId}`);
    }

    return {
      error: error instanceof Error ? error.message : 'Failed to submit comparison answer.',
    };
  }

  if (step.type === 'alreadyRanked') {
    redirect(`/shows/${showId}`);
  }

  revalidatePath(`/shows/${showId}/rank/${subjectId}`);
}
