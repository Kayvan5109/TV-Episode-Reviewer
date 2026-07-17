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
- ~~Keyboard shortcuts~~ for the better/worse/neutral and liked/disliked/neutral buttons — **queued
  2026-07-17** as Tier A item 1 (see `STATUS.md` Bucket 1), first in a small batch of ideas pulled
  from a broader design review and triaged with Kayvan.
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
- ~~Confidence indicator on a score~~ — **superseded 2026-07-17** by a concrete, queued proposal
  (Tier A item 2): see `DevelopmentPlan.md`'s Discussion section, "a 'ranking confidence' signal."
- **"Why is this ranked here?"** — show the specific comparisons that led to an episode's current
  position (e.g. "ranked better than X, worse than Y"). Doubles as user-facing transparency and a
  debugging aid.

### Data ownership
- **Export your data** (CSV/JSON of shows/episodes/rankings) — this is personal taste data; letting
  someone take it with them is a reasonable ask even for a personal-use app, and cheap relative to
  the value.

## External Design Review — Triage (2026-07-17, not committed, not scheduled)

Kayvan had a separate Claude session produce a large, ambitious product/design plan (dark mode +
per-show accent theming, a full navigation/discover/statistics/notifications surface, community
features, gamification, a long "future features" wishlist). Read in full and triaged together
into three tiers. **Tier A** (small, self-contained, no new architecture) is decided and queued —
see `STATUS.md` Bucket 1 and `DevelopmentPlan.md`'s Discussion section for the ranking-confidence
formula specifically. The Elo/Glicko ranking-algorithm swap that plan proposed was explicitly
declined — see `DevelopmentPlan.md`'s Ranking Algorithm section. What follows is Tier B and Tier C:
genuinely brainstorm-stage, not decided, landing here per this section's normal rule.

**Tier B — real features, all gated behind one big undecided question: does this app grow a
public/social layer at all?** Everything below needs some notion of cross-user data that doesn't
exist today (every table is strictly private-per-user, enforced by RLS with zero exceptions) —
treating "build a social layer" as one deliberate decision rather than approving these piecemeal is
itself part of the triage. Overlaps the friends/community ideas from the 5-idea engagement
brainstorm session (2026-07-17, see `STATUS.md` History) that was paused mid-discussion:
- Friends/following, and comparing your rankings against people you follow.
- "Community rank" shown alongside "your rank" on an episode page, and a discover page built on
  aggregate cross-user data (trending shows, biggest community disagreements, hidden gems).
- A numeric "taste similarity" score between two users ("you're 94% similar to Sarah").
- Per-episode discussion/comments.
- Shareable collections (a named list of episodes, e.g. "Best Pilots") — the collection concept
  itself is Tier A-adjacent (a private list needs nothing new), but *shareable* specifically needs
  the same public-link infrastructure the shareable-ranking-cards idea from the earlier engagement
  brainstorm would need.

**Detailed design for all of the above, ready to build from whenever this gets scheduled: see
"Tier B Detailed Design — Social Layer" below.**

**Tier C — not recommended for this project right now:**
- The Elo/Glicko algorithm swap (declined — see `DevelopmentPlan.md`).
- Most of the plan's "Future Features" wishlist (bracket-mode tournaments, blind rankings,
  character/villain/scene/quote/music/director rankings, live ranking during new-episode releases,
  fantasy ranking leagues, yearly community-voted awards) — fun ideas, but far past this app's
  current MVP scope.
- A mobile Tinder-style swipe interaction for ranking — blocked on the basic mobile-responsive pass
  that hasn't started yet (`STATUS.md` Bucket 4).
- Notifications / a weekly recap digest — needs real email delivery, which is the exact custom-SMTP
  effort this project already attempted and abandoned (`STATUS.md` Bucket 4).

## Tier B Detailed Design — Social Layer (2026-07-17)

