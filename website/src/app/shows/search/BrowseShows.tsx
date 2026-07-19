'use client';

import { useEffect, useState } from 'react';

import type { ShowSearchResultWithStatus } from '@/lib/shows/searchAnnotation';
import type { TmdbGenre } from '@/lib/tmdb/types';

import { ShowResultRow } from './ShowResultRow';

/**
 * "Browse popular shows" view, shown by `ShowSearchForm` when the search input is empty — gives a
 * user who can't think of a specific show something to look at instead of a blank page. Fetches
 * TMDB's popularity-sorted `/discover/tv` (via the `/api/tmdb/discover` proxy, first page only —
 * ~20 results, no pagination for v1) and the genre list (via `/api/tmdb/genres`) on mount.
 *
 * The genre filter only applies here, never to typed search results — TMDB's `/search/tv` has no
 * genre param, and post-filtering search hits client-side is out of scope for v1 (see
 * `/api/tmdb/discover/route.ts`'s doc comment for the full reasoning). Changing the genre re-fetches
 * `/api/tmdb/discover?genre=<id>`, same endpoint/sort, just with `with_genres` added.
 *
 * Never calls TMDB directly — only through the two server-only proxy routes, same as
 * `ShowSearchForm`.
 */
export function BrowseShows() {
  const [genres, setGenres] = useState<TmdbGenre[]>([]);
  const [selectedGenre, setSelectedGenre] = useState('');
  const [shows, setShows] = useState<ShowSearchResultWithStatus[] | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  // Genre list: fetched once on mount, independent of the currently selected genre. Failure here
  // is non-fatal — the browse grid itself still works, just with an empty "All genres only" select.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/tmdb/genres');
        const body = await response.json();
        if (!cancelled && response.ok) {
          setGenres(body.genres as TmdbGenre[]);
        }
      } catch {
        // Swallowed on purpose — see comment above.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Popular-shows grid: (re)fetched whenever the selected genre changes, including the initial
  // unfiltered load. An `AbortController` cancels a stale in-flight request when the genre changes
  // again before it resolves, or on unmount — same pattern as `ShowSearchForm`'s `runSearch`.
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      setStatus('loading');
      setErrorMessage('');

      try {
        const url = selectedGenre
          ? `/api/tmdb/discover?genre=${encodeURIComponent(selectedGenre)}`
          : '/api/tmdb/discover';
        const response = await fetch(url, { signal: controller.signal });
        const body = await response.json();

        if (!response.ok) {
          setStatus('error');
          setErrorMessage(body.error ?? 'Failed to load popular shows.');
          setShows(null);
          return;
        }

        setShows(body.results as ShowSearchResultWithStatus[]);
        setStatus('idle');
      } catch (error) {
        // A newer genre selection superseded this request — that effect run already owns
        // `status`/`shows`, so this stale response just drops on the floor.
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setStatus('error');
        setErrorMessage('Failed to load popular shows — check your connection and try again.');
        setShows(null);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [selectedGenre]);

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center gap-2">
        <select
          aria-label="Filter by genre"
          value={selectedGenre}
          onChange={(event) => setSelectedGenre(event.target.value)}
          className="rounded border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/20"
        >
          <option value="">All genres</option>
          {genres.map((genre) => (
            <option key={genre.id} value={genre.id}>
              {genre.name}
            </option>
          ))}
        </select>
        {status === 'loading' && (
          <span role="status" className="text-sm text-black/60 dark:text-white/60">
            Loading…
          </span>
        )}
      </div>

      {status === 'error' && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      )}

      {status !== 'error' && shows !== null && shows.length === 0 && (
        <p className="text-sm text-black/60 dark:text-white/60">No popular shows found.</p>
      )}

      {shows !== null && shows.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {shows.map((show) => (
            <ShowResultRow key={show.tmdbShowId} result={show} />
          ))}
        </div>
      )}
    </div>
  );
}
