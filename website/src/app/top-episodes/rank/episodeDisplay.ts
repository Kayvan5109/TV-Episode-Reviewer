/**
 * Shared plain-data shape + formatting for one episode's display in the Top Episodes comparison
 * flow. Mirrors `@/app/shows/[showId]/rank/[episodeId]/episodeDisplay.ts`'s `EpisodeDisplay`
 * closely, but adds `showId`/`showTitle` — the two compared episodes here can belong to
 * *different* shows (unlike the per-show comparison screen, where both sides always share one
 * `showId` from the route itself), so each side needs to carry its own.
 */
export interface AllStarEpisodeDisplay {
  id: string;
  showId: string;
  showTitle: string;
  season_number: number;
  episode_number: number;
  title: string;
  season_poster_url: string | null;
  still_url: string | null;
  synopsis: string | null;
}

export function formatAllStarEpisode(episode: AllStarEpisodeDisplay): string {
  return `S${episode.season_number}E${episode.episode_number} — ${episode.title}`;
}
