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
detail, including the (now fully resolved) tie-break mechanic and what's still genuinely undecided
(the score formula's exact constants), lives in `DevelopmentPlan.md`'s "Ranking Algorithm" and
"Discussion" sections — this is the app's central mechanic and the main thing Phase 0 exists to
prove out.

## Target platform

Built as a **website first**, then a native **iOS app** second, sharing one account system — see
`DevelopmentPlan.md`'s "The Idea" and Development Phases for why and the sequencing.

- **Website**: any modern desktop/mobile browser (Next.js, responsive layout assumed but not
  deeply optimized for mobile web given the iOS app covers that use case later)
- **iOS app** (Phase 4+): minimum iOS version iOS 17.0+ (adjust once real device/testing constraints
  are known), SwiftUI, iPhone primary, iPad not a target for now

## Core flows

### Account (sign up / log in)
A user signs up with an email (and password) via Supabase Auth, or logs into an existing account.
All ranking data is tied to this account, not to a device or browser — the same account works on
the website and, later, the iOS app. See `TechArchitecture.md` for the backend.

### Show selection
User picks the TV show whose episodes they want to rank. Show/episode metadata (titles, season and
episode numbers, artwork) comes from the TMDB API — see `TechArchitecture.md`.

### Initial ranking (cold start)
For a show with fewer than 4 ranked episodes (i.e. the first 3), the user is shown an episode and
asked for a coarse judgment: liked, disliked, or neutral. No comparison against other episodes
happens yet. These cold-start episodes fold into the comparison pool immediately once the show
crosses into comparative ranking — there's no separate "cruder score" tier for them.

### Comparative ranking (steady state)
Once a show has 4+ ranked episodes, ranking a new episode instead means: the app runs a true
binary-insertion comparison — the new episode is compared against a midpoint episode in the current
ranking, and each "better/worse/neutral" answer narrows the range until the episode's position is
found (roughly log2(n) comparisons, not a fixed count — this stays true at every show size; an
exhaustive-then-fixed-sample alternative was considered and rejected, see `DevelopmentPlan.md`). A
"neutral" (tied) result triggers a follow-up comparison against a *common reference episode*, chosen
by a two-tier rule: prefer the closest-in-rank episode among the tied-against episode's history that
has a decisive (non-neutral) relationship with it; if none exists, fall back to simply the
closest-in-rank episode in the whole current ranking. See `DevelopmentPlan.md`'s "Ranking Algorithm"
section for the full mechanic. The final position maps to a 1-10 score via a linear, per-show
formula that recomputes on every insertion (so existing episodes' scores can shift) — see
`DevelopmentPlan.md`'s "Discussion" section for the current v1 formula, which is a starting point
expected to need tuning, not a locked answer.

### Score display / episode list
A per-show list of ranked episodes, each showing its current 1-10 score, presumably sorted by rank.
(Exact layout not yet designed.)

## Data model (at a glance)

Rough shape, to be refined once the ranking algorithm (Phase 0) is settled. Lives in Supabase
Postgres, shared by both clients — see `TechArchitecture.md`:

- **User**: identifier, email (managed by Supabase Auth). All other data below is scoped to a user.
- **Show**: identifier, TMDB show ID, title, poster/art (from TMDB)
- **Episode**: identifier, show reference, season number, episode number, title
- **Ranking state per episode** (scoped to a user + show): current rank position within its show,
  and a **comparison history** (which other episodes it's been directly compared against, and the
  result) — this is the durable state. The **1-10 score is derived, not stored as source of truth**:
  since scores shift whenever a new episode is inserted (see `DevelopmentPlan.md`), it gets
  (re)computed from an episode's current rank position and the show's current episode count rather
  than persisted as an independent value. The comparison history is required (not just a rank
  position) since the tie-break mechanic needs to look up what a given episode has already been
  compared to in order to find a common reference episode.

## Monetization

None — personal use. No ads, no IAP, no subscription. Revisit only if the app's scope or audience
changes materially.

## Open Design Questions

Ideas and undecided things land here first; once a question is genuinely blocking a phase, it also
gets a line in `DevelopmentPlan.md`'s Development Phases / Issues sections. Full current discussion
of the ranking algorithm's open questions lives in `DevelopmentPlan.md` — this list is a short
pointer, not a duplicate:

- **Score-from-position formula's exact constants** — direction is decided (linear, per-show,
  shifts on insertion, compresses for small samples), but the v1 curve is a hypothesis pending
  real-world tuning. See `DevelopmentPlan.md`'s "Discussion" section.
- **Re-ranking**: if a user's opinion of an old episode changes, can they re-rank it, and does that
  ripple through other episodes' scores?
- **Cross-show ranking**: is ranking strictly within a single show, or could episodes ever be
  compared across different shows? (Current concept assumes strictly within-show.)
