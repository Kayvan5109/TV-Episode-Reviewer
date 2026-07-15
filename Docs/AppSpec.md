# Episode Ranker — App Spec

The product spec: what the app actually is and does. The Idea & Decision Backlog in `Roadmap.md`
tracks *when* an open question needs deciding; this doc holds *what the thing is*, including
brainstormed-but-undecided ideas.

## Concept

A TV episode ranking app. A user picks a TV show, then ranks the episodes of that show against
each other. The ranking flow: for the very first episodes ranked, the user simply says whether they
liked or disliked the episode. Once enough episodes have been ranked, ranking a new episode instead
prompts the user to say whether it's "better, worse, or the same" as other already-ranked episodes.
Over time, each episode converges on a numeric score in the 1-10 range, derived from these
accumulated comparisons.

**Reference model (2026-07-15)**: modeled on Beli's ranking mechanic (the restaurant-ranking app).
Beli's approach: a new item first gets a coarse bucket (liked/disliked, in this app's case — Beli
itself uses three buckets), then gets placed precisely *within* that bucket via a binary-insertion-
style comparison process — the new episode is compared against a single "midpoint" episode in the
current ranking, and each "better/worse" answer halves the remaining range, narrowing toward the
right spot in roughly log2(n) comparisons rather than a fixed number against arbitrary episodes. A
"same" answer ties it with the comparison episode. Once placed, the episode's position in the
overall ranked list maps to a 1-10 score. This resolves *how* comparison episodes get chosen (binary
search over the current ranking, not a fixed count or random sampling) — the remaining specifics
(exact score-from-rank-position formula, and how "same" ties are represented) are still the Phase 0
prototyping target. See Open Design Questions.

## Target platform

- Minimum iOS version: iOS 17.0+ (adjust once real device/testing constraints are known)
- UI framework: SwiftUI
- Devices: iPhone (primary); iPad support not a target for now

## Core flows

### Show selection
User picks the TV show whose episodes they want to rank. Show/episode metadata (titles, season and
episode numbers, artwork) comes from the TMDB API — see `TechArchitecture.md`.

### Initial ranking (cold start)
For a show with fewer than ~3-5 ranked episodes, the user is shown an episode and asked a simple
liked/disliked judgment. No comparison against other episodes happens yet.

### Comparative ranking (steady state)
Once a show has ~3-5+ ranked episodes, ranking a new episode instead means: the app runs a Beli-
style binary-insertion comparison — the new episode is compared against a midpoint episode in the
current ranking, and each "better/worse/same" answer narrows the range until the episode's position
is found (roughly log2(n) comparisons, not a fixed count). The final position maps to a 1-10 score.
Exact score-from-position formula and "same"/tie handling are the remaining Phase 0 de-risking
target — see `Roadmap.md`.

### Score display / episode list
A per-show list of ranked episodes, each showing its current 1-10 score, presumably sorted by rank.
(Exact layout not yet designed.)

## Data model (at a glance)

Rough shape, to be refined once the ranking algorithm (Phase 0) is settled:

- **Show**: identifier, TMDB show ID, title, poster/art (from TMDB)
- **Episode**: identifier, show reference, season number, episode number, title
- **Ranking state per episode**: current 1-10 score, and whatever underlying comparison
  history/state the chosen algorithm needs to keep improving that score over time (e.g. win/loss
  record, comparison log — depends on the algorithm chosen in Phase 0)

## Monetization

None — personal use. No ads, no IAP, no subscription. Revisit only if the app's scope or audience
changes materially.

## Open Design Questions

Ideas and undecided things land here first; once a question is genuinely blocking a phase, it also
gets a line in `Roadmap.md`'s Idea & Decision Backlog under that phase.

- **Bucket count**: Beli itself uses three initial buckets (liked / fine / disliked); this app's
  spec so far only has two (liked / disliked). Worth confirming whether to add a neutral middle
  bucket to match Beli more closely, or keep the binary version originally described.
- **Score-from-position formula**: once an episode's rank position is found via binary-insertion
  comparison, what formula maps that position (within however many episodes the show has) to a 1-10
  score? Beli-style apps typically normalize rank position within the list; exact approach is the
  remaining Phase 0 prototyping target.
- **"Same" / tie handling**: when a comparison answer is "same," does the new episode tie exactly
  with the comparison episode (sharing a score/rank), or does it need a secondary tiebreak?
- **Re-ranking**: if a user's opinion of an old episode changes, can they re-rank it, and does that
  ripple through other episodes' scores?
- **Cross-show ranking**: is ranking strictly within a single show, or could episodes ever be
  compared across different shows? (Current concept assumes strictly within-show.)
- **Liked/disliked-only episodes**: once a show has moved into comparative ranking mode, do
  earlier liked/disliked-only episodes ever get folded into the comparison pool, or do they keep a
  cruder score?
