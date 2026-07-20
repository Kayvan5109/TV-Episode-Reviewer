/**
 * Persistence/orchestration layer for the ranking algorithm (`@/lib/ranking`) — the piece that
 * makes an inherently synchronous, in-memory algorithm work across separate HTTP requests.
 *
 * The core problem: `addComparativeEpisode` expects a synchronous-or-async `Comparator` callback
 * it can just call and get an answer from. A real website only gets one answer per request (show
 * a question, wait for a click, which arrives as a brand new request with no memory of the last
 * one). The approach (see Docs/STATUS.md Bucket 1, piece 2b): treat `episode_rankings` +
 * `episode_comparisons` as the only durable state, reconstruct a fresh `ShowRankingState` from
 * them on every request (`reconstruct.ts`), and give the algorithm a comparator
 * (`makeReplayComparator`, `comparator.ts`) that replays already-answered comparisons instantly and
 * throws a sentinel (`NeedsComparisonInput`) the first time it hits a genuinely new one — that
 * sentinel becomes "here's the next question to show the user."
 *
 * Every function here derives the signed-in user itself via `getUser()` against the
 * session-aware client (`@/lib/supabase/serverSession`) — never accepts a caller-supplied user id.
 * All queries are additionally scoped by that verified id explicitly (defense in depth on top of
 * RLS), matching the pattern already used for `user_shows`/`shows` elsewhere in this codebase (see
 * `@/app/shows/search/actions.ts`).
 */

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';
import {
  addComparativeEpisode,
  createInitialShowState,
  currentDisplayOrder,
  isColdStart,
} from '@/lib/ranking/engine';
import type { ColdStartBucket, ComparisonResult, EpisodeId, ShowRankingState } from '@/lib/ranking/types';
import { scoreForPosition } from '@/lib/ranking/score';
import { showConfidence } from '@/lib/ranking/confidence';
import { makeReplayComparator } from './comparator';
import { reconstructShowRankingState, type ComparisonRow, type RankingRow } from './reconstruct';
import { NeedsComparisonInput, type NextRankingStep } from './types';

type SupabaseSessionClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Resolves the *real* signed-in user id via `getUser()` — never trusts a caller-supplied id. */
async function requireUserId(supabase: SupabaseSessionClient): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not signed in.');
  }
  return user.id;
}

interface LoadedShowRanking {
  /** Every episode of this show, ordered season/episode ascending — the order new episodes surface in. */
  episodeIdsInOrder: EpisodeId[];
  state: ShowRankingState;
  /**
   * `episode_rankings.created_at` for every episode with a ranking row (cold-start or comparative)
   * — set once, when that episode's first judgment was recorded, and untouched by later
   * `persistRankedPositions` upserts (see this field's use in `getShowRankingDisplay`). Episodes
   * with no `episode_rankings` row at all (`unranked`) have no entry here.
   */
  createdAtByEpisode: Map<EpisodeId, string>;
}

/**
 * Loads every episode of `showId` (global reference data, any authenticated user may read it) plus
 * this user's `episode_rankings`/`episode_comparisons` rows touching those episodes, and
 * reconstructs a `ShowRankingState` from them.
 */
