import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Small in-memory fake covering exactly the one call `communityRank.ts` makes: `.rpc
 * ('community_rank_for_episode', { p_episode_id })`. `rpcResult` is set per-test to whatever the
 * real `community_rank_for_episode` SQL function would return for that scenario -- same "script the
 * one RPC call" style as `./session.test.ts`'s `FakeSupabase.rpc` for `delete_show_ranking_data`.
 * The actual SQL aggregation itself is not exercised here (no local Supabase instance in this
 * project -- see Docs/STATUS.md Bucket 4 item 24); this only tests `communityRank.ts`'s own handling
 * of the RPC's response shape.
 */
class FakeSupabase {
  rpcResult: { data: unknown; error: { message: string } | null } = { data: null, error: null };
  lastRpcArgs: { fnName: string; params: Record<string, unknown> } | null = null;

  async rpc(fnName: string, params: Record<string, unknown>) {
    this.lastRpcArgs = { fnName, params };
    return this.rpcResult;
  }
}

let fake: FakeSupabase;

vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: async () => fake,
}));

const { getCommunityRankForEpisode } = await import('./communityRank');

describe('getCommunityRankForEpisode', () => {
  beforeEach(() => {
    fake = new FakeSupabase();
  });

  it('returns the average score and sample size when public community data exists', async () => {
    fake.rpcResult = { data: [{ average_score: 7.5, sample_size: 3 }], error: null };

    const result = await getCommunityRankForEpisode('ep-1');

    expect(result).toEqual({ averageScore: 7.5, sampleSize: 3 });
    expect(fake.lastRpcArgs).toEqual({
      fnName: 'community_rank_for_episode',
      params: { p_episode_id: 'ep-1' },
    });
  });

  it('coerces a numeric-as-string average_score (Postgres numeric over PostgREST) to a JS number', async () => {
    fake.rpcResult = { data: [{ average_score: '6.142857142857143', sample_size: 7 }], error: null };

    const result = await getCommunityRankForEpisode('ep-1');

    expect(result).toEqual({ averageScore: 6.142857142857143, sampleSize: 7 });
  });

  it('returns null when sample_size is 0 (no public user has this episode comparatively placed)', async () => {
    fake.rpcResult = { data: [{ average_score: null, sample_size: 0 }], error: null };

    const result = await getCommunityRankForEpisode('ep-1');

    expect(result).toBeNull();
  });

  it('returns null when the RPC comes back with no rows at all (defensive -- the real function always returns exactly one aggregate row)', async () => {
    fake.rpcResult = { data: [], error: null };

    const result = await getCommunityRankForEpisode('ep-1');

    expect(result).toBeNull();
  });

  it('throws a descriptive error when the RPC call itself errors', async () => {
    fake.rpcResult = { data: null, error: { message: 'permission denied for function' } };

    await expect(getCommunityRankForEpisode('ep-1')).rejects.toThrow(
      'Failed to load community rank for episode ep-1: permission denied for function'
    );
  });
});
