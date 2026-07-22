-- Episode Ranker — Tier B Phase 1: profile settings, public profiles, following
-- (Docs/STATUS.md's Tier B Phase 1 entry; Docs/AppSpec.md's "Tier B Detailed Design — Social Layer")
--
-- This is the first-ever RLS policy in this app that isn't purely single-user -- every table before
-- this one scopes every command to exactly `user_id = auth.uid()` (own rows only, full stop). Get
-- this right, don't guess -- see AppSpec.md's Tier B RLS design section for the full reasoning this
-- migration implements.
--
-- Three pieces:
--   1. Widen user_profiles' SELECT (previously "own row only", from 20260722000000_user_profiles.sql)
--      to also allow reading any row with rankings_visibility = 'public'. Added as a NEW, additional
--      permissive policy -- Postgres ORs multiple permissive policies together for the same command
--      -- rather than replacing the existing "own row" policy, which is left exactly as-is.
--   2. Add user_profiles' first-ever UPDATE policy (own row only), needed for /settings to work via
--      the normal session-aware client.
--   3. A new `follows` table (one-directional, no approval required -- Letterboxd model, not
--      Facebook) plus a SECURITY DEFINER function that exposes only follower/following *counts*,
--      never the underlying list, to anyone other than the two parties involved.

-- ============================================================================
-- user_profiles: widen SELECT, add UPDATE
-- ============================================================================

create policy "Anyone authenticated can read public profiles"
  on public.user_profiles
  for select
  to authenticated
  using (rankings_visibility = 'public');

create policy "Users can update their own profile"
  on public.user_profiles
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ============================================================================
-- follows -- one-directional, no approval required
-- ============================================================================

create table if not exists public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  followee_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_no_self_follow check (follower_id <> followee_id)
);

comment on table public.follows is
  'One-directional follow relationship, no approval required -- follower_id follows followee_id. '
  'Insert is only ever allowed as yourself, and only when the target has opted into '
  'rankings_visibility = ''public'' (see the INSERT policy below) -- enforced at the DB layer, not '
  'just hidden in the UI. If a followed user later flips back to private, existing rows here are '
  'NOT automatically deleted (cheap to leave as historical fact) -- every read path for that user''s '
  'rankings/profile re-checks rankings_visibility live (via user_profiles'' own RLS above), so a '
  'stale follows row confers no actual access once someone goes private.';

-- Reverse-direction lookup (follower counts, "who follows this user"). The primary key's leading
-- column (follower_id) already covers the forward direction ("who does this user follow") without a
-- separate index.
create index if not exists follows_followee_idx on public.follows (followee_id);

alter table public.follows enable row level security;

-- A user can always read their own two lists: rows where they're the follower, and rows where
-- they're the followee.
create policy "Users can read their own follow relationships"
  on public.follows
  for select
  to authenticated
  using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()));

-- The one genuinely new RLS pattern in this migration: a cross-table check inside a policy. A user
-- can insert a row only as themselves, AND only where the target's own
-- user_profiles.rankings_visibility = 'public' -- this is the *real* enforcement (the UI also hides
-- the Follow button for a private profile, but that alone is not the security boundary; a direct
-- call to the follow action against a private user must be, and is, rejected here at the DB layer).
create policy "Users can follow only public profiles, as themselves"
  on public.follows
  for insert
  to authenticated
  with check (
    follower_id = (select auth.uid())
    and exists (
      select 1 from public.user_profiles
      where user_profiles.user_id = follows.followee_id
        and user_profiles.rankings_visibility = 'public'
    )
  );

-- Unfollowing: only the follower side can delete (matches the design doc: "a user can delete only
-- rows where they're the follower").
create policy "Users can delete their own follow (unfollow)"
  on public.follows
  for delete
  to authenticated
  using (follower_id = (select auth.uid()));

-- No UPDATE policy: a follow relationship isn't edited in place, only inserted/deleted -- same shape
-- as the design doc's own episode_tags precedent ("untagging is a delete, retagging is a fresh
-- insert").

-- ============================================================================
-- Follower/following counts -- "fine to expose to anyone (just a number)" per the design doc, but
-- the *list* of who-follows-whom must stay restricted to the two parties, per the SELECT policy
-- above. A plain client-side count over `follows` rows would either be blocked entirely by that
-- policy (for a non-party) or -- if the policy were loosened to make counting possible for everyone
-- -- would defeat the whole point of restricting the list. Instead: a SECURITY DEFINER function that
-- returns only the two aggregate counts, never a row of the underlying table. This is the first
-- SECURITY DEFINER function in this codebase (delete_show_ranking_data, the only prior
-- non-trivial function, is deliberately SECURITY INVOKER instead, since it never needs to see past
-- its caller's own rows -- this one deliberately does need to count other users' rows, hence the
-- different mode).
-- ============================================================================

create or replace function public.follow_counts(target_user_id uuid)
returns table (follower_count bigint, following_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.follows where followee_id = target_user_id) as follower_count,
    (select count(*) from public.follows where follower_id = target_user_id) as following_count
  where exists (
    -- Defense in depth: every caller in this app only ever invokes this after already resolving the
    -- target's profile as public-or-mine via user_profiles' own widened SELECT policy above, but
    -- this function doesn't trust that -- it independently re-checks the same visibility rule
    -- itself, since it runs SECURITY DEFINER (bypassing follows' own RLS by design, to be able to
    -- count across other users' rows at all) and is `grant`ed to every authenticated caller for any
    -- UUID argument. Without this check, a caller who somehow obtained a private user's raw user_id
    -- (not reachable through this app's own UI, but not provably unreachable in general -- e.g. a
    -- stale follows row from before that user went private, which this function would otherwise
    -- still be able to look up counts for) could still learn that account's follow counts, when
    -- everything above establishes that private accounts must not be probeable at all.
    select 1 from public.user_profiles
    where user_profiles.user_id = target_user_id
      and (user_profiles.rankings_visibility = 'public' or user_profiles.user_id = (select auth.uid()))
  );
$$;

comment on function public.follow_counts(uuid) is
  'Returns only the two aggregate counts for a user -- never a row of follows itself. SECURITY '
  'DEFINER so it can compute across all rows regardless of the caller (follows'' own SELECT policy '
  'restricts each row to the two parties involved), but independently re-checks the target '
  'profile''s visibility before returning anything, rather than trusting the caller to have already '
  'checked. Returns zero rows (not a zero-filled row) when the check fails -- callers should treat '
  '"no row" the same as "0/0", not as a distinct error.';

grant execute on function public.follow_counts(uuid) to authenticated;
