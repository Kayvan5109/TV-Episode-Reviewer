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

Phase 1's core flow is built and has been hands-on tested extensively (see Feedback Log below). The
quick baseline for a normal check-in:
- Sign up / log in / log out, including that `/login` always shows its form and a signed-out visit
  to any protected page redirects there.
- Search for a show (live, as you type), add one you haven't ranked before, confirm it does *not*
  show as "added" until you actually submit a ranking answer for it.
- Cold-start rank a few episodes (any order, not just sequential), cross the threshold into
  comparative placement, place at least one episode that needs more than one comparison.
- Check the show's per-episode list, the best-to-worst rankings page, re-rank one episode, and
  remove a show.

For a thorough pass (not every session), use the QA call sheet — a checklist artifact covering
every flow in detail, built 2026-07-17 (find it via `Artifact` → `action: "list"` if the link isn't
still at hand, or ask Claude to regenerate an updated one as new features land). That's the
authoritative "don't miss anything" reference; this section is just the fast baseline.

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

(newest at top — one dated entry per test session, brief; full detail always lives in `STATUS.md`'s
History, this is just a pointer so this file doesn't go stale unnoticed)

- 2026-07-17: Full pass via the QA call sheet artifact, covering auth, search/import, dashboard,
  the show detail page, the new rankings page, cold start, comparative placement (including
  tie-breaks), re-ranking, and removing a show. Nearly everything confirmed working; found 3 real
  bugs (sign-out button's missing cursor, `/login` auto-redirecting a signed-in visitor away from
  its own form, a show counting as "added" before any episode was actually ranked) plus 2 UX
  findings (a stale post-back resubmission surfacing a raw error, a 3-episode all-neutral show
  producing very different scores) — all fixed or designed same-day. See `STATUS.md` History for
  the full trail.
- 2026-07-16 to 2026-07-17: Multiple earlier rounds hands-on testing the ranking UI as it was being
  built (the original auto-advance flow, then the episode-picker rebuild after that flow was found
  to be the wrong interaction model) — see `STATUS.md` History for the detailed trail of what was
  tested and found at each stage.
