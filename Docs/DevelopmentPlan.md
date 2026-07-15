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
`AppSpec.md` for full detail. Fully on-device for ranking data (SwiftData); TMDB API supplies show/
episode metadata (titles, season/episode numbers, artwork). Personal use, no monetization, no
deadline pressure.

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
4. **Score-from-position formula**: not yet decided — see Discussion below. This is the one thing
   still needing a real back-and-forth before Phase 0 can be considered feature-complete, since
   ordering episodes correctly (steps 1-3) doesn't by itself tell you what number to show the user.

## Discussion — Ideas & Open Questions to Work Out Together

Live scratchpad for things worth talking through before they're locked in. Once something here gets
resolved, it moves up into "Ranking Algorithm" or `AppSpec.md` with a decided-on date, and a note
stays here pointing to where it landed.

### Active: turning rank position into a 1-10 score

This is genuinely open and needs discussion, not something to guess at unilaterally. Some framing,
to kick off that conversation:

- **What we know about Beli's approach**: broadly, apps like this normalize an item's position
  within its fully-ranked list into a score range — better position → higher score — rather than
  scoring each comparison independently (there's no way to derive an absolute "9.2" from a single
  better/worse/neutral answer; the number only means something relative to everything else ranked
  so far). The exact curve/formula Beli uses internally isn't public, so "modeled on Beli" so far
  means "the comparison mechanic," not a specific known scoring formula — that part is ours to
  design.
- **Design questions worth deciding together**:
  - Is the score a simple linear function of rank position (e.g. top episode = 10, bottom = some
    floor, evenly spaced in between), or non-linear (e.g. compressed at the top so only truly
    exceptional episodes get 9s/10s)?
  - Does the score for existing episodes shift every time a new episode is inserted into the
    ranking (since positions shift), or does a score "settle" and only get revisited occasionally?
    A shifting score is more mathematically honest but means numbers change on their own over time,
    which might feel odd; a settled score is more stable but can drift out of sync with the true
    ordering.
  - Is scoring per-show only (a show's #1 episode is always a 10, regardless of how good it
    actually is relative to other shows), or is there ever a cross-show normalization? (Ties into
    the still-open "cross-show ranking" question below.)
  - Floor/ceiling behavior for very small shows: does a show with only 2 ranked episodes really
    have a "10" and a "1," or should score range compress for small sample sizes?
- **Not yet decided.** Flag this back up whenever we're ready to hash it out — it doesn't block
  prototyping the comparison/placement mechanic (steps 1-3 above), only the final score display.

### Other open ideas (lower priority, not blocking Phase 0)

- **Re-ranking**: if a user's opinion of an old episode changes, can they re-rank it, and does that
  ripple through other episodes' scores?
- **Cross-show ranking**: is ranking strictly within a single show, or could episodes ever be
  compared across different shows? (Current concept assumes strictly within-show.)
- **Liked/disliked/neutral-only episodes**: once a show has moved into comparative ranking mode, do
  earlier cold-start-only episodes ever get folded into the comparison pool, or do they keep a
  cruder score?
- **iCloud/CloudKit sync** across devices — currently out of scope (on-device only), revisit if
  wanted later.

## Development Phases

If this and `STATUS.md`'s Punch List ever disagree on what's next, treat the mismatch as a bug
worth fixing on sight — `STATUS.md` is the moment-to-moment pointer, this is the fuller plan behind
it.

### Phase 0 — De-risk (current phase)

Goal: prove out the ranking algorithm before any real UI exists — this is the app's riskiest,
least-proven idea, so it gets built and stress-tested in isolation first.

What "done" looks like:
- The comparison/placement mechanic (cold-start bucket → binary-insertion comparative placement →
  tie-break via common comparison episode) implemented and unit-tested against made-up episode
  data, run from the command line or a minimal test harness — no SwiftUI screens needed yet.
- The score-from-position formula (see Discussion above) decided and implemented, with tests
  showing it produces sensible-looking scores across a range of show sizes (tiny show, large show).
- A basic TMDB API integration proven end-to-end: fetch a show, fetch its episode list, map it into
  the app's data model.
- XcodeGen or Tuist chosen and the project scaffolded from a plain-text config (see
  `TechArchitecture.md`).

Not in scope for Phase 0: any real screens/navigation, visual design, persistence polish beyond
what's needed to test the algorithm.

### Phase 1 — Vertical slice / MVP

Goal: one complete core user flow, end to end, minimal polish.

What "done" looks like: pick a show (via TMDB search) → cold-start rank a handful of episodes
(liked/disliked/neutral) → rank enough to trigger comparative placement → see a resulting 1-10
score per episode in a simple list. Persisted via SwiftData so it survives an app relaunch. No
onboarding, no settings, no visual polish beyond "functional and readable."

### Phase 2 — Feature completeness

Goal: the full intended feature set, exercised with real shows/episodes rather than test data.
Likely includes resolving the "Other open ideas" list above (re-ranking, whether cold-start-only
episodes join the comparison pool, etc.) as they become blocking rather than hypothetical.

### Phase 3 — Polish

Goal: performance, accessibility, edge cases (shows with 1 episode, shows with hundreds), and
proper empty/error states (no network for TMDB, a show with no episodes yet, etc.).

### Phase 4 — Launch prep

Goal: only relevant if this ever moves beyond personal use. TestFlight beta, App Store assets
(screenshots, description, privacy nutrition label — note the TMDB dependency needs disclosing),
submission.

### Phase 5 — Post-launch (stretch)

Goal: iteration based on real usage; stretch features from the Discussion backlog above that never
became blocking.

## Issues — Currently Unresolved

Things to refer back to. Real code bugs get added here once Phase 0 produces actual code; for now
this is design/algorithm-level unresolved items (implementation bugs will get their own dated
entries once there's code to have bugs in).

1. **Score-from-rank-position formula is undecided.** See Discussion above — blocks Phase 0
   completion, doesn't block starting the comparison-mechanic prototype.
2. **Tie-break "common comparison episode" selection is underspecified**: which episode to pick when
   multiple candidates exist, and what to do when no common episode exists yet. See "Ranking
   Algorithm" above.
3. **Cold-start → comparative-mode threshold is a placeholder** ("~3-5 episodes") — not yet tuned
   against real use; expect to revisit after using the app for a while.
