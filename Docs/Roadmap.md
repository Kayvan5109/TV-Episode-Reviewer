# Episode Ranker — Roadmap

## Phase Status (at a glance)

If this table and a phase's detailed section ever disagree, treat the mismatch as a bug worth
fixing on sight — this table is a summary, not a second source of truth.

| Phase | Status | Detail |
|---|---|---|
| **0 — De-risk** | Not started | Prototype the ranking algorithm: given a growing set of already-ranked episodes and a newly-added one, decide how many/which episodes to compare it against and how those comparisons collapse into a 1-10 score. This is the app's core mechanic and the least-proven part of the concept. |
| **1 — Vertical slice / MVP** | Not started | One complete core user flow, end to end, minimal polish: pick a show, rank a handful of episodes (cold-start + comparative), see scores. |
| **2 — Feature completeness** | Not started | Full intended feature set, real content — multiple shows, full episode lists, re-ranking, etc. per `AppSpec.md`. |
| **3 — Polish** | Not started | Performance, accessibility, edge cases, error/empty states. |
| **4 — Launch prep** | Not started | TestFlight beta, App Store assets (screenshots, description, privacy nutrition label), submission — only relevant if this ever leaves "personal use." |
| **5 — Post-launch (stretch)** | Not started | Iteration based on real usage; stretch features. |

For what's actionable *right now*, see `STATUS.md`'s Punch List — this table shows position on the
overall timeline, that one shows the near-term work queue.

## Idea & Decision Backlog (phase-indexed)

Every open idea/decision lives here, grouped by the phase it needs resolving by — not just listed
with a vague "someday" tag. When a new phase starts, proactively review this backlog for anything
tagged to it and surface it plainly (a **Phase-Entry Decision Review**) rather than waiting for it
to be noticed.

**Phase 0:**
- Show/episode data sourcing: manual entry vs. an external TV metadata API (TheTVDB, TMDB, etc.).
  See `AppSpec.md` Open Design Questions.
- Ranking algorithm specifics: value of X (how many comparison episodes), how those episodes get
  selected, and how "better/worse/same" answers convert into a 1-10 score. See `AppSpec.md` Open
  Design Questions.
- Cold-start threshold: how many liked/disliked-only episodes before a show switches into
  comparative ranking mode.

**Phase 1+:**
- Re-ranking of previously-scored episodes.
- Cross-show ranking (currently assumed out of scope — strictly within-show).
- Whether liked/disliked-only episodes ever get folded into the comparison pool later.
- iCloud/CloudKit sync across devices (see `TechArchitecture.md` — currently on-device only).
