/**
 * Persistence/orchestration layer for the "Top Episodes" All Stars pool (Docs/STATUS.md Bucket 4
 * item 15) — a cross-show comparison pool over every tracked show's current #1 episode. Every
 * show's #1 already scores exactly 10 under the per-show formula
 * (`scoreForPosition(1, N) = 10` regardless of `N` — see `@/lib/ranking/score.ts`), so this pool
 * gives those #1s their own comparison history and their own derived scores, reusing the *same*
 * comparative (binary-insertion) placement algorithm the rest of the app already uses.
 *
 * Mirrors `@/lib/ranking-session/session.ts`'s shape closely — same "reconstruct fresh state from
 * durable rows on every request, give the algorithm a replay comparator that throws a sentinel the
 * first time it hits a genuinely new question" design (see that file's own module comment for the
 * full account of *why* this layer exists). Genuinely different in one respect: there is no
 * cold-start concept here at all. Every entrant already has an established identity (it's some
 * show's current best episode) — it goes straight to comparative placement via
 * `placeEpisodeComparatively` (imported directly from `@/lib/ranking/comparativePlacement`, not
 * via `@/lib/ranking/engine`'s `addComparativeEpisode` wrapper — that wrapper's cold-start-
 * threshold guard is a genuinely per-show concept that has no equivalent here, and would reject
 * placing the very first entrant into an empty pool, which is exactly the case that needs to
 * *not* be rejected; see `deriveNextAllStarStep`'s doc comment for the full reasoning). Placing
 * into an empty ranked list asks the comparator nothing at all and just inserts it, so the very
 * first entrant needs zero user interaction — exactly like a 1-episode show today.
 *
 * A second real difference from the per-show layer: reconciliation. A show's live #1 can change
 * out from under an already-placed pool entry (the user re-ranks that show, or a partially-ranked
 * show's leader shifts) — `loadAllStarPool` re-derives the live pool fresh on every call and
 * reconciles it against what's durably stored (`all_star_rankings`) before anything else happens,
 * same "always reload, never trust anything computed earlier in the request" discipline
 * `@/lib/ranking-session/session.ts` follows throughout.
 *
 * Every function here derives the signed-in user itself via `getUser()` — never accepts a
 * caller-supplied user id — and every query is additionally scoped by that verified id explicitly,
 * same defense-in-depth-on-top-of-RLS posture as `@/lib/ranking-session/session.ts`.
 *
 * Same URL-length lesson as `@/lib/ranking-session/session.ts` (see Docs/STATUS.md Bucket 1 item
 * 1): every read of `all_star_rankings`/`all_star_comparisons` below scopes by `user_id` alone and
 * filters to the relevant episode/show ids in application code, never `.in('episode_id'/...,
 * <list that could grow with usage>)`. Single-value `.eq(...)` deletes (one show/episode id at a
 * time) are unaffected by that concern and used freely, same as `@/lib/ranking-session/session.ts`'s
 * own `resetEpisodeRanking`.
 */

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';
import { placeEpisodeComparatively } from '@/lib/ranking/comparativePlacement';
import { scoresForRankedList } from '@/lib/ranking/score';
import type { ComparisonHistory, ComparisonResult, EpisodeId } from '@/lib/ranking/types';
import { makeReplayComparator } from '@/lib/ranking-session/comparator';
import {
  reconstructShowRankingState,
  type ComparisonRow,
  type RankingRow,
} from '@/lib/ranking-session/reconstruct';
import { getShowRankingDisplay, topEpisodeOf } from '@/lib/ranking-session';
import { NeedsComparisonInput, type NextAllStarStep } from './types';

type SupabaseSessionClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Kayvan's explicit threshold (Docs/STATUS.md Bucket 4 item 15 UX spec): the dashboard's "Top
 * Episodes" section is only shown once the user has 4 or more tracked shows with a live #1
 * episode — not 1, not 2, exactly 4. Below that, the section renders nothing at all. This gates
 * only the *display* (`getAllStarDisplay`'s `eligible` flag); reconciliation itself always runs
 * regardless (see that function's doc comment).
 */
const ELIGIBILITY_THRESHOLD = 4;

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

/** One durable `all_star_rankings` row, narrowed to the columns this module needs. */
interface AllStarRankingRow {
  show_id: string;
  episode_id: EpisodeId;
  rank_position: number;
}

interface LoadedAllStarPool {
  /** Every tracked show (via `user_shows`) with a live #1 episode right now, keyed by show id. */
  livePool: Map<string, EpisodeId>;
  /** `user_shows` query order — the order pending entrants get placed in. */
  orderedShowIds: string[];
  /** Current placed order (post-reconciliation), best (index 0) to worst. */
  ranked: EpisodeId[];
  history: ComparisonHistory;
  /** For every id currently in `ranked`, plus every still-pending show's live episode id. */
  showIdByEpisodeId: Map<EpisodeId, string>;
  /** Live-pool shows with no surviving `all_star_rankings` row, in `orderedShowIds` order. */
  pendingShowIds: string[];
  /** Subset of `pendingShowIds` whose *previous* entry was removed this pass because the show's
   *  #1 episode changed since it was last placed (case 2 of reconciliation below) — as opposed to
   *  a show that simply never had an entry before (case 1). */
  staleShowIds: string[];
  /** For every case-2 (stale) show, the `rank_position` its now-removed entry held right before
   *  removal — captured for display-only purposes (see `getAllStarDisplay`'s placeholder splice)
   *  so the UI can show that show's new #1 sitting in the old entry's former slot until the user
   *  actually places it for real. Never used for anything persisted or algorithm-affecting. */
  staleDisplacements: { showId: string; oldRank: number }[];
}

/**
 * Deletes one show's `all_star_rankings` row plus every `all_star_comparisons` row touching
 * `episodeId` (both sides) — the reconciliation cleanup step for both the "stale" and "orphaned"
 * cases below. `episodeId` is always a single id here (never a list), so this is unaffected by the
 * URL-length concern documented in the module comment.
 */
async function removeAllStarEntry(
  supabase: SupabaseSessionClient,
  userId: string,
  showId: string,
  episodeId: EpisodeId
): Promise<void> {
  const [aSide, bSide, ranking] = await Promise.all([
    supabase.from('all_star_comparisons').delete().eq('user_id', userId).eq('episode_a_id', episodeId),
    supabase.from('all_star_comparisons').delete().eq('user_id', userId).eq('episode_b_id', episodeId),
    supabase.from('all_star_rankings').delete().eq('user_id', userId).eq('show_id', showId),
  ]);

  if (aSide.error) {
    throw new Error(`Failed to delete all-star comparisons (episode_a_id side): ${aSide.error.message}`);
  }
  if (bSide.error) {
    throw new Error(`Failed to delete all-star comparisons (episode_b_id side): ${bSide.error.message}`);
  }
  if (ranking.error) {
    throw new Error(`Failed to delete all-star ranking for show ${showId}: ${ranking.error.message}`);
  }
}

/**
 * Writes `rank_position` (1-based, best = 1) for every episode in `ranked` — a simple full-rewrite
 * rather than diffing, mirroring `@/lib/ranking-session/session.ts`'s `persistRankedPositions` and
 * its "these lists are small" reasoning (bounded by how many shows a user tracks, not by any
 * single show's episode count). `showIdByEpisodeId` must have an entry for every id in `ranked`.
 */
async function persistAllStarRanked(
  supabase: SupabaseSessionClient,
  userId: string,
  ranked: readonly EpisodeId[],
  showIdByEpisodeId: ReadonlyMap<EpisodeId, string>
): Promise<void> {
  if (ranked.length === 0) return;

  const rows = ranked.map((episodeId, index) => ({
    user_id: userId,
    show_id: showIdByEpisodeId.get(episodeId)!,
    episode_id: episodeId,
    rank_position: index + 1,
  }));

  const { error } = await supabase.from('all_star_rankings').upsert(rows, { onConflict: 'user_id,show_id' });
  if (error) {
    throw new Error(`Failed to persist all-star rankings: ${error.message}`);
  }
}

/**
 * Computes the live pool, reconciles it against what's durably stored, and reconstructs the
 * current placement state — the "always reload, always reconcile" entry point every read/write in
 * this module goes through first (see module comment).
 *
 * Reconciliation (three cases, compared live pool vs. `all_star_rankings`):
 *   1. A live-pool show with no `all_star_rankings` row at all — a new pending entrant.
 *   2. A live-pool show whose stored `episode_id` no longer matches the live #1 — stale: that
 *      show's #1 changed since it was last placed. The stale row and its comparisons (both sides,
 *      keyed by the *old* episode id) are removed; the new episode becomes a pending entrant, same
 *      as case 1, and the show id is also recorded in `staleShowIds` for the UI notice.
 *   3. An `all_star_rankings` row whose show isn't in the live pool at all (removed/untracked, or
 *      dropped back to zero ranked episodes) — orphaned, removed the same way. Defensive: show
 *      removal already gets cleaned up via `delete_show_ranking_data`'s RPC extension, so this
 *      case shouldn't be the common path, but reconciliation handles it regardless of cause.
 *
 * Fails open on any *individual* reconciliation removal (best-effort background reconcile, same
 * posture as `@/lib/shows/refreshShow.ts`'s `ensureShowSynced`) would be nice in principle, but a
 * genuinely failed delete here would leave stale/orphaned state half-cleaned in a way that could
 * corrupt the next placement — so unlike `ensureShowSynced`, failures here are *not* swallowed;
 * they propagate like any other write failure in this module. What *is* fail-open, matching
 * `ensureShowSynced`'s spirit, is running this on every read: a transient failure just means the
 * next read tries again, nothing is ever silently skipped forever.
 *
 * One known accepted gap: a pending entrant that's *mid*-placement (has recorded one comparison
 * out of several needed, but has no `all_star_rankings` row yet since placement hasn't completed)
 * has no way to be detected as "stale" by this function if its show's live #1 changes again before
 * placement finishes — there's no row to compare against yet. The old, now-abandoned comparison
 * rows for that show's previous episode id simply become inert: nothing ever looks them up again
 * (the replay comparator is keyed by exact episode id pairs, and the new live episode id is a
 * different id), so this is harmless clutter, not a correctness bug — just a small amount of
 * orphaned `all_star_comparisons` data at the edge of an edge case, accepted rather than chased for
 * a personal-use app at this scale.
 */
async function loadAllStarPool(supabase: SupabaseSessionClient, userId: string): Promise<LoadedAllStarPool> {
  const { data: userShowsData, error: userShowsError } = await supabase
    .from('user_shows')
    .select('show_id')
    .eq('user_id', userId);
  if (userShowsError) {
    throw new Error(`Failed to load tracked shows: ${userShowsError.message}`);
  }
  const orderedShowIds = ((userShowsData ?? []) as { show_id: string }[]).map((row) => row.show_id);

  // Step 1: the live pool -- every tracked show's current #1 episode, if it has one yet.
  const livePool = new Map<string, EpisodeId>();
  await Promise.all(
    orderedShowIds.map(async (showId) => {
      const display = await getShowRankingDisplay(showId);
      const topEpisodeId = topEpisodeOf(display);
      if (topEpisodeId) {
        livePool.set(showId, topEpisodeId);
      }
    })
  );

  // Step 2: reconcile against what's durably stored. No `.in()` here -- see module comment.
  const { data: rankingRowsRaw, error: rankingError } = await supabase
    .from('all_star_rankings')
    .select('show_id, episode_id, rank_position')
    .eq('user_id', userId);
  if (rankingError) {
    throw new Error(`Failed to load all-star rankings: ${rankingError.message}`);
  }
  const rankingRows = (rankingRowsRaw ?? []) as AllStarRankingRow[];

  const staleShowIds: string[] = [];
  const staleDisplacements: { showId: string; oldRank: number }[] = [];
  const toRemove: { showId: string; episodeId: EpisodeId }[] = [];
  const survivors: AllStarRankingRow[] = [];

  for (const row of rankingRows) {
    const liveEpisodeId = livePool.get(row.show_id);
    if (!liveEpisodeId) {
      // Case 3: orphaned -- show no longer has a live #1 at all.
      toRemove.push({ showId: row.show_id, episodeId: row.episode_id });
    } else if (liveEpisodeId !== row.episode_id) {
      // Case 2: stale -- the show's #1 changed since this row was placed. Capture its old
      // position (from the still-intact `row`) before it's removed below -- display-only, see
      // `staleDisplacements`'s doc comment.
      toRemove.push({ showId: row.show_id, episodeId: row.episode_id });
      staleShowIds.push(row.show_id);
      staleDisplacements.push({ showId: row.show_id, oldRank: row.rank_position });
    } else {
      survivors.push(row);
    }
  }

  if (toRemove.length > 0) {
    await Promise.all(toRemove.map(({ showId, episodeId }) => removeAllStarEntry(supabase, userId, showId, episodeId)));
  }

  // Step 3: pending entrants, post-reconciliation -- live-pool shows with no surviving row. Case
  // 1 (genuinely new) and the just-cleared half of case 2 (stale) both land here; `staleShowIds`
  // (above) is how callers tell the two apart for the UI notice.
  const survivorShowIds = new Set(survivors.map((row) => row.show_id));
  const pendingShowIds = orderedShowIds.filter((showId) => livePool.has(showId) && !survivorShowIds.has(showId));

  // Step 4: reconstruct ranked/history from the surviving rows. Reuses
  // `reconstructShowRankingState` unmodified -- it only needs `rank_position`/cold-start columns
  // and comparison rows in the same shape `episode_rankings`/`episode_comparisons` already use;
  // every all_star_rankings row always has a non-null rank_position (there's no "pending" state
  // for a row that exists at all), so `coldStart` always reconstructs empty here, which is exactly
  // right -- this pool has no cold-start concept.
  const rankingRowsForReconstruct: RankingRow[] = survivors.map((row) => ({
    episode_id: row.episode_id,
    rank_position: row.rank_position,
    cold_start_bucket: null,
    cold_start_sequence: null,
  }));

  const { data: comparisonRowsRaw, error: comparisonError } = await supabase
    .from('all_star_comparisons')
    .select('episode_a_id, episode_b_id, result')
    .eq('user_id', userId);
  if (comparisonError) {
    throw new Error(`Failed to load all-star comparisons: ${comparisonError.message}`);
  }

  // Relevant episode ids: every survivor (already-placed) plus every still-pending show's current
  // live episode id (a mid-placement subject may have recorded comparisons against an
  // already-ranked reference before this exact request). Same "either side" OR-filter style as
  // `@/lib/ranking-session/session.ts`'s `loadShowRankingState`.
  const pendingEpisodeIds = pendingShowIds.map((showId) => livePool.get(showId)!);
  const relevantEpisodeIds = new Set([...survivors.map((row) => row.episode_id), ...pendingEpisodeIds]);
  const comparisonRows = ((comparisonRowsRaw ?? []) as ComparisonRow[]).filter(
    (row) => relevantEpisodeIds.has(row.episode_a_id) || relevantEpisodeIds.has(row.episode_b_id)
  );

  const state = reconstructShowRankingState(rankingRowsForReconstruct, comparisonRows);

  const showIdByEpisodeId = new Map<EpisodeId, string>();
  for (const row of survivors) {
    showIdByEpisodeId.set(row.episode_id, row.show_id);
  }

  return {
    livePool,
    orderedShowIds,
    ranked: state.ranked,
    history: state.history,
    showIdByEpisodeId,
    pendingShowIds,
    staleShowIds,
    staleDisplacements,
  };
}

/**
 * Reads this user's durable "has ever fully completed a Top Episodes pass" flag
 * (`all_star_progress.has_completed_once`) -- deliberately a plain `.eq('user_id', ...)` read
 * scanned in application code (`[0]?.has_completed_once`), same style as every other read in this
 * module, rather than `.maybeSingle()`, so the `FakeSupabase` test double doesn't need a second
 * read-builder shape. No row at all (brand new user) means "never completed," i.e. `false`.
 *
 * Deliberately called *before* `loadAllStarPool` in `getAllStarDisplay` -- this reflects the
 * user's prior history only, and must not be affected by anything derived or auto-placed during
 * this request (see this module's top comment and `isFirstTime`'s bug writeup in Docs/STATUS.md
 * Bucket 4 item 15).
 */
async function loadHasCompletedOnce(supabase: SupabaseSessionClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('all_star_progress').select('has_completed_once').eq('user_id', userId);
  if (error) {
    throw new Error(`Failed to load all-star progress: ${error.message}`);
  }
  const rows = (data ?? []) as { has_completed_once: boolean }[];
  return rows[0]?.has_completed_once ?? false;
}

/**
 * Latches `all_star_progress.has_completed_once` to `true` for this user -- called every time
 * `getAllStarDisplay` observes `done === true`, not just the first time (cheap, idempotent
 * upsert). Deliberately never called from `resetAllStarRanking` -- see that function's doc
 * comment for why a manual reset must not clear this flag.
 */
async function markAllStarProgressCompleted(supabase: SupabaseSessionClient, userId: string): Promise<void> {
  const { error } = await supabase
    .from('all_star_progress')
    .upsert({ user_id: userId, has_completed_once: true, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) {
    throw new Error(`Failed to persist all-star progress: ${error.message}`);
  }
}

/**
 * Drives every pending entrant through comparative placement, one at a time, via a replay
 * comparator (`makeReplayComparator`, reused unmodified from `@/lib/ranking-session/comparator`).
 * Loops rather than stopping after the first entrant — same reasoning as
 * `@/lib/ranking-session/session.ts`'s `deriveNextStep`: a successful placement (fully resolved by
 * replaying already-answered comparisons, or, for the very first entrant into an empty pool,
 * needing no comparisons at all) can immediately let the *next* pending entrant's placement
 * resolve too, all in one request, only stopping once a genuinely new question is hit or nothing's
 * left pending.
 *
 * Calls `placeEpisodeComparatively` directly (from `@/lib/ranking/comparativePlacement`) rather
 * than `@/lib/ranking/engine`'s `addComparativeEpisode` wrapper: that wrapper's cold-start-
 * threshold guard (`count >= effectiveColdStartThreshold(totalShowEpisodeCount)`) is a genuinely
 * per-show concept with no equivalent here, and it would reject placing the very first entrant
 * into an empty pool (`count` starts at 0, and `effectiveColdStartThreshold` never returns 0) --
 * exactly the case that has to succeed with zero questions asked. `placeEpisodeComparatively`
 * itself has no such guard: an empty `ranked` list just means its binary-search loop never
 * executes, and the subject is inserted at index 0 immediately.
 */
async function deriveNextAllStarStep(
  supabase: SupabaseSessionClient,
  userId: string,
  loaded: LoadedAllStarPool
): Promise<{ step: NextAllStarStep; ranked: EpisodeId[] }> {
  let ranked = loaded.ranked;
  let history = loaded.history;
  const pending = [...loaded.pendingShowIds];

  while (pending.length > 0) {
    const showId = pending[0];
    const episodeId = loaded.livePool.get(showId)!;
    const comparator = makeReplayComparator(history);

    try {
      const result = await placeEpisodeComparatively(ranked, history, episodeId, comparator);
      ranked = result.ranked;
      history = result.history;
      loaded.showIdByEpisodeId.set(episodeId, showId);
      await persistAllStarRanked(supabase, userId, ranked, loaded.showIdByEpisodeId);
      pending.shift();
      continue;
    } catch (error) {
      if (error instanceof NeedsComparisonInput) {
        return { step: { type: 'compare', subject: error.subject, reference: error.reference }, ranked };
      }
      throw error;
    }
  }

  return { step: { type: 'done' }, ranked };
}

/** One entry in the Top Episodes pool's current placed order, for display. */
export interface AllStarRankedEntry {
  episodeId: EpisodeId;
  showId: string;
  /** 1-based position within the pool, 1 = best. */
  rank: number;
  score: number;
  /** `true` only for a synthetic, display-only splice-in standing in for a stale show's new #1
   *  while the user hasn't yet run it through real comparative placement (see
   *  `buildDisplayRanked`'s doc comment) -- `false` for every genuinely placed entry. The score
   *  and rank on a placeholder entry are both position-based estimates over the merged display
   *  array, not a real, comparison-verified placement. */
  isPlaceholder: boolean;
}

/**
 * Everything the dashboard's "Top Episodes" section needs to render. `eligible` is `false` (and
 * nothing else is computed) whenever fewer than `ELIGIBILITY_THRESHOLD` tracked shows currently
 * have a live #1 episode -- see that constant's doc comment for why placement itself is skipped
 * below the threshold, not just hidden in the UI. `hasCompletedOnce` is present in both branches
 * (durable per-user history, unrelated to eligibility) even though today's UI only reads it in the
 * `eligible: true` branch, in case that changes later.
 */
export type AllStarDisplay =
  | { eligible: false; hasCompletedOnce: boolean }
  | {
      eligible: true;
      /** `true` once this user has ever fully completed a Top Episodes ranking pass, durably
       *  latched via `all_star_progress` -- *not* reset by `resetAllStarRanking()`. Drives the
       *  "Rank Top Episodes" (first time) vs "Update Top Episodes" (every time after) button
       *  label; see `loadHasCompletedOnce`'s doc comment for why this can't be derived per-request
       *  from `ranked`/`staleShowIds` the way it used to be. */
      hasCompletedOnce: boolean;
      /** `true` once every eligible show's #1 has a place in the pool -- nothing pending. Derived
       *  from the real, non-augmented placement state -- unaffected by any placeholder splice-ins
       *  in `ranked` below. */
      done: boolean;
      /** Current placed order, best (rank 1) to worst, for display. This is the real placed order
       *  *augmented* with placeholder entries for stale shows (see `buildDisplayRanked`) -- it is
       *  not the same array `done`/`pendingCount` are derived from. */
      ranked: AllStarRankedEntry[];
      /** How many shows are currently waiting to be placed (new entrants + stale-replaced ones).
       *  Derived from the real, non-augmented placement state, same as `done`. */
      pendingCount: number;
      /** Which of the pending shows are pending *because* their #1 changed since it was last
       *  placed (as opposed to genuinely new) -- for the "your #1 for X changed" UI notice. */
      staleShowIds: string[];
    };

/**
 * Builds the *display-only* ranked array `getAllStarDisplay` returns: the real, algorithm-correct
 * `realRanked` order (exactly what `done`/`pendingCount` are derived from, untouched), with one
 * synthetic placeholder entry spliced in for each stale displacement -- so a show whose #1 just
 * changed keeps a visible (if provisional) slot in the list, at that show's *old* position, using
 * its *live* #1 episode id, instead of vanishing from the list entirely until the user finishes
 * placing it for real (Kayvan's exact request, Docs/STATUS.md Bucket 4 item 15: "the list should
 * re-appear with the new #1 in the place of the old one").
 *
 * Purely presentational: never writes anything, never affects `history`/`ranked` used for actual
 * placement, and the returned array can contain more entries than `realRanked` (one per stale
 * displacement) -- scores for the merged array are recomputed by the caller via
 * `scoresForRankedList`, which works fine over any array purely by position.
 *
 * Splice index is `min(oldRank - 1, currentLength)` at the time of *that* splice (the array grows
 * as earlier displacements are spliced in, so later indices are computed against the
 * already-augmented length) -- `oldRank` is 1-based, so `oldRank - 1` is the corresponding 0-based
 * index; clamped to the current array length so an old position beyond the (possibly shorter) real
 * list still lands at the end rather than throwing/leaving a gap. Because each splice index is
 * computed against the already-augmented array, `staleDisplacements` MUST be processed in
 * ascending `oldRank` order -- otherwise a later (numerically smaller) `oldRank` splices in after
 * an earlier (numerically larger) one already shifted the array, landing every subsequent
 * placeholder one slot too far right. `loadAllStarPool` builds `staleDisplacements` by iterating
 * Supabase query rows with no guaranteed order, so the array is explicitly sorted here rather than
 * relying on caller order.
 */
function buildDisplayRanked(
  realRanked: readonly EpisodeId[],
  showIdByEpisodeId: ReadonlyMap<EpisodeId, string>,
  livePool: ReadonlyMap<string, EpisodeId>,
  staleDisplacements: readonly { showId: string; oldRank: number }[]
): { episodeId: EpisodeId; showId: string; isPlaceholder: boolean }[] {
  const merged = realRanked.map((episodeId) => ({
    episodeId,
    showId: showIdByEpisodeId.get(episodeId)!,
    isPlaceholder: false,
  }));

  const orderedDisplacements = [...staleDisplacements].sort((a, b) => a.oldRank - b.oldRank);
  for (const { showId, oldRank } of orderedDisplacements) {
    // Always defined: a stale displacement (case 2) is by definition a live-pool show -- only its
    // stored episode id was stale, not its live-pool membership.
    const liveEpisodeId = livePool.get(showId)!;
    const index = Math.min(oldRank - 1, merged.length);
    merged.splice(index, 0, { episodeId: liveEpisodeId, showId, isPlaceholder: true });
  }

  return merged;
}

/**
 * Loads the Top Episodes pool's full display state: reconciles (see `loadAllStarPool`), then
 * derives as far as replay alone can go (folding in any newly-resolvable placements, same
 * "read may persist as a side effect" convention `@/lib/ranking-session/session.ts`'s
 * `getShowRankingDisplay` already follows), and returns the result shaped for the dashboard.
 *
 * Below `ELIGIBILITY_THRESHOLD`, returns `{ eligible: false }` *without* calling
 * `deriveNextAllStarStep` at all -- eligibility is a display gate, but running placement (which
 * writes `all_star_rankings` rows) while the section isn't even shown would mutate state the user
 * has no way to see or act on yet. Reconciliation (inside `loadAllStarPool`) still always runs
 * regardless of eligibility, since it's pure cleanup, not new placement.
 */
export async function getAllStarDisplay(): Promise<AllStarDisplay> {
  const supabase = await createSupabaseServerClient();
  const userId = await requireUserId(supabase);
  // Read before doing anything else this request -- reflects prior history only, must not be
  // affected by any auto-placement `deriveNextAllStarStep` below is about to do. See
  // `loadHasCompletedOnce`'s doc comment.
  const hasCompletedOnce = await loadHasCompletedOnce(supabase, userId);
  const loaded = await loadAllStarPool(supabase, userId);

  if (loaded.livePool.size < ELIGIBILITY_THRESHOLD) {
    return { eligible: false, hasCompletedOnce };
  }

  const { step, ranked } = await deriveNextAllStarStep(supabase, userId, loaded);
  const done = step.type === 'done';
  if (done) {
    // Cheap and idempotent to call every time `done` is true, not just the first time -- this is
    // what latches the flag permanently once true. See `markAllStarProgressCompleted`'s doc
    // comment.
    await markAllStarProgressCompleted(supabase, userId);
  }

  // Display-only augmentation, layered on top of the real, algorithm-correct `ranked`/`done`
  // above -- see `buildDisplayRanked`'s doc comment. `done`/`pendingCount` below are still derived
  // from the real, non-augmented `ranked`, not this merged array.
  const displayRanked = buildDisplayRanked(ranked, loaded.showIdByEpisodeId, loaded.livePool, loaded.staleDisplacements);
  const scores = scoresForRankedList(displayRanked.map((entry) => entry.episodeId));

  return {
    eligible: true,
    hasCompletedOnce,
    done,
    ranked: displayRanked.map((entry, index) => ({
      episodeId: entry.episodeId,
      showId: entry.showId,
      rank: index + 1,
      score: scores.get(entry.episodeId)!,
      isPlaceholder: entry.isPlaceholder,
    })),
    // Not `loaded.pendingShowIds.length` -- that's the *pre*-derivation count.
    // `deriveNextAllStarStep` may have just auto-placed one or more entrants that needed no new
    // question at all (e.g. the very first entrant into an empty pool), shrinking how many are
    // actually still pending by the time this returns. `livePool.size - ranked.length` reflects
    // the post-derivation truth: every live-pool show is either placed (counted in `ranked`) or
    // still pending, with no third state. Deliberately uses the real `ranked` (not
    // `displayRanked`), same as `done` above.
    pendingCount: loaded.livePool.size - ranked.length,
    staleShowIds: loaded.staleShowIds,
  };
}

/**
 * "What should the comparison route ask/show next?" — the all-star counterpart to
 * `@/lib/ranking-session`'s `getNextRankingStep`. Unlike `getAllStarDisplay`, this isn't gated by
 * `ELIGIBILITY_THRESHOLD` -- it's a lower-level primitive the `/top-episodes/rank` route calls
 * directly, and that route is only ever linked to from the dashboard once the section is already
 * showing, so eligibility has already been satisfied by the time this runs in practice.
 */
export async function getNextAllStarStep(): Promise<NextAllStarStep> {
  const supabase = await createSupabaseServerClient();
  const userId = await requireUserId(supabase);
  const loaded = await loadAllStarPool(supabase, userId);
  const { step } = await deriveNextAllStarStep(supabase, userId, loaded);
  return step;
}

/**
 * Records a comparison answer for the Top Episodes pool and returns what's next, replaying past it
 * immediately (same replay-then-ask loop as `@/lib/ranking-session`'s `submitComparisonAnswer`).
 *
 * Validates against what's *actually* currently pending (re-derived fresh, not trusted from an
 * earlier request) before writing anything -- a stale/out-of-order submission (e.g. a duplicate
 * back-button resubmission) is rejected rather than silently written with the wrong pair.
 */
export async function submitAllStarComparisonAnswer(
  subjectId: EpisodeId,
  referenceId: EpisodeId,
  result: ComparisonResult
): Promise<NextAllStarStep> {
  const supabase = await createSupabaseServerClient();
  const userId = await requireUserId(supabase);

  const loaded = await loadAllStarPool(supabase, userId);
  const { step: pendingStep } = await deriveNextAllStarStep(supabase, userId, loaded);
  if (pendingStep.type !== 'compare' || pendingStep.subject !== subjectId || pendingStep.reference !== referenceId) {
    throw new Error(
      `Unexpected all-star comparison submission: got subject=${subjectId} reference=${referenceId}, ` +
        `but the pending step is ${JSON.stringify(pendingStep)}.`
    );
  }

  const resultColumn: ComparisonRow['result'] =
    result === 'better' ? 'a_better' : result === 'worse' ? 'b_better' : 'neutral';

  const { error } = await supabase.from('all_star_comparisons').insert({
    user_id: userId,
    episode_a_id: subjectId,
    episode_b_id: referenceId,
    result: resultColumn,
  });
  if (error) {
    throw new Error(`Failed to record all-star comparison answer: ${error.message}`);
  }

  return getNextAllStarStep();
}

/**
 * Full manual reset: deletes every `all_star_rankings`/`all_star_comparisons` row for the
 * signed-in user, scoped only by `user_id` -- safe by construction, no cross-table join required
 * (unlike show removal's `delete_show_ranking_data` RPC, which needs to filter by a specific
 * show's episodes), so no RPC is needed here. The explicit "manual full re-rank" escape hatch --
 * see Docs/STATUS.md Bucket 4 item 15's UX spec: offered alongside the targeted reconciliation
 * notice, for a user who'd rather redo the whole comparison from scratch than trust the automatic
 * targeted patch.
 *
 * Deliberately does *not* touch `all_star_progress`: resetting someone's ranking data doesn't mean
 * they've never completed a pass before -- that's literally why this reset button exists, to redo
 * something they already built once. `has_completed_once` stays exactly as it was.
 */
export async function resetAllStarRanking(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const userId = await requireUserId(supabase);

  const { error: comparisonsError } = await supabase.from('all_star_comparisons').delete().eq('user_id', userId);
  if (comparisonsError) {
    throw new Error(`Failed to reset all-star comparisons: ${comparisonsError.message}`);
  }

  const { error: rankingsError } = await supabase.from('all_star_rankings').delete().eq('user_id', userId);
  if (rankingsError) {
    throw new Error(`Failed to reset all-star rankings: ${rankingsError.message}`);
  }
}
