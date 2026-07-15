# Episode Ranker — App Spec

The product spec: what the app actually is and does. The Idea & Decision Backlog in `Roadmap.md`
tracks *when* an open question needs deciding; this doc holds *what the thing is*, including
brainstormed-but-undecided ideas.

## Concept

A TV episode ranking app. A user picks a TV show, then ranks the episodes of that show against
each other. The ranking flow: for the very first episodes ranked, the user simply says whether they
liked or disliked the episode. Once enough episodes have been ranked, ranking a new episode instead
prompts the user to say whether it's "better, worse, or the same" as each of X other already-ranked
episodes (X is a tunable number — see Open Design Questions). Over time, each episode converges on a
numeric score in the 1-10 range, derived from these accumulated comparisons.

## Target platform

- Minimum iOS version: iOS 17.0+ (adjust once real device/testing constraints are known)
- UI framework: SwiftUI
- Devices: iPhone (primary); iPad support not a target for now

## Core flows

### Show selection
User picks the TV show whose episodes they want to rank. (Depends on the still-open question of
how show/episode data is sourced — see Open Design Questions.)

### Initial ranking (cold start)
For a show with few or no ranked episodes yet, the user is shown an episode and asked a simple
liked/disliked judgment. No comparison against other episodes happens yet.

### Comparative ranking (steady state)
Once a show has "enough" ranked episodes (threshold TBD), ranking a new episode instead means: the
app selects X already-ranked episodes and asks, for each, whether the new episode is better, worse,
or the same. The comparisons are used to place the new episode's score. Exact mechanics (how X is
chosen, which episodes are selected for comparison, and how the answers convert into a placement)
are the Phase 0 de-risking target — see `Roadmap.md`.

### Score display / episode list
A per-show list of ranked episodes, each showing its current 1-10 score, presumably sorted by rank.
(Exact layout not yet designed.)

## Data model (at a glance)

Rough shape, to be refined once the ranking algorithm (Phase 0) is settled:

- **Show**: identifier, title, (poster/art if sourced from an external API)
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

- **Show/episode data sourcing**: does the user manually enter shows and episodes, or does the app
  pull show/episode metadata from an external source (e.g. TheTVDB, TMDB)? Manual entry keeps the
  app fully offline/on-device but is tedious; an external API needs network access and likely an
  API key, but gives real titles/episode lists/artwork for free. Affects `TechArchitecture.md`'s
  "fully on-device" framing if an external API is chosen.
- **Ranking algorithm mechanics**: how many comparison episodes ("X") does a new episode get judged
  against, is X fixed or does it scale with how many episodes exist, how are the X comparison
  episodes chosen (spread across the current ranking? random? adjacent to a rough initial guess?),
  and how do "better/worse/same" answers get collapsed into a 1-10 numeric score? This is the
  central mechanic of the app and is intentionally left unresolved here — it's the Phase 0
  prototyping target in `Roadmap.md`.
- **Re-ranking**: if a user's opinion of an old episode changes, can they re-rank it, and does that
  ripple through other episodes' scores?
- **Cross-show ranking**: is ranking strictly within a single show, or could episodes ever be
  compared across different shows? (Current concept assumes strictly within-show.)
- **Liked/disliked-only episodes**: once a show has moved into comparative ranking mode, do
  earlier liked/disliked-only episodes ever get folded into the comparison pool, or do they keep a
  cruder score?
