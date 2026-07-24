# Episode Ranker — Current Status

**Read this file first** — before the other docs, before doing anything else. It's the single
"what's actually going on right now" pointer, kept short and current on purpose.

**`Docs/CriticalReview.md` and `Docs/ResponseToCriticalReview.md` were deleted 2026-07-19, at
Kayvan's request.** The original (2026-07-18, 27 findings) was a one-off, deliberately harsh
full-project critique — its one live/urgent finding (open, unauthenticated TMDB proxy routes) was
fixed the same session it was written (see History), and everything else in it was left deliberately
unactioned as a next-session decision-making task that never got picked back up. Kayvan's call: a
fresh critique will be written later, once the product is more complete, rather than carrying an
increasingly-stale one forward. Historical references to it elsewhere in this file's History section
are left as-is (accurate record of what prompted a past decision at the time), not scrubbed.

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

**The repo-move is fully resolved, 2026-07-18 (session after the move).** The project lives at
`C:\Users\khoob\Projects\TV Episode Reviewer` (this file's own path confirms it) — `git status`/
`git remote -v`/`git log` all clean and correct. The leftover empty OneDrive shell has been deleted.
A cold diagnostic dispatch confirmed the Agent tool's `isolation: "worktree"` mechanism works
correctly from the new path (real, registered worktree; commit landed only on its own branch,
`main` untouched) — the first clean data point from a session that never touched OneDrive, though
not yet proof the deeper "agent wrote to `main` despite a real worktree" bug (Deviations Awaiting
Review) is fixed. **Every dispatch for the rest of this same session (3 more, all real build work)
also isolated cleanly** — 4 for 4 this session, no recurrence at all; still worth watching going
forward, not yet treated as resolved.

Same session, moved straight to building (Bucket 1 was already empty, Tier A next): confirmed with
Kayvan hands-on that the confidence-score display and privacy page both work on live Vercel (both
removed from Bucket 2). Then built and merged, each via its own implementer-agent dispatch, reviewed
and re-verified fresh before every merge — see History for full detail on each:
1. **Tier A item 3, the richer two-column comparison screen** (`f763f5f`) — poster art, synopsis,
   the "I can't decide" relabel. Needed one new migration (`episodes.synopsis`), which Kayvan applied
   to live Supabase directly.
2. **A same-session redesign of that screen** (`fce46f2`), after Kayvan tried it hands-on and asked
   for two changes: synopsis now also shows on the cold-start screen, and the three-button "Better"/
   "I can't decide"/"Worse" control became click-the-poster-you-preferred, with "I can't decide" as
   the only remaining button.
3. **Tier A items 6/7 (date ranked + rank position) plus a rank-screen header fix** (`92d1bb5`),
   bundled into one dispatch at Kayvan's request since they touch the same display layer — "Ranked
   Jul 15" and "8.7 (#3)" now show on the show page; the rank screen's header now names the specific
   episode/season instead of just the show.

**Session ended here at Kayvan's request** (80%+ usage, context reset imminent) — everything above is
merged to `main` and pushed to `origin`, nothing left uncommitted. Before the reset, Kayvan hands-on
tested builds 1 and 2 above (the comparison screen redesign, and rank position/date-ranked/header)
live on Vercel: **all 8 checks confirmed working, nothing broken** — see History for the exact list.
Both removed from Bucket 2. **Only the throttled TMDB re-sync remains untested** — genuinely can't be
checked yet (24h throttle), needs a tracked show known to have a real new episode/season on TMDB.
That, plus whatever's next in the Tier A queue (items 1/2/4/5/8 remaining — see Punch List), is the
natural next-session starting point.

**New session, 2026-07-18 (continued same date).** Confirmed clean state, then built and merged Tier
A item 5 (dashboard per-show progress bar, `634b9d2`) — design confirmed with Kayvan first (visual
bar + percentage + `(X/Y)` fraction) before building. Kayvan hands-on confirmed it working on live
Vercel same session — removed from Bucket 2. Then picked up item 8 (episode pages): corrected a
STATUS.md factual error first (`still_path`/`air_date` were never actually fetched, unlike the doc's
prior claim — same mistake pattern as an earlier `overview` correction), confirmed the new route/entry-
point/image-fallback design with Kayvan, then built and merged sub-item (a) — title/season-episode/
air-date/synopsis/still image (`7bfab1c`). Kayvan applied the migration and hands-on confirmed the
page working on live Vercel same session (still image, season/episode number, title, air date,
synopsis all render correctly) — removed from Bucket 2. Kayvan then asked for sub-items (b)/(c) plus
a rank/re-rank button in one go: built and merged (`6d0a7e0`), now in Bucket 2 for the `shows.status`
migration + hands-on check. Kayvan applied that migration same session. Then item 8(d) credits
(director/writer/cast, a live uncached TMDB fetch) was built and merged (`1b396be`, merged with
`--no-ff` since `main` had advanced with a docs-only commit in the meantime) — **all of item 8's
sub-items are now built**, whole batch queued in Bucket 2 for one combined hands-on check. Kayvan
also logged a new idea mid-session (per-season "completed" badge on the show page, placed as Tier A
item 9). Kayvan then hands-on confirmed the whole item-8 batch working on live Vercel — removed from
Bucket 2 — and logged two more ideas, both placed in Tier A (items 10/11): clickable episode titles
on the comparison screen with a way back into the ranking flow, and swapping the ranking screens'
season poster art for the episode's own still image (enabled by item 8a's new column, which Kayvan
hadn't realized existed until seeing it on the episode page). Kayvan then asked to build items 9, 11,
and 2 (in that priority) at 33% session usage remaining. Built and merged via two sequential
dispatches (avoided running in parallel since both touched the show page): items 9 + 11 bundled
together (`af173f1`), then a scoped-down first slice of item 2 — tier list, season heatmap,
gatekeeper stat, deliberately deferring the win/loss matrix and comparison graph (`8f5e183`). Kayvan
hands-on confirmed all three working — removed from Bucket 2. Kayvan then asked to pick up item 1's
remaining scope (smart comparison selection); PM flagged it was never actually specified at the
mechanism level and walked through why, and Kayvan chose to decline it outright rather than resolve
the open design question — logged as declined-but-revisitable across `STATUS.md`/`AppSpec.md`/
`DevelopmentPlan.md`. Kayvan then asked to move Collections (item 4) to Tier B (already has a full
shareable design there) rather than build a private-only stopgap, and to build items 10 and item 2's
deferred pieces at the same time. Dispatched both in parallel (confirmed no file overlap first),
both built and merged: item 10 (clickable comparison/cold-start titles + a return-to-ranking link,
`6f420d2`) and item 2's remaining pieces (win/loss matrix, comparison history list, season timeline,
`ace73fc`) — **all of Tier A items 2, 9, 10, 11 are now built**. Kayvan hands-on confirmed all of it
working — removed from Bucket 2. **The Tier A queue is now fully empty** — every item from both
design reviews is either built, declined, or moved to Tier B.

**Session ended here at 71% usage, Kayvan's choice.** Kayvan flagged the mobile experience as
genuinely bad ("the mobile version of the website is terrible") and asked whether there was enough
budget left to fix it. PM's honest read: no — a real fix needs a full-app audit at narrow width plus
likely two implementer dispatches (the ranking-flow pages and the stats page's wide win/loss matrix
are different shapes of problem) plus Kayvan's own phone testing before it's done, which didn't fit
in the remaining budget alongside closing the session out cleanly. Kayvan chose to stop here rather
than start a narrow partial fix. **Bucket 4's mobile/responsive item is confirmed as next session's
priority** (updated with the full reasoning) — everything below is otherwise merged and pushed,
nothing left uncommitted, and the Tier A queue being empty means next session opens straight into
either that mobile work or a fresh priority pick, not "whatever's next in the queue." Deviations
Awaiting Review are all still open and unactioned — worth a look whenever mobile work isn't the
immediate pick.

**Same session, continued past that wrap-up.** Kayvan asked whether any backlog items were small
enough to still fit; PM recommended error monitoring, keyboard shortcuts, and a fresh-eyes review of
the TMDB security fix as genuinely bounded. Kayvan then declined keyboard shortcuts and spoiler mode
outright, redesigned season rankings to be derived rather than comparison-based (see Bucket 4 items
12/13/10), and asked for error monitoring to be built. Built and merged (`1a37f88`) — Sentry, free
tier, errors only — now in Bucket 2 pending Kayvan creating a real Sentry project (see the chat for
exact setup steps). Then did the fresh-eyes TMDB security review directly (no dispatch needed, pure
verification): confirmed clean via code read, the existing tests' `fetchSpy` assertions, and a live
curl against a running dev server — that Deviation is now fully closed out, no new issues found.
Kayvan then logged two more ideas: **"Rank all" mode, explicitly confirmed as the new highest
priority for next session** — bumped ahead of the mobile fix, both now sit together in **Bucket 1**
(restructured from empty to a ranked 2-item list: 1. Rank all mode, 2. mobile/responsive) — and
**"All Stars Mode"** (cross-show top-episode ranking, name TBD), added to Bucket 4 as a real but
much bigger, not-yet-designed future item (needs new comparison infrastructure, since every show's
#1 episode ties at score 10 today — can't be built as a pure derived view the way season rankings
was). Next session opens directly into Bucket 1, item 1.

**New session, 2026-07-18 (continued same date).** Opened straight into Bucket 1 item 1 ("Rank all"
mode) per the prior session's own instruction. Grounded the feasible-mechanism sketch already in this
file against the actual code first (`rank/[episodeId]/page.tsx`, `actions.ts`, `session.ts`, the show
page, `stats.ts`'s air-date comparator) rather than dispatching from the summary alone — confirmed the
sketch was accurate and buildable as written. Dispatched one implementer agent (`isolation:
"worktree"`); it built and self-verified cleanly (272/272 tests, clean typecheck/lint/build), and
`git worktree list` confirmed real isolation the whole time — no recurrence of the worktree-isolation
bug this dispatch. PM independently re-ran typecheck/lint/tests in the worktree before merging (not
just trusting the agent's self-report), reviewed the full diff against the confirmed design, then
fast-forward-merged and pushed (`63cc4ba`). Classified as navigation/control-flow (not
correctness-critical — no schema or algorithm changes), so implementer + PM review was the right
pattern, same as items 10/11, not the full independent-reviewer pipeline.
**What was built**: a "Rank all" link on the show page (shown whenever `display.unranked.length > 0`),
targeting the oldest-unranked episode by air date (`lib/ranking/rankAllOrder.ts`'s `orderOldestFirst`,
reusing `stats.ts`'s season-timeline comparator, now extracted as `compareEpisodeChronologically`
specifically so both callers share one fallback rule). The rank route reads a new `?mode=rankAll`
search param and threads it down through `ColdStartPicker`/`ComparisonPrompt` into `actions.ts`; the
one control-flow change is in the `alreadyRanked` branch of `submitColdStart`/`submitComparison` (4
call sites, now unified into one `redirectAfterAlreadyRanked` helper) — in rank-all mode this redirects
into the next oldest-unranked episode's rank page instead of the show page, ending naturally on the
show page once nothing unranked remains. The existing "Return to show page" link (always rendered
regardless of step) is the only exit affordance, exactly as this file predicted — no new UI beyond the
one entry link, deliberately minimal.
**One real gap surfaced by the implementer, not fixed yet, worth a look**: episode titles are
clickable mid-ranking (item 10, `returnToRank`) and link to the episode detail page's "↩ Return to
ranking" link — that round-trip does not carry `?mode=rankAll` through, so a user who clicks an episode
title while in rank-all mode and then clicks back into ranking will silently land back in single-episode
mode instead of continuing the auto-advance queue. Narrow (only hit by clicking a title *during* a
rank-all session), not a correctness bug (nothing breaks, you just have to click "Rank all" again from
the show page), not fixed in this dispatch since it touches a file outside the specified scope
(episode detail page's `returnToRank` handling) — logged in Bucket 2 alongside the hands-on check
below rather than chased immediately.
Now in **Bucket 2** for Kayvan's hands-on check on live Vercel (needs a show with at least one unranked
episode) — not yet tested. Bucket 1 now has just item 2 (mobile/responsive) left.

**Same session, continued.** Kayvan confirmed "Rank all" mode working hands-on, then asked for the
button to be made more prominent: same bordered-button style as "Remove show" but a different color,
stacked directly underneath it (both right-aligned in the show page header), rather than its original
plain underlined-text-link placement in the left info column. One implementer dispatch, blue instead
of red, otherwise identical `RemoveShowButton` styling — built, self-verified (272/272 tests), PM
independently re-verified, merged and pushed (`3826b16`). Kayvan confirmed it looks good on Vercel.
Then asked for a season filter + episode search on the show page, explicitly leaving the exact
mechanism to PM's judgment ("implement this in the way you think would cause the least amount of
friction"). Design call made and acted on directly (not asked back to Kayvan first, per this session's
auto-mode bias toward proceeding on low-risk/reversible UI calls): **live, client-side filtering** — a
season `<select>` plus a search `<input>`, both filtering the visible list on every
keystroke/selection, no submit button, no page reload — since every episode is already fetched
server-side on this page, so client-side array filtering adds zero latency and is the lowest-friction
option available. Search matches a lowercased blob of title + bare episode number + an "sXeY" code
(`searchableText`), so a query can be a title fragment, a bare number, or something like "s2e5" via one
simple substring check, deliberately not a real query parser. Season filter and search combine (AND).
Built via one implementer dispatch: extracted the show page's season-grouped episode list out of the
Server Component into a new Client Component (`EpisodeListWithFilters.tsx`, holding the filter state),
with `page.tsx` now passing one flattened `EpisodeWithStatus[]` instead of the four separate lookup
`Map`s it used to render directly (`Map`s don't cross the Server→Client Component boundary as cleanly
as plain arrays). Preserved one real nuance explicitly specified at dispatch time: each season's
"Complete" badge is computed from that season's **full**, unfiltered episode list, not the
search-filtered subset — a search that hides an already-fully-ranked season's episodes must not make
its "Complete" badge disappear or look wrong. 15 new unit tests cover season-only/search-only/combined/
no-match filtering plus a dedicated case proving the "Complete" badge is sourced correctly. PM
independently re-ran typecheck/lint/tests (286/286) in the worktree before merging, reviewed the full
diff against the confirmed design, merged and pushed (`41468bb`). Not yet hands-on checked — added to
Bucket 2 below.

**Same session, continued — Bucket 1's mobile/responsive item.** With 24% session usage spent (much
more budget than the 29% remaining that deferred this item originally), started the mobile audit PM
had planned. Couldn't get a live screenshot pipeline running quickly in this environment (no
`chromium-cli`, no Playwright browser installed/cached — would've meant a ~150MB one-time download for
a single audit task) — pivoted to reading the actual Tailwind markup on each flagged page directly
instead, which is enough to spot concrete narrow-viewport risks (unwrapped flex rows, fixed-width
buttons competing with growing text, missing responsive breakpoints). Found real candidates (`AppHeader`
nav bar, the show page header, episode list rows, the dashboard's "Logged in as" row) but before
dispatching any fixes, Kayvan looked at the live site and **walked back "terrible"** — the actual,
confirmed complaint was much narrower: on the show page, a long show title overlaps the "Remove show"/
"Rank all" buttons on a phone, because that header row had no responsive breakpoint at all (poster+title
and the button column were forced onto one row at every width). **This is a real, useful correction to
this file's own prior framing** — "the mobile version is terrible" (this file's words, quoting Kayvan's
original framing) overstated what was actually a single specific, narrow layout bug, not a whole-app
audit-and-fix job. Fixed with one small, tightly-scoped implementer dispatch: the header row now stacks
vertically below the `sm` breakpoint (title block above, buttons below, each full-width — no more
overlap regardless of title length) and restores today's exact side-by-side row at `sm:` and up, reusing
the identical `flex-col ... sm:flex-row` pattern already proven on the comparison screen
(`ComparisonPrompt.tsx`). One-line class change, verified (286/286 tests, clean typecheck/lint), merged
and pushed (`376d705`). The broader "audit every page" mobile item is downgraded accordingly (see Punch
List) — the other candidates found during the aborted audit (`AppHeader`, episode list rows, dashboard's
login row) are real but unconfirmed as actual pain points, not the same "the whole site is terrible"
scope this file previously carried. Kayvan confirmed both this fix (on a real phone) and the season
filter/search build (from earlier this same session) working — both removed from Bucket 2. At 30%
session usage spent, asked what's next; **queue is genuinely empty** (Bucket 1 and 3 both empty, Bucket
2's remaining items are either blocked on Kayvan — Sentry project creation — or blocked on time/external
state — the TMDB re-sync needs a show to actually get a new episode/season), so this is a real "pick
something" moment rather than an obvious next item.

**Same session, continued.** Kayvan picked three items to build: the "Rank all" `returnToRank` gap fix,
a "this was already ranked, nothing changed" stale-resubmission notice, and a derived season-rank badge
on each season's header (`#N`, tooltip showing the season's average score) — plus confirmed Tier B was
still wanted in the queue (consolidated into one Bucket 4 entry, see above) and extended the All Stars
Mode write-up with two new details (account-page placement, sharper dashboard behavior on a #1 change).
Dispatched one implementer for all three builds (bundled since they share files); it landed cleanly
(291/291 tests), PM independently re-verified before merging. Main had moved on with two docs-only
commits while the agent worked, so this was a real (conflict-free) merge rather than a fast-forward —
confirmed via `git merge-base` that the agent's own branch never touched `STATUS.md` before merging.
Merged and pushed (`b5db845`). Not yet hands-on checked — added to Bucket 2. Kayvan then resolved the
All-Star list's open visibility question (public, via the same `rankings_visibility` toggle as the rest
of Tier B, no special case) and added a new top-priority idea — the dashboard showing each tracked
show's #1 episode next to its progress bar — placed in Bucket 1 as item 1, then immediately asked to
build it. One implementer dispatch: reused `getShowRankingDisplay`'s already-computed `ranked[0]`
(best-to-worst by construction) for each show's #1 episode id, added one new **batched** query
(`episodes.in('id', [...])`, not one query per show — this page didn't touch `episodes` at all before)
to resolve title/season for those ids, rendered as "Best: {title} (S{season})" on the existing
progress-bar row. 291/291 tests, PM independently re-verified, fast-forward merged and pushed
(`2a3c78a`). Not yet hands-on checked — added to Bucket 2, Bucket 1 empty again.

**Same session, at 50% usage: recommended and built the search page's popular-shows browse view +
genre filter** (Bucket 4 item 17). Before recommending, reconciled two Bucket 4 items that today's
earlier bundled build had already delivered but hadn't been marked done (season rankings, the
stale-resubmission message) — both removed from the backlog. Kayvan logged three more backlog ideas
mid-session (popular-shows-on-search paired with a genre filter, both confirmed feasible via TMDB's
`/discover/tv`; a Tier B episode-tagging idea explicitly flagged for discussion before building, cross-
referenced against a prior related-but-distinct decline) — all logged in Bucket 4 before picking the
next build. Classified the search-page work as correctness-critical (real networking/API integration,
new TMDB proxy routes, and this project has a real prior incident here — `CriticalReview.md` Finding
3.1, an open TMDB proxy) — implementer + independent reviewer, not just PM self-review.

