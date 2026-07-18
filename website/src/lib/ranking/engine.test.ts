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
    expect(isColdStart(state, COLD_START_THRESHOLD)).toBe(true);

    state = addColdStartEpisode(state, 'ep1', 'liked', COLD_START_THRESHOLD);
    state = addColdStartEpisode(state, 'ep2', 'disliked', COLD_START_THRESHOLD);
    state = addColdStartEpisode(state, 'ep3', 'neutral', COLD_START_THRESHOLD);

    expect(state.coldStart).toHaveLength(3);
    expect(state.ranked).toHaveLength(0);
    expect(isColdStart(state, COLD_START_THRESHOLD)).toBe(true);
    expect(currentDisplayOrder(state)).toEqual(['ep1', 'ep3', 'ep2']);
  });

  it('flips isColdStart to false exactly at COLD_START_THRESHOLD', () => {
    let state = createInitialShowState();
    for (let i = 0; i < COLD_START_THRESHOLD - 1; i++) {
      state = addColdStartEpisode(state, `ep${i}`, 'neutral', COLD_START_THRESHOLD);
      expect(isColdStart(state, COLD_START_THRESHOLD)).toBe(true);
    }
    state = addColdStartEpisode(state, 'last-cold-start', 'neutral', COLD_START_THRESHOLD);
    expect(state.coldStart).toHaveLength(COLD_START_THRESHOLD);
    expect(isColdStart(state, COLD_START_THRESHOLD)).toBe(false);
  });

  it('refuses cold-start placement once the show has reached the threshold', () => {
    let state = createInitialShowState();
    for (let i = 0; i < COLD_START_THRESHOLD; i++) {
      state = addColdStartEpisode(state, `ep${i}`, 'neutral', COLD_START_THRESHOLD);
    }
    expect(() => addColdStartEpisode(state, 'one-too-many', 'liked', COLD_START_THRESHOLD)).toThrow();
  });

  it('rankNewEpisode dispatches cold-start-mode input correctly', async () => {
    let state = createInitialShowState();
    state = await rankNewEpisode(
      state,
      'ep1',
      { mode: 'coldStart', bucket: 'liked' },
      COLD_START_THRESHOLD
    );
    expect(state.coldStart).toHaveLength(1);
    expect(state.coldStart[0]).toMatchObject({ episodeId: 'ep1', bucket: 'liked' });
  });
});

describe('comparative placement dispatch + cold-start migration', () => {
  it('rejects comparative placement while still below the threshold', async () => {
    let state = createInitialShowState();
    state = addColdStartEpisode(state, 'ep1', 'liked', COLD_START_THRESHOLD);
    const comparator: Comparator = () => 'better';
    await expect(
      addComparativeEpisode(state, 'ep2', comparator, COLD_START_THRESHOLD)
    ).rejects.toThrow();
  });

  it('seeds the comparative ranked list from cold-start order on first comparative placement', async () => {
    let state = createInitialShowState();
    state = addColdStartEpisode(state, 'liked1', 'liked', COLD_START_THRESHOLD);
    state = addColdStartEpisode(state, 'neutral1', 'neutral', COLD_START_THRESHOLD);
    state = addColdStartEpisode(state, 'disliked1', 'disliked', COLD_START_THRESHOLD);
    state = addColdStartEpisode(state, 'liked2', 'liked', COLD_START_THRESHOLD);
    expect(state.coldStart).toHaveLength(COLD_START_THRESHOLD);
    expect(isColdStart(state, COLD_START_THRESHOLD)).toBe(false);

    // Comparator always says "worse", so the new episode should land last.
    const comparator: Comparator = () => 'worse';
    state = await addComparativeEpisode(state, 'new1', comparator, COLD_START_THRESHOLD);

    expect(state.coldStart).toHaveLength(0); // folded into the comparative pool
    expect(state.ranked).toHaveLength(5);
    expect(state.ranked[state.ranked.length - 1]).toBe('new1');
    // Cold-start seed order (liked2 > liked1 > neutral1 > disliked1) preserved ahead of it.
    expect(state.ranked.slice(0, 4)).toEqual(['liked2', 'liked1', 'neutral1', 'disliked1']);
  });

  it('rankNewEpisode dispatches comparative-mode input correctly once past the threshold', async () => {
    let state = createInitialShowState();
    for (let i = 0; i < COLD_START_THRESHOLD; i++) {
      state = addColdStartEpisode(state, `ep${i}`, 'neutral', COLD_START_THRESHOLD);
    }
    const comparator: Comparator = () => 'better';
    state = await rankNewEpisode(
      state,
      'best',
      { mode: 'comparative', comparator },
      COLD_START_THRESHOLD
    );
    expect(state.ranked[0]).toBe('best');
  });
});

describe('small shows: effective cold-start threshold collapses to 1', () => {
  it('cold-starts only episode 1 for a 3-episode show, then routes every later episode through comparative placement', async () => {
    const totalShowEpisodeCount = 3;
    let state = createInitialShowState();

    expect(isColdStart(state, totalShowEpisodeCount)).toBe(true);
    state = addColdStartEpisode(state, 'ep1', 'neutral', totalShowEpisodeCount);
    expect(state.coldStart).toHaveLength(1);

    // Episode 1 alone already meets the effective threshold (1) for a show this small — the
    // show should now report comparative mode, not still cold start.
    expect(isColdStart(state, totalShowEpisodeCount)).toBe(false);
    expect(() =>
      addColdStartEpisode(state, 'ep2', 'neutral', totalShowEpisodeCount)
    ).toThrow();

    // Episode 2 gets a real pairwise comparison against episode 1, not another cold-start bucket.
    const comparator: Comparator = () => 'better';
    state = await addComparativeEpisode(state, 'ep2', comparator, totalShowEpisodeCount);
    expect(state.coldStart).toHaveLength(0); // folded into the comparative pool
    expect(state.ranked).toEqual(['ep2', 'ep1']);

    // Episode 3 also goes straight to comparative placement.
    state = await addComparativeEpisode(state, 'ep3', () => 'worse', totalShowEpisodeCount);
    expect(state.ranked).toEqual(['ep2', 'ep1', 'ep3']);
  });

  it('leaves normal-size-show behavior (>= COLD_START_THRESHOLD total episodes) unchanged', () => {
    let state = createInitialShowState();
    expect(isColdStart(state, COLD_START_THRESHOLD)).toBe(true);
    state = addColdStartEpisode(state, 'ep1', 'neutral', COLD_START_THRESHOLD);
    // Unlike the small-show case, a single cold-start episode does not flip the show into
    // comparative mode once the show's total episode count meets COLD_START_THRESHOLD.
    expect(isColdStart(state, COLD_START_THRESHOLD)).toBe(true);
  });
});