Full design for Tier B, at the request of Kayvan, so it's ready to build directly whenever it gets
scheduled — **not yet scheduled or committed**; this is design work, not a Bucket 1 item. This is a
genuine identity shift for the app: everything built through Phase 1 is strictly private-per-user
(RLS with zero exceptions, `AppSpec.md`'s Monetization section says "personal use," no page has ever
worked without signing in). This section assumes that shift is wanted and designs it carefully, but
building it is still a real decision to make consciously when the time comes — likely Phase 2+ work
(see `DevelopmentPlan.md`'s Phase 2, "the full intended feature set").

Four foundational questions were resolved with Kayvan before writing this (2026-07-17), and
everything below is designed around these answers:
1. **Rankings are private by default; a user opts in to make them public.** No third
   "followers-only" tier — see the Judgment Calls section below for why.
2. **Following is one-directional, no approval required** (like Letterboxd, not Facebook).
3. **Community-rank aggregates only ever include users whose rankings are public** — a user who
   stays private never contributes to any aggregate, anonymized or not. One consistent rule.
4. **Shared collections are genuinely public** — viewable by anyone with the link, no account
   required. This is the app's first-ever unauthenticated page; see the RLS section below for how
   that's kept narrow and safe rather than opening up broad public access.

### Scope for v1

**In scope:**
- User profiles with a username and a public/private rankings-visibility toggle.
- One-directional following.
- Community rank (aggregate score across public users) shown next to "your rank" on an episode.
- A taste-similarity score between two users with public rankings.
- Flat (non-threaded) per-episode comments, with an author-set spoiler tag.
- Collections: private by default, shareable via an unguessable link (no account needed to view).
- A Discover page built on the same community-rank aggregate (trending, disagreements, hidden gems).

**Explicitly out of scope for v1** (deliberate simplifications, not oversights):
- A "followers-only" visibility tier — binary private/public only (see Judgment Calls).
- Blocking/muting other users — no defensive tooling yet; revisit if this ever opens beyond a small
  trusted circle.
- Comment editing, threading/replies, or a reporting/moderation pipeline — delete-your-own-comment
  is the only moderation primitive in v1.
- A public directory or browse/search page for public profiles or shared collections — reachable
  only via a direct username or share link, never listed anywhere. Meaningfully lower privacy risk
  than a browsable directory, for very little lost functionality at this app's scale.
- Any caching/materialized-view infrastructure for aggregates — computed live via a normal query at
  read time. Fine at personal/small-friend-group scale; revisit only if it's ever actually slow.
- Notifications/activity feed of any kind (already Tier C — needs real email delivery, an
  already-abandoned effort this project attempted, see `STATUS.md` Bucket 4).

### New data model

All new tables live alongside the existing `shows`/`episodes`/`episode_rankings`/
`episode_comparisons`/`user_shows` schema (`supabase/migrations/`) — nothing here changes any
existing table.

**`user_profiles`** — one row per user, created the first time they set a username (not at signup;
see Judgment Calls on why this is opt-in rather than automatic).
- `user_id` (PK, references `auth.users`)
- `username` (unique, citext or lowercased — the public handle; `auth.users.email` must never be
  exposed to any other user anywhere in this feature set)
- `display_name` (nullable — falls back to `username` if unset)
- `rankings_visibility` (`text`, `'private' | 'public'`, default `'private'`)
- `created_at`

**`follows`**
- `follower_id`, `followee_id` (both reference `auth.users`)
- `created_at`
- Primary key `(follower_id, followee_id)`; check constraint `follower_id <> followee_id`

**`collections`**
- `id` (uuid PK)
- `user_id` (owner, references `auth.users`)
- `title`, `description` (nullable)
- `share_token` (uuid, nullable — generated the moment the owner first clicks "share"; `null` means
  never shared, not "shared but revoked" — see RLS below for why this is a token, not a boolean)
- `created_at`, `updated_at`

**`collection_items`**
- `collection_id` (references `collections`), `episode_id` (references `episodes`)
- `position` (integer — user-orderable within the collection, independent of that episode's actual
  rank; a collection is a curated list, not a ranking)
- `note` (text, nullable — a short "why this is here")
- Primary key `(collection_id, episode_id)` — an episode appears at most once per collection, but
  can appear in many different collections

**`episode_comments`**
- `id` (uuid PK)
- `episode_id` (references `episodes`), `user_id` (author, references `auth.users`)
- `body` (text)
- `contains_spoilers` (boolean, default `false` — self-tagged by the author at post time)
- `created_at`

### RLS design

Same posture as the rest of this app: default-deny, explicit policies only, session-aware client
for everything user-scoped, service-role client only for the one narrow case below.

- **`user_profiles`**: any authenticated user can read a row where `rankings_visibility = 'public'`,
  or their own row regardless of visibility. A user can insert/update only their own row
  (`user_id = auth.uid()`).
- **`follows`**: a user can always read their own two lists (who they follow, who follows them). A
  user can insert a row only as themselves (`follower_id = auth.uid()`) **and** only where the
  target's `user_profiles.rankings_visibility = 'public'` — enforced in the insert policy's `with
  check` via a subquery against `user_profiles`, not just at the UI layer. A user can delete only
  rows where they're the follower (unfollowing). If a public user later flips back to private,
  existing `follows` rows pointing at them are **not** automatically deleted (cheap to leave as
  historical fact), but every *read* path for that user's rankings/profile re-checks
  `rankings_visibility` live — so a stale `follows` row confers no actual access once someone goes
  private. Follower/following *counts* on a public profile are fine to expose to anyone (just a
  number); the full list of who-follows-whom stays visible only to the two people directly involved.
- **`collections`** / **`collection_items`**: the owner (`user_id = auth.uid()` via `collections`)
  has full CRUD. **No RLS policy grants read access to any other role at all, including `anon`** —
  the public-link view is deliberately *not* a database-level policy. Instead, the public collection
  page (a new route, unauthenticated) is a Server Component that takes a `share_token` from the URL
  and looks the collection up using the **service-role client**, scoped to exactly `where
  share_token = $1` — nothing else. This mirrors how `importShowFromTmdb` already uses the
  service-role client for one narrow, deliberate, server-only purpose rather than writing a new
  `anon`-role RLS policy — a genuinely new category of risk this app has never needed before (RLS
  policies are easy to reason about because every existing one keys off `auth.uid()`, which doesn't
  exist for anonymous requests at all). The random, unguessable `share_token` *is* the security
  boundary here, the same trust model as a Google Docs "anyone with the link" share — not "this data
  is public," just "this data is reachable if you have the specific secret."
- **`episode_comments`**: any authenticated user can read any comment (posting a comment is a
  deliberate public act, unlike ranking data — this is intentionally *not* gated by the commenter's
  own `rankings_visibility`). Insert only as yourself; delete only your own.

### Feature flows

**Profiles & visibility.** A new `/settings` (or a section of an existing one) lets a user claim a
username and flip `rankings_visibility`. Nothing else in this feature set is reachable until a
username exists — no username means no public profile, no followability, no comment authorship
byline beyond "you," etc. (comments still need *a* display identity even for otherwise-private
users, so account for a fallback display name if no username is set — worth a specific product
decision when this gets built, flagged here rather than guessed at).

**Following.** A public profile page at `/u/[username]` shows a "Follow" button (hidden if the
profile is private, or if it's your own). Following is instant, no request/accept step. The
follower's dashboard could reasonably show a "people I follow" section — not designing that widget
in detail here since it's presentation, not architecture.

**Community rank.** Needs a genuinely new page this app doesn't have yet: a standalone episode
detail page (today, episodes only ever appear inline in a show's list — there's no
`/shows/[showId]/episodes/[episodeId]` route). That page shows "your rank" (existing, per-user data,
already computed via `getShowRankingDisplay`) alongside "community rank": the average derived score
for that episode across every user with `rankings_visibility = 'public'` who has it comparatively
placed (`episode_rankings.rank_position is not null`). Cold-start-bucket-only placements are
excluded from the v1 aggregate (a known simplification, consistent with this project's existing
"don't chase small-show edge cases" stance from earlier the same session) — computed as a live SQL
aggregate (join `episode_rankings` to a per-user episode-count subquery, apply the same linear
score formula from `@/lib/ranking/score.ts` in SQL), not a TypeScript replay per user.

**Taste similarity.** For two users who've both opted into public rankings, look at every show both
have comparatively ranked at least 2 episodes of. For each shared episode pair on a shared show,
check whether both users agree on which one ranks higher (a "concordant" pair) or disagree
("discordant"). Similarity = concordant pairs ÷ total compared pairs, as a percentage — this is a
standard rank-correlation approach (Kendall's Tau, expressed as a percentage rather than the usual
-1..1 range), computed directly from each user's final `rank_position` values, no need to replay
comparison history. Undefined (show "not enough shared data yet," not a number) if there's no show
both have ranked with at least 2 shared episodes each.

**Comments.** Flat list under the new episode detail page, newest first. `contains_spoilers` comments
render blurred/collapsed behind a "Show spoiler" click. No editing — delete and repost. No reporting
pipeline in v1 (see Scope above).

**Collections.** A signed-in user manages their own collections at `/collections` (list, create,
reorder items, add a note per item). "Share" generates a `share_token` the first time it's clicked
(idempotent after that — re-clicking doesn't rotate the token) and produces a public URL, something
like `/c/[shareToken]`, rendered by the service-role-backed public page described in RLS above.

**Discover page.** Built entirely on the same community-rank aggregate infrastructure: "trending"
(most `episode_rankings`/`user_shows` activity among public users recently, by `created_at`),
"biggest community disagreements" (highest score variance across public users for an episode),
"hidden gems" (high average community score, low public-user sample size). All read-only views over
data the community-rank feature already needs to compute — no new write paths.

### New pages/routes needed

- `/settings` (or a new section of it) — username + visibility.
- `/u/[username]` — public profile page.
- `/shows/[showId]/episodes/[episodeId]` — new standalone episode detail page (community rank +
  your rank + comments). Nothing today links to a single episode outside a show's list.
- `/discover` — trending / disagreements / hidden gems.
- `/collections` — the signed-in owner's management view.
- `/c/[shareToken]` — the public, unauthenticated shared-collection view.
- Search needs to grow a "people" result type (username search) alongside the existing show search.

### Judgment calls flagged for review

Real decisions made while designing this that weren't put in front of Kayvan individually — surface
these before building, don't treat them as silently settled:
1. **Binary private/public visibility, no "followers-only" tier.** Reasoned out during design: since
   following requires no approval, a "followers-only" tier would mean anyone could grant themselves
   access just by following — it wouldn't actually gate anything, so it would be a fake privacy
   control. A real followers-only tier would need to change the follow model to require approval
   (declined earlier this session in favor of the simpler one-directional model). Binary is the only
   version of "followers-only" that's actually coherent given the follow model already chosen.
2. **Username required before any social feature is usable at all**, rather than defaulting to
   something derived from the account (email should never be exposed). Simple and safe, but means a
   real onboarding step — flagged as a UX flow to design properly, not detailed here.
3. **Taste similarity formula** (Kendall's-Tau-style concordant-pair percentage) is a defensible,
   standard choice, but genuinely just one of several reasonable formulas — confirm it "feels right"
   once there's real two-user data to try it against, same spirit as the score-from-position
   formula's own "expect to tune" framing.
4. **Comments are visible to any signed-in user regardless of the commenter's own
   `rankings_visibility`** — treated as a deliberate public act distinct from ranking data. Worth
   confirming this reads as intuitive rather than inconsistent once it's actually in front of users.
5. **No moderation beyond delete-your-own-comment.** Reasonable for a small, personal/friends-scale
   app; would need real reconsideration before ever opening this to strangers at any real scale.

### Mobile-specific (once the mobile/responsive check in `STATUS.md` Bucket 4 happens)
- **Swipe gestures for the comparison prompt** (swipe left/right for better/worse, tap for neutral)
  — a natural fit for a binary-choice mechanic on a touchscreen, arguably a better interaction than
  three buttons once there's a real mobile pass.

### Accessibility
- Keyboard navigation and screen-reader labeling for the ranking controls specifically (the
  comparison/cold-start buttons are the app's core interaction, so they're the highest-value place
  to get this right, ahead of the rest of the app).

## Original 5-Idea Engagement Brainstorm — Resolved (2026-07-17)

The 5 engagement/growth ideas from earlier the same session (paused mid-discussion when the QA
testing round took over) are now all resolved:

1. ~~Shareable "ranking cards"~~ — **denied**. Not being pursued.
2. **Friends/following + comparing rankings** — **confirmed, to build eventually as part of Tier B**
   (already fully designed — see "Tier B Detailed Design — Social Layer" above).
3. **Global/community consensus per show** — **confirmed, to build eventually as part of Tier B**
   (the "community rank" + Discover page pieces, already in the same Tier B design above).
4. **Personal stats & a "wrapped"-style recap** — **confirmed**. Detailed design below.
5. **Gamification (achievements/streaks)** — **confirmed**. Detailed design below.

Like Tier B, ideas 4 and 5 below are **confirmed direction, fully designed, not yet scheduled** —
they aren't in `STATUS.md`'s Bucket 1 next-session queue, which is reserved for what's actually
agreed to be built next. Move either into Bucket 1 when it's actually time to build it.

## Personal Stats & Recap (confirmed 2026-07-17, not yet scheduled)

A live, always-current personal recap page — not a once-a-year snapshot like Spotify Wrapped, which
would need a scheduled/cron mechanism this app has no infrastructure for yet (deliberately simpler
for v1; a dated annual snapshot is a reasonable v2 if this ever feels worth the extra machinery).
Distinct from, but related to, Tier A item 10 ("statistics view + visualizations of a show's
existing rankings" — per-show): this is the cross-show, whole-account version. Build them together
if convenient, but they're separate pieces of UI over related data.

**Entirely computable from data that already exists** — no new tables needed at all, unlike Tier B.
Every stat below is a read over `episode_rankings`/`episode_comparisons`/`user_shows`, all already
timestamped and scoped to the signed-in user via existing RLS:
- Total episodes ranked, total shows started, total shows fully completed (`done: true` via
  `getShowRankingDisplay`).
- Highest-rated episode overall, across every show (not just per-show) — the single episode with
  the highest derived score account-wide.
- "Most contested episode" — the episode with the highest total comparison count recorded
  (decisive + neutral combined) — a reasonable, simple proxy for "took the most back-and-forth to
  place," without needing the more elaborate tie-break-fallback detection flagged as a Tier-A
  ranking-confidence v2 idea.
- A favorite show — simplest defensible definition: the show with the highest average episode
  score among shows with at least, say, 4 ranked episodes (avoids a 1-episode show trivially "winning"
  with its automatic 10). Confirm this definition feels right once there's real data to check it
  against, same spirit as the score formula's own "expect to tune" framing.
- Ranking activity over time — a simple calendar-style view of which days had ranking activity,
  derived directly from `created_at` timestamps already on `episode_comparisons`/`episode_rankings`.

**Explicitly not included**: anything like "time spent ranking" — there's no session-duration
tracking today, and adding one just for this stat isn't worth the new event-logging infrastructure
it would need. Stick to countable facts (comparisons made, episodes ranked, shows completed), not
timing.

**New page**: a single `/stats` (or similar) route, session-aware, no new tables, no new RLS
policies — the simplest addition on this whole list.

## Gamification: Achievements & Streaks (confirmed 2026-07-17, not yet scheduled)

Scoped deliberately smaller than the external design review's original pitch (no XP, no levels, no
profile-customization unlocks) — those only pay off once there's an audience to show status off to,
which depends on Tier B (the social layer) actually existing and being used. Revisit XP/levels if
Tier B ships and gets real usage; not worth building for no one to see yet.

**v1 achievement set** — deliberately only things computable from a user's *own* data, nothing
requiring cross-user comparison (no "top 1%") or curated show lists (no "completed the MCU"):
- First ranking (ranked your first-ever episode).
- 10 / 100 / 1,000 total comparisons made, across all shows.
- Completed your first show (reached `done: true`).
- Completed 5 shows.

**Data model**: achievement *definitions* (id, name, description, the check itself) are plain code
constants, not a database table — a small, fixed, hand-curated list doesn't need to be
data-driven. One new table, `user_achievements` (`user_id`, `achievement_id`, `unlocked_at`),
records *when* a user actually unlocked each one, so that's preserved even though every achievement
here happens to be monotonic (can't un-complete a show). Checked lazily at read time (e.g. whenever
the dashboard loads: compute current stats, compare against each definition, insert any
newly-qualifying `user_achievements` rows, show a small "just unlocked!" banner for anything new)
— deliberately **not** wired into `ranking-session`'s write path at all, so the core ranking flow
stays exactly as simple and fast as it is today; achievement-checking is a side concern, not part of
the hot path.

**Streaks**: "ranked something every day for N days." Fully derivable from existing timestamps (does
any `episode_comparisons`/`episode_rankings` row exist for each of the last N consecutive calendar
days) — no new schema needed, computed live at this scale rather than cached, same reasoning Tier
B's community aggregates use.

**New surface**: a small achievements section (dashboard or its own `/achievements` page) showing
unlocked (with the date) and locked (grayed out, with a hint of what unlocks it) achievements, plus
a streak indicator somewhere prominent like the dashboard header.
