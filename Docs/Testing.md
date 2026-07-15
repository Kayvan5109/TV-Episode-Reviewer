# Episode Ranker — Testing

Operational manual-test staging: how to actually run a build and check it, distinct from
`DevelopmentPlan.md`'s "what/when" and `STATUS.md`'s "what's next right now." Website first
(Phases 0-3), iOS second (Phases 4-5) — see `DevelopmentPlan.md`.

## Website

### How to build and run

Not yet set up — no Next.js project exists yet (Phase 0 hasn't started). Once it exists: `npm run
dev` for a local dev server (fastest iteration loop), with a real deploy to Vercel once there's
something worth trying outside localhost — Vercel deploys automatically from the git repo, so
"deployed" mostly just means "pushed." Fill in the exact commands once the project is scaffolded.

### What to check each time

Not yet applicable — no app to run. Once Phase 1 (website vertical slice) exists, this becomes a
running checklist of the core flows to click through (sign up/log in → pick a show → cold-start
rank a few episodes → trigger comparative ranking → see a score), so a manual test session has a
repeatable baseline instead of ad hoc poking. Grows as features are added.

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
