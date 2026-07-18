/**
 * Read-only, derived-display stats for the per-show stats page (`/shows/[showId]/stats`) — tier
 * list, season-quality heatmap, and the "gatekeeper episode" gap. Pure functions over data
 * `getShowRankingDisplay` (`@/lib/ranking-session`) already computes; no DB/IO, same style as
 * `score.ts`/`confidence.ts` in this directory. Nothing here touches the ranking algorithm, the
 * scoring formula, or persistence — it's purely a read-only view over already-derived positions
 * and scores.
 */

export type Tier = 'S' | 'A' | 'B' | 'C' | 'D';

export interface RankedEntry {
  episodeId: string;
  /** 1-based rank position within the show's comparatively-ranked episodes, 1 = best. */
  rank: number;
}

/**
 * Quintile-based tier assignment by rank *position* (not absolute score) — robust across show
 * sizes. `scoreForPosition`'s absolute score range compresses for small shows (`score.ts`'s
 * `spread` function caps the usable 1-10 spread based on episode count), so tiering by absolute
 * score would leave small shows with empty top tiers even when they have a clear best episode.
 * Position-based quintiles don't have that problem: every non-empty show has *some* episode at
 * percentile 0.
 *
 * For N ranked episodes, an episode at 1-based `rank` gets percentile `(rank - 1) / N` (0 = best,
 * approaching 1 = worst): [0, 0.2) -> 'S', [0.2, 0.4) -> 'A', [0.4, 0.6) -> 'B', [0.6, 0.8) -> 'C',
 * [0.8, 1) -> 'D'. Small N can leave some tiers empty (e.g. N=3 never populates 'B' or 'D') —
 * expected, not a bug; callers render only the tiers that end up non-empty.
 */
export function assignTiers(ranked: readonly RankedEntry[]): Map<string, Tier> {
  const n = ranked.length;
  const result = new Map<string, Tier>();

  for (const { episodeId, rank } of ranked) {
    const percentile = (rank - 1) / n;
    let tier: Tier;
    if (percentile < 0.2) tier = 'S';
    else if (percentile < 0.4) tier = 'A';
    else if (percentile < 0.6) tier = 'B';
    else if (percentile < 0.8) tier = 'C';
    else tier = 'D';
    result.set(episodeId, tier);
  }

  return result;
}

export interface SeasonAverage {
  seasonNumber: number;
  averageScore: number;
  rankedEpisodeCount: number;
}

/**
 * Average score per season, computed only from episodes present in `ranked` — a season with zero
 * ranked episodes doesn't appear in the result at all (nothing to average, and showing a 0 or
 * omitted-but-implied average would misrepresent "no data" as "bad"). `episodeSeasonById` maps
 * every episode id (ranked or not) to its season number; an episode in `ranked` with no entry in
 * that map is skipped (defensive — shouldn't happen in practice since both are derived from the
 * same show's episode list).
 *
 * Result is sorted by season number ascending, matching how the stats page renders it.
 */
export function seasonAverageScores(
  ranked: readonly { episodeId: string; score: number }[],
  episodeSeasonById: ReadonlyMap<string, number>
): SeasonAverage[] {
  const totals = new Map<number, { total: number; count: number }>();

  for (const { episodeId, score } of ranked) {
    const seasonNumber = episodeSeasonById.get(episodeId);
    if (seasonNumber === undefined) continue;

    const entry = totals.get(seasonNumber) ?? { total: 0, count: 0 };
    entry.total += score;
    entry.count += 1;
    totals.set(seasonNumber, entry);
  }

  return [...totals.entries()]
    .map(([seasonNumber, { total, count }]) => ({
      seasonNumber,
      averageScore: total / count,
      rankedEpisodeCount: count,
    }))
    .sort((a, b) => a.seasonNumber - b.seasonNumber);
}

export interface GatekeeperGap {
  betterEpisodeId: string;
  betterRank: number;
  worseEpisodeId: string;
  worseRank: number;
  /** betterScore - worseScore, always positive. */
  gap: number;
}

/**
 * The single biggest score gap between two *adjacent* ranked positions (rank N and rank N+1) —
 * the "gatekeeper": the episode right before this gap is the last one clearing a quality bar the
 * next episode down misses badly. Only adjacent pairs are considered (not every pair), since a
 * gap between non-adjacent ranks would already be "explained" by whatever's in between.
 *
 * Sorts a copy by `rank` first rather than trusting input order, so callers can pass `ranked` in
 * whatever order they have it. Returns `null` if fewer than 2 ranked episodes exist (no adjacent
 * pair to compare). On a tie for biggest gap, returns whichever adjacent pair is encountered first
 * when walking ranks ascending (an arbitrary but deterministic choice — ties aren't expected to be
 * common with real derived scores, and either pair is an equally valid "gatekeeper").
 */
export function findGatekeeperGap(
  ranked: readonly { episodeId: string; rank: number; score: number }[]
): GatekeeperGap | null {
  if (ranked.length < 2) return null;

  const byRank = [...ranked].sort((a, b) => a.rank - b.rank);
  let best: GatekeeperGap | null = null;

  for (let i = 0; i < byRank.length - 1; i++) {
    const better = byRank[i];
    const worse = byRank[i + 1];
    const gap = better.score - worse.score;
    if (best === null || gap > best.gap) {
      best = {
        betterEpisodeId: better.episodeId,
        betterRank: better.rank,
        worseEpisodeId: worse.episodeId,
        worseRank: worse.rank,
        gap,
      };
    }
  }

  return best;
}
