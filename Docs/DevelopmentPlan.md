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

1. **Cold start**: for a show with fewer than 4 ranked episodes (i.e. the first 3), a newly-ranked
   episode just gets a coarse bucket: **liked**, **disliked**, or **neutral** — three buckets, to
   match Beli, not a binary liked/disliked choice (decided 2026-07-15; reconfirmed 2026-07-15 after
   a brief mix-up in a later write-up implied only two buckets — the three-bucket version is what's
   built and what stands).
2. **Comparative placement**: once a show has 4+ ranked episodes, a new episode is placed via true
   binary-insertion-style comparison — compared against a midpoint episode in the current ranking,
   with each "better/worse/neutral" answer narrowing the range, converging in roughly log2(n)
   comparisons rather than a fixed count against arbitrary episodes. **Reconfirmed 2026-07-15**: an
   alternative was floated and explicitly rejected — comparing exhaustively against every existing
   episode for small shows, then against a fixed sample of ~5 for larger ones. Binary search is
   cheaper at every list size worked through as examples *and* guarantees an exact placement, where
   a fixed sample only narrows to an approximate band and would need its own (undesigned)
   interpolation rule to turn into a real position. True binary search stays the mechanism at every
   show size.
3. **Tie-break via a common comparison episode** (fully resolved 2026-07-15): if a comparison comes
   back "neutral" (a tie) between the new episode (A) and the episode it was compared against (B),
   A is compared against a follow-up reference episode instead, chosen by a two-tier rule:
   1. Prefer the closest-in-rank episode among B's own comparison history that has a **decisive**
      (non-neutral) recorded result with B.
   2. If no such episode exists (B has no history, or none of it is decisive), fall back to simply
      the closest-in-rank episode anywhere in the current ranking — no history requirement at all.
   The follow-up comparison's result is used to keep narrowing the binary search exactly as an
   ordinary better/worse answer would. If it's *also* neutral, the same two-tier rule runs again from
   the new reference episode (excluding episodes already tried), up to 3 attempts total — if every
   attempt ties, the new episode is inserted immediately adjacent to whichever episode was tried
   last. This means the comparison history per episode needs to be queryable (not just a final
   score) so a common reference episode can be found.
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
- **Live/autocomplete show search**: the `/shows/search` page (Phase 1 piece 2a) requires an
  explicit submit rather than searching as you type. Reasonable UX improvement, deliberately not
  built in Phase 1 (which explicitly scoped out visual/UX polish) — candidate for Phase 2.
- **Cross-show ranking**: is ranking strictly within a single show, or could episodes ever be
  compared across different shows? (Current concept assumes strictly within-show.)
- ~~Liked/disliked/neutral-only episodes joining the comparison pool~~ — **resolved 2026-07-15**:
  yes, cold-start episodes fold into the comparison pool immediately the first time a show crosses
  into comparative ranking mode, confirmed by Kayvan. See `AppSpec.md`.
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

### Phase 0 — De-risk (complete, 2026-07-15)

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

All done: ranking algorithm (cold-start/comparative/tie-break/score formula), Supabase schema with
RLS, TMDB proxy route, Next.js scaffold, live on Vercel. See `STATUS.md` History for the review
trail.

### Phase 1 — Website vertical slice / MVP (current phase)

Goal: one complete core user flow, end to end, minimal polish, live on the website. Being built in
two sequential pieces: **auth first** (everything else needs a signed-in user), **then** the core
ranking flow on top of it.

What "done" looks like: sign up / log in (Supabase Auth) → pick a show (via TMDB search) →
cold-start rank a handful of episodes (liked/disliked/neutral) → rank enough to trigger comparative
placement → see a resulting 1-10 score per episode in a simple list. Data persists in Supabase
Postgres, tied to the signed-in account. No onboarding, no settings, no visual polish beyond
"functional and readable." Deployed on Vercel so it's usable from any browser, not just localhost.

Auth, show search/import, the ranking algorithm's persistence layer, and now the episode-picker
ranking UI rebuild are all built and reviewed (see `STATUS.md` History). **Phase 1's core ranking
flow is code-complete end to end again**, pending a real hands-on browser check (see `STATUS.md`
Bucket 2) before it's actually called done.

