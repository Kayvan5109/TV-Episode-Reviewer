import { describe, expect, it } from 'vitest';
import { scoreForPosition, scoresForRankedList, spread } from './score';

describe('spread', () => {
  it('is 0 for a single episode', () => {
    expect(spread(1)).toBeCloseTo(0, 10);
  });

  it('grows linearly below N=8', () => {
    expect(spread(2)).toBeCloseTo(9 / 7, 10);
    expect(spread(6)).toBeCloseTo((9 * 5) / 7, 10);
  });

  it('caps at 9 from N=8 onward', () => {
    expect(spread(8)).toBeCloseTo(9, 10);
    expect(spread(20)).toBeCloseTo(9, 10);
  });
});

describe('scoreForPosition', () => {
  it('N=1: the single episode scores exactly 10', () => {
    expect(scoreForPosition(1, 1)).toBe(10);
  });

  it('N=2: best is 10, worst is compressed (~8.71), not 1', () => {
    expect(scoreForPosition(1, 2)).toBeCloseTo(10, 10);
    expect(scoreForPosition(2, 2)).toBeCloseTo(10 - 9 / 7, 10); // = 61/7 ~= 8.714285714285714
    expect(scoreForPosition(2, 2)).toBeGreaterThan(1);
  });

  it('N=6: still compressed relative to the full 1-10 spread', () => {
    expect(scoreForPosition(1, 6)).toBeCloseTo(10, 10);
    expect(scoreForPosition(2, 6)).toBeCloseTo(10 - (1 * ((9 * 5) / 7)) / 5, 10);
    expect(scoreForPosition(3, 6)).toBeCloseTo(10 - (2 * ((9 * 5) / 7)) / 5, 10);
    expect(scoreForPosition(4, 6)).toBeCloseTo(10 - (3 * ((9 * 5) / 7)) / 5, 10);
    expect(scoreForPosition(5, 6)).toBeCloseTo(10 - (4 * ((9 * 5) / 7)) / 5, 10);
    expect(scoreForPosition(6, 6)).toBeCloseTo(10 - (9 * 5) / 7, 10); // ~= 3.5714285714285716
    expect(scoreForPosition(6, 6)).toBeGreaterThan(1);
  });

  it('N=8: reaches the full 1-10 spread (worst is exactly 1)', () => {
    expect(scoreForPosition(1, 8)).toBeCloseTo(10, 10);
    expect(scoreForPosition(8, 8)).toBeCloseTo(1, 10);
    expect(scoreForPosition(4, 8)).toBeCloseTo(10 - (3 * 9) / 7, 10);
  });

  it('N=20: still spans the full 1-10 spread (spread is capped, not shrinking further)', () => {
    expect(scoreForPosition(1, 20)).toBeCloseTo(10, 10);
    expect(scoreForPosition(20, 20)).toBeCloseTo(1, 10);
    expect(scoreForPosition(10, 20)).toBeCloseTo(10 - (9 * 9) / 19, 10);
  });

  it('throws for a position out of [1, episodeCount] range', () => {
    expect(() => scoreForPosition(0, 5)).toThrow();
    expect(() => scoreForPosition(6, 5)).toThrow();
    expect(() => scoreForPosition(1, 0)).toThrow();
  });
});

describe('scoresForRankedList', () => {
  it('assigns position 1..N in list order, best first', () => {
    const scores = scoresForRankedList(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(scores.size).toBe(8);
    expect(scores.get('a')).toBeCloseTo(10, 10);
    expect(scores.get('h')).toBeCloseTo(1, 10);
    // Monotonically non-increasing down the list.
    const values = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((k) => scores.get(k)!);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThan(values[i - 1]);
    }
  });
});
