# Episode Ranker — Current Status

**Read this file first** — before the other docs, before doing anything else. It's the single
"what's actually going on right now" pointer, kept short and current on purpose.

**[Docs/CriticalReview.md](CriticalReview.md) was written 2026-07-18** — a deliberately harsh,
requested full-project critique, 27 findings. Top finding: the roadmap is designing far ahead of any
real usage (a whole social layer, gamification, and stats fully designed for an audience of one).
Its one live/urgent finding (open, unauthenticated TMDB proxy routes) is **already fixed** — see
History. Everything else in it is unactioned, on purpose: this is a next-session decision-making
task (what to freeze, what to fix, what to accept), not something to rush through at end-of-session
budget. **Read it before scoping any new feature work.**

Last updated: 2026-07-18, a fresh session opened by Kayvan asking a direct question ("how do we
handle new episodes of shows being added?") before anything else got picked up from the queue below.
Investigated first rather than assuming: confirmed a real, previously-unflagged gap — a show's
episode list was imported from TMDB exactly once, at add-time, and never refreshed, so new
seasons/episodes airing later were silently never picked up by either "My Shows" or the show page.
Not in `CriticalReview.md`, not anywhere in this file's prior History — genuinely new. Built,
reviewed, merged, and pushed a fix the same session (throttled 24h auto-resync) — see History. The
worktree-isolation bug (3 of 6 dispatches producing no real isolation, previous session) is still
un-investigated — see Deviations Awaiting Review. This session's own agent dispatches (2 of 2) both
got real, registered worktrees — no new data point either way on root cause, just no recurrence this
time.

Same session, continued: Kayvan brought a second large, independently-written idea list (~30 items —
episode pages, an Elo/Glicko pitch, spoiler mode, community/discoverability slicing, season/character
rankings, visualization, AI features, import, a "things I'd avoid" list). Went through it live,
cluster by cluster, deciding each rather than triaging unilaterally — full durable record in
`AppSpec.md`'s new "Second Design Review — Triage" section, with Tier A items 2/3/4 expanded and item
9 (episode pages) added here as a result, plus 3 new Bucket 4 backlog items (season rankings, import,
spoiler mode) and a real batch of explicit declines (character rankings, curated collections,
episode-type/theme tagging, taste profile, favorite moments/trivia content, rewatch mode, AI
features/recommendation engine, discussion/comments/polls, draft mode as a separate feature). Design/
discussion only, nothing built yet — Tier A (still queued from before, now with items 2/3/4/9 having
more scope than when originally written) and `CriticalReview.md`'s open findings are both still where
they were; this was purely additive planning work layered on top, not a continuation into building.
Kayvan then separately fully spec'd Tier A item 4 (richer comparison screen — two-column layout,
prominent poster, synopsis, a comparative-mode-only "I can't decide" relabel), folded into that item.

Same session, moved to building: kept the Tier A queue order as-is. Keyboard shortcuts (item 1 at the
time) was dispatched then immediately cancelled at Kayvan's request and moved to backlog — see
Deviations for what that dispatch revealed. Built and merged ranking confidence's base score +
display (now-item-1's non-smart-selection half) — see History. That build hit the worktree-isolation
bug a third time, which led into a deliberate investigation at Kayvan's request (see Deviations for
the full account) — conclusively ruled out OneDrive as the cause of the routine `.git/worktrees/*`
deletion-failure noise (reproduces identically outside OneDrive; it's very likely a Git-for-Windows-
internal handle-release race, benign), but the more serious "worktree verified real and registered,
agent's edits still land on `main` directly" variant remains genuinely unexplained.

