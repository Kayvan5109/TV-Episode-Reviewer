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
    return { episodeIdsInOrder, state: createInitialShowState() };
  }

  const { data: rankingRows, error: rankingError } = await supabase
    .from('episode_rankings')
    .select('episode_id, rank_position, cold_start_bucket, cold_start_sequence')
    .eq('user_id', userId)
    .in('episode_id', episodeIdsInOrder);

  if (rankingError) {
    throw new Error(`Failed to load episode rankings for show ${showId}: ${rankingError.message}`);
  }

  // episode_comparisons rows touching this show could have either episode in either column —
  // query both sides and merge, rather than composing a hand-built OR filter string.
  const [aSide, bSide] = await Promise.all([
    supabase
      .from('episode_comparisons')
      .select('id, episode_a_id, episode_b_id, result')
      .eq('user_id', userId)
      .in('episode_a_id', episodeIdsInOrder),
    supabase
      .from('episode_comparisons')
      .select('id, episode_a_id, episode_b_id, result')
      .eq('user_id', userId)
      .in('episode_b_id', episodeIdsInOrder),
  ]);

  if (aSide.error) {
    throw new Error(`Failed to load episode comparisons for show ${showId}: ${aSide.error.message}`);
  }
  if (bSide.error) {
    throw new Error(`Failed to load episode comparisons for show ${showId}: ${bSide.error.message}`);
  }

  // De-dupe by row id: a comparison between two episodes that are *both* in this show's episode
  // list would otherwise be returned by both queries.
  const comparisonRowsById = new Map<string, ComparisonRow>();
  for (const row of [...((aSide.data ?? []) as { id: string }[]), ...((bSide.data ?? []) as { id: string }[])]) {
    comparisonRowsById.set(row.id, row as unknown as ComparisonRow);
  }

  const state = reconstructShowRankingState(
    (rankingRows ?? []) as RankingRow[],
    [...comparisonRowsById.values()]
  );

  return { episodeIdsInOrder, state };
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

    if (isColdStart(state)) {
      return { type: 'coldStart', episode: nextEpisode };
    }

    const comparator = makeReplayComparator(state.history);
    try {
      const newState = await addComparativeEpisode(state, nextEpisode, comparator);
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

  if (isColdStart(loaded.state)) {
    return { type: 'coldStart', episode: episodeId };
  }

  const comparator = makeReplayComparator(loaded.state.history);
  try {
    const newState = await addComparativeEpisode(loaded.state, episodeId, comparator);
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
  | { done: true; ranked: { episodeId: EpisodeId; score: number }[] }
  | {
      done: false;
      ranked: { episodeId: EpisodeId; score: number }[];
      coldStartPending: { episodeId: EpisodeId; bucket: ColdStartBucket }[];
      unranked: EpisodeId[];
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
 */
export async function getShowRankingDisplay(showId: string): Promise<ShowRankingDisplay> {
  const supabase = await createSupabaseServerClient();
  const userId = await requireUserId(supabase);
  const loaded = await loadShowRankingState(supabase, userId, showId);

  const step = await deriveNextStep(supabase, userId, loaded);

  if (step.type === 'done') {
    const reloaded = await loadShowRankingState(supabase, userId, showId);
    const order = currentDisplayOrder(reloaded.state);
    return {
      done: true,
      ranked: order.map((episodeId, index) => ({
        episodeId,
        score: scoreForPosition(index + 1, order.length),
      })),
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
    })),
    coldStartPending: state.coldStart.map(({ episodeId, bucket }) => ({ episodeId, bucket })),
    unranked: loaded.episodeIdsInOrder.filter((id) => !rankedSet.has(id) && !coldStartSet.has(id)),
  };
}

/**
 * Records a cold-start (liked/disliked/neutral) judgment for `episodeId` and returns what's next
 * *for that episode* — which, for cold start, is always `'alreadyRanked'` immediately afterward
 * (cold start never needs a follow-up question for the same episode). Crossing
 * `COLD_START_THRESHOLD` on this answer folds cold-start episodes straight into comparative
 * ranking (per `@/lib/ranking/engine.ts`'s `addComparativeEpisode`) the next time *some* episode
 * needs placing, but that's not this episode's concern anymore.
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

  if (!isColdStart(loaded.state)) {
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

  if (isColdStart(loaded.state)) {
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
