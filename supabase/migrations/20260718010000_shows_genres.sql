-- Episode Ranker — TMDB genre names on shows
--
-- Adds `shows.genres`, sourced from TMDB's show-details endpoint (GET /tv/{series_id})'s
-- `genres` array (each entry `{id, name}`) — only the names are kept, since this is display-only
-- (a small comma-separated line / pill row under the title on the show page,
-- `website/src/app/shows/[showId]/page.tsx`); no genre-level relational querying (sorting/
-- filtering shows by genre) is needed, so there's no reason to normalize into a separate table.
--
-- Purely additive: nullable, no backfill. Existing rows (imported before this migration) will have
-- `genres is null` until their show is re-imported — importShowFromTmdb's upsert-on-`tmdb_show_id`
-- pattern is idempotent, so re-adding a show naturally backfills it.
--
-- Null and `{}` (empty array) are deliberately different states: null means "not yet imported with
-- genre data" (pre-migration row, or the details fetch simply hasn't run again yet), while `{}`
-- means "TMDB was asked and reported zero genres for this show" — both are valid, and conflating
-- them would make it impossible to tell "no data yet" from "no genres exist".
--
-- No RLS changes needed: `shows`' existing row-level-security policies
-- (20260715000000_initial_schema.sql) already cover every column on the table, this one included.

alter table public.shows
  add column if not exists genres text[];

comment on column public.shows.genres is
  'TMDB genre names for this show (e.g. {Drama,Crime}), sourced from GET /tv/{series_id}''s '
  '`genres` array (names only, ids dropped). Null means not yet imported with genre data '
  '(pre-migration row); an empty array means TMDB reported zero genres — these are different '
  'and both valid. Mirrors website/src/lib/tmdb/types.ts''s ShowDetails.genres.';
