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
  unreachable, browsing new shows breaks even though existing ranking data (stored in Supabase) is
  unaffected.
- **Third-party backend dependency (Supabase/Vercel)**: both the account system and the database
  now live on Supabase, and the website is hosted on Vercel — outages, API changes, or policy
  changes on either service are outside this project's control. Free tiers also have usage caps;
  exceeding them would require a paid upgrade, which needs Kayvan's explicit go-ahead per
  `CLAUDE.md`'s non-negotiables before it happens.
- **Auth/account correctness and security**: real user accounts (email/password) now exist. Even
  though Supabase handles the mechanics (password hashing, session tokens, email verification),
  how the app *uses* that (e.g. making sure one user can never read/write another user's ranking
  data) is still this project's responsibility and is correctness-critical — see
  `ProcessAndRoles.md`'s Agent Workflow Rules.
- **Ranking-algorithm drift between TypeScript (website) and Swift (iOS)**: the algorithm gets
  implemented twice on two different platforms. Without a shared test-fixture check (see
  `DevelopmentPlan.md`'s Discussion section), the two implementations could silently diverge and
  produce different scores for the same input.

## Resolved

- **Show/episode data sourcing** (was open as of 2026-07-15) — resolved 2026-07-15: TMDB API,
  confirmed by Kayvan. See `TechArchitecture.md`.
- **Ranking algorithm's comparison-selection strategy** (was open as of 2026-07-15) — resolved
  2026-07-15: modeled on Beli's binary-insertion approach, confirmed by Kayvan. See `AppSpec.md`.
