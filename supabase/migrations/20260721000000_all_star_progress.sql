-- Episode Ranker — All Stars "has completed once" progress flag
--
-- Bugfix for the "Rank Top Episodes" vs "Update Top Episodes" button label (Docs/STATUS.md Bucket
-- 4 item 15). Placing the very first entrant into an empty All Stars pool needs zero comparator
-- calls by design (`placeEpisodeComparatively` against an empty `ranked` list just inserts
-- immediately — see website/src/lib/all-star-session/session.ts's module comment). That means the
-- instant a user becomes eligible and loads the dashboard, `getAllStarDisplay()` auto-places that
-- first entrant as a side effect of merely computing display state, before the user has clicked
-- anything — so a per-request derived "is this the first time" signal (e.g. `ranked.length === 0`)
-- is already wrong on the very first render. This table gives that signal a durable home instead:
-- one row per user, latched permanently to `true` the first time a full Top Episodes pass
-- completes (`done === true`), and never reset by `resetAllStarRanking()` -- redoing a ranking the
-- user already completed once doesn't mean they've never completed one before.
--
-- Same per-user RLS posture as every other per-user table in this app (20260715000000_initial_
-- schema.sql, 20260720000000_all_star_rankings.sql): row-level security is the real enforcement,
-- scoped to `user_id = (select auth.uid())`.

create table if not exists public.all_star_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  has_completed_once boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on table public.all_star_progress is
  'Per-user latch: true once this user has fully completed a Top Episodes (All Stars) ranking '
  'pass at least once. Drives the "Rank Top Episodes" vs "Update Top Episodes" button label -- '
  'deliberately durable rather than derived per-request, since the very first entrant auto-places '
  'with zero user interaction (see website/src/lib/all-star-session/session.ts). Never touched by '
  'resetAllStarRanking() -- a manual reset does not mean the user has never completed a pass '
  'before. Owned by the user (user_id) -- protected by RLS.';

-- ============================================================================
-- Row-Level Security -- identical shape to all_star_rankings/all_star_comparisons.
-- ============================================================================

alter table public.all_star_progress enable row level security;

create policy "Users can read their own all-star progress"
  on public.all_star_progress
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can insert their own all-star progress"
  on public.all_star_progress
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users can update their own all-star progress"
  on public.all_star_progress
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can delete their own all-star progress"
  on public.all_star_progress
  for delete
  to authenticated
  using (user_id = (select auth.uid()));
