/**
 * Shared plain-data shape + formatting for the "season/episode + title" label used across this
 * route's episode displays. Split out so both `page.tsx` (a Server Component — `EpisodeColumn`/
 * `SeasonPoster`, used for the cold-start/already-ranked steps) and `ComparisonPrompt.tsx` (a
 * Client Component — its per-side comparison columns, which need this as a plain serializable
 * prop since poster click handling has to live in a Client Component) can format the same way
 * without either importing runtime code from the other. Field names match the `episodes` table
 * columns 1:1, so callers can pass rows straight through with no mapping.
 */
export interface EpisodeDisplay {
  id: string;
  season_number: number;
  episode_number: number;
  title: string;
  season_poster_url: string | null;
  synopsis: string | null;
}

export function formatEpisode(episode: EpisodeDisplay): string {
  return `S${episode.season_number}E${episode.episode_number} — ${episode.title}`;
}
