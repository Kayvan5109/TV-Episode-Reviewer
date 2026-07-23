-- Episode Ranker — Account page: avatars + cross-user visibility for shows/top episodes
-- (Docs/STATUS.md, 2026-07-23: Kayvan asked for a real account page -- shows list, top episodes,
-- follower/following counts, a profile picture, username, a collections area -- viewable by other
-- users, resolving Bucket 4 item 23's "accepted followers of a private profile should eventually see
-- more" and reversing All Stars Mode's original "no account page" descope.)
--
-- This is the first time this app exposes another user's actual *ranking* data (not just identity) --
-- worth the same care as the follow-requests migration, whose own visibility check broke in exactly
-- the way this migration is careful to avoid (see 20260723000000_fix_follow_request_visibility_check
-- .sql's header): a policy that checks "is this OTHER user's row currently PRIVATE" by querying a
-- table that hides private rows from anyone but their owner can never see what it's checking. Every
-- check added below instead only ever queries a table under a condition that table's own existing RLS
-- already makes visible to the caller -- see each policy's comment.
--
-- Four pieces:
--   1. user_profiles.avatar_url -- a nullable URL, same "safe identity column" tier as username/
--      display_name (not auth_email/has_real_email).
--   2. A public `avatars` Storage bucket + object-level RLS restricting writes to a user's own
--      `{user_id}/...` path prefix -- the standard Supabase avatar-upload pattern.
--   3. profile_identity_by_username/profile_identities_by_user_ids widened to also return
--      avatar_url -- dropped and recreated (CREATE OR REPLACE can't change a RETURNS TABLE shape).
--   4. New, additional permissive SELECT policies on user_shows/episode_rankings/all_star_rankings:
--      visible when the row's owner is currently public, OR the caller is an accepted follower of the
--      row's owner -- regardless of the owner's *current* visibility (mirrors `follows`' own existing
--      "an accepted relationship survives the target going private" design). Each condition below only
--      ever reads a row the querying table's own RLS already exposes to the caller:
--        - the "public" arm reads user_profiles WHERE rankings_visibility = 'public' -- genuinely
--          public rows are visible to any authenticated caller under user_profiles' existing SELECT
--          policy, so this arm works (mirrors follows' own working INSERT check).
--        - the "followed" arm reads follows WHERE follower_id = auth.uid() -- always the caller's own
--          row under follows' existing SELECT policy, regardless of the target's visibility, so this
--          arm never needs to see a private user_profiles row at all.
--      Deliberately does NOT also check "own row" -- each table already has its own pre-existing
--      "user_id = auth.uid()" SELECT policy; Postgres ORs all permissive policies together, so adding
--      it again here would be redundant, not protective.

-- ============================================================================
-- 1. user_profiles.avatar_url
-- ============================================================================

alter table public.user_profiles add column if not exists avatar_url text;

comment on column public.user_profiles.avatar_url is
  'Public URL of the user''s uploaded avatar image (Supabase Storage, `avatars` bucket), or null for '
  'no avatar set. Safe identity column, same tier as username/display_name -- never auth_email/'
  'has_real_email.';

-- ============================================================================
-- 2. avatars Storage bucket -- public read, write restricted to your own `{user_id}/...` path
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Avatar images are publicly readable"
  on storage.objects
  for select
  using (bucket_id = 'avatars');

-- Upload path convention the app must follow: `{auth.uid()}/<filename>` -- storage.foldername(name)
-- splits the object path on `/` and returns it as a text[]; index [1] is the first segment.
create policy "Users can upload their own avatar"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can replace their own avatar"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can delete their own avatar"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ============================================================================
-- 3. Widen the safe-projection identity functions to also return avatar_url
-- ============================================================================
-- CREATE OR REPLACE cannot change a RETURNS TABLE function's column shape -- drop first.

drop function if exists public.profile_identity_by_username(text);

create function public.profile_identity_by_username(p_username text)
returns table (user_id uuid, username text, display_name text, rankings_visibility text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select user_id, username, display_name, rankings_visibility, avatar_url
  from public.user_profiles
  where lower(username) = lower(p_username)
  limit 1;
$$;

comment on function public.profile_identity_by_username(text) is
  'Safe-projection lookup: returns only the identity columns safe to show any other user (username, '
  'display_name, rankings_visibility, avatar_url -- never auth_email/has_real_email) for ANY existing '
  'user regardless of rankings_visibility, and zero rows for a nonexistent username. Widened '
  '2026-07-23 to also return avatar_url (same safe tier as the rest).';

grant execute on function public.profile_identity_by_username(text) to authenticated;

drop function if exists public.profile_identities_by_user_ids(uuid[]);

create function public.profile_identities_by_user_ids(p_user_ids uuid[])
returns table (user_id uuid, username text, display_name text, rankings_visibility text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select user_id, username, display_name, rankings_visibility, avatar_url
  from public.user_profiles
  where user_id = any(p_user_ids);
$$;

comment on function public.profile_identities_by_user_ids(uuid[]) is
  'Batch version of profile_identity_by_username, keyed by user_id. Widened 2026-07-23 to also return '
  'avatar_url (same safe tier as the rest).';

grant execute on function public.profile_identities_by_user_ids(uuid[]) to authenticated;

-- ============================================================================
-- 4. Cross-user visibility: user_shows / episode_rankings / all_star_rankings
-- ============================================================================

create policy "Shows are visible to the public or an accepted follower"
  on public.user_shows
  for select
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where user_profiles.user_id = user_shows.user_id
        and user_profiles.rankings_visibility = 'public'
    )
    or exists (
      select 1 from public.follows
      where follows.follower_id = (select auth.uid())
        and follows.followee_id = user_shows.user_id
    )
  );

create policy "Episode rankings are visible to the public or an accepted follower"
  on public.episode_rankings
  for select
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where user_profiles.user_id = episode_rankings.user_id
        and user_profiles.rankings_visibility = 'public'
    )
    or exists (
      select 1 from public.follows
      where follows.follower_id = (select auth.uid())
        and follows.followee_id = episode_rankings.user_id
    )
  );

create policy "All-star rankings are visible to the public or an accepted follower"
  on public.all_star_rankings
  for select
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where user_profiles.user_id = all_star_rankings.user_id
        and user_profiles.rankings_visibility = 'public'
    )
    or exists (
      select 1 from public.follows
      where follows.follower_id = (select auth.uid())
        and follows.followee_id = all_star_rankings.user_id
    )
  );

comment on policy "Shows are visible to the public or an accepted follower" on public.user_shows is
  'Read-only cross-user visibility for the account page (Docs/STATUS.md, 2026-07-23). Additional to '
  'the table''s existing own-row policy, not a replacement -- Postgres ORs permissive policies. Never '
  'checks rankings_visibility = ''private'' directly (that row would be invisible to the check itself '
  '-- see this migration''s header for the bug class this avoids).';

comment on policy "Episode rankings are visible to the public or an accepted follower" on public.episode_rankings is
  'Read-only cross-user visibility for the account page. Same shape/reasoning as user_shows'' '
  'equivalent policy above -- see this migration''s header.';

comment on policy "All-star rankings are visible to the public or an accepted follower" on public.all_star_rankings is
  'Read-only cross-user visibility for the account page. Same shape/reasoning as user_shows'' '
  'equivalent policy above -- see this migration''s header.';