**Same session: Kayvan set up a real Sentry project and redeployed**, unblocking Bucket 2's Sentry
item. First test (a temporary `throw` in `signOut`, per this app's own documented verification steps)
showed the error in Vercel's own function logs but **not** in Sentry — investigated by reading
`@sentry/nextjs`/`@sentry/core`'s actual installed source (not assumed from training data, since this
app's own `AGENTS.md` warns this Next.js version may differ): found `Sentry.captureRequestError`
(what `onRequestError` was wired to) never awaits its own flush — it delegates to `@sentry/core`'s
`vercelWaitUntil`, which is hard-gated to `typeof EdgeRuntime === 'string'`, i.e. **only does anything
on Vercel's Edge runtime**. This app's Server Actions/Route Handlers/Server Components all run on the
standard **Node.js** runtime, so the flush silently no-ops and Vercel freezes the function before the
abandoned promise can send anything. A second data point refined this mid-investigation: the original
test event *did* eventually arrive in Sentry, ~6 minutes late — meaning the pipe/DSN/project setup was
never actually broken, just unreliably delayed (the flush apparently completes if the underlying
connection happens to stay alive long enough, with no guarantee). **Fixed** by replacing the direct
`onRequestError = Sentry.captureRequestError` export in `website/src/instrumentation.ts` with a thin
async wrapper that calls it, then explicitly `await`s `Sentry.flush(2000)` itself — Next.js's own
bundled docs for `onRequestError` document exactly this "await your async work" pattern. Re-tested the
same way (a fresh `signOut` throw): **confirmed working, error appeared promptly this time.** Reverted
the temporary throw (`e865c96`), sign-out restored to normal. Sentry error monitoring is now genuinely
done — see Bucket 2 for the final state.

**Session ended here at Kayvan's request, 70%+ usage.** Everything above is merged to `main` and pushed
to `origin` — `git status`/`git log` clean, local matches remote (`4c224f3` at close). Nothing left
uncommitted, no background agents left running. This was a long, productive session: built and shipped
"Rank all" mode (plus a button restyle and a later returnToRank gap fix), season filter + episode
search, a mobile header-overlap fix (after correcting an overstated "whole app is terrible" framing down
to its real, confirmed scope), a stale-resubmission notice, a derived season-rank badge, a dashboard
#1-episode display, and the popular-shows-browse-plus-genre-filter search page — plus found and fixed a
real, non-obvious Sentry/Vercel platform bug (Edge-only flush safety net silently no-op'ing on the
Node.js runtime this app actually uses) while verifying Sentry error monitoring end-to-end. Also did a
fair amount of pure docs work: consolidated Tier B into one real queued Bucket 4 entry, extended All
Stars Mode's write-up with two new pieces of detail and resolved its visibility question, logged three
new backlog ideas (popular shows/genre filter — since built — plus Tier B episode tagging, explicitly
flagged for discussion first), and reconciled two Bucket 4 items that a build had already delivered but
hadn't been marked done. **The Punch List below is current as of session close**: Bucket 1 empty, Bucket
2 has a full page of hands-on-check items (all built and merged, none yet confirmed by Kayvan on live
Vercel) plus the two still-genuinely-blocked items (TMDB re-sync needs a real new episode to test
against; nothing else is blocked), Bucket 3 empty, Bucket 4 has real backlog including Tier B (queued,
not started) and All Stars Mode (queued, needs its own design pass). Kayvan said there's a new task
coming next, separate from this punch list — next session (or the rest of this one) should pick that up
fresh rather than assuming it's a continuation of tonight's queue.

**Same session, continued past that (the "new task").** Kayvan asked for a read-only research agent —
briefed explicitly as an outstanding professional web designer — to read this project's full doc set and
the actual current UI code, and produce an exhaustive list of every question worth answering before a
real visual design pass gets scoped. Logged Kayvan's two seed ideas first (the dashboard progress-fill
card and the episode-score heatmap — both folded into the existing Bucket 4 "Visual design" item, see
above). The agent read `STATUS.md`, `AppSpec.md`, `CriticalReview.md`, `TechArchitecture.md`, `CLAUDE.md`,
the `dataviz` skill, and the live dashboard/show-page/stats-page/rank-flow/episode-detail code, and came
back with **88 questions across 18 categories** — each grounded in something specific it actually found
(e.g. Geist being loaded but never rendered due to a hard-coded `body` override; the app's existing
"color is never the only signal" rule colliding directly with a literal red/yellow/green heatmap being a
classic colorblind trap; the four unreconciled button treatments already in the app). Turned the raw list
into a proper reference document — a self-contained HTML artifact with a category nav, light/dark theme
support, and the full question set preserved verbatim and numbered for exact reference — rather than a
wall of chat text, since this is meant to be read and answered over time, not skimmed once. **Nothing
built or scheduled from this** — it's purely a reference for whenever the visual-design backlog item
(Bucket 4) actually gets picked up; answer any subset of the 88 by number whenever convenient. Session
ended here for real, at Kayvan's request ("end for the day") — `git status`/`git log` confirmed clean,
local matches remote (`78b9edb`), no worktrees or background agents left running, nothing to push.

**New session, 2026-07-19.** Opened per procedure (`STATUS.md` first). With Bucket 1/3 empty and
Bucket 2's remaining items blocked on Kayvan's own hands-on verification, this was a genuine "pick a
direction" moment rather than an obvious next build — presented options rather than picking
unilaterally. Kayvan chose two non-building tasks: do the pending Bucket 2 hands-on checks, and
investigate the recurring worktree-isolation bug (Deviations Awaiting Review). Both done, no new app
code touched this stretch:
- **Hands-on checks**: Kayvan confirmed all three checkable Bucket 2 items working on live Vercel —
  the rank-all/stale-notice/season-badge bundle (`b5db845`), the dashboard #1-episode display
  (`2a3c78a`), and the popular-shows browse + genre filter (`9c9df76`) — all removed from Bucket 2.
  One new backlog item surfaced: the stale-resubmission notice works correctly but should be more
  visually prominent (Bucket 4 item 19). The throttled TMDB re-sync remains the only still-blocked
  Bucket 2 item (needs a real new episode/season on TMDB to test against).
- **Worktree bug investigation**: confirmed this is a real, currently-open upstream Claude Code bug
  (GitHub #76197, filed 2026-07-09), not anything specific to this project or machine — see the new
  2026-07-19 entry in Deviations Awaiting Review for the full account, including a caught fabrication
  (a first research pass claimed a specific fixed version number that didn't hold up under a real
  GitHub search — corrected before it could be trusted). No fix available from this side; the
  project's existing mitigation is already the right response. Nothing left to action here.
Bucket 2 is now down to just the TMDB re-sync (externally blocked). Bucket 1 and 3 remain empty.

**Same session, continued.** Kayvan brought a real overnight Sentry error: a user hit "Bad Request"
trying to rank a specific show, "The Challengers." Investigated directly (no agent dispatch — usage
was at 75%+ by this point and Kayvan asked to hold off on spawning any). Read
`website/src/lib/ranking-session/session.ts` to find the throwing line, then Kayvan supplied the
actual Sentry breadcrumbs, which confirmed the diagnosis precisely: the failing request was
`episode_rankings`'s `.in('episode_id', episodeIdsInOrder)` query, its URL truncated by Sentry itself
for size — strong evidence the real query URL was genuinely oversized, not just a normal request that
happened to fail. Root cause: this project passes every episode id of a show as a literal
comma-separated list in the query URL; once a show has enough episodes, that URL exceeds
Supabase/PostgREST's own URL-length limit and the request comes back `400` instead of data. Grepped
the codebase for the same `.in('episode_id'/'episode_a_id'/'episode_b_id', <full episode list>)`
pattern and found five more call sites with the identical structural problem (loading comparisons in
the same rank-flow request, both delete paths triggered by removing a show, and the stats page's
win/loss matrix) — none individually confirmed crashing yet, but all structurally identical to the one
that did. Recommended fix (not built): drop the episode-id list from the query URL entirely — scope
reads by `user_id` alone (bounded by one person's lifetime usage, not by one show's episode count) and
filter to the show's episodes in application code; the two delete call sites need a small Postgres
RPC instead, since deletes need the database itself to do the filtering. Logged as **Bucket 1 item 1,
next session's clear top priority** — correctness-critical (real data-layer bug breaking a live user's
actual show), so it gets an implementer + independent-reviewer pass once picked up, not a solo fix.
Separately noticed `website/.env.local`'s `NEXT_PUBLIC_SUPABASE_URL` holds a Supabase dashboard link
rather than the real REST API URL while investigating — Kayvan pointed out the website works fine,
which is a fair observation but doesn't actually settle it: local `.env.local` and Vercel's own
production env vars are separate configs, so this wouldn't affect the live site either way. Logged as
Bucket 4 item 20 for a quick check next session (does local `npm run dev` actually work right now?),
not treated as a confirmed bug.

**New session, 2026-07-19 (continued same date).** Opened per procedure (`STATUS.md` first). Kayvan
brought two things: fresh user feedback that the crash happens specifically on shows with a lot of
episodes (SNL, The Simpsons, The Challenge — consistent with the already-diagnosed cause) and framed
it as needing "some sort of paging system"; and a new top-priority idea, a "Rank Season" button next
to each season header — "Rank all" mode scoped to a single season. Clarified before building: the
crash isn't a display problem a UI paging system would fix at all — last session's Sentry
investigation had already found the real root cause (episode-id lists embedded in Supabase query
URLs exceeding PostgREST's length limit), so this session just executed that already-decided fix
rather than building pagination. Read the actual current code first (`session.ts`, `stats/page.tsx`,
the whole "Rank all" mode stack) to ground both builds precisely, then dispatched two implementer
agents in parallel (confirmed no file overlap first — one touches `ranking-session`/`stats`, the
other touches the rank-flow/show-page UI):
1. **The URL-length crash fix (Bucket 1 item 1).** All three broken read call sites
   (`loadShowRankingState`'s `episode_rankings`/`episode_comparisons` queries, `stats/page.tsx`'s
   win/loss-matrix comparison query) now scope by `user_id` alone and filter to the show's episodes
   in application code via a `Set` — collapsing the old two-query/de-dupe-by-id dance for
   `episode_comparisons` into one query in the process, since a single un-`.in()`'d query can't
   return the same row twice. The one delete call site that was actually broken
   (`deleteShowRankingData`, called when removing a show) can't be fixed the same way — a `DELETE`
   needs the database itself to do the filtering — so it now calls a new `security invoker` Postgres
   RPC (`delete_show_ranking_data`, migration `20260719000000_delete_show_ranking_data.sql`) that
   deletes via a join through `episodes.show_id` entirely server-side; RLS (`user_id = auth.uid()`)
   remains the real enforcement even though `p_user_id` is also passed explicitly, matching this
   file's existing defense-in-depth posture. `resetEpisodeRanking` (always a single episode id, never
   at risk) was deliberately left untouched. Classified correctness-critical (data layer, per-user
   isolation) — got a full independent-reviewer pass, not just PM self-review: the reviewer re-derived
   correctness from source, confirmed per-user/per-show isolation holds, verified the RLS-under-
   `security invoker` reasoning independently rather than taking it on faith, and re-ran the full check
   suite itself (303/303 tests, clean typecheck/lint/build) rather than trusting the implementer's own
   report. One minor test-coverage gap the reviewer flagged (the cross-show leak test doesn't actually
   exercise the `episode_comparisons` filter path specifically) was considered and deliberately not
   chased further: `episode_comparisons` rows are only ever written by `submitComparisonAnswer` with
   both episode ids from the same show, and `showConfidence`/`episodeConfidence` only ever look up
   history by an episode id already in the show's own ranked list — so a wholly-foreign comparison row
   is provably inert either way, filtered or not, and testing it would mean testing malformed data the
   app has no code path to produce.
2. **"Rank Season."** A strict generalization of the existing whole-show "Rank all" mechanism with an
   optional `season` query param (`?mode=rankAll&season=N`) — a "Rank season" link now sits next to
   each season's "Complete"/`#N` badges on the show page (only rendered when that season actually has
   an unranked episode, same "no button if nothing to rank" logic as the whole-show link), landing on
   that season's own oldest-unranked episode and auto-advancing only through the rest of that season,
   returning to the show page once it's exhausted rather than spilling into other seasons. Threaded
   through the full stack the same way whole-show mode's `mode` param already was: `actions.ts`'s
   `nextRankAllDestination`/`redirectAfterAlreadyRanked`/`submitColdStart`/`submitComparison`, the rank
   page's search-param parsing, `ColdStartPicker`/`ComparisonPrompt`, and the episode detail page's
   `returnToRank` round-trip (closing the season-scoped counterpart of the same round-trip gap that
   `mode` itself needed a fix for, back when whole-show rank-all first shipped). A comparison step's
   reference episode can still legitimately come from a different season than the subject — scoping
   only controls the entry point and auto-advance target, never which episodes the underlying
   binary-insertion algorithm compares against, same as whole-show mode already worked. Classified as
   navigation/control-flow (extends an already-shipped pattern, no schema/algorithm change) — implementer
   + direct PM review, same pattern as items 10/11.

Both implementer agents left their work uncommitted in their own real, correctly-isolated worktrees
(`git worktree list` confirmed both were genuine, registered worktrees the whole time, and `main`'s
own working tree was untouched) — a milder, previously-undocumented variant of the recurring
`isolation: "worktree"` bug: isolation itself held, the agent just never ran `git commit`. Caught
immediately by checking `git status --short` inside each worktree per the standing mitigation; see
Deviations Awaiting Review for the full entry. PM reviewed each full diff directly against the
dispatch brief, re-ran the entire check suite independently in both worktrees (not trusting either
agent's self-report), committed both on their own branches, then merged (fast-forward for Rank
Season, a real non-ff merge for the crash fix since `main` had moved on in the meantime — confirmed
conflict-free ahead of time since the two branches touch entirely disjoint files) and re-ran the full
suite once more on `main` with both merged together: typecheck/lint clean, **313/313 tests**, build
succeeded, all routes compiled. Pushed (`0ccf337`). Both worktrees and branches cleaned up.
**Bucket 1 is now empty** (item 1 fixed; item 2 was only ever a forward-looking note, not blocking
work). Both builds went into Bucket 2 pending Kayvan's migration apply and hands-on check — Kayvan
applied the migration, then **hands-on confirmed both, same session**: the previously-crashing show
now loads and ranks normally, removing a large show works too, "Rank season" behaves correctly, and
whole-show "Rank all" is unaffected. Both removed from Bucket 2 — **Bucket 1 and 2 are now both
genuinely clear**, no open items from either the Sentry incident or this session's building.

