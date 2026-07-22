-- Episode Ranker — user_profiles (Docs/STATUS.md Bucket 1 item 1, username+password signup)
--
-- Created **at signup** now, not opt-in later (superseded design decision, 2026-07-22 — see
-- Docs/STATUS.md's username+password signup entry and Docs/AppSpec.md's Tier B `user_profiles`
-- note for the full account). Every account gets exactly one row here from the moment it's
-- created: Supabase Auth is fundamentally email-based, so username-only signup works by generating
-- a synthetic, unreachable `@users.episode-ranker.internal` email per account (`.internal` is an
-- IANA-reserved non-routable TLD) and creating the account server-side via the Admin API
-- (`auth.admin.createUser`, see website/src/app/signup/actions.ts) — this table is what lets a
-- username resolve back to the real Supabase Auth email that `signInWithPassword` requires, and
-- what the app treats as the actual account identity (Tier B's later social-layer tables key off
-- this same row, not a separate concept).
--
-- citext vs. lower(): this project has never enabled the `citext` extension anywhere in
-- supabase/migrations/ (checked before writing this migration) — adding a new extension dependency
-- for a single case-insensitive-uniqueness column isn't worth it when a plain `text` column plus a
-- unique index on `lower(username)` gets the identical guarantee with zero new dependencies. Reads
-- that need case-insensitive lookup (e.g. login resolving a submitted username) should filter with
-- `lower(username) = lower($1)` to actually hit this index.

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- 3-20 chars, letters/digits/underscores only -- enforced here as defense in depth alongside the
  -- authoritative server-side check in website/src/app/signup/actions.ts, matching this project's
  -- existing app+DB validation pattern (see the tag CHECK constraint noted in AppSpec.md's Tier B
  -- design).
  username text not null check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  display_name text,
  rankings_visibility text not null default 'private' check (rankings_visibility in ('private', 'public')),
  -- Denormalized copy of this account's actual Supabase Auth email (synthetic or real). Needed so
  -- username-based login can resolve to the real auth email signInWithPassword requires without an
  -- Admin API round-trip on every login attempt. Must be kept in sync any time a real email is
  -- later added/changed (e.g. Tier B's future "add an email" account-page flow).
  auth_email text not null,
  -- true once a real (reachable) email is on file. Every row created by this build has this false --
  -- no "add email" flow exists yet -- but the column exists now because the forgot-password flow
  -- needs to branch on it today (a synthetic-email-only account has no recovery path).
  has_real_email boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.user_profiles is
  'One row per user, created at signup (see website/src/app/signup/actions.ts). Holds the public '
  'username/display identity plus the bookkeeping (auth_email, has_real_email) that lets '
  'username-based login and password-recovery branch correctly. auth.users.email must never be '
  'exposed to any other user anywhere in this feature set -- auth_email exists for the owning '
  'user''s own login resolution only, read exclusively via the service-role client, never returned '
  'to a browser.';

-- Case-insensitive uniqueness without a new extension dependency -- see the file header comment.
create unique index if not exists user_profiles_username_lower_idx on public.user_profiles (lower(username));

-- ============================================================================
-- Row-Level Security
-- ============================================================================
-- Rows are only ever created/updated server-side via the service-role client (at signup; bypasses
-- RLS by design, same as this project's other service-role writes -- see
-- website/src/lib/supabase/server.ts and supabase/README.md) -- there is no profile-editing UI in
-- this build's scope (that's Tier B's later job, which will need its own insert/update policies
-- once it exists). Only a read policy is needed for now: a user can read their own row.

alter table public.user_profiles enable row level security;

create policy "Users can read their own profile"
  on public.user_profiles
  for select
  to authenticated
  using (user_id = (select auth.uid()));
