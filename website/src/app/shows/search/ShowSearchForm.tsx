'use client';

import { useState } from 'react';

import type { ShowSearchResult } from '@/lib/tmdb/types';

import { AddShowButton } from './AddShowButton';

/**
 * Show search box: hits the existing `/api/tmdb/search` proxy route (same-origin fetch — this is
 * a client component, but it never talks to TMDB directly, only to our own Next.js route, which is
 * the only place `TMDB_API_READ_ACCESS_TOKEN` is used).
 */
export function ShowSearchForm() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ShowSearchResult[] | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch(`/api/tmdb/search?query=${encodeURIComponent(trimmed)}`);
      const body = await response.json();

      if (!response.ok) {
        setStatus('error');
        setErrorMessage(body.error ?? 'Search failed.');
        setResults(null);
        return;
      }

      setResults(body.results as ShowSearchResult[]);
      setStatus('idle');
    } catch {
      setStatus('error');
      setErrorMessage('Search failed — check your connection and try again.');
      setResults(null);
    }
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <label htmlFor="show-search-query" className="sr-only">
          Search for a TV show
        </label>
        <input
          id="show-search-query"
          name="query"
          type="text"
          placeholder="Search for a show…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
          className="flex-1 rounded border border-black/20 px-3 py-2 dark:border-white/30"
        />
        <button
          type="submit"
          disabled={status === 'loading' || query.trim().length === 0}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {status === 'loading' ? 'Searching…' : 'Search'}
        </button>
      </form>

      {status === 'error' && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      )}

      {results !== null && results.length === 0 && status !== 'error' && (
        <p className="text-sm text-black/60 dark:text-white/60">No shows found for &quot;{query}&quot;.</p>
      )}

      {results !== null && results.length > 0 && (
        <ul className="flex flex-col gap-3">
          {results.map((result) => (
            <li
              key={result.tmdbShowId}
              className="flex items-center justify-between gap-4 rounded border border-black/10 p-3 dark:border-white/20"
            >
              <div className="flex items-center gap-3">
                {result.posterUrl ? (
                  // External TMDB CDN image; not worth wiring next/image's remote-pattern config
                  // for a Phase 1 MVP list thumbnail.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={result.posterUrl}
                    alt=""
                    width={46}
                    height={69}
                    className="h-[69px] w-[46px] rounded object-cover"
                  />
                ) : (
                  <div className="flex h-[69px] w-[46px] items-center justify-center rounded bg-black/10 text-xs text-black/40 dark:bg-white/10 dark:text-white/40">
                    No art
                  </div>
                )}
                <span className="font-medium">{result.title}</span>
              </div>
              <AddShowButton tmdbShowId={result.tmdbShowId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
