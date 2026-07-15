# Episode Ranker — Risks

Unknown-unknowns and gotchas worth tracking, plus a running record of resolved technical risks
(kept, not deleted, once resolved — future debugging benefits from knowing what's already been
ruled out and why).

## Open risks

- **Score-from-position formula's v1 constants are unproven.** Direction is decided (linear,
  per-show, shifts on insertion, compresses for small samples — see `DevelopmentPlan.md`), but the
  exact curve (e.g. "full range by 8 episodes") is a guess pending real usage. Explicitly expected to
  need tuning, not a one-and-done design.
- **TMDB API dependency**: needs an API key (free tier) and network access to browse/add shows.
  Rate limits and API availability are outside this project's control; if TMDB is ever down or
  unreachable, browsing new shows breaks even though existing ranking data (on-device) is unaffected.

## Resolved

- **Show/episode data sourcing** (was open as of 2026-07-15) — resolved 2026-07-15: TMDB API,
  confirmed by Kayvan. See `TechArchitecture.md`.
- **Ranking algorithm's comparison-selection strategy** (was open as of 2026-07-15) — resolved
  2026-07-15: modeled on Beli's binary-insertion approach, confirmed by Kayvan. See `AppSpec.md`.