async function loadShowRankingState(
  supabase: SupabaseSessionClient,
  userId: string,
  showId: string
): Promise<LoadedShowRanking> {
  const { data: episodeRows, error: episodesError } = await supabase
    .from('episodes')
    .select('id')
    .eq('show_id', showId)
    .order('season_number', { ascending: true })
    .order('episode_number', { ascending: true });

  if (episodesError) {
    throw new Error(`Failed to load episodes for show ${showId}: ${episodesError.message}`);
  }

  const episodeIdsInOrder = ((episodeRows ?? []) as { id: string }[]).map((row) => row.id);

  if (episodeIdsInOrder.length === 0) {
    return { episodeIdsInOrder, state: createInitialShowState(), createdAtByEpisode: new Map() };
  }

  // No `.in('episode_id', ...)` here on purpose — see Docs/STATUS.md Bucket 1 item 1: embedding
  // every episode id of a show as a literal id list in the query URL eventually exceeds
  // Supabase/PostgREST's URL-length limit for shows with enough episodes (a real production 400 on
  // "The Challengers"). `.eq('user_id', userId)` alone already bounds this to one person's lifetime
  // ranking data, a perfectly reasonable query size for a personal-use app — filter down to this
  // show's episodes in application code afterward instead.
  const { data: rankingRowsRaw, error: rankingError } = await supabase
    .from('episode_rankings')
    .select('episode_id, rank_position, cold_start_bucket, cold_start_sequence, created_at')
    .eq('user_id', userId);

  if (rankingError) {
    throw new Error(`Failed to load episode rankings for show ${showId}: ${rankingError.message}`);
  }

  const episodeIdSet = new Set(episodeIdsInOrder);
  const rankingRows = ((rankingRowsRaw ?? []) as (RankingRow & { created_at: string })[]).filter((row) =>
    episodeIdSet.has(row.episode_id)
  );

  // Same reasoning as above, applied to episode_comparisons: no `.in('episode_a_id'/'episode_b_id',
  // ...)`. Filtering purely by `user_id` also means a comparison row touching this show's episodes
  // can only ever be returned once, so the old "query both sides, de-dupe by row id" dance (which
  // existed specifically to route around the id-list URL-length problem) collapses into one query,
  // filtered application-side to rows touching this show's episodes on either side.
  const { data: comparisonRowsRaw, error: comparisonError } = await supabase
    .from('episode_comparisons')
    .select('id, episode_a_id, episode_b_id, result')
    .eq('user_id', userId);

  if (comparisonError) {
    throw new Error(`Failed to load episode comparisons for show ${showId}: ${comparisonError.message}`);
  }

  const comparisonRows = ((comparisonRowsRaw ?? []) as ComparisonRow[]).filter(
    (row) => episodeIdSet.has(row.episode_a_id) || episodeIdSet.has(row.episode_b_id)
  );

  const state = reconstructShowRankingState(rankingRows as RankingRow[], comparisonRows);

  const createdAtByEpisode = new Map<EpisodeId, string>();
  for (const row of rankingRows) {
    createdAtByEpisode.set(row.episode_id, row.created_at);
  }

  return { episodeIdsInOrder, state, createdAtByEpisode };
}

/** First episode of the show (in season/episode order) with no `episode_rankings` row at all yet. */
function nextUnrankedEpisode(
  episodeIdsInOrder: readonly EpisodeId[],
  state: ShowRankingState
): EpisodeId | undefined {
  const rankedSet = new Set(state.ranked);
  const coldStartSet = new Set(state.coldStart.map((entry) => entry.episodeId));
  return episodeIdsInOrder.find((id) => !rankedSet.has(id) && !coldStartSet.has(id));
}

/**
 * Whether `episodeId` has no ranking data recorded for it yet (no `episode_rankings` row at all,
 * cold-start or comparative) — the per-episode analogue of `nextUnrankedEpisode`, but without the
 * "is it *next*" constraint: once ranking can happen in any order (see `getNextStepForEpisode`),
 * "has this specific episode been dealt with yet" is the only question that still makes sense.
 * Does *not* check whether `episodeId` belongs to this show at all — callers that need to
 * distinguish "unranked" from "not part of this show" should check `episodeIdsInOrder` separately
 * (see `getNextStepForEpisode`, which needs to tell those two apart to decide whether to throw).
 */
function isUnranked(loaded: LoadedShowRanking, episodeId: EpisodeId): boolean {
  const rankedSet = new Set(loaded.state.ranked);
  const coldStartSet = new Set(loaded.state.coldStart.map((entry) => entry.episodeId));
  return !rankedSet.has(episodeId) && !coldStartSet.has(episodeId);
}

/**
 * Persists a post-placement `ShowRankingState`'s `ranked` list: writes `rank_position` (1-based,
 * best = 1, matching `@/lib/ranking`'s convention) for *every* comparatively-ranked episode, not
 * just the newly-placed one — inserting into the middle of the list shifts every episode after it,
 * and folding cold start in for the first time assigns every previously-cold-start episode a
 * position for the first time too. Also clears `cold_start_bucket`/`cold_start_sequence` for
 * anything now in `ranked`, since those columns only mean something while `rank_position IS NULL`.
 *
 * Simple full-rewrite rather than diffing against the previous state: correctness over a
 * micro-optimization, and shows are small enough (personal use) for this to be cheap.
 */
