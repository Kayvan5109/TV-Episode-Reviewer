-- Episode Ranker — episode still image and air date
--
-- Adds `episodes.still_url` and `episodes.air_date`, sourced from TMDB's per-season endpoint
-- (GET /tv/{series_id}/season/{season_number})'s per-episode `still_path` and `air_date` fields —
-- shown as the episode detail page's hero image and "Aired ..." line
-- (`website/src/app/shows/[showId]/episodes/[episodeId]/page.tsx`).
--
-- Purely additive: nullable, no backfill. Existing rows (imported before this migration) will have
-- `still_url is null` / `air_date is null` until their show is re-imported — importShowFromTmdb's
-- upsert-on-`tmdb_episode_id` pattern is idempotent, so re-adding a show naturally backfills it.
--
-- No RLS changes needed: `episodes`' existing row-level-security policies
-- (20260715000000_initial_schema.sql) already cover every column on the table, this one included.

alter table public.episodes
  add column if not exists still_url text;

alter table public.episodes
  add column if not exists air_date date;

comment on column public.episodes.still_url is
  'Full TMDB CDN URL for this specific episode''s still image (per-episode, unlike '
  'season_poster_url which is shared across the season). Null for episodes imported before this '
  'column existed, or for episodes TMDB has no still image for. Mirrors '
  'website/src/lib/tmdb/types.ts''s EpisodeSummary.stillUrl.';

comment on column public.episodes.air_date is
  'This episode''s original air date, sourced from TMDB''s per-episode `air_date` field in the '
  'season endpoint response. Null for episodes imported before this column existed, or for '
  'episodes TMDB has no air date for. Mirrors website/src/lib/tmdb/types.ts''s '
  'EpisodeSummary.airDate.';
