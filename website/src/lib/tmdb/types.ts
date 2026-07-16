/**
 * TMDB API response shapes and the app-facing shapes we reshape them into.
 *
 * These only declare the fields this app actually reads — TMDB's real responses have many more
 * fields, but route handlers should never pass the raw response through to the client (see
 * `Docs/TechArchitecture.md`'s TMDB proxy note).
 */

/** Raw shape (subset) of one result from GET /search/tv. */
export interface TmdbTvSearchResult {
  id: number;
  name: string;
  poster_path: string | null;
}

/** Raw shape (subset) of the GET /search/tv response envelope. */
export interface TmdbTvSearchResponse {
  results: TmdbTvSearchResult[];
}

/** Raw shape (subset) of one episode entry from GET /tv/{series_id}/season/{season_number}. */
export interface TmdbSeasonEpisode {
  id: number;
  name: string;
  season_number: number;
  episode_number: number;
}

/** Raw shape (subset) of the GET /tv/{series_id}/season/{season_number} response. */
export interface TmdbSeasonResponse {
  episodes: TmdbSeasonEpisode[];
}

/** App-facing shape for a show search result — maps to the `shows` table's columns. */
export interface ShowSearchResult {
  tmdbShowId: number;
  title: string;
  posterUrl: string | null;
}

/** App-facing shape for one episode — maps to the `episodes` table's columns. */
export interface EpisodeSummary {
  tmdbEpisodeId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
}
