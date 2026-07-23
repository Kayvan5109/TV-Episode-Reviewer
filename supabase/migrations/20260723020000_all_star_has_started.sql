-- Episode Ranker — All Stars: don't auto-place the free first entrant until the user has engaged
--
-- Kayvan (2026-07-23, hands-on test of the account page): "The top episode from my first ranked
-- show is showing up in my 'Top Episodes' section - before I have ranked my top episodes. This
-- should be empty until i rank my top episodes." A real, confirmed reversal of a previously
-- deliberate decision, not a bug in today's account-page build -- see
-- `20260721000000_all_star_progress.sql`'s own header, which documents the exact mechanism (placing
-- the very first entrant into an empty pool needs zero comparator calls, so `getAllStarDisplay()`
-- persists it as a side effect of merely being called -- e.g. loading the dashboard or account page
-- -- before the user has ever clicked "Rank Top Episodes") and, at the time, only fixed the button-
-- label symptom (`has_completed_once`), not the underlying pre-population itself.
--
-- This column gives that a real gate: true once the user has actually visited the ranking flow
-- (`getNextAllStarStep`, the `/top-episodes/rank` route's entry point) at least once.
-- `getAllStarDisplay()` (the passive, display-only path used by `/dashboard` and `/u/[username]`)
-- now skips the auto-placement/persistence loop entirely while this is false, returning a genuinely
-- empty `ranked: []` instead. Never reset by `resetAllStarRanking()` -- same posture as
-- `has_completed_once`, a manual reset doesn't mean the user has never engaged with the feature.

alter table public.all_star_progress add column if not exists has_started boolean not null default false;

comment on column public.all_star_progress.has_started is
  'True once the user has visited the Top Episodes ranking flow at least once '
  '(getNextAllStarStep/`/top-episodes/rank`). Gates getAllStarDisplay()''s auto-placement of the free '
  'first pool entrant -- see this migration''s header for the bug this fixes. Never reset by '
  'resetAllStarRanking(), same posture as has_completed_once.';