async function persistRankedPositions(
  supabase: SupabaseSessionClient,
  userId: string,
  state: ShowRankingState
): Promise<void> {
  if (state.ranked.length === 0) return;

  const rows = state.ranked.map((episodeId, index) => ({
    user_id: userId,
    episode_id: episodeId,
    rank_position: index + 1,
    cold_start_bucket: null,
    cold_start_sequence: null,
  }));

  const { error } = await supabase
    .from('episode_rankings')
    .upsert(rows, { onConflict: 'user_id,episode_id' });

  if (error) {
    throw new Error(`Failed to persist rank positions: ${error.message}`);
  }
}

/**
 * Core "what's next" derivation, given an already-loaded state. Loops rather than returning after
 * a single step: a successful comparative placement can immediately expose a *further* unranked
 * episode whose next question also happens to be fully answerable by replay (e.g. crossing
 * COLD_START_THRESHOLD, or a multi-hop tie-break chain where every hop was already answered) — this
 * lets all of that resolve in one server round trip, only stopping once a genuinely new question
 * is hit or every episode is accounted for. Bounded: each successful iteration accounts for one
 * more previously-unranked episode, so this terminates in at most `episodeIdsInOrder.length` steps.
 */
async function deriveNextStep(
  supabase: SupabaseSessionClient,
  userId: string,
  loaded: LoadedShowRanking
): Promise<NextRankingStep> {
  let state = loaded.state;

  for (;;) {
    const nextEpisode = nextUnrankedEpisode(loaded.episodeIdsInOrder, state);
    if (!nextEpisode) {
      return { type: 'done' };
    }

    if (isColdStart(state, loaded.episodeIdsInOrder.length)) {
      return { type: 'coldStart', episode: nextEpisode };
    }

    const comparator = makeReplayComparator(state.history);
    try {
      const newState = await addComparativeEpisode(
        state,
        nextEpisode,
        comparator,
        loaded.episodeIdsInOrder.length
      );
      await persistRankedPositions(supabase, userId, newState);
      state = newState;
      continue;
    } catch (error) {
      if (error instanceof NeedsComparisonInput) {
        return { type: 'compare', subject: error.subject, reference: error.reference };
      }
      throw error;
    }
  }
}

/**
 * Deletes every `episode_comparisons` row for `userId` that involves any of `episodeIds` on either
 * side (`episode_a_id` or `episode_b_id`) — the same "a row could have the id of interest on either
 * side, query both and delete both" reasoning `loadShowRankingState`'s reads used to apply, just as
 * a delete instead of a select. Two separate `.in()` deletes rather than one hand-built OR filter
 * string, matching this file's existing style.
 *
 * Only called by `resetEpisodeRanking` now, always with exactly one episode id — safe from the
 * URL-length problem documented on `deleteShowRankingData` (Docs/STATUS.md Bucket 1 item 1) because
 * `episodeIds.length` is always 1 here, never a whole show's episode list. `deleteShowRankingData`
 * used to call this too (with a full show's episode ids), which was the actual broken call site —
 * it now uses a Postgres RPC instead; see that function's doc comment.
 */
async function deleteComparisonsInvolving(
  supabase: SupabaseSessionClient,
  userId: string,
  episodeIds: readonly EpisodeId[]
): Promise<void> {
  if (episodeIds.length === 0) return;

  const [aSide, bSide] = await Promise.all([
    supabase.from('episode_comparisons').delete().eq('user_id', userId).in('episode_a_id', episodeIds),
    supabase.from('episode_comparisons').delete().eq('user_id', userId).in('episode_b_id', episodeIds),
  ]);

  if (aSide.error) {
    throw new Error(`Failed to delete episode comparisons (episode_a_id side): ${aSide.error.message}`);
  }
  if (bSide.error) {
    throw new Error(`Failed to delete episode comparisons (episode_b_id side): ${bSide.error.message}`);
  }
}