**Same session, continued at 32% usage remaining.** With Bucket 1/2/3 all empty, presented the open
Bucket 4 backlog (grouped small/medium/needs-its-own-design-pass) rather than picking unilaterally;
Kayvan chose the two smallest items (19, 20). Item 20 (`.env.local`'s Supabase URL) confirmed genuinely
broken, not just suspected: it really was a Supabase **dashboard** link, not the REST API URL. Fixed
directly (one-line, local-only, gitignored file — not app code, so this didn't need an implementer
dispatch) and verified live rather than assumed, against Kayvan's own already-running local `npm run
dev` server: Next.js auto-reloaded the edited `.env.local`, and `/dashboard` then correctly
307-redirected to `/login`, proving a real server-side Supabase call succeeded where it would have
thrown before. Removed from Bucket 4 — see Punch List. Also fixed a small pre-existing Markdown
formatting bug immediately adjacent (Bucket 5's own heading had lost its line break and merged into
item 20's text) while editing that section anyway. Item 19 (stale-resubmission notice not visually
prominent enough) dispatched as one implementer agent (feel-based UI, `isolation: "worktree"`) — this
time the agent committed on its own branch correctly (no recurrence of the uncommitted-work variant
from earlier this session). New shared `StaleResubmissionNotice` component: a bordered, blue-tinted
box with an icon and bold text, `role="status"`, deliberately a third visual tier distinct from this
app's existing muted-caption and red-alert conventions, color backed by an icon + weight per the
"color is never the only signal" rule. PM reviewed the full diff directly, re-ran the check suite
independently (clean typecheck/lint, 313/313 tests), merged (`db11e0d`), pushed, worktree/branch
cleaned up. Now in Bucket 2 for hands-on check. Kayvan then hands-on confirmed it working on live
Vercel — removed from Bucket 2. **Both of this session's picks from the Bucket 4 queue are now
fully closed out.**

**Same session, continued.** Kayvan asked to resolve Bucket 4 item 18 (episode tagging, flagged for
discussion before building) and fold the result into the Tier B plan. Walked through the three open
questions live rather than deciding unilaterally: friction on the core ranking flow (none, if kept to
the episode detail page only), fixed-vs-growing tag list (asked directly — Kayvan chose fixed for
v1), and whether the UI surface is worth it (yes, if kept small). Also surfaced a genuine, non-obvious
finding before finalizing: as described, this feature is architecturally private-per-user (same RLS
posture as `episode_rankings`), so it doesn't actually need to wait on Tier B's own go/no-go — asked
Kayvan directly whether to split it out as an independent Phase 1 item or keep it filed under Tier B;
Kayvan chose to keep it bundled. Wrote the full design into `AppSpec.md`'s Tier B Detailed Design
section: a new private `episode_tags` table (composite PK, `check`-constrained tag column rather than
a Postgres `enum` so the "fixed for v1" list can still be adjusted later without real ceremony), a
proposed 8-tag starter list, tagging surfaced on the already-built episode detail page, and the
resulting stat routed to the not-yet-scheduled Personal Stats & Recap page rather than a new page of
its own. While in that section, also fixed two small pieces of doc drift unrelated to tagging but
directly adjacent to what was being edited: the "Community rank" flow and the "New pages/routes
needed" list both still described the episode detail page as not-yet-built, even though it was built
2026-07-18 (after this section of `AppSpec.md` was originally written 2026-07-17) — corrected with a
dated note rather than silently overwritten, per this project's own documentation discipline. Design
only, nothing scheduled to build yet — see Bucket 4 item 18 for the full resolution. Kayvan said
they'll decide what's next once this is wrapped up.

**Same session, continued.** Kayvan chose to build All Stars Mode (Bucket 4 item 15) next, explicitly
framed as the last "single-player" feature before Tier B (social layer) gets picked up — every other
single-player idea in the queue is now either built or declined. **Reclassified from the original
write-up**: no account page, no public/private visibility, nothing social — lives entirely on the
dashboard, single-user only. Grounded the design in actual code before dispatching (confirmed
`addComparativeEpisode`/`placeEpisodeComparatively`/`scoresForRankedList` in `@/lib/ranking` are
already fully generic over any pool of episode ids, no show-specific coupling, and that placing an
episode into an empty ranked list needs zero user comparisons — reusable as-is). Resolved the two
remaining open questions from the original write-up directly with Kayvan rather than guessing:
- **Minimum shows to unlock the feature: 4+** (matches the original write-up's own threshold).
- **What happens when a show's #1 changes after the fact**: **targeted re-rank** (only the changed
  show's stale entry is removed and its new #1 re-placed against the existing order; other shows'
  placements are untouched) rather than a full reset, **plus a visible notice** naming which show(s)
  changed and surfacing a separate, explicit "re-rank from scratch" option for anyone who'd rather
  redo the whole comparison — Kayvan's exact framing: "targeted re-rank, but add a prompt alerting
  users that their #1 episode for a show has changed, and they may want to do a manual re-rank of
  their all star list themselves."
**Design**: two new tables (`all_star_rankings`, `all_star_comparisons`) mirroring
`episode_rankings`/`episode_comparisons`'s shape but kept deliberately separate — comingling would
break an assumption this same session's crash-fix work established (`episode_comparisons` rows
always have both episodes in the same show). A new `all-star-session` module mirrors
`ranking-session/session.ts`'s reconstruct-replay-persist pattern, with no cold-start branch at all
(every entrant is already an established #1, straight to comparative placement) and an eager
reconciliation step (mirrors `ensureShowSynced`'s "best-effort background reconcile on every
dashboard load" pattern) that detects new/stale/orphaned pool entries before every read. The
show-removal RPC (`delete_show_ranking_data`, added this session for the URL-length fix) gets
extended to also clean up this pool's rows for a removed show. Dashboard restructured into "Shows" +
"Top Episodes" sections; a new comparison route (outside the `/shows/[showId]/...` tree, since these
comparisons cross shows) handles placement. Classified correctness-critical (new schema, cross-show
algorithm reuse, per-user isolation across two new tables) — dispatched as one implementer.

**Same session, continued.** Implementer landed cleanly (committed correctly on its own branch this
time — no recurrence of the uncommitted-work variant). Independent reviewer verified it thoroughly:
read the migration and RLS policies in full against the existing per-user pattern, traced the
reconciliation logic's three cases by hand (new/stale/orphaned) and confirmed a stale show's cleanup
never touches another show's rows, verified the deliberate `addComparativeEpisode`-bypass reasoning
by reading `engine.ts`/`constants.ts` directly (`effectiveColdStartThreshold` never returns `0`, so
that wrapper would have incorrectly rejected the very first entrant into an empty pool —
`placeEpisodeComparatively` itself has no such guard), and independently re-ran the full check suite
(clean typecheck/lint, 324/324 tests, clean build) rather than trusting the implementer's own report.
No issues found. PM then independently re-verified before merging too: read the migration, the
reconciliation function (`loadAllStarPool`), and the dashboard diff directly (not just the reviewer's
summary), confirmed the one change to previously-existing shared code (`ranking-session/session.ts`
gained a small, pure, backward-compatible `topEpisodeOf` helper, now used by both the dashboard's
existing per-show display and the new pool) was correctly additive, and re-ran the full check suite a
third time. Merged (`711b0ff`), pushed, worktree/branch cleaned up. Now in Bucket 2 — needs the new
migration (`supabase/migrations/20260720000000_all_star_rankings.sql`) applied to live Supabase, plus
a hands-on check (needs 4+ tracked shows with a #1 episode each to actually see the feature).

**Same session, continued.** Kayvan applied the migration and hands-on tested — found two real UX
bugs after actually using the shipped feature:
1. **The "Rank Top Episodes" button showed "Update" on the very first visit**, before ever clicking
   anything. Root cause: placing the very first entrant into an empty pool needs zero comparator
   calls by design (confirmed correct in the original build), so `getAllStarDisplay()` auto-places it
   as a side effect of merely computing display state — the UI's `isFirstTime` check
   (`display.ranked.length === 0`) was already false by the first render.
2. **The whole ranked list disappeared whenever anything was pending** (not just the affected show),
   and re-ranking a show so its #1 changed showed the "your #1 changed" notice correctly but the list
   vanished instead of showing the new #1 in the old one's place. Kayvan's exact ask: *"the list
   should re-appear with the new #1 in the place of the old one, but i should still have the prompt.
   and keep the prompt the same."*
Diagnosed both by reading the actual shipped code (`TopEpisodesSection.tsx`, `session.ts`) rather than
guessing, then designed fixes that deliberately keep the real, already-reviewed comparison algorithm
untouched: (1) a new tiny table, `all_star_progress` (one row per user, `has_completed_once`,
migration `20260721000000_all_star_progress.sql`), latched permanently true once a full pass is
genuinely completed, read fresh each render — not reset by the "reset from scratch" button, since
having reset doesn't mean you've never completed a pass; (2) a purely **display-layer** augmentation
in `getAllStarDisplay()` — the real `ranked`/`done`/`pendingCount` used by the actual placement
algorithm stay completely unchanged, but a *separate*, cosmetic merged array splices each stale show's
*live* #1 episode back into its old list position (marked `isPlaceholder: true`) purely for what gets
rendered. Dispatched one implementer (`isolation: "worktree"`); it landed committed cleanly on its own
branch (`worktree-agent-a7f0d6c9749f1fdc8`, commit `48857ae`, 327/327 tests, clean typecheck/lint/
build, self-reported). Classified correctness-critical (touches the reconciliation logic of an
already-reviewed feature plus a new table) — an independent reviewer was dispatched to verify
specifically that the "purely cosmetic, doesn't touch the real algorithm" claim actually holds up,
with particular attention to a timing edge case the implementer's own report flagged (the
`has_completed_once` flag has a deliberate one-request lag before persisting as `true`, claimed
harmless since the button never renders while `done` is true — flagged for the reviewer to verify
rather than taken on faith).

**Same session, continued — the independent review landed just after the pause above.** Verdict:
Bug 1's fix and Bug 2's core "doesn't touch the real algorithm" claim both hold up under direct
tracing (not just re-running tests) — but the reviewer found one real, previously-unflagged ordering
bug in the display-only placeholder splice when 2+ shows go stale simultaneously (full detail in
Bucket 1 item 1 above). Deliberately **not merged** — session usage was already past 91% and climbing
by the time this landed, so rather than either (a) rush a follow-up fix dispatch under time pressure
or (b) merge a branch with a confirmed, if minor, known-wrong behavior, this was left exactly as-is:
committed on its own branch, `main` untouched, the fix fully specified in Bucket 1 item 1 for whoever
picks this up next. No further dispatches started this session past this point. **Session ended here
at Kayvan's request.** Before closing out: pushed `worktree-agent-a7f0d6c9749f1fdc8` to `origin` (it
had only been committed locally until now) — so next session's starting point is fully backed up on
GitHub, not dependent on this machine's local worktree surviving. `git status`/`git log` confirmed
clean, `main` matches `origin/main` at `1241461` plus this closing entry.

**New session, 2026-07-22.** Opened per procedure (`STATUS.md` first). Picked up exactly where the
prior session left off: Bucket 1 item 2, the one-line ordering fix already fully specified there.
Dispatched one implementer agent (`isolation: "worktree"`), instructed to start from the existing
`worktree-agent-a7f0d6c9749f1fdc8` branch (not `main`) and fix only the diagnosed bug — sort
`staleDisplacements` by `oldRank` ascending in `buildDisplayRanked`
(`website/src/lib/all-star-session/session.ts`) before the splice loop, since splice indices are
computed against the already-augmented array and are only correct if processed in ascending old-rank
order. Agent chose that fix over adding `.order('rank_position')` to the underlying Supabase query,
noting the test suite's fake Supabase client's `.order()` is a no-op anyway, so only the local sort
is actually verifiable/effective. Added one new regression test exercising 2+ shows going stale in
the same reconciliation pass with durable rows seeded in scrambled order — the exact condition the
original bug needed. Landed as commit `0e99e7a`, pushed to `origin/worktree-agent-a7f0d6c9749f1fdc8`
on top of `48857ae`.
PM (not a second independent reviewer — matches this file's own prior judgment call that this fix was
small enough not to need the full pipeline) verified directly rather than trusting the agent's
self-report: read the diff (confirmed only the two intended files changed), hand-traced the
counterexample against the new test to confirm it genuinely fails on the old code and passes on the
new code, then independently reran typecheck/lint/tests in a fresh separate worktree (328/328, clean).
`main` had moved on with docs-only commits since the branch was cut, so this was a real (conflict-free
— confirmed via `git diff --stat` that only `Docs/STATUS.md` changed on `main` in the meantime, wholly
disjoint from the branch's code files) merge, not a fast-forward. Reran the full check suite a second
time on `main` post-merge (clean typecheck/lint, 328/328 tests) plus a full production build (all
routes compiled) before pushing. Pushed (`ffe83fe`). Both the fix branch and the agent's own worktree
branch deleted (local + remote) after merging.
**Bucket 1 item 2 is now fully built and merged.** Still needs, before it's closed out entirely:
Kayvan to apply the new migration (`supabase/migrations/20260721000000_all_star_progress.sql`) to
live Supabase, then a hands-on re-check of both original bugs (button label, disappearing list) plus
the specific multi-stale-shows case this session's fix addressed — see Bucket 2 for the tracked item.

**Same session, continued.** Kayvan applied the migration and hands-on confirmed everything working
(both original Top Episodes bugs plus the ordering fix) — removed from Bucket 2. With the queue
otherwise empty (Bucket 1 down to the not-yet-buildable signup item, Bucket 3 empty), presented
options rather than picking unilaterally: the signup redesign's design pass, the visual-design 88-
question doc, or Tier B. Kayvan chose the signup design pass.
Verified the technical premise before bringing decisions to Kayvan rather than assuming it still held
(Supabase's product surface changes, and this was explicitly flagged as unconfirmed): a live web
search confirmed the synthetic-email workaround is still the right approach in 2026, but surfaced a
real wrinkle the original write-up missed — this project's "Confirm email" setting means a
client-side `signUp()` to an unreachable synthetic address would strand every new account
unconfirmed, so account creation needs to go through the Admin API (`auth.admin.createUser` with
`email_confirm: true`) instead, using the service-role client this app already has
(`createSupabaseServiceClient()`, currently only used for TMDB writes). Then walked through each of
the four remaining open decisions directly with Kayvan (not guessed at): unify signup's username with
Tier B's `user_profiles.username` rather than keep two concepts (chosen: unify); what happens with no
recovery email on file (chosen: no recovery until one's added, clearly warned about); what happens to
Kayvan's own existing email-first account (chosen: coexist, no forced migration); and whether to bundle
the account-page "add an email later" flow into this build (chosen: no — deferred specifically to live
under Tier B, once its own account/settings surface exists). Wrote the finalized design into this
file's Bucket 1 item 1 (replacing the open-questions framing) and into `AppSpec.md`'s Tier B
`user_profiles` section (now created at signup rather than opt-in, with two new fields — `auth_email`
and `has_real_email` — needed to make username-based login and the no-recovery decision work) plus its
now-moot Judgment Call #2. **Design-only, nothing built yet** — Bucket 1 item 1 is now genuinely
buildable, classified correctness-critical (auth surface, new Admin API usage, real password-reset
behavior change), so it'll need the full implementer + independent-reviewer pipeline once picked up.

**Same session, continued — dispatched the build at Kayvan's request, 17% usage spent.** One
implementer (`isolation: "worktree"`) built the full design: `supabase/migrations/
20260722000000_user_profiles.sql` (plain `text` + `unique index on lower(username)`, not `citext` —
this project has never enabled that extension, confirmed by checking existing migrations first, so a
functional index gets the same guarantee with zero new dependency), a rewritten `signup/actions.ts`
(username pre-check → `auth.admin.createUser` with `email_confirm: true` → `user_profiles` insert →
roll back the orphaned auth account via `admin.deleteUser` if the insert loses a race → sign in via
the normal session client → redirect), and `login`/`forgot-password` both updated to accept "username
or email," resolving a username to its real `auth_email` via a service-role lookup. Landed clean
(356/356 tests, clean typecheck/lint/build) on its own branch, `main` untouched.
Independent reviewer (fresh context, no visibility into the implementer's own report) traced every
piece by hand rather than trusting the self-report: the creation/rollback sequence, session
establishment, RLS policy shape (compared directly against `all_star_rankings`/`user_shows`'s
existing migrations), and PII handling all held up. **But found one real, previously-unflagged
security bug**: `login/actions.ts` and `forgot-password/actions.ts` both escaped `_` before their
`ILIKE` username lookup (a legal username character that's also an ILIKE single-character wildcard)
but never escaped `%` (ILIKE's multi-character wildcard) — unlike `signup/actions.ts`'s own pre-check,
which is safe only because `isValidUsername()` already rejects `%` upstream before that lookup ever
runs. Concrete impact: someone who only knows a *fragment* of a username (e.g. "adm" and "n") could
submit `adm%n` and have it match a real account via pattern, not exact value — on forgot-password this
could trigger a real password-reset email to that account's real address, or reveal account existence,
without ever knowing the literal username. Untested (neither test file covered a `%`-containing
identifier). **Not a theoretical concern** — genuinely exploitable as designed, so this got fixed
before merging rather than logged for later, matching this project's standard for correctness-critical
auth work.
Dispatched a follow-up fix (narrow, already fully diagnosed by the reviewer): both files now escape
`%` alongside `_` via a new shared `escapeIlikePattern()` helper (`lib/auth/username.ts`, next to
`isValidUsername`/`syntheticEmailForUsername`), plus a regression test in each file asserting the
escaped pattern reaches `ilike()` literally and the downstream sensitive call
(`signInWithPassword`/`resetPasswordForEmail`) never fires for a wildcard-containing identifier.
PM independently verified the fix before merging rather than trusting either agent's report: read the
exact diff (confirmed `value.replace(/[%_]/g, '\\$&')` correctly escapes both wildcards, and that
`signup/actions.ts` — already safe — was correctly left untouched), read both new tests to confirm
they actually assert the escaped literal pattern rather than padding the count, then independently
reran the full check suite in a fresh separate worktree (358/358 tests, clean typecheck/lint/build).
Also read the full migration directly (RLS policy, constraints, doc comments) rather than just the
reviewer's summary. `main` hadn't moved since the design was written, so this was a clean fast-forward
merge. Reran the full suite a second time on `main` post-merge (same clean result) before pushing
(`9807722`). Branch and worktree deleted (local + remote) after merging.
**Bucket 1 is now empty.** Still needs, before this is closed out entirely: the new migration applied
to live Supabase, and Kayvan's hands-on check — new signup with just a username+password, log back in
with that username, log in with an existing email-based account (confirms nothing broke for the
current account), and a forgot-password attempt on a synthetic-email-only account (confirms the
"no recovery" message shows correctly rather than a silent failure). See Bucket 2 for the tracked item.

**Same session, continued.** Kayvan applied the migration and hands-on confirmed the new signup/
login/forgot-password flows all working — removed from Bucket 2. At 37% usage, Kayvan asked to start
building Tier B (the social layer, `AppSpec.md`'s "Tier B Detailed Design"). PM recommendation, not
picked unilaterally: don't build Tier B's remaining pieces (profiles/visibility, following, community
rank, taste similarity, collections) in one dispatch — collections is meaningfully riskier than the
rest (this app's first-ever unauthenticated route, deliberately bypassing RLS via the service-role
client) — recommended a sequenced build instead, one reviewed slice at a time. Kayvan confirmed: start
with Phase 1 (profiles/visibility + public profile page + following, the actual foundation the rest
sits on).
**Real doc inconsistency caught and fixed while re-grounding in the design**: the recommendation above
originally, mistakenly, also counted per-episode comments among Tier B's pieces — `AppSpec.md`'s Tier
B Detailed Design section (written 2026-07-17) still listed comments as fully in-scope, with a
complete schema/RLS/feature-flow design. But comments were actually **declined outright** later that
same broader session (2026-07-18's Second Design Review Triage, moderation burden for a solo
developer) — correctly reflected in this file's own Bucket 4 item 14, but the Tier B Detailed Design
section itself was never updated to match, so it silently kept describing a feature that had already
been killed. Caught before it propagated into an actual build (this session's phase plan, below, was
corrected before dispatching anything) — fixed properly in `AppSpec.md` with dated correction notes on
each of the three places the stale design appeared (scope list, data model, RLS design, feature flow),
per this project's "don't silently overwrite prior reasoning" discipline, rather than just deleting
the old text.
**Built Tier B Phase 1**: widened `user_profiles`' SELECT (a new, additional permissive policy for
`rankings_visibility = 'public'` rows, left alongside — not replacing — the existing own-row policy
from the signup build) and added its first-ever UPDATE policy (own row only, for `/settings`); a new
`follows` table (one-directional, no approval — Letterboxd model) with this app's first cross-table
RLS check (the INSERT policy's `WITH CHECK` rejects following a non-public profile at the DB layer,
not just in the UI) and a `check (follower_id <> followee_id)` constraint; a `SECURITY DEFINER`
`follow_counts()` function (this app's first — everything else uses `SECURITY INVOKER`) that returns
only the two aggregate counts, independently re-checking the target's visibility itself rather than
trusting callers already did. New `/settings` (display name, visibility toggle) and `/u/[username]`
(public profile, Follow/Unfollow, counts) — a nonexistent username and an existing-but-private one
render identically (`notFound()`) by construction, since the widened SELECT policy returns null for
both and `resolveProfileView()` has no branch that could tell them apart. Dashboard gained a plain
"Following" list. Classified correctness-critical for a specific reason beyond the usual auth/data-
layer bar: this is the first RLS policy in the app's history that isn't purely single-user — every
table before this one scoped every command to `user_id = auth.uid()`, full stop.
Independent reviewer traced every piece by hand against Postgres RLS semantics rather than trusting
the implementer's report: the widened SELECT policy's row-vs-column-level distinction (confirmed no
query in the diff selects `auth_email`/`has_real_email` for a public profile — checked every one),
the cross-table `WITH CHECK` subquery (correct, real DB-layer enforcement), the self-follow CHECK
constraint, the `SECURITY DEFINER` function's `search_path` hardening and its own independent
visibility re-check, and the private≡nonexistent invariant (traced end-to-end including the Follow
action's own error paths, confirmed no distinguishing signal anywhere) — all held up. One non-blocking
hardening suggestion, not a bug: Postgres RLS is row-level, so the new public-read policy technically
permits selecting `auth_email`/`has_real_email` for a public row — today's code never does, verified
by reading every query, but nothing at the DB layer would stop a future `select('*')` from leaking it.
Logged as a follow-up (Bucket 4) rather than blocking the merge, per the reviewer's own explicit
verdict ("safe to merge as-is").
PM independently re-verified before merging too: read the full migration directly (not just the
reviewer's summary) — confirmed the same things by hand, including noticing the profile page reuses
`escapeIlikePattern` (from the earlier signup security fix) for the username URL-segment lookup, a
good consistency catch by the implementer that wasn't explicitly requested. Reran the full check suite
independently in a fresh worktree (383/383 tests, clean typecheck/lint/build), confirmed `main` was
genuinely untouched by the implementer's self-reported (and self-corrected) wrong-directory mistake
during the build. `main` had only moved with a docs-only commit in the meantime, so this was a clean,
conflict-free non-ff merge. Reran the full suite a second time on `main` post-merge (same clean
result) before pushing (`db69dc7`). Branch and worktree deleted after merging.
Mid-session, Kayvan also logged a new idea (a "Rank Random" button under "Rank all," purple) — logged
to Bucket 4, not built this session.
**Tier B Phase 1 is built, reviewed, and merged.** Still needs: the new migration
(`supabase/migrations/20260722010000_follows_and_profile_settings.sql`) applied to live Supabase, and
a hands-on check — see Bucket 2. Remaining phases (community rank + Discover, taste similarity,
collections — comments is not one of them, see the correction above) remain queued in that recommended
order, not yet started.

**Same session, continued — Kayvan's hands-on testing of Phase 1 found two real issues.**
1. **`/settings` errored "Couldn't find your profile"** for Kayvan's original account (created via the
   old email-based signup flow, before `user_profiles` existed at all) — every account created through
   the *new* signup flow gets a row automatically, but nothing ever built the "claim a username later"
   path the original signup design explicitly promised legacy accounts. Root-caused directly (not
   guessed): `settings/page.tsx` had no handling for a missing row at all. Fixed via one implementer
   dispatch: a new `claimUsername` action + form, plus `user_profiles`' first-ever INSERT policy (own
   row only — the other half of a sentence already written in `AppSpec.md`'s Tier B RLS design that
   Phase 1 only built the UPDATE half of). The one detail that had to be gotten right: a legacy account
   already has a real email, so the new row must be created with `has_real_email: true` and the actual
   `auth_email`, not the synthetic-signup defaults. Independent reviewer traced all of this plus the
   race-condition handling and confirmed it correct; PM independently re-verified (read the migration
   directly) and reran the full suite (395/395, clean) before merging (`7a2fdf6`). Now in Bucket 2 for
   the migration + hands-on check.
2. **Hands-on testing also surfaced a real design gap, not a bug**: following worked for public
   profiles, but Kayvan found no way to follow a private one (expected — no button shown), a private
   profile 404'd identically to a nonexistent one (deliberate, by Phase 1's original anti-enumeration
   design), and — the one genuine bug in this batch — an already-followed user going private silently
   dropped out of the follower's "Following" list, even though the underlying relationship was never
   supposed to be deleted. Kayvan asked for a real design change: private profiles should show identity
   (username + follower/following counts) rather than 404, gated behind a request-to-follow/accept flow
   instead of instant following. This reverses two explicit prior decisions (`AppSpec.md`'s foundational
   question #2 and Judgment Call #1, both about *why* following was one-directional/no-approval and
   *why* no followers-only tier existed) — flagged directly to Kayvan rather than silently building a
   reversal, since the original reasoning had been reviewed and shipped just this session. Walked
   through the open questions live: confirmed approval applies to private profiles only (public stays
   instant, unchanged); confirmed accepted followers don't gain any new data visibility in this build
   (deferred — no "view another user's rankings" page exists anywhere in the app yet, for anyone, so
   there's nothing concrete to extend); confirmed the "stay following" issue is exactly the display bug
   diagnosed above, not something needing new design. Wrote the full resolution into `AppSpec.md`
   (foundational question #1's revision, Judgment Call #1's supersession, and a new "Follow requests"
   feature-flow entry) with dated correction notes rather than silently overwriting the shipped-this-
   session original reasoning. Also caught and fixed two more small pieces of the same doc drift found
   while in that section: Judgment Call #4 (about comments) was stale for the same reason the "Scope for
   v1" list was — comments were declined 2026-07-18, this call was never marked moot.
**Design resolved, then built the same session.** One implementer dispatch, the biggest single build
this session: two new `SECURITY DEFINER` "safe projection" functions
(`profile_identity_by_username`/`profile_identities_by_user_ids`, returning only `user_id`/`username`/
`display_name`/`rankings_visibility` — never `auth_email`/`has_real_email` — for any existing user,
nothing for a nonexistent one) — this is also what resolves Bucket 4 item 22's hardening suggestion
from Phase 1's review, since it's the app's first deliberate safe-projection pattern for cross-user
profile reads, exactly what that item recommended; `follow_counts` widened to return counts for any
existing profile, not just public-or-you; a new `follow_requests` table (kept structurally separate
from `follows`, mirroring the `all_star_rankings`/`episode_rankings` precedent) with RLS requiring the
target be currently private at insert time — the mirror image of `follows`' own insert check, which
requires the target be public, keeping the two paths mutually exclusive; a **second**, additional
INSERT policy on `follows` letting the *target* (not just the follower) write the accepted row, gated
by a matching pending request; and `accept_follow_request`, a `security invoker` function (matching
`delete_show_ranking_data`'s precedent, not `follow_counts`'s `security definer` — it only ever needs
the caller's own already-granted RLS access) that atomically inserts into `follows` then deletes the
`follow_requests` row, with an explicit defensive re-check that the caller is genuinely the request's
target before doing anything. App layer: `/u/[username]` now renders identity for a private profile
(still 404s for a genuinely nonexistent one), shows Follow/Request-to-follow/Following depending on
state, and an already-accepted follower of a now-private target correctly still sees "Following," never
a re-request prompt; dashboard gained an incoming "Follow requests" section (Accept/Deny) and the
Following list's display bug (a followed user vanishing once they go private) is fixed via the new
safe-projection lookup. 420/420 tests, clean typecheck/lint/build, self-reported.
Independent reviewer gave this the most scrutiny of any review so far this session, specifically the
new second `follows` INSERT policy (the first time in this app's history that someone *other than* the
row's own primary actor can insert into a relationship table) — traced the `EXISTS` subquery by hand
and confirmed it binds to the exact requester/target pair being inserted, confirmed Postgres's
OR-composition of the two `follows` INSERT policies can't combine into anything neither policy alone
permits, confirmed `accept_follow_request`'s insert-then-delete ordering is both correct and necessary
(the new INSERT policy's `EXISTS` needs the `follow_requests` row still present) and that a failure
partway through can't leave a half-completed state (implicit single transaction, no exception
swallowing). No security bug found in any of the seven areas reviewed. Two non-blocking polish notes:
`accept_follow_request` doesn't pin `search_path` like the other new functions do (harmless here since
it's `security invoker` with fully schema-qualified references, but an inconsistency); and a real,
useful process observation carried forward rather than fixed now — this codebase has no DB-level
automated test harness for RLS policies anywhere (not a regression from this build, true of Phase 1's
policies too), so the highest-stakes claims in every one of these reviews are verified by hand-tracing
the SQL, not by an automated test that would catch a future regression.
PM independently re-verified before merging too: read the full migration directly (not just the
reviewer's summary) — traced the same INSERT-policy and `accept_follow_request` logic by hand and
reached the identical conclusions. Reran the full check suite independently in a fresh worktree
(420/420, clean typecheck/lint/build). `main` hadn't moved since the branch was cut, so this was a
clean fast-forward. Reran the suite a second time on `main` post-merge (same result) before pushing
(`9235133`). Branch and worktree deleted after merging.
**Tier B's follow system (Phase 1 + this private-profile extension) is now fully built and reviewed.**
Still needs: this migration
(`supabase/migrations/20260722030000_follow_requests_and_private_profile_visibility.sql`) applied to
live Supabase (on top of Phase 1's still-pending migration), and a hands-on check — see Bucket 2.

**Session ended here at Kayvan's request, 94% usage.** This was the longest, highest-stakes session
this project has had — everything above is merged to `main` and pushed to `origin`
(`3ae27fd` at close), `git status`/`git log` confirmed clean, local matches remote exactly. Five
stale local branch refs left over from the recurring Windows worktree-deletion issue (all fully
merged, no unique commits — verified before deleting) were cleaned up; the underlying issue itself
(`.git/worktrees/*` directories that fail to delete on Windows, `git worktree list` still correctly
shows them unregistered) is unchanged and still just cosmetic noise, not touched this session. No
background agents or open worktrees left running.

**What happened, in order**: picked up exactly where the prior session's notes said to (the Top
Episodes multi-stale-show ordering fix, fully specified and waiting) — dispatched, independently
reviewed, PM-verified, merged. Then, with the queue genuinely empty, did a full design pass on
username+password signup (the session's own top-priority backlog item): verified the technical
approach was still current via live web search rather than assumed, caught a real gap the original
write-up missed (this project's "Confirm email" setting requires the Admin API, not a plain
client-side `signUp`), resolved four real open product decisions directly with Kayvan, then built it
— implementer, independent review (caught and fixed one genuine, exploitable security bug: an
unescaped `%` in an `ILIKE` username lookup), merged, Kayvan confirmed hands-on. Then, at Kayvan's
request, started Tier B (the social layer) — recommended against building all six of its pieces in
one dispatch given two are meaningfully riskier than the rest, sequenced instead, built Phase 1
(profiles/visibility/following, this app's first-ever RLS policy that isn't purely single-user),
independently reviewed, merged, Kayvan confirmed hands-on and found two real issues from actually
using it: a legacy-account settings bug (fixed, reviewed, merged, not yet hands-on re-confirmed) and
a real design gap Kayvan asked to change (private profiles should be identifiable and followable via
request/approval, not a flat 404) — which meant reversing two decisions shipped earlier the *same*
session, done with the reversal flagged explicitly and the docs corrected with dated notes rather than
silently overwritten. Built, reviewed (this build got the most scrutiny of any review this session,
specifically its new "target can insert into `follows`" RLS pattern), merged. Along the way, caught
and fixed a real pre-existing doc inconsistency (comments had been declined outright back on
2026-07-18 but `AppSpec.md`'s Tier B design section never stopped describing them as in-scope) before
it could propagate into an actual build, and logged one new backlog idea (a "Rank Random" button,
purple, exact behavior still unconfirmed).

**What's actually left, concretely** (all in Bucket 2 below, none of it blocking — this is Kayvan's
own hands-on-testing queue, not open engineering work): apply the follow-requests migration to live
Supabase; hands-on re-confirm the legacy-account settings fix now that a username can actually be
claimed; hands-on walk through the full request/accept/deny flow and the "still following after they
go private" fix. **The next real build decision** is which Tier B phase comes next — community rank +
Discover (recommended next, since they share the same aggregate infrastructure), taste similarity, or
collections (deliberately last in the original sequencing, given it's this app's first unauthenticated
route) — not yet started, no design work done on any of them beyond what's already in `AppSpec.md`'s
original Tier B Detailed Design section. Two things worth a look whenever there's spare capacity, not
urgent: Bucket 4 item 22 (the `user_profiles` hardening — partially addressed this session, a DB-layer
guard still doesn't exist) and the `search_path`-pin inconsistency on `accept_follow_request` flagged
by its own reviewer as harmless-but-worth-tidying.

**New session, 2026-07-23.** Opened per procedure (`STATUS.md` first, confirmed clean state matching
`main` at `30b00dc`). Kayvan chose to do the follow-requests hands-on check first. Applying the
migration went fine, but the very first real attempt — sending a follow request to a private profile
— failed with "Couldn't send a follow request." **Found and fixed a real bug in the just-merged
migration** (`20260722030000_follow_requests_and_private_profile_visibility.sql`), diagnosed directly
by reading the migration SQL rather than guessing: the `follow_requests` INSERT policy's `WITH CHECK`
confirms the target is private via `exists (select 1 from user_profiles where user_id = target_id and
rankings_visibility = 'private')` — but that subquery runs under the *requester's own* RLS, and
`user_profiles`' SELECT policies only ever expose a caller's own row or `public` rows. A private
target's row is invisible to that subquery no matter what, so the `exists` check is unconditionally
`false` and the insert is rejected every time, regardless of the target's real visibility — the check
doesn't fail closed on a bad request, it fails closed on *every* request. Root cause confirmed by
reading `20260722010000_follows_and_profile_settings.sql`'s SELECT policies directly (only "own row"
and "public") and by confirming the unit tests never would have caught this (they mock the Supabase
client entirely, per Bucket 4 item 24's already-logged "no DB-level RLS test harness" gap). The
mirror-image check on `follows`' own INSERT policy (target must be `public`) works fine, since a
public row genuinely is visible under RLS to any authenticated caller — private rows have no
equivalent "anyone can see this" policy, by design, so the same subquery pattern silently breaks only
for the private case.
**Fixed** with a new migration, `20260723000000_fix_follow_request_visibility_check.sql`: a small
`SECURITY DEFINER` helper, `is_profile_private(uuid) returns boolean`, that checks visibility directly
(bypassing `user_profiles`' RLS by design — same bypass pattern this codebase already uses for
`follow_counts`/the safe-projection functions), then the `follow_requests` INSERT policy is dropped
and recreated to call it instead of querying `user_profiles` directly. The helper returns only a
boolean, no new data exposure — this doesn't widen any access, it just makes the intended check
actually evaluate correctly. No app code changed (`npx tsc --noEmit` clean, lint clean, 420/420 tests
unchanged — confirms the bug was purely in the SQL, invisible to the existing mocked-client test
suite). **Logged as a Deviation Awaiting Review**: this is a security-relevant RLS fix done solo,
without an independent-reviewer pass, given how small and mechanically-verifiable it is (one function,
hand-traced against Postgres RLS semantics, directly mirroring an already-reviewed pattern in the
same codebase) — worth a second look next session per this project's own standing practice rather than
silently treated as settled.
**Same session, continued.** Kayvan applied the fix migration and confirmed the follow request now
sends successfully, then walked through the rest of the Bucket 2 item 16 checklist and confirmed
everything working: legacy-account username claim, private-profile identity display, Accept/Deny, the
post-accept "Following" state, and the survives-going-private fix. **Bucket 2 item 16 is now fully
closed** — Tier B's follow system (Phase 1 + the private-profile/follow-request extension) is
completely built, reviewed, and hands-on verified end to end. Committed and pushed (`9edf0ef`) — see
the migration fix's own Deviations entry, still open for a next-session second look despite the
feature itself now confirmed working functionally.

**Same session, continued — at 6% usage, Kayvan asked to keep going on Tier B with a new, specific
ask: a real account page** (shows list, top episodes, follower/following counts, profile picture,
username, a collections area — publicly viewable, much like `/dashboard` but read-only), explicitly
giving the PM free reign on design/scope with iterative feedback rather than a full upfront design
Q&A. This directly resolves Bucket 4 item 23 ("accepted followers of a private profile should
eventually see more") and reverses All Stars Mode's original "no account page" descope
(2026-07-19) — Top Episodes now gets a real public-facing home after all, just later than first
planned.
**This is a genuinely new class of exposure for this app**: every private table before this has been
either fully private (`user_id = auth.uid()` only) or identity-only cross-user (the safe-projection
functions) — this is the first time actual *ranking* data crosses the private/public boundary.
Grounded the design directly in code before writing anything (read every relevant migration —
`episode_rankings`/`episode_comparisons`/`user_shows` RLS from the initial schema, `all_star_rankings`
— plus `getShowRankingDisplay`/`getAllStarDisplay`'s actual implementations, `dashboard/page.tsx`,
`u/[username]/page.tsx`, `settings/actions.ts`, `profileIdentity.ts`) rather than design from the
summary in this file alone. Two real findings from that read directly shaped the plan: (1)
`getShowRankingDisplay`/`getAllStarDisplay` are **not pure reads** — both write as a side effect
(folding cold-start episodes, auto-placing pool entrants) — correct for viewing your own dashboard,
wrong for a viewer, so they can't be reused for this and a genuinely separate read-only path is
needed instead; (2) both also explicitly refuse a caller-supplied user id by design (`requireUserId`
always derives from the session) — a deliberate existing security boundary not to be touched or
weakened.
**Wrote the schema/RLS migration directly** (not left to an implementer), given the stakes and this
session's own earlier lesson: `supabase/migrations/20260723010000_account_page_visibility.sql` adds
`user_profiles.avatar_url`, a public `avatars` Storage bucket with per-user-path upload RLS, widens
the two safe-projection identity functions to include `avatar_url`, and adds new SELECT policies on
`user_shows`/`episode_rankings`/`all_star_rankings` (public-or-accepted-follower, on top of the
existing own-row policies). Each new check is written to specifically avoid the exact bug class from
earlier today's follow-request fix (a policy querying a table under a condition that hides the very
row it's checking) — the "public" arm only ever reads a `user_profiles` row that's genuinely public
(visible under that table's own existing policy), and the "followed" arm only ever reads the caller's
own `follows` row (always visible to them regardless of the target's current visibility), never a
private profile row directly. Not yet applied to live Supabase — see Bucket 2.
**Scope calls made solo, not asked back given the free reign**: Collections gets a static placeholder
section only ("coming soon") — the real feature needs its own schema and is this app's first
unauthenticated route, deliberately still queued as its own separate Tier B piece, not folded in
here. No link from another user's account page into their individual `/shows/[showId]` page — that
page is built entirely around being the signed-in owner's own management surface and isn't scoped for
a viewer; out of scope for this build.
Dispatched one implementer (`isolation: "worktree"`) for the full app-layer build against the
already-written migration (avatar upload on `/settings`, two new read-only display modules —
`ranking-session/accountView.ts`, `all-star-session/accountView.ts` — and the rebuilt `/u/[username]`
page) — bundled into one dispatch, matching this project's precedent for cohesive multi-piece Tier B
features (Phase 1, the follow-request extension), rather than split further. Classified
correctness-critical (new cross-user data exposure, new file-upload security surface) — will get a
full independent-reviewer pass, explicitly instructed to give the new RLS policies the most scrutiny
of anything in the diff, before merging.

**Same session, continued.** Implementer landed cleanly (437/437 tests, clean typecheck/lint/build,
self-reported) on its own branch (`worktree-agent-a86333d41751928ef`, commit `4d59e1e`) —
`git worktree list` confirmed real isolation held, `main` untouched throughout. One real process note
the implementer itself flagged: the PM-authored migration existed only as an uncommitted file in
`main`'s own working directory (not yet in git history, since it was deliberately left uncommitted
pending Kayvan's migration-apply step) — the implementer correctly read it from the main checkout,
confirmed it byte-identical, and copied it verbatim into its own worktree so the branch was
self-contained; the PM confirmed the two copies matched exactly (`diff`, no output) before merging.
Independent reviewer then gave this the most scrutiny of any review this session, per the dispatch
brief: hand-traced both arms of all three new cross-user SELECT policies against Postgres RLS
semantics (confirmed the "public" arm only ever matches a genuinely-visible public row, the "followed"
arm only ever matches the caller's own always-visible `follows` row — neither can silently evaluate
false-when-true, the exact bug class from earlier today, nor true-when-false, a new leak), traced the
Storage path-prefix policy against `storage.foldername()`'s actual behavior and confirmed the one real
upload call site matches what the policy assumes, confirmed `getAccountShows`/`getAccountTopEpisodes`
are genuinely read-only (grepped for any write call, confirmed neither reuses
`getShowRankingDisplay`/`getAllStarDisplay`), and confirmed the page's `hasAccess` gate actually
prevents fetching (not just rendering) content for a denied viewer. Independently re-ran the full
check suite fresh (tsc/lint clean, 437/437, build succeeded). **Verdict: safe to merge as-is.** One
low-severity, non-blocking note: `updateAvatar` persists any caller-supplied string to the caller's
*own* `avatar_url` after only a non-empty check, rather than verifying it points at an object the
caller actually uploaded — blast radius is self-scoped and render-only (React-escaped `<img src>`, no
script execution), already explicitly acknowledged as an accepted trade-off in the action's own doc
comment; logged as a small hardening item (Bucket 4) rather than chased now.
PM independently re-verified before merging too, not on the reviewer's word alone: read
`accountView.ts`, the rebuilt `/u/[username]/page.tsx`, and `AvatarUploadForm.tsx`/`actions.ts`
directly, reached the same conclusions by hand: confirmed no write calls in either `accountView`
module, confirmed the page's Shows/Top-Episodes/Collections block is entirely inside the `hasAccess`
conditional (not fetched-but-hidden), confirmed no `/shows/[showId]` links appear on another user's
shows list, confirmed the client upload path is keyed off `auth.uid()` at the RLS layer (the client-
supplied `userId` prop is untrusted but harmless — a tampered value is simply rejected by the policy,
never trusted). Independently reran the full suite a second time in a fresh check of the worktree
(clean) before merging. Committed the migration + docs on `main` first (`48b1677`), then merged
(`--no-ff`, since `main` had moved — this session's own follow-request-fix commit — since the branch
was cut), confirmed the migration file resolved as identical content on both sides (no conflict), then
reran the full suite a third time on merged `main` (clean typecheck/lint, 437/437 tests) before
pushing. Worktree and branches cleaned up.
**Account page is now built, reviewed, and merged.** Still needs: the migration
(`supabase/migrations/20260723010000_account_page_visibility.sql`) applied to live Supabase, then a
real hands-on check — critically, from a **second account** (or an accepted-follower relationship),
confirming another user's shows/top episodes actually render when public/followed and are correctly
withheld when private and not followed — see Bucket 2.

**Same session, continued.** Kayvan applied the migration and hands-on tested with a real second
account (4 ranked shows) — 3 of 4 checks confirmed working cleanly: "Rank Top Episodes" behaves
correctly and updates on a #1 change (with the right prompt); a public profile correctly shows
avatar/username/follower-following counts/shows-with-#1/top-episodes; the same works correctly for a
private-but-followed profile. One real, confirmed issue: **a newly-eligible user's first-ranked
show's #1 episode was already showing in "Top Episodes" before they'd ever clicked "Rank Top
Episodes."** Investigated and confirmed this is **not a new bug from today's account-page build** —
it's a previously-accepted mechanism from the original All Stars Mode build (2026-07-19/21):
`placeEpisodeComparatively` against an empty pool needs zero comparator calls, so
`getAllStarDisplay()` was auto-placing and persisting that free first entrant as a side effect of
merely being *called* (dashboard load, now also the account page) — `20260721000000_all_star_
progress.sql`'s own header even documents this exact mechanism, but that migration only fixed the
resulting button-label symptom ("Update" showing on a first-ever visit), not the underlying
pre-population itself. `TopEpisodesSection.tsx`'s own doc comment confirms this was a deliberate,
documented call at the time ("the ranked list, if any entries exist yet from the zero-comparison
auto-placement above, still renders alongside it"). Kayvan's fresh-eyes feedback is a legitimate
reversal of that call, not a new bug — treated as such rather than silently redesigned.
**Fixed directly** (small, mechanical, mirrors an existing identical pattern in the same file — not
dispatched): a new durable per-user flag, `all_star_progress.has_started`
(`20260723020000_all_star_has_started.sql`), set only by `getNextAllStarStep` (the actual
`/top-episodes/rank` entry point — the one genuine "the user engaged" signal). `getAllStarDisplay`
(the passive path `/dashboard` and `/u/[username]` both call) now skips `deriveNextAllStarStep`
entirely while `!hasStarted`, returning a genuinely empty `ranked: []` instead of silently
persisting the free placement. Once a user visits the ranking flow for real, `hasStarted` latches
permanently true (never reset by `resetAllStarRanking`, same posture as `hasCompletedOnce`) and
`getAllStarDisplay` resumes its normal full-derive behavior from then on. Verified the fix is safe
against the existing upsert pattern before writing it: `markAllStarProgressCompleted`'s existing
upsert only sets `has_completed_once`/`updated_at`, and Postgres's `ON CONFLICT DO UPDATE` (what
Supabase's `.upsert()` compiles to) only touches columns actually present in the payload, so it
can't clobber `has_started` on conflict, and vice versa — confirmed this matches the existing test
double's own merge-not-overwrite upsert semantics too before relying on it.
Updated the existing test suite to match the new, intended contract rather than leave it encoding
the reversed behavior: three existing tests that called `getAllStarDisplay()` directly (with no
prior engagement) and expected the free-first-entrant placement to already be visible were rewritten
to call `getNextAllStarStep()` first, or seed `has_started` directly when a test's premise requires
already-existing `all_star_rankings` rows without replaying the whole history. Added a new dedicated
`hasStarted` test block (repeated passive calls stay empty and persist nothing; the flag latches
durably on first real engagement and every subsequent passive call reflects real state; a manual
reset doesn't clear it). 441/441 tests (4 new), clean typecheck/lint/build. Committed directly to
`main` (`all-star-session/session.ts`/`.test.ts` + the new migration) — classified as a small,
mechanical, well-precedented fix (not correctness-critical in the security sense), matching this
project's own prior judgment call for similarly-scoped fixes (e.g. the 2026-07-22 session's Bucket 1
item 2 ordering fix) rather than a full implementer+reviewer dispatch.
Not yet applied to live Supabase or hands-on re-confirmed — see Bucket 2.

**Same session, continued — at 37% usage, asked what's next.** Presented finishing the remaining
account-page checks vs. picking up the next Tier B phase; Kayvan chose community rank specifically
(not the full "community rank + Discover" bundle — Discover stays a separate, not-yet-scheduled
piece per `AppSpec.md`'s own "built entirely on the same aggregate infrastructure" framing).
Wrote the SQL migration directly (`20260723030000_community_rank.sql`), same posture as today's
earlier migrations: `community_rank_for_episode(episode_id)`, a `security invoker` function (not
`security definer` — deliberately, since it never needs to see anything the caller couldn't already
see) that averages the derived score across every public user who's comparatively placed the episode,
scoped per-show per-user for the score formula's "N," replicating `@/lib/ranking/score.ts`'s
`scoreForPosition`/`spread` exactly in SQL. Notably needs **no new RLS policy at all** — it relies
entirely on the "public owner" SELECT policy the account-page migration already added to
`episode_rankings` earlier this same session, so the aggregate only ever touches rows already visible
to any authenticated caller. Cold-start-bucket-only placements excluded, matching `AppSpec.md`'s
already-documented v1 simplification. Dispatched one implementer for the app layer (a new read-only
lib function, rendering "Community rank" alongside "your rank" on the episode detail page) — instructed
to hand-trace the SQL formula against `score.ts` before writing anything, and to flag rather than
silently "fix" the migration if it finds a mismatch. Classified as reusing already-reviewed exposure
surface with no new write paths — implementer + PM review, not a full independent-reviewer pipeline
(same reasoning as the season-poster/episode-page-credits class of work earlier in the project).

**Same session, continued.** Implementer landed cleanly on its own branch
(`worktree-agent-a0de0aa68879c3876`, commit `02007a1`) — 446/446 tests, clean typecheck/lint/build,
self-reported — but its own report flagged a real process incident worth recording precisely: it
initially used the wrong absolute path across every tool call and edited files directly in the main
checkout on `main` instead of its assigned worktree, caught this itself via `git status` showing "On
branch main," then self-corrected — copied its changes into the actual worktree, reverted the
accidental edits on `main` (confirmed only the PM's own pre-existing uncommitted `STATUS.md`/migration
changes remained), and redid its verification genuinely inside the isolated worktree afterward.
Distinct from every previously-logged `isolation: "worktree"` variant in this project's Deviations
log: those were all harness-level (a verified-real worktree's cwd silently drifting mid-run, or an
agent never committing) — this was the agent's own tool-call mistake, self-caught and self-corrected,
not a recurrence of the upstream bug. **Verified independently rather than trusted**: `git status`/
`git diff --stat` on `main` confirmed it was genuinely clean of any stray changes (only the PM's own
already-known-about uncommitted files), and the migration file inside the worktree diffed identical
(`diff`, no output) to the PM's own original. PM then reviewed the actual diff directly (the new
`communityRank.ts`/`.test.ts`, the page's rendering change) — clean, well-reasoned, matches this
codebase's conventions (fail-open try/catch mirroring the existing TMDB credits pattern,
correct `numeric`-as-string coercion, a single unambiguous `null` return over a `sampleSize: 0`
footgun) — confirmed the implementer's own hand-traced formula sanity-check (single-episode show,
8-episode show at positions 1 and 8) independently by re-deriving the same cases, no discrepancy.
Independently reran the full check suite in the worktree (tsc/lint clean, 446/446, build succeeded).
One real caveat, flagged rather than silently assumed away: **neither the implementer nor the PM has
run this SQL against a real Postgres instance** (this project has no local Supabase instance — Bucket
4 item 24) — the formula and structure were hand-verified logically, not executed, so if there's a
genuine SQL syntax issue it'll only surface when Kayvan actually applies the migration; a clean syntax
error there is a safe failure mode (paste it back rather than retry), not a silent-wrong-data risk.
Committed the migration + docs on `main` first (`85d59e1`), merged (`--no-ff`, main had moved since
the branch was cut), reran the full suite a second time on merged `main` (clean) before pushing.
Worktree and branches cleaned up. **Community rank is now built and merged.**

**Same session, continued.** Kayvan applied the migration — the never-run-against-real-Postgres
caveat didn't bite, it applied cleanly on the first try — and hands-on confirmed community rank
working correctly on the episode detail page. Removed from Bucket 2. **Community rank is fully done.**

**Same session, continued.** Kayvan asked for a real information-architecture change (not a new Tier
B feature): merge `/dashboard` and `/settings` into one "My Profile" page — avatar/username/email up
top, follower/following counts (newly clickable, linking to real list pages that don't exist yet),
the existing public/private visibility toggle, then the existing shows list and Top Episodes section
unchanged. Asked clarifying questions before building, per Kayvan's own explicit request rather than
guessing: (1) how deep "the option to add an email if no email exists" should go, given
`user_profiles`'s own schema comment already flagged this as a real future Supabase Auth mutation
(changing `auth.users.email`, needing its own confirmation-email flow) roughly comparable in
complexity to the original signup build — **Kayvan chose to defer it**, logged as a new Bucket 4 item
rather than half-built now; (2) whether "search for shows" should stay the existing link or become
inline — **Kayvan chose to keep it as-is**.
Grounded the rest directly in code before dispatching (read both full pages plus every supporting
component/action/test file, and grepped every `/dashboard`/`/settings` reference in the app — 25 files
touch `/dashboard`, only 2 actually link to `/settings` specifically) — confirmed **no new database
schema or RLS policy is needed anywhere in this task**: the new followers/following list pages reuse
`follows`' own existing "you can read rows where you're a party" SELECT policy and the existing
safe-projection identity lookup (`lookupProfileIdentitiesByUserIds`) the dashboard's "Following"
section already uses today. Decided (not asked, low-risk/reversible): keep `/dashboard` as the URL
rather than a new route (avoids touching the 25 files that already reference it); `/settings` becomes
a server-side `redirect('/dashboard')`, not deleted outright; remove the dashboard's existing "Logged
in as {email} / Log out" row entirely (redundant once the new profile header shows email directly,
and `AppHeader`'s persistent sign-out link is unaffected). Classified as pure reorganization + two new
read-only pages, no new correctness-critical surface (no schema/RLS at all) — implementer + direct PM
review, not a full independent-reviewer pipeline, dispatched now.

**Same session, continued.** Implementer landed cleanly on its own branch
(`worktree-agent-a847d88b1c3899faf`, commit `333d49e`) — 446/446 tests, clean typecheck/lint/build,
`main` confirmed untouched. Kept the dashboard's existing inline "Following" list rather than
removing it (reasoned in its own report: "Follow requests" needs to live somewhere on the page
regardless, and losing the at-a-glance list would mean an extra click for something visible today) —
a sensible call, left as-is. Confirmed `/settings` compiles as a genuine static 307 redirect, not
just a file that exists.
PM reviewed the full diff directly before merging (not on the implementer's report alone) — found one
real UX defect: the new profile header rendered a static avatar image, and `AvatarUploadForm`
(moved further down the page) rendered its *own* avatar preview + upload control again, so the same
picture showed twice. Fixed directly on the implementer's own branch (small, contained, no
schema/RLS): the header now renders `AvatarUploadForm` itself as the one editable avatar, instead of
a separate static duplicate. Independently reran the full check suite after the fix (tsc/lint clean,
446/446, build clean, route list confirmed `/dashboard/followers`/`/dashboard/following` as new
dynamic routes and `/settings` as the redirect). Committed the docs on `main` first (`ff59ab2`),
merged (`--no-ff`), reran the full suite a second time on merged `main` (clean) before pushing.
**"My Profile" is now built, reviewed, and merged.** Kayvan hands-on confirmed it working ("All looks
good") — removed from Bucket 2.

**Session ended here at Kayvan's request, "prep for next handoff."** Everything above is merged to
`main` and pushed to `origin` (`35a17bc` at close) — `git status`/`git log` confirmed clean, local
matches remote exactly, no worktrees or background agents left running.

**What happened, in order**: opened per procedure, presented current state, Kayvan chose to hands-on
check the follow-requests feature first — which immediately surfaced a real, previously-unflagged RLS
bug (a policy checking "is this row private" by querying a table that hides private rows from anyone
but their owner, so the check could never see what it was checking and silently always failed).
Diagnosed and fixed solo (small, mechanically-verifiable, logged as a Deviation for a second look
rather than independently reviewed), Kayvan confirmed the whole follow-request checklist working
after. With usage still low, Kayvan asked to keep building: the account page (the first time this app
has ever exposed one user's real ranking data — not just identity — to another; PM wrote the RLS/
schema directly given the day's earlier lesson, implementer built the app layer, independent reviewer
gave the new policies the most scrutiny of anything this session, PM re-verified before merging).
Kayvan's hands-on test of that found a real bug in a *different*, pre-existing feature (All Stars
Mode silently auto-placing a user's first Top Episode before they'd ever engaged) — correctly
identified as a legitimate reversal of an old, deliberate design call, not a new regression, and fixed
directly. Then, at Kayvan's specific choice, community rank (an aggregate needing zero new RLS at all,
since it fully reuses the account page's own "public owner" policy from earlier the same session) —
implementer + PM review, formula hand-verified against `score.ts` twice independently. Then a real
information-architecture change: merging `/dashboard` and `/settings` into one "My Profile" page plus
two new followers/following list pages — Kayvan asked clarifying questions to be answered first
(deferred "add an email" as its own future task given its real Auth-mutation complexity; kept show
search as a plain link rather than going inline), grounded in a full read of both existing pages
before dispatching, and PM caught a real UX bug (a duplicate avatar) in review before merging. Ended
with a full backlog inventory at Kayvan's request, surfacing two ideas (Personal Stats & Recap,
Achievements & Streaks) that had a full design in `AppSpec.md` but had never actually been promoted
into a tracked `STATUS.md` Bucket 4 line — and one real doc inconsistency (Bucket 4 item 23, "accepted
followers should see more," which the account page had already resolved without the doc being
updated to say so).

**What's actually left, concretely**: two real open items in Bucket 2 — item 17's carried-forward
unconfirmed pieces (avatar upload validation, the collections placeholder — now living on `/dashboard`
after the page merge, not `/settings`) and, more importantly, **whether the `has_started` migration
(`20260723020000_all_star_has_started.sql`) actually got applied to live Supabase** — this was never
explicitly confirmed; the conversation moved on to community rank before circling back. Check this
specifically before assuming it's live. Two Deviations Awaiting Review from earlier remain open (the
solo follow-request RLS fix, and the long-standing intermittent worktree-isolation bug — this session
added one more data point to the latter: an implementer's own tool calls landed on the wrong path by
mistake, self-caught via `git status` and self-corrected, a genuinely different failure mode from
every previously-logged harness-level variant). No next build decision has been made — Bucket 4 has a
full, freshly-inventoried backlog (Import, episode tagging, Personal Stats & Recap, Achievements &
Streaks, the remaining Tier B phases — Discover/taste similarity/collections — plus several small
hardening items) to pick from whenever picked back up.

## Punch List (ranked — read this section first for "what's actually next")

Every open item gets triaged into exactly one bucket the moment it surfaces, per
[ProcessAndRoles.md](ProcessAndRoles.md#punch-list-triage). Default is "log it, don't chase it"
unless it's small or genuinely blocking.

**Bucket 1 — Blocking / next in sequence:**
(empty as of session close, 2026-07-23. Everything built this session — the follow-request RLS fix,
the account page, the All Stars "has_started" fix, community rank, and the "My Profile" page merge —
is fully built and merged; see History for the full account of each. Bucket 2 below has two
genuinely open items — see item 17's carried-forward unconfirmed pieces and the un-asked-about
`has_started` migration specifically. No next build decision has been made — see this file's own
session-close entry in History for what's actually left to pick from.)

**"Tier A" — a small batch pulled from an external design review, decided 2026-07-17, now the
front of the queue** (see `AppSpec.md`'s "External Design Review — Triage" and
`DevelopmentPlan.md`'s Discussion section for the full reasoning behind each):

1. ~~**Ranking confidence**~~ ("your Breaking Bad rankings are 87% stable") — the strongest idea
   from the review. **Base score + display built and merged 2026-07-18** (see History; Kayvan
   hands-on confirmed it working) — `website/src/lib/ranking/confidence.ts`, wired into
   `getShowRankingDisplay`, rendered on the show page. Concrete v1 formula was already written up in
   `DevelopmentPlan.md` (decisive-comparison count relative to `log2(showEpisodeCount)`, no schema
   changes needed) — it also documents a known v1 limitation (doesn't yet detect tie-break-fallback
   placements) that's deliberately not being solved.
   **Smart comparison selection (the remaining scope) — declined 2026-07-18, not built.** This was
   Kayvan's single most-wanted idea across both design reviews, but neither design doc had ever
   pinned down an actual mechanism, only the goal — walking through it live surfaced that the
   current binary-insertion placement already asks the maximally-informative question for placing a
   *new* episode, so "confidently separating #4 and #5" can really only mean directly re-comparing
   two *already-ranked* adjacent episodes to test a relationship that today is only ever inferred
   transitively, never confirmed head-to-head. That's a genuinely new comparison type, and it opens a
   real unresolved question — what happens if a direct re-comparison *contradicts* the existing
   order? (Swap the two? Something bigger?) Presented with a phased split (a safe read-only "weakest
   boundary" callout first, an interactive re-comparison second, once the contradiction rule is
   decided) — Kayvan chose to drop the idea entirely rather than resolve that open question right
   now. See `Docs/AppSpec.md`'s "Second Design Review — Triage" (the item's original "Decided:
   build" entry, now updated) and `Docs/DevelopmentPlan.md`'s Discussion section for the full
   reasoning. **Not a permanent rejection** — explicitly left open to revisit later, unlike the
   Elo/Glicko-class Tier C declines.
2. ~~**Statistics view + alternate visualizations**~~ of a show's existing rankings — **all pieces
   now built and merged 2026-07-18**, now in Bucket 2 for hands-on check. Tier lists are confirmed
   **auto-generated only** — no manual user editing/override, decided 2026-07-18. New route
   `/shows/[showId]/stats` (linked from the show page), built in two dispatches:
   - **First slice** (`8f5e183`): (a) an auto-generated tier list — S/A/B/C/D by rank-position
     quintile, not absolute score (absolute `scoreForPosition` scores compress for small shows, so
     tiering by rank position instead keeps a top/bottom tier populated regardless of show size —
     see `website/src/lib/ranking/stats.ts`'s `assignTiers`); (b) a season-quality heatmap (average
     score per season, colored via the `dataviz` skill's documented sequential ramp, normalized to
     each show's own season-average range rather than the absolute 1-10 domain, numeric average
     always shown as text too, never color-only); (c) the gatekeeper-episode stat (biggest score gap
     between two *adjacent* ranked positions).
   - **Second slice** (`ace73fc`, built in parallel with Tier A item 10 — confirmed no file overlap
     first): (d) a win/loss matrix — every ranked episode against every other, showing only *direct*
     recorded comparisons (a blank cell means the pair's order is only known transitively, never
     tested head-to-head), scrollable with sticky row/column headers, win/loss/tie shown via the
     `dataviz` skill's fixed status colors *plus* a literal W/L/T letter (never color-only); (e) a
     "comparison history" list — **deliberately shipped as a flat per-episode list, not an actual
     node-link graph**, despite `AppSpec.md`'s original "comparison/relationship graph" wording: a
     real graph-layout visualization would mean a new dependency for a single-user app, which cuts
     against this project's documented anti-over-engineering posture (`Docs/CriticalReview.md`'s top
     finding) — the underlying data is identical either way, only the rendering differs; (f) a season
     timeline — plain inline SVG (no charting library), one point per ranked episode, x-axis
     chronological (`air_date` when present, season/episode order as a documented fallback for
     pre-migration episodes missing it).
3. ~~**Richer comparison screen**~~ — **built and merged 2026-07-18** (`f763f5f`), now in Bucket 2
   for the migration + hands-on check. Two-column layout: the
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
5. ~~**Per-show progress bar on the dashboard**~~ — **built and merged 2026-07-18** (`634b9d2`), now
   in Bucket 2 for hands-on check. Each show in "My Shows" gets a visual progress bar (thin filled
   track) plus `{percent}% ({rankedCount}/{total})` text, right on the dashboard list itself — design
   confirmed with Kayvan first (visual bar, not text-only or a compact fraction), reusing the exact
   same `getShowRankingDisplay` data and ranked/total convention as the show page's own progress
   line, so the two can never disagree.
6. ~~**"Date ranked" next to each episode's name on the show page**~~ — **built and merged
   2026-07-18** (`92d1bb5`), now in Bucket 2 for hands-on check. `getShowRankingDisplay` threads
   `episode_rankings.created_at` through for both ranked and cold-start-pending episodes; show page
   renders "Ranked Jul 15" next to the title.
7. ~~**Show each episode's numeric rank position next to its score**~~ — **built and merged
   2026-07-18** (`92d1bb5`), now in Bucket 2 for hands-on check. Renders as "8.7 (#3)" on
   `/shows/[showId]`. Deliberately **not** added to `/shows/[showId]/rankings` — that page already
   shows the same value via its `{index + 1}.` ordinal list prefix, so the field would be pure
   duplication there.
8. **Episode pages** — added 2026-07-18 from the second design review (see `AppSpec.md`'s "Second
   Design Review — Triage" for the full breakdown). Build in the cheap-first order the triage laid
   out:
   (a) ~~title/season-episode/air-date/synopsis/episode-still~~ — **built and merged 2026-07-18**
   (`7bfab1c`), now in Bucket 2 for the migration + hands-on check. New route
   `/shows/[showId]/episodes/[episodeId]` (design confirmed with Kayvan first: episode title on the
   show page becomes the link into it; the hero image falls back to the season poster when TMDB has
   no episode-specific still). Needed two new TMDB fields that turned out not to exist at all yet
   (`still_path`/`air_date` on `TmdbSeasonEpisode` — see the 2026-07-18 correction above this list
   used to have, now folded in: this was **not** a "just persist what we already fetch" change like
   `overview`/`synopsis` was) plus one new migration (`episodes.still_url`/`episodes.air_date`,
   same nullable/no-backfill/re-import-backfills-it pattern as before) that Kayvan needs to apply to
   live Supabase directly, same as `episodes.synopsis` before it.
   (b) ~~the season finale flag~~ — **built and merged 2026-07-18** (`6d0a7e0`), now in Bucket 2 for
   the migration + hands-on check. Added TMDB's `status` field (`TmdbShowDetails`/`ShowDetails`, plus
   a new `shows.status` migration Kayvan needs to apply to live Supabase, same pattern as before) and
   a pure, unit-tested `isSeasonFinale` (`website/src/lib/shows/seasonFinale.ts`) implementing the
   triage doc's exact rule; renders as a "Season finale" badge on the episode page.
   (c) ~~a personal win/loss record per episode~~ — **built and merged 2026-07-18** (`6d0a7e0`, same
   dispatch as (b)), now in Bucket 2 for hands-on check. New `getEpisodeComparisonRecord` in
   `@/lib/ranking-session`, a free read over the existing `episode_comparisons` table (no schema
   change); renders as "N wins, N losses, N ties" on the episode page, omitted when all-zero.
   (d) ~~director/writer/cast~~ — **built and merged 2026-07-18** (`1b396be`), now in Bucket 2 for
   hands-on check. Genuinely new per-episode TMDB credits call — item 3 (the richer comparison
   screen) was originally going to piggyback on this same call but shipped without it, so this ended
   up standalone, not shared work. Fetched **live, server-side, on every page view** — no new
   database column, no caching/persistence — via `tmdbFetch` directly from the page (a Server
   Component, so no new API route needed either); fails open (any TMDB error just means no credits
   section renders) matching `ensureShowSynced`'s existing convention elsewhere in this app. Renders
   as "Directed by …" / "Written by …" / "Starring …" lines, each only when non-empty.
   Also added, same 2026-07-18 session as (b)/(c) at Kayvan's request (not from the original
   triage): a rank/re-rank button directly on the episode detail page, mirroring the show page's
   existing per-episode status handling (score+`ReRankButton` if ranked, cold-start bucket label if
   pending, a "Rank this episode" link if untouched) rather than inventing new UI.
   IMDb/RT/Metacritic links and streaming availability are optional later phases, not v1. Average
   community ranking and rating distribution are explicitly out of scope until Tier B (the social
   layer) exists. **All of item 8's sub-items are now built.**
9. ~~**Per-season "completed" badge on the show page**~~ — **built and merged 2026-07-18**
   (`af173f1`), now in Bucket 2 for hands-on check. A "Complete" badge (same styling as the
   cold-start bucket labels) next to a season's heading on `/shows/[showId]` whenever every episode
   in it has a score or a cold-start bucket.
10. ~~**Clickable episode titles on the comparison screen, with a way back into the ranking
    flow**~~ — **built and merged 2026-07-18** (`6f420d2`, built in parallel with item 2's second
    slice — confirmed no file overlap first), now in Bucket 2 for hands-on check. Episode titles on
    both the comparison screen (`ComparisonPrompt`) and the cold-start/already-ranked screen
    (`EpisodeColumn`) now link to `/shows/[showId]/episodes/[episodeId]?returnToRank={subjectId}` —
    always the *subject* episode's id (the one actually being placed), even on the comparison
    screen's reference-side link, since the reference has no pending step of its own. The episode
    detail page reads that query param and shows a "↩ Return to ranking" link back to
    `/shows/[showId]/rank/[returnToRank]`, which recomputes "what's next" fresh on every visit
    (`getNextStepForEpisode` is idempotent) — no new state needed anywhere. `ColdStartPicker` itself
    renders no episode title, confirmed nothing needed changing there.
11. ~~**Show an episode's own still image instead of the season poster on the ranking screens**~~ —
    **built and merged 2026-07-18** (`af173f1`, same dispatch as item 9), now in Bucket 2 for
    hands-on check. Both the comparison screen (`ComparisonPrompt`'s `PosterButton`) and cold-start's
    `SeasonPoster` (in `rank/[episodeId]/page.tsx`) now render `still_url ?? season_poster_url`,
    same fallback convention the episode detail page already established. Confirmed via grep that
    no other `season_poster_url` usage in the ranking flow was missed.

Dark mode + per-show accent theming (also proposed in the same review) is **deliberately not in
this queue** — reconfirmed 2026-07-17 that it stays bundled with the rest of the visual-design pass
in Bucket 4, rather than being done piecemeal now.

**Bucket 2 — Bugs/features needing hands-on verification or fixing:**
1. ~~**All Stars Mode / "Top Episodes," built and merged 2026-07-19 (`711b0ff`), plus the button-label/
   disappearing-list/multi-stale-ordering bug fixes, built and merged 2026-07-19/2026-07-22**~~ —
   **hands-on confirmed working 2026-07-22** (both migrations applied to live Supabase, including
   `20260721000000_all_star_progress.sql`). Removed from Bucket 2.
2. ~~**URL-length crash fix, built and merged 2026-07-19 (`0ccf337`), independent-reviewer-verified.**~~
   Kayvan applied the new migration (`20260719000000_delete_show_ranking_data.sql`) to live Supabase,
   then **hands-on confirmed 2026-07-19**: the show that was crashing now loads its rank flow
   normally, and removing a large show (the other silently-broken path) also works. Removed from
   Bucket 2.
3. ~~**"Rank Season," built and merged 2026-07-19 (`0ccf337`)**~~ — **hands-on confirmed 2026-07-19**:
   the season button works as designed, and whole-show "Rank all" still behaves exactly as before.
   Removed from Bucket 2.
4. ~~**"Rank all" mode, built and merged 2026-07-18 (`63cc4ba`)**~~ — **hands-on confirmed working on
   live Vercel, same session.** Kayvan then asked for the entry button to be made more prominent —
   restyled as a bordered button (blue, matching "Remove show"'s style) stacked underneath it, built
   and merged (`3826b16`), also hands-on confirmed. Removed from Bucket 2.
   ~~**Known gap**~~: clicking an episode title mid-rank-all-session and then clicking "↩ Return to
   ranking" on the episode detail page used to drop out of rank-all mode silently —
   **fixed and merged 2026-07-18 (`b5db845`)**, `mode=rankAll` now carried through that whole
   round-trip. Not yet hands-on checked, folded into item 4 below.
5. ~~**Season filter + episode search on the show page, built and merged 2026-07-18
   (`41468bb`)**~~ — **hands-on confirmed working on live Vercel, same session.** Removed from
   Bucket 2.
6. ~~**Show page header mobile overlap fix, built and merged 2026-07-18 (`376d705`)**~~ — **hands-on
   confirmed working on a real phone, same session** (long title no longer overlaps "Remove show"/
   "Rank all"; desktop layout unchanged). Removed from Bucket 2.
7. ~~**Three small builds, merged 2026-07-18 (`b5db845`)**~~ — **hands-on confirmed working on live
   Vercel, 2026-07-19**: (a) rank-all mode, click a title mid-session, "↩ Return to ranking" lands
   back on the same question, auto-advance intact; (b) stale resubmission (browser-back
   double-submit) shows "This episode was already ranked — nothing changed." instead of a silent
   redirect; (c) season-rank `#N` badges match actual season average scores. Removed from Bucket 2.
   Kayvan flagged (b)'s notice should be **more visually prominent** than it is today — logged as a
   new Bucket 4 backlog item rather than fixed now.
8. ~~**Dashboard #1-episode display, built and merged 2026-07-18 (`2a3c78a`)**~~ — **hands-on
   confirmed working on live Vercel, 2026-07-19.** Removed from Bucket 2.
9. ~~**Sentry error monitoring**~~ — **fully done, 2026-07-18.** Kayvan created a Sentry project and
   set `NEXT_PUBLIC_SENTRY_DSN` locally and on Vercel. First verification attempt surfaced a real bug
   (see History for the full investigation): `onRequestError`'s flush never actually completed on
   Vercel's Node.js runtime (`@sentry/core`'s `vercelWaitUntil` only works on Edge runtime), so
   events either never arrived or arrived minutes late. Fixed in `website/src/instrumentation.ts` —
   `onRequestError` now explicitly `await`s `Sentry.flush(2000)` instead of relying on the SDK's
   broken auto-detection. Re-verified with a second test throw: confirmed prompt delivery this time.
   Temporary test throw reverted (`e865c96`), sign-out restored. Removed from Bucket 2 — nothing left
   to do here.
10. **Throttled TMDB re-sync, built 2026-07-18, not yet hands-on checked** — see History for the full
   design. Can't be meaningfully verified by just clicking around today (the 24h throttle means a
   freshly-imported show won't actually re-sync for a day), so the real check is patient rather than
   immediate: next time a tracked show is known to have a new episode/season on TMDB, confirm it
   actually shows up on `/shows/[showId]` or the dashboard without re-adding the show. In the
   meantime, worth at least confirming the migration applied cleanly to the live Supabase project
   (check the `shows` table has a populated `last_synced_at` column) and that a show page still loads
   normally post-push (the added `ensureShowSynced` call is fail-open, so even a broken TMDB call
   shouldn't break the page — but confirm that's actually true live, not just in tests).
11. **A big 2026-07-17 hands-on round confirmed nearly everything works** — see History for the full
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
12. ~~**Popular shows browse view + genre filter on `/shows/search`, built and merged 2026-07-18
   (`9c9df76`)**~~ — **hands-on confirmed working on live Vercel, 2026-07-19** (empty-query browse
   grid, genre filter, fallback to normal search on typing, Add/Rank buttons all behave correctly).
   Removed from Bucket 2.
13. ~~**Stale-resubmission notice, made visually prominent — built and merged 2026-07-19
   (`db11e0d`)**~~ — **hands-on confirmed 2026-07-19.** Removed from Bucket 2.
14. ~~**Username+password signup, built, independently reviewed (one real security bug found and fixed
   pre-merge), and merged 2026-07-22 (`9807722`)**~~ — **hands-on confirmed 2026-07-22** (migration
   applied, new signup/login/forgot-password flows all working). Removed from Bucket 2.
15. ~~**Tier B Phase 1 (profile settings, public profiles, following), built, independently reviewed,
   and merged 2026-07-22 (`db69dc7`)**~~ — **hands-on confirmed 2026-07-22**: visibility toggle,
   public-profile Follow/Unfollow, and follower counts all work. Two real issues surfaced during this
   check, both since built, reviewed, and merged — see History: (a) `/settings` erroring for
   Kayvan's original email-based account, fixed by the "claim a username later" build (`7a2fdf6`) —
   **not yet independently hands-on re-confirmed**; (b) the "removed as a follower when the target
   goes private" bug, fixed as part of the follow-requests build (`9235133`) — see item 16.
16. ~~**Follow requests + private-profile identity, built, independently reviewed, and merged
   2026-07-22 (`9235133`)**~~ — migration applied 2026-07-23; first hands-on attempt (sending a
   request) failed, which surfaced and led to fixing a real RLS bug in the migration itself (see
   History and Deviations Awaiting Review, both 2026-07-23) via a follow-up migration
   (`20260723000000_fix_follow_request_visibility_check.sql`). After applying that fix, **Kayvan
   hands-on confirmed the full checklist working**: legacy-account username claim from `/settings`,
   a private profile showing identity (not 404) via direct `/u/[username]` link, sending a follow
   request, Accept and Deny both working, the accepted requester showing "Following" afterward, and an
   existing follower correctly staying visible in "Following" after the target goes private. Removed
   from Bucket 2.
17. **Account page, built, independently reviewed, and merged 2026-07-23 (`48b1677`, `4d59e1e`)** —
   migration applied 2026-07-23; hands-on confirmed with a real second (4-show) account: "Rank Top
   Episodes" works and updates correctly on a #1 change (with the right prompt), and — the real point
   of the feature — both a public profile and a private-but-followed profile correctly show
   avatar/username/follower-following counts/shows-with-#1/top-episodes to another user. **Still
   genuinely open, not yet confirmed** (carried forward across several since-completed session
   detours — verify these are still accurate, don't assume): avatar upload's file-type/size rejection
   (control now lives on `/dashboard`'s "My Profile" header, not `/settings` — see the 2026-07-23
   page-merge entry) and the "No collections yet." placeholder rendering correctly.
   One real issue found (a pre-existing All Stars Mode behavior this build's fresh testing surfaced,
   not a new bug — see History) — **fixed same session** (`20260723020000_all_star_has_started.sql`)
   — **Kayvan was never explicitly asked to confirm this migration got applied to live Supabase**
   (the conversation moved on to community rank before circling back) — check this specifically next
   session before assuming it's live: apply it if not already applied, then confirm a **brand new**
   eligible user's Top Episodes section stays genuinely empty until "Rank Top Episodes" is actually
   clicked.
18. ~~**Community rank, built and merged 2026-07-23 (`85d59e1`, `02007a1`)**~~ — migration applied
   cleanly (the never-run-against-real-Postgres caveat didn't bite), **hands-on confirmed working**.
   Removed from Bucket 2.
19. ~~**"My Profile" (the `/dashboard` + `/settings` merge), built, PM-reviewed, and merged
   2026-07-23**~~ — **hands-on confirmed working** (Kayvan: "All looks good"). Removed from Bucket 2.

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
4. ~~**Error monitoring**~~ — **built and merged 2026-07-18** (`1a37f88`), now in Bucket 2 pending
   Kayvan creating a real Sentry project. `@sentry/nextjs`, free tier, errors only (`tracesSampleRate:
   0`, no session replay) — server (`sentry.server.config.ts`), edge (`sentry.edge.config.ts`, not
   load-bearing today since nothing in this app opts into the Edge runtime, but kept as a no-cost
   safety net), and client (`instrumentation-client.ts`) all wired via Next.js's native
   `instrumentation.ts`/`onRequestError` hooks — deliberately not via `withSentryConfig` in
   `next.config.ts`, since that needs a Sentry auth token/org/project Kayvan doesn't have yet and
   this app doesn't need source-map upload for basic error capture. This app had zero error
   boundaries before this — added a root `global-error.tsx` (required by Next.js's file-convention
   rules once any error boundary exists) that reports client-side rendering errors via
   `Sentry.captureException`. One new env var, `NEXT_PUBLIC_SENTRY_DSN` (not a secret — Sentry's own
   docs confirm a DSN can only submit events, never read them) — safe to leave unset (a documented
   no-op, confirmed by testing the full build/test suite with it unset, matching the real current
   `.env.local` state). **Needs Kayvan to create a free Sentry project and set this env var** (see
   the next chat message for exact steps) before any errors actually get reported.
5. **Visual design** — still zero design polish, bare Tailwind defaults throughout. Flagged
   2026-07-16 as a real gap before wider testing, deliberately deferred past piece 2b. **Reconfirmed
   2026-07-18: Kayvan wants this held off until all pages are added**, not started piecemeal now.
   Two concrete ideas captured for whenever this is picked up:
   - **Dashboard show cards**: rather than a binary "highlight fully-done shows green," the card's
     whole background should fill with green proportional to that show's ranking progress percent —
     at 100% ranked, the entire card is green. Kayvan's explicit preference over the simpler binary
     treatment.
   - **Show page episode rows**: color each episode row as a true heatmap by that episode's relative
     score within the show — green highest, red lowest, yellow middle, shaded gradient between —
     mirroring the stats page's existing season-quality heatmap but at per-episode granularity.
   Same session, dispatched a research agent (read-only, no build) to read this project's full doc set
   plus the actual current UI code and produce an exhaustive, categorized list of design-direction
   questions for Kayvan to answer before this gets scoped — see chat for the resulting list once it
   lands. Not scheduled; this backlog item stays open until that Q&A happens and a real design pass is
   deliberately picked up.
6. ~~Small-show exact score precision~~ — **superseded 2026-07-17, fix built 2026-07-18**: the
   specific 3-episode all-neutral example (scores 10/8.7/7.4) led to a real, decided fix — see
   `DevelopmentPlan.md`'s Discussion section and History 2026-07-18. That fix substantially shrinks
   this class of issue but
   doesn't fully eliminate it (a genuine pairwise "neutral" comparison still breaks the tie to a
   specific adjacent position, everywhere in the app, not just in cold start) — going further
   (real tied scores) was discussed and explicitly declined as a bigger, not-currently-worthwhile
   change to the core scoring model.
7. **Repeatedly comparing against the same reference episode** — raised 2026-07-17 (with 14
   episodes ranked, comparisons kept landing on the same episode). Confirmed expected, not a bug —
   inherent to binary-insertion search always starting from the current midpoint; should lessen
   naturally as a show grows. A real mitigation (randomizing the pivot) was discussed and declined
   for now given the cost/benefit — see `DevelopmentPlan.md`'s Discussion section, "Open discussion,
   not scheduled." Revisit only if it's still bothering Kayvan once shows have more episodes ranked.
8. **Episode count in TMDB search results** — decided 2026-07-17: not being built. TMDB's
   `/search/tv` doesn't return an episode count (only `/tv/{id}` "show details" does), so showing
   it in live search would mean an extra TMDB call per result on every debounced keystroke search —
   Kayvan chose to keep search fast over having this, given episode count is already visible once a
   show's been added.
9. ~~**A less-silent message on a stale post-back resubmission**~~ — raised 2026-07-17, **built and
   merged 2026-07-18** (`b5db845`, see History and Bucket 2 item 4b): a "This episode was already
   ranked — nothing changed." message now renders instead of a silent redirect, on whichever page
   the stale-resubmission redirect lands on. Removed from Bucket 4.
10. ~~**Season rankings**~~ — **effectively built 2026-07-18** as part of the same-day derived
    season-rank badge (see History and Bucket 2 item 4c): `website/src/lib/ranking/stats.ts`'s new
    `rankSeasons` plus a `#N` badge (tooltip: average score) on each season's heading on the show
    page delivers exactly the "shrunk scope" described below — presenting `seasonAverageScores`'
    derived data sorted/framed as a ranked list of seasons. Original idea (added 2026-07-18 from the
    second design review) was to rank whole seasons head-to-head via a new comparison UI flow;
    Kayvan dropped that mechanism in favor of the derived approach that's now built. Removed from
    Bucket 4 — not a separate dedicated "season rankings" page, just the badge, which was judged
    sufficient (a dedicated page would be pure re-presentation of the same data with no new
    information, and nothing in this feature's original write-up asked for a standalone page
    specifically). Revisit only if Kayvan wants a fuller standalone view later.
11. **Import** (IMDb ratings, Letterboxd-style exports, TV Time, Trakt, streaming watch history) —
    added 2026-07-18, same source. Real third-party integration work, one per service, each with its
    own auth/API shape. Whenever picked up, start with a single service rather than all of them.
12. ~~**Keyboard shortcuts** on the cold-start and comparison screens~~ — **declined 2026-07-18, at
    Kayvan's request.** Was Tier A item 1, moved here 2026-07-18 (a dispatch had been stopped
    mid-task, see Deviations Awaiting Review for what that revealed about the worktree-isolation
    bug), then dropped outright rather than picked back up.
13. ~~**Spoiler mode**~~ — **declined 2026-07-18, at Kayvan's request.** Was a confirmed real,
    currently-unaddressed gap (nothing today prevents seeing a whole show's ranked episode list
    regardless of watch progress) — the gap itself hasn't gone away, but Kayvan chose to drop the
    feature idea rather than keep it queued.
14. **Tier B — the social layer as a whole, confirmed 2026-07-18 as a real queued item ("should be in
    the queue to be worked on as well, although not right now").** Full design already exists and is
    ready to build from whenever it's scheduled — see `AppSpec.md`'s "Tier B Detailed Design — Social
    Layer" (2026-07-17) for the complete schema/pages/flows. Scope: friends/following + comparing
    rankings against people you follow, a "community rank" shown alongside "your rank" on episode
    pages plus a Discover page built on aggregate cross-user data (trending shows, biggest community
    disagreements, hidden gems), a numeric "taste similarity" score between two users, and shareable
    collections (`collections`/`collection_items` tables, `/collections` management page,
    `/c/[shareToken]` public view — this absorbs what was originally Tier A item 4/Collections,
    **moved here 2026-07-18 at Kayvan's request** rather than built as a private-only stopgap, since
    the full shareable version's schema already exists in the same Tier B design and a private-only
    v1 would just need retrofitting later). **One carve-out, already decided**: per-episode
    discussion/comments/polls — originally part of Tier B's design (`episode_comments`) — is
    **declined outright**, not just deferred, per the Second Design Review Triage (moderation burden
    for a solo developer with no moderation tooling; see `AppSpec.md`). Everything else in Tier B
    still stands. This is a genuine identity shift (every table today is strictly private-per-user
    via RLS, zero exceptions) gated behind one deliberate decision — "does this app grow a public/
    social layer at all?" — not something to approve piecemeal. Not scheduled; confirmed real and
    worth keeping visible in this queue, picked up whenever that decision is made.
15. ~~**"All Stars Mode" (name TBD)**~~ — **built and merged 2026-07-19** (`711b0ff`), as "Top
    Episodes." **Reclassified from this item's original write-up** at Kayvan's explicit request
    (2026-07-19): single-player only, not Tier B — no account page, no public/private visibility
    toggle, nothing social. The account-page/`/u/[username]`/Top-4-only pieces originally sketched
    below never got built; the dashboard shows the *full* ranked list instead, with a Top-4-only
    default deferred to whenever the account page and visual redesign actually happen. The two real
    open questions this item was waiting on (the 4-show threshold, and what happens when a show's #1
    changes after the fact) were resolved directly with Kayvan and built as specified: 4+ shows to
    unlock the section, and a **targeted re-rank** (only the changed show's entry is replaced, others
    untouched) **plus a visible notice** naming which show(s) changed, alongside a separate explicit
    "reset from scratch" option — see this file's History (2026-07-19) for the full design and build
    account. Now in Bucket 2 for the migration apply + hands-on check.
16. **Other narrow-viewport candidates spotted during the 2026-07-18 mobile-audit-that-wasn't** — code-
    reading only, none confirmed as actual pain points (unlike Bucket 2 item 3's show-page-header bug,
    which Kayvan explicitly confirmed live): `AppHeader`'s nav bar (title + 3 links in one
    `justify-between` row, no wrap — appears on every authenticated page, so worth a look first if
    anything here ever gets picked up), the show page's episode list rows (`EpisodeListWithFilters.tsx`
    — episode number + title + "Ranked date" vs. score/rank/button, same no-wrap shape as the header bug
    that just got fixed), and the dashboard's "Logged in as {email}" + "Log out" row (same shape again,
    worse with a long real email address). Everything else checked during that pass (the comparison
    screen, the stats page's win/loss matrix and season timeline, the episode detail page, the login
    page) already had some form of responsive handling and looked fine on paper. Deliberately not
    chased — pick up only if one of these turns out to actually bother Kayvan in real use, same
    "confirm the real complaint before scoping a fix" lesson this session just learned.
17. ~~**Pre-populated popular shows on the search page, paired with a genre filter**~~ — added
    2026-07-18, Kayvan's idea, **built and merged 2026-07-18** (`9c9df76`, see History and Bucket 2
    item 9 for the full account). TMDB's `/discover/tv` (`sort_by=popularity.desc`, optional
    `with_genres`) powers both pieces via two new proxy routes (`/api/tmdb/discover`,
    `/api/tmdb/genres`), first page only (~20 results, no pagination for v1). The genre filter was
    scoped to apply only to the browse view, never to typed search results (TMDB's `/search/tv` has
    no genre param). Removed from Bucket 4 — now in Bucket 2 for hands-on check.
18. ~~**Tier B: pre-selected episode tags (e.g. "bottle episode," "clip episode")**~~ — **discussion
    resolved and fully designed 2026-07-19**, still not scheduled/built. Reconciled first against an
    existing decision, confirmed genuinely distinct: `AppSpec.md`'s Second Design Review Triage
    declined *centrally curated* tagging for *community* slices ("no scalable, non-manual data
    source"); this is each user self-tagging their *own* episodes from a fixed list, a different
    mechanism that sidesteps that objection. The three open questions this item was waiting on:
    - **Friction on the core ranking flow**: none — tagging lives only on the episode detail page, an
      optional action, never on the cold-start/comparison screens.
    - **Fixed vs. growing tag list**: **fixed for v1**, Kayvan's call — a `check` constraint (not a
      Postgres `enum`, so it can still be altered later without real ceremony) against a starter list
      of 8 (Bottle episode, Clip episode, Crossover episode, Musical episode, Flashback-heavy episode,
      Filler episode, Origin story, Anthology/self-contained episode) — deliberately excludes
      "premiere"/"finale" since the season-finale flag is already auto-detected (Tier A item 8b) and a
      manual duplicate would be confusing.
    - **Worth the UI surface?**: yes, kept small — the resulting "you rank bottle episodes highly"
      stat belongs on the not-yet-scheduled Personal Stats & Recap page (`AppSpec.md`), not a new page
      of its own.
    One more question resolved along the way: whether this needs to be Tier B at all, since it's
    architecturally private-per-user (same RLS posture as `episode_rankings` — no social/public
    infrastructure needed). **Kayvan's call: keep it filed under Tier B** rather than split out as an
    independent Phase 1 item, even though it could technically be built independently of Tier B's own
    go/no-go — full design (new `episode_tags` table, RLS, tag list, UI placement) written into
    `AppSpec.md`'s Tier B Detailed Design section. Also fixed two small pieces of doc drift found
    while editing that section: the "Community rank" flow still described the episode detail page as
    not-yet-built (it was built 2026-07-18, after this section was originally written) and the "New
    pages/routes needed" list still listed it as a route to build.
19. ~~**Stale-resubmission notice isn't prominent enough**~~ — **built and merged 2026-07-19**
    (`db11e0d`). New shared `StaleResubmissionNotice` component (a bordered, blue-tinted box with an
    icon and bold text, `role="status"`) replaces the old plain muted-gray caption in both places it
    appeared (the show page and the rank page); deliberately a third visual tier, distinct from both
    this app's ordinary muted-caption convention and its red `role="alert"` error styling, with color
    backed by an icon + bold weight per this app's "color is never the only signal" rule. Removed
    from Bucket 4 — now in Bucket 2 for hands-on check.
20. ~~**`website/.env.local`'s `NEXT_PUBLIC_SUPABASE_URL` looks wrong**~~ — **confirmed and fixed
    2026-07-19.** The value really was a Supabase **dashboard** link
    (`https://supabase.com/dashboard/project/tlbpzpdsoatkmiwhwskq/settings/general`), not the REST
    API base URL. Verified rather than assumed: edited it to the real URL
    (`https://tlbpzpdsoatkmiwhwskq.supabase.co`), then checked against Kayvan's already-running local
    `npm run dev` server — Next.js auto-reloaded the changed `.env.local` (`Reload env: .env.local` in
    its own dev log), and `/dashboard` then correctly 307-redirected to `/login`, proving a real
    server-side `getUser()` call against Supabase succeeded (this would have thrown a fetch error
    against the old dashboard-link value). Production/Vercel was never affected either way, as
    previously reasoned — this was purely a local-dev-only config file, gitignored, never committed.
    Removed from Bucket 4.
21. **"Rank Random" button — logged 2026-07-22, Kayvan's idea.** A new button underneath "Rank all"
    on the show page, a different color (purple, Kayvan's initial pick) from "Rank all"'s existing
    blue and "Remove show"'s red. Presumably picks a random unranked episode rather than "Rank all"'s
    oldest-first ordering (`orderOldestFirst` in `lib/ranking/rankAllOrder.ts`) — exact behavior (a
    single random pick that returns to the show page after, vs. a full random-order auto-advance
    session like "Rank all" itself) not yet confirmed with Kayvan, flagged here rather than guessed
    at. Not scheduled/built.
22. **`user_profiles` hardening: guard against a future accidental `select('*')` leaking `auth_email`/
    `has_real_email`** — logged 2026-07-22, from Tier B Phase 1's independent review. **Partially
    addressed 2026-07-22, not fully closed.** The follow-requests build added exactly the pattern this
    item asked for — two `SECURITY DEFINER` "safe projection" functions
    (`profile_identity_by_username`/`profile_identities_by_user_ids`) that return only the safe
    columns, never `auth_email`/`has_real_email` — and both new app-layer cross-user reads (the
    `/u/[username]` page, the dashboard's Following/incoming-requests lists) now go through them
    instead of a raw table query. But this only guards the code paths that were touched by that build;
    the underlying gap is unchanged — Postgres RLS is still row-level, not column-level, so a raw
    `select('*')` (or any explicit-but-wrong column list) directly against `user_profiles` from a
    *future* piece of code would still technically be capable of reading those two columns for any
    public or (as of the follow-requests build) any *identifiable* profile. No DB-layer guard (a
    restricted view, a REVOKE on those two columns for the `authenticated` role, etc.) exists yet.
    Worth doing before more Tier B phases add more direct `user_profiles` reads, though the safe-
    projection functions are now the established, preferred pattern to reach for first.
23. ~~**Accepted followers of a private profile should eventually see more** (e.g. that user's actual
    show rankings)~~ — logged 2026-07-22, Kayvan's stated end goal for the follow-requests feature.
    **Resolved 2026-07-23** by the account page: an accepted follower of a private profile now sees
    that user's shows, progress, and top episodes via `/u/[username]` (gated by the same `hasAccess`
    check as the public case) — this is exactly the "per-user rankings view" this item was waiting on.
    Removed from Bucket 4.
24. **No DB-level automated test harness for RLS policies anywhere in this project** — observed
    2026-07-22, by the follow-requests build's independent reviewer. Every RLS-correctness claim in
    every review so far (Tier B Phase 1, the settings INSERT policy, the follow-requests cross-actor
    INSERT policy) has been verified by a reviewer hand-tracing the SQL against real Postgres RLS
    semantics, plus mocked unit tests that simulate a DB rejection/acceptance rather than actually
    exercising it — never an automated test that runs against a real Postgres instance and would catch
    a future regression to an already-reviewed policy. Not a regression from any specific build, and
    not urgent enough to have blocked any merge so far (hand-tracing by an independent reviewer plus
    PM re-verification has caught every real issue found this session) — but worth a real look
    (something like pgTAP, or a local Supabase instance the test suite could spin up against) given how
    much of this app's newest surface now depends on RLS correctness specifically.
25. **`updateAvatar` trusts a caller-supplied avatar URL** — flagged 2026-07-23 by the account page's
    independent reviewer, non-blocking. `settings/actions.ts`'s `updateAvatar` writes any non-empty
    string to the caller's own `avatar_url` without verifying it actually points at an object the
    caller uploaded to their own `avatars` Storage path — a user could point their own avatar at an
    arbitrary external image. Blast radius is self-scoped (own row only) and render-only (a plain
    `<img src>`, React-escaped, no script execution) — not a real vulnerability, just looser than it
    needs to be. If ever tightened: validate the URL is under the app's own `avatars` bucket, prefixed
    with the caller's own `user_id`.
26. **"Add an email" for synthetic-email-only accounts** — deferred 2026-07-23 at Kayvan's explicit
    choice, during the "My Profile" page merge (see History). A real feature, not a stopgap: needs a
    genuine Supabase Auth email-change flow (a new-email form, `supabase.auth.updateUser({ email })`
    triggering Supabase's own confirmation email to the new address, and a new callback route —
    `/auth/confirm` today only handles the `type=signup` case, not `type=email_change` — that confirms
    the change and syncs `user_profiles.auth_email`/`has_real_email` to match). Roughly comparable in
    complexity/risk to the original username+password signup build — deserves its own grounded design
    pass when picked up, not a quick bolt-on. "My Profile" shows "No email on file" with no
    interactive control in the meantime, for any account with `has_real_email: false`.
27. **Personal Stats & Recap page** — confirmed real, fully designed in `AppSpec.md` since
    2026-07-17 (its own "Personal Stats & Recap" section), but never actually promoted into a tracked
    `STATUS.md` Bucket 4 line until now (caught 2026-07-23 while compiling a full backlog inventory
    at Kayvan's request). A live, always-current cross-show recap — total episodes ranked/shows
    started/shows completed, highest-rated episode account-wide, "most contested episode" (highest
    comparison count), a favorite show, a ranking-activity calendar. **No new tables needed at all**
    — every stat is a read over `episode_rankings`/`episode_comparisons`/`user_shows`, already
    timestamped and scoped by existing RLS. One new route, `/stats` or similar.
28. **Achievements & Streaks** — same situation as item 27: confirmed real, fully designed in
    `AppSpec.md` since 2026-07-17, never promoted into a tracked Bucket 4 line until now. Deliberately
    scoped small (no XP/levels/profile unlocks — those depend on Tier B actually having an audience).
    v1 set: first ranking, 10/100/1,000 total comparisons, first show completed, 5 shows completed.
    One new table (`user_achievements`: `user_id`, `achievement_id`, `unlocked_at`) — definitions are
    plain code constants, checked lazily at read time (e.g. on dashboard load), deliberately not
    wired into the ranking-session write path. Streaks ("ranked something every day for N days") need
    no new schema, fully derivable from existing timestamps. New surface: a small section (dashboard
    or its own `/achievements` page) plus a streak indicator.

**Bucket 5 — Rework flagged for a later phase, not being worked now:**
(empty for now)

## Deviations Awaiting Review

Solo judgment calls made mid-session that weren't slept on get logged here and surfaced at the
start of the next session for a second look — even solo, "I decided this at 11pm without thinking
it through" is worth a deliberate re-check, not silent acceptance.

- 2026-07-23: **Fixed a real RLS bug in the follow-requests feature solo, without an independent-
  reviewer pass.** Full diagnosis and fix are in this file's History (2026-07-23 entry) and in
  `supabase/migrations/20260723000000_fix_follow_request_visibility_check.sql`'s own header comment —
  short version: the just-merged `follow_requests` INSERT policy's visibility check queried
  `user_profiles` under the requester's own RLS, which can never see a private target's row, so the
  check was unconditionally false and every follow request was rejected. Fixed with a `SECURITY
  DEFINER` boolean-only helper (`is_profile_private`), mirroring the already-reviewed `follow_counts`
  bypass pattern. Done directly (not dispatched to an implementer + independent reviewer) because the
  fix is small and mechanically verifiable — one function, hand-traced against Postgres RLS semantics,
  same bypass shape as existing reviewed code, no new data exposure (returns only a boolean), no app
  code touched. Still worth a second pair of eyes next session specifically because it's RLS/security
  surface and this project has no automated way to catch a subtly-wrong policy (see Bucket 4 item 24)
  — confirm the reasoning holds and that `is_profile_private` couldn't be used to probe visibility for
  something other than the one gated insert it's meant for.
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
  invalidated, re-ran all checks fresh (199/199). Self-review only.
  **Resolved, same-day fresh-eyes review completed 2026-07-18 (later same session).** All three
  open questions checked out clean, no new issues found: (1) the gate runs before any TMDB call in
  both routes — confirmed by direct code read, by both routes' existing unit tests (which assert
  `expect(fetchSpy).not.toHaveBeenCalled()` when unauthenticated — stronger proof than "returns 401"
  alone), and by a live curl against a running local dev server with no auth cookie (both routes
  returned `401 {"error":"Not signed in."}` instantly); (2) no legitimate caller broke —
  `/api/tmdb/search` has exactly one caller in the whole app (`ShowSearchForm.tsx`), a same-origin
  `fetch()` with no `credentials` override, so the session cookie flows automatically by browser
  default (not independently re-verified via an actual logged-in browser session, since that needs
  real credentials — low residual risk given how standard this mechanism is); (3)
  `/api/tmdb/[showId]/episodes` genuinely has zero callers anywhere in the current app (confirmed by
  grepping all of `website/src`) — it's unused proxy infrastructure today, not a route the 401 gate
  could have broken. This Deviation is now fully closed out.
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
- 2026-07-18: **A strong, clean data point for the recurring `isolation: "worktree"` bug logged
  above** — not a judgment call itself, but worth recording since it directly bears on whether that
  bug is still a live concern. This session ran 10 separate `isolation: "worktree"` implementer/fixer
  dispatches (Rank all mode, its button restyle, season filter/search, the mobile header fix, the
  bundled rank-all-gap/stale-notice/season-badge fix, the dashboard #1-episode display, the
  popular-shows search page, the Sentry test throw, the Sentry flush fix, and the Sentry revert) plus
  one independent-reviewer dispatch (no worktree needed, made no changes). Checked `git worktree list`
  after every single one, per the standing mitigation — **all 10 got real, properly registered,
  correctly isolated worktrees with zero recurrence of either failure mode** (no missing-`.git`
  worktree, no "verified real worktree but edits still land on `main`"). Not proof the bug is fixed —
  this project's own history shows it can go quiet for a stretch and then recur (see the entries
  above, spanning 2026-07-15 through 2026-07-18) — but a genuinely good run worth having on record
  rather than only remembering the bad ones. Keep checking `git worktree list` after every dispatch
  regardless; don't relax that habit based on this one clean session.
- 2026-07-19: **Confirmed this is a real, currently-open upstream Claude Code bug, not something
  specific to this project or its environment.** Kayvan asked to investigate the worktree bug at the
  start of a fresh session. Two research passes, cross-checked against each other rather than trusted
  individually (per this project's own "verify subagent claims before recommending from them" habit):
  a `claude-code-guide` agent's first pass claimed a specific documented fix landed in v2.1.203/v2.1.210
  — those version numbers and changelog details could not be verified and read as fabricated
  (hallucinated specifics dressed up as documentation), so **do not trust that claim**. A direct
  `WebSearch`/`WebFetch` pass against the real `anthropics/claude-code` GitHub repo found the actual
  match: **Issue #76197**, "Agent isolation:'worktree' cwd pin drifts back to main repo mid-run —
  git-mutating commands land in wrong repo" — filed 2026-07-09, still open, no fix or maintainer-
  confirmed workaround as of this check. Its description matches this project's exact symptom: cwd is
  correctly pinned to a real, verified worktree at launch, holds for ordinary tool calls, then silently
  drifts back to the main repo checkout partway through the agent's run, so later
  edits/git-mutating-commands land on `main` instead — not a setup failure, a mid-run drift. The
  reporter hit it on **macOS**, not Windows, which is a useful negative data point: this project had
  been implicitly wondering whether it was Windows/OneDrive-specific (already ruled out for the
  *separate* deletion-failure symptom, see the 2026-07-18 entry above) — this confirms the drift
  variant is cross-platform, a harness-level bug, not an artifact of this machine or repo. Several
  related open issues exist (#42282, #57767, #50109, #40968) describing adjacent worktree-CWD
  reliability problems, suggesting this whole area is a known-weak part of the harness rather than one
  isolated bug. **No fix available from this side** — it's upstream, not something to patch in this
  repo. Practical conclusion: the project's existing mitigation (check `git worktree list` and
  `git status` on `main` after every dispatch, reconcile in place if edits landed on `main` and match
  the agent's reported scope with nothing unrelated mixed in) is already the correct response and
  matches what the GitHub issue's own reporter had to do manually — there isn't a better mitigation
  available today. Worth periodically re-checking issue #76197 for a status change, not worth further
  local investigation.
- 2026-07-19: **A new, milder variant of the same recurring `isolation: "worktree"` bug (see the
  #76197 entry directly above) — worth recording as another data point, not a fresh investigation.**
  Two implementer agents dispatched in parallel this session (the URL-length crash fix and "Rank
  Season") both finished, self-reported success, and both left their actual file changes as
  **uncommitted working-tree edits inside their own worktrees** rather than committing to their own
  branch — in both cases `git log` on the branch showed zero new commits, while `git status --short`
  inside the worktree showed exactly the files each agent's own report claimed to have changed.
  Distinct from every previously-logged variant: `git worktree list` confirmed both worktrees were
  real, separate, and properly registered the *entire* time (unlike the "no worktree at all" variant),
  and `main`'s own working tree stayed completely untouched throughout both dispatches (unlike the
  "verified real worktree, agent still wrote to `main`" variant that's still unexplained) — isolation
  itself worked perfectly here, the agents simply never ran `git commit` on their own real, correctly-
  isolated copies. Caught immediately by the existing standing mitigation (check `git worktree list`
  *and* `git status --short` after every dispatch, not just the first). No harm done and nothing extra
  needed beyond the existing practice: reviewed each diff directly (`git diff` against the file
  changes, since there was no commit to diff against), re-ran the full check suite independently in
  each worktree, then committed both myself on their own branches before merging — exactly the
  "reconcile in place" fallback this file's mitigation already describes, just applied to a worktree's
  own tree instead of `main`'s. Consistent with this bug's overall pattern (documented above as
  intermittent, cross-platform, upstream, no available fix) — logged for the record, not something to
  chase further locally.

## History

(Newest entries at the top. Prune detailed narrative to git-history pointers once a phase's
Deviations are fully cleared and reviewed — see `ProcessAndRoles.md`'s documented convention. This
keeps this file fast to read at the start of every session instead of growing forever.)

- 2026-07-18: Same session, continued, at 71% usage. With the Tier A queue empty, Kayvan asked
  whether any remaining backlog items were small enough to still fit this session. PM assessed the
  full remaining list (mobile/responsive, visual design, season rankings, import, spoiler mode,
  keyboard shortcuts, error monitoring, the Deviations items) and recommended error monitoring,
  keyboard shortcuts, and a fresh-eyes review of the TMDB security fix as genuinely small/bounded,
  while flagging season rankings/import/spoiler mode as comparable in size to episode pages (which
  took most of the session) and not confident they'd fit. Kayvan then made three backlog decisions in
  one message: redesigned season rankings to be *derived* from existing episode rankings (e.g.
  average score) rather than a separate season-vs-season comparison flow — shrinking its real scope
  a lot, since `seasonAverageScores` (built for the stats page's heatmap) already computes nearly
  this; declined keyboard shortcuts outright; declined spoiler mode outright. All three logged with
  reasoning in both `STATUS.md` and `AppSpec.md`. Picked error monitoring to build with the rest of
  the session.
  Built and merged via one implementer agent (worktree) — infrastructure wiring, not app logic, but
  touches build configuration (a new native Next.js hook file, `instrumentation.ts`) so reviewed with
  extra care despite not being correctness-critical to the ranking algorithm/auth/persistence
  (`1a37f88`). This app's own `AGENTS.md` warns this Next.js version (16.2.10) has real API
  differences from common knowledge; the implementer confirmed this mattered here — this version
  uses a newer `instrumentation-client.ts` file convention (not the classic `sentry.client.config.ts`
  pattern many guides show) and Proxy defaults to the Node.js runtime rather than Edge, which changes
  which Sentry config file actually covers `src/proxy.ts`. `@sentry/nextjs` installed and wired
  manually (not via the `npx @sentry/wizard` scaffolding tool, which can rewrite `next.config.ts` in
  ways that are hard to fully audit) across server/edge/client configs plus a new root
  `global-error.tsx` (this app had zero error boundaries before), all kept to free-tier basics
  (`tracesSampleRate: 0`, no session replay). One new env var, `NEXT_PUBLIC_SENTRY_DSN` — confirmed
  safe to leave unset (a documented Sentry no-op) by actually running the full build/test suite with
  it unset, matching the real current `.env.local` state, not just asserting it. PM reviewed every
  new file directly, merged, then hit one real gap the implementer's own worktree-scoped verification
  couldn't catch: `npx tsc --noEmit` failed on `main` immediately after merging with "Cannot find
  module '@sentry/nextjs'" — the new dependency was added to `package.json`/`package-lock.json` but
  the main working directory's own `node_modules` (separate from the now-deleted worktree's) had
  never had `npm install` run in it; a one-line `npm install` fixed it, re-verified clean afterward.
  Also surfaced two pre-existing moderate-severity `npm audit` findings in Next.js's own bundled
  `postcss` dependency, unrelated to this change (fixing them would mean downgrading Next.js itself)
  — noted, not chased, out of scope for this task. Final state: 265/265 tests (unchanged), clean
  typecheck/lint/build. Pushed. **Needs Kayvan to create a free Sentry project and set
  `NEXT_PUBLIC_SENTRY_DSN` (locally and on Vercel) before anything actually gets reported** — see
  Bucket 2.
- 2026-07-18: Same session, continued, at 33% session usage. Kayvan asked to build three Tier A
  items together: item 9 (season-completed badge), item 11 (episode stills on ranking screens), and
  item 2 (stats/visualizations), leaving the implementation approach up to the PM. Ran two sequential
  dispatches rather than parallel ones, since both would touch `shows/[showId]/page.tsx` and running
  them concurrently risked a merge conflict:
  - **Items 9 + 11 bundled** (`af173f1`) — both small, no schema change. Item 9: a "Complete" badge
    next to a season's heading on the show page whenever every episode in it has a score or
    cold-start bucket (same badge styling already used elsewhere). Item 11: comparison screen
    (`ComparisonPrompt`'s `PosterButton`) and cold-start (`SeasonPoster`) now render `still_url ??
    season_poster_url` instead of `season_poster_url` alone — grepped the codebase first to confirm
    no other `season_poster_url` usage in the ranking flow was missed. PM reviewed the full diff,
    verified worktree isolation held, re-ran tests/typecheck/lint/build fresh on `main`: 239/239
    tests (unchanged — both are display-only changes to already-untested surfaces), clean across the
    board. Pushed.
  - **Item 2, scoped down to a first slice** (`8f5e183`) — the full item 2 backlog (tier list,
    heatmap, gatekeeper stat, win/loss matrix, season timeline, comparison graph) was deliberately
    not all attempted in one dispatch; PM chose to build the three cheapest/most well-defined pieces
    now (tier list, season-quality heatmap, gatekeeper stat) and explicitly defer the win/loss matrix
    and comparison/relationship graph, both more UI-complex and better served by their own design
    pass later. New pure, unit-tested functions in `website/src/lib/ranking/stats.ts`
    (`assignTiers` — quintile-based by rank *position*, not absolute score, since
    `scoreForPosition`'s absolute range compresses for small shows; `seasonAverageScores`;
    `findGatekeeperGap`, 13 new tests) and a new route `/shows/[showId]/stats` (linked from the show
    page). The implementer loaded the `dataviz` skill before writing the heatmap's color code, per
    that skill's own trigger condition — used its documented sequential ramp (verbatim palette hex
    values, not invented), applied its light/dark "flips anchor" rule, normalized color relative to
    each show's own season-average range (not the absolute 1-10 domain, for the same small-show-
    compression reason driving the tier-list design), and picked per-cell text color by WCAG
    contrast (the skill's documented exception for labels inside a colored fill) while always
    showing the numeric average as text regardless of color. PM reviewed the full diff directly
    (the quintile math, the season-average/gatekeeper logic, and the color/contrast helpers all
    checked by hand), verified worktree isolation held, re-ran tests/typecheck/lint/build fresh on
    `main`: 252/252 tests (13 new), clean typecheck, clean lint, clean build (new route confirmed).
    Pushed.
  Both dispatches now in Bucket 2 for hands-on check. Item 2's win/loss matrix, comparison graph, and
  season timeline remain unbuilt, next up whenever item 2 is picked back up.
- 2026-07-18: Same session, continued. Kayvan chose to decline Tier A item 1's remaining scope
  (smart comparison selection) after a design conversation surfaced it was never actually specified
  at the mechanism level — logged as declined-but-revisitable (see the earlier entry above and the
  Punch List's item 1). Moved Collections (item 4) to Tier B at Kayvan's request, since its full
  (shareable) design already exists there. Asked to build items 10 and item 2's remaining pieces
  together; dispatched both in parallel via two implementer agents (worktree), having first confirmed
  they touch disjoint files (item 10: the rank flow + episode detail page; item 2: the stats page +
  `stats.ts`):
  - **Item 10** (`6f420d2`) — episode titles during the ranking flow (`ComparisonPrompt`'s subject
    and reference columns, `page.tsx`'s `EpisodeColumn`) became links to
    `/shows/[showId]/episodes/[episodeId]?returnToRank={subjectId}` — always the *subject* episode's
    id, even on the reference side's link, since only the subject has a pending step. The episode
    detail page gained a `searchParams` prop (following `login/page.tsx`'s exact existing pattern)
    and renders a "↩ Return to ranking" link back to `/shows/[showId]/rank/[returnToRank]` when
    present, with no validation needed since that route already handles a stale/invalid id
    gracefully on its own. `ColdStartPicker` confirmed to render no title, nothing to change there.
  - **Item 2's remaining pieces** (`ace73fc`) — three new pure, unit-tested functions in
    `website/src/lib/ranking/stats.ts`: `buildComparisonMatrix` (N×N grid of *direct* recorded
    comparisons only — deliberately doesn't infer transitive results), `comparisonHistoryByEpisode`
    (per-episode opponent list derived from the matrix), and `buildSeasonTimelineOrder`
    (`air_date`-primary chronological sort with a documented season/episode fallback for episodes
    missing it). Wired into the stats page as three new sections: a scrollable win/loss matrix with
    sticky row/column headers (win/loss/tie shown via the `dataviz` skill's fixed status colors
    *plus* a literal W/L/T letter, never color-only); a "comparison history" list — **deliberately
    shipped as a flat list, not the node-link graph `AppSpec.md` originally described**, to avoid a
    new graph-layout dependency for a single-user app (documented in the function's own doc comment,
    same underlying data either way); and a season timeline as plain inline SVG (no charting
    library), gated to shows with 2+ ranked episodes to sidestep a divide-by-zero in the single-point
    case.
  PM reviewed both diffs in full before merging either (the matrix's win/loss/transpose logic, the
  timeline's chronological-sort fallback, and the SVG chart's rendering math all checked by hand).
  Item 10 merged first (fast-forward, `6f420d2`); item 2's dispatch had branched before that merge,
  so its own merge used `--no-ff` once it landed (no conflicts — confirmed disjoint files held).
  Verified worktree isolation held for both, re-ran tests/typecheck/lint/build fresh on `main` after
  each merge: 252/252 then 265/265 tests (13 new), clean typecheck/lint/build throughout, new routes
  confirmed compiling. Both pushed. **All of Tier A items 2, 9, 10, 11 are now built** — queued
  together in Bucket 2 for one combined hands-on check.
- 2026-07-18: Same session, continued. Kayvan hands-on confirmed the whole combined batch working
  properly (clickable ranking-flow titles + return-to-ranking, the win/loss matrix, comparison
  history list, and season timeline) — removed from Bucket 2. **This closes out Tier A entirely** —
  every item from both the first (2026-07-17) and second (2026-07-18) design reviews is now either
  built, declined-but-revisitable (item 1), or moved to Tier B (item 4/Collections). Next session has
  no obvious "next Tier A item" waiting — picking a fresh priority (Bucket 4 backlog, Tier B, or the
  still-unreviewed Deviations Awaiting Review) is itself the next decision to make.
- 2026-07-18: Same session, continued. Kayvan asked to pick up Tier A item 1's remaining scope
  (smart comparison selection) next. Before writing anything, PM flagged that neither `AppSpec.md`
  nor `DevelopmentPlan.md` had ever specified a real mechanism for it, only the goal — walked Kayvan
  through how binary-insertion placement actually works and why "confidently separating #4 and #5"
  can only concretely mean directly re-comparing two already-ranked adjacent episodes (a genuinely
  new comparison type, since their order today is only ever inferred transitively), which raises an
  unresolved question (what happens on a contradictory answer?). Offered a phased split to de-risk
  it (read-only callout first, interactive re-comparison second). Kayvan asked instead to just drop
  it, and asked directly whether there were serious drawbacks to doing so — answered no (nothing
  regresses, nothing else in the queue depends on it, the existing confidence score already covers
  the related need it partially addressed, and it was the least-specified item in the whole queue
  anyway), and logged it as **declined, not built, explicitly open to revisiting later** (a
  different class of decline than the Elo/Glicko-style permanent Tier C rejections) — updated
  `Docs/STATUS.md` (this file, Tier A item 1), `Docs/AppSpec.md`'s "Second Design Review — Triage",
  and `Docs/DevelopmentPlan.md`'s Discussion section, all with the same reasoning rather than
  silently deleting the prior discussion.
- 2026-07-18: Same session, continued. Kayvan hands-on confirmed all three (season-completed badge,
  episode stills on ranking screens, and the new stats page — tier list, season heatmap, gatekeeper
  stat) working correctly, after asking for a plain-language explanation of what the gatekeeper stat
  means. All three removed from Bucket 2.
- 2026-07-18: Same session, continued. Kayvan hands-on confirmed the full item-8 batch (finale
  badge, win/loss record, rank/re-rank button, credits) working on live Vercel — removed from
  Bucket 2. Logged two more ideas, both placed in Tier A (PM's call) as items 10/11, both building
  directly on episode pages just finished:
  - **Item 10**: episode titles on the comparison screen (and likely cold start, for consistency)
    become links to the episode detail page, with a way back into the exact comparison the user was
    mid-way through — not yet built; candidate mechanism noted (a `returnToRank` query param
    exploiting `/shows/[showId]/rank/[episodeId]`'s existing idempotent "what's next" recomputation)
    but not yet confirmed with Kayvan, a real build-time design call.
  - **Item 11**: swap the ranking screens' season poster art for the episode's own still image
    (`still_url`, shipped with item 8a) — Kayvan wasn't aware that column existed until seeing it on
    the new episode page. Trivial swap, same fallback-to-season-poster convention already
    established.
  Neither built yet — logged and queued, picking up next.
- 2026-07-18: Same session, continued. Kayvan confirmed (in conversation, not yet hands-on) that the
  win/loss record is correctly per-user, not global — matching the design intent (global/aggregate
  stats are explicitly Tier B's concern, not this feature's). Applied the `shows.status` migration to
  live Supabase. Logged a new idea: a per-season "completed" badge on the show page (once every
  episode in a season has a score or cold-start bucket) — placed as Tier A item 9 rather than folded
  into item 2 (stats/visualizations), since it's a simple completion indicator, not an analysis-style
  visualization, and fits the queue's small/self-contained item pattern (like 5/6/7) better.
  Then item 8(d) (director/writer/cast credits) finished building via one implementer agent
  (worktree) dispatched earlier — genuinely new TMDB integration (a live per-episode credits call),
  but still additive display-only work with no schema change, so implementer + direct PM review, not
  the full independent-reviewer pipeline (`1b396be`):
  - New TMDB types (`TmdbEpisodeCastMember`/`TmdbEpisodeCrewMember`/`TmdbEpisodeCredits`, app-facing
    `EpisodeCredits`) and a pure `mapEpisodeCredits` (5 new tests: normal case, empty cast/crew, no
    Director/Writer entries, cast-list truncation past 8, duplicate-director de-dup).
  - Episode page fetches credits **live, server-side, on every page view** — no new DB column, no
    caching — via `tmdbFetch` called directly from the page (a Server Component, so no new API route
    needed); wrapped in try/catch, fails open to "no credits section" on any error, matching
    `ensureShowSynced`'s existing fail-open convention elsewhere in this app.
  - Renders "Directed by …" / "Written by …" / "Starring …" lines, each independently omitted when
    empty, whole section omitted when the fetch fails or TMDB has nothing for any category.
  PM reviewed the full diff directly (the mapper's exact filter/de-dup/truncation logic checked by
  hand), verified worktree isolation held cleanly. `main` had advanced with a docs-only commit (the
  item-9 idea log) while this ran, so a plain fast-forward wasn't possible — merged with `--no-ff`
  instead (files didn't overlap, no conflicts), re-ran tests/typecheck/lint/build fresh on `main`
  post-merge: 239/239 tests (5 new), clean typecheck, clean lint, clean build. Pushed. **All four
  sub-items of Tier A item 8 are now built** — not yet hands-on tested as a whole batch, see Bucket 2.
- 2026-07-18: Same session, continued. Kayvan asked for the remaining episode-page sub-items
  ((b) season finale flag, (c) win/loss record) plus a fourth addition not in the original triage: a
  rank/re-rank button directly on the episode page. Built and merged via one implementer agent
  (worktree) — an additive nullable migration plus pure derivations/reused componentry, same risk
  profile as sub-item (a), so implementer + direct PM review, not the full independent-reviewer
  pipeline (`6d0a7e0`):
  - Added TMDB's `status` field (`TmdbShowDetails`/`ShowDetails`/`mapShowDetails`) and a new
    migration `20260718050000_shows_status.sql` (nullable `shows.status`, same no-backfill pattern
    as before) — **needs Kayvan to apply it to live Supabase**, same as the still/air-date one.
  - New pure, unit-tested `isSeasonFinale` (`website/src/lib/shows/seasonFinale.ts`, 5 tests) —
    implements the triage doc's exact rule; "a later season already exists" is derived from the
    `episodes` table itself (any other episode with a higher `season_number`) rather than storing
    TMDB's `number_of_seasons` anywhere, so `status` is the only new column this needed. Renders as a
    "Season finale" badge on the episode page.
  - New `getEpisodeComparisonRecord` in `@/lib/ranking-session/session.ts` (3 new tests) — a
    two-query both-sides read over `episode_comparisons`, same pattern `loadShowRankingState`
    already uses elsewhere in that file; tallies wins/losses/ties for the signed-in user. Renders as
    "N wins, N losses, N ties" (correct singular/plural per category), omitted entirely when all-zero.
  - Rank/re-rank button: reuses the show page's existing three-way status handling and its
    `ReRankButton` component directly (imported across the route-folder boundary) rather than
    inventing new UI — score+Re-rank if ranked, cold-start bucket label if pending, a "Rank this
    episode" link if untouched.
  PM reviewed the full diff directly (every changed file, the new migration's exact SQL, the pure
  `isSeasonFinale`/`getEpisodeComparisonRecord` logic checked by hand against the triage rule and the
  win/loss tallying rules respectively), verified worktree isolation held cleanly, fast-forward
  merged, re-ran tests/typecheck/lint/build fresh on `main` post-merge: 234/234 tests (8 new), clean
  typecheck, clean lint, clean build (new route still compiles). Pushed. Not yet hands-on tested, and
  the migration isn't applied to live Supabase yet — see Bucket 2. Sub-item (d) credits is still
  unbuilt, next up.
- 2026-07-18: Same session, continued. Kayvan applied the `episodes.still_url`/`episodes.air_date`
  migration to live Supabase and hands-on confirmed the new episode detail page on live Vercel: still
  image, season/episode number, title, air date, and synopsis all render correctly. Removed from
  Bucket 2 — only sub-item (a) is done; sub-items (b) season-finale flag, (c) win/loss record, (d)
  credits are still unbuilt, next up in that same cheap-first order whenever picked back up.
- 2026-07-18: Same session, continued. Kayvan confirmed the dashboard progress bar working hands-on
  on live Vercel — removed from Bucket 2. Moved to Tier A item 8 (episode pages), starting with
  sub-item (a) per the triage's cheap-first order. Before designing anything, dispatched a research-
  only Explore agent to verify STATUS.md's own claims against the actual code rather than trust them:
  confirmed `overview`/`synopsis` really is already fetched and persisted (shipped with item 3), but
  found `still_path`/`air_date` genuinely don't exist on `TmdbSeasonEpisode` at all — STATUS.md's
  prior wording ("already fetches but currently discards") was wrong, the same "assumed captured,
  never was" mistake this file previously made and corrected for `overview` itself. Corrected that
  wording immediately, as its own small commit, before building anything on top of the wrong premise.
  Also had the research agent confirm the season-finale derivation rule (verbatim from `AppSpec.md`'s
  triage section) and that no per-episode TMDB credits call exists yet (needed for sub-item (d), not
  this dispatch).
  Proposed the new route's design (entry point: episode title on the show page becomes the link; hero
  image: falls back to the season poster when TMDB has no episode-specific still) and got both
  confirmed by Kayvan before building. Built and merged via one implementer agent (worktree) — an
  additive nullable migration plus new display surface, same risk profile as the earlier synopsis-
  column work, so implementer + direct PM review, not the full independent-reviewer pipeline (`7bfab1c`):
  - `TmdbSeasonEpisode` gained `still_path`/`air_date`; `EpisodeSummary` gained `stillUrl`/`airDate`;
    `mapSeasonEpisode` maps `still_path` through the existing `posterUrlFromPath` helper (works for
    any TMDB image path despite the name) and passes `air_date` straight through.
  - New migration `20260718040000_episode_still_air_date.sql`: nullable `episodes.still_url`/
    `episodes.air_date`, same no-backfill/re-import-backfills-it pattern as `synopsis`/
    `season_poster_url` before it — **needs Kayvan to apply it to live Supabase**, same as those.
  - `EpisodeInsertRow`/`toEpisodeRows` (`importShow.ts`) now carry both new fields through to the
    upsert.
  - New route `/shows/[showId]/episodes/[episodeId]` (`page.tsx`): same auth-guard pattern as every
    other page here, scoped to both `id` and `show_id` so a stale/wrong-show link 404s rather than
    silently rendering the wrong episode; hero image (`still_url` falling back to
    `season_poster_url`, else nothing), "Season N, Episode M" label + title, "Aired Mon D, YYYY" (year
    included, unlike the show page's own `formatRankedDate` which omits it since ranking dates are
    always recent), synopsis.
  - Show page: episode titles in the per-season list are now links into the new route; nothing else
    in each row changed.
  PM reviewed the full diff directly (every changed file, plus the new migration's exact SQL),
  verified worktree isolation held cleanly (`git worktree list` + `git status --short` both clean
  before merging), fast-forward merged, re-ran tests/typecheck/lint/build fresh on `main` post-merge:
  226/226 tests (1 new), clean typecheck, clean lint, clean build (new route confirmed in the build's
  route table). Pushed. Not yet hands-on tested, and the migration isn't applied to live Supabase yet
  — see Bucket 2. Sub-items (b) season-finale flag, (c) win/loss record, (d) credits are still
  unbuilt.
- 2026-07-18: Fresh session. Confirmed `git status`/`git log` clean and matching the prior session's
  end state before doing anything else, per procedure. Asked Kayvan what to prioritize; chose to
  continue the Tier A queue, then specifically item 5 (dashboard progress bar) — Kayvan asked to see
  the design first rather than build straight away. Proposed the data source (reuse
  `getShowRankingDisplay`, same ranked/total convention as the show page's own progress line) and
  three visual options (bar, text-only, compact fraction) via mockups; Kayvan picked the visual bar,
  plus wanted the `(X/Y)` fraction shown alongside the percentage (not just the bar+percent alone).
  Built and merged via one implementer agent (worktree) — feel-based UI, no schema change, so
  implementer + direct PM review, not the full independent-reviewer pipeline: `dashboard/page.tsx`
  now fetches `getShowRankingDisplay` per tracked show (`Promise.all`, mirroring the existing
  `ensureShowSynced` loop just above it) and renders a thin filled progress bar + `{percent}%
  ({rankedCount}/{total})` under each show's title in the "My Shows" list; a show with zero episodes
  imported yet renders no progress row at all, matching the show page's own behavior. PM reviewed the
  full diff directly (one file, one commit, matches the scoped design exactly), verified
  worktree isolation held cleanly this dispatch (`git worktree list` + `git status --short` both
  clean before merging — no recurrence of the isolation bug this time), fast-forward merged
  (`634b9d2`), re-ran tests/typecheck/lint/build fresh on `main` post-merge: 225/225 tests, clean
  typecheck, clean lint, clean build. Pushed. Not yet hands-on tested — see Bucket 2.
- 2026-07-18: Same session, continued, at 80% session usage, about to reset — Kayvan hands-on tested
  both of this session's remaining Bucket 2 items on live Vercel before context was lost. **All 8
  checks confirmed working, nothing broken found**: (1) the comparison screen's "Which episode did
  you like better?" heading, (2) clicking a poster submits the correct episode as the winner
  (subject/reference not swapped), (3) "I can't decide" still works, (4) synopsis now shows on the
  cold-start screen too, (5) a posterless episode's placeholder box is clickable, (6) rank position
  ("#N") shows next to each score on the show page, (7) both ranked and cold-start-pending episodes
  show their "Ranked {date}" text, (8) the rank screen's header correctly reads "Rank {episode} from
  Season {N} of {show}". Both Bucket 2 items removed — fully done end to end (built, reviewed,
  merged, pushed, hands-on confirmed). Only the throttled TMDB re-sync remains in Bucket 2, still
  genuinely untestable until a tracked show has a real new episode/season to pick up.
- 2026-07-18: Same session, continued, at 70% session usage — Kayvan asked for one small Tier A
  item before ending the session; offered items 5/6/7 (all flagged "small, self-contained, no design
  decision needed"), Kayvan asked to bundle items 6 (date ranked) and 7 (rank position) together
  since they touch the same display layer, then separately asked for a third small change mid-turn
  (the rank screen's header, previously just "Rank {show}", now names the specific episode/season
  too). All three built in one implementer dispatch (worktree), reviewed, re-verified fresh, merged
  (`92d1bb5`), pushed:
  - `getShowRankingDisplay`'s `ranked`/`coldStartPending` arrays now carry `rank`/`createdAt`
    alongside the existing `episodeId`/`score`/`bucket` fields — `rank` was already computed
    (`index + 1`) and discarded; `createdAt` needed `loadShowRankingState`'s `episode_rankings`
    query to add the already-existing `created_at` column and a new `createdAtByEpisode` map on
    `LoadedShowRanking`. PM independently traced the non-null-assertion invariant on
    `createdAtByEpisode.get(episodeId)!` by hand (both `order` in the done branch and
    `state.ranked`/`state.coldStart` in the not-done branch are derived from the same `rankingRows`
    query `createdAtByEpisode` is built from, so every lookup is guaranteed to hit) rather than
    trusting the implementer's inline comment.
  - Show page renders both: "8.7 (#3)" next to each score, "Ranked Jul 15" next to both ranked and
    cold-start-pending episode titles. Deliberately **not** added to `/shows/[showId]/rankings` —
    that page already shows rank via its `{index + 1}.` ordinal list prefix, so the implementer
    judged the field redundant there and left it alone (a call worth spot-checking hands-on, not
    pre-confirmed with Kayvan).
  - `rank/[episodeId]/page.tsx`'s header now reads "Rank {episode title} from Season {N} of
    {show name}" instead of just "Rank {show name}", falling back to the old text only for the one
    edge case where the episode itself failed to load (an `episodesError`, not a missing episode —
    the latter still 404s).
  - Test coverage: the in-memory fake Supabase's `episode_rankings` insert/upsert now mirrors the
    real table's `created_at` semantics (assigned fresh only on genuine insert, preserved across
    later upserts) rather than just stubbing the new field — existing assertions on
    `getShowRankingDisplay`'s exact return shape updated, one new test added with precise expected
    `rank`/`createdAt` values (not `expect.any(String)`) for a `done: true` show.
  225/225 tests (1 new), clean typecheck/lint/build, re-verified fresh before merging. Not yet
  hands-on tested — see Bucket 2. **This was the last item before ending the session at Kayvan's
  request** — see the top-of-file summary and Deviations for the end-of-session state.
- 2026-07-18: Same session, continued. Kayvan applied the `episodes.synopsis` migration to live
  Supabase and tried the just-merged comparison screen hands-on: liked the two-column layout overall
  but asked for two changes before moving on to anything else. Built and merged both via one more
  implementer agent (worktree), reviewed, re-verified fresh, merged (`fce46f2`), pushed:
  1. **Synopsis now shows on the cold-start screen too**, not just the compare screen — the shared
     wrapper `RankEpisodeStep` uses for cold-start/already-ranked steps now renders the same full
     `EpisodeColumn` (poster+title+synopsis) the compare screen already used, instead of a small
     poster+title-only strip.
  2. **Replaced the three-button "Better"/"I can't decide"/"Worse" control with click-the-poster.**
     `ComparisonPrompt` was rewritten to render both episode columns itself (poster click handling
     has to live in a Client Component) — a new heading reads "Which episode did you like better?",
     clicking the subject's poster submits `result: 'better'`, clicking the reference's poster
     submits `result: 'worse'` (per `ComparisonResult`'s existing "subject relative to reference"
     semantics — unchanged, only the trigger changed), and "I can't decide" (`neutral`) remains the
     only button. Posterless episodes get a same-size dashed-border placeholder with the title in
     it as the click target, so ranking isn't blocked by missing artwork. A new
     `resultForClickedSide` pure function isolates the click→result mapping for a direct unit test
     (2 new tests). `page.tsx` and `ComparisonPrompt.tsx` now share episode-display types/formatting
     via a new `episodeDisplay.ts` (avoids the Client Component importing runtime code from the
     Server Component file). `ColdStartPicker.tsx` confirmed untouched via diff review — its own
     "Neutral" bucket is unaffected.
  PM reviewed the full diff directly (poster-click semantics double-checked by hand against
  `ComparisonResult`'s "better means subject is better than reference" definition, confirmed
  correct), re-ran tests/typecheck/lint/build fresh before merging: 224/224 tests (2 new), clean
  typecheck, clean lint, clean build. Fast-forward merged, pushed. Not yet hands-on re-tested — see
  Bucket 2.
- 2026-07-18: Same session, continued past the diagnostic/cleanup work. Built and merged Tier A item
  3, the richer two-column comparison screen (`f763f5f`), via one implementer agent (worktree) —
  feel-based UI + a trivial additive migration, so implementer + direct PM review, not the full
  independent-reviewer pipeline. New `episodes.synopsis text` column
  (`supabase/migrations/20260718030000_episode_synopsis.sql`, same nullable/no-backfill/
  re-import-backfills-it pattern as `season_poster_url`/`genres`), threaded through
  `TmdbSeasonEpisode`/`mapSeasonEpisode`/`EpisodeSummary`/`EpisodeInsertRow`/`toEpisodeRows` end to
  end — required adding `overview` to `TmdbSeasonEpisode` itself first, since it turned out **not**
  to already be captured from TMDB's response despite being in scope (a correction to this file's
  prior assumption that it was "already fetched, just not persisted" — same TMDB call, just a
  previously-undeclared field on the same response, so still no new network call). `rank/[episodeId]/
  page.tsx`'s `RankEpisodeStep` now branches early on the `'compare'` step into a genuinely new
  two-column layout (`EpisodeColumn`: poster → title → synopsis, `sm:flex-row` desktop /
  stacked-vertical narrow, `ComparisonPrompt` between the two columns) instead of the old single-block
  layout; the old "Compared to X, is this episode better, worse, or about the same?" sentence was
  dropped as redundant once both episodes are visually labeled in their own columns — a judgment call
  worth a hands-on sanity check, not pre-confirmed with Kayvan. Poster art enlarged from the old
  60×90 thumbnail to 120×180 (implementer's own call, per the "prominent focal point" brief — not an
  exact prescribed size). `ComparisonPrompt`'s middle button now reads "I can't decide" (comparative
  mode only, confirmed only one real call site exists so no `mode` prop was needed);
  `ColdStartPicker`'s own "Neutral" bucket was not touched, confirmed via diff review. One second
  `mapSeasonEpisode` call site (`api/tmdb/[showId]/episodes/route.ts`) was checked and confirmed safe
  (calls via an explicit arrow function, not raw `.map()`, so no arity hazard) — just needed its
  test's expected body updated. PM reviewed the full diff directly (every changed file), rebased
  cleanly onto two intervening `main` commits (the STATUS.md housekeeping below), re-ran
  tests/typecheck/lint/build fresh in the rebased state before merging: 222/222 tests, clean
  typecheck, clean lint, clean build. Fast-forward merged, pushed. **Needs the migration applied to
  the live Supabase project before existing episodes show real synopsis text** (existing rows stay
  `null` until their show is re-imported) — not yet hands-on tested, see Bucket 2.
- 2026-07-18: Same session, continued. Kayvan hands-on confirmed two of Bucket 2's three pending
  items on live Vercel: the ranking confidence score displays and correctly updates as more
  comparisons get answered, and the privacy page's footer link works. Both removed from Bucket 2. The
  throttled TMDB re-sync remains genuinely untestable for now (24h throttle) — still pending, not
  chased. Moving on to continue building the Tier A queue.
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
