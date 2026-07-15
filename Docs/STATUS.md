# Episode Ranker — Current Status

**Read this file first** — before the other docs, before doing anything else. It's the single
"what's actually going on right now" pointer, kept short and current on purpose.

Last updated: 2026-07-15 (later same day), **clean deliberate stop.** No agent is running.

## Punch List (ranked — read this section first for "what's actually next")

Every open item gets triaged into exactly one bucket the moment it surfaces, per
[ProcessAndRoles.md](ProcessAndRoles.md#punch-list-triage). Default is "log it, don't chase it"
unless it's small or genuinely blocking.

**Bucket 1 — Blocking / next in sequence:**
1. Phase 0: prototype the ranking algorithm (Beli-style binary-insertion comparison — see
   `Roadmap.md` Phase 0) — this is the riskiest, least-proven part of the app and should be settled
   before any real UI work starts.

**Bucket 2 — Bugs/features needing hands-on verification or fixing:**
(empty for now)

**Bucket 3 — Design decisions needing human input (don't block code):**
1. Neutral middle bucket — Beli uses 3 initial buckets (liked/fine/disliked); this app's spec has 2
   (liked/disliked). Confirm which before/during Phase 0. See `AppSpec.md` Open Design Questions.
2. "Same" / tie handling — exact tie vs. secondary tiebreak. See `AppSpec.md` Open Design Questions.

**Bucket 4 — Backlog, logged, not being chased:**
1. iCloud/CloudKit sync across devices — app is on-device-only for now (see `TechArchitecture.md`);
   revisit if cross-device sync becomes wanted.

**Bucket 5 — Rework flagged for a later phase, not being worked now:**
(empty for now)

## Deviations Awaiting Review

Solo judgment calls made mid-session that weren't slept on get logged here and surfaced at the
start of the next session for a second look — even solo, "I decided this at 11pm without thinking
it through" is worth a deliberate re-check, not silent acceptance.

(empty — nothing pending; the SwiftData/on-device deviation logged at initial bootstrap was reviewed
and resolved below now that data sourcing and the ranking model are confirmed)

## History

(Newest entries at the top. Prune detailed narrative to git-history pointers once a phase's
Deviations are fully cleared and reviewed — see `ProcessAndRoles.md`'s documented convention. This
keeps this file fast to read at the start of every session instead of growing forever.)

- 2026-07-15: Follow-up design/technical questions answered by Kayvan, closing out several open
  items: show/episode data source is **TMDB API**; ranking mechanic is modeled on **Beli**'s
  binary-insertion comparison approach; cold-start threshold is **~3-5 episodes**; visual design
  stays undecided until Phase 1. Docs updated accordingly (`AppSpec.md`, `TechArchitecture.md`,
  `Roadmap.md`, `Risks.md`). Remaining open items narrowed to: score-from-position formula, 2 vs. 3
  initial buckets, and "same"/tie handling — see Bucket 1 and Bucket 3 above.
- 2026-07-15: Initial bootstrap — PM-Claude operating docs created (`CLAUDE.md`, all of `Docs/`).
  No app code written yet. See `AppSpec.md` Open Design Questions and `Roadmap.md` Phase 0 for the
  actual starting point.
