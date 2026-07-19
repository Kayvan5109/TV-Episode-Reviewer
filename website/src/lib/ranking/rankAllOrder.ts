/**
 * Oldest-first episode ordering for "Rank all" mode's auto-advance queue (see `Docs/STATUS.md`).
 * Reuses `compareEpisodeChronologically` from `./stats` — the exact air-date-primary/season-episode-
 * fallback comparator already established for the season-timeline chart (see that function's doc
 * comment for the full rationale) — rather than re-implementing the same fallback rule. The only
 * difference here is the input shape: a plain episode row (`id`/`season_number`/`episode_number`/
 * `air_date`, matching this app's `episodes` table columns 1:1, snake_case and all) instead of
 * `TimelinePoint`/`TimelineEpisodeInfo`, since "Rank all" has no per-episode score to carry the way
 * the timeline chart does — it only ever needs episode ids, in order.
 *
 * Pure, no IO — callers (the show page, and `rank/[episodeId]/actions.ts`) are responsible for
 * fetching fresh episode rows and the current unranked-id list themselves.
 */

import { compareEpisodeChronologically } from './stats';

export interface EpisodeOrderRow {
  id: string;
  season_number: number;
  episode_number: number;
  /** ISO `YYYY-MM-DD`, or `null` for pre-migration imports missing this field. */
  air_date: string | null;
}

/**
 * Sorts `episodeIds` oldest-first (air-date-primary, season/episode-number fallback — see
 * `compareEpisodeChronologically`). `episodes` is the show's full episode list (or any superset
 * containing every id in `episodeIds`) — this looks each id up in it rather than requiring the
 * caller to pre-filter. Any id in `episodeIds` with no matching row in `episodes` is silently
 * dropped from the result rather than throwing: a stale id (e.g. an episode that got ranked by a
 * concurrent request a moment ago) should just fall out of the "Rank all" queue, not crash it.
 */
export function orderOldestFirst(
  episodes: readonly EpisodeOrderRow[],
  episodeIds: readonly string[]
): string[] {
  const byId = new Map(episodes.map((episode) => [episode.id, episode]));

  return episodeIds
    .map((id) => byId.get(id))
    .filter((episode): episode is EpisodeOrderRow => episode !== undefined)
    .sort((a, b) =>
      compareEpisodeChronologically(
        { seasonNumber: a.season_number, episodeNumber: a.episode_number, airDate: a.air_date },
        { seasonNumber: b.season_number, episodeNumber: b.episode_number, airDate: b.air_date }
      )
    )
    .map((episode) => episode.id);
}
