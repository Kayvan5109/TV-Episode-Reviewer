/**
 * Read-only wrapper around the `community_rank_for_episode` RPC
 * (`supabase/migrations/20260723030000_community_rank.sql`) -- the average *derived* score for one
 * episode across every user with `rankings_visibility = 'public'` who has it comparatively placed
 * (`episode_rankings.rank_position is not null`). Cold-start-bucket-only placements are excluded
 * from this v1 aggregate, per that migration's own doc comment and `Docs/AppSpec.md`'s "Community
 * rank" section -- a documented simplification, not something this module tries to work around.
 *
 * The SQL function replicates `@/lib/ranking/score.ts`'s `scoreForPosition`/`spread` formula exactly
 * (hand-verified against this codebase's own score.ts before writing this module -- see the episode
 * detail page's community-rank section and this session's PM report for the trace). This module does
 * no scoring math of its own; it only shapes the RPC's response for callers.
 *
 * `security invoker` on the SQL side (see the migration) means this only ever returns data already
 * visible to the caller under `episode_rankings`' existing "public owner" RLS policy
 * (`20260723010000_account_page_visibility.sql`) -- no new privilege surface here.
 *
 * Same lib-layer convention as the rest of `@/lib/ranking-session` (see `./accountView.ts`,
 * `./session.ts`): creates its own session-aware client via `createSupabaseServerClient` rather than
 * accepting one as a parameter, and throws a descriptive `Error` on an RPC error (mirrors
 * `deleteShowRankingData`'s own `.rpc(...)` error handling in `./session.ts`) rather than swallowing
 * it -- callers that want this to fail open (e.g. a page that shouldn't 500 just because community
 * rank couldn't load) should wrap the call in their own try/catch, the same way the episode detail
 * page already does for its TMDB credits fetch.
 */

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

export interface CommunityRank {
  averageScore: number;
  sampleSize: number;
}

interface CommunityRankRow {
  average_score: number | string | null;
  sample_size: number;
}

/**
 * `null` when nobody public has this episode comparatively placed yet (the SQL function's own
 * `sample_size = 0` case -- its doc comment calls this out explicitly as "not enough community data
 * yet"). Collapsing `sample_size: 0` to `null` here (rather than returning a `{ averageScore: 0,
 * sampleSize: 0 }` shape) means callers get a single, unambiguous "nothing to render" signal instead
 * of having to remember to check `sampleSize` themselves before touching `averageScore` (which would
 * otherwise be a meaningless `0`, not a real derived score) -- see the episode detail page for the
 * "Not enough community data yet" render this feeds.
 *
 * `average_score` comes back from Postgres as `numeric`; PostgREST/postgrest-js do not consistently
 * guarantee that arrives as a JS `number` rather than a numeric string, so it's coerced explicitly
 * via `Number(...)` here rather than trusted as-is.
 */
export async function getCommunityRankForEpisode(episodeId: string): Promise<CommunityRank | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('community_rank_for_episode', {
    p_episode_id: episodeId,
  });

  if (error) {
    throw new Error(`Failed to load community rank for episode ${episodeId}: ${error.message}`);
  }

  const row = (data as CommunityRankRow[] | null)?.[0];
  if (!row || row.sample_size === 0) {
    return null;
  }

  return {
    averageScore: Number(row.average_score),
    sampleSize: row.sample_size,
  };
}
