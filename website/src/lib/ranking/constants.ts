/**
 * Minimum number of already-ranked episodes a show needs before a new episode goes through
 * comparative (binary-insertion) placement instead of a coarse cold-start bucket.
 *
 * Docs/DevelopmentPlan.md's Issues list calls this threshold a placeholder ("~3-5 episodes"),
 * not yet tuned against real use. `4` is picked as a concrete point within that range so the
 * algorithm has something definite to run against in Phase 0 — expect to revisit once there's
 * real usage data. Keep this the single source of truth so it's trivial to tune later.
 */
export const COLD_START_THRESHOLD = 4;

/**
 * Maximum number of tie-break comparisons (against successive "common reference" episodes)
 * attempted before giving up and falling back to adjacent insertion. See
 * comparativePlacement.ts's `resolveTie` for the full reasoning — this cap and the fallback
 * behavior are both judgment calls, not decided in the docs (DevelopmentPlan.md Issue #2).
 */
export const MAX_TIE_BREAK_ATTEMPTS = 3;

/**
 * Per-show effective cold-start threshold, per Docs/DevelopmentPlan.md's "Decided 2026-07-17,
 * not yet built: small shows skip cold-start bucketing after episode 1". A show with fewer than
 * `COLD_START_THRESHOLD` total episodes would otherwise cold-start-bucket *every* episode, which
 * produces visibly different scores for same-bucket ("equally neutral") episodes purely from
 * recency ordering (see `coldStart.ts`'s `orderColdStart`). Shrinking the effective threshold to
 * `1` for such shows means only the very first episode gets a coarse bucket judgment — every
 * episode after that goes straight to real pairwise comparative placement, which is exact rather
 * than recency-ordered. Episode 1 still must go through cold start (not `0`): comparative
 * placement against an empty ranked list asks the user nothing at all (see
 * `placeEpisodeComparatively` in `comparativePlacement.ts`), which would leave it with no
 * recorded opinion whatsoever.
 */
export function effectiveColdStartThreshold(totalShowEpisodeCount: number): number {
  return totalShowEpisodeCount < COLD_START_THRESHOLD ? 1 : COLD_START_THRESHOLD;
}
