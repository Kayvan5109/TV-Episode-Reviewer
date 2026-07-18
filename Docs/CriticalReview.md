# Episode Ranker — Critical Review

Date: 2026-07-18. One-off critical-review artifact, not a living doc — not updated after this date
unless a future session deliberately re-runs the exercise. Written to be read cold: each finding
states the problem, cites evidence (file / line / doc section), says why it actually matters, and
where possible what a real fix looks like.

This is deliberately an uncomfortable document. It was requested that way ("I want the critiques to
be as honest as possible so we can make the best product possible"). It spends its words on what's
wrong or under-examined and gives good work a single line. That imbalance is intentional and is not
a verdict on overall quality — for agent-orchestrated code built by a beginner, a lot here is
genuinely solid. But that's not what this document is for.

Two things verified before writing, because they change how much to trust everything else:
- **The docs and the ranking code actually match.** The small-show effective threshold, the
  two-tier tie-break, cold-start bucket ordering, and the score formula in `website/src/lib/ranking`
  are exactly what `DevelopmentPlan.md` describes. Doc/code drift is a common failure in this kind
  of project and it is not happening here. Good.
- **`next@16.2.10` and `react@19.2.4` are really installed** (`node_modules/next/package.json`),
  with real docs under `node_modules/next/dist/docs/`. The `proxy.ts`-instead-of-`middleware.ts`
  thing is a real framework change, not a hallucination. See Finding 3.2 for why this is
  nonetheless a risk.

---

## 1. Product & scope

### 1.1 (MOST IMPORTANT FINDING, WHOLE DOCUMENT) The project is designing far ahead of validating, for an audience of one

Look at what has been *fully designed* versus what has been *validated with a real user*:

- Fully designed, dated, written into `AppSpec.md`: an entire social layer (Tier B) — 5 new tables
  (`user_profiles`, `follows`, `collections`, `collection_items`, `episode_comments`), per-table RLS
  design, a Kendall's-Tau taste-similarity formula, a Discover page, 7 new routes
  (`AppSpec.md` lines 217–431); a personal-stats/recap page (lines 450–483); a gamification system
  with achievements and streaks (lines 485–517); a ranking-confidence formula
  (`DevelopmentPlan.md` lines 120–146); plus a ~80-idea external design review triaged into three
  tiers.
- Validated with a real user: the core ranking loop works end-to-end for **one person** (Kayvan),
  who is also the developer. There is no evidence anywhere in the docs that a single *other* human
  has used the app, or that the core loop is actually enjoyable to anyone who didn't build it.

This is the classic, fatal solo-project pattern, and it deserves to be named plainly: **designing
features is fun and safe; finding out whether anyone wants the thing is uncomfortable and risky, so
effort silently flows to design.** The Tier B social-layer design alone (with its "genuinely new
category of risk this app has never needed before," per `AppSpec.md` line 330) is a large, careful
piece of architecture work for a feature set gated behind a question — "does this app grow a social
layer at all?" — that cannot be answered until strangers use the single-player core and want to
share results. Right now that's speculative demand being met with concrete design.

Why it matters: every hour spent designing the social layer, gamification, and stats is an hour not
spent on the one thing that would actually de-risk the project — getting 5–10 real people to rank a
show and watching whether they come back. The documentation system makes this worse, not better,
because producing polished dated design docs *feels* like progress and is legible as progress in
`STATUS.md`, while "I still don't know if this is fun for anyone but me" never gets a line item.

What a serious response looks like: freeze all Tier B / stats / gamification design work. Declare it
explicitly out of scope until the core loop has been used by at least a handful of people who are
not the developer, and put "get N non-developer users to rank a full show" on the actual punch list
as the current blocking item. Treat the existing design docs as sunk — don't extend them.

### 1.2 The core loop has a weak retention story that gamification is quietly compensating for

Beli (the stated model, `AppSpec.md` line 16) works because restaurants are an *open, recurring*
input stream: you eat out constantly, there's always a new place, and the social layer answers a
live question ("where should we go?"). Episode ranking is the opposite shape: a show has a **finite,
closed** episode set, you rank it **once**, and then you are **done with that show forever**. There
is no natural recurring reason to open the app tomorrow. This is the actual reason the roadmap leans
on streaks and achievements (`AppSpec.md` lines 485–517) — those exist to manufacture a return
reason the core activity doesn't have. Manufactured engagement on top of an activity with no
intrinsic recurrence is a red flag, not a feature.

Why it matters: it's worth being honest that this may be a "rank my favorite show once, screenshot
it, done" tool rather than a habit product — and that's *fine*, but if so, the entire retention-
oriented backlog (streaks, daily activity, gamification) is solving a problem the product shouldn't
try to have. Designing for daily return on a fundamentally episodic activity wastes effort.

What a serious response looks like: decide, explicitly and in writing, whether this is (a) a
one-and-done "make a shareable ranking" utility or (b) a habit product. If (a), most of the backlog
is dead and the product gets much smaller and more focused (and shareable-ranking-cards, which was
*denied* in `AppSpec.md` line 438, was probably the single most on-strategy idea and should be
reconsidered). If (b), you need a real answer to "why open this tomorrow" that isn't a streak badge.

### 1.3 "No monetization, personal use" is colliding with a planned iOS App Store release

`AppSpec.md` (lines 92–94) says personal use, no monetization. `Risks.md` (lines 13–16) notes the
free TMDB key **forbids commercial use**. `DevelopmentPlan.md` Phases 4–5 plan a native iOS app,
TestFlight, and App Store submission — which means the $99/yr Apple Developer Program (a real spend
flagged in `CLAUDE.md`'s non-negotiables) for an app that, by its own license and its own product
decision, cannot be commercial and currently has one user.

Why it matters: this isn't "avoiding a hard question" so much as *two decisions that don't fit
together.* Building a native iOS app is the single largest chunk of work on the roadmap (a whole new
language, toolchain, and a second port of the algorithm — `DevelopmentPlan.md` Phase 4), justified
by "share rankings across web and phone" for a user base of one. The website already works on mobile
browsers. The honest question the docs don't ask: **does the iOS app need to exist at all, or is it
there because building an iOS app sounds like the "real" version of a project?**

What a serious response looks like: put a genuine go/no-go on iOS, and make the bar "the website has
real users who specifically want a native app," not "iOS was always Phase 4." Until then, iOS is a
large speculative bet.

---

## 2. Ranking algorithm

The algorithm itself is the strongest-engineered part of the project. Binary-insertion over pairwise
comparisons is genuinely the right mechanic for a small, closed, single-user set, and the Elo/Glicko
rejection (`DevelopmentPlan.md` lines 65–74) is well-reasoned, not hasty — Elo is built for large
ongoing populations with no finish line, which is the wrong shape here. The tie-break design is
coherent. That's the one-line credit; the rest is what's wrong.

### 2.1 The app displays false precision — confident decimal scores derived from near-zero real signal

`score.ts` (lines 20–31) maps rank position to a 1-decimal score (e.g. 8.7). But rank position can
come from as little as a single comparison, or from a *tie-break fallback that inserted the episode
"adjacent"* (`comparativePlacement.ts` lines 206–213), or — before the small-show fix — from pure
recency ordering of equally-"neutral" cold-start episodes. The 3-episode all-neutral case that
produced 10.0 / 8.7 / 7.4 (`DevelopmentPlan.md` lines 148–160) was not a bug in the formula; it's
the formula working exactly as designed on inputs the user explicitly said were *equal*. The
small-show change (built 2026-07-18) patches the cold-start-specific trigger but, as the doc itself
admits (lines 176–184), **does not fix the root cause**: the system has no concept of a tied score
anywhere, so a genuine "neutral" pairwise comparison still resolves to a specific decimal rank.

Why it matters: showing "8.7" tells the user the app knows this episode is meaningfully worse than
the 10.0 one, when the underlying data may be one low-confidence comparison or a coin-flip tie
fallback. That is the app lying to the user about its own certainty — and for a product whose entire
value proposition is "trust these rankings," that's a credibility problem, not a cosmetic one.

What a serious response looks like: either (a) stop displaying decimals and show coarse tiers /
ordinal rank until confidence is high (the ranking-confidence signal in `DevelopmentPlan.md` lines
120–146 is the right instinct — it should *gate the precision of what's shown*, not just be a
separate stat), or (b) actually model tied scores. The docs keep declining (b) as "bigger than
currently worthwhile," which is a reasonable call — but then (a) becomes necessary, and it isn't
scheduled.

### 2.2 Systematic, undiscussed directional biases baked into the tie/fallback rules

Two arbitrary choices, both flagged in-source as "arbitrary … for determinism" but never actually
adjudicated, compound into a consistent bias:
- Cold-start ordering: `coldStart.ts` (lines 18–32) orders `liked > neutral > disliked`, and
  within a bucket **most-recent-first**. So among equally-liked episodes, the one you happened to
  judge last always outranks the others.
- Tie fallback: `comparativePlacement.ts` (lines 206–213) inserts a tied episode *immediately after*
  (worse than) the reference, always.

Why it matters: these aren't random noise that averages out; they're *consistent* directional
thumbs on the scale. "Most recently judged is better" and "ties break downward" will systematically
shape rankings in a way no user chose and no one decided was correct. For an app about producing a
ranking the user trusts, an undiscussed systematic bias is worse than acknowledged imprecision.
These have been sitting in `STATUS.md`'s Deviations Awaiting Review since 2026-07-15 (items 2 and 7)
— unresolved (see Finding 5.2).

What a serious response looks like: actually decide these, or randomize the direction so the bias is
noise rather than a consistent lean. At minimum, stop calling them "settled by implementation
detail."

### 2.3 State is mutated during render/read paths, with a concurrency hole

`getShowRankingDisplay` (`session.ts` lines 473–506) — a *read* used to render the show page — calls
`deriveNextStep`, which calls `persistRankedPositions` (a DB **write**) as a side effect (lines
210–222). So loading a page can silently write rank positions. Worse, there is no locking: two
concurrent requests (a double-click, a prefetch + a click, two tabs) can both load the same
pre-cross-threshold state, both fold cold-start into `ranked`, and both write. `submitComparisonAnswer`
(lines 581–617) likewise does check-then-insert with a gap between the check and the write.

Why it matters: today it's masked because there's one user rarely doing two things at once, and the
per-pair reads tolerate some redundancy. But `episode_comparisons` has **no unique constraint on the
pair** (`20260715000000_initial_schema.sql` lines 98–107 — only `episode_a_id <> episode_b_id`), so
a race or a stale resubmit can insert **two rows for the same pair, potentially with different
results**. The replay comparator (`comparator.ts` lines 18–27) uses `.find` — first match wins — and
`loadShowRankingState` queries comparisons with **no `ORDER BY`** (`session.ts` lines 93–104), so
which of two conflicting rows "wins" is nondeterministic across loads. That's latent ranking
corruption that no test would catch.

What a serious response looks like: add a unique constraint on the normalized pair
(`user_id, least(a,b), greatest(a,b)`) so duplicate/conflicting comparisons are impossible at the DB
level; make placement writes happen only from explicit submit actions, not from render; and order
the comparison query deterministically. None of this is urgent at 1 user, but it's exactly the kind
of thing that will produce an unreproducible "my rankings are wrong" bug the moment there are two.

### 2.4 Minor: `cold_start_sequence` is a count, not a monotonic counter

`submitColdStartAnswer` (`session.ts` line 549) sets `sequence = loaded.state.coldStart.length`.
If a cold-start episode is re-ranked (deleted) and another added, the new one can reuse a sequence
value already held by an existing entry, and `orderColdStart`'s recency tiebreak (`coldStart.ts`
line 30) then has no stable answer. Small-scale, low-severity, but it's a real correctness edge in
the small-show path that the small-show fix just made more common.

### 2.5 "Replay every comparison on every load" is fine here — don't over-worry it

For completeness, since it was raised as a concern: replaying comparisons on each load is **not** a
real scaling problem for this domain. Placement replays only one episode's `O(log n)` search path,
and n is a single show's episode count (tens, rarely low hundreds). This is bounded and cheap. The
real costs are the write-during-read and duplicate-row issues above, not replay volume. Don't spend
effort "optimizing" replay.

---

## 3. Architecture & tech choices

### 3.1 (MOST IMPORTANT IN CATEGORY) The TMDB proxy routes are unauthenticated and unrate-limited — an open proxy on your API token

`proxy.ts`'s matcher **excludes `/api`** (lines 181–187), and neither `/api/tmdb/search`
(`search/route.ts`) nor `/api/tmdb/[showId]/episodes` (`[showId]/episodes/route.ts`) checks for a
signed-in user. The search route *annotates* results with per-user "already added" status and does
call `getUser()` for that (lines 73–81) — but the **TMDB fetch itself happens unconditionally,
before and regardless of** any auth check. So anyone on the public internet who finds the deployed
URL can call `GET /api/tmdb/search?query=...` and `/api/tmdb/{id}/episodes?season=...` as much as
they like, using **your** server-side `TMDB_API_READ_ACCESS_TOKEN` (`tmdb/client.ts` line 96).

Why it matters: this is a real, live exposure, not hypothetical. The deployment is a free, open TMDB
proxy. A scraper or a bad actor can burn the project's TMDB rate limit (breaking search for the
actual user), or get the token rate-limited/banned by TMDB for abuse the project didn't commit.
There is no rate limiting anywhere in the app, so there's nothing to blunt it. The docs note "one
place to add caching/rate-limit handling later" (`TechArchitecture.md` lines 27–31) — "later" is
already overdue the moment the site is public, which it is.

What a serious response looks like: gate both TMDB routes behind `getUser()` (return 401 if
unauthenticated) — these only exist to serve the signed-in app, so there's no reason they're open.
Add a cheap per-user/per-IP rate limit. This is the highest-value security fix in the codebase and
it's small.

### 3.2 The whole app is built on a framework version no one — human or Claude — has training data for

`next@16.2.10` is real and installed, and `website/AGENTS.md` openly says "This is NOT the Next.js
you know … Read the relevant guide in `node_modules/next/dist/docs/` before writing any code." The
`middleware.ts` → `proxy.ts` rename is one visible symptom; there will be others.

Why it matters: this is a standing, ongoing risk, not a one-time hurdle. Every implementer agent and
every reviewer agent is working **blind** against framework behavior they can't know from training —
and the "independent reviewer" safety net (Finding 4/5) is *also* blind, so the second pass doesn't
actually protect against framework-level misuse (subtle cookie/caching/streaming semantics, Server
Action edge cases, `proxy` execution guarantees). The auth flow already shows the cost: the docs
repeatedly hit surprises about cookie propagation through redirects (`STATUS.md` History 2026-07-16,
the `/auth/confirm` cookie-copy saga) that a well-trained-on framework would have made routine. On a
bleeding-edge major version, the reviewer-agent process gives *false confidence* on exactly the
class of bug it can't see.

What a serious response looks like: accept that framework-correctness on this version needs
hands-on runtime verification (the `verify`/`run` skills, real browser exercise), not just tests +
an equally-blind review. Consider whether being on the absolute latest major of Next was worth it
for a beginner solo project where "boring and well-documented" was an explicit goal
(`TechArchitecture.md` line 94, "standard, low-ceremony, well-documented"). Next 16.x contradicts
that stated value; a stable prior major would have matched it better.

### 3.3 The just-shipped password-reset feature effectively doesn't work, and is marked done anyway

Password reset was built and reviewed 2026-07-18 (`STATUS.md` History) — but it depends on Supabase's
default email provider, which is capped at **2 emails/hour project-wide** (`STATUS.md` Bucket 4
item 3), and custom SMTP is abandoned/broken. It has also **never been click-through tested** — it
needs 3 setup steps (Vercel env var, Supabase redirect allowlist, one real email test) that are
still pending (`STATUS.md` top summary). So a feature whose entire point is "a real user who forgot
their password can recover" ships into an email pipe that (a) is untested end-to-end and (b) silently
fails after 2 requests/hour.

Why it matters: this is the gap between "code merged, tests pass, docs say done" and "actually works
for a human." Password reset that can't reliably send an email is not a working password reset. And
the same cap will silently break **signups** the moment more than a couple of people try to join in
an hour — which is precisely the "get real users" step Finding 1.1 says is the actual priority. The
email ceiling isn't a Bucket 4 nice-to-have; it's a hard blocker on the one thing that matters next.

What a serious response looks like: promote "working transactional email" from Bucket 4 to blocking
*before* any real-user testing. Resend-via-SMTP failed, but Supabase also supports other providers,
and Resend has a plain HTTP API that sidesteps the SMTP connection problem entirely. This needs to
be solved, not deferred, before user #2.

### 3.4 No error monitoring or analytics fatally undercuts the project's own core thesis

The stated reason for building the website first is to "tune the ranking algorithm and score formula
against real usage" (`DevelopmentPlan.md` lines 18–24, 340–347). But there is **no analytics, no
event logging, and no error monitoring** (`STATUS.md` Bucket 4 items 5). So there is literally no
mechanism to observe real usage. The algorithm is being "tuned" by one developer's subjective feel,
not data — which is exactly what the website-first strategy was supposed to improve on.

Why it matters: the de-risking premise isn't being executed. You cannot tune from data you don't
collect, and you can't tell whether the app is broken for someone other than by them telling you. A
single Sentry free-tier setup and a handful of counters (comparisons made, placements completed,
errors) is cheap and would make "tune against real usage" actually true.

### 3.5 Supabase/Vercel lock-in is fine — don't worry about it

One-line credit and dismissal: RLS + Supabase Auth is moderate lock-in, but the alternative
(hand-rolled auth) is far riskier for a beginner, the data model is portable Postgres, and at this
scale vendor lock-in is a non-problem. `Risks.md` tracks it adequately. Leave it.

---

## 4. Code quality & technical debt

For agent-built code assembled across many sessions, quality and consistency are genuinely good:
consistent user-scoping (`requireUserId` + explicit `user_id` filters as defense-in-depth on top of
RLS), a cleanly pure algorithm core decoupled from persistence (`ranking/types.ts` docblock), and
tests that are *real* rather than superficial — `engine.e2e.test.ts` drives full placement flows via
scripted comparators over hidden "true quality" values, which is the right way to test this. That's
the credit. The debt:

### 4.1 The most security-critical layer (RLS / cross-user isolation) has zero automated verification

`ProcessAndRoles.md` (lines 31–37) and `Risks.md` (lines 27–30) both name cross-user data isolation
as *the* correctness-critical guarantee. Yet every test in the repo is a pure-logic unit/e2e test
that never touches Supabase (`Testing.md` line 15 confirms the suite "don't need [env] since they
don't touch either"). The RLS policies (`20260715000000_initial_schema.sql` lines 120–202) are
verified **only by reading the SQL by eye** — the review trail in `STATUS.md` repeatedly says
"traced the security guarantees by hand." There is no integration test that actually creates two
users and proves user A cannot read user B's rows.

Why it matters: RLS is exactly the kind of thing that gets silently broken by a future migration (a
new table without RLS enabled, a policy typo, a `USING (true)` pasted in) and produces *no error* —
it just quietly leaks data. Hand-tracing catches today's policy; it catches nothing about tomorrow's
change. For the one guarantee the whole process claims to take most seriously, having zero automated
proof is a real gap. (This is also latent for Tier B, whose design leans on a service-role client
reachable from an unauthenticated page — `AppSpec.md` line 330 — an even sharper thing to ship with
no isolation test.)

What a serious response looks like: a small integration test (two users, seeded rows, assert each
sees only their own) run against a local Supabase or a test project. It's the highest-leverage test
the project doesn't have.

### 4.2 Defensive fallbacks silently mask invariant violations instead of surfacing them

`reconstruct.ts` (lines 69–73) does `bucket: (row.cold_start_bucket ?? 'neutral')` and
`sequence: row.cold_start_sequence ?? 0` "defensively rather than crash if that invariant is ever
violated." Similarly the TMDB proxy annotation "fails open" in several places (`search/route.ts`
line 88, "fail open on lookup errors").

Why it matters: if a cold-start row ever exists with a null bucket, something upstream is already
broken — and silently coercing it to `'neutral'` hides that bug and corrupts the user's ranking
quietly instead of failing loudly where it can be found. "Fail open" on the security annotation is
the right call (it errs toward showing "Add" for something added — harmless). "Fall back to neutral"
on core ranking data is the wrong call — it turns a detectable bug into silent data corruption.

What a serious response looks like: for core ranking state, fail loud (throw) on invariant
violations; keep fail-open only where the failure is genuinely harmless.

### 4.3 The "independent reviewer" process is partly unfalsifiable narration

Many History entries claim deep rigor ("re-derived the fix by hand," "hand-traced the threshold
logic," "read every function by hand"). Some of that clearly happened and caught real bugs (the
`proxy.ts` recovery-link swallow, `STATUS.md` History 2026-07-18, is a genuine catch). But a lot of
it is a single Claude session narrating its own diligence into a doc, with no artifact proving the
review occurred or was independent — and, per Finding 3.2, the reviewer is blind to the framework
anyway. See Finding 5.4 for the process implication; flagging here that **claimed rigor in STATUS.md
should not be read as verified rigor.** A future session reading the History cold should treat "was
carefully reviewed" as "a past session said so," not as a guarantee.

---

## 5. Process & workflow

### 5.1 STATUS.md has already outgrown its own stated purpose and will stop being read

`STATUS.md` is ~730 lines, most of it History. Its own header says "kept short and current on
purpose" (line 4) and `ProcessAndRoles.md` documents a convention to "prune detailed narrative to
git-history pointers once a phase's Deviations are fully cleared" (`STATUS.md` lines 218–220). That
pruning is **not happening** — the History has grown monotonically and now spans dozens of dense
entries back to bootstrap.

Why it matters: the entire documentation system exists so a cold-start session can pick the project
up correctly (`CLAUDE.md` lines 3–6). But no one — human or Claude — reliably reads 730 lines before
starting work, so in practice the tail stops being read, which means stale/contradictory context
accumulates *unnoticed* (the doc looks authoritative even as its tail rots). A source-of-truth doc
that's too long to read has quietly stopped being a source of truth. The irony: the discipline meant
to prevent lost context is now a vector for it.

What a serious response looks like: actually execute the prune. History older than the current phase
becomes one-line git-SHA pointers. Target: STATUS.md readable in full in a couple of minutes. The
detail already lives in git; the doc doesn't need to duplicate it.

### 5.2 "Deviations Awaiting Review" accumulates flags without resolving them — exactly the failure it was meant to prevent

The 2026-07-15 deviation batch (`STATUS.md` lines 185–214) logged 7 ranking judgment calls plus the
vendor choice. Weeks later: items 1 and 3 are struck through (resolved), but **item 2 (cold-start
bucket ordering — "arbitrary, undiscussed"), items 4–7 (tie-break mechanics, adjacent-direction),
and the whole vendor-choice second-look are still open.** The mechanism promised "a deliberate second
look at the start of the next session" (`ProcessAndRoles.md` lines 62–65). That second look has not
happened for most of these across many subsequent sessions.

Why it matters: "log it for review" only works if review actually happens. When it doesn't, the
Deviations section becomes a graveyard that *feels* like accountability while functioning as the
opposite — the arbitrary biases of Finding 2.2 are still shaping every user's rankings, "logged" but
never decided. This is the precise anti-pattern the process was designed to avoid, now instantiated
by the process itself.

What a serious response looks like: either genuinely process the backlog (spend one session closing
every open Deviation with a real decision) or admit the mechanism isn't working and replace it.
Don't keep adding to a list nothing gets removed from.

### 5.3 The worktree-isolation failure is a safety mechanism failing 50% of the time, met with "remember to check manually"

`isolation: "worktree"` silently produced **no isolation in 3 of 6 dispatches** in a single session
(`STATUS.md` lines 160–184) — edits landed directly on `main`'s working tree. This has recurred
across three sessions. The response each time has been to note it and add a manual mitigation
("always check `git worktree list`").

Why it matters: this is a correctness/safety mechanism failing at random, half the time, and the
mitigation is *human vigilance under exactly the conditions (session budget pressure, batching
agents) where vigilance fails.* The docs themselves admit the only reason nothing broke was luck —
"a genuinely parallel pair of agents touching overlapping files could silently corrupt each other's
work." Three sessions of "worth investigating next session" is the tell that it isn't being taken
seriously enough: it keeps getting deferred because it hasn't bitten yet. It's a near-miss log, not
a fix.

What a serious response looks like: either root-cause it (the docs' own hypothesis — the Windows
`.git/worktrees` file-lock cleanup issue — is a concrete lead worth 30 minutes) or **stop relying on
worktree isolation entirely** and adopt a rule of "one agent at a time, verified on its own branch,"
which removes the dependency on a mechanism that demonstrably doesn't hold. Don't keep dispatching
parallel agents while the isolation they depend on works 50% of the time.

### 5.4 The process ceremony is heavy relative to what's being built, and consumes the budget validation needs

Step back and weigh it: the actual artifact is a modestly-sized CRUD web app (auth, TMDB import, a
ranking algorithm, a few pages) built by one person. Around it sits a 7-document operating system,
a PM/implementer/reviewer role split, per-agent worktrees, a 5-bucket triage taxonomy, a Deviations-
review protocol, and multi-paragraph History entries narrating the rigor of each merge. Some of this
earns its keep (the algorithm genuinely benefits from a second pass; the doc set genuinely helps cold
starts *when kept short*). But a lot of it is process for its own sake — and, critically, **producing
it consumes exactly the session budget that Finding 1.1 says should go to getting real users.** The
`ProcessAndRoles.md` budget discipline (lines 67–71) worries about agent spend; it doesn't account
for the cost of the documentation ritual itself, which is substantial.

Why it matters: heavy process on a solo hobby project has a specific danger — it becomes the work.
Writing the dated design doc for a feature nobody's validated *feels* like disciplined engineering,
and it's more comfortable than the ambiguous work of finding users. The elaborateness of the process
is itself a symptom of Finding 1.1: effort is flowing to legible, safe, internal artifacts.

What a serious response looks like: right-size the ceremony. Keep the second-pass review for the
algorithm/auth/RLS and the short STATUS pointer; drop or radically shrink the rest until the product
has users that justify it. Process should scale with stakes, and the stakes right now are "does
anyone want this," which no amount of process addresses.

---

## 6. Risks not fully reckoned with

### 6.1 (MOST IMPORTANT IN CATEGORY) Abandonment / motivation risk is the single largest risk and isn't in the risk log at all

`Risks.md` tracks vendor, TMDB, auth, and algorithm-drift risks — all technical, all external. It
does not mention the overwhelmingly most likely way this specific project dies: **a solo developer,
no deadline, no external users, no monetization, a huge and growing backlog visible ahead (all of
Tier B, stats, gamification, then an entire iOS rewrite), loses momentum and stops.** For a hobby
project these conditions are the textbook abandonment profile, and the visible backlog *worsens* it
(a mountain of "designed but not built" work is demoralizing to face).

Why it matters: motivation is the actual scarce resource here, and it's completely untracked, which
means nothing in the process is optimizing to protect it. The current strategy — design ever more
features before shipping to anyone — is close to the *worst* thing for solo motivation, because it
maximizes the gap between effort spent and any external reward/feedback. A single encouraging "a real
person used my thing and liked it" is worth more motivationally than ten polished design docs, and
the roadmap is structured to defer that indefinitely.

What a serious response looks like: add this risk to `Risks.md` explicitly, and let it reshape
priorities — shorten the loop to real-world feedback, ship the small thing to a few real people,
keep the visible backlog *small* on purpose. Treat "sustained motivation" as a first-class
constraint, not a personal failing to be willed through.

### 6.2 `Risks.md`'s "Resolved" section resolves *decisions*, not *risks*

The two "Resolved" entries (lines 38–41) are "TMDB confirmed as data source" and "Beli-style
approach confirmed" — both are *decisions Kayvan made*, not risks that were *tested and retired*.
Nothing was actually de-risked; a choice was recorded. Meanwhile the genuinely unproven things (the
score formula feeling right, the core loop being fun, RLS actually isolating users) remain in "Open"
or aren't listed. The section gives a false sense that risks are being burned down.

What a serious response looks like: reserve "Resolved" for risks retired by *evidence* (a test, a
real-usage observation), and keep decisions in the decision log. A risk isn't resolved because you
decided something; it's resolved because you found out.

### 6.3 The website-first "de-risk the algorithm via real usage" thesis is unfalsifiable as currently run

Covered in 3.4 from the tech angle; noting it here as a *risk*: the plan's central bet (build web
first to tune the algorithm against reality before porting to iOS) cannot pay off without (a) real
users and (b) instrumentation, and the project has neither. So the iOS port could proceed on an
algorithm that was never actually validated — inheriting all its unexamined biases (Finding 2.2) into
a second, harder-to-change implementation. The risk log treats "algorithm drift between TS and Swift"
as the iOS risk; the bigger one is "port a never-validated algorithm and its biases into Swift."

