# Episode Ranker — App Spec

The product spec: what the app actually is and does. `DevelopmentPlan.md` is the fuller planning
doc (phases, discussion, issues) this spec feeds into; this doc holds *what the thing is*, including
brainstormed-but-undecided ideas.

## Concept

A TV episode ranking app. A user picks a TV show, then ranks the episodes of that show against
each other. The ranking flow: for the very first episodes ranked, the user gives a coarse judgment —
**liked**, **disliked**, or **neutral**. Once enough episodes have been ranked, ranking a new episode
instead prompts the user to say whether it's "better, worse, or neutral" compared to other
already-ranked episodes. Over time, each episode converges on a numeric score in the 1-10 range,
derived from these accumulated comparisons.

**Reference model (2026-07-15)**: modeled on Beli's ranking mechanic (the restaurant-ranking app).
Beli's approach: a new item first gets a coarse bucket (**liked / disliked / neutral** — three
buckets, matching Beli, decided 2026-07-15), then gets placed precisely *within* that bucket via a
binary-insertion-style comparison process — the new episode is compared against a single "midpoint"
episode in the current ranking, and each "better/worse" answer halves the remaining range, narrowing
toward the right spot in roughly log2(n) comparisons rather than a fixed number against arbitrary
episodes. Once placed, the episode's position in the overall ranked list maps to a 1-10 score. Full
detail, including the tie-break mechanic and what's still undecided, lives in
`DevelopmentPlan.md`'s "Ranking Algorithm" and "Discussion" sections — this is the app's central
mechanic and the main thing Phase 0 exists to prove out.

## Target platform

- Minimum iOS version: iOS 17.0+ (adjust once real device/testing constraints are known)
- UI framework: SwiftUI
- Devices: iPhone (primary); iPad support not a target for now

## Core flows

### Show selection
User picks the TV show whose episodes they want to rank. Show/episode metadata (titles, season and
episode numbers, artwork) comes from the TMDB API — see `TechArchitecture.md`.

### Initial ranking (cold start)
For a show with fewer than ~3-5 ranked episodes, the user is shown an episode and asked for a coarse
judgment: liked, disliked, or neutral. No comparison against other episodes happens yet.

### Comparative ranking (steady state)
Once a show has ~3-5+ ranked episodes, ranking a new episode instead means: the app runs a Beli-
style binary-insertion comparison — the new episode is compared against a midpoint episode in the
current ranking, and each "better/worse/neutral" answer narrows the range until the episode's
position is found (roughly log2(n) comparisons, not a fixed count). A "neutral" (tied) result
triggers a follow-up comparison against a *common reference episode* — one the tied-against episode
has itself already been compared to — to break the tie using shared context rather than leaving it
unresolved. See `DevelopmentPlan.md`'s "Ranking Algorithm" section for the full mechanic and its
still-open sub-questions. The final position maps to a 1-10 score; the exact formula for that is
still an open discussion — see `DevelopmentPlan.md`'s "Discussion" section.

### Score display / episode list
A per-show list of ranked episodes, each showing its current 1-10 score, presumably sorted by rank.
(Exact layout not yet designed.)

## Data model (at a glance)

Rough shape, to be refined once the ranking algorithm (Phase 0) is settled:

- **Show**: identifier, TMDB show ID, title, poster/art (from TMDB)
- **Episode**: identifier, show reference, season number, episode number, title
- **Ranking state per episode**: current 1-10 score, current rank position within its show, and a
  **comparison history** (which other episodes it's been directly compared against, and the result)
  — the history is required, not just a final score, since the tie-break mechanic needs to look up
  what a given episode has already been compared to in order to find a common reference episode

## Monetization

None — personal use. No ads, no IAP, no subscription. Revisit only if the app's scope or audience
changes materially.

## Open Design Questions

Ideas and undecided things land here first; once a question is genuinely blocking a phase, it also
gets a line in `DevelopmentPlan.md`'s Development Phases / Issues sections. Full current discussion
of the ranking algorithm's open questions lives in `DevelopmentPlan.md` — this list is a short
pointer, not a duplicate:

- **Score-from-position formula** — see `DevelopmentPlan.md`'s "Discussion" section (actively being
  worked out together, not yet decided).
- **Tie-break common-episode selection** — see `DevelopmentPlan.md`'s "Ranking Algorithm" section
  (which common episode to pick when several exist; what happens when none exist yet).
- **Re-ranking**: if a user's opinion of an old episode changes, can they re-rank it, and does that
  ripple through other episodes' scores?
- **Cross-show ranking**: is ranking strictly within a single show, or could episodes ever be
  compared across different shows? (Current concept assumes strictly within-show.)
- **Cold-start-only episodes**: once a show has moved into comparative ranking mode, do earlier
  liked/disliked/neutral-only episodes ever get folded into the comparison pool, or do they keep a
  cruder score?
