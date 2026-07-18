-- Episode Ranker — episode synopsis
--
-- Adds `episodes.synopsis`, sourced from TMDB's per-season endpoint
-- (GET /tv/{series_id}/season/{season_number})'s per-episode `overview` field — shown under each
-- side of a comparison on the rank screen (`website/src/app/shows/[showId]/rank/[episodeId]/page.tsx`).
--
-- Purely additive: nullable, no backfill. Existing rows (imported before this migration) will have
-- `synopsis is null` until their show is re-imported — importShowFromTmdb's upsert-on-
-- `tmdb_episode_id` pattern is idempotent, so re-adding a show naturally backfills it.
--
-- No RLS changes needed: `episodes`' existing row-level-security policies
-- (20260715000000_initial_schema.sql) already cover every column on the table, this one included.

alter table public.episodes
  add column if not exists synopsis text;

comment on column public.episodes.synopsis is
  'Episode synopsis, sourced from TMDB''s per-episode `overview` field in the season endpoint '
  'response. Null for episodes imported before this column existed, or for episodes TMDB has no '
  'overview for. Mirrors website/src/lib/tmdb/types.ts''s EpisodeSummary.synopsis.';
