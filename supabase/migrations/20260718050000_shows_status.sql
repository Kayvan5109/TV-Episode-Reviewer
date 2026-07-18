-- Episode Ranker — show status (for the season-finale derivation)
--
-- Adds `shows.status`, sourced from TMDB's show-details endpoint (GET /tv/{series_id})'s `status`
-- field (e.g. "Ended", "Canceled", "Returning Series") — used to derive whether an episode is a
-- season finale (`website/src/lib/shows/seasonFinale.ts`): the highest-numbered episode of the
-- show's last season only counts as a finale once the show itself is definitely over.
--
-- Purely additive: nullable, no backfill. Existing rows (imported before this migration) will have
-- `status is null` until their show is re-imported — importShowFromTmdb's upsert-on-`tmdb_show_id`
-- pattern is idempotent, so re-adding a show naturally backfills it.
--
-- No RLS changes needed: `shows`' existing row-level-security policies
-- (20260715000000_initial_schema.sql) already cover every column on the table, this one included.

alter table public.shows
  add column if not exists status text;

comment on column public.shows.status is
  'TMDB''s show-level status field (e.g. "Ended", "Canceled", "Returning Series"). Null for shows '
  'imported before this column existed. Mirrors website/src/lib/tmdb/types.ts''s '
  'TmdbShowDetails.status / ShowDetails.status. Used by website/src/lib/shows/seasonFinale.ts to '
  'derive whether an episode is a season finale.';