/**
 * Removing a show deletes the signed-in user's ranking data for it — a clean slate, not an
 * instant-restore-on-re-add (decided mechanics; see this session's design notes / Docs/STATUS.md).
 * Deletes every `episode_comparisons` row touching any of the show's episodes (both sides) and
 * every `episode_rankings` row for those episodes, both scoped to this user. Deliberately does
 * *not* touch the global `shows`/`episodes` reference tables (shared across all users, written only
 * by the TMDB import path) and does *not* touch `user_shows` — that row isn't ranking state, it's
 * the caller's concern (see `removeShow` in `@/app/shows/[showId]/actions.ts`, which deletes it
 * directly, mirroring how `addShow` writes it directly rather than through this module).
 *
 * Unlike the read paths above (`loadShowRankingState`), "fetch everything and filter in app code"
 * doesn't work for a delete — you can't delete rows you only know about from a `SELECT`, the
 * `DELETE`'s own `WHERE` needs to be scoped correctly server-side without an id list on the wire
 * (see Docs/STATUS.md Bucket 1 item 1). So this calls a Postgres RPC
 * (`supabase/migrations/20260719000000_delete_show_ranking_data.sql`) that does the id-list
 * filtering *inside* the database via a join through `episodes.show_id`, instead of shipping every
 * episode id of the show over HTTP. That function is `security invoker` (Postgres's default, but
 * declared explicitly): `episode_comparisons`/`episode_rankings`'s own RLS policies (delete scoped
 * to `user_id = auth.uid()`) still apply using the *caller's real* `auth.uid()`, so RLS remains the
 * actual enforcement backstop even though `p_user_id` is also passed explicitly — same "defense in
 * depth on top of RLS" posture as every other query in this file (see the module comment).
 *
 * A show with no episodes (or no ranking data at all) is a no-op, not an error — the RPC's deletes
 * simply match zero rows in that case.
 */
export async function deleteShowRankingData(showId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const userId = await requireUserId(supabase);

  const { error } = await supabase.rpc('delete_show_ranking_data', {
    p_show_id: showId,
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`Failed to delete ranking data for show ${showId}: ${error.message}`);
  }
}

/**
 * Re-ranking an already-ranked episode clears *both* its placement (`rank_position`, or its
 * cold-start bucket if it hasn't folded into comparative ranking yet) *and* every
 * `episode_comparisons` row involving it — not just the position. If old comparisons stayed, the
 * replay comparator (`makeReplayComparator`) would just answer from that stale history instead of
 * ever asking the user again about any pair they'd already compared, which would defeat the actual
 * point of re-ranking: the user's opinion changed, so old comparisons involving this episode are
 * exactly the ones that might now be wrong.
 *
 * Deletes the episode's `episode_rankings` row entirely rather than nulling its columns out — a row
 * that exists with everything null isn't a state `reconstructShowRankingState` was ever designed to
 * produce. Deleting it keeps the episode indistinguishable from "never ranked at all", which is
 * exactly the intended post-reset state: it flows straight back through `getNextStepForEpisode`'s
 * normal unranked path (cold-start-or-compare) like any other never-touched episode.
 *
 * Throws if `episodeId` doesn't belong to `showId` (mirrors `getNextStepForEpisode`'s existing
 * check) or if the episode has no ranking data to reset (mirrors `isUnranked`'s existing notion of
 * "untouched") — re-ranking something that was never ranked isn't a meaningful operation.
 *
 * After deleting, reloads state fresh from DB and re-persists the remaining `ranked` list via
 * `persistRankedPositions` to renormalize `rank_position` and close the numbering gap the deletion
 * left behind. Not required for correctness — scores are derived from array index at read time, not
 * the raw stored integer, so a gap wouldn't actually break anything — but it matches this file's
 * existing "simple full-rewrite over gaps" style and keeps the DB state clean.
 *
 * Accepted consequence, not a bug: if this drops the show's total ranked-episode count below its
 * effective cold-start threshold (see `effectiveColdStartThreshold` in `@/lib/ranking/constants`),
 * the show reverts to cold-start mode for whatever gets placed next (including this same
 * re-ranked episode) — `isColdStart` is always derived from the current live count, so this is
 * existing, correct behavior, not something new to special-case around for a personal-use app at
 * this scale.
 */
