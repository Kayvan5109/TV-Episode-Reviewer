import { effectiveColdStartThreshold } from './constants';
import { orderColdStartIds } from './coldStart';
import { placeEpisodeComparatively } from './comparativePlacement';
import type {
  ColdStartBucket,
  Comparator,
  EpisodeId,
  ShowRankingState,
} from './types';

/** A fresh, empty ranking state for a show with no episodes ranked yet. */
export function createInitialShowState(): ShowRankingState {
  return { coldStart: [], ranked: [], history: new Map() };
}

function totalEpisodeCount(state: ShowRankingState): number {
  return state.coldStart.length + state.ranked.length;
}

/**
 * Whether a show's *next* ranked episode should go through cold start (vs. comparative
 * placement). `totalShowEpisodeCount` is the show's total episode count (not just how many have
 * been ranked so far) — required to compute the per-show effective threshold (see
 * `effectiveColdStartThreshold` in constants.ts): a show with fewer than `COLD_START_THRESHOLD`
 * total episodes only cold-starts its first episode, then goes straight to comparative placement.
 */
export function isColdStart(state: ShowRankingState, totalShowEpisodeCount: number): boolean {
  return totalEpisodeCount(state) < effectiveColdStartThreshold(totalShowEpisodeCount);
}

/**
 * Add a new episode to a show during cold start: fewer than the show's effective cold-start
 * threshold (see `effectiveColdStartThreshold`) ranked so far. No comparisons happen — just
 * record the coarse bucket judgment.
 */
export function addColdStartEpisode(
  state: ShowRankingState,
  episodeId: EpisodeId,
  bucket: ColdStartBucket,
  totalShowEpisodeCount: number
): ShowRankingState {
  const count = totalEpisodeCount(state);
  const threshold = effectiveColdStartThreshold(totalShowEpisodeCount);
  if (count >= threshold) {
    throw new Error(
      `Show already has ${count} ranked episodes (>= effective cold-start threshold=${threshold}); ` +
        'use comparative placement instead.'
    );
  }
  const sequence = state.coldStart.length; // simple monotonic counter; unique within a show
  return {
    ...state,
    coldStart: [...state.coldStart, { episodeId, bucket, sequence }],
  };
}

/**
 * Add a new episode via comparative (binary-insertion) placement. Requires the show to have
 * already reached its effective cold-start threshold (see `effectiveColdStartThreshold`) in
 * total episodes ranked so far.
 *
 * JUDGMENT CALL — flagged for review: this isn't addressed by the docs, but is required to
 * make the algorithm function once a show crosses the threshold. The very first comparative
 * placement seeds the comparative ranked list from the existing cold-start episodes, ordered
 * per `orderColdStart`'s rule (see coldStart.ts), and clears the cold-start list. This
 * effectively folds cold-start episodes into the comparison pool the moment comparative mode
 * begins — which touches on AppSpec.md's still-open "do cold-start-only episodes ever join the
 * comparison pool" question. Flagging this for explicit review rather than treating it as
 * quietly settled by this implementation detail.
 */
export async function addComparativeEpisode(
  state: ShowRankingState,
  episodeId: EpisodeId,
  comparator: Comparator,
  totalShowEpisodeCount: number
): Promise<ShowRankingState> {
  const count = totalEpisodeCount(state);
  const threshold = effectiveColdStartThreshold(totalShowEpisodeCount);
  if (count < threshold) {
    throw new Error(
      `Show only has ${count} ranked episodes (< effective cold-start threshold=${threshold}); ` +
        'use cold-start placement instead.'
    );
  }

  const hasMigrated = state.ranked.length > 0;
  const seedRanked = hasMigrated ? state.ranked : orderColdStartIds(state.coldStart);

  const { ranked, history } = await placeEpisodeComparatively(
    seedRanked,
    state.history,
    episodeId,
    comparator
  );

  return {
    coldStart: hasMigrated ? state.coldStart : [],
    ranked,
    history,
  };
}

/** Discriminated input for `rankNewEpisode`, so callers can't accidentally pair the wrong mode. */
export type RankNewEpisodeInput =
  | { mode: 'coldStart'; bucket: ColdStartBucket }
  | { mode: 'comparative'; comparator: Comparator };

/**
 * Convenience entry point matching Docs/DevelopmentPlan.md's "Ranking Algorithm" section:
 * dispatches to cold-start or comparative placement. Callers should check
 * `isColdStart(state, totalShowEpisodeCount)` to decide which `input` shape to build (e.g. which
 * UI to show); this function still re-validates via the underlying functions' own threshold
 * guards.
 */
export async function rankNewEpisode(
  state: ShowRankingState,
  episodeId: EpisodeId,
  input: RankNewEpisodeInput,
  totalShowEpisodeCount: number
): Promise<ShowRankingState> {
  if (input.mode === 'coldStart') {
    return addColdStartEpisode(state, episodeId, input.bucket, totalShowEpisodeCount);
  }
  return addComparativeEpisode(state, episodeId, input.comparator, totalShowEpisodeCount);
}

/** The show's current best-to-worst episode order, whichever mode it's in. */
export function currentDisplayOrder(state: ShowRankingState): EpisodeId[] {
  if (state.ranked.length > 0) return [...state.ranked];
  return orderColdStartIds(state.coldStart);
}
