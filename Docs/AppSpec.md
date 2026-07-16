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

## Future Enhancement Ideas — Brainstorm (2026-07-16, not committed, not scheduled)

A requested laundry list of ideas for improving the app's UX beyond Phase 1's bare-bones MVP scope.
**None of this is committed, prioritized, or scheduled** — it's a brainstorm dump for Kayvan to pick
through later, same spirit as the rest of this section ("brainstormed-but-undecided ideas land
here first"). Concrete, already-tracked work stays in `STATUS.md`'s Punch List and
`DevelopmentPlan.md`'s Phase sections, not duplicated here — this list is deliberately broader and
more speculative than that. When any of these gets picked up for real, move it out of this list into
a Phase/Bucket with an actual decision attached, per this project's normal triage process
(`ProcessAndRoles.md`).

### Ranking-flow feel
- **Progress indicator while placing an episode** — comparative placement is roughly `log2(N)`
  comparisons; a "getting closer..." indicator (even just a shrinking-range visual, not an exact
  count) would make the binary-search mechanic feel purposeful instead of open-ended, especially to
  a first-time user who doesn't know the mechanic yet.
- **"I don't remember well enough" / skip escape hatch during a comparison** — right now every
  comparison forces a better/worse/neutral answer. For an episode watched long ago, a user may
  genuinely not remember it well enough to judge confidently against whatever it's being compared
  to. An honest "skip, ask me something else" option (deferring that specific comparison) might beat
  forcing a low-confidence guess that then anchors the algorithm's placement.
- **Undo the last ranking action** — a misclick (hit "worse" meaning "better") currently has no
  recovery path short of re-ranking. Even a single-level undo would help.
- **Transparency when a tie-break falls back to "adjacent" placement** — `MAX_TIE_BREAK_ATTEMPTS`
  (see `DevelopmentPlan.md`'s Ranking Algorithm section) can exhaust and fall back to inserting
  adjacent to the last-compared episode as a genuine-tie fallback. Surfacing that ("we couldn't
  fully place this — put it next to X") would be more honest than silently doing it.
- **Keyboard shortcuts** for the better/worse/neutral and liked/disliked/neutral buttons (e.g. arrow
  keys or number keys) — a power user ranking many episodes in one sitting is doing a lot of
  repetitive clicking.
- **A short first-time explainer** of the cold-start → comparative mechanic itself. This isn't a
  star rating or a thumbs up/down app; a first-time user has no existing mental model for "why am I
  being asked to compare two episodes instead of just rating this one," and the whole value
  proposition depends on understanding why that produces a better result.

### Show list / dashboard
- **Poster art + progress indicator per show** on the "My Shows" dashboard (e.g. "14 of 22 episodes
  ranked"), not just on the individual show page — makes the dashboard itself useful at a glance
  instead of just a list of titles.
- **Sort/filter "My Shows"** (alphabetical, most-recently-ranked, % complete) once the list is long
  enough that this actually matters.
- **Handling a show that airs new episodes after being imported** — `importShowFromTmdb` upserts and
  is idempotent, but there's no UI affordance today to explicitly "check TMDB again for new
  episodes" on an already-imported show; right now that would only happen as a side effect of
  re-searching and re-adding the same show. Worth an explicit "refresh from TMDB" action once a
  real show in someone's list actually airs a new season.

### Insights / cross-show views
- **A global "my top episodes across all shows" view** — a natural highlight reel once someone has
  ranked several shows, distinct from the strictly per-show ranking the core mechanic uses (see the
  still-open "cross-show ranking" question above — this would be a read-only aggregate view, not a
  change to the ranking mechanic itself).
- **Per-show or overall stats** — total episodes ranked, a favorite show, ranking activity over
  time. Low-stakes, satisfying "look what you've built" feedback.
- **Confidence indicator on a score** — an episode placed after one cold-start judgment and no
  comparisons is on much shakier ground than one that's been through several comparisons; surfacing
  that distinction (even just visually) would set more honest expectations than presenting every
  score with equal confidence.
- **"Why is this ranked here?"** — show the specific comparisons that led to an episode's current
  position (e.g. "ranked better than X, worse than Y"). Doubles as user-facing transparency and a
  debugging aid.

### Data ownership
- **Export your data** (CSV/JSON of shows/episodes/rankings) — this is personal taste data; letting
  someone take it with them is a reasonable ask even for a personal-use app, and cheap relative to
  the value.

### Mobile-specific (once the mobile/responsive check in `STATUS.md` Bucket 4 happens)
- **Swipe gestures for the comparison prompt** (swipe left/right for better/worse, tap for neutral)
  — a natural fit for a binary-choice mechanic on a touchscreen, arguably a better interaction than
  three buttons once there's a real mobile pass.

### Accessibility
- Keyboard navigation and screen-reader labeling for the ranking controls specifically (the
  comparison/cold-start buttons are the app's core interaction, so they're the highest-value place
  to get this right, ahead of the rest of the app).