**The repo-move is fully resolved, 2026-07-18 (new session).** The project lives at
`C:\Users\khoob\Projects\TV Episode Reviewer` (this file's own path confirms it) — `git status`/
`git remote -v`/`git log` all clean and correct. The leftover empty OneDrive shell
(`C:\Users\khoob\OneDrive\Desktop\TV Episode Reviewer`) has been deleted. The cold diagnostic dispatch
the prior session asked for has been run: a trivial `isolation: "worktree"` agent got a real,
registered worktree and its commit landed only on its own branch, never touching `main`'s working
tree — clean isolation, no bug recurrence, the Agent tool is confirmed healthy from the new path. See
History for the full account, including the caveat that one clean dispatch doesn't yet prove the
deeper "agent wrote to `main` despite a real worktree" bug (see Deviations Awaiting Review) is fixed
— still worth watching on every future dispatch.

## Punch List (ranked — read this section first for "what's actually next")

Every open item gets triaged into exactly one bucket the moment it surfaces, per
[ProcessAndRoles.md](ProcessAndRoles.md#punch-list-triage). Default is "log it, don't chase it"
unless it's small or genuinely blocking.

**Bucket 1 — Blocking / next in sequence:**
(empty — every item from the 2026-07-17 testing round is done, see History. "Tier A" below is next.)

**"Tier A" — a small batch pulled from an external design review, decided 2026-07-17, now the
front of the queue** (see `AppSpec.md`'s "External Design Review — Triage" and
`DevelopmentPlan.md`'s Discussion section for the full reasoning behind each):

1. **Ranking confidence** ("your Breaking Bad rankings are 87% stable") — the strongest idea from
   the review. **Base score + display built and merged 2026-07-18** (see History; now in Bucket 2
   for hands-on verification) — `website/src/lib/ranking/confidence.ts`, wired into
   `getShowRankingDisplay`, rendered on the show page. Concrete v1 formula was already written up in
   `DevelopmentPlan.md` (decisive-comparison count relative to `log2(showEpisodeCount)`, no schema
   changes needed) — it also documents a known v1 limitation (doesn't yet detect tie-break-fallback
   placements) that's deliberately not being solved. **Remaining scope, not yet built**: the
   **smart comparison selection** piece (prioritize whichever pending comparison would reduce
   uncertainty the most, instead of just the next comparison the search would ask anyway) and the
   **live "you're one comparison away from confidently separating #4 and #5" framing** on top of it
   — Kayvan's single most-wanted idea across both design reviews, still worth building, but
   deliberately *not* bundled into the just-shipped display-only piece: it changes which comparison
   actually gets asked next, which is correctness-critical (touches live ranking-algorithm behavior)
   and needs the full implementer-then-independent-reviewer pipeline, unlike the pure-display change
   that just shipped with implementer + PM review only.
2. **Statistics view + alternate visualizations** of a show's existing rankings (e.g. a tier list,
   heatmap, or season timeline) — sequence after item 2, since "most/least confident episode" is a
   natural stat once confidence exists. Purely additive over data `getShowRankingDisplay` already
   computes; no new persistence logic. **Expanded 2026-07-18**: also covers a comparison/relationship
   graph, a win/loss matrix (every matchup), a season-quality heatmap, and a "gatekeeper episode" stat
   (biggest score gap between adjacent ranked episodes) — all cheap, pure visualizations over data
   already stored (`episode_comparisons` plus existing derived scores), nothing new to fetch. Tier
   lists specifically are confirmed **auto-generated only** — no manual user editing/override, decided
   2026-07-18.
3. **Richer comparison screen — fully spec'd 2026-07-18, ready to build.** Two-column layout: the
   episode being placed (`subject`) on the left, the episode it's being compared against
   (`reference`) on the right — replacing the current stacked layout (`rank/[episodeId]/page.tsx`'s
   `RankEpisodeStep`, where `subject` is shown alone at the top and `reference` is mentioned inline
   in a sentence next to a small 60x90 thumbnail). Each side, top to bottom: the episode's season
   poster art, shown prominently (larger than the current small comparison-screen thumbnail — the
   implementer should pick concrete dimensions that read as a real focal point, not a thumbnail;
   confirm the look hands-on rather than matching an exact prescribed size), then season/episode
   number + title underneath, then the episode's synopsis underneath that. The existing
   better/worse/"about the same" control (`ComparisonPrompt`) sits between the two columns — its
   middle button's *label* changes from "About the same" to **"I can't decide"** specifically in
   comparative mode (the underlying `neutral` result value is unchanged, this is a display-only
   relabel). `ColdStartPicker`'s separate "Neutral" bucket button is untouched — cold start still
   says "Neutral," this relabel is comparative-mode-only, confirmed explicitly.
   Cast is deliberately **not** part of this screen's v1 (Kayvan's spec doesn't include it) — stays
   scoped to item 8 (episode pages) instead, which needs a per-episode credits call regardless.
   Synopsis needs one new nullable column (`episodes.synopsis`, same pattern as
   `season_poster_url`/`genres`) populated from TMDB's season-endpoint `overview` field — already
   fetched by `importShowFromTmdb` today, just not persisted, so **no new TMDB call needed**, same
   "map a field we already have" story as the finale flag and episode stills noted under item 8.
   Classified as feel-based UI + a trivial additive migration (not correctness-critical) — gets the
   same treatment as the season-poster-art work (implementer + direct PM review, hands-on check
   after), not the full independent-reviewer pipeline.
4. **Collections** — user-created private lists of episodes across shows (e.g. "Best Pilot
   Episodes"). Independent of the rest of this batch, can slot in anywhere. Keep to private-only
   for now — a *shareable* version needs public-link infrastructure that doesn't exist yet (see
   the Tier B note in `AppSpec.md`).
5. **Per-show progress bar on the dashboard** — added 2026-07-17: each show in "My Shows" gets a
   progress indicator (episodes ranked so far) right on the dashboard list itself, not just on the
   show's own page (the per-show-page counter is already built — see History 2026-07-18; this is the
   dashboard-list version — related but distinct, both worth building). Overlaps an idea already
   sitting in `AppSpec.md`'s original brainstorm list ("Poster art + progress indicator per show" on
   the dashboard) — same underlying data (`getShowRankingDisplay` per show), just surfaced one level
   up. Purely additive, no design decision needed.
