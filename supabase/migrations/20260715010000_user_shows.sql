-- Episode Ranker — "My shows" tracking
--
-- Design decision (Phase 1, piece 2a — show search/selection/import): the schema has no explicit
-- "user's shows" concept yet. The eventual source of truth for "has this user started ranking this
-- show" will be implicit via `episode_rankings` (piece 2b, not built yet). Rather than defer any
-- persistent "my shows" list until piece 2b lands, this adds a small, explicit join table now:
-- `user_shows` just records "this user added this show", independent of ranking progress. This is
-- simpler than reasoning about `episode_rankings` existence today, survives across devices/sessions
-- (unlike a session-only in-memory list), and piece 2b can layer richer "shows I'm actively ranking"
-- semantics on top later without needing to remove this table (a show a user added but hasn't
-- ranked yet is still meaningfully "their" show for dashboard purposes).
--
-- Ownership: per-user data, same as `episode_rankings` / `episode_comparisons` — protected by RLS
-- with the identical `user_id = auth.uid()` pattern. Written by the session-aware Supabase client
-- (never the service-role client) since it's a user-scoped action, not global reference data.

create table if not exists public.user_shows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  show_id uuid not null references public.shows (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Adding the same show twice for the same user is a no-op, not a new row (upserted on conflict).
  unique (user_id, show_id)
);

comment on table public.user_shows is
  'Per-user record of "shows this user has added" — independent of ranking progress (that''s '
  'episode_rankings, added separately). Owned by the user (user_id) — protected by RLS so only the '
  'owning user can read/write their own rows. Written by the session-aware client, never the '
  'service-role client.';

create index if not exists user_shows_user_id_idx on public.user_shows (user_id);

-- ============================================================================
-- Row-Level Security
-- ============================================================================
-- Same per-user isolation pattern as `episode_rankings` / `episode_comparisons` in
-- 20260715000000_initial_schema.sql: RLS enabled, every policy scoped to `user_id = auth.uid()`.
-- No `update` policy — there are no mutable columns on this table (a row either exists or doesn't).

alter table public.user_shows enable row level security;

create policy "Users can read their own added shows"
  on public.user_shows
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can insert their own added shows"
  on public.user_shows
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users can delete their own added shows"
  on public.user_shows
  for delete
  to authenticated
  using (user_id = (select auth.uid()));
