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

/**
 * Raw shape (subset) of the GET /discover/tv response envelope — identical to
 * `TmdbTvSearchResponse` (both endpoints return the same `results: TmdbTvSearchResult[]` envelope,
 * with the same `id`/`name`/`poster_path` fields this app reads), aliased under its own name rather
 * than duplicated so route code reads naturally regardless of which TMDB endpoint it's calling.
 */
export type TmdbDiscoverResponse = TmdbTvSearchResponse;

/** Raw shape of one TV genre from GET /genre/tv/list. */
export interface TmdbGenre {
  id: number;
  name: string;
}

/** Raw shape of the GET /genre/tv/list response envelope. */
export interface TmdbGenreListResponse {
  genres: TmdbGenre[];
}

/**
 * Raw shape (subset) of GET /tv/{series_id} ("show details"). Used only server-side, when
 * importing a show's full episode list — `number_of_seasons` is what drives looping over every
 * season rather than assuming season 1 is the only one.
 */
export interface TmdbShowDetails {
  id: number;
  name: string;
  poster_path: string | null;
  number_of_seasons: number;
  genres: { id: number; name: string }[];
  status: string;
}

/** Raw shape (subset) of one episode entry from GET /tv/{series_id}/season/{season_number}. */
export interface TmdbSeasonEpisode {
  id: number;
  name: string;
  season_number: number;
  episode_number: number;
  overview: string | null;
  still_path: string | null;
  air_date: string | null;
}

/**
 * Raw shape (subset) of the GET /tv/{series_id}/season/{season_number} response. `poster_path` is
 * the season's own poster (not per-episode) — a sibling field to `episodes`, not nested inside it.
 */
export interface TmdbSeasonResponse {
  episodes: TmdbSeasonEpisode[];
  poster_path: string | null;
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
  // Same season poster URL duplicated onto every episode in the season — see
  // supabase/migrations/20260718000000_episode_season_poster.sql for why this isn't normalized.
  seasonPosterUrl: string | null;
  // See supabase/migrations/20260718030000_episode_synopsis.sql.
  synopsis: string | null;
  // See supabase/migrations/20260718040000_episode_still_air_date.sql.
  stillUrl: string | null;
  // See supabase/migrations/20260718040000_episode_still_air_date.sql.
  airDate: string | null;
}

/** App-facing shape for a show's details — maps to the `shows` table's columns, plus season count. */
export interface ShowDetails {
  tmdbShowId: number;
  title: string;
  posterUrl: string | null;
  numberOfSeasons: number;
  genres: string[];
  // See supabase/migrations/20260718050000_shows_status.sql.
  status: string;
}

/** Raw shape (subset) of one entry from GET /tv/{series_id}/season/{s}/episode/{e}/credits's `cast` array. */
export interface TmdbEpisodeCastMember {
  name: string;
  character: string;
}

/** Raw shape (subset) of one entry from GET /tv/{series_id}/season/{s}/episode/{e}/credits's `crew` array. */
export interface TmdbEpisodeCrewMember {
  name: string;
  job: string;
}

/** Raw shape (subset) of GET /tv/{series_id}/season/{season_number}/episode/{episode_number}/credits. */
export interface TmdbEpisodeCredits {
  cast: TmdbEpisodeCastMember[];
  crew: TmdbEpisodeCrewMember[];
}

/** App-facing shape for one episode's credits — derived from `TmdbEpisodeCredits`, not persisted anywhere. */
export interface EpisodeCredits {
  directors: string[];
  writers: string[];
  cast: string[];
}