6. **"Date ranked" next to each episode's name on the show page** — added 2026-07-17. No schema
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
7. **Show each episode's numeric rank position next to its score** — added 2026-07-18, Kayvan's
   request. E.g. "8.7 (#3)" rather than just "8.7". No schema/persistence change: `getShowRankingDisplay`
   (`ranking-session/session.ts`) already computes this — both places it builds a `ranked` array
   (`session.ts` lines ~485 and ~499) do `order.map((episodeId, index) => ({ ..., score:
   scoreForPosition(index + 1, order.length) }))`; `index + 1` *is* the rank position, already
   computed and immediately discarded. Just add a `rank: index + 1` field alongside `score` in both
   places (and in `ShowRankingDisplay`'s type, both the `done: true` and `done: false` branches), then
   render it in the two places scores already show: the per-episode list on `/shows/[showId]`
   (`shows/[showId]/page.tsx`, next to the existing `score.toFixed(1)`) and the best-to-worst list on
   `/shows/[showId]/rankings` (`shows/[showId]/rankings/page.tsx`) — check that second file's current
   structure before assuming it needs the field added the same way, it may already imply rank via
   list position and just need the explicit number surfaced. Cold-start-pending episodes (shown via
   `coldStartPending`, not `ranked`) have no rank position yet — don't show one for those, same as
   they don't show a score. Small, self-contained, no design decision needed — implementer + PM
   review, not the full algorithm-level rigor (this is a pure display of an already-correct value,
   not a change to how rank positions are computed).
8. **Episode pages** — added 2026-07-18 from the second design review (see `AppSpec.md`'s "Second
   Design Review — Triage" for the full breakdown). Episodes currently only exist as list rows on the
   show page; this is a genuinely new `/shows/[showId]/episodes/[episodeId]`-style route (exact path
   TBD at build time). Build in the cheap-first order the triage laid out: (a) title/season-episode/
   air-date/synopsis/episode-still — mostly mapping TMDB season-endpoint fields (`overview`,
   `still_path`) the app already fetches but currently discards; (b) the season finale flag (derived,
   not tagged — see the triage doc for the exact rule); (c) a personal win/loss record per episode
   (free read over the existing `episode_comparisons` table); (d) director/writer/cast, which needs a
   new per-episode TMDB credits call — do this alongside item 3 above, same underlying data gap.
   IMDb/RT/Metacritic links and streaming availability are optional later phases, not v1. Average
   community ranking and rating distribution are explicitly out of scope until Tier B (the social
   layer) exists.

Dark mode + per-show accent theming (also proposed in the same review) is **deliberately not in
this queue** — reconfirmed 2026-07-17 that it stays bundled with the rest of the visual-design pass
in Bucket 4, rather than being done piecemeal now.

**Bucket 2 — Bugs/features needing hands-on verification or fixing:**
1. **Ranking confidence score + display, built 2026-07-18, not yet hands-on checked.** Was Tier A
   item 1 (base score only — see that item for the still-unbuilt smart-comparison-selection/live-
   framing remainder). Confirm on a real show with a mix of decisive and neutral comparisons that
   "Your {show} rankings are N% stable" renders sensibly near the existing percent-ranked line, is
   absent for a show with nothing comparatively ranked yet, and that the number actually moves as
   more comparisons get answered rather than staying static.
2. **Throttled TMDB re-sync, built 2026-07-18, not yet hands-on checked** — see History for the full
   design. Can't be meaningfully verified by just clicking around today (the 24h throttle means a
   freshly-imported show won't actually re-sync for a day), so the real check is patient rather than
   immediate: next time a tracked show is known to have a new episode/season on TMDB, confirm it
   actually shows up on `/shows/[showId]` or the dashboard without re-adding the show. In the
   meantime, worth at least confirming the migration applied cleanly to the live Supabase project
   (check the `shows` table has a populated `last_synced_at` column) and that a show page still loads
   normally post-push (the added `ensureShowSynced` call is fail-open, so even a broken TMDB call
   shouldn't break the page — but confirm that's actually true live, not just in tests).
3. **Privacy notice page, built 2026-07-18, not yet hands-on checked.** Low-priority (static content
   page, nothing functional to break) — just confirm the footer's "Privacy" link works from a
   signed-out page too (e.g. `/login`), not only while signed in.
4. **A big 2026-07-17 hands-on round confirmed nearly everything works** — see History for the full
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
11. **Season rankings** — added 2026-07-18 from the second design review (see `AppSpec.md`'s "Second
    Design Review — Triage"). Ranking whole seasons against each other, not just episodes within a
    show. Feasible by reusing the existing binary-insertion engine at season granularity instead of
    episode granularity — the real scope is a new comparison UI flow, not new algorithm work. Real
    future item, not scheduled.
12. **Import** (IMDb ratings, Letterboxd-style exports, TV Time, Trakt, streaming watch history) —
    added 2026-07-18, same source. Real third-party integration work, one per service, each with its
    own auth/API shape. Whenever picked up, start with a single service rather than all of them.
13. **Keyboard shortcuts** on the cold-start and comparison screens — was Tier A item 1, moved here
    2026-07-18 at Kayvan's request ("skip keyboard shortcuts... move to the backlog"), after an
    implementer agent had been dispatched but before it produced a working result (see Deviations
    Awaiting Review — it was stopped mid-task and left a stray partial edit that got reverted, not a
    real implementation to build on). Still small, no design decision needed whenever it's picked up:
    number keys 1/2/3 mapped to each picker's three buttons in display order, `ColdStartPicker` and
    `ComparisonPrompt` respectively.
14. **Spoiler mode** — added 2026-07-18, same source. How far a user has watched a show, hiding
    titles/rankings/descriptions past that point. Confirmed as a real, currently-unaddressed gap
    (nothing today prevents seeing a whole show's ranked episode list regardless of watch progress),
    deliberately backlogged rather than built now (Kayvan: "ignore for now"). Flagged for whenever
    it's picked up: needs the same implementer-then-independent-reviewer rigor as auth/persistence
    work, not a quick UI pass — a spoiler-protection feature that's only partially airtight is worse
    than not having it at all, since it creates false trust in surfaces it doesn't actually cover.

**Bucket 5 — Rework flagged for a later phase, not being worked now:**
(empty for now)

## Deviations Awaiting Review

Solo judgment calls made mid-session that weren't slept on get logged here and surfaced at the
start of the next session for a second look — even solo, "I decided this at 11pm without thinking
it through" is worth a deliberate re-check, not silent acceptance.

- 2026-07-18: **The recurring `isolation: "worktree"` bug (logged below, previous session) has a new,
  more concerning variant.** Dispatched an implementer agent for keyboard shortcuts (was Tier A item
  1). Immediately after dispatch, `git worktree list` was checked per the existing mitigation and
  showed a real, separate, properly registered, locked worktree (`agent-af1bfa877ee217cc6`) — the
  exact check this project adopted specifically to catch the previous variant of this bug (no
  worktree created at all). Kayvan asked to skip the feature moments later, so the agent was stopped
  via `TaskStop` almost immediately. Its worktree was correctly auto-cleaned on stop (confirmed via a
  second `git worktree list`) — but `main`'s own working tree still had an uncommitted, partial edit
  to `ColdStartPicker.tsx` matching exactly what the agent had started building. So this time the
  isolation mechanism itself worked correctly (real worktree, correctly registered, correctly
  cleaned up afterward) and the agent still wrote to `main`'s files directly instead of its own
  worktree's copy — a different failure mode than the previously-logged one, and one the existing
  `git worktree list` mitigation does *not* catch, since the worktree genuinely existed the whole
  time. Reverted the stray edit (`git restore`, confirmed clean, no other files affected). **This
  makes the underlying bug worth investigating even more urgently than previously logged**: the
  established mitigation (verify `git worktree list` right after dispatch) is not actually sufficient
  protection — an agent can apparently still end up editing `main`'s working tree even inside a
  verified-real, verified-registered worktree. No working theory yet for how that's possible; worth
  a dedicated investigation before leaning on `isolation: "worktree"` for anything where a real
  collision with concurrent work would matter.
  **Update, same session, investigated at Kayvan's request**: this happened a **third** time, on the
  very next dispatch (the ranking-confidence-score implementer) — same signature exactly (worktree
  verified real/registered/locked right after dispatch, agent's edits still landed directly on
  `main`'s working tree, its branch ended up with zero new commits). This third occurrence is
  actually informative: **it disproves the leading theory from the second occurrence** — that dispatch
  ran to full, successful completion (221/221 tests, clean build, a genuine multi-file feature, not
  stopped early like the keyboard-shortcuts one) — so "the agent got killed mid-task" cannot be the
  explanation; whatever's happening isn't specific to early termination.
  Separately investigated the repeated `failed to delete '.git/worktrees/agent-*': Permission denied`
  noise seen on every commit since 2026-07-15 (previously just noted as "harmless," never actually
  looked into) — found real, if circumstantial, evidence this is OneDrive: this repo lives inside
  `OneDrive\Desktop\...`, OneDrive's sync process was confirmed actively running, and every one of the
  6 "orphaned" worktree directories checked (including one, `agent-a35c465e...`, known for certain to
  have been a real, correctly-functioning, properly-merged worktree earlier the same session) had
  already had its internal `.git` pointer file successfully removed by `git worktree remove` — meaning
  the *unregistration* step works fine, only the *physical directory deletion* that follows it fails,
  consistent with OneDrive's background sync filter transiently locking files mid-scan. This plausibly
  also explains the previous session's "worktree created with no `.git` at all" variant, if the same
  lock contention hits during creation instead of deletion — but does **not** explain today's
  "worktree was real and registered, agent still wrote to `main`" variant, which remains genuinely
  unexplained (most likely a harness-level routing/timing issue this investigation has no visibility
  into, not a git-level or OneDrive-level cause). Practical mitigation adopted for this session
  regardless of root cause: after **every** agent dispatch with `isolation: "worktree"` — not just
  early stops — check both `git worktree list` *and* `git status --short` on `main` before assuming
  isolation held; if work landed on `main` directly but matches the agent's own reported file list
  with nothing unrelated mixed in, review and commit it in place rather than trying to force a
  merge-from-branch workflow that has nothing real to merge.
  **Follow-up, same session, actioned at Kayvan's explicit request**: moved the repo out of OneDrive
  entirely (`C:\Users\khoob\OneDrive\Desktop\TV Episode Reviewer` → `C:\Users\khoob\Projects\TV
  Episode Reviewer` — see the top-of-file "THE REPO MOVED" note, the durable record of this lives
  there since it's the thing a cold-start session most needs to see first). Before actually moving,
  ran a direct test of the OneDrive-causes-deletion-failures theory: reproduced the identical
  `.git/worktrees/*` "Permission denied" failure at the *new*, non-OneDrive location, immediately
  followed by a successful plain `rm -rf` on the exact same directory moments later. **This disproves
  OneDrive as the cause of that specific symptom** — the corrected read is a Git-for-Windows-internal
  quirk (its own deletion routine likely racing against a file handle it just released), benign and
  cosmetic, matching what this file originally (correctly) guessed before this investigation
  second-guessed it. OneDrive was never confirmed as the cause of the more serious "agent wrote to
  `main`" variant either way — moving out of OneDrive was still worth doing for the genuine
  deletion-failure/disk-clutter class of issue and because Kayvan asked for it directly, not because
  it was expected to fix the worse bug.
  The move itself surfaced a new, previously-unknown limitation: this session's own tooling —
  specifically the Agent tool's `isolation: "worktree"` mechanism — turned out to be hardcoded to the
  path the session started at, and does not follow a mid-session relocation. A live diagnostic
  dispatch (asked an agent to report its cwd and write one throwaway file, nothing else) failed
  outright with `Failed to resolve base branch "HEAD": git rev-parse failed`, since the old path no
  longer had a git repo at all by that point. An attempted fix — a directory junction at the old path
  pointing to the new one, which should be transparent to any tool and isn't synced as real content by
  OneDrive — could not be completed: this same session's own live shell process still held the old
  directory open as its working directory, and Windows refuses to replace/remove a directory under
  those conditions (`New-Item -ItemType Junction` failed with `DirectoryNotEmpty` even though the
  directory's *contents* were genuinely empty — the block was the directory node itself, held open by
  the live process, not real content). Kayvan chose to end the session cleanly here rather than keep
  improvising further filesystem changes mid-session — see the top-of-file note for exact next-session
  instructions (open from the new path, retry the junction/deletion cleanup then, and run one cold
  diagnostic dispatch before resuming real build work to confirm the Agent tool is healthy again).
- 2026-07-18: **Fixed the open-TMDB-proxy security gap (`CriticalReview.md` Finding 3.1) directly,
  without the full implementer-then-independent-reviewer pipeline this would normally get as auth/
  security work** — at 87% session usage, spawning and waiting on a second agent risked not landing
  the fix at all before running out. Did it solo instead: added an early `getUser()` 401 gate to both
  `/api/tmdb/search` and `/api/tmdb/[showId]/episodes`, updated the tests whose premise the fix
  invalidated, re-ran all checks fresh (199/199). Self-review only. Worth a genuine fresh-eyes look
  next session: confirm the gate is checked *before* any TMDB call in both routes (not just present
  somewhere in the function), confirm no legitimate caller broke (the web client same-origin-fetches
  `/api/tmdb/search` so cookies flow automatically — verify this holds after a real hands-on
  `/shows/search` check, not just from reading the code), and confirm `/api/tmdb/[showId]/episodes`
  really has no current caller that would now 401 unexpectedly.
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

- 2026-07-18: Fresh session, opened from the new `C:\Users\khoob\Projects\TV Episode Reviewer` path
  per the prior session's exact instructions. Confirmed the working directory, git remote, and
  status were all correct and clean before doing anything else. Found the leftover empty OneDrive
  shell (`C:\Users\khoob\OneDrive\Desktop\TV Episode Reviewer`) genuinely empty (`find` returned zero
  files) and deleted it at Kayvan's confirmation (he deleted it himself after a permission-classifier
  block on an automated `rm -rf`). Then ran the cold diagnostic dispatch the prior session asked for:
  a trivial `isolation: "worktree"` agent (report cwd/HEAD/`git worktree list`, commit one throwaway
  file on its own branch, nothing else). Result: **clean isolation, no bug recurrence** — real
  registered worktree, agent's commit (`dab854e`) landed only on its own branch
  (`worktree-agent-a2e2abff2f691a1a1`), `main`'s working tree stayed untouched (`git status --short`
  empty immediately after). This is the first dispatch ever run in a session that never touched
  OneDrive — one clean data point, not proof the deeper "agent wrote to `main` despite a real
  worktree" bug is fixed, but consistent with OneDrive having been a contributing factor even though
  the prior session's direct test only disproved it for the *deletion-failure* symptom, not this one.
  Worth continuing to watch on every dispatch going forward rather than treating as resolved. Cleaned
  up the diagnostic worktree/branch afterward (`git worktree remove --force`, `git branch -D`). Also
  ran `git worktree prune` to clear stale pre-move `.git/worktrees/agent-*` metadata entries (9 of
  them, left over from before the repo moved) — pruning itself hit the same already-root-caused benign
  Git-for-Windows deletion-race ("Permission denied" on the physical directory, unregistration
  succeeds) on every entry, twice in a row; left as cosmetic, not chased further. Bucket 1 is empty,
  Tier A is next — checking with Kayvan on Bucket 2's hands-on-verification items (which need his
  click-through on live Vercel, not something this session can do unilaterally) versus continuing
  straight to the next Tier A build item before proceeding.
- 2026-07-18: Same session, moved from planning to building — Kayvan said to keep the Tier A queue
  order as-is and start work. First item, keyboard shortcuts, was dispatched then cancelled moments
  later at Kayvan's request ("skip keyboard shortcuts... move to the backlog") — see Deviations for
  what that dispatch left behind and what it revealed about the recurring worktree-isolation bug.
  Moved to item 1's remainder, ranking confidence: built and merged the base score + display
  (`website/src/lib/ranking/confidence.ts`, pure functions computing `decisiveComparisonCount`/
  `episodeConfidence`/`showConfidence` per the v1 formula already written up in
  `DevelopmentPlan.md`), wired into `getShowRankingDisplay` in `ranking-session/session.ts` (a new
  `confidence: number | null` field, computed from comparison history/ranked list already loaded
  there — no new database query), and rendered on the show page ("Your {show} rankings are N%
  stable."). One real judgment call the design doc itself left ambiguous — what count to divide by,
  a show's total episodes or just how many are ranked so far — resolved to match `scoreForPosition`'s
  existing convention (current ranked count, recomputed fresh every time) and marked `JUDGMENT CALL`
  in source for review. Deliberately scoped to the display-only piece: smart comparison selection
  (which pending comparison would most reduce uncertainty) and the live "one comparison away from
  separating #4 and #5" framing are still unbuilt, since those change which comparison actually gets
  asked next — correctness-critical, needs the full reviewer pipeline, not bundled into this pass.
  This build hit the third occurrence of the worktree-isolation bug (see Deviations for the full
  investigation) — the agent's work landed directly on `main`'s working tree despite a verified real
  worktree, but matched its own reported file list exactly with nothing unrelated mixed in, so it was
  reviewed by hand and committed in place rather than merged from a branch. 221/221 tests, clean
  typecheck/lint/build, re-verified fresh before committing. Not yet hands-on tested — see Bucket 2.
- 2026-07-18: Same session, after the TMDB auto-refresh work below. Kayvan brought a second large
  idea list (independently written, not the same document as the 2026-07-17 external design review)
  and asked to go through it together — read fully, then discussed cluster by cluster rather than
  triaged unilaterally, deciding feasibility and placement for each idea live rather than presenting
  a finished triage. Full durable record written into `AppSpec.md`'s new "Second Design Review —
  Triage" section (mirrors the structure of the first review's triage section). Headline outcomes:
  - **Reconfirmed, not silently, three prior Tier C rejections this list re-proposed independently**:
    Elo/Glicko (no new argument appeared, existing reasoning in `DevelopmentPlan.md` stands),
    fast/swipe ranking mode, and notifications/weekly recap — all re-declined on request.
  - **New real work added to the queue**: episode pages (a genuinely new page, doesn't exist today —
    added as Tier A item 9), smart comparison selection + a "live stability" framing (folded into
    Tier A item 2, the ranking-confidence work, as its flagship presentation — Kayvan's single
    most-wanted idea across both design reviews), four cheap visualization additions plus an
    auto-only-tier-lists decision (folded into Tier A item 3), season rankings/import/spoiler mode
    (new Bucket 4 backlog items — spoiler mode explicitly flagged for full implementer+reviewer rigor
    whenever it's picked up, given the trust-breaking cost of a half-covered spoiler feature).
  - **A real number of explicit declines, each with reasoning logged** (so they're not silently
    re-proposed later without someone re-deriving the same reasoning): character rankings and
    curated/canonical episode collections (both hit the same wall — subjective content judgments
    TMDB doesn't encode and that don't scale to manually tag), general episode-type/theme tagging for
    community-ranking slices (with one deliberate exception carved out: a season-finale flag, which
    is *derived* from data already imported, not manually tagged — feasible and added to episode
    pages' scope), taste profile, favorite-moments notes and canonical trivia/quotes/screenshots
    content, rewatch mode/ranking-history-over-time, AI features and episode-level recommendations
    (split on cost profile — a stats-only recommendation engine could be free, genuine AI features
    need real per-call spend this project's rules require an explicit go-ahead for — both declined
    for now anyway), and discussion/comments/polls (declined specifically over ongoing moderation
    burden for a solo developer, not a one-time build-cost concern). "Draft mode" wasn't declined so
    much as recognized as already effectively built (cold-start liked/disliked/neutral bucketing does
    this already). The list's own "things to avoid" principles were reviewed and found to already
    match this project's existing posture — no new guardrails doc needed.
  Design/discussion only, nothing built. `DevelopmentPlan.md`'s Ranking Algorithm and Discussion
  sections got small cross-reference updates (the Elo/Glicko reaffirmation, and the confidence-signal
  section noting its smart-selection/live-framing expansion) rather than restating any of this.
- 2026-07-18: Kayvan opened a fresh session by asking directly how the app handles new episodes of
  tracked shows being added, and whether "My Shows" and the show page keep up with that. Investigated
  before answering: confirmed `importShowFromTmdb` (`website/src/lib/shows/importShow.ts`) only ever
  runs once, at the moment a show is added via search (`shows/search/actions.ts`'s `addShow`) — every
  other read path (`/shows/[showId]`, `/shows/[showId]/rankings`, the dashboard's "My Shows") reads
  straight from Postgres and never calls TMDB again, and re-searching an already-added show
  deliberately shows "Go to show" instead of "Add show" specifically to *avoid* a second import call
  — so there was no accidental refresh path either. A real, previously-unflagged gap: not in
  `CriticalReview.md`, not anywhere in this file's prior History. Presented the finding plus several
  possible fixes (view-triggered throttled auto-refresh, a manual refresh button, both together, or a
  Vercel Cron nightly job) rather than picking one unilaterally, since the tradeoffs (TMDB call
  volume, added infra, UX cadence) were genuinely Kayvan's call — he chose throttled auto-refresh on
  page view, no new infra, matching this project's low-ceremony-setup preference.
  Built via the full correctness-critical pipeline (this touches persistence + networking): new
  `shows.last_synced_at timestamptz` column (migration `20260718020000_shows_last_synced_at.sql`,
  `not null default now()` deliberately, so existing rows backfill to "assume fresh" rather than
  forcing an immediate re-sync storm on every already-imported show the moment the migration lands),
  stamped by `importShowFromTmdb` on every upsert (both the original import and any later refresh). A
  new `ensureShowSynced` helper (`website/src/lib/shows/refreshShow.ts`) re-runs the (already
  idempotent) import only when `last_synced_at` is more than 24h old, and is deliberately fail-open —
  any TMDB error is caught and logged, never allowed to break the page render, matching the existing
  pattern in `searchAnnotation.ts`. Wired into the three read-only display pages (`/shows/[showId]`,
  `/shows/[showId]/rankings`, the dashboard) with the sync call placed *before* each page's episode
  query so a stale show's newly-picked-up episodes appear in the same render, not just the next one.
  Deliberately **not** wired into the active ranking flow (`/shows/[showId]/rank/[episodeId]` and its
  actions) — that route should keep reading whatever episode set already exists rather than being a
  sync trigger point mid-comparison; confirmed via `git diff` that route has zero changes.
  Independent reviewer (fresh worktree read, not the implementer's own summary) hand-traced the
  staleness boundary (confirmed exactly-24h-old is *not* yet stale, 24h+1ms *is*, and the test suite
  genuinely exercises that boundary rather than just coarse fresh/stale cases), confirmed fail-open is
  real by tracing the try/catch (not just the doc comment) and confirming the test actually rejects
  the mocked TMDB call, confirmed the migration's multi-line `comment on column` string literal is
  valid Postgres (same proven pattern as the prior `shows_genres` migration), and flagged one
  accepted, not-a-bug cost worth knowing: `importShowFromTmdb` fetches each season sequentially, so a
  stale show with many seasons adds real one-time latency to whichever page triggers its resync (the
  dashboard's `Promise.all` parallelizes *across* shows but not within one show's own season fetches).
  No fixes needed — verdict was ship as-is. Re-ran tests/typecheck/lint/build fresh in the final
  merged `main` (not just the agent's worktree) before pushing: 207/207, clean typecheck, clean lint,
  clean build. Not yet hands-on confirmed live — see Bucket 2, and note the 24h throttle means that
  can't happen immediately by just clicking around.
- 2026-07-18: Requested a dedicated, deliberately harsh full-project critical review — "as honest as
  possible so we can make the best product possible." One agent (Opus) read every doc, the actual
  ranking/auth code (not just docs' claims about it), migrations, and git history, then wrote
  `Docs/CriticalReview.md`: 27 findings across product/scope, the ranking algorithm, architecture,
  code quality, process, risks, and UX. Headline finding: the project is designing far ahead of
  validating (a full social layer, gamification, and stats designed for an audience of one). Verified
  the single most load-bearing/urgent claim directly before reporting it — confirmed `/api/tmdb/
  search` and `/api/tmdb/[showId]/episodes` really were reachable by anyone with no auth check
  (`proxy.ts`'s matcher excludes `/api`; neither route called `getUser()` before hitting TMDB) — then
  fixed it immediately (see Deviations Awaiting Review for why that was done solo, without the usual
  reviewer pass). Cross-linked the review from `CLAUDE.md` and flagged it at the top of this file so
  it doesn't get filed away and forgotten — it's meant to drive next session's priorities, not just
  be read once.
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
