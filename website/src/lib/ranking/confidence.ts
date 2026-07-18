/**
 * v1 "ranking confidence" signal — see Docs/DevelopmentPlan.md's Discussion section ("Direction
 * proposed 2026-07-17, not yet built: a 'ranking confidence' signal") for the full reasoning.
 * Fully computable from data already stored (`episode_comparisons`), no schema changes needed.
 *
 * Pure functions, no DB/IO — same style as score.ts, and reused the same way: called fresh over
 * whatever `ComparisonHistory`/ranked list is already in memory, never stored itself.
 *
 * Known, deliberate v1 limitation (documented in DevelopmentPlan.md, not this module's job to
 * fix): this doesn't distinguish an episode placed cleanly via decisive comparisons from one that
 * got inserted via a tie-break-exhaustion fallback (`resolveTie`'s `fallbackAdjacentTo` case in
 * `comparativePlacement.ts`) — the persistence layer doesn't currently record *how* an episode's
 * final placement was reached, only what comparisons happened.
 */

import type { ComparisonHistory, EpisodeId } from './types';

/** Count of `episodeId`'s non-neutral ('better'/'worse') comparisons, either side. */
export function decisiveComparisonCount(episodeId: EpisodeId, history: ComparisonHistory): number {
  const records = history.get(episodeId) ?? [];
  return records.filter((record) => record.result !== 'neutral').length;
}

/**
 * How "well established" a single episode's placement is, 0-100. `log2(showEpisodeCount)` is the
 * same theoretical minimum-comparisons figure the binary-insertion algorithm itself is built
 * around (see Docs/DevelopmentPlan.md's "Comparative placement"), so an episode that's been
 * through roughly that many decisive comparisons reads as "well-established"; fewer reads as
 * "still shaky."
 *
 * @param showEpisodeCount JUDGMENT CALL — flagged for review: Docs/DevelopmentPlan.md's formula
 *   takes this as a parameter without pinning down exactly what count to pass (a show's total
 *   imported episode count, vs. the count of episodes comparatively-ranked so far). Resolved to
 *   match `scoreForPosition`'s existing convention (score.ts): always the *current* count of
 *   comparatively-ranked episodes (`ShowRankingState.ranked.length`), recomputed fresh on every
 *   call, never a fixed total — not the show's total imported episode count.
 * @returns 0-100 (not 0-1).
 */
export function episodeConfidence(
  episodeId: EpisodeId,
  history: ComparisonHistory,
  showEpisodeCount: number
): number {
  if (showEpisodeCount <= 1) {
    // log2(1) = 0, log2(0) = -Infinity — both undefined/meaningless as a divisor. A show that's
    // only ever had <= 1 ranked episode has nothing left to be uncertain about (there's no one
    // else to have compared it against), matching scoreForPosition's own single-episode-case
    // precedent (score.ts).
    return 100;
  }
  const decisive = decisiveComparisonCount(episodeId, history);
  return Math.min(100, (decisive / Math.log2(showEpisodeCount)) * 100);
}

/**
 * A show's overall ranking confidence: the plain average of `episodeConfidence` across every
 * comparatively-ranked episode. Assumes `rankedEpisodeIds` is non-empty and throws otherwise —
 * "no ranked episodes yet" is a meaningful display state (no confidence to report at all, not a
 * 0%), so it's left to the caller to decide what to show for that case rather than this function
 * picking a number that would misleadingly imply a real-but-low confidence (see
 * `getShowRankingDisplay` in `ranking-session/session.ts`, which returns `null` for that case).
 */
export function showConfidence(
  rankedEpisodeIds: readonly EpisodeId[],
  history: ComparisonHistory,
  showEpisodeCount: number
): number {
  if (rankedEpisodeIds.length === 0) {
    throw new Error('showConfidence requires at least one ranked episode.');
  }
  const total = rankedEpisodeIds.reduce(
    (sum, episodeId) => sum + episodeConfidence(episodeId, history, showEpisodeCount),
    0
  );
  return total / rankedEpisodeIds.length;
}
