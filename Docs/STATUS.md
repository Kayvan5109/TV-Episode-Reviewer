# Episode Ranker — Current Status

**Read this file first** — before the other docs, before doing anything else. It's the single
"what's actually going on right now" pointer, kept short and current on purpose.

**[Docs/CriticalReview.md](CriticalReview.md) was written 2026-07-18** — a deliberately harsh,
requested full-project critique. Top finding: the roadmap is designing far ahead of any real usage
(a whole social layer, gamification, and stats fully designed for an audience of one). Also names a
**live, currently-unfixed security gap**: `/api/tmdb/search` and `/api/tmdb/[showId]/episodes` are
reachable by anyone on the internet with no auth check, burning this project's own TMDB token —
`proxy.ts`'s matcher excludes `/api` entirely and neither route calls `getUser()` before fetching.
Not fixed yet as of this update — Kayvan's call on when, see the exchange right after this doc was
written. Read the full review before scoping new feature work; not repeating its findings here.

Last updated: 2026-07-18. Same session as the cold-start fix above, continued: built, reviewed, and
merged all 6 remaining Bucket 1 items back to back — Search Shows nav link + progress counter, season
poster art, TMDB attribution footer, the password reset flow, TMDB genres on the show page, and the
privacy notice (see History for each). **Bucket 1 is now fully cleared — Tier A is next.** Kayvan
hands-on confirmed on live Vercel: nav link, progress counter, attribution footer, and season posters
all working; genres also confirmed working ("looks good"). Also did one small follow-up polish
directly (removed the now-redundant "N episodes imported" line from the show page). The privacy
notice's content (email/password + ranking data collected; Supabase/TMDB/Vercel as the three third
parties) came directly from Kayvan, not invented. **Password reset deliberately deferred, not
urgent**: Kayvan is the only user right now, so its 3 setup steps (Vercel env var, Supabase redirect
allowlist, one email click-through test — see History) can wait until it actually matters. **A
worktree-isolation process issue recurred a third time this session** (3 of 6 agent dispatches) — see
Deviations Awaiting Review, still not investigated, happening often enough (half the time) to be
worth digging into before relying on it again for anything where a real file collision would matter.

## Punch List (ranked — read this section first for "what's actually next")

Every open item gets triaged into exactly one bucket the moment it surfaces, per
[ProcessAndRoles.md](ProcessAndRoles.md#punch-list-triage). Default is "log it, don't chase it"
unless it's small or genuinely blocking.

**Bucket 1 — Blocking / next in sequence:**
(empty — every item from the 2026-07-17 testing round is done, see History. "Tier A" below is next.)

**"Tier A" — a small batch pulled from an external design review, decided 2026-07-17, now the
front of the queue** (see `AppSpec.md`'s "External Design Review — Triage" and
`DevelopmentPlan.md`'s Discussion section for the full reasoning behind each):

1. **Keyboard shortcuts** on the cold-start and comparison screens (e.g. arrow keys or number keys
   for liked/disliked/neutral and better/worse/about-the-same) — small, no design decision needed.
2. **Ranking confidence** ("your Breaking Bad rankings are 87% stable") — the strongest idea from
   the review. Concrete v1 formula already written up in `DevelopmentPlan.md` (decisive-comparison
   count relative to `log2(showEpisodeCount)`, no schema changes needed) — read that before
   building, it also documents a known v1 limitation (doesn't yet detect tie-break-fallback
   placements) that's deliberately not being solved yet.
3. **Statistics view + alternate visualizations** of a show's existing rankings (e.g. a tier list,
   heatmap, or season timeline) — sequence after item 2, since "most/least confident episode" is a
   natural stat once confidence exists. Purely additive over data `getShowRankingDisplay` already
   computes; no new persistence logic.
4. **Richer comparison screen**: episode synopsis + cast shown alongside each side. Needs a bit
   more TMDB plumbing than the others (episode-level synopsis and cast credits aren't imported
   today) — scope this properly before starting rather than assuming it's as small as item 1.
5. **Collections** — user-created private lists of episodes across shows (e.g. "Best Pilot
   Episodes"). Independent of the rest of this batch, can slot in anywhere. Keep to private-only
   for now — a *shareable* version needs public-link infrastructure that doesn't exist yet (see
   the Tier B note in `AppSpec.md`).
6. **Per-show progress bar on the dashboard** — added 2026-07-17: each show in "My Shows" gets a
   progress indicator (episodes ranked so far) right on the dashboard list itself, not just on the
   show's own page (the per-show-page counter is already built — see History 2026-07-18; this is the
   dashboard-list version — related but distinct, both worth building). Overlaps an idea already
   sitting in `AppSpec.md`'s original brainstorm list ("Poster art + progress indicator per show" on
   the dashboard) — same underlying data (`getShowRankingDisplay` per show), just surfaced one level
   up. Purely additive, no design decision needed.
7. **"Date ranked" next to each episode's name on the show page** — added 2026-07-17. No schema
    change needed: `episode_rankings.created_at` already means exactly this — it's set once, the
    first time a row exists for that episode (its first cold-start judgment, or the day it was
    first comparatively placed), and survives untouched through later position-shuffling upserts
    (`persistRankedPositions` only ever writes `rank_position`/`cold_start_bucket`/
    `cold_start_sequence`, never `created_at`); re-ranking deletes the row and a fresh one gets
    created on the next judgment, so `created_at` correctly becomes the new date too. Needs:
    `getShowRankingDisplay` to also select and return `created_at` per episode (currently only
    returns `episodeId`/`score`/`bucket`), and the show page to render it, formatted (e.g. "Jul 15"),
    next to the episode title — for both fully-ranked and cold-start-pending episodes (anything with
    an `episode_rankings` row at all), not shown for untouched ones. Small, self-contained, no design
    decision needed.

Dark mode + per-show accent theming (also proposed in the same review) is **deliberately not in
this queue** — reconfirmed 2026-07-17 that it stays bundled with the rest of the visual-design pass
in Bucket 4, rather than being done piecemeal now.

**Bucket 2 — Bugs/features needing hands-on verification or fixing:**
1. **Privacy notice page, built 2026-07-18, not yet hands-on checked.** Low-priority (static content
   page, nothing functional to break) — just confirm the footer's "Privacy" link works from a
   signed-out page too (e.g. `/login`), not only while signed in.
2. **A big 2026-07-17 hands-on round confirmed nearly everything works** — see History for the full
   list (auth, search/import, dashboard, show detail page, the rankings page, cold start,
   comparative placement, re-ranking, removing a show all confirmed working end to end). What's
   genuinely still untested/unconfirmed, carried forward rather than chased right now:
   - A real tie-break chain wasn't explicitly exercised/confirmed (deliberately answering "about the
     same" and getting a sensible follow-up against a *different* episode).
   - Two shows ranked concurrently (nothing bleeding between them).
   - A quick look-and-feel pass on a narrow/phone-width window, and whether the ranking mechanic
     feels explained enough to a first-time user.
   - Direct-URL edge cases: visiting an already-ranked episode's rank URL directly.
   These are all low-priority, not blocking — pick up naturally during normal use rather than a
   dedicated pass.

