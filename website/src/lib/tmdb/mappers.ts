/**
 * Reshapes raw TMDB API responses into the app's own data model (see `Docs/AppSpec.md`'s data
 * model and `supabase/migrations`). Route handlers should return these shapes, never the raw
 * TMDB response — keeps the API surface small and stable even if TMDB's payloads change.
 */

import { posterUrlFromPath } from './client';
import type {
  EpisodeCredits,
  EpisodeSummary,
  ShowDetails,
  ShowSearchResult,
  TmdbEpisodeCredits,
  TmdbSeasonEpisode,
  TmdbShowDetails,
  TmdbTvSearchResult,
} from './types';

export function mapShowSearchResult(result: TmdbTvSearchResult): ShowSearchResult {
  return {
    tmdbShowId: result.id,
    title: result.name,
    posterUrl: posterUrlFromPath(result.poster_path),
  };
}

/**
 * `seasonPosterPath` is the season-level `poster_path` from the same `TmdbSeasonResponse` this
 * episode came from (a sibling of the response's `episodes` array, not part of `episode` itself) —
 * every episode in a season shares it, so callers pass it once per season rather than it living on
 * `TmdbSeasonEpisode`.
 */
export function mapSeasonEpisode(
  episode: TmdbSeasonEpisode,
  seasonPosterPath: string | null
): EpisodeSummary {
  return {
    tmdbEpisodeId: episode.id,
    seasonNumber: episode.season_number,
    episodeNumber: episode.episode_number,
    title: episode.name,
    seasonPosterUrl: posterUrlFromPath(seasonPosterPath),
    synopsis: episode.overview,
    stillUrl: posterUrlFromPath(episode.still_path),
    airDate: episode.air_date,
  };
}

export function mapShowDetails(details: TmdbShowDetails): ShowDetails {
  return {
    tmdbShowId: details.id,
    title: details.name,
    posterUrl: posterUrlFromPath(details.poster_path),
    numberOfSeasons: details.number_of_seasons,
    genres: details.genres.map((genre) => genre.name),
    status: details.status,
  };
}

/** De-dupes crew names by exact match, preserving first-seen order — used for both directors and writers. */
function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

/**
 * Reshapes a raw per-episode credits response into the small set this app actually displays:
 * directors/writers (crew filtered by exact `job` match, de-duped by name) and up to the first 8
 * cast members' names (TMDB already returns cast in billing order, so no re-sorting here).
 */
export function mapEpisodeCredits(raw: TmdbEpisodeCredits): EpisodeCredits {
  return {
    directors: dedupeNames(
      raw.crew.filter((member) => member.job === 'Director').map((member) => member.name)
    ),
    writers: dedupeNames(
      raw.crew.filter((member) => member.job === 'Writer').map((member) => member.name)
    ),
    cast: raw.cast.slice(0, 8).map((member) => member.name),
  };
}
