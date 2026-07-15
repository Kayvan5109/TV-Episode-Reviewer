# Episode Ranker — Testing

Operational manual-test staging: how to actually run a build and check it, distinct from
`Roadmap.md`'s "what/when" and `STATUS.md`'s "what's next right now."

## How to build and run

Not yet set up — no Xcode project exists yet (Phase 0 hasn't started). Once the project exists,
this will likely be: `xcodebuild` from the command line, driven by an agent, producing an
`.app` you launch in Simulator (fastest iteration loop for a solo dev with no device testing set up
yet), with an on-device/TestFlight build added once Phase 4 (Launch prep) is reached. Fill in the
exact command/flow once the project is generated (XcodeGen/Tuist — see `TechArchitecture.md`).

## What to check each time

Not yet applicable — no app to run. Once Phase 1 (vertical slice) exists, this becomes a running
checklist of the core flows to click through (pick a show → cold-start rank a few episodes →
trigger comparative ranking → see a score), so a manual test session has a repeatable baseline
instead of ad hoc poking. Grows as features are added.

## Where feedback goes

Log anything found during a manual test session directly into `STATUS.md`'s Punch List, triaged
into the right bucket (see `ProcessAndRoles.md`'s Punch List Triage) — don't leave findings only in
this file.

## Feedback Log

(newest at top — one dated entry per test session, brief)
