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

export interface ComparisonRow {
  episodeAId: string;
  episodeBId: string;
  result: 'a_better' | 'b_better' | 'neutral';
}

/** Result of a *direct*, recorded comparison from `rankedEpisodeIds[i]`'s own perspective; `null` = never directly compared. */
export type MatrixCellResult = 'win' | 'loss' | 'tie' | null;

/**
 * N×N win/loss/tie matrix over `rankedEpisodeIds` (assumed already in rank order, best-to-worst —
 * callers pass `display.ranked`'s order through unchanged), built purely from *direct* recorded
 * `episode_comparisons` rows. `matrix[i][j]` is the outcome for `rankedEpisodeIds[i]` against
 * `rankedEpisodeIds[j]`: `'win'` if `i` beat `j`, `'loss'` if `i` lost to `j`, `'tie'` for a neutral
 * result, or `null` if the two were never directly compared. This deliberately does *not* attempt to
 * infer a transitive result (e.g. i beat k and k beat j does not imply i beat j here) — the whole
 * point of this matrix is to show only what was actually, directly recorded.
 *
 * The diagonal (`matrix[i][i]`) is always `null` — an episode was never compared against itself.
 * Every off-diagonal pair is intentionally the mirror of its transpose: if `matrix[i][j]` is
 * `'win'`, `matrix[j][i]` is `'loss'` (never also `'win'`), and a `'tie'` mirrors to `'tie'`.
 *
 * A comparison row is only applied if *both* sides are present in `rankedEpisodeIds` — a comparison
 * touching an episode that isn't (yet, or ever) ranked has no cell to occupy in this matrix.
 */
export function buildComparisonMatrix(
  rankedEpisodeIds: readonly string[],
  comparisons: readonly ComparisonRow[]
): MatrixCellResult[][] {
  const indexById = new Map(rankedEpisodeIds.map((id, index) => [id, index]));
  const n = rankedEpisodeIds.length;
  const matrix: MatrixCellResult[][] = Array.from({ length: n }, () => new Array<MatrixCellResult>(n).fill(null));

  for (const { episodeAId, episodeBId, result } of comparisons) {
    const i = indexById.get(episodeAId);
    const j = indexById.get(episodeBId);
    if (i === undefined || j === undefined) continue; // one or both sides aren't a ranked episode

    if (result === 'a_better') {
      matrix[i][j] = 'win';
      matrix[j][i] = 'loss';
    } else if (result === 'b_better') {
      matrix[i][j] = 'loss';
      matrix[j][i] = 'win';
    } else {
      matrix[i][j] = 'tie';
      matrix[j][i] = 'tie';
    }
  }

  return matrix;
}

export interface ComparisonHistoryEntry {
  opponentEpisodeId: string;
  result: 'win' | 'loss' | 'tie';
}

/**
 * Per-episode comparison history, derived from `buildComparisonMatrix`'s output — for each ranked
 * episode, every other ranked episode it was *directly* compared against and the outcome, in rank
 * order (best-to-worst opponent first). An episode with no direct comparisons at all gets an empty
 * array (never omitted from the map), leaving the "show it anyway vs. omit it" call to the caller.
 *
 * `AppSpec.md` originally called this a "comparison/relationship graph." This ships as a flat list
 * instead of an actual node-link graph: a real graph-layout visualization would mean pulling in a
 * graph-layout library as a new dependency for a single-user personal project, which cuts against
 * this project's documented low-ceremony/avoid-over-engineering posture (see
 * `Docs/CriticalReview.md`'s top finding). This is a deliberate scope call, not a missed spec — the
 * underlying information (which episodes were directly compared, and who won) is identical either
 * way; only the rendering differs.
 */
export function comparisonHistoryByEpisode(
  rankedEpisodeIds: readonly string[],
  matrix: readonly MatrixCellResult[][]
): Map<string, ComparisonHistoryEntry[]> {
  const history = new Map<string, ComparisonHistoryEntry[]>();

  for (let i = 0; i < rankedEpisodeIds.length; i++) {
    const entries: ComparisonHistoryEntry[] = [];
    for (let j = 0; j < rankedEpisodeIds.length; j++) {
      if (i === j) continue;
      const result = matrix[i]?.[j] ?? null;
      if (result !== null) {
        entries.push({ opponentEpisodeId: rankedEpisodeIds[j], result });
      }
    }
    history.set(rankedEpisodeIds[i], entries);
  }

  return history;
}

export interface TimelineEpisodeInfo {
  seasonNumber: number;
  episodeNumber: number;
  /** ISO `YYYY-MM-DD` (or `null` for pre-migration imports missing this field). */
  airDate: string | null;
}

export interface TimelinePoint {
  episodeId: string;
  score: number;
}

/**
 * Chronological comparator shared by `buildSeasonTimelineOrder` (below) and `@/lib/ranking/
 * rankAllOrder`'s "Rank all" queue ordering — both need the exact same "oldest/earliest first"
 * semantics, just applied to different callers' data shapes. Sorts primarily by `air_date` — plain
 * string comparison is correct here since the column is always ISO `YYYY-MM-DD`. Episodes missing
 * `air_date` (pre-migration imports) fall back to season/episode order, which is itself already a
 * complete, monotonic ordering over every episode — so an undated episode simply lands in its
 * season/episode position relative to whichever neighbors it's compared against, dated or not,
 * without needing an invented date. The same season/episode fallback also breaks ties between two
 * episodes that share an air date (e.g. a same-day premiere pair).
 *
 * Kept deliberately simple: no attempt to interpolate a synthetic date for undated episodes, and no
 * separate "two groups" handling — one comparator, applied uniformly, is enough for a personal-use
 * app at this scale. Exported (rather than kept private to this module) specifically so callers with
 * a different data shape than `TimelinePoint`/`TimelineEpisodeInfo` can reuse this exact logic
 * instead of re-implementing the same fallback rule.
 */
export function compareEpisodeChronologically(
  infoA: TimelineEpisodeInfo,
  infoB: TimelineEpisodeInfo
): number {
  if (infoA.airDate && infoB.airDate && infoA.airDate !== infoB.airDate) {
    return infoA.airDate < infoB.airDate ? -1 : 1;
  }
  if (infoA.seasonNumber !== infoB.seasonNumber) return infoA.seasonNumber - infoB.seasonNumber;
  return infoA.episodeNumber - infoB.episodeNumber;
}

/**
 * Chronological ordering for the season-timeline chart. See `compareEpisodeChronologically` above
 * for the actual comparison rule; this just applies it to `TimelinePoint`s via their looked-up
 * `TimelineEpisodeInfo`.
 */
export function buildSeasonTimelineOrder(
  ranked: readonly TimelinePoint[],
  episodeInfoById: ReadonlyMap<string, TimelineEpisodeInfo>
): TimelinePoint[] {
  return [...ranked].sort((a, b) => {
    const infoA = episodeInfoById.get(a.episodeId);
    const infoB = episodeInfoById.get(b.episodeId);
    if (!infoA || !infoB) return 0; // defensive; shouldn't happen — same invariant as `seasonAverageScores`

    return compareEpisodeChronologically(infoA, infoB);
  });
}
