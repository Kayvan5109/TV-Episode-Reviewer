import { describe, expect, it } from 'vitest';

import { reconstructShowRankingState, type ComparisonRow, type RankingRow } from './reconstruct';

describe('reconstructShowRankingState', () => {
  it('reconstructs cold-start entries from rows with a null rank_position', () => {
    const rankingRows: RankingRow[] = [
      { episode_id: 'ep1', rank_position: null, cold_start_bucket: 'liked', cold_start_sequence: 0 },
      { episode_id: 'ep2', rank_position: null, cold_start_bucket: 'disliked', cold_start_sequence: 1 },
    ];

    const state = reconstructShowRankingState(rankingRows, []);

    expect(state.coldStart).toEqual([
      { episodeId: 'ep1', bucket: 'liked', sequence: 0 },
      { episodeId: 'ep2', bucket: 'disliked', sequence: 1 },
    ]);
    expect(state.ranked).toEqual([]);
    expect(state.history.size).toBe(0);
  });

  it('reconstructs the ranked list ordered by rank_position ascending, regardless of row order', () => {
    const rankingRows: RankingRow[] = [
      { episode_id: 'ep3', rank_position: 3, cold_start_bucket: null, cold_start_sequence: null },
      { episode_id: 'ep1', rank_position: 1, cold_start_bucket: null, cold_start_sequence: null },
      { episode_id: 'ep2', rank_position: 2, cold_start_bucket: null, cold_start_sequence: null },
    ];

    const state = reconstructShowRankingState(rankingRows, []);

    expect(state.ranked).toEqual(['ep1', 'ep2', 'ep3']);
    expect(state.coldStart).toEqual([]);
  });

  it('reconstructs comparison history bidirectionally for an a_better row', () => {
    const comparisonRows: ComparisonRow[] = [
      { episode_a_id: 'ep1', episode_b_id: 'ep2', result: 'a_better' },
    ];

    const state = reconstructShowRankingState([], comparisonRows);

    expect(state.history.get('ep1')).toEqual([{ with: 'ep2', result: 'better' }]);
    expect(state.history.get('ep2')).toEqual([{ with: 'ep1', result: 'worse' }]);
  });

  it('reconstructs comparison history bidirectionally for a b_better row', () => {
    const comparisonRows: ComparisonRow[] = [
      { episode_a_id: 'ep1', episode_b_id: 'ep2', result: 'b_better' },
    ];

    const state = reconstructShowRankingState([], comparisonRows);

    expect(state.history.get('ep1')).toEqual([{ with: 'ep2', result: 'worse' }]);
    expect(state.history.get('ep2')).toEqual([{ with: 'ep1', result: 'better' }]);
  });

  it('reconstructs comparison history bidirectionally for a neutral row', () => {
    const comparisonRows: ComparisonRow[] = [
      { episode_a_id: 'ep1', episode_b_id: 'ep2', result: 'neutral' },
    ];

    const state = reconstructShowRankingState([], comparisonRows);

    expect(state.history.get('ep1')).toEqual([{ with: 'ep2', result: 'neutral' }]);
    expect(state.history.get('ep2')).toEqual([{ with: 'ep1', result: 'neutral' }]);
  });

  it('accumulates multiple comparison rows touching the same episode', () => {
    const comparisonRows: ComparisonRow[] = [
      { episode_a_id: 'ep1', episode_b_id: 'ep2', result: 'a_better' },
      { episode_a_id: 'ep3', episode_b_id: 'ep1', result: 'b_better' }, // ep1 is "b" here: ep1 better than ep3
    ];

    const state = reconstructShowRankingState([], comparisonRows);

    expect(state.history.get('ep1')).toEqual([
      { with: 'ep2', result: 'better' },
      { with: 'ep3', result: 'better' },
    ]);
  });

  it('builds a full mixed state (cold start + ranked + history) in one pass', () => {
    const rankingRows: RankingRow[] = [
      { episode_id: 'ep4', rank_position: null, cold_start_bucket: 'neutral', cold_start_sequence: 0 },
      { episode_id: 'ep1', rank_position: 1, cold_start_bucket: null, cold_start_sequence: null },
      { episode_id: 'ep2', rank_position: 2, cold_start_bucket: null, cold_start_sequence: null },
    ];
    const comparisonRows: ComparisonRow[] = [
      { episode_a_id: 'ep1', episode_b_id: 'ep2', result: 'a_better' },
    ];

    const state = reconstructShowRankingState(rankingRows, comparisonRows);

    expect(state.coldStart).toEqual([{ episodeId: 'ep4', bucket: 'neutral', sequence: 0 }]);
    expect(state.ranked).toEqual(['ep1', 'ep2']);
    expect(state.history.get('ep1')).toEqual([{ with: 'ep2', result: 'better' }]);
    expect(state.history.get('ep2')).toEqual([{ with: 'ep1', result: 'worse' }]);
  });
});
