-- Episode Ranker — track when a show was last synced against TMDB
--
-- Adds `shows.last_synced_at`, stamped by `importShowFromTmdb` (website/src/lib/shows/importShow.ts)
-- on every upsert — both the very first import and any later refresh. This backs a throttled
-- background-refresh feature (website/src/lib/shows/refreshShow.ts): read-only display pages
-- (`/shows/[showId]`, `/shows/[showId]/rankings`, the dashboard) call `ensureShowSynced` on every
-- view, which only actually re-hits TMDB if `last_synced_at` is more than 24h stale
-- (`SYNC_STALE_AFTER_MS`). Without this column there'd be no way to tell "already checked recently"
-- from "never checked since add", and every page view would either always or never re-sync.
--
-- `not null default now()` (rather than nullable, no backfill, as `20260718010000_shows_genres.sql`
-- did for `genres`) is deliberate here: `default now()` also backfills existing rows at migration
-- time with "now" as their last-synced timestamp, which is the correct semantic for rows that were
-- imported before this column existed — treating "we don't actually know" as "assume fresh" is safe
-- (it just means the very next stale-check waits a full 24h from today rather than syncing
-- immediately), whereas treating it as null/stale would trigger a TMDB re-sync for every existing
-- show on its very next page view.
--
-- No RLS changes needed: `shows`' existing row-level-security policies
-- (20260715000000_initial_schema.sql) already cover every column on the table, this one included.

alter table public.shows
  add column if not exists last_synced_at timestamptz not null default now();

comment on column public.shows.last_synced_at is
  'When this show was last upserted from TMDB via importShowFromTmdb (initial import or a later '
  'refresh). Used by website/src/lib/shows/refreshShow.ts''s ensureShowSynced to throttle '
  'background re-syncs to at most once per SYNC_STALE_AFTER_MS (24h).';
