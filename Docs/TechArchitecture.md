# Episode Ranker — Tech Architecture

The chosen stack and the reasoning behind it — update this when a real architectural decision gets
made, not preemptively.

Two clients share one backend: a **website** (built first, for fast iteration and tuning) and,
later, a native **iOS app** — see `DevelopmentPlan.md` for why and the phase sequencing. Both talk
to the same account system and the same ranking data, so a user's rankings are the same whether they
use the site or the app.

## Backend (shared by both clients)

- **Supabase** (Postgres + built-in Auth), free tier. Chosen so accounts, database, and
  authentication all come from one managed service instead of hand-building auth (password
  hashing, session handling, email verification) — that's exactly the kind of correctness-critical
  work worth avoiding when a managed, well-tested alternative exists for free at this scale. Both
  the website and the iOS app talk to Supabase directly using its official client SDKs (JS and
  Swift respectively) for auth and data — no custom API server needed for that part.
- **Auth**: email/password signup via Supabase Auth (email verification included). A user's
  rankings are tied to their account, not their device — this is the whole point of a shared
  backend (see `DevelopmentPlan.md`'s account decision).
- **TMDB proxy**: show/episode metadata lookups go through a small **Next.js API route** (see
  Website stack below) rather than either client calling TMDB directly — keeps the TMDB API key
  server-side only (never shipped in the iOS binary or exposed in browser JS), and gives one place
  to add caching/rate-limit handling later if needed. Both the website and, later, the iOS app hit
  this same endpoint for show/episode search.

## Website stack (built first)

- **Framework**: Next.js (React + TypeScript), which covers both the UI and the small amount of
  backend code needed (the TMDB proxy API route) in one project — no separate backend service to
  stand up and deploy.
- **Hosting**: Vercel, free tier. Zero-config deploys directly from the git repo, matches Next.js
  natively — minimal ops surface for a solo beginner.
- **Ranking algorithm implementation**: TypeScript, living in the Next.js project. This is the
  *first* implementation of the algorithm (see `DevelopmentPlan.md`) — used directly by the website,
  and later ported (not shared) to Swift once the iOS app is built. Deliberate duplication rather
  than a cross-platform-shared-logic approach (e.g. WASM) — not worth the added complexity at this
  scale; revisit only if keeping the two implementations in sync becomes a real problem.
- **Testing**: unit tests for the ranking algorithm (Vitest or Jest — pick one when Phase 0 starts),
  since this is the piece most worth having real test coverage on, same reasoning as the iOS side.

## iOS stack (built second, once the website has proven out the core flows)

- **Language**: Swift
- **UI framework**: SwiftUI
- **Project generation**: XcodeGen or Tuist (pick one once the iOS phase starts) — both generate the
  `.xcodeproj` from a plain-text config file (`project.yml` for XcodeGen, `Project.swift` for Tuist)
  instead of Xcode's binary-ish `.pbxproj`. This matters for the same reason a sibling Unity project
  regenerates its scenes from a build script instead of hand-editing YAML: `.pbxproj` merge
  conflicts are painful and error-prone to resolve by hand, and a generated project file can just be
  regenerated cleanly instead of merged.
- **Dependency management**: Swift Package Manager (avoid CocoaPods/Carthage unless a specific
  dependency requires it) — used to pull in the official `supabase-swift` client.
- **Data/backend access**: talks directly to the same Supabase project as the website (via
  `supabase-swift`) for auth and ranking data, and to the same Next.js TMDB-proxy endpoint for show/
  episode search. No local database is required for correctness (Supabase Postgres is the source of
  truth); a local cache (e.g. SwiftData) for offline browsing is a possible later enhancement, not
  part of the initial iOS build.
- **Ranking algorithm implementation**: Swift, ported from the by-then-tuned TypeScript version once
  real usage on the website has settled the score-from-position formula's constants (see
  `DevelopmentPlan.md`) — porting a proven algorithm is much lower-risk than designing and tuning it
  a second time from scratch.
- **Testing**: XCTest for unit/integration tests, particularly a port of the ranking-algorithm test
  suite to confirm the Swift version matches the TypeScript version's behavior. XCUITest not planned
  for now — feel-based UI work gets hands-on Simulator checks instead (see `ProcessAndRoles.md`).

## Cross-cutting

- **CI**: none for now — not needed at solo hobby-scale until it earns its keep.
- **Cost**: Supabase and Vercel free tiers cover this comfortably at personal-use scale. Never
  upgrade either to a paid tier (or add any other paid dependency) without Kayvan's explicit
  go-ahead — see `CLAUDE.md`'s non-negotiables.

## Why

- **2026-07-15 — Website first, then iOS, sharing one backend**: confirmed by Kayvan — a website
  iterates far faster than Xcode/Simulator, which matters a lot given the ranking algorithm and
  score formula are both explicitly expected to need real-world tuning. Kayvan wants the website
  kept long-term (not thrown away once iOS exists) and wants accounts shared across both (sign up
  once, same rankings on web or the app) — this rules out "on-device only" and requires a real
  backend.
- **2026-07-15 — Supabase for backend/accounts/database**: picked over hand-rolling a custom API
  server + auth system. Auth/accounts is correctness- and security-critical territory (password
  handling, session security, email verification) — better to lean on a managed, widely-used service
  than build and review that from scratch for a solo hobby project. Free tier fits the no-cost
  constraint; flagged as a Deviation Awaiting Review in `STATUS.md` since it's a judgment call on
  Claude's part (Kayvan said "let me pick") rather than a specifically requested vendor.
- **2026-07-15 — Next.js + Vercel for the website**: a standard, low-ceremony, well-documented
  combination — one project covers UI and the small TMDB-proxy backend, deploys with effectively no
  server configuration. Reasonable default for a beginner who wants to stay hands-off from
  infrastructure, same spirit as the SwiftUI-over-UIKit choice below.
- **2026-07-15 — SwiftUI over UIKit** (for the later iOS phase): Kayvan is a complete Xcode/Swift
  beginner who wants to stay mostly hands-off in Xcode. SwiftUI avoids most Interface Builder/
  Storyboard GUI wiring, which UIKit would require.
- **2026-07-15 — TMDB API for show/episode metadata**: confirmed by Kayvan over manual entry — free,
  well-documented, has artwork. Proxied through the Next.js backend (see above) rather than called
  directly by either client, to keep the API key server-side only.
- **2026-07-15 — Ranking mechanic modeled on Beli**: confirmed by Kayvan. Binary-insertion-style
  comparison (compare new episode against a midpoint episode, narrow the range each answer) with a
  common-episode tie-break — see `AppSpec.md` and `DevelopmentPlan.md` for the mechanic and its
  still-open specifics.
- **2026-07-15 — No monetization**: personal use, explicitly no ads/IAP/subscription for now.
