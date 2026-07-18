-- Episode Ranker — season poster art on episodes
--
-- Adds `episodes.season_poster_url`, sourced from TMDB's per-season endpoint
-- (GET /tv/{series_id}/season/{season_number})'s top-level `poster_path`, shown next to each side
-- of a comparison on the rank screen (`website/src/app/shows/[showId]/rank/[episodeId]/page.tsx`).
--
-- Kept as a plain column on `episodes`, duplicated across every episode in the same season, rather
-- than normalized into a separate `seasons` table — same reasoning this schema already applies to
-- `season_number` itself (see 20260715000000_initial_schema.sql): there's no other season-level
-- data yet to justify a join, and every episode in a season shares the same poster anyway.
--
-- Purely additive: nullable, no backfill. Existing rows (imported before this migration) will have
-- `season_poster_url is null` until their show is re-imported — importShowFromTmdb's upsert-on-
-- `tmdb_episode_id` pattern is idempotent, so re-adding a show naturally backfills it.
--
-- No RLS changes needed: `episodes`' existing row-level-security policies (same file) already
-- cover every column on the table, this one included.

alter table public.episodes
  add column if not exists season_poster_url text;

comment on column public.episodes.season_poster_url is
  'Full TMDB CDN URL for this episode''s season poster (same value duplicated across every episode '
  'in the season). Null for episodes imported before this column existed, or for seasons TMDB has '
  'no poster for. Mirrors website/src/lib/tmdb/types.ts''s EpisodeSummary.seasonPosterUrl.';