export async function resetEpisodeRanking(showId: string, episodeId: EpisodeId): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const userId = await requireUserId(supabase);
  const loaded = await loadShowRankingState(supabase, userId, showId);

  if (!loaded.episodeIdsInOrder.includes(episodeId)) {
    throw new Error(`Episode ${episodeId} does not belong to show ${showId}.`);
  }
  if (isUnranked(loaded, episodeId)) {
    throw new Error(`Episode ${episodeId} has no ranking to reset.`);
  }

  await deleteComparisonsInvolving(supabase, userId, [episodeId]);

  const { error: rankingError } = await supabase
    .from('episode_rankings')
    .delete()
    .eq('user_id', userId)
    .eq('episode_id', episodeId);

  if (rankingError) {
    throw new Error(`Failed to delete ranking for episode ${episodeId}: ${rankingError.message}`);
  }

  const reloaded = await loadShowRankingState(supabase, userId, showId);
  await persistRankedPositions(supabase, userId, reloaded.state);
}

/** "What should the user be asked/shown next for this show?" See `NextRankingStep`'s doc comment. */
export async function getNextRankingStep(showId: string): Promise<NextRankingStep> {
  const supabase = await createSupabaseServerClient();
  const userId = await requireUserId(supabase);
  const loaded = await loadShowRankingState(supabase, userId, showId);
  return deriveNextStep(supabase, userId, loaded);
}

/**
 * Discriminated result of "what should the user be asked in order to rank *this specific*
 * episode?" — the per-episode counterpart to `NextRankingStep`. `getNextRankingStep` always
 * follows the show's fixed season/episode order; this answers the question for whichever episode
 * the user actually clicked, which is what a picker UI (rank any episode, in any order) needs.
 *
 * `'alreadyRanked'` covers two distinct-but-equivalent situations from the caller's point of view:
 * the episode already has a `rank_position`/cold-start entry from a previous session, or the
 * comparison(s) needed to place it *right now* were all already answered before (replay resolved
 * the whole placement without a new question) — either way, there's nothing left to ask, so the UI
 * should just say so rather than treating it as an error.
 */
export type TargetedRankingStep =
  | { type: 'alreadyRanked' }
  | { type: 'coldStart'; episode: EpisodeId }
  | { type: 'compare'; subject: EpisodeId; reference: EpisodeId };

/**
 * "What should the user be asked/shown next in order to rank `episodeId` specifically?" Unlike
 * `getNextRankingStep` (which always follows `nextUnrankedEpisode`'s fixed order), this lets the
 * UI drive ranking for any episode the user picks, in whatever order they pick them — the
 * algorithm itself has no notion of a "required" order (see this file's module comment and the
 * session notes that motivated this function), so nothing here needs to enforce one either.
 *
 * Throws if `episodeId` isn't one of this show's episodes at all (a real bug — a stale link or a
 * bad id, not a normal "nothing to do" case). Returns `'alreadyRanked'` if it already has ranking
 * data. Otherwise dispatches on the show's overall mode: cold start just needs the bucket
 * question; comparative mode tries to resolve the placement via replay first (in case every
 * comparison it needs was already answered, e.g. as a side effect of *another* episode's
 * placement) and only surfaces a real `'compare'` question once replay hits something genuinely
 * new — mirrors `deriveNextStep`'s own replay-then-ask approach, just scoped to one episode.
 */
export async function getNextStepForEpisode(
  showId: string,
  episodeId: EpisodeId
): Promise<TargetedRankingStep> {
  const supabase = await createSupabaseServerClient();
  const userId = await requireUserId(supabase);
  const loaded = await loadShowRankingState(supabase, userId, showId);

  if (!loaded.episodeIdsInOrder.includes(episodeId)) {
    throw new Error(`Episode ${episodeId} does not belong to show ${showId}.`);
  }

  if (!isUnranked(loaded, episodeId)) {
    return { type: 'alreadyRanked' };
  }

  if (isColdStart(loaded.state, loaded.episodeIdsInOrder.length)) {
    return { type: 'coldStart', episode: episodeId };
  }

  const comparator = makeReplayComparator(loaded.state.history);
  try {
    const newState = await addComparativeEpisode(
      loaded.state,
      episodeId,
      comparator,
      loaded.episodeIdsInOrder.length
    );
    await persistRankedPositions(supabase, userId, newState);
    return { type: 'alreadyRanked' };
  } catch (error) {
    if (error instanceof NeedsComparisonInput) {
      return { type: 'compare', subject: error.subject, reference: error.reference };
    }
    throw error;
  }
}

