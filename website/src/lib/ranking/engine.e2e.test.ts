import { describe, expect, it } from 'vitest';
import { COLD_START_THRESHOLD } from './constants';
import { createInitialShowState, rankNewEpisode } from './engine';
import { scoresForRankedList } from './score';
import type { ColdStartBucket, Comparator, EpisodeId } from './types';

/**
 * End-to-end simulation: rank ~18 synthetic episodes through the full pipeline (cold start ->
 * comparative placement -> tie-break as needed), using a scripted oracle over a hidden "true
 * quality" value per episode (1-100, higher = better). Two episodes deliberately share the same
 * quality (55) to force at least one genuine tie during the run, exercising the tie-break
 * mechanic rather than just binary insertion in isolation.
 */
describe('end-to-end ranking simulation', () => {
  const qualities = [62, 15, 88, 41, 55, 73, 9, 97, 30, 55, 68, 24, 3, 80, 47, 91, 36, 58];
  const ids = qualities.map((_, i) => `ep${i}`);
  const quality: Record<EpisodeId, number> = Object.fromEntries(
    ids.map((id, i) => [id, qualities[i]])
  );

  // Sanity check on the test data itself: exactly one duplicate pair (55/55), everything else
  // distinct, so we know precisely where the forced tie comes from.
  it('fixture sanity: exactly one duplicate quality value among the synthetic episodes', () => {
    const counts = new Map<number, number>();
    for (const q of qualities) counts.set(q, (counts.get(q) ?? 0) + 1);
    const duplicates = [...counts.values()].filter((c) => c > 1);
    expect(duplicates).toEqual([2]);
  });

  it('ranks the full sequence and produces a quality-monotonic, in-range result', async () => {
    let state = createInitialShowState();
    let neutralCount = 0;

    const comparator: Comparator = (subject, reference) => {
      const a = quality[subject];
      const b = quality[reference];
      if (a === b) {
        neutralCount += 1;
        return 'neutral';
      }
      return a > b ? 'better' : 'worse';
    };

    // Cold-start bucket derived from quality, as a stand-in for a user's coarse judgment
    // (only used for the first COLD_START_THRESHOLD episodes).
    const bucketFor = (q: number): ColdStartBucket => {
      if (q >= 60) return 'liked';
      if (q <= 30) return 'disliked';
      return 'neutral';
    };

    for (const id of ids) {
      if (state.coldStart.length + state.ranked.length < COLD_START_THRESHOLD) {
        state = await rankNewEpisode(state, id, {
          mode: 'coldStart',
          bucket: bucketFor(quality[id]),
        });
      } else {
        state = await rankNewEpisode(state, id, { mode: 'comparative', comparator });
      }
    }

    // All 18 episodes should have made it into the comparative ranked list (cold-start folds
    // in on the first comparative placement — see engine.ts's documented judgment call).
    expect(state.coldStart).toHaveLength(0);
    expect(state.ranked).toHaveLength(ids.length);

    // The forced duplicate (quality 55) guarantees the tie-break path actually ran at least once.
    expect(neutralCount).toBeGreaterThanOrEqual(1);

    // Final ordering is monotonic with respect to hidden true quality (non-increasing: the one
    // tied pair may land in either relative order, but nothing strictly worse ever outranks
    // something strictly better).
    const orderedQualities = state.ranked.map((id) => quality[id]);
    for (let i = 1; i < orderedQualities.length; i++) {
      expect(orderedQualities[i]).toBeLessThanOrEqual(orderedQualities[i - 1]);
    }

    // Every derived score lands in [1, 10].
    const scores = scoresForRankedList(state.ranked);
    for (const score of scores.values()) {
      expect(score).toBeGreaterThanOrEqual(1);
      expect(score).toBeLessThanOrEqual(10);
    }
    // And the usual boundary guarantees from the score formula itself.
    expect(scores.get(state.ranked[0])).toBeCloseTo(10, 10);
    expect(scores.get(state.ranked[state.ranked.length - 1])).toBeCloseTo(1, 10);
  });
});
