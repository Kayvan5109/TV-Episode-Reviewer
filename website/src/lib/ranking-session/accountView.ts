/**
 * Read-only, viewer-facing counterpart to `./session.ts`'s `getShowRankingDisplay` -- computes each
 * of `targetUserId`'s tracked shows' ranking progress and current #1 episode purely by reading
 * `episode_rankings` as currently stored, with **no** algorithm advancement (no cold-start folding
 * into comparative placement, no persisted position rewrites, no side-effecting writes of any kind).
 *
 * `getShowRankingDisplay` cannot be reused here even though its output shape is similar: it writes to
 * the database as a side effect of being called (folding cold-start episodes into the comparative
 * pool, auto-placing new pool entrants, persisting reconciliation results) and always derives the
 * user id from the *caller's own session* (`requireUserId`), refusing a caller-supplied id by design
 * -- both correct for a user viewing their own dashboard, both wrong for a viewer looking at someone
 * else's account. This module never calls it, and never calls `addComparativeEpisode`,
 * `placeEpisodeComparatively`, or any `persist*` function.
 *
 * Used exclusively by `/u/[username]` to render another user's "Shows" section. `targetUserId` is
 * NOT re-derived from the caller's session here -- the caller (the page) has already resolved it
 * from a public username lookup (`lookupProfileIdentityByUsername`). Every query below is still
 * explicitly scoped by `.eq('user_id', targetUserId)`, but the actual security boundary is RLS: the
 * new cross-user SELECT policies added in
 * `supabase/migrations/20260723010000_account_page_visibility.sql` are what decide whether any
 * `user_shows`/`episode_rankings` rows come back at all for a private, not-followed target (zero
 * rows, not an error) -- this module does not attempt to enforce that itself.
 *
 * Same URL-length lesson as `./session.ts` (Docs/STATUS.md Bucket 1 item 1): `episode_rankings` is
 * read once per call, scoped only by `user_id`, never `.in('episode_id', <list>)` -- filtered down to
 * each show's episodes in application code afterward. `episodes` is queried per show (bounded by one
 * show's episode count, not the URL-length-risky "every episode of every tracked show" shape).
 */

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

export interface AccountShow {
  showId: string;
  title: string;
  posterUrl: string | null;
  /** Episodes with any `episode_rankings` row (cold-start or comparative) -- matches
   *  `getShowRankingDisplay`'s own "ranked = some opinion given" convention. */
  rankedCount: number;
  total: number;
  /** `0` when `total` is `0` (no episodes imported yet), matching the dashboard's own guard. */
  percent: number;
  /** The show's current #1 comparatively-ranked episode (`rank_position = 1`), or `null` if the
   *  show has no comparatively-ranked episode yet (still cold-start, or genuinely empty). */
  topEpisode: { title: string; seasonNumber: number } | null;
}

interface UserShowRow {
  show_id: string;
  shows: { id: string; title: string; poster_url: string | null } | null;
}

interface EpisodeRow {
  id: string;
  title: string;
  season_number: number;
}

interface RankingRow {
  episode_id: string;
  rank_position: number | null;
  cold_start_bucket: string | null;
}

/**
 * Every show `targetUserId` has added (`user_shows`), each with its current ranking progress and #1
 * episode computed purely from stored `episode_rankings` rows -- see this module's own doc comment
 * for why this can't reuse `getShowRankingDisplay`. Mirrors the display shape `dashboard/page.tsx`
 * already renders for the signed-in owner's own view (poster, title, progress bar, "Best: {title}
 * (S{n})") -- see that page for the exact rendering this feeds.
 */
export async function getAccountShows(targetUserId: string): Promise<AccountShow[]> {
  const supabase = await createSupabaseServerClient();

  const { data: userShowsData, error: userShowsError } = await supabase
    .from('user_shows')
    .select('show_id, shows(id, title, poster_url)')
    .eq('user_id', targetUserId)
    .order('created_at', { ascending: false });

  if (userShowsError) {
    throw new Error(`Failed to load shows for user ${targetUserId}: ${userShowsError.message}`);
  }

  const showRows = ((userShowsData ?? []) as unknown as UserShowRow[]).filter(
    (row): row is UserShowRow & { shows: NonNullable<UserShowRow['shows']> } => row.shows !== null
  );
  if (showRows.length === 0) return [];

  // Global reference table, one query per show (bounded by that show's own episode count, not by
  // how many shows this user tracks) -- mirrors `getShowRankingDisplay`'s own per-show `episodes`
  // query shape, just without the write-side orchestration around it.
  const episodesByShowId = new Map<string, EpisodeRow[]>();
  await Promise.all(
    showRows.map(async (row) => {
      const { data, error } = await supabase
        .from('episodes')
        .select('id, title, season_number')
        .eq('show_id', row.show_id)
        .order('season_number', { ascending: true })
        .order('episode_number', { ascending: true });
      if (error) {
        throw new Error(`Failed to load episodes for show ${row.show_id}: ${error.message}`);
      }
      episodesByShowId.set(row.show_id, (data ?? []) as EpisodeRow[]);
    })
  );

  // One query, scoped only by user_id -- see module comment for why no `.in('episode_id', ...)`.
  const { data: rankingRowsRaw, error: rankingError } = await supabase
    .from('episode_rankings')
    .select('episode_id, rank_position, cold_start_bucket')
    .eq('user_id', targetUserId);
  if (rankingError) {
    throw new Error(`Failed to load rankings for user ${targetUserId}: ${rankingError.message}`);
  }
  const rankingByEpisodeId = new Map(
    ((rankingRowsRaw ?? []) as RankingRow[]).map((row) => [row.episode_id, row])
  );

  return showRows.map((row) => {
    const episodes = episodesByShowId.get(row.show_id) ?? [];
    let rankedCount = 0;
    let topEpisode: AccountShow['topEpisode'] = null;

    for (const episode of episodes) {
      const ranking = rankingByEpisodeId.get(episode.id);
      if (!ranking) continue;
      // A row exists only once something's been judged (cold-start or comparative) -- either
      // field being non-null is the "has ranking data" signal, matching
      // `reconstructShowRankingState`'s own invariant.
      if (ranking.rank_position === null && ranking.cold_start_bucket === null) continue;
      rankedCount += 1;
      if (ranking.rank_position === 1) {
        topEpisode = { title: episode.title, seasonNumber: episode.season_number };
      }
    }

    const total = episodes.length;
    return {
      showId: row.show_id,
      title: row.shows.title,
      posterUrl: row.shows.poster_url,
      rankedCount,
      total,
      percent: total === 0 ? 0 : Math.round((rankedCount / total) * 100),
      topEpisode,
    };
  });
}
