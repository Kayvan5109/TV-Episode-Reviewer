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
import { addComparativeEpisode, createInitialShowState, isColdStart } from '@/lib/ranking/engine';
import type { ColdStartBucket, ComparisonResult, EpisodeId, ShowRankingState } from '@/lib/ranking/types';
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
 * Records a cold-start (liked/disliked/neutral) judgment for `episodeId` and re-derives the next
 * step — crossing `COLD_START_THRESHOLD` on this answer folds cold-start episodes straight into
 * comparative ranking (per `@/lib/ranking/engine.ts`'s `addComparativeEpisode`), which may mean the
 * very next step is immediately a comparison question rather than another cold-start one.
 *
 * Validates the submission against what's actually currently pending (rather than trusting
 * `episodeId` blindly) before writing anything — the show must still be in cold start, and
 * `episodeId` must be exactly the next unranked episode.
 */
export async function submitColdStartAnswer(
  showId: string,
  episodeId: EpisodeId,
  bucket: ColdStartBucket
): Promise<NextRankingStep> {
  const supabase = await createSupabaseServerClient();
  const userId = await requireUserId(supabase);
  const loaded = await loadShowRankingState(supabase, userId, showId);

  if (!isColdStart(loaded.state)) {
    throw new Error(
      `Show ${showId} is no longer in cold start; submit a comparison answer instead.`
    );
  }

  const expected = nextUnrankedEpisode(loaded.episodeIdsInOrder, loaded.state);
  if (expected !== episodeId) {
    throw new Error(
      `Unexpected cold-start submission for episode ${episodeId} (show ${showId}); ` +
        `expected ${expected ?? 'none — show is fully ranked'}.`
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

  return getNextRankingStep(showId);
}

/**
 * Records a comparison answer (`subjectId` is "better"/"worse"/"neutral" relative to
 * `referenceId`) and re-derives the next step — replay will now resolve past this newly-recorded
 * answer, which may immediately complete the current placement (and possibly cascade into further
 * fully-replayable placements, per `deriveNextStep`'s loop).
 *
 * Validates the submission against what's actually currently pending before writing anything: the
 * show must be past cold start, and `(subjectId, referenceId)` must be exactly the pending
 * question — this both rejects stale/out-of-order submissions and guarantees the row is never
 * written with the pair reversed from what the rest of this module expects.
 */
export async function submitComparisonAnswer(
  showId: string,
  subjectId: EpisodeId,
  referenceId: EpisodeId,
  result: ComparisonResult
): Promise<NextRankingStep> {
  const supabase = await createSupabaseServerClient();
  const userId = await requireUserId(supabase);
  const loaded = await loadShowRankingState(supabase, userId, showId);

  if (isColdStart(loaded.state)) {
    throw new Error(`Show ${showId} is still in cold start; submit a cold-start answer instead.`);
  }

  const pending = await deriveNextStep(supabase, userId, loaded);
  if (pending.type !== 'compare' || pending.subject !== subjectId || pending.reference !== referenceId) {
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

  return getNextRankingStep(showId);
}
