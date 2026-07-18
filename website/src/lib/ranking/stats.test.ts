import { describe, expect, it } from 'vitest';
import { assignTiers, findGatekeeperGap, seasonAverageScores } from './stats';

describe('assignTiers', () => {
  it('N=5: exact quintile boundaries, one episode per tier', () => {
    const ranked = [1, 2, 3, 4, 5].map((rank) => ({ episodeId: `e${rank}`, rank }));
    const tiers = assignTiers(ranked);
    expect(tiers.get('e1')).toBe('S'); // percentile 0
    expect(tiers.get('e2')).toBe('A'); // percentile 0.2 (boundary -> next tier)
    expect(tiers.get('e3')).toBe('B'); // percentile 0.4 (boundary -> next tier)
    expect(tiers.get('e4')).toBe('C'); // percentile 0.6 (boundary -> next tier)
    expect(tiers.get('e5')).toBe('D'); // percentile 0.8 (boundary -> next tier)
  });

  it('N=10: two episodes per tier', () => {
    const ranked = Array.from({ length: 10 }, (_, i) => ({ episodeId: `e${i + 1}`, rank: i + 1 }));
    const tiers = assignTiers(ranked);
    expect(tiers.get('e1')).toBe('S');
    expect(tiers.get('e2')).toBe('S');
    expect(tiers.get('e3')).toBe('A');
    expect(tiers.get('e4')).toBe('A');
    expect(tiers.get('e5')).toBe('B');
    expect(tiers.get('e6')).toBe('B');
    expect(tiers.get('e7')).toBe('C');
    expect(tiers.get('e8')).toBe('C');
    expect(tiers.get('e9')).toBe('D');
    expect(tiers.get('e10')).toBe('D');
  });

  it('N=3: small show leaves some tiers empty (B and D unused)', () => {
    const ranked = [1, 2, 3].map((rank) => ({ episodeId: `e${rank}`, rank }));
    const tiers = assignTiers(ranked);
    // percentiles: e1=0 -> S, e2=1/3~=0.333 -> A, e3=2/3~=0.667 -> C
    expect(tiers.get('e1')).toBe('S');
    expect(tiers.get('e2')).toBe('A');
    expect(tiers.get('e3')).toBe('C');
    expect(new Set(tiers.values())).toEqual(new Set(['S', 'A', 'C']));
  });

  it('N=4: small show leaves D empty', () => {
    const ranked = [1, 2, 3, 4].map((rank) => ({ episodeId: `e${rank}`, rank }));
    const tiers = assignTiers(ranked);
    // percentiles: 0, 0.25, 0.5, 0.75 -> S, A, B, C
    expect(tiers.get('e1')).toBe('S');
    expect(tiers.get('e2')).toBe('A');
    expect(tiers.get('e3')).toBe('B');
    expect(tiers.get('e4')).toBe('C');
    expect(new Set(tiers.values())).toEqual(new Set(['S', 'A', 'B', 'C']));
  });

  it('returns an empty map for an empty ranked list', () => {
    expect(assignTiers([]).size).toBe(0);
  });
});

describe('seasonAverageScores', () => {
  it('averages only ranked episodes per season, and excludes a season with zero ranked episodes', () => {
    const ranked = [
      { episodeId: 'e1', score: 9 },
      { episodeId: 'e2', score: 7 },
      { episodeId: 'e3', score: 5 },
      { episodeId: 'e4', score: 3 },
    ];
    const episodeSeasonById = new Map([
      ['e1', 1],
      ['e2', 1],
      ['e3', 2],
      ['e4', 2],
      ['e5', 3], // season 3 has an episode, but it's never ranked
    ]);

    const result = seasonAverageScores(ranked, episodeSeasonById);

    expect(result).toEqual([
      { seasonNumber: 1, averageScore: 8, rankedEpisodeCount: 2 },
      { seasonNumber: 2, averageScore: 4, rankedEpisodeCount: 2 },
    ]);
    expect(result.find((s) => s.seasonNumber === 3)).toBeUndefined();
  });

  it('is sorted by season number ascending regardless of input order', () => {
    const ranked = [
      { episodeId: 'e3', score: 6 },
      { episodeId: 'e1', score: 10 },
      { episodeId: 'e2', score: 2 },
    ];
    const episodeSeasonById = new Map([
      ['e1', 1],
      ['e2', 3],
      ['e3', 2],
    ]);

    const result = seasonAverageScores(ranked, episodeSeasonById);
    expect(result.map((s) => s.seasonNumber)).toEqual([1, 2, 3]);
  });

  it('returns an empty array when nothing is ranked', () => {
    expect(seasonAverageScores([], new Map([['e1', 1]]))).toEqual([]);
  });
});

describe('findGatekeeperGap', () => {
  it('finds the single biggest gap between adjacent ranked positions', () => {
    const ranked = [
      { episodeId: 'a', rank: 1, score: 10 },
      { episodeId: 'b', rank: 2, score: 9 },
      { episodeId: 'c', rank: 3, score: 4 },
      { episodeId: 'd', rank: 4, score: 3.5 },
    ];
    const result = findGatekeeperGap(ranked);
    expect(result).toEqual({
      betterEpisodeId: 'b',
      betterRank: 2,
      worseEpisodeId: 'c',
      worseRank: 3,
      gap: 5,
    });
  });

  it('does not consider non-adjacent pairs, even if their gap looks bigger', () => {
    // rank1 -> rank3 gap is 6, but the biggest *adjacent* gap is rank2->rank3 (4).
    const ranked = [
      { episodeId: 'a', rank: 1, score: 10 },
      { episodeId: 'b', rank: 2, score: 8 },
      { episodeId: 'c', rank: 3, score: 4 },
    ];
    const result = findGatekeeperGap(ranked);
    expect(result).toEqual({
      betterEpisodeId: 'b',
      betterRank: 2,
      worseEpisodeId: 'c',
      worseRank: 3,
      gap: 4,
    });
  });

  it('handles input not pre-sorted by rank', () => {
    const ranked = [
      { episodeId: 'c', rank: 3, score: 4 },
      { episodeId: 'a', rank: 1, score: 10 },
      { episodeId: 'b', rank: 2, score: 9 },
    ];
    const result = findGatekeeperGap(ranked);
    expect(result?.betterEpisodeId).toBe('b');
    expect(result?.worseEpisodeId).toBe('c');
    expect(result?.gap).toBeCloseTo(5, 10);
  });

  it('on a tie for biggest gap, returns one of the tied adjacent pairs', () => {
    const ranked = [
      { episodeId: 'a', rank: 1, score: 10 },
      { episodeId: 'b', rank: 2, score: 8 },
      { episodeId: 'c', rank: 3, score: 6 },
      { episodeId: 'd', rank: 4, score: 4 },
    ];
    const result = findGatekeeperGap(ranked);
    expect(result).not.toBeNull();
    expect(result!.gap).toBeCloseTo(2, 10);
    // Whichever pair is returned, it must be a genuinely adjacent rank pair.
    expect(result!.worseRank - result!.betterRank).toBe(1);
  });

  it('returns null for fewer than 2 ranked episodes', () => {
    expect(findGatekeeperGap([])).toBeNull();
    expect(findGatekeeperGap([{ episodeId: 'a', rank: 1, score: 10 }])).toBeNull();
  });
});
