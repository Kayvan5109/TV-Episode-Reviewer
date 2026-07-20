-- Episode Ranker — All Stars pool (Docs/STATUS.md Bucket 4 item 15, "All Stars Mode")
--
-- Every show a user tracks has a current #1 episode, but every show's #1 already scores exactly
-- 10 under the per-show formula (`scoreForPosition(1, N) = 10` regardless of `N` — see
-- website/src/lib/ranking/score.ts), so those #1s can't just be sorted against each other. This
-- feature ranks a user's shows' #1 episodes against each other, head-to-head, via the *same*
-- comparison algorithm the rest of the app already uses, producing a single cross-show "Top
-- Episodes" list. Single-player only: no account page, no public/private visibility, nothing
-- social — lives entirely on the dashboard for the signed-in user.
--
-- Two new tables, deliberately NOT reusing episode_rankings/episode_comparisons:
--   1. Clean separation for a genuinely distinct comparison pool.
--   2. episode_comparisons rows today always have both episodes belonging to the *same* show —
--      an established, documented assumption elsewhere in this codebase (see session.ts's recent
--      history). all_star_comparisons rows are cross-show by construction; comingling them into
--      episode_comparisons would silently break that assumption.
--
-- Same per-user RLS posture as episode_rankings/episode_comparisons (20260715000000_initial_
-- schema.sql): row-level security is the real enforcement, scoped to `user_id = auth.uid()`.

create table if not exists public.all_star_rankings (
  user_id uuid not null references auth.users (id) on delete cascade,
  show_id uuid not null references public.shows (id) on delete cascade,
  -- The specific episode that was actually placed — that show's #1 *at the time it was placed*,
  -- which can later go stale (the show's live #1 changes) without this row being deleted outright;
  -- see the all-star session module's reconciliation logic (website/src/lib/all-star-session/).
  episode_id uuid not null references public.episodes (id) on delete cascade,
  -- 1-based position within this user's Top Episodes pool, 1 = best — same convention as
  -- episode_rankings.rank_position.
  rank_position integer not null,
  created_at timestamptz not null default now(),
  -- One row per (user, show), deliberately *not* keyed by episode_id: when a show's #1 changes,
  -- its existing row is updated/replaced in place, never duplicated.
  primary key (user_id, show_id)
);

comment on table public.all_star_rankings is
  'Per-user, per-show entry in the cross-show "Top Episodes" pool: which episode was placed (that '
  'show''s #1 at placement time) and its current position in the pool. Owned by the user (user_id) '
  '-- protected by RLS so only the owning user can read/write their own rows.';

-- episode_id has no dedicated index: this table is always read by user_id alone (see the all-star
-- session module's module comment on the URL-length lesson from Docs/STATUS.md Bucket 1 item 1) or
-- looked up by (user_id, show_id) via the primary key.

create table if not exists public.all_star_comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  episode_a_id uuid not null references public.episodes (id) on delete cascade,
  episode_b_id uuid not null references public.episodes (id) on delete cascade,
  -- Result of comparing episode_a against episode_b, from that user's perspective.
  result text not null check (result in ('a_better', 'b_better', 'neutral')),
  created_at timestamptz not null default now(),
  constraint all_star_comparisons_distinct_episodes check (episode_a_id <> episode_b_id)
);

comment on table public.all_star_comparisons is
  'Per-user comparison history within the cross-show "Top Episodes" pool (which episode was '
  'compared against which, and the result) -- the pool''s own comparison history, kept separate '
  'from episode_comparisons because these rows are cross-show by construction. Owned by the user '
  '(user_id) -- protected by RLS.';

create index if not exists all_star_comparisons_user_episode_a_idx
  on public.all_star_comparisons (user_id, episode_a_id);

create index if not exists all_star_comparisons_user_episode_b_idx
  on public.all_star_comparisons (user_id, episode_b_id);

-- ============================================================================
-- Row-Level Security -- identical shape to episode_rankings/episode_comparisons.
-- ============================================================================

alter table public.all_star_rankings enable row level security;

create policy "Users can read their own all-star rankings"
  on public.all_star_rankings
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can insert their own all-star rankings"
  on public.all_star_rankings
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users can update their own all-star rankings"
  on public.all_star_rankings
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can delete their own all-star rankings"
  on public.all_star_rankings
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

alter table public.all_star_comparisons enable row level security;

create policy "Users can read their own all-star comparisons"
  on public.all_star_comparisons
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can insert their own all-star comparisons"
  on public.all_star_comparisons
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users can update their own all-star comparisons"
  on public.all_star_comparisons
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can delete their own all-star comparisons"
  on public.all_star_comparisons
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- ============================================================================
-- Extend delete_show_ranking_data (20260719000000_delete_show_ranking_data.sql) so removing a
-- show also cleans up this pool's rows for it -- `create or replace`, never hand-editing a
-- historical migration file (this project's convention).
-- ============================================================================
-- Same security invoker / RLS-is-the-real-backstop reasoning as the original function: RLS
-- (user_id = auth.uid()) still applies using the caller's real auth.uid() even though p_user_id is
-- also passed explicitly.

create or replace function public.delete_show_ranking_data(p_show_id uuid, p_user_id uuid)
returns void
language plpgsql
security invoker
as $$
begin
  delete from public.episode_comparisons
  where user_id = p_user_id
    and (episode_a_id in (select id from public.episodes where show_id = p_show_id)
      or episode_b_id in (select id from public.episodes where show_id = p_show_id));

  delete from public.episode_rankings
  where user_id = p_user_id
    and episode_id in (select id from public.episodes where show_id = p_show_id);

  delete from public.all_star_comparisons
  where user_id = p_user_id
    and (episode_a_id in (select id from public.episodes where show_id = p_show_id)
      or episode_b_id in (select id from public.episodes where show_id = p_show_id));

  delete from public.all_star_rankings
  where user_id = p_user_id and show_id = p_show_id;
end;
$$;

grant execute on function public.delete_show_ranking_data(uuid, uuid) to authenticated;
