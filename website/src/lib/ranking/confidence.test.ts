import { describe, expect, it } from 'vitest';
import { decisiveComparisonCount, episodeConfidence, showConfidence } from './confidence';
import type { ComparisonHistory } from './types';

function historyOf(entries: Record<string, { with: string; result: 'better' | 'worse' | 'neutral' }[]>): ComparisonHistory {
  return new Map(Object.entries(entries));
}

describe('decisiveComparisonCount', () => {
  it('is 0 for an episode with no history at all', () => {
    expect(decisiveComparisonCount('a', new Map())).toBe(0);
  });

  it('counts only non-neutral records, both better and worse', () => {
    const history = historyOf({
      a: [
        { with: 'b', result: 'better' },
        { with: 'c', result: 'worse' },
        { with: 'd', result: 'neutral' },
      ],
    });
    expect(decisiveComparisonCount('a', history)).toBe(2);
  });

  it('is 0 when every recorded comparison is neutral', () => {
    const history = historyOf({
      a: [
        { with: 'b', result: 'neutral' },
        { with: 'c', result: 'neutral' },
      ],
    });
    expect(decisiveComparisonCount('a', history)).toBe(0);
  });
});

describe('episodeConfidence', () => {
  it('is 100 whenever showEpisodeCount <= 1, regardless of history (log2(1)=0 / log2(0)=-Infinity edge case)', () => {
    expect(episodeConfidence('a', new Map(), 1)).toBe(100);
    expect(episodeConfidence('a', new Map(), 0)).toBe(100);
    const history = historyOf({ a: [{ with: 'b', result: 'better' }] });
    expect(episodeConfidence('a', history, 1)).toBe(100);
  });

  it('is 0 for an episode with zero decisive comparisons in a show with more than one episode', () => {
    expect(episodeConfidence('a', new Map(), 4)).toBe(0);
  });

  it('rises toward 100 as decisive comparisons accumulate relative to log2(showEpisodeCount)', () => {
    // log2(8) = 3, so 1 decisive comparison -> 1/3 * 100 ~= 33.33.
    const oneDecisive = historyOf({ a: [{ with: 'b', result: 'better' }] });
    expect(episodeConfidence('a', oneDecisive, 8)).toBeCloseTo((1 / 3) * 100, 10);

    // 3 decisive comparisons meets the log2(8)=3 minimum exactly -> 100.
    const threeDecisive = historyOf({
      a: [
        { with: 'b', result: 'better' },
        { with: 'c', result: 'worse' },
        { with: 'd', result: 'better' },
      ],
    });
    expect(episodeConfidence('a', threeDecisive, 8)).toBeCloseTo(100, 10);
  });

  it('caps at 100 rather than exceeding it once decisive comparisons overshoot log2(showEpisodeCount)', () => {
    const manyDecisive = historyOf({
      a: [
        { with: 'b', result: 'better' },
        { with: 'c', result: 'worse' },
        { with: 'd', result: 'better' },
        { with: 'e', result: 'worse' },
        { with: 'f', result: 'better' },
      ],
    });
    expect(episodeConfidence('a', manyDecisive, 4)).toBe(100);
  });

  it('ignores neutral comparisons entirely — an episode with only neutral history scores the same as one with none', () => {
    const onlyNeutral = historyOf({
      a: [
        { with: 'b', result: 'neutral' },
        { with: 'c', result: 'neutral' },
      ],
    });
    expect(episodeConfidence('a', onlyNeutral, 8)).toBe(0);
  });
});

describe('showConfidence', () => {
  it('throws for an empty rankedEpisodeIds list rather than silently returning a number', () => {
    expect(() => showConfidence([], new Map(), 4)).toThrow();
  });

  it('is the plain average of episodeConfidence across every ranked episode', () => {
    // log2(4) = 2. a: 2 decisive -> 100. b: 1 decisive -> 50. c: 0 decisive -> 0.
    const history = historyOf({
      a: [
        { with: 'x', result: 'better' },
        { with: 'y', result: 'worse' },
      ],
      b: [{ with: 'x', result: 'better' }],
      c: [],
    });
    expect(showConfidence(['a', 'b', 'c'], history, 4)).toBeCloseTo((100 + 50 + 0) / 3, 10);
  });

  it('is 100 for a show with a single ranked episode (showEpisodeCount <= 1 edge case)', () => {
    expect(showConfidence(['a'], new Map(), 1)).toBe(100);
  });
});
