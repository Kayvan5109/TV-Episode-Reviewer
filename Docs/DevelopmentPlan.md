# Episode Ranker — Development Plan

The primary planning document: the idea in one place, a running space to discuss things before
they're locked in, a detailed phase-by-phase build plan, and a list of currently-unresolved
questions/issues to refer back to. `AppSpec.md` holds the full detailed spec (screens, flows, data
model) this doc summarizes; `STATUS.md` is the short "what's next right now" dashboard that points
back here for the full picture.

## The Idea

A TV episode ranking app. Pick a show, then rank its episodes against each other. New episodes
start with a coarse judgment (liked / disliked / neutral), then get placed precisely via
comparisons against already-ranked episodes, converging on a 1-10 score over time. Modeled on
Beli's ranking mechanic (the restaurant-ranking app) — see "Ranking Algorithm" below and
`AppSpec.md` for full detail. TMDB API supplies show/episode metadata (titles, season/episode
numbers, artwork). Personal use, no monetization, no deadline pressure.

**Two clients, one account, website first** (decided 2026-07-15): built as a **website first**,
then a native **iOS app** second — a website iterates far faster than Xcode/Simulator, which matters
because the ranking algorithm and score formula are both explicitly expected to need real-world
tuning (see Discussion below and `Risks.md`). Unlike a typical "throwaway prototype," the website is
meant to stay around long-term, not get retired once the iOS app exists. A user's rankings are tied
to an account (email signup), shared between the website and the iOS app via one backend
(Supabase) — see `TechArchitecture.md` for the full stack.

## Ranking Algorithm (current design)

This is the app's core mechanic and the main thing Phase 0 exists to prove out. Current shared
understanding, most-resolved-first:

1. **Cold start**: for a show with fewer than ~3-5 ranked episodes, a newly-ranked episode just gets
   a coarse bucket: **liked**, **disliked**, or **neutral** (decided 2026-07-15 — three buckets, to
   match Beli, not the original two-bucket liked/disliked idea).
2. **Comparative placement**: once a show has enough ranked episodes, a new episode is placed via
   binary-insertion-style comparison — compared against a midpoint episode in the current ranking,
   with each "better/worse/neutral" answer narrowing the range, converging in roughly log2(n)
   comparisons rather than a fixed count against arbitrary episodes.
