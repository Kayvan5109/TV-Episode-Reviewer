/**
 * GET /api/tmdb/[showId]/episodes?season=<season number>
 *
 * Server-side proxy over TMDB's `/tv/{series_id}/season/{season_number}` endpoint (see
 * `src/lib/tmdb/client.ts`) — a TMDB show only exposes its episode list one season at a time, so
 * this route takes the season as a required query param. Never call TMDB directly from the
 * browser or iOS; returns only the fields the app needs, not TMDB's raw response.
 */

import { NextRequest, NextResponse } from 'next/server';
import { tmdbErrorBody, tmdbFetch } from '@/lib/tmdb/client';
import { mapSeasonEpisode } from '@/lib/tmdb/mappers';
import type { TmdbSeasonResponse } from '@/lib/tmdb/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ showId: string }> }
) {
  const { showId } = await params;

  if (!/^\d+$/.test(showId)) {
    return NextResponse.json(
      { error: 'showId must be a numeric TMDB show id.' },
      { status: 400 }
    );
  }

  const seasonParam = request.nextUrl.searchParams.get('season');
  const season = seasonParam ? Number(seasonParam) : NaN;
  if (!seasonParam || !Number.isInteger(season) || season < 0) {
    return NextResponse.json(
      { error: 'Missing or invalid required "season" search parameter (non-negative integer).' },
      { status: 400 }
    );
  }

  try {
    const data = await tmdbFetch<TmdbSeasonResponse>(`/tv/${showId}/season/${season}`);
    return NextResponse.json({
      episodes: data.episodes.map((episode) => mapSeasonEpisode(episode, data.poster_path)),
    });
  } catch (error) {
    const { status, body } = tmdbErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
