import { COLD_START_THRESHOLD } from './constants';
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

/** Whether a show's *next* ranked episode should go through cold start (vs. comparative placement). */
export function isColdStart(state: ShowRankingState): boolean {
  return totalEpisodeCount(state) < COLD_START_THRESHOLD;
}

/**
 * Add a new episode to a show during cold start: fewer than COLD_START_THRESHOLD episodes
 * ranked so far. No comparisons happen — just record the coarse bucket judgment.
 */
export function addColdStartEpisode(
  state: ShowRankingState,
  episodeId: EpisodeId,
  bucket: ColdStartBucket
): ShowRankingState {
  const count = totalEpisodeCount(state);
  if (count >= COLD_START_THRESHOLD) {
    throw new Error(
      `Show already has ${count} ranked episodes (>= COLD_START_THRESHOLD=${COLD_START_THRESHOLD}); ` +
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
 * already reached COLD_START_THRESHOLD total episodes.
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
  comparator: Comparator
): Promise<ShowRankingState> {
  const count = totalEpisodeCount(state);
  if (count < COLD_START_THRESHOLD) {
    throw new Error(
      `Show only has ${count} ranked episodes (< COLD_START_THRESHOLD=${COLD_START_THRESHOLD}); ` +
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
 * dispatches to cold-start or comparative placement. Callers should check `isColdStart(state)`
 * to decide which `input` shape to build (e.g. which UI to show); this function still re-
 * validates via the underlying functions' own threshold guards.
 */
export async function rankNewEpisode(
  state: ShowRankingState,
  episodeId: EpisodeId,
  input: RankNewEpisodeInput
): Promise<ShowRankingState> {
  if (input.mode === 'coldStart') {
    return addColdStartEpisode(state, episodeId, input.bucket);
  }
  return addComparativeEpisode(state, episodeId, input.comparator);
}

/** The show's current best-to-worst episode order, whichever mode it's in. */
export function currentDisplayOrder(state: ShowRankingState): EpisodeId[] {
  if (state.ranked.length > 0) return [...state.ranked];
  return orderColdStartIds(state.coldStart);
}
