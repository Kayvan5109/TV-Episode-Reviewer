/**
 * GET /api/tmdb/search?query=<show name>
 *
 * Server-side proxy over TMDB's `/search/tv` endpoint (see `src/lib/tmdb/client.ts`) — never call
 * TMDB directly from the browser or iOS, so `TMDB_API_READ_ACCESS_TOKEN` stays server-only.
 * Returns only the fields the app needs, not TMDB's raw response.
 */

import { NextRequest, NextResponse } from 'next/server';
import { tmdbErrorBody, tmdbFetch } from '@/lib/tmdb/client';
import { mapShowSearchResult } from '@/lib/tmdb/mappers';
import type { TmdbTvSearchResponse } from '@/lib/tmdb/types';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('query');

  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: 'Missing required "query" search parameter.' },
      { status: 400 }
    );
  }

  try {
    const data = await tmdbFetch<TmdbTvSearchResponse>('/search/tv', { query });
    return NextResponse.json({ results: data.results.map(mapShowSearchResult) });
  } catch (error) {
    const { status, body } = tmdbErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
