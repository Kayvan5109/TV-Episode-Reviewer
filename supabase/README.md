# Episode Ranker — Supabase schema

This directory holds the Supabase project config (`config.toml`, scaffolded by `supabase init`)
and SQL migrations (`migrations/`) for the shared backend used by both the website and (later) the
iOS app. See `Docs/TechArchitecture.md` for why this lives at the repo root rather than inside
`website/`.

A GitHub integration in the Supabase dashboard is already connected to this path — pushing a new
migration file to `main` auto-deploys it to the live project. Nothing in here has been run against
a live database from this session; see the migration file's header comment and the RLS walkthrough
below for the self-review that substitutes for that.

## Schema overview

- **`shows`** / **`episodes`**: global reference data sourced from TMDB (show/episode titles,
  season/episode numbers, poster art). Shared across all users — ranking the same show twice
  doesn't duplicate this data. Populated only by server-side code (the Next.js TMDB proxy route,
  using the Supabase *secret* key, which bypasses RLS) — never written to directly by the browser
  or the iOS app.
- **`episode_rankings`**: per-user, per-episode ranking state — currently just `rank_position`
  (the episode's position within that user's ranking for its show; null until placed). The 1-10
  score shown to users is *derived* from `rank_position` + the show's episode count at read time
  (`website/src/lib/ranking/score.ts`) — it is deliberately not a column here, since it's expected
  to shift on every insertion (see `Docs/DevelopmentPlan.md`).
- **`episode_comparisons`**: per-user comparison history — one row per direct comparison a user
  made between two episodes, and the result (`a_better` / `b_better` / `neutral`). This is what
  lets the ranking algorithm's tie-break logic (`findCommonReference`) reconstruct everything a
  given episode has already been compared against for that user.

## Row-Level Security is the security boundary between users

`episode_rankings` and `episode_comparisons` hold private per-user data (one user's opinions about
episodes). RLS is enabled on both, with `select`/`insert`/`update`/`delete` policies that all
require `user_id = auth.uid()` — a user can only ever see or modify their own rows. This is the
*only* thing standing between one user's rankings and another's; there is no other access-control
layer in front of the database. See the migration file for the exact policy definitions, and see
the "RLS walkthrough" note in the Phase 0 completion report for a line-by-line argument for why this
holds.

`shows` and `episodes` have RLS enabled too, but only carry `select` policies (open to any
authenticated user) — there are deliberately no `insert`/`update`/`delete` policies for the
`authenticated` role, since only server-side code holding the secret key (which bypasses RLS
entirely) is meant to write to them.

## Local setup notes

This was scaffolded with `npx supabase init` (no login or project link needed for that step). To
actually apply the migration to a real project once credentials exist: `supabase link` to the
project, then either `supabase db push` or just push this file to `main` and let the GitHub
integration deploy it. Running `supabase start` (local Docker-based Postgres) is optional and not
required for anything in Phase 0.
