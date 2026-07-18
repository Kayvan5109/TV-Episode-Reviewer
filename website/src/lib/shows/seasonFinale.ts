/**
 * Pure derivation of "is this episode a season finale?" — see `Docs/AppSpec.md`'s "A season finale
 * flag" write-up (External Design Review — Triage) for the exact approved rule.
 *
 * An episode is a season finale if it has the highest episode number in its season, AND that
 * season is definitely over — either a later season already exists for the show, or this is the
 * last season and the show's TMDB `status` is `Ended`/`Canceled`. Deliberately never flags the
 * newest episode of a still-airing season (unknown/absent status, or a status like "Returning
 * Series", doesn't count as "over").
 *
 * "A later season already exists" is derived from `allEpisodes` itself (any other episode row for
 * this show with a higher `seasonNumber`) rather than a separately-stored season count — avoids
 * needing to persist TMDB's `number_of_seasons` anywhere.
 */

export interface EpisodeSeasonInfo {
  seasonNumber: number;
  episodeNumber: number;
}

export function isSeasonFinale(
  episode: EpisodeSeasonInfo,
  allEpisodes: readonly EpisodeSeasonInfo[],
  showStatus: string | null
): boolean {
  const highestEpisodeNumberInSeason = allEpisodes
    .filter((other) => other.seasonNumber === episode.seasonNumber)
    .reduce((max, other) => Math.max(max, other.episodeNumber), -Infinity);

  if (episode.episodeNumber !== highestEpisodeNumberInSeason) {
    return false;
  }

  const laterSeasonExists = allEpisodes.some((other) => other.seasonNumber > episode.seasonNumber);
  if (laterSeasonExists) {
    return true;
  }

  return showStatus === 'Ended' || showStatus === 'Canceled';
}
