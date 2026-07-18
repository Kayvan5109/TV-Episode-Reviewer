# Episode Ranker — Operating Instructions

This file auto-loads at the start of any Claude Code session in this repo. Read it first, before
doing anything else — it exists specifically so a session that starts with zero prior conversation
history (a cleared session, a new machine, picking this back up after months away) can pick this
project up correctly.

This is a **solo project** — one developer, one Claude session at a time. There's no multi-
contributor handoff protocol to follow, but the same discipline still applies for a different
reason: sessions get cleared, context gets lost, and future-you won't remember what past-you (or
past-Claude) was thinking. The repo — not Claude's own memory — is the source of truth. Claude's
memory system may carry helpful context between sessions, but never treat it as authoritative on
its own; if memory and the docs disagree, the docs win, and the mismatch should be corrected.

## What this project is

A TV episode ranking app. A user picks a show, then ranks its episodes against each other: an
episode is first marked liked/disliked/neutral, and once enough episodes exist, a new episode is
placed by comparing it ("better/worse/neutral") against already-ranked episodes. Over time each
episode settles on a 1-10 numeric score derived from these comparisons. Built as a **website
first** (Next.js + Supabase), then a native **iOS app** second, sharing one account system — see
`Docs/DevelopmentPlan.md` for why. Full design/plan/status lives in `Docs/`:

- [Docs/STATUS.md](Docs/STATUS.md) — **read this one first, every time** — short, frequently
  updated "what's actually going on right now" pointer (current phase, what's in-flight, what's
  next).
- [Docs/CriticalReview.md](Docs/CriticalReview.md) — a one-off, deliberately harsh full-project
  critique (2026-07-18), requested explicitly ("as honest as possible so we can make the best
  product possible"). Not a living doc, not re-run automatically — but read it before starting new
  feature work; it names real unresolved issues (including a live security gap, an algorithm bias,
  and a case that the roadmap is over-designing ahead of any real usage) that a session skimming
  only `STATUS.md` would miss entirely.
- [Docs/AppSpec.md](Docs/AppSpec.md) — the product spec: screens, flows, features, data model at a
  glance — what the app actually is and does.
- [Docs/DevelopmentPlan.md](Docs/DevelopmentPlan.md) — the primary planning doc: the idea, the
  ranking algorithm's current design, a running discussion space for open questions, detailed
  development phases, and a list of currently-unresolved issues.
- [Docs/Risks.md](Docs/Risks.md) — unknown-unknowns / risk log.
- [Docs/TechArchitecture.md](Docs/TechArchitecture.md) — chosen stack + reasoning.
- [Docs/ProcessAndRoles.md](Docs/ProcessAndRoles.md) — how work gets done here; read it in full
  before orchestrating any agent work.
- [Docs/Testing.md](Docs/Testing.md) — operational manual-test staging: how to run a build on
  Simulator/device or TestFlight, what to check, where feedback gets logged.

**Read `STATUS.md`, then the others as relevant, before doing any non-trivial work in this repo.**
They are the source of truth, not this file's summary of them.

## The one-paragraph version of the operating model

Claude acts as PM: owns planning, the docs above, decisions that need human input, and
orchestrating implementation work — but does not write app code directly. Actual implementation
happens in background agents (spawned via the Agent tool), one per discrete task. Correctness-
critical systems (networking, persistence, auth, concurrency, payments) get a second, independent
agent pass to test/review before anything is called done; feel-based work (UI layout, animation,
visual polish) just needs an implementer plus hands-on checking on Simulator/device. Judgment calls
made solo without a chance to sleep on them get logged for a second look next session rather than
silently assumed settled. Full reasoning in [Docs/ProcessAndRoles.md](Docs/ProcessAndRoles.md).

## Non-negotiables

- Kayvan is a beginner developer overall (no prior Swift/Xcode experience, and the website is the
  first real development surface for this project) who wants to stay hands-off from low-level
  tooling/infra. Prefer command-line-drivable, low-ceremony setups: Next.js + Vercel for the website
  (near-zero server config); for the later iOS phase, SwiftUI over UIKit/Storyboards, XcodeGen or
  Tuist to generate the `.xcodeproj` from a plain-text config instead of hand-wiring targets/files in
  Xcode, Swift Package Manager for dependencies, `xcodebuild` for build/test automation, fastlane for
  build/screenshot/TestFlight automation if it comes to that. Give exact click-by-click instructions
  for the few things only a human can actually do (Vercel/Supabase account setup and dashboard
  actions; iOS signing & provisioning, running on a real device, App Store Connect metadata entry,
  TestFlight review submission).
- The docs in `Docs/` are living documents — update them as decisions change, with dated entries
  (don't just silently overwrite prior reasoning). Do an occasional consistency sweep across them
  when they've accumulated a lot of piecemeal edits.
- Commit to git at meaningful *completed* milestones, not continuously mid-task — see
  [Docs/ProcessAndRoles.md](Docs/ProcessAndRoles.md) for why this matters here specifically.
- Never spend real money (Apple Developer Program's $99/year, upgrading Supabase/Vercel past their
  free tiers, any other paid dependency) without an explicit go-ahead — see
  [Docs/DevelopmentPlan.md](Docs/DevelopmentPlan.md) and [Docs/TechArchitecture.md](Docs/TechArchitecture.md).
- Before stopping/pausing a session (running out of usage, or just wrapping up for the day): make
  sure any in-flight background agent's work is actually pushed (if a remote exists) or at minimum
  committed to its own branch. Update `Docs/STATUS.md` so a cold-start session tomorrow — even from
  a different machine — can pick this up correctly. Commit, and push if a remote exists.
