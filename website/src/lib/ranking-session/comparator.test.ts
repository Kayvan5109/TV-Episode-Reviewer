import { describe, expect, it } from 'vitest';

import type { ComparisonHistory } from '@/lib/ranking/types';
import { makeReplayComparator } from './comparator';
import { NeedsComparisonInput } from './types';

describe('makeReplayComparator', () => {
  it('replays an already-recorded result from the subject\'s own history entry', () => {
    const history: ComparisonHistory = new Map([
      ['ep1', [{ with: 'ep2', result: 'better' }]],
    ]);
    const comparator = makeReplayComparator(history);

    expect(comparator('ep1', 'ep2')).toBe('better');
  });

  it('replays a neutral result the same way', () => {
    const history: ComparisonHistory = new Map([
      ['ep1', [{ with: 'ep2', result: 'neutral' }]],
    ]);
    const comparator = makeReplayComparator(history);

    expect(comparator('ep1', 'ep2')).toBe('neutral');
  });

  it('throws NeedsComparisonInput carrying subject/reference when no record exists for the pair', () => {
    const history: ComparisonHistory = new Map([['ep1', [{ with: 'ep3', result: 'better' }]]]);
    const comparator = makeReplayComparator(history);

    try {
      comparator('ep1', 'ep2');
      expect.unreachable('expected comparator to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(NeedsComparisonInput);
      expect((error as NeedsComparisonInput).subject).toBe('ep1');
      expect((error as NeedsComparisonInput).reference).toBe('ep2');
    }
  });

  it('throws NeedsComparisonInput when the subject has no history at all', () => {
    const comparator = makeReplayComparator(new Map());

    expect(() => comparator('epX', 'epY')).toThrow(NeedsComparisonInput);
  });
});
