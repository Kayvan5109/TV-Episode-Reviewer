-- Episode Ranker — user_profiles INSERT policy (claim-a-username-later gap fix)
-- (Docs/STATUS.md's Tier B Phase 1 history; Docs/AppSpec.md's Tier B RLS design section, which
-- already specified this: "A user can insert/update only their own row (user_id = auth.uid()).")
--
-- Phase 1 (20260722010000_follows_and_profile_settings.sql) added the UPDATE half of that sentence
-- but not the INSERT half, on the assumption that every user_profiles row is created server-side via
-- the service-role client at signup (true for every account created through the *new* username+
-- password signup flow, but not for accounts that predate it -- see 20260722000000_user_profiles.sql's
-- header: this table didn't exist before that migration, so every pre-existing account has no row at
-- all). Those legacy accounts need a way to claim a username later from `/settings`, via the normal
-- session-aware client rather than the service-role one -- hence this policy, using the exact shape
-- already specified in AppSpec.md.
--
-- Race safety: this policy alone doesn't prevent two concurrent inserts from claiming the same
-- username -- that's what user_profiles_username_lower_idx (the existing unique index on
-- lower(username), from 20260722000000_user_profiles.sql) is for. This policy only decides *whose*
-- row a given insert is allowed to create; the uniqueness guarantee is unchanged and unrelated.

create policy "Users can insert their own profile"
  on public.user_profiles
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));
