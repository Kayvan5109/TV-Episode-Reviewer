-- Episode Ranker — Community rank (Docs/AppSpec.md's Tier B Detailed Design — Social Layer,
-- "Community rank" section)
--
-- For a given episode, the average *derived* score (not a stored value -- see
-- website/src/lib/ranking/score.ts's own header, "the 1-10 score is never stored as persistent
-- state") across every user with `rankings_visibility = 'public'` who has that episode
-- comparatively placed (`episode_rankings.rank_position is not null`). Per the design doc,
-- cold-start-bucket-only placements are deliberately excluded from this v1 aggregate -- a known,
-- already-documented simplification, not something this migration tries to solve.
--
-- Replicates `scoreForPosition`/`spread` from `@/lib/ranking/score.ts` exactly, in SQL, so the
-- "community" number and "your rank" (computed in TypeScript) are always the same formula applied to
-- different users' data -- see that file's own doc comment before changing either side; they must
-- stay in sync.
--
-- SECURITY INVOKER (Postgres's default, declared explicitly -- matches `delete_show_ranking_data`'s
-- precedent, not `follow_counts`'/the safe-projection functions' SECURITY DEFINER): this function
-- never needs to see a row the calling user couldn't already see under `episode_rankings`' own RLS.
-- The `20260723010000_account_page_visibility.sql` migration already added a permissive SELECT
-- policy exposing any `episode_rankings` row whose owner is currently public to every authenticated
-- caller -- this function's own `rankings_visibility = 'public'` filter only ever touches exactly
-- that already-visible subset, so no new RLS policy or privilege escalation is needed here. If that
-- policy is ever narrowed or removed, this function's results would simply narrow along with it
-- (returning fewer/zero rows), not silently bypass anything.

create or replace function public.community_rank_for_episode(p_episode_id uuid)
returns table (average_score numeric, sample_size integer)
language sql
stable
security invoker
set search_path = public
as $$
  with target_show as (
    select show_id from public.episodes where id = p_episode_id
  ),
  -- Each public user's total *comparatively* ranked episode count for this specific show -- the "N"
  -- in scoreForPosition(position, N). Deliberately scoped to this one show, not the user's whole
  -- library (score is always per-show, never cross-show -- see score.ts).
  per_user_show_counts as (
    select er.user_id, count(*) as n
    from public.episode_rankings er
    join public.episodes ep on ep.id = er.episode_id
    join public.user_profiles up on up.user_id = er.user_id
    where ep.show_id = (select show_id from target_show)
      and er.rank_position is not null
      and up.rankings_visibility = 'public'
    group by er.user_id
  ),
  per_user_score as (
    select
      -- scoreForPosition: N=1 is a fixed special case (score.ts avoids a divide-by-zero on
      -- `episodeCount - 1`); otherwise `10 - ((position - 1) * spread(N)) / (N - 1)`, where
      -- `spread(N) = 9 * least(1, (N-1)/7.0)`.
      case
        when puc.n = 1 then 10
        else 10 - ((er.rank_position - 1)::numeric * (9 * least(1, (puc.n - 1)::numeric / 7))) / (puc.n - 1)
      end as score
    from public.episode_rankings er
    join per_user_show_counts puc on puc.user_id = er.user_id
    where er.episode_id = p_episode_id
      and er.rank_position is not null
  )
  select avg(score)::numeric as average_score, count(*)::integer as sample_size
  from per_user_score;
$$;

comment on function public.community_rank_for_episode(uuid) is
  'Average derived score for an episode across every public user who has it comparatively placed '
  '(rank_position is not null) -- cold-start-only placements excluded per this feature''s documented '
  'v1 simplification (Docs/AppSpec.md). Replicates website/src/lib/ranking/score.ts''s '
  'scoreForPosition/spread formula exactly in SQL -- keep both in sync if that formula ever changes. '
  'security invoker: only ever touches episode_rankings rows already visible to the caller under its '
  'existing "public owner" RLS policy (20260723010000_account_page_visibility.sql). '
  'sample_size is 0 (not null average_score) when no public user has this episode comparatively '
  'placed -- callers should treat sample_size = 0 as "not enough community data yet."';

grant execute on function public.community_rank_for_episode(uuid) to authenticated;