**Bucket 3 — Design decisions needing human input (don't block code):**
(empty for now — every question posed 2026-07-17 is resolved: remove-show/re-ranking's scope, the
cold-start small-show fix's design (see `DevelopmentPlan.md`, now built — see History 2026-07-18),
poster art and genres both confirmed "build it," and episode count in search explicitly declined —
see Bucket 4.)

**Bucket 4 — Backlog, logged, not being chased:**
1. Shared test-fixture format to keep the TypeScript (website) and Swift (iOS) ranking-algorithm
   implementations from drifting apart — relevant once the iOS phase (Phase 4) starts porting the
   algorithm, not before. See `DevelopmentPlan.md` Discussion.
2. **`code` query param collision risk**: `proxy.ts`'s code-exchange branch (for Supabase's
   default confirmation-link pattern) checks for a `code` query param on *any* route it matches, not
   just `/`. Fine today (nothing else uses that param name), but worth remembering if a future
   feature ever wants a `?code=` param for something unrelated (e.g. an invite/referral code) — it
   would collide with this Supabase auth handling.
3. **Custom SMTP (Resend) for auth emails, to lift the default provider's 2-emails/hour cap.**
   Attempted 2026-07-16: configured Resend as custom SMTP (host `smtp.resend.com`, tried both port
   465 and 587, fresh API key, correct sender/username) — Resend's own dashboard never showed a
   single connection attempt regardless of port, so the failure is upstream of Resend itself (some
   Supabase-side connection issue, not a Resend credentials/config problem). Deliberately not chased
   further — the default provider works fine for continued solo development. **Revisit before real-
   world testing widens beyond a couple of people** — 2 emails/hour project-wide will start silently
   failing signups/resets otherwise (confirmed priority 2026-07-16, still not urgent for a small
   initial test group).
4. **Mobile/responsive check** — nothing's been tested outside a desktop browser yet. Flagged
   2026-07-16 as needed before real-world testing widens, not before.
5. **Error monitoring** — no visibility if something breaks for a real user other than them telling
   you. Consider a lightweight free-tier setup (e.g. Sentry) before wider testing. Flagged 2026-07-16.
6. **Visual design** — still zero design polish, bare Tailwind defaults throughout. Flagged
   2026-07-16 as a real gap before wider testing, deliberately deferred past piece 2b.
7. ~~Small-show exact score precision~~ — **superseded 2026-07-17, fix built 2026-07-18**: the
   specific 3-episode all-neutral example (scores 10/8.7/7.4) led to a real, decided fix — see
   `DevelopmentPlan.md`'s Discussion section and History 2026-07-18. That fix substantially shrinks
   this class of issue but
   doesn't fully eliminate it (a genuine pairwise "neutral" comparison still breaks the tie to a
   specific adjacent position, everywhere in the app, not just in cold start) — going further
   (real tied scores) was discussed and explicitly declined as a bigger, not-currently-worthwhile
   change to the core scoring model.
8. **Repeatedly comparing against the same reference episode** — raised 2026-07-17 (with 14
   episodes ranked, comparisons kept landing on the same episode). Confirmed expected, not a bug —
   inherent to binary-insertion search always starting from the current midpoint; should lessen
   naturally as a show grows. A real mitigation (randomizing the pivot) was discussed and declined
   for now given the cost/benefit — see `DevelopmentPlan.md`'s Discussion section, "Open discussion,
   not scheduled." Revisit only if it's still bothering Kayvan once shows have more episodes ranked.
9. **Episode count in TMDB search results** — decided 2026-07-17: not being built. TMDB's
   `/search/tv` doesn't return an episode count (only `/tv/{id}` "show details" does), so showing
   it in live search would mean an extra TMDB call per result on every debounced keystroke search —
   Kayvan chose to keep search fast over having this, given episode count is already visible once a
   show's been added.
10. **A less-silent message on a stale post-back resubmission** — raised 2026-07-17. Right now a
   stale resubmission (browser back to an already-answered question, submitting again) silently
   redirects to the show page with no explanation, even if the user's second click was a genuinely
   different answer than their first — discussed with Kayvan and agreed this is the *correct*
   behavior (a stale page shouldn't be trusted to write a change, and the deliberate way to change
   an already-recorded answer is the re-ranking feature, not an accidental stale resubmit), but a
   brief "this was already ranked, nothing changed" message instead of a silent redirect would be a
   nice small polish. Not urgent enough to build now.

**Bucket 5 — Rework flagged for a later phase, not being worked now:**
(empty for now)

## Deviations Awaiting Review

Solo judgment calls made mid-session that weren't slept on get logged here and surfaced at the
start of the next session for a second look — even solo, "I decided this at 11pm without thinking
it through" is worth a deliberate re-check, not silent acceptance.

- 2026-07-18: **Process issue, not a judgment call, recurred a third time — now clearly not rare,
  worth actually investigating rather than just noting.** The implementer agent for the small-show
  cold-start fix was spawned with `isolation: "worktree"`, but the resulting worktree had no `.git`
  at all (a plain directory copy, not a registered git worktree), and its edits landed directly as
  uncommitted changes on `main`'s own working tree instead. Later the same session, 3 more
  `isolation: "worktree"` agents were dispatched (nav link/progress counter, TMDB attribution, season
  posters) and all 3 got genuine, properly registered worktrees — but the password-reset agent hit
  the exact same failure as the cold-start fix (no worktree, edits landed directly on `main`), and
  then the genres agent hit it again too. So across 6 `isolation: "worktree"` dispatches this
  session, 3 silently produced no isolation at all — not a one-off, roughly half the time, seemingly
  at random (no pattern found yet in task size/complexity/timing that predicts which). Every
  occurrence was caught only because either an independent reviewer agent went looking for a branch
  to diff against and found none, or the PM noticed a build-route table already listing routes an
  agent hadn't been merged yet. Every occurrence happened to cause no actual harm (no file overlap
  with whatever else was running concurrently), but that was luck, not something the tooling
  guaranteed — a genuinely parallel pair of agents touching overlapping files could silently corrupt
  each other's work under this failure mode. Possibly related to this environment's known Windows
  file-lock issue with worktree cleanup (see the recurring `failed to delete '.git/worktrees/agent-*'`
  warnings on every commit, going back to at least 2026-07-15) — or a separate, intermittent bug in
  how the worktree gets created. **Worth actually investigating next session** (e.g. always verify
  `git worktree list` right after dispatching, before assuming isolation held) before leaning on
  `isolation: "worktree"` for anything where a real collision would matter — at this failure rate, the
  practical mitigation until it's understood is: always check `git worktree list` before assuming an
  agent's work is isolated, and avoid dispatching multiple parallel agents that touch overlapping
  files regardless of requested isolation.
- 2026-07-15: Implementer agent made 7 judgment calls while building the ranking-algorithm prototype
  (`website/src/lib/ranking/`), each marked `JUDGMENT CALL` in the source (now merged to `main`).
  Most-important-first:
  1. ~~Cold-start episodes get permanently folded into the comparative comparison pool the first
     time a show crosses the cold-start threshold~~ (`engine.ts`, `addComparativeEpisode`) —
     **confirmed 2026-07-15 by Kayvan**: yes, fold them in immediately, as built. This resolves
     `AppSpec.md`'s open "do cold-start-only episodes ever join the comparison pool?" question in
     the affirmative — update that doc's Open Design Questions accordingly next session.
  2. Cold-start bucket ordering (`coldStart.ts`): liked > neutral > disliked; most-recent-first
     within a bucket. Arbitrary, undiscussed.
  3. ~~Common-reference-episode selection when several candidates exist~~ — **resolved and shipped
     2026-07-15**: two-tier rule (decisive-relationship-first, then plain-closest-in-rank fallback)
     implemented in `findCommonReference`, 6 new tests added, independently reviewed. See History
     below.
  4. Tie-break recursion mechanics: the new subject-vs-common-reference result stands in directly
     for the neutral subject-vs-B result to keep narrowing the same binary-search bounds, rather than
     treating the common reference's own rank position as a separate bound.
  5. Recursion cap: after 3 all-neutral tie-break attempts, falls back to inserting adjacent to the
     last-compared episode.
  6. No-history fallback: if the tied-against episode has no comparison history yet, skip tie-break
     entirely and insert adjacent to it.
  7. "Adjacent" direction in both fallbacks above means immediately *after* (worse than) the
     reference episode — arbitrary, could equally be "before."