**Decided 2026-07-16: episode-picker replaces the auto-advancing single flow.** Kayvan's test found
the first cut forced ranking whatever episode `nextUnrankedEpisode` picked (hardcoded season/episode
order), with no way to pick a specific episode or to see current rankings mid-way. Confirmed
direction: `/shows/[showId]` becomes a real per-episode list (each episode shows ranked+score /
cold-start-pending+bucket / unranked), and clicking any unranked episode ranks *that one*
specifically, in whatever order the user wants — this also surfaces current rankings as a natural
byproduct, and resolves the "no way back to the show page" gap (the show page IS the persistent home
now). This is compatible with the underlying algorithm exactly as designed, confirmed by re-reading
the source directly rather than assuming: `orderColdStartIds` (`coldStart.ts`) already orders purely
by judgment sequence, not air-date, and `placeEpisodeComparatively`/`resolveTie`
(`comparativePlacement.ts`) keep `subject` fixed as the episode being placed through an entire
placement including any tie-break hops — so nothing about the algorithm assumes or requires
air-date-sequential ranking. Confirmed priority: build this next, ahead of the rest of the Phase 1
queue below. **Built and reviewed 2026-07-16** (see `STATUS.md` History) — `ranking-session`'s
`submitColdStartAnswer`/`submitComparisonAnswer` now validate against the specific target episode
rather than requiring "next in order," and a new `getShowRankingDisplay` backs the always-visible
current-rankings view. Further hands-on testing the same day (2026-07-17) found and got fixed three
more small gaps (no sign-out button, a scary error on a stale post-back resubmission, a confusing
"Add show" label) — see `STATUS.md` History for the full trail.

**Decided 2026-07-17: remove-show + re-ranking mechanics.** Both confirmed wanted (a third time,
2026-07-17). Removing a show deletes that user's `episode_rankings`/`episode_comparisons` for its
episodes too, not just the `user_shows` row — a clean slate if re-added later, not an instant
restore. Re-ranking clears both `rank_position` *and* that episode's `episode_comparisons` history,
not just its position — keeping old comparisons would mean the replay comparator
(`makeReplayComparator`) just answers from stale history instead of ever asking again about a pair
already compared, which would defeat the actual point of re-ranking (the user's opinion changed).
Building now.

**Next session's plan (after that lands and gets its hands-on check) — work in this order:**

1. **TMDB attribution** (small, quick — do this early as an easy win). TMDB's API terms require
   visible attribution (something like "This product uses the TMDB API but is not endorsed or
   certified by TMDB") somewhere in the app — add it to `AppHeader` or a small shared footer. See
   `Risks.md`.
2. **Password reset flow** — currently completely absent; a real user who forgets their password has
   no way to recover their account. Use Supabase Auth's `resetPasswordForEmail` (sends a reset-link
   email — reuse the site's existing default-email-provider path, same as signup confirmation) plus
   a page to set a new password. Same session/cookie-handling care as the rest of auth — this touches
   the same correctness-critical territory as `/auth/confirm`/`proxy.ts`, so give it the same review
   rigor (read the actual code, don't just trust tests, and get a real email click-through check).
3. **Privacy notice.** A short, honest static page describing what's collected (email/password,
   show/episode preferences) and that it passes through three third parties (Supabase, TMDB,
   Vercel). Content/writing task more than a code task — draft it together with Kayvan rather than
   inventing legal-sounding text unilaterally.

**Logged for later, not next session** (see `Risks.md`/`STATUS.md` Bucket 4 for the full notes):
custom SMTP (email capacity — currently capped at 2/hour project-wide, fine for a handful of real
testers but not a wider rollout), a mobile/responsive check, error monitoring, and visual design.

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
2. ~~Tie-break "common comparison episode" selection~~ — **resolved 2026-07-15**: two-tier rule
   (decisive-relationship-first, then plain-closest-in-rank fallback). See "Ranking Algorithm" above.
3. ~~Cold-start → comparative-mode threshold~~ — **resolved 2026-07-15**: exactly 3 cold-start
   episodes, the 4th is the first comparative one. Still a Phase-2 candidate for retuning once
   there's real usage, but no longer a placeholder range.
4. **Backend vendor choice (Supabase) is Claude's pick, not independently reviewed.** Kayvan said
   "let me pick" for the stack, but choosing a specific third-party vendor for accounts/data is a
   real dependency worth a second look — logged as a Deviation Awaiting Review in `STATUS.md`.
