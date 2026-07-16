-- Episode Ranker — initial schema
--
-- Data model (see Docs/AppSpec.md and Docs/TechArchitecture.md):
--   - `shows` / `episodes`: global reference data (TMDB metadata), shared across all users.
--     Populated only by server-side code (the Next.js TMDB proxy, using the Supabase secret key,
--     which bypasses RLS) — never written to directly by a client.
--   - `episode_rankings`: per-user, per-episode ranking state (current rank position within its
--     show). This is user-owned data.
--   - `episode_comparisons`: per-user comparison history between two episodes — the durable record
--     the ranking algorithm's `findCommonReference` needs to reconstruct what an episode has
--     already been compared against. Also user-owned data.
--
-- Security boundary: `episode_rankings` and `episode_comparisons` hold private, per-user state.
-- Row-Level Security (RLS) is the mechanism that guarantees User A can never read or write User B's
-- rows — see the RLS section at the bottom of this file and `supabase/README.md` for a full
-- walkthrough. This is flagged in Docs/Risks.md as correctness-critical.

-- ============================================================================
-- Reference data (global, shared by all users)
-- ============================================================================

create table if not exists public.shows (
  id uuid primary key default gen_random_uuid(),
  tmdb_show_id integer not null unique,
  title text not null,
  poster_url text,
  created_at timestamptz not null default now()
);

comment on table public.shows is
  'Global TV show metadata sourced from TMDB. Shared across all users — not per-user data. '
  'Written only by server-side code (TMDB proxy route using the Supabase secret key).';

create table if not exists public.episodes (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows (id) on delete cascade,
  tmdb_episode_id integer not null unique,
  season_number integer not null,
  episode_number integer not null,
  title text not null,
  created_at timestamptz not null default now(),
  -- An episode number is unique within a show+season; guards against accidental double-import.
  unique (show_id, season_number, episode_number)
);

comment on table public.episodes is
  'Global episode metadata sourced from TMDB. Shared across all users — not per-user data. '
  'Written only by server-side code (TMDB proxy route using the Supabase secret key).';

create index if not exists episodes_show_id_idx on public.episodes (show_id);

-- ============================================================================
-- Per-user ranking state
-- ============================================================================

create table if not exists public.episode_rankings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  episode_id uuid not null references public.episodes (id) on delete cascade,
  -- Current position within this user's ranking for the episode's show. 1 = best. Null until the
  -- episode has been placed (e.g. a cold-start episode that hasn't folded into comparative
  -- ranking yet may still have a rank_position — cold-start entries are ordered by bucket +
  -- sequence in the app layer; rank_position here is the durable, queryable position once an
  -- episode has a place in the comparative ranking). Score (1-10) is always derived from this at
  -- read time — never stored (see website/src/lib/ranking/score.ts).
  rank_position integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One ranking-state row per (user, episode).
  unique (user_id, episode_id)
);

comment on table public.episode_rankings is
  'Per-user, per-episode ranking state: the episode''s current rank position within its show for '
  'that user. Owned by the user (user_id) — protected by RLS so only the owning user can '
  'read/write their own rows.';

create index if not exists episode_rankings_user_episode_idx
  on public.episode_rankings (user_id, episode_id);

-- Keep updated_at current on every write.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists episode_rankings_set_updated_at on public.episode_rankings;
create trigger episode_rankings_set_updated_at
  before update on public.episode_rankings
  for each row
  execute function public.set_updated_at();

create table if not exists public.episode_comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  episode_a_id uuid not null references public.episodes (id) on delete cascade,
  episode_b_id uuid not null references public.episodes (id) on delete cascade,
  -- Result of comparing episode_a against episode_b, from that user's perspective.
  result text not null check (result in ('a_better', 'b_better', 'neutral')),
  created_at timestamptz not null default now(),
  constraint episode_comparisons_distinct_episodes check (episode_a_id <> episode_b_id)
);

comment on table public.episode_comparisons is
  'Per-user comparison history between two episodes (which episode was compared against which, '
  'and the result). Durable state the ranking algorithm''s tie-break/common-reference lookup '
  'reconstructs from. Owned by the user (user_id) — protected by RLS.';

create index if not exists episode_comparisons_user_episode_a_idx
  on public.episode_comparisons (user_id, episode_a_id);

create index if not exists episode_comparisons_user_episode_b_idx
  on public.episode_comparisons (user_id, episode_b_id);

-- ============================================================================
-- Row-Level Security
-- ============================================================================
-- RLS is the security boundary between users for the two per-user tables. With RLS enabled and no
-- policy granted to a role, that role's queries see/affect zero rows for that table (default-deny)
-- -- except the Postgres/Supabase service role, which bypasses RLS entirely (used only by
-- server-side code holding the secret key, e.g. the TMDB proxy writing to shows/episodes).
--
-- `shows` and `episodes` are global reference data: every authenticated user may read them, but no
-- policy grants insert/update/delete to the `authenticated` role, so only server-side code using
-- the secret key (which bypasses RLS) can write to them.

alter table public.shows enable row level security;
alter table public.episodes enable row level security;

create policy "Authenticated users can read shows"
  on public.shows
  for select
  to authenticated
  using (true);

create policy "Authenticated users can read episodes"
  on public.episodes
  for select
  to authenticated
  using (true);

-- episode_rankings: a user may only see/modify their own rows.
alter table public.episode_rankings enable row level security;

create policy "Users can read their own episode rankings"
  on public.episode_rankings
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can insert their own episode rankings"
  on public.episode_rankings
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users can update their own episode rankings"
  on public.episode_rankings
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can delete their own episode rankings"
  on public.episode_rankings
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- episode_comparisons: same per-user isolation.
alter table public.episode_comparisons enable row level security;

create policy "Users can read their own episode comparisons"
  on public.episode_comparisons
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can insert their own episode comparisons"
  on public.episode_comparisons
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users can update their own episode comparisons"
  on public.episode_comparisons
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can delete their own episode comparisons"
  on public.episode_comparisons
  for delete
  to authenticated
  using (user_id = (select auth.uid()));
