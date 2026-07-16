# Episode Ranker — Current Status

**Read this file first** — before the other docs, before doing anything else. It's the single
"what's actually going on right now" pointer, kept short and current on purpose.

Last updated: 2026-07-16. **Phase 1 fully done and verified — piece 1 (auth) and piece 2a (show
search/import) both hands-on confirmed working, including the confirmation-link bug's real fix.**
Root cause turned out to be Supabase's free tier only honoring a custom email template while custom
SMTP is actively configured — since custom SMTP (Resend) was abandoned as backlog, real emails fell
back to Supabase's stock `?code=<uuid>` link pattern instead of `/auth/confirm`'s `token_hash`/`type`.
Fixed by handling `?code=` directly in `proxy.ts` via `exchangeCodeForSession` (commit `13880c8`) —
**Kayvan confirmed via a real signup that this now lands on `/dashboard` already logged in.** Piece
2b (the actual ranking UI) is next — see Bucket 1.

## Punch List (ranked — read this section first for "what's actually next")

Every open item gets triaged into exactly one bucket the moment it surfaces, per
[ProcessAndRoles.md](ProcessAndRoles.md#punch-list-triage). Default is "log it, don't chase it"
unless it's small or genuinely blocking.

**Bucket 1 — Blocking / next in sequence:**
1. Phase 1, piece 2, split into two sub-steps given its complexity:
   - ~~2a~~ — **done**: show search (TMDB) → pick a show → import its episodes into
     `shows`/`episodes` → a basic "my shows" list. See History.
   - **2b** (not started): the actual
     ranking UI — cold-start buttons, then comparative better/worse/neutral prompts wired to
     `website/src/lib/ranking/`. Architecturally tricky: the algorithm expects synchronous
     comparisons but a real website only gets one answer per HTTP request. Planned approach:
     reconstruct `ShowRankingState` fresh on every request from `episode_rankings` +
     `episode_comparisons` (which already record everything needed), and give the algorithm a
     comparator that replays already-answered comparisons instantly and throws a sentinel error on
     the first genuinely new one — that sentinel becomes "here's the next question to show the
     user." No new schema/state needed for this beyond what already exists, except adding
     `cold_start_bucket`/`cold_start_sequence` columns to `episode_rankings` (currently only has
     `rank_position`, which is correct for comparatively-placed episodes but has nowhere to persist
     an episode still sitting in cold-start).

**Bucket 2 — Bugs/features needing hands-on verification or fixing:**
(empty for now — folded into Bucket 1 above)

**Bucket 3 — Design decisions needing human input (don't block code):**
(empty for now — the tie-break selection question that lived here is resolved, see History below)

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
   further — the default provider works fine for continued solo development. Revisit if/when other
   people start using the app, or if the 2/hour cap is actually hit in practice.

**Bucket 5 — Rework flagged for a later phase, not being worked now:**
(empty for now)

## Deviations Awaiting Review

Solo judgment calls made mid-session that weren't slept on get logged here and surfaced at the
start of the next session for a second look — even solo, "I decided this at 11pm without thinking
it through" is worth a deliberate re-check, not silent acceptance.

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