/**
 * Everything the reworked `/shows/[showId]` page needs to render every episode's current ranking
 * status in one call: which episodes are fully ranked (with derived scores), which are mid-cold-
 * start (with their bucket), and which haven't been touched at all.
 */
export type ShowRankingDisplay =
  | {
      done: true;
      ranked: { episodeId: EpisodeId; score: number; rank: number; createdAt: string }[];
      confidence: number | null;
    }
  | {
      done: false;
      ranked: { episodeId: EpisodeId; score: number; rank: number; createdAt: string }[];
      coldStartPending: { episodeId: EpisodeId; bucket: ColdStartBucket; createdAt: string }[];
      unranked: EpisodeId[];
      confidence: number | null;
    };

/**
 * Loads the show's full ranking status for display. Reuses `deriveNextStep` (the same "is this
 * show actually done?" derivation `getNextRankingStep` uses) purely to answer that one question —
 * it may persist newly-folded rank positions as a side effect (crossing `COLD_START_THRESHOLD`),
 * which is fine and is already how every other function in this module behaves.
 *
 * Reloads state fresh in *both* branches rather than reusing `loaded` from before the
 * `deriveNextStep` call, for the same staleness reason `getRankedEpisodeOrder` used to document:
 * that call's internal loop may have just written new `rank_position`s, so the pre-call state can
 * be stale even when the derivation itself didn't throw.
 *
 * When done, uses `currentDisplayOrder` (not just "every episode with a non-null `rank_position`,
 * sorted") because a show with fewer than `COLD_START_THRESHOLD` total episodes finishes cold-start
 * judging every episode and *never* enters comparative placement — none of its episodes ever get a
 * `rank_position` at all, so that condition would (wrongly) never be true for such a show even
 * once ranking is fully done. `currentDisplayOrder` already knows how to handle both cases.
 *
 * `confidence` (see `@/lib/ranking/confidence`'s `showConfidence`) is `null` whenever
 * `state.ranked.length === 0` — nothing has gone through comparative placement yet (either no
 * episodes at all, or a show still fully in cold start / too small to ever leave it), so there's
 * no confidence signal to report at all, not a misleadingly-low 0%. Computed purely from
 * `state.history`/`state.ranked`, both already loaded here — no new database query.
 */
export async function getShowRankingDisplay(showId: string): Promise<ShowRankingDisplay> {
  const supabase = await createSupabaseServerClient();
  const userId = await requireUserId(supabase);
  const loaded = await loadShowRankingState(supabase, userId, showId);

  const step = await deriveNextStep(supabase, userId, loaded);

  if (step.type === 'done') {
    const reloaded = await loadShowRankingState(supabase, userId, showId);
    const state = reloaded.state;
    const order = currentDisplayOrder(state);
    return {
      done: true,
      ranked: order.map((episodeId, index) => ({
        episodeId,
        score: scoreForPosition(index + 1, order.length),
        rank: index + 1,
        // Non-null by invariant: `order` only ever contains episodes with an `episode_rankings`
        // row (comparative or, for a too-small-to-leave-cold-start show, cold-start-only), and
        // `createdAtByEpisode` is built from that same table.
        createdAt: reloaded.createdAtByEpisode.get(episodeId)!,
      })),
      confidence:
        state.ranked.length === 0
          ? null
          : showConfidence(state.ranked, state.history, state.ranked.length),
    };
  }

  const reloaded = await loadShowRankingState(supabase, userId, showId);
  const state = reloaded.state;
  const rankedSet = new Set(state.ranked);
  const coldStartSet = new Set(state.coldStart.map((entry) => entry.episodeId));

  return {
    done: false,
    ranked: state.ranked.map((episodeId, index) => ({
      episodeId,
      score: scoreForPosition(index + 1, state.ranked.length),
      rank: index + 1,
      createdAt: reloaded.createdAtByEpisode.get(episodeId)!,
    })),
    coldStartPending: state.coldStart.map(({ episodeId, bucket }) => ({
      episodeId,
      bucket,
      createdAt: reloaded.createdAtByEpisode.get(episodeId)!,
    })),
    unranked: loaded.episodeIdsInOrder.filter((id) => !rankedSet.has(id) && !coldStartSet.has(id)),
    confidence:
      state.ranked.length === 0
        ? null
        : showConfidence(state.ranked, state.history, state.ranked.length),
  };
}

