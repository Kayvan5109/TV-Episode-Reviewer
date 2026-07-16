-- Episode Ranker — cold-start columns on episode_rankings
--
-- Adds durable storage for episodes still in cold-start mode (Docs/DevelopmentPlan.md's "Ranking
-- Algorithm" step 1: liked/disliked/neutral, before a show crosses COLD_START_THRESHOLD into
-- comparative placement). `episode_rankings` previously only had `rank_position`, which is correct
-- for comparatively-placed episodes but had nowhere to persist a cold-start judgment yet — see
-- Docs/STATUS.md Bucket 1, piece 2b.
--
-- A row with `rank_position is null` and `cold_start_bucket is not null` is still in cold start;
-- a row with `rank_position is not null` has been placed (or folded) into the comparative ranking
-- and no longer needs the cold-start columns. See `website/src/lib/ranking-session/` for the
-- reconstruction logic that reads these columns back into a `ShowRankingState`
-- (`website/src/lib/ranking/types.ts`).
--
-- Style note: a check constraint on a text column, matching `episode_comparisons.result`'s
-- existing pattern in 20260715000000_initial_schema.sql, rather than a separate Postgres enum
-- type.
--
-- No RLS changes needed: `episode_rankings`'s existing row-level-security policies (same file)
-- already cover every column on the table, these two included.

alter table public.episode_rankings
  add column if not exists cold_start_bucket text
    check (cold_start_bucket in ('liked', 'neutral', 'disliked')),
  add column if not exists cold_start_sequence integer;

comment on column public.episode_rankings.cold_start_bucket is
  'Coarse cold-start judgment (liked/neutral/disliked) for an episode not yet folded into '
  'comparative ranking. Null once rank_position is set. Mirrors '
  'website/src/lib/ranking/types.ts''s ColdStartBucket.';

comment on column public.episode_rankings.cold_start_sequence is
  'Monotonic per-(user, show) sequence number recording cold-start ranking order (0-based, in '
  'the order episodes were cold-start ranked). Null once rank_position is set. Mirrors '
  'website/src/lib/ranking/types.ts''s ColdStartEntry.sequence.';
