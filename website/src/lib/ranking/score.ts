/**
 * v1 score-from-position formula — see Docs/DevelopmentPlan.md's "Discussion" section for the
 * full reasoning. Implemented exactly as specified there; this is a deliberately simple
 * starting point that's explicitly expected to need real-world tuning, not something to
 * "improve" here.
 *
 * Scores are always derived on demand from (position, episodeCount) — per Docs/AppSpec.md's
 * data model, the 1-10 score is never stored as persistent state.
 */

/** How much of the full 9-point spread (10 down to 1) a show with N episodes has "earned". */
export function spread(episodeCount: number): number {
  return 9 * Math.min(1, (episodeCount - 1) / 7);
}

/**
 * @param position 1-based rank position within the show, 1 = best.
 * @param episodeCount total ranked episodes in the show (N).
 */
export function scoreForPosition(position: number, episodeCount: number): number {
  if (episodeCount < 1) {
    throw new Error(`episodeCount must be >= 1, got ${episodeCount}`);
  }
  if (position < 1 || position > episodeCount) {
    throw new Error(`position ${position} out of range for episodeCount ${episodeCount}`);
  }
  if (episodeCount === 1) {
    return 10; // single-episode case
  }
  return 10 - ((position - 1) * spread(episodeCount)) / (episodeCount - 1);
}

/** Scores for every position in a fully-ranked show, best (index 0) to worst. */
export function scoresForRankedList<T>(rankedBestToWorst: readonly T[]): Map<T, number> {
  const episodeCount = rankedBestToWorst.length;
  const result = new Map<T, number>();
  rankedBestToWorst.forEach((item, index) => {
    result.set(item, scoreForPosition(index + 1, episodeCount));
  });
  return result;
}