3. **Tie-break via a common comparison episode** (decided 2026-07-15, mechanics still being worked
   out): if a comparison comes back "neutral" (a tie) between the new episode (A) and the episode it
   was compared against (B), the tie isn't left as-is — A is next compared against an episode that B
   itself has *already* been compared against (a "common reference point"), and the result of that
   comparison is used to break the tie and refine A's placement relative to B. This means the
   comparison history per episode needs to be queryable (not just a final score) so a common
   reference episode can be found. Still open, tracked in Issues below:
   - Which common episode to pick if B has been compared against several candidates.
   - What happens if B has no prior comparison history yet (e.g. B was placed very early, or B's
     placement also came from a tie that's still unresolved) — does the tie-break recurse, fall back
     to a different mechanism, or stay an open tie until more data exists?
4. **Score-from-position formula** (direction decided 2026-07-15, exact curve is a Phase 0 v1
   hypothesis to be tuned through testing, not a final answer): linear, per-show only, and
   **recomputed on every insertion** — see Discussion below for the full reasoning and the current
   working formula.

## Discussion — Ideas & Open Questions to Work Out Together

Live scratchpad for things worth talking through before they're locked in. Once something here gets
resolved, it moves up into "Ranking Algorithm" or `AppSpec.md` with a decided-on date, and a note
stays here pointing to where it landed.

### Resolved (2026-07-15, direction only — expect heavy tuning): turning rank position into a 1-10 score

Beli's exact internal formula isn't public, so this is genuinely ours to design — decided direction,
answered against the framing questions raised earlier:

- **Linear, for now** — kept deliberately simple as a v1 to prototype against, with the explicit
  expectation that getting this to *feel* right will take real testing and iteration once there's an
  actual app to try it in. Not treated as a final answer.
- **Scores shift on every insertion.** Ranking a new episode can change every other episode's score
  in that show, not just settle the new one. This has a real data-model consequence: **the 1-10
  score is derived, not stored as source of truth** — the durable state is each episode's comparison
  history / rank position, and the displayed score gets (re)computed from current rank position and
  the show's current episode count whenever it's shown or whenever a new episode is inserted. See
  `AppSpec.md`'s data model.
- **Per-show only.** A show's best-ranked episode is always a 10, and its worst-ranked is always a 1
  (subject to the small-sample compression below) — regardless of whether the show itself is great
  or terrible. No cross-show normalization. This also resolves the "cross-show ranking" open idea
  below in the negative for scoring purposes (ranking itself was already assumed within-show).
- **Range compresses for small sample sizes.** A show with only 1-2 ranked episodes shouldn't
  immediately claim a full 1-10 spread; the gap between best and worst should widen as more episodes
  get ranked, reaching the full range around where most shows actually sit (~6-8 episodes).

**Working v1 formula** (a concrete starting point to prototype in Phase 0, expected to need tuning):
for a show with `N` ranked episodes, an episode at rank position `p` (1 = best, `N` = worst) scores:

```
spread(N) = 9 * min(1, (N - 1) / 7)      # reaches the full 9-point spread at N = 8
score(p, N) = 10 - (p - 1) * spread(N) / (N - 1)     # for N > 1
score(1, 1) = 10                                      # single-episode case
```

This gives a single ranked episode a 10 by definition (satisfies "best is always a 10"), a small
compressed spread for a handful of episodes (e.g. at N=2, worst episode ≈ 8.7, not 1), and the full
1-10 spread once a show reaches 8 ranked episodes. The `7` in `spread(N)` (i.e. "full range by N=8")
is a tunable constant, not a fixed law — expect to adjust it, and possibly the linear shape itself,
once this is actually being used. Flag any of this back up for a rethink once real usage makes it
feel off.

### Other open ideas (lower priority, not blocking Phase 0)

- **Re-ranking**: if a user's opinion of an old episode changes, can they re-rank it, and does that
  ripple through other episodes' scores?
- **Cross-show ranking**: is ranking strictly within a single show, or could episodes ever be
  compared across different shows? (Current concept assumes strictly within-show.)
- **Liked/disliked/neutral-only episodes**: once a show has moved into comparative ranking mode, do
  earlier cold-start-only episodes ever get folded into the comparison pool, or do they keep a
  cruder score?
- ~~iCloud/CloudKit sync across devices~~ — **superseded 2026-07-15**: cross-device sync now comes
  for free from the shared Supabase account (website and iOS both read/write the same backend), so
  a separate iCloud sync mechanism isn't needed.
- **Keeping the TypeScript and Swift algorithm implementations in sync**: the ranking algorithm gets
  built twice (TypeScript for the website first, Swift for iOS later, per `TechArchitecture.md`).
  Worth a shared test-case format (e.g. a JSON fixture of "given this comparison history, expect
  this score") that both implementations can be checked against, so drift between them gets caught
  rather than silently diverging. Not blocking Phase 0-3 (website-only); becomes relevant once the
  iOS phase starts porting the algorithm.

## Development Phases

If this and `STATUS.md`'s Punch List ever disagree on what's next, treat the mismatch as a bug
worth fixing on sight — `STATUS.md` is the moment-to-moment pointer, this is the fuller plan behind
it.

Website comes first (Phases 0-3), iOS second (Phases 4-5) — see "The Idea" above for why.

### Phase 0 — De-risk (current phase)

Goal: prove out the ranking algorithm and stand up the shared backend, before any real UI exists —
the algorithm is the app's riskiest, least-proven idea, so it gets built and stress-tested in
isolation first.

What "done" looks like:
- The comparison/placement mechanic (cold-start bucket → binary-insertion comparative placement →
  tie-break via common comparison episode) implemented in TypeScript and unit-tested against
  made-up episode data — no UI needed yet.
- The v1 score-from-position formula (see Discussion above) implemented, with tests showing it
  produces sensible-looking scores across a range of show sizes (1 episode, a handful, 8+) — treated
  as a tunable starting point, not a final formula.
- A Supabase project created: Auth enabled (email/password), and a database schema for
  users/shows/episodes/comparison-history (see `AppSpec.md` data model).
- A basic TMDB API integration proven end-to-end via a Next.js API route: fetch a show, fetch its
  episode list, map it into the app's data model.
- A minimal Next.js project scaffolded and deployed to Vercel (even just a placeholder page) to
  prove the deployment path works before building real UI on top of it.

Not in scope for Phase 0: any real screens/navigation, visual design, the iOS app.

### Phase 1 — Website vertical slice / MVP

Goal: one complete core user flow, end to end, minimal polish, live on the website.

What "done" looks like: sign up / log in (Supabase Auth) → pick a show (via TMDB search) →
cold-start rank a handful of episodes (liked/disliked/neutral) → rank enough to trigger comparative
placement → see a resulting 1-10 score per episode in a simple list. Data persists in Supabase
Postgres, tied to the signed-in account. No onboarding, no settings, no visual polish beyond
"functional and readable." Deployed on Vercel so it's usable from any browser, not just localhost.

### Phase 2 — Website feature completeness

Goal: the full intended feature set, exercised with real shows/episodes rather than test data — and
the primary vehicle for actually tuning the ranking algorithm and score formula against real usage,
which was the whole point of building the website first. Likely includes resolving the "Other open
ideas" list above (re-ranking, whether cold-start-only episodes join the comparison pool, etc.) as
they become blocking rather than hypothetical, and revisiting the v1 score formula's constants once
there's real data to react to.

### Phase 3 — Website polish

Goal: performance, accessibility, edge cases (shows with 1 episode, shows with hundreds), and
proper empty/error states (no network for TMDB, a show with no episodes yet, etc.) — on the website.

### Phase 4 — iOS app

Goal: build the native SwiftUI app against the now-proven, tuned ranking algorithm and the same
Supabase backend/account system the website already uses — the point of building the website first
was to de-risk exactly this phase.

What "done" looks like: XcodeGen or Tuist project scaffolded; SwiftUI screens covering the same core
flows already proven on the website (sign up/log in, pick a show, cold-start rank, comparative
rank, see scores); ranking algorithm ported from the TypeScript version to Swift, with a shared test
fixture (see Discussion above) confirming the two implementations agree.

### Phase 5 — iOS polish & launch prep

Goal: only relevant if this ever moves beyond personal use. Performance/accessibility/edge-case
polish, then TestFlight beta, App Store assets (screenshots, description, privacy nutrition label —
note the TMDB and Supabase dependencies both need disclosing), submission.

### Phase 6 — Post-launch (stretch)

Goal: iteration based on real usage across both platforms; stretch features from the Discussion
backlog above that never became blocking.

## Issues — Currently Unresolved

Things to refer back to. Real code bugs get added here once Phase 0 produces actual code; for now
this is design/algorithm-level unresolved items (implementation bugs will get their own dated
entries once there's code to have bugs in).

1. **Score-from-rank-position formula is a v1 hypothesis, not tuned.** Direction is decided (linear,
   per-show, shifts on insertion, compresses for small samples — see Discussion above), but the
   exact curve/constants will need real tuning once there's an app to test it in.
2. **Tie-break "common comparison episode" selection is underspecified**: which episode to pick when
   multiple candidates exist, and what to do when no common episode exists yet. See "Ranking
   Algorithm" above.
3. **Cold-start → comparative-mode threshold is a placeholder** ("~3-5 episodes") — not yet tuned
   against real use; expect to revisit after using the app for a while.
4. **Backend vendor choice (Supabase) is Claude's pick, not independently reviewed.** Kayvan said
   "let me pick" for the stack, but choosing a specific third-party vendor for accounts/data is a
   real dependency worth a second look — logged as a Deviation Awaiting Review in `STATUS.md`.
