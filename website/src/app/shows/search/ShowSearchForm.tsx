'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ShowSearchResultWithStatus } from '@/lib/shows/searchAnnotation';
import { debounce, type Debounced } from '@/lib/utils/debounce';

import { BrowseShows } from './BrowseShows';
import { ShowResultRow } from './ShowResultRow';

/** How long to wait after the user stops typing before firing a search — see `debounce.ts`. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Live/autocomplete show search: hits the existing `/api/tmdb/search` proxy route (same-origin
 * fetch — this is a client component, but it never talks to TMDB directly, only to our own
 * Next.js route, which is the only place `TMDB_API_READ_ACCESS_TOKEN` is used) as the user types,
 * debounced so a burst of keystrokes collapses into one request ~300ms after typing stops rather
 * than firing per keystroke.
 *
 * That same route also annotates each result with the signed-in user's "already added this show"
 * status in the same round trip (see `route.ts`'s doc comment and `@/lib/shows/searchAnnotation`)
 * — a client component can't safely query our DB itself (no session cookie access, and doing so
 * would need its own auth-checked endpoint anyway), so combining TMDB lookup + per-user annotation
 * server-side into the one endpoint the client already calls avoids a second round trip.
 *
 * An `AbortController` per request cancels any earlier in-flight request when a newer one starts
 * (and on unmount), so a slow earlier response can never overwrite a newer one's results.
 *
 * When the query is empty (initial load, or cleared back to empty), renders `BrowseShows` — a
 * popular-shows grid with its own genre filter — instead of nothing. Typing anything hides that
 * browse view and falls through to the search-results flow above, unchanged from before; clearing
 * the input back to empty brings the browse view back. The two views share `ShowResultRow` for
 * rendering an individual result, so they always look the same.
 */
export function ShowSearchForm() {
  const [query, setQuery] = useState('');
  // The exact query string the currently-shown results/error correspond to — distinct from `query`
  // (the live input value) so "No shows found for X" always names what was actually searched, not
  // whatever's been typed since.
  const [searchedQuery, setSearchedQuery] = useState('');
  const [results, setResults] = useState<ShowSearchResultWithStatus[] | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(async (trimmedQuery: string) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch(`/api/tmdb/search?query=${encodeURIComponent(trimmedQuery)}`, {
        signal: controller.signal,
      });
      const body = await response.json();

      if (!response.ok) {
        setStatus('error');
        setErrorMessage(body.error ?? 'Search failed.');
        setResults(null);
        setSearchedQuery(trimmedQuery);
        return;
      }

      setResults(body.results as ShowSearchResultWithStatus[]);
      setSearchedQuery(trimmedQuery);
      setStatus('idle');
    } catch (error) {
      // A newer search superseded this one — its own `runSearch` call already owns `status`/
      // `results`, so this stale request just drops its response on the floor instead of
      // clobbering something more recent.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      setStatus('error');
      setErrorMessage('Search failed — check your connection and try again.');
      setResults(null);
      setSearchedQuery(trimmedQuery);
    }
  }, []);

  // The debounced wrapper is constructed once (in an effect, which runs after render — not
  // during it) and stored in a ref, rather than via `useMemo`: `useMemo`'s callback runs during
  // render, and `runSearch` reads/writes `abortControllerRef` — React's ref-safety rule flags any
  // ref access reachable during render, even indirectly, but explicitly allows the same access
  // from effects and event handlers (see the two below). Query changes are handled directly in
  // the `onChange` handler rather than a `useEffect` keyed on `query`, for the same reason: an
  // effect that synchronously calls `setState` to mirror state that's already derivable at input
  // time is discouraged (`react-hooks/set-state-in-effect`) — an event handler has no such
  // restriction, and every query change already originates from one place (`handleQueryChange`).
  const debouncedRunSearchRef = useRef<Debounced<[string]> | null>(null);

  useEffect(() => {
    debouncedRunSearchRef.current = debounce(runSearch, SEARCH_DEBOUNCE_MS);
    return () => {
      // Cancel any pending debounce/in-flight request on unmount (or if `runSearch` ever changed
      // identity, though it never does — it has no dependencies).
      debouncedRunSearchRef.current?.cancel();
      abortControllerRef.current?.abort();
    };
  }, [runSearch]);

  function handleQueryChange(value: string) {
    setQuery(value);
    const trimmed = value.trim();

    if (!trimmed) {
      debouncedRunSearchRef.current?.cancel();
      abortControllerRef.current?.abort();
      setResults(null);
      setSearchedQuery('');
      setStatus('idle');
      setErrorMessage('');
      return;
    }

    debouncedRunSearchRef.current?.(trimmed);
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-2">
        <label htmlFor="show-search-query" className="sr-only">
          Search for a TV show
        </label>
        <input
          id="show-search-query"
          name="query"
          type="text"
          placeholder="Search for a show…"
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          autoComplete="off"
          className="flex-1 rounded border border-black/20 px-3 py-2 dark:border-white/30"
        />
        {status === 'loading' && (
          <span role="status" className="text-sm text-black/60 dark:text-white/60">
            Searching…
          </span>
        )}
      </div>

      {query.trim() === '' ? (
        <BrowseShows />
      ) : (
        <>
          {status === 'error' && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </p>
          )}

          {status !== 'error' && results !== null && results.length === 0 && (
            <p className="text-sm text-black/60 dark:text-white/60">
              No shows found for &quot;{searchedQuery}&quot;.
            </p>
          )}

          {results !== null && results.length > 0 && (
            <ul className="flex flex-col gap-3">
              {results.map((result) => (
                <li key={result.tmdbShowId}>
                  <ShowResultRow result={result} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