---

## 7. UX & real-world usability

### 7.1 The core interaction is unintuitive and ships with no explanation

The whole mechanic — "you'll compare this episode against another instead of just rating it" — has no
mental model for a first-time user, and there is **no first-time explainer** (it sits unbuilt in the
brainstorm list, `AppSpec.md` lines 143–144, which itself notes "a first-time user has no existing
mental model for why am I being asked to compare"). A user who doesn't understand *why* comparison
produces a better ranking than star-rating will experience it as tedious and pointless.

Why it matters: this is the app's central, differentiating interaction, and it's the one most likely
to make a first-time user bounce. "The whole value proposition depends on understanding why" (the
brainstorm's own words) — and that understanding is currently left to chance. For the get-real-users
step (Finding 1.1), this is close to blocking: dropping strangers into an unexplained comparison loop
is a good way to get "I don't get it" as your only feedback.

What a serious response looks like: a one-screen explainer before the first comparison is small and
high-leverage. It should be built *before* any real-user test, not after.

### 7.2 "Repeatedly comparing against the same episode" is a real feel problem dismissed as "expected"

`STATUS.md` Bucket 4 item 8 and `DevelopmentPlan.md` lines 200–212 correctly explain that always
comparing against the current midpoint is mathematically inherent to binary search — and then use
that correctness to decline doing anything about it.

Why it matters: users don't experience "mathematically expected," they experience "why does it keep
asking me about the same episode, this is boring." Being *right* that it's expected doesn't make it
*feel* good, and "working as designed" is a classic trap for dismissing genuine UX complaints. The
midpoint episode getting hammered is a real monotony problem for the core loop.

What a serious response looks like: the mitigation the docs declined (jitter the pivot among a couple
of near-midpoint candidates) trades a little optimality for meaningfully better feel, and feel is the
entire point of building the website first. Reconsider it — this is exactly the kind of "tune against
real usage" call the strategy exists to make, being pre-emptively declined on theoretical grounds.

### 7.3 No undo and no "I don't remember" escape hatch — misjudgments anchor permanently

Every comparison forces a better/worse/neutral answer with no undo (`AppSpec.md` lines 128–133,
brainstorm, unbuilt). A misclick, or an honest "I watched this 4 years ago and genuinely don't
remember," gets recorded as a confident judgment that then anchors the binary search — and the only
recovery is manually re-ranking the whole episode.

Why it matters: for a product ranking *episodes people watched long ago*, "I don't remember well
enough to say" is not an edge case, it's a common, honest state — and forcing a low-confidence guess
in that moment directly corrupts the ranking the app exists to produce. Combined with the false-
precision problem (2.1), the app confidently displays 8.7 for a placement the user was coerced into
guessing. Undo is table stakes; a skip/defer option is nearly as important given the domain.

### 7.4 Zero visual design — correctly deferred, noted for completeness

Bare Tailwind defaults throughout (`STATUS.md` Bucket 4 item 6), acknowledged and deliberately
deferred. Fine for now — but it *does* interact with 1.1: if real-user testing starts before any
visual pass, "it looks unfinished" will contaminate the more important feedback about whether the
*idea* works. When you do get users, a minimum of visual credibility helps ensure you're testing the
concept, not the CSS.

---

## Summary of the through-line

Nearly every finding rhymes with Finding 1.1. The project is technically competent and unusually
well-documented for what it is — and it is pouring that competence into designing and documenting
ever more, for a product that has never been in front of a second human. The algorithm has
unexamined biases, the email pipe can't onboard a third user, the core interaction has no
explanation, and there's no instrumentation to learn from real use — all of which only matter *once
you have users*, which is exactly the step the roadmap keeps deferring in favor of more design. The
most valuable thing this project could do is stop designing, fix the small handful of things that
block real-world use (auth email, the open TMDB proxy, a first-time explainer), and get the existing
core loop in front of a few real people. Everything else is premature until that happens.