/**
 * The show's current #1 episode id, if it has any comparatively-ranked episode at all — `null`
 * otherwise (still in cold start, or genuinely no episodes yet). Pure, no IO — pulled out and
 * exported since more than one caller needs the exact same one-line derivation: the dashboard's
 * own "Best: {title}" display, and `@/lib/all-star-session`'s live-pool computation (every tracked
 * show's current #1 episode is that pool's raw input — see Docs/STATUS.md Bucket 4 item 15, "All
 * Stars Mode"). `display.ranked` is already best-to-worst by construction, so `ranked[0]` is it.
 */
export function topEpisodeOf(display: ShowRankingDisplay): EpisodeId | null {
  return display.ranked.length > 0 ? display.ranked[0].episodeId : null;
}

/**
 * Records a cold-start (liked/disliked/neutral) judgment for `episodeId` and returns what's next
 * *for that episode* — which, for cold start, is always `'alreadyRanked'` immediately afterward
 * (cold start never needs a follow-up question for the same episode). Crossing the show's
 * effective cold-start threshold (see `effectiveColdStartThreshold` in
 * `@/lib/ranking/constants` — `1` for a show with fewer than `COLD_START_THRESHOLD` total
 * episodes, else `COLD_START_THRESHOLD` itself) on this answer folds cold-start episodes straight
 * into comparative ranking (per `@/lib/ranking/engine.ts`'s `addComparativeEpisode`) the next time
 * *some* episode needs placing, but that's not this episode's concern anymore.
 *
 * Validates the submission against what's actually true (rather than trusting `episodeId`
 * blindly) before writing anything: the show must still be in cold start, and `episodeId` must
 * belong to this show and not already have ranking data. Deliberately does *not* require
 * `episodeId` to be "the next" unranked episode in season/episode order — ranking any specific
 * episode the user picks, in any order, is the whole point of the per-episode picker UI this
 * supports.
 */
export async function submitColdStartAnswer(
  showId: string,
  episodeId: EpisodeId,
  bucket: ColdStartBucket
): Promise<TargetedRankingStep> {
  const supabase = await createSupabaseServerClient();
  const userId = await requireUserId(supabase);
  const loaded = await loadShowRankingState(supabase, userId, showId);

  if (!isColdStart(loaded.state, loaded.episodeIdsInOrder.length)) {
    throw new Error(
      `Show ${showId} is no longer in cold start; submit a comparison answer instead.`
    );
  }

  if (!loaded.episodeIdsInOrder.includes(episodeId)) {
    throw new Error(`Unexpected cold-start submission: episode ${episodeId} does not belong to show ${showId}.`);
  }
  if (!isUnranked(loaded, episodeId)) {
    throw new Error(
      `Unexpected cold-start submission for episode ${episodeId} (show ${showId}); it already has ranking data.`
    );
  }

  const sequence = loaded.state.coldStart.length;
  const { error } = await supabase.from('episode_rankings').insert({
    user_id: userId,
    episode_id: episodeId,
    rank_position: null,
    cold_start_bucket: bucket,
    cold_start_sequence: sequence,
  });

  if (error) {
    throw new Error(`Failed to record cold-start answer: ${error.message}`);
  }

  return getNextStepForEpisode(showId, episodeId);
}

/** This user's personal win/loss/tie tally against `episodeId` across every recorded comparison. */
export interface EpisodeComparisonRecord {
  wins: number;
  losses: number;
  ties: number;
}

/**
 * Tallies every `episode_comparisons` row involving `episodeId` (either side) for the signed-in
 * user into a win/loss/tie record from that episode's own perspective — used by the episode detail
 * page's "N wins, M losses, K ties" line.
 *
 * Same "both sides, no hand-built OR filter string" pattern as `loadShowRankingState` (query
 * `episode_a_id` and `episode_b_id` separately via `Promise.all`), but no de-dupe step is needed
 * here: unlike that function (which queries for a whole list of episode ids, where a comparison
 * between two episodes *both* in the list would show up in both result sets), this queries for a
 * single episode id, and `episode_comparisons`' `episode_a_id <> episode_b_id` check guarantees a
 * single row can never have the same id on both sides, so a row can only ever appear in one of the
 * two queries below.
 */
