import { describe, expect, it } from 'vitest';
import { COLD_START_THRESHOLD } from './constants';
import {
  addColdStartEpisode,
  addComparativeEpisode,
  createInitialShowState,
  currentDisplayOrder,
  isColdStart,
  rankNewEpisode,
} from './engine';
import type { Comparator } from './types';

describe('cold-start bucket assignment (below COLD_START_THRESHOLD)', () => {
  it('accepts cold-start episodes while below the threshold', () => {
    let state = createInitialShowState();
    expect(isColdStart(state)).toBe(true);

    state = addColdStartEpisode(state, 'ep1', 'liked');
    state = addColdStartEpisode(state, 'ep2', 'disliked');
    state = addColdStartEpisode(state, 'ep3', 'neutral');

    expect(state.coldStart).toHaveLength(3);
    expect(state.ranked).toHaveLength(0);
    expect(isColdStart(state)).toBe(true);
    expect(currentDisplayOrder(state)).toEqual(['ep1', 'ep3', 'ep2']);
  });

  it('flips isColdStart to false exactly at COLD_START_THRESHOLD', () => {
    let state = createInitialShowState();
    for (let i = 0; i < COLD_START_THRESHOLD - 1; i++) {
      state = addColdStartEpisode(state, `ep${i}`, 'neutral');
      expect(isColdStart(state)).toBe(true);
    }
    state = addColdStartEpisode(state, 'last-cold-start', 'neutral');
    expect(state.coldStart).toHaveLength(COLD_START_THRESHOLD);
    expect(isColdStart(state)).toBe(false);
  });

  it('refuses cold-start placement once the show has reached the threshold', () => {
    let state = createInitialShowState();
    for (let i = 0; i < COLD_START_THRESHOLD; i++) {
      state = addColdStartEpisode(state, `ep${i}`, 'neutral');
    }
    expect(() => addColdStartEpisode(state, 'one-too-many', 'liked')).toThrow();
  });

  it('rankNewEpisode dispatches cold-start-mode input correctly', async () => {
    let state = createInitialShowState();
    state = await rankNewEpisode(state, 'ep1', { mode: 'coldStart', bucket: 'liked' });
    expect(state.coldStart).toHaveLength(1);
    expect(state.coldStart[0]).toMatchObject({ episodeId: 'ep1', bucket: 'liked' });
  });
});

describe('comparative placement dispatch + cold-start migration', () => {
  it('rejects comparative placement while still below the threshold', async () => {
    let state = createInitialShowState();
    state = addColdStartEpisode(state, 'ep1', 'liked');
    const comparator: Comparator = () => 'better';
    await expect(addComparativeEpisode(state, 'ep2', comparator)).rejects.toThrow();
  });

  it('seeds the comparative ranked list from cold-start order on first comparative placement', async () => {
    let state = createInitialShowState();
    state = addColdStartEpisode(state, 'liked1', 'liked');
    state = addColdStartEpisode(state, 'neutral1', 'neutral');
    state = addColdStartEpisode(state, 'disliked1', 'disliked');
    state = addColdStartEpisode(state, 'liked2', 'liked');
    expect(state.coldStart).toHaveLength(COLD_START_THRESHOLD);
    expect(isColdStart(state)).toBe(false);

    // Comparator always says "worse", so the new episode should land last.
    const comparator: Comparator = () => 'worse';
    state = await addComparativeEpisode(state, 'new1', comparator);

    expect(state.coldStart).toHaveLength(0); // folded into the comparative pool
    expect(state.ranked).toHaveLength(5);
    expect(state.ranked[state.ranked.length - 1]).toBe('new1');
    // Cold-start seed order (liked2 > liked1 > neutral1 > disliked1) preserved ahead of it.
    expect(state.ranked.slice(0, 4)).toEqual(['liked2', 'liked1', 'neutral1', 'disliked1']);
  });

  it('rankNewEpisode dispatches comparative-mode input correctly once past the threshold', async () => {
    let state = createInitialShowState();
    for (let i = 0; i < COLD_START_THRESHOLD; i++) {
      state = addColdStartEpisode(state, `ep${i}`, 'neutral');
    }
    const comparator: Comparator = () => 'better';
    state = await rankNewEpisode(state, 'best', { mode: 'comparative', comparator });
    expect(state.ranked[0]).toBe('best');
  });
});
