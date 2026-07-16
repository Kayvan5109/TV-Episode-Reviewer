# Episode Ranker — Testing

Operational manual-test staging: how to actually run a build and check it, distinct from
`DevelopmentPlan.md`'s "what/when" and `STATUS.md`'s "what's next right now." Website first
(Phases 0-3), iOS second (Phases 4-5) — see `DevelopmentPlan.md`.

## Website

### How to build and run

From the `website/` directory:
- `npm install` — install dependencies (only needed after a fresh clone or when `package.json`
  changes).
- `npm run dev` — local dev server at `http://localhost:3000`, fastest iteration loop.
- `npm run test` — runs the Vitest suite (currently the ranking-algorithm tests; grows as
  Supabase/TMDB integration tests are added).
- `npx tsc --noEmit` — typecheck without emitting files.
- `npm run lint` — ESLint.
- `npm run build` — production build (same as what Vercel runs); worth running before pushing
  something you expect to deploy cleanly.

Needs a `website/.env.local` (copy `website/.env.local.example` and fill in real values — see
`TechArchitecture.md`) for anything that talks to Supabase or TMDB; the ranking-algorithm tests
don't need it since they don't touch either.

Deployed automatically to Vercel on every push to `main` once the Vercel project is imported (root
directory set to `website`, env vars mirrored from `.env.local` in Vercel's dashboard) — see
`STATUS.md` for whether that's been set up yet.

### What to check each time

Not yet applicable — no user-facing screens exist yet (Phase 0 is backend/algorithm work, no UI).
Once Phase 1 (website vertical slice) exists, this becomes a running checklist of the core flows to
click through (sign up/log in → pick a show → cold-start rank a few episodes → trigger comparative
ranking → see a score), so a manual test session has a repeatable baseline instead of ad hoc poking.
Grows as features are added.

## iOS (Phase 4+)

### How to build and run

Not applicable until the iOS phase starts. Expected to be: `xcodebuild` from the command line,
driven by an agent, producing an `.app` you launch in Simulator, with an on-device/TestFlight build
added once Phase 5 (iOS polish & launch prep) is reached. Fill in the exact command/flow once the
project is generated (XcodeGen/Tuist — see `TechArchitecture.md`).

### What to check each time

Not yet applicable. Once there's a working iOS build, this becomes the same core-flow checklist as
the website's, since both should behave identically against the same shared backend/account.

## Where feedback goes

Log anything found during a manual test session directly into `STATUS.md`'s Punch List, triaged
into the right bucket (see `ProcessAndRoles.md`'s Punch List Triage) — don't leave findings only in
this file.

## Feedback Log

(newest at top — one dated entry per test session, brief)