export async function getEpisodeComparisonRecord(
  episodeId: EpisodeId
): Promise<EpisodeComparisonRecord> {
  const supabase = await createSupabaseServerClient();
  const userId = await requireUserId(supabase);

  const [aSide, bSide] = await Promise.all([
    supabase
      .from('episode_comparisons')
      .select('result')
      .eq('user_id', userId)
      .eq('episode_a_id', episodeId),
    supabase
      .from('episode_comparisons')
      .select('result')
      .eq('user_id', userId)
      .eq('episode_b_id', episodeId),
  ]);

  if (aSide.error) {
    throw new Error(`Failed to load episode comparisons (episode_a_id side): ${aSide.error.message}`);
  }
  if (bSide.error) {
    throw new Error(`Failed to load episode comparisons (episode_b_id side): ${bSide.error.message}`);
  }

  const record: EpisodeComparisonRecord = { wins: 0, losses: 0, ties: 0 };

  for (const row of (aSide.data ?? []) as { result: ComparisonRow['result'] }[]) {
    if (row.result === 'a_better') record.wins += 1;
    else if (row.result === 'b_better') record.losses += 1;
    else record.ties += 1;
  }

  for (const row of (bSide.data ?? []) as { result: ComparisonRow['result'] }[]) {
    if (row.result === 'b_better') record.wins += 1;
    else if (row.result === 'a_better') record.losses += 1;
    else record.ties += 1;
  }

  return record;
}

/**
 * Records a comparison answer (`subjectId` is "better"/"worse"/"neutral" relative to
 * `referenceId`) and returns what's next *for that subject episode's placement* — replay will now
 * resolve past this newly-recorded answer, which may immediately complete the placement (or
 * surface the next binary-search/tie-break hop, per `getNextStepForEpisode`'s replay-then-ask
 * approach).
 *
 * Validates the submission against what's actually currently pending for `subjectId` specifically
 * (via `getNextStepForEpisode`, targeted at the subject) rather than the show's global next-in-
 * order episode — this is what makes out-of-order ranking possible: `subjectId` need not be
 * "next" in season/episode order, it just needs to be the episode currently being placed, with a
 * pending question that actually matches `referenceId`. `subjectId` is already pinned by
 * construction (it's exactly what we asked `getNextStepForEpisode` about), so only `reference`
 * needs re-checking. This still rejects stale/out-of-order submissions and guarantees the row is
 * never written with the pair reversed from what the rest of this module expects.
 */
export async function submitComparisonAnswer(
  showId: string,
  subjectId: EpisodeId,
  referenceId: EpisodeId,
  result: ComparisonResult
): Promise<TargetedRankingStep> {
  const supabase = await createSupabaseServerClient();
  const userId = await requireUserId(supabase);
  const loaded = await loadShowRankingState(supabase, userId, showId);

  if (isColdStart(loaded.state, loaded.episodeIdsInOrder.length)) {
    throw new Error(`Show ${showId} is still in cold start; submit a cold-start answer instead.`);
  }

  const pending = await getNextStepForEpisode(showId, subjectId);
  if (pending.type !== 'compare' || pending.reference !== referenceId) {
    throw new Error(
      `Unexpected comparison submission for show ${showId}: got subject=${subjectId} ` +
        `reference=${referenceId}, but the pending step is ${JSON.stringify(pending)}.`
    );
  }

  const resultColumn: ComparisonRow['result'] =
    result === 'better' ? 'a_better' : result === 'worse' ? 'b_better' : 'neutral';

  const { error } = await supabase.from('episode_comparisons').insert({
    user_id: userId,
    episode_a_id: subjectId,
    episode_b_id: referenceId,
    result: resultColumn,
  });

  if (error) {
    throw new Error(`Failed to record comparison answer: ${error.message}`);
  }

  return getNextStepForEpisode(showId, subjectId);
}
