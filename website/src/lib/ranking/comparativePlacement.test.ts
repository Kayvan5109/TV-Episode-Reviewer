import { describe, expect, it, vi } from 'vitest';
import {
  findCommonReference,
  placeEpisodeComparatively,
  resolveTie,
} from './comparativePlacement';
import type { Comparator, ComparisonHistory, EpisodeId } from './types';

/** Scripted oracle: episodes have a hidden "true quality" (higher = better); equal = neutral. */
function qualityOracle(quality: Record<EpisodeId, number>): Comparator {
  return (subject, reference) => {
    const a = quality[subject];
    const b = quality[reference];
    if (a === b) return 'neutral';
    return a > b ? 'better' : 'worse';
  };
}

async function insertAllInOrder(
  ids: EpisodeId[],
  quality: Record<EpisodeId, number>
): Promise<EpisodeId[]> {
  let ranked: EpisodeId[] = [ids[0]];
  let history: ComparisonHistory = new Map();
  const comparator = qualityOracle(quality);
  for (const id of ids.slice(1)) {
    const result = await placeEpisodeComparatively(ranked, history, id, comparator);
    ranked = result.ranked;
    history = result.history;
  }
  return ranked;
}

describe('placeEpisodeComparatively — binary insertion correctness', () => {
  const sizes = [2, 3, 5, 8, 13, 20];

  for (const size of sizes) {
    it(`produces a quality-monotonic ranking for ${size} episodes`, async () => {
      // Deterministic pseudo-shuffle (37 is coprime to every tested size) so insertion order
      // isn't already sorted, while keeping every quality value distinct (no ties to resolve).
      const ids = Array.from({ length: size }, (_, i) => `ep${i}`);
      const quality: Record<EpisodeId, number> = {};
      ids.forEach((id, i) => {
        quality[id] = ((i * 37 + 11) % size) + 1;
      });
      expect(new Set(Object.values(quality)).size).toBe(size); // sanity: no accidental collisions

      const ranked = await insertAllInOrder(ids, quality);
      expect(ranked).toHaveLength(size);
      const qualities = ranked.map((id) => quality[id]);
      for (let i = 1; i < qualities.length; i++) {
        expect(qualities[i]).toBeLessThan(qualities[i - 1]);
      }
    });
  }

  it('uses roughly log2(n) comparisons per insertion when there are no ties', async () => {
    const size = 16;
    const ids = Array.from({ length: size }, (_, i) => `ep${i}`);
    const quality: Record<EpisodeId, number> = {};
    ids.forEach((id, i) => (quality[id] = size - i)); // already descending by construction

    let ranked: EpisodeId[] = [ids[0]];
    let history: ComparisonHistory = new Map();
    const comparator = vi.fn(qualityOracle(quality));

    for (const id of ids.slice(1)) {
      comparator.mockClear();
      const result = await placeEpisodeComparatively(ranked, history, id, comparator);
      ranked = result.ranked;
      history = result.history;
      expect(comparator.mock.calls.length).toBeLessThanOrEqual(
        Math.ceil(Math.log2(ranked.length)) + 1
      );
    }
  });

  it('rejects inserting an episode that is already in the ranked list', async () => {
    const comparator: Comparator = () => 'worse';
    await expect(
      placeEpisodeComparatively(['a', 'b'], new Map(), 'a', comparator)
    ).rejects.toThrow();
  });
});

