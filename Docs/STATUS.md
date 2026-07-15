# Episode Ranker — Current Status

**Read this file first** — before the other docs, before doing anything else. It's the single
"what's actually going on right now" pointer, kept short and current on purpose.

Last updated: 2026-07-15, **clean deliberate stop.** No agent is running.

## Punch List (ranked — read this section first for "what's actually next")

Every open item gets triaged into exactly one bucket the moment it surfaces, per
[ProcessAndRoles.md](ProcessAndRoles.md#punch-list-triage). Default is "log it, don't chase it"
unless it's small or genuinely blocking.

**Bucket 1 — Blocking / next in sequence:**
1. Phase 0: prototype the ranking algorithm (see `Roadmap.md` Phase 0) — this is the riskiest,
   least-proven part of the app and should be settled before any real UI work starts.

**Bucket 2 — Bugs/features needing hands-on verification or fixing:**
(empty for now)

**Bucket 3 — Design decisions needing human input (don't block code):**
1. How episode/show data gets populated — manual entry vs. an external TV metadata API (e.g.
   TheTVDB, TMDB). See `AppSpec.md` Open Design Questions and `Roadmap.md` Phase 0 backlog.
2. Ranking algorithm specifics — how many comparison episodes ("X") a new episode gets checked
   against, how those comparison episodes are chosen, and how comparisons collapse into a 1-10
   score. See `Roadmap.md` Phase 0 backlog.

**Bucket 4 — Backlog, logged, not being chased:**
1. iCloud/CloudKit sync across devices — app is on-device-only for now (see `TechArchitecture.md`);
   revisit if cross-device sync becomes wanted.

**Bucket 5 — Rework flagged for a later phase, not being worked now:**
(empty for now)

## Deviations Awaiting Review

Solo judgment calls made mid-session that weren't slept on get logged here and surfaced at the
start of the next session for a second look — even solo, "I decided this at 11pm without thinking
it through" is worth a deliberate re-check, not silent acceptance.

- 2026-07-15: Picked SwiftData (not CoreData) and "fully on-device, no backend" as the default
  architecture during initial bootstrap, based on a general recommendation for a solo/personal
  hobby project rather than a specific requirement from Kayvan. Worth a second look once the
  episode-data-sourcing question (manual vs. external API) is resolved, since a metadata API would
  mean the app isn't purely on-device even if there's no ranking-data backend.

## History

(Newest entries at the top. Prune detailed narrative to git-history pointers once a phase's
Deviations are fully cleared and reviewed — see `ProcessAndRoles.md`'s documented convention. This
keeps this file fast to read at the start of every session instead of growing forever.)

- 2026-07-15: Initial bootstrap — PM-Claude operating docs created (`CLAUDE.md`, all of `Docs/`).
  No app code written yet. See `AppSpec.md` Open Design Questions and `Roadmap.md` Phase 0 for the
  actual starting point.
