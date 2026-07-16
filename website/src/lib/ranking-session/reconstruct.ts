/**
 * Reconstructs a `ShowRankingState` (the pure algorithm's in-memory type, see
 * `@/lib/ranking/types`) from plain DB row shapes. Deliberately pure and DB-free — takes plain
 * arrays in, returns a `ShowRankingState` out — so it's unit-testable without mocking Supabase at
 * all; the actual querying lives in `session.ts`.
 */

import type {
  ColdStartBucket,
  ComparisonHistory,
  ComparisonResult,
  EpisodeId,
  ShowRankingState,
} from '@/lib/ranking/types';

/** One `episode_rankings` row, narrowed to the columns reconstruction needs. */
export interface RankingRow {
  episode_id: EpisodeId;
  rank_position: number | null;
  cold_start_bucket: ColdStartBucket | null;
  cold_start_sequence: number | null;
}

/** One `episode_comparisons` row, narrowed to the columns reconstruction needs. */
export interface ComparisonRow {
  episode_a_id: EpisodeId;
  episode_b_id: EpisodeId;
  result: 'a_better' | 'b_better' | 'neutral';
}

/** `episode_comparisons.result` is always stored from episode_a's perspective — decode that side. */
function resultFromA(result: ComparisonRow['result']): ComparisonResult {
  if (result === 'a_better') return 'better';
  if (result === 'b_better') return 'worse';
  return 'neutral';
}

/**
 * Mirrors `comparativePlacement.ts`'s private `invert()` exactly (better <-> worse, neutral stays
 * neutral) — episode_b's perspective on a row is always the inverse of episode_a's.
 */
function invert(result: ComparisonResult): ComparisonResult {
  if (result === 'better') return 'worse';
  if (result === 'worse') return 'better';
  return 'neutral';
}

/**
 * Rebuild a `ShowRankingState` for one (user, show) from its durable DB rows:
 *
 * - `coldStart`: every ranking row with `rank_position IS NULL` (guaranteed by the write path to
 *   carry a non-null `cold_start_bucket`/`cold_start_sequence` instead — see `session.ts`'s
 *   `submitColdStartAnswer`).
 * - `ranked`: every ranking row with `rank_position IS NOT NULL`, ordered by it ascending (1 = best,
 *   matching `@/lib/ranking`'s convention).
 * - `history`: every comparison row, recorded from *both* sides — mirrors
 *   `comparativePlacement.ts`'s in-memory `recordComparison` exactly, since `addComparativeEpisode`
 *   looks up history from either episode's perspective (e.g. `findCommonReference` reads `b`'s own
 *   history) and needs both sides populated to work correctly.
 */
export function reconstructShowRankingState(
  rankingRows: readonly RankingRow[],
  comparisonRows: readonly ComparisonRow[]
): ShowRankingState {
  const coldStart = rankingRows
    .filter((row) => row.rank_position === null)
    .map((row) => ({
      episodeId: row.episode_id,
      // Non-null by the write-path invariant (a cold-start row always carries its bucket/sequence)
      // — fall back defensively rather than crash if that invariant is ever violated in the DB.
      bucket: (row.cold_start_bucket ?? 'neutral') as ColdStartBucket,
      sequence: row.cold_start_sequence ?? 0,
    }));

  const ranked = rankingRows
    .filter((row): row is RankingRow & { rank_position: number } => row.rank_position !== null)
    .sort((a, b) => a.rank_position - b.rank_position)
    .map((row) => row.episode_id);

  const history: ComparisonHistory = new Map();
  const push = (episodeId: EpisodeId, record: { with: EpisodeId; result: ComparisonResult }) => {
    const existing = history.get(episodeId) ?? [];
    existing.push(record);
    history.set(episodeId, existing);
  };

  for (const row of comparisonRows) {
    const aPerspective = resultFromA(row.result);
    push(row.episode_a_id, { with: row.episode_b_id, result: aPerspective });
    push(row.episode_b_id, { with: row.episode_a_id, result: invert(aPerspective) });
  }

  return { coldStart, ranked, history };
}