describe('tie-break: common-reference selection (findCommonReference)', () => {
  it("finds a common reference episode from B's comparison history", () => {
    const ranked = ['e1', 'e2', 'e3', 'e4', 'e5'];
    const history: ComparisonHistory = new Map([['e3', [{ with: 'e1', result: 'worse' }]]]);
    expect(findCommonReference('e3', ranked, history, new Set(['e3']))).toBe('e1');
  });

  it('tier 1: picks the closest decisive partner to B in rank position when several exist', () => {
    const ranked = ['e1', 'e2', 'e3', 'e4', 'e5'];
    // e3 (index 2) has decisive history with e1 (index 0, distance 2) and e4 (index 3, distance 1).
    const history: ComparisonHistory = new Map([
      [
        'e3',
        [
          { with: 'e1', result: 'worse' },
          { with: 'e4', result: 'better' },
        ],
      ],
    ]);
    expect(findCommonReference('e3', ranked, history, new Set(['e3']))).toBe('e4');
  });

  it('tier 1: breaks equal-distance ties by lower rank index, deterministically', () => {
    const ranked = ['e1', 'e2', 'e3', 'e4', 'e5'];
    // e3 (index 2) is equally distant (2) from e1 (index 0) and e5 (index 4).
    const history: ComparisonHistory = new Map([
      [
        'e3',
        [
          { with: 'e5', result: 'better' },
          { with: 'e1', result: 'worse' },
        ],
      ],
    ]);
    expect(findCommonReference('e3', ranked, history, new Set(['e3']))).toBe('e1');
  });

  it('(a) tier 1 ignores a closer neutral partner in favor of a farther decisive one', () => {
    const ranked = ['e1', 'e2', 'e3', 'e4', 'e5'];
    // e3 (index 2) has a *neutral* record with e4 (index 3, distance 1) and a *decisive*
    // ('worse') record with e1 (index 0, distance 2). The closer partner is not decisive, so
    // tier 1 must skip it and pick the farther decisive one instead.
    const history: ComparisonHistory = new Map([
      [
        'e3',
        [
          { with: 'e4', result: 'neutral' },
          { with: 'e1', result: 'worse' },
        ],
      ],
    ]);
    expect(findCommonReference('e3', ranked, history, new Set(['e3']))).toBe('e1');
  });

  it('(b) tier 2: falls back to the closest episode in rank when B has history but none of it is decisive', () => {
    const ranked = ['e1', 'e2', 'e3', 'e4', 'e5'];
    // e3 (index 2) has only neutral history (with e2 and e4) — tier 1 finds nothing, so tier 2
    // falls back to plain rank proximity: e2 (index 1) and e4 (index 3) tie at distance 1,
    // broken by lower rank index.
    const history: ComparisonHistory = new Map([
      [
        'e3',
        [
          { with: 'e2', result: 'neutral' },
          { with: 'e4', result: 'neutral' },
        ],
      ],
    ]);
    expect(findCommonReference('e3', ranked, history, new Set(['e3']))).toBe('e2');
  });

  it('(c) tier 2: falls back to the closest episode in rank when B has zero comparison history', () => {
    const ranked = ['e1', 'e2', 'e3', 'e4', 'e5'];
    // Same tier-2 fallback as (b), just arrived at via "no history" rather than "no decisive
    // history" — both land on the same nearest-in-rank candidate.
    expect(findCommonReference('e3', ranked, new Map(), new Set(['e3']))).toBe('e2');
  });

  it('excludes episodes already tried in the current chain, at both tiers', () => {
    const ranked = ['e1', 'e2', 'e3', 'e4', 'e5'];
    // e3's only decisive partner (e4) is excluded, so tier 1 finds nothing; tier 2 must then
    // also skip the excluded e4 and land on the next-closest remaining candidate (e2).
    const history: ComparisonHistory = new Map([['e3', [{ with: 'e4', result: 'better' }]]]);
    expect(findCommonReference('e3', ranked, history, new Set(['e3', 'e4']))).toBe('e2');
  });

  it('returns undefined when every candidate has been excluded (tier 2 exhausted too)', () => {
    expect(
      findCommonReference('b', ['b', 'c1'], new Map(), new Set(['b', 'c1']))
    ).toBeUndefined();
  });

  it('returns undefined when B is the only episode in the ranked list', () => {
    expect(findCommonReference('b', ['b'], new Map(), new Set(['b']))).toBeUndefined();
  });
});

