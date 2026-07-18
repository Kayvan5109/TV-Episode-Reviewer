/**
 * Imports a TV show (and its full episode list) from TMDB into the global `shows`/`episodes`
 * reference tables (see `supabase/migrations/20260715000000_initial_schema.sql`).
 *
 * Server-only: writes to `shows`/`episodes` via the *service-role* Supabase client (see
 * `src/lib/supabase/server.ts`) since these are global reference data shared by all users, not
 * per-user data — same reasoning as the existing TMDB proxy routes. Never import this from a
 * client component; never use the session-aware or browser client for these writes (RLS has no
 * insert/update policy for `shows`/`episodes`, so they'd just fail — which is the point).
 */

import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { tmdbFetch } from '@/lib/tmdb/client';
import { mapSeasonEpisode, mapShowDetails } from '@/lib/tmdb/mappers';
import type { EpisodeSummary, TmdbSeasonResponse, TmdbShowDetails } from '@/lib/tmdb/types';

export interface ImportShowResult {
  /** This app's own DB id for the show (not the TMDB id) — used to build `/shows/[showId]` links. */
  showId: string;
  episodeCount: number;
}

/**
 * The season numbers to import for a show that TMDB reports has `numberOfSeasons` seasons (its
 * GET /tv/{id} response's `number_of_seasons` field). Loops 1..N inclusive — TMDB numbers regular
 * seasons starting at 1; season 0 ("Specials") is deliberately excluded, since `number_of_seasons`
 * itself doesn't count it either.
 *
 * Pure and exported for isolated unit testing (no TMDB/DB calls) — the orchestration in
 * `importShowFromTmdb` below is what actually loops over these.
 */
export function seasonNumbersFor(numberOfSeasons: number): number[] {
  if (!Number.isFinite(numberOfSeasons) || numberOfSeasons < 1) {
    return [];
  }
  const count = Math.trunc(numberOfSeasons);
  return Array.from({ length: count }, (_, index) => index + 1);
}

/** One `episodes` row shape, ready for `.upsert()`. */
export interface EpisodeInsertRow {
  show_id: string;
  tmdb_episode_id: number;
  season_number: number;
  episode_number: number;
  title: string;
  season_poster_url: string | null;
  synopsis: string | null;
  still_url: string | null;
  air_date: string | null;
}

/**
 * Pure mapping from the app-facing `EpisodeSummary` shape (what TMDB's season endpoint gives us,
 * already reshaped by `mapSeasonEpisode`) to `episodes` table rows for `showId`. Exported for
 * isolated unit testing.
 */
export function toEpisodeRows(showId: string, episodes: EpisodeSummary[]): EpisodeInsertRow[] {
  return episodes.map((episode) => ({
    show_id: showId,
    tmdb_episode_id: episode.tmdbEpisodeId,
    season_number: episode.seasonNumber,
    episode_number: episode.episodeNumber,
    title: episode.title,
    season_poster_url: episode.seasonPosterUrl,
    synopsis: episode.synopsis,
    still_url: episode.stillUrl,
    air_date: episode.airDate,
  }));
}

/**
 * Fetches `tmdbShowId`'s full details and every season's episode list from TMDB, and upserts them
 * into the global `shows`/`episodes` tables via the service-role client.
 *
 * Upsert (keyed on each table's unique TMDB-id column: `shows.tmdb_show_id`,
 * `episodes.tmdb_episode_id`) rather than "check if it exists, then insert" — this is what makes
 * it safe to call for a show/episode that's already been imported by another user (or re-added by
 * the same one): re-running this never hits a duplicate-key error, and never produces duplicate
 * rows, no matter how many users add the same show.
 */
export async function importShowFromTmdb(tmdbShowId: number): Promise<ImportShowResult> {
  const rawDetails = await tmdbFetch<TmdbShowDetails>(`/tv/${tmdbShowId}`);
  const details = mapShowDetails(rawDetails);

  const supabase = createSupabaseServiceClient();

  const { data: show, error: showError } = await supabase
    .from('shows')
    .upsert(
      {
        tmdb_show_id: details.tmdbShowId,
        title: details.title,
        poster_url: details.posterUrl,
        genres: details.genres,
        status: details.status,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'tmdb_show_id' }
    )
    .select('id')
    .single();

  if (showError || !show) {
    throw new Error(
      `Failed to upsert show (tmdb id ${tmdbShowId}): ${showError?.message ?? 'no row returned'}`
    );
  }

  const seasons = seasonNumbersFor(details.numberOfSeasons);
  const allEpisodes: EpisodeSummary[] = [];

  for (const season of seasons) {
    const rawSeason = await tmdbFetch<TmdbSeasonResponse>(`/tv/${tmdbShowId}/season/${season}`);
    allEpisodes.push(
      ...rawSeason.episodes.map((episode) => mapSeasonEpisode(episode, rawSeason.poster_path))
    );
  }

  if (allEpisodes.length > 0) {
    const rows = toEpisodeRows(show.id as string, allEpisodes);
    const { error: episodesError } = await supabase
      .from('episodes')
      .upsert(rows, { onConflict: 'tmdb_episode_id' });

    if (episodesError) {
      throw new Error(
        `Failed to upsert episodes for show (tmdb id ${tmdbShowId}): ${episodesError.message}`
      );
    }
  }

  return { showId: show.id as string, episodeCount: allEpisodes.length };
}
