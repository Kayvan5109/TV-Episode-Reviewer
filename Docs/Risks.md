# Episode Ranker — Risks

Unknown-unknowns and gotchas worth tracking, plus a running record of resolved technical risks
(kept, not deleted, once resolved — future debugging benefits from knowing what's already been
ruled out and why).

## Open risks

- **Ranking algorithm may not converge to sensible scores.** The core "compare new episode against
  X others" mechanic is unproven — a badly chosen X or comparison-selection strategy could produce
  scores that don't feel right to the user, or that require too many comparisons per episode to
  settle. This is exactly why it's the Phase 0 de-risking target rather than something designed
  once and left alone.
- **Show/episode data sourcing is unresolved** (see `AppSpec.md`). If an external metadata API ends
  up being the answer, that introduces network dependency, API keys/rate limits, and a data-mapping
  layer that a purely on-device app wouldn't need — worth resolving early since it affects the data
  model and `TechArchitecture.md`'s "fully on-device" framing.

## Resolved

(empty for now)
