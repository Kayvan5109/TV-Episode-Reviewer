-- Episode Ranker — Fix: follow_requests' INSERT policy can never actually pass
-- (Docs/STATUS.md, 2026-07-23: Kayvan's hands-on check of the follow-requests feature found every
-- request attempt failing with "Couldn't send a follow request.")
--
-- Root cause: 20260722030000_follow_requests_and_private_profile_visibility.sql's INSERT policy on
-- follow_requests checks the target's visibility with a direct subquery against user_profiles:
--
--   exists (
--     select 1 from public.user_profiles
--     where user_profiles.user_id = follow_requests.target_id
--       and user_profiles.rankings_visibility = 'private'
--   )
--
-- That subquery runs as the requesting user and is itself subject to user_profiles' own RLS SELECT
-- policies (20260722000000_user_profiles.sql's "own row only" plus 20260722010000's "public rows
-- only") -- neither of which makes a *private*, not-your-own row visible to anyone but its owner. So
-- for the exact case this policy exists to allow (requesting a PRIVATE target you don't own), the
-- subquery can never see the row it's checking, `exists` is always false, and the insert is always
-- rejected -- the check doesn't fail closed on a bad request, it fails closed on every request.
--
-- This is the mirror-image mistake of follows' own analogous INSERT policy (which checks
-- rankings_visibility = 'public' and works correctly, because "Anyone authenticated can read public
-- profiles" makes that row genuinely visible to the subquery) -- private rows have no equivalent
-- "anyone can see this" SELECT policy, by design, so the same pattern silently breaks for the private
-- check. Not caught before merging because this codebase has no DB-level RLS test harness (see
-- Docs/STATUS.md Bucket 4 item 24) -- the unit tests for requestToFollow mock the Supabase client
-- entirely and never exercise real Postgres RLS.
--
-- Fix: a small SECURITY DEFINER helper (bypasses user_profiles' RLS by design, same pattern as
-- follow_counts/the safe-projection functions in the prior migration) that checks visibility directly,
-- then swap the policy to call it instead of querying user_profiles under the caller's own RLS.

create or replace function public.is_profile_private(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select rankings_visibility = 'private' from public.user_profiles where user_id = p_user_id),
    false
  );
$$;

comment on function public.is_profile_private(uuid) is
  'SECURITY DEFINER visibility check, bypassing user_profiles'' own RLS -- needed because a private '
  'row is (correctly) invisible under RLS to anyone but its owner, which makes a direct subquery '
  'unusable inside a policy that specifically needs to confirm a target IS private (see this '
  'migration''s header for the bug this fixes). Returns false, not null, for a nonexistent user_id.';

grant execute on function public.is_profile_private(uuid) to authenticated;

drop policy if exists "Users can request to follow a private profile, as themselves" on public.follow_requests;

create policy "Users can request to follow a private profile, as themselves"
  on public.follow_requests
  for insert
  to authenticated
  with check (
    requester_id = (select auth.uid())
    and public.is_profile_private(follow_requests.target_id)
  );