describe('tie-break: resolution, recursion cap, and fallbacks (resolveTie)', () => {
  it('resolves via a single common-reference comparison', async () => {
    const ranked = ['b', 'c1'];
    const history: ComparisonHistory = new Map([
      ['b', [{ with: 'c1', result: 'worse' }]],
      ['c1', [{ with: 'b', result: 'better' }]],
    ]);
    const comparator: Comparator = vi.fn((_subject, reference): 'better' => {
      if (reference === 'c1') return 'better';
      throw new Error(`unexpected comparison against ${reference}`);
    });

    const outcome = await resolveTie('a', 'b', ranked, history, comparator);
    expect(outcome).toEqual({ result: 'better' });
    expect(comparator).toHaveBeenCalledTimes(1);
    expect(comparator).toHaveBeenCalledWith('a', 'c1');
  });

  it('recurses to a second common reference when the first is also neutral', async () => {
    const ranked = ['b', 'c1', 'c2'];
    const history: ComparisonHistory = new Map([
      ['b', [{ with: 'c1', result: 'neutral' }]],
      [
        'c1',
        [
          { with: 'b', result: 'neutral' },
          { with: 'c2', result: 'worse' },
        ],
      ],
    ]);
    const comparator: Comparator = vi.fn((_subject, reference): 'neutral' | 'worse' => {
      if (reference === 'c1') return 'neutral';
      if (reference === 'c2') return 'worse';
      throw new Error(`unexpected comparison against ${reference}`);
    });

    const outcome = await resolveTie('a', 'b', ranked, history, comparator);
    expect(outcome).toEqual({ result: 'worse' });
    expect(comparator).toHaveBeenCalledTimes(2);
  });

  it('falls back to adjacent insertion when B has no comparison history at all', async () => {
    const ranked = ['b'];
    const history: ComparisonHistory = new Map(); // b has never been compared to anything
    const comparator: Comparator = vi.fn(() => {
      throw new Error('comparator should not be called when B has no history');
    });

    const outcome = await resolveTie('a', 'b', ranked, history, comparator);
    expect(outcome).toEqual({ fallbackAdjacentTo: 'b' });
    expect(comparator).not.toHaveBeenCalled();
  });

  it('falls back to adjacent insertion after exhausting MAX_TIE_BREAK_ATTEMPTS all-neutral comparisons', async () => {
    const ranked = ['b', 'c1', 'c2', 'c3'];
    const history: ComparisonHistory = new Map([
      ['b', [{ with: 'c1', result: 'neutral' }]],
      [
        'c1',
        [
          { with: 'b', result: 'neutral' },
          { with: 'c2', result: 'neutral' },
        ],
      ],
      [
        'c2',
        [
          { with: 'c1', result: 'neutral' },
          { with: 'c3', result: 'neutral' },
        ],
      ],
    ]);
    const comparator: Comparator = vi.fn((): 'neutral' => 'neutral');

    const outcome = await resolveTie('a', 'b', ranked, history, comparator);
    expect(outcome).toEqual({ fallbackAdjacentTo: 'c3' });
    expect(comparator).toHaveBeenCalledTimes(3); // MAX_TIE_BREAK_ATTEMPTS
  });

  it('(d) chains through both tiers across hops: tier 2 fallback first, then tier 1 on the next pivot', async () => {
    const ranked = ['b', 'c1', 'c2'];
    // b has no comparison history at all, so the first hop must use tier 2 (nearest in rank,
    // which is c1). c1 does have a decisive record (with c2), so the second hop resolves via
    // tier 1 from that new pivot.
    const history: ComparisonHistory = new Map([['c1', [{ with: 'c2', result: 'worse' }]]]);
    const comparator: Comparator = vi.fn((_subject, reference): 'neutral' | 'better' => {
      if (reference === 'c1') return 'neutral';
      if (reference === 'c2') return 'better';
      throw new Error(`unexpected comparison against ${reference}`);
    });

    const outcome = await resolveTie('a', 'b', ranked, history, comparator);
    expect(outcome).toEqual({ result: 'better' });
    expect(comparator).toHaveBeenCalledTimes(2);
    expect(comparator).toHaveBeenNthCalledWith(1, 'a', 'c1');
    expect(comparator).toHaveBeenNthCalledWith(2, 'a', 'c2');
  });

  it('(e) exhausts MAX_TIE_BREAK_ATTEMPTS via tier-2-only fallbacks (no decisive history anywhere)', async () => {
    const ranked = ['b', 'c1', 'c2', 'c3'];
    const history: ComparisonHistory = new Map(); // no history at all — every hop uses tier 2
    const comparator: Comparator = vi.fn((): 'neutral' => 'neutral');

    const outcome = await resolveTie('a', 'b', ranked, history, comparator);
    expect(outcome).toEqual({ fallbackAdjacentTo: 'c3' });
    expect(comparator).toHaveBeenCalledTimes(3); // MAX_TIE_BREAK_ATTEMPTS
    expect(comparator).toHaveBeenNthCalledWith(1, 'a', 'c1');
    expect(comparator).toHaveBeenNthCalledWith(2, 'a', 'c2');
    expect(comparator).toHaveBeenNthCalledWith(3, 'a', 'c3');
  });
});

describe('placeEpisodeComparatively — tie-break integration', () => {
  it('breaks a tie against the midpoint using a common reference episode and lands correctly', async () => {
    // e2 and e3 share the same true quality (compare neutral to each other); the tie-break
    // comparison against a common reference (e1) resolves the placement instead of stalling.
    const quality: Record<string, number> = { e1: 90, e2: 50, e3: 50, e4: 10 };
    let ranked: string[] = ['e1'];
    let history: ComparisonHistory = new Map();
    const comparator = qualityOracle(quality);

    for (const id of ['e4', 'e2']) {
      const result = await placeEpisodeComparatively(ranked, history, id, comparator);
      ranked = result.ranked;
      history = result.history;
    }
    expect(ranked).toEqual(['e1', 'e2', 'e4']);

    const result = await placeEpisodeComparatively(ranked, history, 'e3', comparator);
    expect(result.ranked).toEqual(['e1', 'e2', 'e3', 'e4']);
  });
});
