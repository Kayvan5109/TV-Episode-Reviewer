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
