import Link from 'next/link';

import type { ShowSearchResultWithStatus } from '@/lib/shows/searchAnnotation';

import { AddShowButton } from './AddShowButton';

/**
 * One show result's row: poster (or a "No art" placeholder when TMDB has none), title, and either
 * a "Rank episodes →" link (already added — `alreadyAdded` + `showId`) or an `AddShowButton` (not
 * yet added). Shared by `ShowSearchForm`'s search-results list and `BrowseShows`'s popular-shows
 * grid — both render `ShowSearchResultWithStatus[]` from the same annotation shape (see
 * `@/lib/shows/searchAnnotation`), so this markup only needs to exist once.
 */
export function ShowResultRow({ result }: { result: ShowSearchResultWithStatus }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded border border-black/10 p-3 dark:border-white/20">
      <div className="flex items-center gap-3">
        {result.posterUrl ? (
          // External TMDB CDN image; not worth wiring next/image's remote-pattern config for a
          // Phase 1 MVP list thumbnail.
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
      {result.alreadyAdded && result.showId ? (
        <Link
          href={`/shows/${result.showId}`}
          className="whitespace-nowrap rounded border border-black/20 px-3 py-1.5 text-sm dark:border-white/30"
        >
          Rank episodes →
        </Link>
      ) : (
        <AddShowButton tmdbShowId={result.tmdbShowId} />
      )}
    </div>
  );
}
