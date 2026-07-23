/**
 * Read-only, viewer-facing counterpart to `./session.ts`'s `getAllStarDisplay` -- reads
 * `targetUserId`'s `all_star_rankings` pool exactly as currently stored and computes display scores
 * for it via the existing pure `scoresForRankedList` (`@/lib/ranking/score`). Deliberately does
 * **no** reconciliation (`getAllStarDisplay`'s "always reload, always reconcile against the live
 * per-show #1s" step is what actually writes to the database -- removing stale/orphaned rows,
 * persisting newly-resolvable placements) and **no** stale-show placeholder splicing
 * (`buildDisplayRanked` in `./session.ts` is an owner-only live-editing affordance, not something a
 * read-only viewer needs). A viewer just sees the pool exactly as currently stored -- if it's stale
 * relative to the owner's live show rankings, that's the owner's business to reconcile next time they
 * load their own dashboard, not this module's concern.
 *
 * `getAllStarDisplay` cannot be reused here for the same reason `./session.ts`'s
 * `getShowRankingDisplay` can't be reused by `@/lib/ranking-session/accountView.ts`: it writes as a
 * side effect of being called and always derives the user id from the caller's own session. This
 * module never calls it, and never calls `placeEpisodeComparatively` or any `persist*`/
 * `markAllStarProgressCompleted` function.
 *
 * Used exclusively by `/u/[username]` to render another user's "Top Episodes" section. `targetUserId`
 * is NOT re-derived from the caller's session -- every query below is explicitly scoped by
 * `.eq('user_id', targetUserId)`, but the actual security boundary is RLS: the new cross-user SELECT
 * policy on `all_star_rankings` (`supabase/migrations/20260723010000_account_page_visibility.sql`)
 * is what decides whether any rows come back at all for a private, not-followed target (zero rows,
 * not an error).
 *
 * `episodes`/`shows` are looked up via `.in(...)`, same as `./session.ts`'s `getAllStarDisplay`
 * itself and `dashboard/page.tsx` -- bounded by how many shows this user tracks (at most one row per
 * show in `all_star_rankings`), not by any single show's episode count, so this is unaffected by the
 * URL-length lesson documented throughout this codebase (Docs/STATUS.md Bucket 1 item 1).
 */

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';
import { scoresForRankedList } from '@/lib/ranking/score';
import type { EpisodeId } from '@/lib/ranking/types';

export interface AccountTopEpisode {
  episodeId: EpisodeId;
  showId: string;
  showTitle: string;
  episodeTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  /** 1-based position within the stored pool, 1 = best -- read directly from
   *  `all_star_rankings.rank_position`, not recomputed. */
  rank: number;
  score: number;
}

interface AllStarRankingRow {
  show_id: string;
  episode_id: EpisodeId;
  rank_position: number;
}

interface EpisodeRow {
  id: string;
  title: string;
  season_number: number;
  episode_number: number;
}

interface ShowRow {
  id: string;
  title: string;
}

/**
 * `targetUserId`'s Top Episodes pool, ordered best (rank 1) to worst, exactly as currently stored --
 * see this module's own doc comment for why no reconciliation or placeholder splicing happens here.
 */
export async function getAccountTopEpisodes(targetUserId: string): Promise<AccountTopEpisode[]> {
  const supabase = await createSupabaseServerClient();

  const { data: rankingRowsRaw, error: rankingError } = await supabase
    .from('all_star_rankings')
    .select('show_id, episode_id, rank_position')
    .eq('user_id', targetUserId)
    .order('rank_position', { ascending: true });
  if (rankingError) {
    throw new Error(`Failed to load top episodes for user ${targetUserId}: ${rankingError.message}`);
  }

  // Sort explicitly in application code too, rather than trusting `.order()` alone -- this app has
  // already hit a real ordering bug in this exact pool (Docs/STATUS.md's all-star
  // `staleDisplacements` fix) caused by trusting unordered query results; cheap insurance here.
  const rankingRows = ((rankingRowsRaw ?? []) as AllStarRankingRow[])
    .slice()
    .sort((a, b) => a.rank_position - b.rank_position);

  if (rankingRows.length === 0) return [];

  const episodeIds = rankingRows.map((row) => row.episode_id);
  const showIds = [...new Set(rankingRows.map((row) => row.show_id))];

  const [episodesResult, showsResult] = await Promise.all([
    supabase.from('episodes').select('id, title, season_number, episode_number').in('id', episodeIds),
    supabase.from('shows').select('id, title').in('id', showIds),
  ]);

  if (episodesResult.error) {
    throw new Error(`Failed to load episodes for top episodes: ${episodesResult.error.message}`);
  }
  if (showsResult.error) {
    throw new Error(`Failed to load shows for top episodes: ${showsResult.error.message}`);
  }

  const episodeById = new Map(
    ((episodesResult.data ?? []) as EpisodeRow[]).map((episode) => [episode.id, episode])
  );
  const showById = new Map(((showsResult.data ?? []) as ShowRow[]).map((show) => [show.id, show]));

  // Best-to-worst by construction (already sorted by rank_position above) -- exactly the convention
  // `scoresForRankedList` expects (index 0 = best).
  const orderedEpisodeIds = rankingRows.map((row) => row.episode_id);
  const scores = scoresForRankedList(orderedEpisodeIds);

  return rankingRows.map((row) => {
    const episode = episodeById.get(row.episode_id);
    const show = showById.get(row.show_id);
    return {
      episodeId: row.episode_id,
      showId: row.show_id,
      showTitle: show?.title ?? 'Unknown show',
      episodeTitle: episode?.title ?? 'Unknown episode',
      seasonNumber: episode?.season_number ?? 0,
      episodeNumber: episode?.episode_number ?? 0,
      rank: row.rank_position,
      score: scores.get(row.episode_id)!,
    };
  });
}
