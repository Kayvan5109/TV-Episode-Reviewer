import { describe, expect, it } from 'vitest';
import { orderColdStart, orderColdStartIds } from './coldStart';
import type { ColdStartEntry } from './types';

describe('cold-start ordering', () => {
  it('orders liked above neutral above disliked', () => {
    const entries: ColdStartEntry[] = [
      { episodeId: 'disliked-1', bucket: 'disliked', sequence: 0 },
      { episodeId: 'liked-1', bucket: 'liked', sequence: 1 },
      { episodeId: 'neutral-1', bucket: 'neutral', sequence: 2 },
    ];
    expect(orderColdStartIds(entries)).toEqual(['liked-1', 'neutral-1', 'disliked-1']);
  });

  it('orders most-recently-ranked first within a bucket', () => {
    const entries: ColdStartEntry[] = [
      { episodeId: 'liked-first', bucket: 'liked', sequence: 0 },
      { episodeId: 'liked-second', bucket: 'liked', sequence: 1 },
      { episodeId: 'liked-third', bucket: 'liked', sequence: 2 },
    ];
    expect(orderColdStartIds(entries)).toEqual(['liked-third', 'liked-second', 'liked-first']);
  });

  it('combines bucket ordering with recency within each bucket', () => {
    const entries: ColdStartEntry[] = [
      { episodeId: 'liked-old', bucket: 'liked', sequence: 0 },
      { episodeId: 'disliked-new', bucket: 'disliked', sequence: 3 },
      { episodeId: 'liked-new', bucket: 'liked', sequence: 2 },
      { episodeId: 'neutral-only', bucket: 'neutral', sequence: 1 },
    ];
    expect(orderColdStartIds(entries)).toEqual([
      'liked-new',
      'liked-old',
      'neutral-only',
      'disliked-new',
    ]);
  });

  it('does not mutate the input array', () => {
    const entries: ColdStartEntry[] = [
      { episodeId: 'a', bucket: 'disliked', sequence: 0 },
      { episodeId: 'b', bucket: 'liked', sequence: 1 },
    ];
    const copy = [...entries];
    orderColdStart(entries);
    expect(entries).toEqual(copy);
  });

  it('handles an empty list', () => {
    expect(orderColdStartIds([])).toEqual([]);
  });
});
