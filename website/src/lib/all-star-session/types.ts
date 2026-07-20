/**
 * Types for the All Stars pool's persistence/orchestration layer — the cross-show "Top Episodes"
 * comparison pool (Docs/STATUS.md Bucket 4 item 15). Mirrors `@/lib/ranking-session/types.ts`'s
 * shape closely (see this directory's `session.ts` module comment for the full picture), but this
 * pool has no cold-start concept at all — every entrant goes straight to comparative placement, so
 * there's no `'coldStart'` step variant here the way `NextRankingStep` has one.
 */

import type { ComparisonResult, EpisodeId } from '@/lib/ranking/types';

/**
 * "What should the user be asked/shown next in the Top Episodes comparison flow?" The all-star
 * counterpart to `@/lib/ranking-session`'s `NextRankingStep`, minus the `'coldStart'` variant (see
 * module comment) — a pending entrant is always placed via comparative (binary-insertion)
 * placement, including the very first one into an empty pool, which needs zero comparisons at all
 * (see `session.ts`'s `deriveNextAllStarStep`).
 */
export type NextAllStarStep =
  | { type: 'compare'; subject: EpisodeId; reference: EpisodeId }
  | { type: 'done' };

/**
 * Re-uses `@/lib/ranking-session`'s `NeedsComparisonInput` sentinel directly rather than defining
 * a second, identical class — `makeReplayComparator` (reused unmodified from
 * `@/lib/ranking-session/comparator`, see that module's doc comment: it's fully generic, keyed
 * only by episode id pairs, no show-specific logic at all) always throws that exact class, so
 * catching it here has to reference the same one, not a look-alike.
 */
export { NeedsComparisonInput } from '@/lib/ranking-session';

/** Re-exported for convenience so callers of this module don't also need to import from `@/lib/ranking`. */
export type { ComparisonResult, EpisodeId };