- 2026-07-15: Picked the specific backend/hosting vendors — **Supabase** (Postgres + Auth) and
  **Vercel** (website hosting) — when Kayvan asked for a website-first, shared-account architecture
  and said "let me pick" on tech stack specifics. This is a real third-party dependency (accounts,
  data, hosting) chosen unilaterally rather than independently vetted, even though it was within the
  scope of what was asked. Worth a second look next session, especially the choice to trust Supabase
  with auth/account security rather than building that in-house — see `TechArchitecture.md`'s Why
  section and `Risks.md` for the reasoning.

## History

(Newest entries at the top. Prune detailed narrative to git-history pointers once a phase's
Deviations are fully cleared and reviewed — see `ProcessAndRoles.md`'s documented convention. This
keeps this file fast to read at the start of every session instead of growing forever.)

- 2026-07-18: Kayvan hands-on confirmed genres working on live Vercel ("I see the genre there. Look
  good."). Gave the privacy notice's content directly (email/password + ranking data collected;
  Supabase/TMDB/Vercel as the three third parties) rather than leaving it to be invented. Built
  directly (small enough not to need an agent): new static `/privacy` page plus a "Privacy" link
  added to the site-wide footer next to the TMDB attribution notice (so it's reachable regardless of
  auth state, matching that notice's own reasoning). Tests/typecheck/lint/build re-run fresh
  (198/198), `/privacy` confirmed static in the build's route table. **This was the last item in
  Bucket 1 — the bucket is now fully cleared, "Tier A" is next.**
- 2026-07-18: Built and merged TMDB genres on the show page (new `shows.genres text[]`, migration
  `20260718010000_shows_genres.sql`, same null-vs-empty-array pattern as the season-poster migration)
  — a comma-separated genre line now renders under the show title when present. Implementer + PM
  review (purely additive, matching the just-shipped season-poster pattern closely): read the diff
  directly, confirmed no second `mapShowDetails` call site needed the same fix the season-poster work
  found, re-ran tests/typecheck/lint/build fresh (198/198). Not yet hands-on tested — see Bucket 2.
- 2026-07-18: Kayvan hands-on tested the 4-item batch below on live Vercel. Confirmed working: the
  Search Shows nav link, the progress counter, the TMDB attribution footer (visible on every page),
  and season poster art on the comparison screen. One follow-up request, done directly (small enough
  not to need an agent): removed the now-redundant "N episodes imported" line from the show page,
  since the progress counter already conveys the total. Password reset explicitly deferred — not
  urgent with a single user — its 3 setup steps stay logged above whenever it's picked back up.
- 2026-07-18: Same session, continued past the cold-start fix at Kayvan's request to push through
  as much of the remaining Bucket 1 queue as budget allowed (checked in on work order first — agreed
  to finish items 2-6 before jumping to Tier A, per the original sequencing decision). Four more
  items built, reviewed, merged, and pushed, each via its own implementer agent:
  1. **Search Shows nav link + episode-ranked progress counter** (`AppHeader.tsx`,
     `shows/[showId]/page.tsx`) — feel-based UI, no open design questions, implementer agent +
     direct PM diff review + fresh test/typecheck/lint/build re-run, no independent reviewer needed.
  2. **TMDB attribution footer** (`app/layout.tsx`) — same treatment, trivially small.
  3. **Season poster art on the comparison screen** — new nullable `episodes.season_poster_url`
     column (migration `20260718000000_episode_season_poster.sql`), threaded through
     `mapSeasonEpisode`/`importShowFromTmdb`, rendered as a thumbnail next to each side on
     `rank/[episodeId]/page.tsx`. The implementer caught and fixed a second `mapSeasonEpisode` call
     site (`api/tmdb/[showId]/episodes/route.ts`) that its own signature change would have silently
     broken via `Array.map`'s `(value, index)` arity — a real bug avoided, not introduced. TMDB's
     season-endpoint response shape (`poster_path` as a sibling to `episodes`) was confirmed from
     the implementer's training knowledge, not a live API call — worth a sanity check once a show
     gets re-imported for real.
  4. **Password reset flow** (`/forgot-password`, `/reset-password`) — correctness-critical (touches
     live `proxy.ts`), got the full implementer-then-independent-reviewer treatment. While scoping
     this, found and fixed a real latent bug before it could ship: Supabase's stock password-recovery
     email uses the same `?code=<uuid>` pattern as signup confirmation (just with `&type=recovery`
     appended), so `proxy.ts`'s existing `handleCodeExchange` would have silently swallowed a
     password-reset link into the signup-confirmation path — exchanging the code and redirecting
     straight to `/dashboard`, logging the user in without ever prompting for a new password. Fixed
     by branching on `type=recovery` to `/reset-password` instead, with 5 new tests proving
     non-recovery behavior is byte-for-byte unchanged. Independent reviewer re-derived the fix by
     hand, confirmed the anti-enumeration behavior against Supabase's own documented semantics, and
     re-ran all checks fresh — no functional bugs found, one comment-wording fix applied directly.
     **Needs 3 things from Kayvan before it works live** — see this file's top summary for the exact
     steps (Vercel env var, Supabase redirect allowlist, one deliberate email click-through test).
  All four re-verified fresh (tests/typecheck/lint/build) in the merged location before each commit,
  matching this project's usual rigor. A process issue recurred during this batch — see Deviations
  Awaiting Review, now a 2-of-5 pattern this session, not a one-off. Remaining before Tier A: genres
  on the show page, and the privacy notice (needs Kayvan's input on content).
- 2026-07-18: Kayvan hands-on tested the small-show cold-start fix on the live Vercel deployment (a
  real 3-episode show): episode 1 got the cold-start liked/disliked/neutral question, episodes 2 and
  3 both got real comparative placement, exactly as designed. **Bucket 1's former item 1 is now fully
  done end to end** (built, independently reviewed, merged, pushed, hands-on confirmed in
  production). Moving to the next Bucket 1 item (Search Shows nav link + progress counter).
- 2026-07-18: Built and merged the small-show cold-start fix (`Docs/DevelopmentPlan.md`'s "Decided
  2026-07-17, built 2026-07-18: small shows skip cold-start bucketing after episode 1") — a show
  with fewer than `COLD_START_THRESHOLD` (4) total episodes now only cold-start-buckets its first
  episode; every episode after that goes through real pairwise comparative placement instead of
  another liked/disliked/neutral bucket. Normal-size shows (4+ episodes) are unchanged. Given the
  full rigor `ProcessAndRoles.md` calls out for the ranking algorithm specifically: an implementer
  agent built it (new `effectiveColdStartThreshold` in `constants.ts`; `totalShowEpisodeCount`
  threaded through `isColdStart`/`addColdStartEpisode`/`addComparativeEpisode`/`rankNewEpisode` in
  `engine.ts` and every call site in `ranking-session/session.ts`), then a second, independent
  reviewer agent fresh-eyes-verified it against the design doc directly (hand-traced the threshold
  logic, confirmed no missed call sites anywhere in `website/src`, confirmed normal-size-show
  behavior collapses to the old flat-threshold behavior exactly, re-ran every check itself rather
  than trusting the implementer's report) and confirmed it correct with only minor non-blocking
  notes: a test comment in `session.test.ts` that had gone stale relative to this exact change, two
  doc-comments in `session.ts` still describing behavior purely in terms of the old flat constant,
  and a coverage gap (the global `getNextRankingStep` path wasn't separately exercised for a small
  show, only the per-episode `getNextStepForEpisode` path was). PM applied all of these directly
  (rewrote the stale comment, updated the two doc-comments, added one new test covering the
  `getNextRankingStep` path for a 3-episode show) and re-ran `npm test`/`npx tsc --noEmit`/
  `npm run lint`/`npm run build` fresh again before committing — 181/181 tests, clean typecheck,
  clean lint, clean build. Committed directly to `main` (`1edff1b`) rather than merging a branch,
  because of a separate process problem the reviewer surfaced — see Deviations Awaiting Review. Also
  committed one small pending doc change that had been sitting uncommitted since the previous
  session (`Docs/STATUS.md`'s Tier A item 14, "date ranked" — decided last session, never actually
  committed). **Not yet pushed** (no remote push happened this session) **and not yet hands-on
  tested in a real browser** — see Bucket 2, that's the literal next thing to do.
- 2026-07-17: Resolved all 5 of the original engagement/growth ideas from earlier the same session
  (paused mid-discussion when the QA round took over) — see `AppSpec.md`'s new "Original 5-Idea
  Engagement Brainstorm — Resolved" section. Shareable ranking cards: **denied**, not being
  pursued. Friends/following and community consensus: **confirmed to build eventually**, already
  covered by Tier B's existing detailed design (no new plan needed). Personal stats/recap and
  gamification (achievements/streaks): **confirmed**, and got their own detailed designs written up
  fresh — see `AppSpec.md`'s "Personal Stats & Recap" and "Gamification: Achievements & Streaks"
  sections. Both are, like Tier B, **confirmed direction and fully designed but not yet scheduled**
  — not added to Bucket 1's next-session queue, which stays reserved for what's actually agreed to
  build next. Design-only, nothing built this session.
- 2026-07-17: Fully designed Tier B (the social layer) at Kayvan's request, "as detailed as needed
  for when we build those pages out later" — see `AppSpec.md`'s new "Tier B Detailed Design — Social
  Layer" section. **Design only, nothing built, not scheduled** — this is prep work for whenever
  it's actually taken up (likely Phase 2+). Asked 4 foundational questions before writing anything,
  since the answers were load-bearing for the whole design: rankings default to private with opt-in
  sharing (not public-by-default); following is one-directional with no approval step; community-
  rank aggregates only ever include users who've opted into public rankings (never an "anonymized
  but still used" carve-out for private users); shared collections are genuinely public links,
  no account needed — the app's first-ever unauthenticated page. Full design covers 5 new tables
  (`user_profiles`, `follows`, `collections`, `collection_items`, `episode_comments`), RLS for each
  (including a deliberate design choice: the public shared-collection page uses the service-role
  client scoped to an exact `share_token` lookup, a Server Component trust boundary, rather than
  writing a new `anon`-role RLS policy — a genuinely new risk category this app has never needed
  before), a taste-similarity formula (Kendall's-Tau-style concordant-pair percentage over shared
  ranked episodes), and 6 new pages/routes needed. 5 specific judgment calls flagged explicitly for
  review before building (binary visibility with no followers-only tier, username-required
  onboarding, the similarity formula being one reasonable choice among several, comments visible
  regardless of the commenter's own privacy setting, no moderation beyond delete-your-own-comment).
- 2026-07-17: Kayvan had a separate Claude session produce a large, ambitious product/design
  document (dark mode + per-show theming, a full nav/discover/statistics/notifications surface,
  community features, gamification, an Elo/Glicko ranking-algorithm swap, a long "future features"
  wishlist) and asked to read it and jointly triage it. Read in full and organized into three
  tiers rather than reacting to each of the ~80 individual ideas one at a time: **Tier A** (small,
  self-contained, no new architecture — keyboard shortcuts, a ranking-confidence signal,
  statistics/visualizations, a richer comparison screen, collections), **Tier B** (real features,
  but all gated behind one big undecided question — does this app grow a public/social layer at
  all — friends, community rank, discussion, shareable collections), and **Tier C** (not
  recommended right now — the Elo/Glicko swap, most of the "future features" wishlist, mobile
  swipe interaction, notifications/weekly-recap). Pushed back explicitly on the Elo/Glicko proposal
  rather than deferring to the other session's authority: binary-insertion is actually the better
  fit for ranking one person's closed, small episode set, not a lesser alternative — see
  `DevelopmentPlan.md`'s Ranking Algorithm section for the full reasoning. Designed a concrete v1
  "ranking confidence" formula (the review's own standout idea) that gets the same payoff without
  the algorithm swap — see `DevelopmentPlan.md`'s Discussion section. Kayvan confirmed: Tier A
  proceeds, queued *after* the four items already planned from the testing round (not ahead of
  them); dark-mode/theming stays deferred with the rest of visual design rather than being pulled
  forward. Full triage reasoning written into `AppSpec.md`'s new "External Design Review — Triage"
  section (Tier B/C) and `STATUS.md` Bucket 1 (the actionable Tier A queue). Nothing built yet —
  planning/triage only, per the same session-budget discipline as the entry below.
- 2026-07-17: Large hands-on testing round via a full QA checklist (an artifact — see prior
  entries) covering essentially every feature built to date. Confirmed working end to end: the
  full auth flow including the `/login` fix and `/signup` still redirecting, show search/import
  and the deferred-add fix, the dashboard, the show detail page (including "Remove show" and
  "Re-rank" controls), the new rankings page, cold start (including picking any episode and correct
  threshold-crossing), comparative placement, re-ranking (including that new questions feel fresh),
  and removing a show (including re-adding starting fresh, and removing a never-ranked show working
  cleanly). Genuinely nothing broken found. Four new, real requests came out of this round, each
  discussed and decided rather than built blind:
  1. A 3-episode all-neutral show producing very different scores (10/8.7/7.4) led to a real design
     decision — small shows (below `COLD_START_THRESHOLD` total episodes) will skip cold-start
     bucketing after episode 1 and go straight to real pairwise comparison. Full mechanics written
     up in `DevelopmentPlan.md`'s Discussion section, including a real gap caught before it could
     become a bug: a naive "skip cold start entirely" would leave a show's first episode with zero
     recorded opinion (comparative placement against an empty list asks nothing). Also discussed
     and explicitly declined going further (real tied scores in the scoring model) as bigger than
     currently worthwhile.
  2. A related but separate observation (repeatedly comparing against the same reference episode
     with a modest episode count) was confirmed as expected binary-search behavior, not a bug — see
     `DevelopmentPlan.md`'s "Open discussion, not scheduled" for the full reasoning; not being
     pursued unless it resurfaces.
  3. Season poster art in the comparison screen, and genres on the show page — both confirmed
     wanted and scoped (both need schema additions + updated TMDB import logic; posters likely need
     no *new* TMDB call since season-level poster data should already be present in the
     already-fetched per-season response).
  4. Two small no-design-decision UI additions: a "Search Shows" nav link, and an episode-ranked
     progress counter on the show page.
  Deliberately stopped here rather than starting any of these four, per Kayvan's explicit call at
  65% session usage — he wants all four done in a single focused next session rather than started
  now and possibly left mid-task. Full ordered plan (cold-start fix first, since it's the biggest
  and needs the fullest algorithm-level review rigor; then the quick UI pair; then posters/genres;
  then the pre-existing TMDB attribution/password reset/privacy notice queue) written into Bucket 1
  above, detailed enough for a fresh session to execute directly. Also did a small consistency
  sweep on `DevelopmentPlan.md`'s "Other open ideas" list — re-ranking and live search were both
  marked resolved there but had gone stale (built and already confirmed working days ago).
- 2026-07-17: Added a new `/shows/[showId]/rankings` page — a show's ranked episodes sorted
  best-to-worst by score, distinct from `/shows/[showId]`'s season-ordered management list.
  Reviewed and merged (`website/src/app/shows/[showId]/rankings/page.tsx`, plus a link from the
  main show page). Purely additive UI: reused `getShowRankingDisplay` exactly as it already
  existed (its `ranked` array is already best-to-worst by construction), so no persistence-layer
  changes at all — reviewed at the same level as other feel-based UI work this session (read the
  diff, confirmed it matched the brief, independently re-ran tests/typecheck/lint/build). Also
  started walking Kayvan through 5 ideas for making the app more engaging/fun/growth-driving, one
  at a time per his request rather than all at once — idea 1 (shareable "ranking cards" — an
  on-demand generated shareable image of a show's top episodes, using Next.js's built-in `next/og`
  image generation so no new public routes or RLS changes are needed for the simplest version) was
  presented; awaiting his reaction before presenting idea 2.
- 2026-07-17: Fixed the `/login` auto-redirect, reviewed, merged (`proxy.ts`/`proxy.test.ts`),
  pushed. Split the route config into `PROTECTED_ROUTES` (unchanged) and a narrower
  `REDIRECT_IF_AUTHENTICATED_ROUTES = ['/signup']` — `/login` no longer appears in any
  redirect-away set, so it always renders its form regardless of session state; `/signup` and
  `/dashboard`'s protection are both untouched. Confirmed `login/page.tsx`/`actions.ts` needed no
  changes. Reviewed the diff directly (small, exactly the scoped change requested) and
  independently re-ran tests (177/177)/typecheck/lint fresh before merging. Also kicked off the new
  per-show "rankings" page (`/shows/[showId]/rankings`, sorted best-to-worst by score) — pure UI
  reusing the already-reviewed `getShowRankingDisplay`, no persistence-layer changes needed.
- 2026-07-17: Kayvan confirmed sign-out and re-ranking both work correctly. Reported a new one:
  reopening the deployed app and pressing "login" skips straight to being signed in, no credential
  prompt. Investigated `src/proxy.ts` before assuming a bug — confirmed this is deliberate, already-
  reviewed "redirect an already-authenticated visitor away from /login" behavior (documented in the
  file's own comment), not a session-not-clearing bug (Kayvan clarified: signing out first does
  correctly show the credential form afterward). Asked what he actually wants rather than guessing
  between two different fixes (session persistence itself vs. just `/login`'s behavior) — he wants
  the narrower one: keep persistent sessions, but `/login` should always show the form. Fix scoped
  and in progress — see Bucket 1 item 1.
- 2026-07-17: Built and merged remove-show, re-ranking, the sign-out cursor fix, and the deferred
  show-add fix — two implementer agents (worktrees) in parallel, both reviewed and merged
  (`1fed732`, merging the remove-show/re-rank branch and the cursor/deferred-add branch), pushed.
  **Remove-show/re-ranking got unusually careful review given it deletes user data**: read every
  new function in `ranking-session/session.ts` (`deleteShowRankingData`, `resetEpisodeRanking`, the
  shared `deleteComparisonsInvolving` helper) line by line, traced every delete query's exact table/
  filter columns by hand to confirm none could ever touch another user's or another show's rows,
  confirmed `resetEpisodeRanking`'s cold-start-only-episode edge case and the
  below-`COLD_START_THRESHOLD`-reversion consequence both behave correctly, and found (then fixed
  directly rather than sending back) one inaccurate doc comment claiming `/shows/[showId]` would
  404 after removal — it doesn't, it just shows everything as unranked, corrected the comment to
  say so. Independently re-ran tests (177/177 after both merges)/typecheck/lint/build fresh in the
  final merged location. New UI: a confirm-gated "Remove show" button on `/shows/[showId]`, and a
  confirm-gated "Re-rank" button next to each ranked episode's score, both naming the specific
  show/episode in their confirmation message rather than a generic "are you sure?". Separately: the
  sign-out button now shows a pointer cursor on hover (matching the Dashboard link), and a show no
  longer counts as "added to my shows" merely by clicking "Rank episodes" — that now happens the
  first time a ranking answer is actually submitted (`markShowAsAdded`, called from
  `submitColdStart`/`submitComparison`), fixing a bug where viewing a show and backing out without
  ranking anything still left it stuck as added. Not yet hands-on tested — see Bucket 2.
- 2026-07-17: Kayvan hands-on tested the sign-out/stale-resubmit/rename fixes. Found two more real
  gaps (sign-out button's missing pointer cursor; a show gets added to "my shows" merely by
  clicking "Rank episodes," before any actual ranking happens — both triaged to Bucket 1, an
  implementer agent dispatched). Discussed the stale-resubmission redirect's behavior when the
  second click is a genuinely *different* answer than the first: agreed with Kayvan that silently
  discarding it and redirecting is correct (a stale page shouldn't be trusted to apply a write —
  the deliberate way to change an already-recorded answer is re-ranking, not an accidental stale
  resubmit), logged a possible small polish (a less-silent message) to Bucket 4, not building now.
- 2026-07-17: Fixed all three gaps from the same-day testing round, via three parallel implementer
  agents (worktrees), reviewed, merged, and pushed: (1) sign-out — new `signOut` Server Action
  (`website/src/app/actions.ts`) wired into `AppHeader`, matching the existing login/signup
  session-aware-client pattern exactly; (2) the stale post-back resubmission — both Server Actions
  in `rank/[episodeId]/actions.ts` now check `getNextStepForEpisode` in their catch blocks and
  redirect to the show page when the rejection was simply because the episode's already fully
  ranked, falling through to the original error for anything else; (3) the button relabel —
  "Add show"/"Go to show →" in the search results are now "Rank episodes"/"Rank episodes →"
  (confirmed via direct code read that the destination was already correct — this was purely a
  copy fix). Reviewed each diff directly and independently re-ran tests (170/170)/typecheck/
  lint/build fresh after each merge before proceeding to the next. Also resolved all three
  questions posed earlier the same session: remove-show deletes ranking data, re-ranking clears
  comparison history too, episode count in search is explicitly not being built (see Bucket 3/4).
  An implementer agent for remove-show + re-ranking is being dispatched next.
- 2026-07-17: Further hands-on testing round. Confirmed working: refresh mid-comparison (no
  duplication). Found: no sign-out button exists at all; a stale post-back resubmission surfaces a
  raw error instead of a friendly "already done" redirect (the underlying rejection itself is
  correct, just badly presented); the search results' "Add show" button should read "Rank
  episodes" instead. All three triaged to Bucket 1, implementer agents dispatched in parallel (see
  next entries once they land). Also: explicitly deprioritized chasing exact small-show score
  precision (Bucket 4) per Kayvan's own call, and reconfirmed (third time) wanting remove-show and
  re-ranking, plus a new request to show episode count in TMDB search results. Posed three
  questions back to Kayvan rather than guessing: remove-show's data-retention behavior,
  re-ranking's scope (recommended clearing comparison history too, with reasoning — see Bucket 3),
  and the episode-count-in-search request's real N+1-TMDB-call tradeoff (see Bucket 3).
- 2026-07-17: Fixed the auto-redirect gap found in same-day hands-on testing, via a small
  implementer agent (worktree), reviewed, and merged to `main` (`8937a62`, merging `082cef9`);
  pushed. `rank/[episodeId]/actions.ts`'s `submitColdStart`/`submitComparison` now check the
  `TargetedRankingStep` returned by `submitColdStartAnswer`/`submitComparisonAnswer`: if it's
  `'alreadyRanked'` (this submission fully resolved the episode's placement), redirect straight to
  `/shows/[showId]` instead of just revalidating the same per-episode page; otherwise (more
  cold-start/comparison questions pending for this same episode) behavior is unchanged. Direct
  navigation to an already-ranked episode's URL still shows the static "already ranked" message,
  deliberately not touched — confirmed `page.tsx` needed no changes since that behavior comes
  purely from a live `getNextStepForEpisode` read, independent of the action's redirect. Reviewed
  the diff directly (small, one file) and independently re-ran tests (170/170)/typecheck/lint/build
  fresh in the merged location before merging.
- 2026-07-17: Kayvan hands-on tested the episode-picker rebuild in the browser. Confirmed working:
  out-of-order episode ranking (the whole point of the rework) and scores auto-updating as more
  episodes get placed. Found one small gap (no auto-redirect after finishing an episode — Bucket 1
  item 1, being fixed now) and reconfirmed wanting re-ranking with a specific UI placement detail
  (a button next to the score — folded into the existing Bucket 1 item 4). Testing continues.
- 2026-07-16: Built the episode-picker rebuild via an implementer agent (worktree), reviewed, and
  merged to `main` (`69c9688`, merging `d6f3f01`); not yet pushed. `ranking-session/session.ts`:
  `submitColdStartAnswer`/`submitComparisonAnswer` now validate against the specific target episode
  (show-membership + not-already-ranked) instead of requiring it be "next" in season/episode order;
  new `getNextStepForEpisode`/`getShowRankingDisplay` support per-episode targeting and an
  always-visible current-rankings display; `getNextRankingStep` untouched, still used internally for
  done-detection. Removed this same session's `getRankedEpisodeOrder`, superseded by
  `getShowRankingDisplay`. UI: `/shows/[showId]` is now a real per-episode list (score / cold-start
  bucket / rank-this-episode link); the old whole-show `/shows/[showId]/rank` route is replaced by
  `/shows/[showId]/rank/[episodeId]`, which always shows a "Return to show page" link. Reviewed by
  reading the full diff directly and re-deriving correctness from the algorithm source rather than
  trusting the implementer's summary — specifically confirmed by reading
  `comparativePlacement.ts` that the placed episode stays fixed as `subject` through an entire
  placement including every tie-break hop, which is what makes the loosened validation
  (`getNextStepForEpisode(showId, subjectId)`, checking only `reference`) still fully safe against
  stale/mismatched submissions. Independently re-ran tests (170/170)/typecheck/lint/build fresh in
  the actual merged location before merging. New tests include an explicit out-of-order-ranking
  end-to-end case (5 episodes cold-started as ep4→ep1→ep2→ep3, ep5 placed comparatively), proving
  the whole point of the rework. Not yet hands-on tested in a real browser — see Bucket 2.
- 2026-07-16: Confirmed the episode-picker design with Kayvan (both the interaction model and that
  it jumps ahead of the rest of the Bucket 1 queue) and verified against the actual algorithm source
  before building: `orderColdStartIds` orders purely by judgment sequence not air-date
  (`@/lib/ranking/coldStart.ts`), and `placeEpisodeComparatively`/`resolveTie` keep the placed
  episode fixed as `subject` through an entire placement including tie-break hops
  (`@/lib/ranking/comparativePlacement.ts`) — so nothing in the algorithm assumes sequential
  air-date ranking, confirming the picker is safe to build. See `DevelopmentPlan.md`'s Phase 1
  section for the full design write-up. An implementer agent is building it now, to be followed by
  an independent reviewer pass (correctness-critical — touches `ranking-session`'s validation logic)
  before a hands-on browser check.
- 2026-07-16: Kayvan hands-on tested the new ranking UI in the browser (real Supabase data). Found
  5 real gaps, all logged and triaged: no way to remove a show from "My shows" (reconfirms Bucket 1
  item 3, already planned); the ranking flow forces a single sequential path with no way to pick a
  specific episode to rank (new — Bucket 3, needs a design confirmation before building); no way to
  view current rankings while a show is still partway through ranking (new — same Bucket 3 item,
  likely resolved by the same fix); ranking a specific episode confirmed as "necessary" (same ask as
  the episode-picker item, not a separate one); no clear way back to the show page from
  `/shows/[showId]/rank` (new — Bucket 1 item 5, small, no design decision needed). Nothing fixed
  yet — this session ended with triage, pending Kayvan's answer on the episode-picker design
  direction and on reprioritizing relative to the rest of Bucket 1.
- 2026-07-16: Built piece 2b, part 2 — the ranking UI itself — via one implementer agent (worktree),
  reviewed, and merged to `main` (`857e1a1`, merging `178f81b`); not yet pushed. New route
  `/shows/[showId]/rank` (`website/src/app/shows/[showId]/rank/{page,actions,ColdStartPicker,
  ComparisonPrompt}`) calls the already-reviewed `getNextRankingStep`/`submitColdStartAnswer`/
  `submitComparisonAnswer` and renders whichever step is pending: a liked/disliked/neutral picker,
  a better/worse/about-the-same comparison prompt, or (once `done`) the final ranked list with
  scores from `scoreForPosition`. `/shows/[showId]`'s disabled "Start ranking" placeholder now links
  there for real. Added one small function to the correctness-critical persistence layer itself —
  `getRankedEpisodeOrder` in `ranking-session/session.ts` — to correctly surface final order for a
  show with fewer than `COLD_START_THRESHOLD` episodes total, which finishes entirely in cold start
  and never gets a `rank_position` at all (an edge case `rank_position IS NOT NULL` alone would get
  wrong); added 3 tests covering it including that exact edge case. Reviewed the diff directly
  (all 7 changed/new files), independently re-ran tests (162/162)/typecheck/lint/build fresh in the
  actual merged location (not just the agent's worktree) before merging. Not hands-on tested in a
  real browser yet — the agent's worktree had no `.env.local`, so only confirmed the new route
  fails identically to every other page under missing Supabase credentials, not that it actually
  works end to end. **This is the next thing to do** — see Bucket 2.
- 2026-07-16: Built and thoroughly reviewed piece 2b's persistence layer — the resumable
  ranking-session logic (`website/src/lib/ranking-session/`), reviewed and merged (`aab0dbd`). This
  is the piece that makes the already-tested, already-reviewed pure algorithm (`@/lib/ranking`) work
  across real HTTP requests: reconstructs a `ShowRankingState` from `episode_rankings`/
  `episode_comparisons` on every call, replays already-answered comparisons instantly via a
  comparator that throws a sentinel (`NeedsComparisonInput`) on the first genuinely new question.
  Added `episode_rankings.cold_start_bucket`/`cold_start_sequence` columns via a new migration (not
  yet pushed live). Given how central and tricky this is, reviewed it more thoroughly than usual:
  read every function by hand, confirmed the bidirectional history reconstruction exactly mirrors
  the pure algorithm's in-memory `recordComparison`/`invert`, traced the cold-start-to-comparative
  transition and a full multi-hop tie-break chain, and confirmed both `submit*` functions re-derive
  the pending step server-side and reject mismatches rather than trusting client-claimed state
  (defends against stale/concurrent submissions corrupting data). Per-user scoping confirmed
  throughout (explicit `user_id` filters plus RLS, identity always from `getUser()`). 159/159 tests
  passing, including a genuinely rigorous multi-step tie-break test. No UI yet — that's next.
- 2026-07-16: Two follow-up UX fixes from further hands-on testing of piece 2a, reviewed and merged
  (`32e04a6`): show search is now live/debounced-as-you-type (previously required an explicit
  submit), and search results the signed-in user has already added now show "Go to show" instead of
  a re-clickable "Add show" — the button wasn't actually broken (still idempotent, still redirected),
  it just looked like nothing happened since the redirect target was a show already being viewed.
  The "already added" check happens server-side in `/api/tmdb/search` (session-aware client, scoped
  by `user_id` + RLS, fails open to "not added" on any lookup error) in the same round trip as the
  TMDB search itself, rather than a second client-side call. Review: read the route's user-scoping,
  the pure cross-referencing logic, and the client's `AbortController`-based stale-request handling
  directly; 140/140 tests passing. Pushed and hands-on confirmed working by Kayvan: live search
  updates correctly, and re-searching an already-added show now shows "Go to show." **Phase 1 is
  now completely done** — piece 2b (the ranking UI) is the only thing left before Phase 2.
- 2026-07-16: Kayvan confirmed via a real fresh signup that the `proxy.ts` `?code=` exchange fix
  works — email confirmation now lands on `/dashboard` already logged in. **Phase 1 is fully done**:
  piece 1 (auth) and piece 2a (show search/import), both hands-on verified in the browser, not just
  passing tests. Next: piece 2b, the ranking UI itself (see Bucket 1 for the planned approach).
- 2026-07-16: Found the *actual* root cause of the confirmation-link bug (the earlier `/auth/confirm`
  cookie-copy fix, while itself correct, didn't fix the real problem since that route was never
  being reached): confirmed via Supabase's own changelog that free-tier projects only honor a custom
  email template while custom SMTP is actively configured — sending through the default provider
  silently reverts to Supabase's stock template regardless of what's saved in the dashboard editor.
  Since custom SMTP (Resend) was abandoned as backlog, real confirmation emails were using the stock
  template's `{{ .SiteURL }}?code=<uuid>` link — a totally different pattern from `/auth/confirm`'s
  `token_hash`/`type`. Rather than resume chasing custom SMTP, adapted the code instead: `proxy.ts`
  (the only place that can both intercept the request and write cookies before a page renders) now
  handles `?code=` directly via `exchangeCodeForSession`, mirroring `/auth/confirm`'s proven explicit-
  cookie-copy pattern. Reviewed and merged (`13880c8`, pushed): read the change directly, confirmed
  it's checked first and fully separated from the existing session-refresh/route-protection logic,
  confirmed the single-use code is genuinely dropped from the redirect URL, 124/124 tests passing.
  Noted a minor forward-looking collision risk (the `code` param check applies proxy-wide, not just
  to `/`) in Bucket 4. Still needs a real signup/email click-through to confirm this actually works —
  see Bucket 1.
- 2026-07-16: Kayvan hands-on tested piece 2a in the browser: search, add, import, dedup on re-add,
  and multi-show all confirmed working. Found two real issues, both fixed and reviewed, merged to
  `main` (`843c4b8`): (1) the email confirmation link landed on `/login` with no session and no
  explanation instead of `/dashboard` logged in — `verifyOtp()` itself was confirmed working
  (immediate follow-up password login succeeded with no "not confirmed" error), so the bug was in
  session cookies not reaching the browser via the redirect. Fix: `/auth/confirm` now builds
  `NextResponse.redirect(...)` explicitly and copies every session cookie onto that exact response,
  instead of relying on `next/navigation`'s `redirect()` — mirrors `src/proxy.ts`'s already-proven
  pattern for the same problem. Root-cause confidence is only moderate: a deep read of this Next.js
  version's actual route-handler/cookie internals didn't prove the original failure mode existed at
  the framework level, so an alternative explanation (an email client or security scanner
  pre-fetching and consuming the single-use confirmation link before the real click) hasn't been
  ruled out — `/login` now shows a real message either way instead of silent ambiguity, and the fix
  needs a real email click-through to confirm it resolves what was observed (see Bucket 1/2). (2) No
  way back to `/dashboard` from `/shows/search` except editing the URL — fixed with a small shared
  `AppHeader` component on all three authenticated pages. Also logged live/autocomplete show search
  as a Phase 2 backlog idea (Kayvan's suggestion, reasonable but out of Phase 1's "no polish" scope).
- 2026-07-16: Reviewed and merged Phase 1 piece 2a — show search, TMDB import, and a "my shows"
  list — to `main` (commit `a4b1b4e`). Adds `importShowFromTmdb` (fetches a show's full details +
  every season's episodes from TMDB, upserts into `shows`/`episodes` keyed on their unique TMDB-id
  columns — idempotent across users/re-adds), a new `user_shows` table (RLS-protected, same
  `auth.uid()` pattern as `episode_rankings`/`episode_comparisons`) to track which shows a user has
  added independent of ranking progress, and `/shows/search` + `/shows/[showId]` pages. Caught and
  fixed its own bug during self-review: a merge-upsert for `user_shows` would need an `update` RLS
  policy that deliberately doesn't exist (no mutable columns) — fixed by using `ignoreDuplicates`
  (`ON CONFLICT DO NOTHING`, needs only the `insert` policy) instead. Review: read the migration,
  the upsert logic, and the auth-checked Server Action directly; confirmed global writes
  (`shows`/`episodes`) stay on the service-role client and per-user writes (`user_shows`) stay on
  the session-aware client throughout; re-ran tests (106/106)/typecheck/lint/build fresh before
  committing. Not yet pushed (would trigger the live migration) or hands-on browser-tested — see
  Bucket 1/2. Piece 2b (the ranking UI itself) deliberately deferred to a fresh session for budget
  reasons.
- 2026-07-16: Hands-on browser-verified the full auth flow end-to-end, finding and fixing three
  Supabase *configuration* bugs along the way (no code changes needed):
  1. `NEXT_PUBLIC_SUPABASE_URL` was set to the Supabase **dashboard** URL
     (`supabase.com/dashboard/project/...`) instead of the actual **project API** URL
     (`https://<ref>.supabase.co`) — this caused `signUp()` to fail with a client-side "Unexpected
     token '<'... is not valid JSON" error, since the Supabase JS client couldn't parse the HTML
     dashboard page it was accidentally hitting instead of the Auth API.
  2. Auth's **Site URL** setting was still the default `http://localhost:3000`, so confirmation
     emails linked to a dead localhost URL instead of the live Vercel site — fixed by setting it to
     the production URL and adding `localhost:3000/**` to the redirect allowlist for future local
     testing.
  3. The **"Confirm signup" email template** was still using the default `{{ .ConfirmationURL }}`
     link (Supabase's old pattern), not the `token_hash`/`type` pattern `/auth/confirm` was built to
     handle — fixed by editing the template's link directly in the Supabase dashboard.
  With all three fixed: full signup → email confirmation → dashboard login works, as do
  login/logout, session persistence across a refresh, and all route-protection redirects. Also
  attempted setting up custom SMTP (Resend) to lift the default email provider's 2/hour cap (which
  required its own detour: editing email templates on Supabase's free tier now requires custom SMTP
  configured at all, a June 2026 platform change) — spent significant effort (wrong port docs said
  465, actually needed 587 per a known Resend-specific issue; regenerated API key; confirmed sender/
  account settings) but never got Resend to show a single connection attempt, meaning the failure is
  upstream of Resend. Decided to stop chasing this and log it as backlog (see Bucket 4) rather than
  keep going — the default provider works fine for now. Phase 1's auth piece is fully done.
- 2026-07-15: Phase 0 marked complete; started Phase 1 (website vertical slice) as two sequential
  pieces. Reviewed and merged piece 1, **auth** (sign up/log in/log out/session handling), to `main`
  (commit `07e5aca`) — built on Supabase Auth via `@supabase/ssr`'s cookie pattern for the App
  Router, with a Proxy (this Next.js version's renamed middleware) refreshing sessions and doing
  optimistic route protection, plus an authoritative per-page `getUser()` check as defense in depth.
  Discovered along the way that this Next.js version renames `middleware.ts` to `proxy.ts`/`proxy()`,
  and that `@supabase/ssr` 0.12.3 requires `getAll`/`setAll` cookie methods (not the deprecated
  singular ones). Review: read every auth-related file directly (not just the implementer's
  summary), confirmed `getUser()` (not `getSession()`) is used everywhere revalidation matters, the
  service-role client never appears in an auth/session context, and `force-dynamic` prevents session
  data leaking via static caching; re-ran tests (89/89)/typecheck/lint/build fresh before committing.
  Two things flagged and not yet resolved: a hands-on browser check of the full flow (see Bucket 2),
  and confirming the Supabase dashboard's confirmation-email template points at `/auth/confirm` with
  `token_hash`/`type` params.
- 2026-07-15: Reviewed and merged the Supabase schema + TMDB proxy route to `main` (commit
  `39c9feb`). Schema: `shows`/`episodes` (global TMDB reference data) plus per-user
  `episode_rankings`/`episode_comparisons` with row-level security. Review consisted of reading the
  migration SQL and every RLS policy directly, tracing the security guarantees by hand (default-deny,
  `auth.uid()` unforgeable, no `anon` access anywhere), checking the TMDB proxy's error paths don't
  leak the secret token, and independently re-running tests (74/74)/typecheck/lint/build fresh in
  the committed location. Kayvan filled in `website/.env.local` himself (never shared in chat) and
  imported the repo into Vercel (root directory `website`, env vars pasted directly into Vercel's
  dashboard). Not yet pushed to `origin` — see Punch List Bucket 1.
- 2026-07-15: Reviewed and merged the Phase 0 ranking algorithm + Next.js website scaffold to
  `main` (commit `4fa5fd6`). Review consisted of: reading the updated `findCommonReference`
  implementation directly and hand-tracing its logic through the chained-hop and full-exhaustion
  test cases; independently re-running tests (48/48), `tsc --noEmit`, and lint fresh in the final
  committed location (not just the agent's build worktree) before committing. The build worktree
  (`.claude/worktrees/agent-a5d288589bf0cb0ed`) was unregistered from git; its on-disk contents
  failed to delete due to a Windows file lock but are gitignored and harmless. Not yet pushed to
  `origin`.
- 2026-07-15: Kayvan proposed a detailed alternative ranking design this session (exhaustive
  comparisons for small shows, then a fixed weighted sample of ~5 for larger ones, plus a specific
  tie-break refinement), modeled further on a fuller writeup of Beli's actual reported mechanics.
  After discussion: **the exhaustive/fixed-sample idea was explicitly rejected** — true
  binary-insertion search is cheaper at every list size worked through as examples and guarantees
  exact placement, where a fixed sample only narrows to an approximate band. **The tie-break
  refinement was adopted**: common-reference selection is now a confirmed two-tier rule (prefer a
  decisive/non-neutral relationship with the tied episode, closest in rank; if none exists, fall
  back to plain-closest-in-rank with no relationship requirement) — this resolves what was previously
  an open judgment call. Also reconfirmed 3-bucket cold start (a brief mix-up in Kayvan's write-up
  implied binary liked/disliked; three buckets is what stands) and tightened the cold-start threshold
  from a placeholder range ("~3-5") to an exact number (3, with the 4th episode being the first
  comparative one — this already matched what was built, `COLD_START_THRESHOLD = 4`). Updated
  `DevelopmentPlan.md` and `AppSpec.md` accordingly; an agent is implementing the two-tier rule in
  code now (see Bucket 1).
- 2026-07-15: Major architecture pivot: **website first, then iOS**, sharing one account system.
  Kayvan wants a website built first (not thrown away afterward) so the ranking algorithm and score
  formula can be tuned through fast iteration and real usage before committing to native iOS work.
  Rankings are tied to an email/password account (Supabase Auth), shared between the website and the
  future iOS app via a shared Supabase Postgres backend — this replaces the earlier "fully on-device,
  no backend" decision entirely. Stack: Next.js + Vercel for the website, Supabase for
  accounts/database, a Next.js API route proxying TMDB for both clients; SwiftUI + `supabase-swift`
  for the iOS app later. `DevelopmentPlan.md`'s phases renumbered/restructured: Phases 0-3 are now
  website (de-risk → vertical slice → feature completeness → polish), Phases 4-5 are iOS (build →
  polish/launch prep), Phase 6 is post-launch. Updated `TechArchitecture.md`, `AppSpec.md` (accounts
  core flow, per-user data model), `Risks.md` (vendor/auth/algorithm-drift risks), `CLAUDE.md`, and
  `ProcessAndRoles.md`. See Deviations above — the specific vendor choice (Supabase/Vercel) is
  flagged for a second look.
- 2026-07-15: Third follow-up round: worked out the score-from-position formula's direction
  together — **linear**, **per-show only** (a show's best episode is always a 10 regardless of the
  show's overall quality), **scores shift on every insertion** (so 1-10 is derived from current rank
  position + episode count, not stored as source of truth — see `AppSpec.md` data model), and
  **compresses for small sample sizes**, reaching the full 1-10 spread around 8 ranked episodes.
  Recorded a concrete v1 formula in `DevelopmentPlan.md`'s Discussion section as a tunable starting
  point — Kayvan explicitly expects this to need real tuning once there's an app to test it in, so
  it's not being treated as settled. Remaining open item narrowed to just the tie-break
  common-episode selection mechanics (Bucket 3 above).
- 2026-07-15: Second follow-up round: confirmed **3 cold-start buckets** (liked/disliked/neutral,
  matching Beli, not the original binary liked/disliked); designed the **tie-break mechanic** — a
  "neutral" comparison result triggers a follow-up comparison against a common reference episode
  (one the tied-against episode has already been compared to) rather than leaving the tie
  unresolved. `Docs/Roadmap.md` renamed to `Docs/DevelopmentPlan.md` and restructured into: The Idea,
  Ranking Algorithm (current design), Discussion (open questions to work out together), Development
  Phases (much more detailed than the old Phase Status table), and Issues. The score-from-position
  formula remains genuinely open — flagged for direct discussion, not something to decide
  unilaterally. All cross-references updated across `CLAUDE.md`, `AppSpec.md`, `ProcessAndRoles.md`,
  `Testing.md`.
- 2026-07-15: First follow-up round: closed out data-source and ranking-model questions — show/
  episode data source is **TMDB API**; ranking mechanic is modeled on **Beli**'s binary-insertion
  comparison approach; cold-start threshold is **~3-5 episodes**; visual design stays undecided
  until Phase 1.
- 2026-07-15: Initial bootstrap — PM-Claude operating docs created (`CLAUDE.md`, all of `Docs/`).
  No app code written yet.
