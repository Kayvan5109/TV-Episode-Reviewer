-- Episode Ranker — Follow requests + private-profile identity visibility
-- (Docs/AppSpec.md's Tier B Detailed Design — Social Layer, "Follow requests (private profiles
-- only) — added 2026-07-22" entry; Docs/STATUS.md's "Kayvan's hands-on testing of Phase 1 found two
-- real issues" History entry for the full context this reverses/extends.)
--
-- Three pieces:
--   1. Two new SECURITY DEFINER "safe projection" functions that return only the safe identity
--      columns (user_id, username, display_name, rankings_visibility -- never auth_email/
--      has_real_email) for ANY existing user, regardless of rankings_visibility, and nothing at all
--      for a nonexistent user/username. This is what makes a private profile identifiable (not a
--      404) while a genuinely nonexistent one still is -- `user_profiles`' own SELECT policy
--      (20260722010000_follows_and_profile_settings.sql) is deliberately left as-is (still "public
--      or your own row only"), not widened further, per this build's task brief: a wider row-level
--      SELECT policy would technically permit reading auth_email/has_real_email for any public
--      profile too, since Postgres RLS is row-level, not column-level (Docs/STATUS.md Bucket 4 item
--      22, which this resolves -- this is the app's first deliberate safe-projection pattern for
--      cross-user profile reads, exactly what that item recommended). `follow_counts` (below) is the
--      precedent this follows.
--   2. `follow_counts` widened: previously returned zero rows unless the target was public-or-you;
--      now returns counts for ANY existing profile (private profiles show counts too, per the
--      design doc), while still returning zero rows for a genuinely nonexistent user_id.
--   3. A new `follow_requests` table (kept structurally separate from `follows`, not a status column
--      on it -- matches this project's `all_star_rankings` vs. `episode_rankings` precedent) plus a
--      `security invoker` `accept_follow_request` function that atomically moves a pending request
--      into an accepted `follows` row.

-- ============================================================================
-- 1. Safe-projection identity lookups -- SECURITY DEFINER, safe columns only, for any existing user
-- ============================================================================

-- Keyed by username (case-insensitive, exact match against the same `lower(username)` unique index
-- every other username lookup in this app uses -- see user_profiles_username_lower_idx). Used by
-- `/u/[username]` to resolve the profile being viewed, and by follow/follow-request server actions
-- to resolve a target username to a user_id. Deliberately an exact `lower() = lower()` match, not
-- ILIKE -- a URL segment is always meant as a literal username here, so there's no wildcard-escaping
-- concern the way there was for the ILIKE-based lookups this supersedes.
create or replace function public.profile_identity_by_username(p_username text)
returns table (user_id uuid, username text, display_name text, rankings_visibility text)
language sql
stable
security definer
set search_path = public
as $$
  select user_id, username, display_name, rankings_visibility
  from public.user_profiles
  where lower(username) = lower(p_username)
  limit 1;
$$;

comment on function public.profile_identity_by_username(text) is
  'Safe-projection lookup: returns only the identity columns safe to show any other user (never '
  'auth_email/has_real_email) for ANY existing user regardless of rankings_visibility, and zero rows '
  'for a nonexistent username. This is what lets /u/[username] distinguish "private" from '
  '"nonexistent" -- user_profiles'' own RLS SELECT policy cannot (it only returns public-or-your-own '
  'rows), and is deliberately left that way rather than widened further (see this migration''s header).';

grant execute on function public.profile_identity_by_username(text) to authenticated;

-- Keyed by a batch of user_ids. Used by the dashboard's "Following" list, which already has
-- follows.followee_id values on hand and previously resolved them via a direct user_profiles query
-- that the widened-but-still-public-or-you SELECT policy silently dropped once a followee went
-- private -- the display bug this migration also fixes (see AppSpec.md's "An already-accepted follow
-- relationship survives the target going private" note).
create or replace function public.profile_identities_by_user_ids(p_user_ids uuid[])
returns table (user_id uuid, username text, display_name text, rankings_visibility text)
language sql
stable
security definer
set search_path = public
as $$
  select user_id, username, display_name, rankings_visibility
  from public.user_profiles
  where user_id = any(p_user_ids);
$$;

comment on function public.profile_identities_by_user_ids(uuid[]) is
  'Batch version of profile_identity_by_username, keyed by user_id instead of username -- same safe '
  'columns only, same "works for any existing user, RLS-invisible or not" behavior. A user_id absent '
  'from p_user_ids'' matching rows simply has no row in the result, same "no row = doesn''t exist (to '
  'this projection)" contract as the singular function.';

grant execute on function public.profile_identities_by_user_ids(uuid[]) to authenticated;

-- ============================================================================
-- 2. follow_counts: widen the visibility guard to "any existing profile," not "public or you"
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
    -- Widened 2026-07-22: previously required the target be public-or-you (see the original
    -- 20260722010000_follows_and_profile_settings.sql version of this function) -- private profiles
    -- are now identifiable and their counts are meant to render on /u/[username] too (per the
    -- updated design doc). Still returns zero rows for a genuinely nonexistent user_id -- that half
    -- of the original guard is unchanged, only the private-vs-public distinction within it is gone.
    select 1 from public.user_profiles where user_profiles.user_id = target_user_id
  );
$$;

comment on function public.follow_counts(uuid) is
  'Returns only the two aggregate counts for a user -- never a row of follows itself. SECURITY '
  'DEFINER so it can compute across all rows regardless of the caller. Widened 2026-07-22: now '
  'returns counts for ANY existing profile, public or private (previously public-or-you only) -- '
  'private profiles are identifiable now, per the updated design. Still returns zero rows (not a '
  'zero-filled row) for a genuinely nonexistent user_id -- callers should treat "no row" as "0/0," '
  'not as a distinct error.';

-- ============================================================================
-- 3. follow_requests -- private-profile follow requests, approval required
-- ============================================================================

create table if not exists public.follow_requests (
  requester_id uuid not null references auth.users (id) on delete cascade,
  target_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (requester_id, target_id),
  constraint follow_requests_no_self_request check (requester_id <> target_id)
);

comment on table public.follow_requests is
  'A pending request to follow a private profile -- kept structurally separate from `follows` (not a '
  'status column on it), matching this project''s existing all_star_rankings/episode_rankings '
  'precedent for structurally-different states. Insert is only ever allowed as yourself, and only '
  'when the target is CURRENTLY private (the mirror image of follows'' own insert check, which '
  'requires the target be public) -- this keeps the two paths mutually exclusive: a public target '
  'gets an instant follows row, a private target gets a row here pending approval. Either party can '
  'delete a row (requester cancels, target denies) -- no side effect beyond removing it, no "blocked" '
  'concept. Accepting (moving a row here into `follows`) must be atomic across both tables -- see '
  'accept_follow_request below, not a client-side two-step.';

-- Forward direction (requester's own outgoing requests) is already covered by the primary key's
-- leading column. This covers the reverse: "who has a pending request to follow me" -- what the
-- dashboard's incoming-requests section and accept_follow_request's own lookup both need.
create index if not exists follow_requests_target_idx on public.follow_requests (target_id);

alter table public.follow_requests enable row level security;

create policy "Users can read follow requests they're party to"
  on public.follow_requests
  for select
  to authenticated
  using (requester_id = (select auth.uid()) or target_id = (select auth.uid()));

-- The real enforcement (mirrors follows' own "Users can follow only public profiles, as themselves"
-- INSERT policy, with the visibility check flipped): a user can insert a row only as themselves, and
-- only when the target's CURRENT rankings_visibility is 'private'. A direct call against an already-
-- public target is rejected here at the DB layer, not just by the UI hiding the request button --
-- app code (see website/src/app/u/[username]/actions.ts's requestToFollow) additionally routes a
-- public target through the instant-follow path instead of ever attempting this insert.
create policy "Users can request to follow a private profile, as themselves"
  on public.follow_requests
  for insert
  to authenticated
  with check (
    requester_id = (select auth.uid())
    and exists (
      select 1 from public.user_profiles
      where user_profiles.user_id = follow_requests.target_id
        and user_profiles.rankings_visibility = 'private'
    )
  );

-- Either party can remove a row: the requester cancels their own outgoing request, the target denies
-- an incoming one. Same shape as follows' own delete policy's "the follower side can delete" logic,
-- just extended to both parties since either direction of removal is a valid, side-effect-free action
-- here (unlike follows, where only the follower may unfollow).
create policy "Either party can remove a follow request (cancel or deny)"
  on public.follow_requests
  for delete
  to authenticated
  using (requester_id = (select auth.uid()) or target_id = (select auth.uid()));

-- No UPDATE policy needed -- a request is either pending (exists) or resolved (deleted, possibly
-- alongside a new follows row via accept_follow_request below), never edited in place.

-- ============================================================================
-- 4. follows: a second, additional INSERT policy so accept_follow_request's own insert (run
--    `security invoker`, as the target, not the requester) satisfies RLS
-- ============================================================================
--
-- follows' existing INSERT policy ("Users can follow only public profiles, as themselves", from
-- 20260722010000_follows_and_profile_settings.sql) only ever allows `follower_id = auth.uid()` --
-- correct for the instant-follow path, where the follower is always the one clicking the button, but
-- wrong for accepting a request: there, the TARGET is the one clicking Accept, and the row being
-- created has `follower_id = <the requester, someone else>`. Postgres ORs multiple permissive
-- policies together for the same command, so this is added as a second, additional policy rather
-- than a replacement -- the original instant-follow policy is untouched.
create policy "Target can accept a pending follow request into follows"
  on public.follows
  for insert
  to authenticated
  with check (
    followee_id = (select auth.uid())
    and exists (
      select 1 from public.follow_requests
      where follow_requests.requester_id = follows.follower_id
        and follow_requests.target_id = follows.followee_id
    )
  );

-- ============================================================================
-- 5. accept_follow_request -- the one operation that must be atomic across both tables
-- ============================================================================
--
-- `security invoker` (Postgres's default, declared explicitly, matching delete_show_ranking_data's
-- existing precedent in this codebase -- NOT `security definer` like follow_counts/the two identity
-- functions above): this function only ever needs to act on rows the caller (the request's target)
-- already has RLS access to act on -- follow_requests' own DELETE policy already lets the target
-- remove a request addressed to them, and the new follows INSERT policy above (piece 4) already lets
-- the target insert the resulting follows row -- so there's no need to bypass RLS/run as a different
-- privilege level here at all.
--
-- Explicit + defensive on purpose, not just "trust RLS to sort it out": the function independently
-- re-verifies the caller is genuinely the target of a pending request FROM p_requester_id before
-- doing anything, and raises a clear exception otherwise, rather than letting an ill-formed call fail
-- opaquely partway through on an RLS rejection. Order matters -- insert into `follows` BEFORE
-- deleting the `follow_requests` row, since the new follows INSERT policy's own `exists` check needs
-- that row to still be present at insert time.
create or replace function public.accept_follow_request(p_requester_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_target_id uuid := auth.uid();
begin
  if v_target_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.follow_requests
    where requester_id = p_requester_id and target_id = v_target_id
  ) then
    raise exception 'No pending follow request from that user to accept';
  end if;

  insert into public.follows (follower_id, followee_id)
  values (p_requester_id, v_target_id)
  on conflict (follower_id, followee_id) do nothing;

  delete from public.follow_requests
  where requester_id = p_requester_id and target_id = v_target_id;
end;
$$;

comment on function public.accept_follow_request(uuid) is
  'Atomically accepts a pending follow request: inserts the follows row, then removes the '
  'follow_requests row. security invoker, scoped to the caller''s own rows via RLS (the target''s own '
  'follow_requests DELETE policy and the new "Target can accept..." follows INSERT policy) -- plus an '
  'explicit, defensive re-check up front (raises if the caller isn''t the actual target of a pending '
  'request from p_requester_id) rather than relying solely on an RLS rejection to fail safely. '
  '`on conflict do nothing` on the follows insert covers the harmless race where the requester was '
  'somehow already an accepted follower (e.g. re-accepting after a stale page reload).';

grant execute on function public.accept_follow_request(uuid) to authenticated;
