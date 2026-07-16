/**
 * Reshapes raw TMDB API responses into the app's own data model (see `Docs/AppSpec.md`'s data
 * model and `supabase/migrations`). Route handlers should return these shapes, never the raw
 * TMDB response — keeps the API surface small and stable even if TMDB's payloads change.
 */

import { posterUrlFromPath } from './client';
import type { EpisodeSummary, ShowSearchResult, TmdbSeasonEpisode, TmdbTvSearchResult } from './types';

export function mapShowSearchResult(result: TmdbTvSearchResult): ShowSearchResult {
  return {
    tmdbShowId: result.id,
    title: result.name,
    posterUrl: posterUrlFromPath(result.poster_path),
  };
}

export function mapSeasonEpisode(episode: TmdbSeasonEpisode): EpisodeSummary {
  return {
    tmdbEpisodeId: episode.id,
    seasonNumber: episode.season_number,
    episodeNumber: episode.episode_number,
    title: episode.name,
  };
}
