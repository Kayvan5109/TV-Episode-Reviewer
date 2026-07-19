'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { ReRankButton } from './ReRankButton';

export interface EpisodeWithStatus {
  id: string;
  season_number: number;
  episode_number: number;
  title: string;
  air_date: string | null;
  score?: number;
  rank?: number;
  bucket?: string;
  createdAt?: string;
}

const BUCKET_LABELS: Record<string, string> = {
  liked: 'Liked',
  neutral: 'Neutral',
  disliked: 'Disliked',
};

/** Matches `rank/[episodeId]/page.tsx`'s own `formatEpisode` — used here for `ReRankButton`'s confirm message. */
export function formatEpisode(episode: EpisodeWithStatus): string {
  return `S${episode.season_number}E${episode.episode_number} — ${episode.title}`;
}

/** e.g. "Jul 15" — concise, no year (all ranking data is recent enough that the year is noise). */
export function formatRankedDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Lowercased blob an episode is matched against: title, bare episode number, and an "sXeY" code, so
 * a search box can match a title fragment, a bare episode number, or something like "s2e5" with one
 * simple substring check — see `matchesSearch`.
 */
export function searchableText(episode: EpisodeWithStatus): string {
  return `${episode.title} ${episode.episode_number} s${episode.season_number}e${episode.episode_number}`.toLowerCase();
}

/** Case-insensitive substring match of `query` against `searchableText(episode)`. An empty/blank query matches everything. */
export function matchesSearch(episode: EpisodeWithStatus, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === '') {
    return true;
  }
  return searchableText(episode).includes(trimmed);
}

/** Groups a flat episode list by season number. Order of insertion follows the input array's order. */
export function groupBySeason(episodes: EpisodeWithStatus[]): Map<number, EpisodeWithStatus[]> {
  const seasons = new Map<number, EpisodeWithStatus[]>();
  for (const episode of episodes) {
    const seasonEpisodes = seasons.get(episode.season_number) ?? [];
    seasonEpisodes.push(episode);
    seasons.set(episode.season_number, seasonEpisodes);
  }
  return seasons;
}

/** A season is "Complete" once every episode in it has a score (fully ranked) or a bucket (cold-start judged). */
export function isSeasonComplete(seasonEpisodes: EpisodeWithStatus[]): boolean {
  return seasonEpisodes.every((episode) => episode.score !== undefined || episode.bucket !== undefined);
}

/**
 * Applies the season filter and search query together (AND) — narrows to the selected season (or
 * everything, for `'all'`), then to episodes whose `searchableText` matches `query`. Pulled out as a
 * pure function, independent of any component state, so the season/search/combined/no-match
 * behavior is unit-testable without rendering anything (see `EpisodeListWithFilters.test.ts`),
 * matching how `ComparisonPrompt.tsx`/`resultForClickedSide` splits pure logic out from JSX
 * elsewhere in this app.
 */
export function filterEpisodes(
  episodes: EpisodeWithStatus[],
  { season, query }: { season: number | 'all'; query: string }
): EpisodeWithStatus[] {
  return episodes.filter(
    (episode) => (season === 'all' || episode.season_number === season) && matchesSearch(episode, query)
  );
}

/**
 * Season-grouped episode list for the show detail page, with a live client-side season filter and
 * search box (both filter the visible list on every change — no submit button, no page reload,
 * since every episode this needs is already fetched server-side by `page.tsx`). Moved out of
 * `page.tsx` (a Server Component) into its own Client Component because filter state
 * (`useState`) has to live somewhere interactive; `page.tsx` still owns fetching `episodes` and the
 * four ranking-status lookups, but flattens them into one plain `EpisodeWithStatus[]` before handing
 * off here — see `page.tsx`'s own comment on why a flat array crosses the server/client boundary
 * better than the `Map`s it's built from.
 *
 * Two independent groupings are derived from the same `episodes` prop: `fullSeasons` (the complete,
 * unfiltered season membership) drives the season filter's `<select>` options and each season's
 * "Complete" badge, while `filteredSeasons` (post season-filter, post-search) drives what actually
 * renders. Keeping these separate is the whole point — the "Complete" badge must reflect the
 * season's real completeness regardless of what the search box currently hides (see this task's
 * spec), so it's computed from `fullSeasons`, never from the filtered list.
 */
export function EpisodeListWithFilters({
  showId,
  episodes,
}: {
  showId: string;
  episodes: EpisodeWithStatus[];
}) {
  const [selectedSeason, setSelectedSeason] = useState<number | 'all'>('all');
  const [query, setQuery] = useState('');

  const seasonNumbers = useMemo(
    () => [...new Set(episodes.map((episode) => episode.season_number))].sort((a, b) => a - b),
    [episodes]
  );

  const fullSeasons = useMemo(() => groupBySeason(episodes), [episodes]);

  const filteredEpisodes = useMemo(
    () => filterEpisodes(episodes, { season: selectedSeason, query }),
    [episodes, selectedSeason, query]
  );

  const filteredSeasons = useMemo(() => groupBySeason(filteredEpisodes), [filteredEpisodes]);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          aria-label="Filter by season"
          value={selectedSeason}
          onChange={(event) =>
            setSelectedSeason(event.target.value === 'all' ? 'all' : Number(event.target.value))
          }
          className="rounded border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/20"
        >
          <option value="all">All seasons</option>
          {seasonNumbers.map((seasonNumber) => (
            <option key={seasonNumber} value={seasonNumber}>
              Season {seasonNumber}
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Search episodes"
          placeholder="Search by title or episode number…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="flex-1 rounded border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/20"
        />
      </div>

      {filteredEpisodes.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">No episodes match.</p>
      ) : (
        [...filteredSeasons.entries()]
          .sort(([a], [b]) => a - b)
          .map(([seasonNumber, seasonEpisodes]) => (
            <div key={seasonNumber} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-medium">Season {seasonNumber}</h2>
                {isSeasonComplete(fullSeasons.get(seasonNumber) ?? []) && (
                  <span className="rounded bg-black/5 px-2 py-1 text-xs text-black/70 dark:bg-white/10 dark:text-white/70">
                    Complete
                  </span>
                )}
              </div>
              <ol className="flex flex-col gap-2">
                {seasonEpisodes.map((episode) => (
                  <li
                    key={episode.id}
                    className="flex items-center justify-between gap-3 rounded border border-black/10 p-2 text-sm dark:border-white/20"
                  >
                    <span className="flex gap-3">
                      <span className="text-black/50 dark:text-white/50">E{episode.episode_number}</span>
                      <Link
                        href={`/shows/${showId}/episodes/${episode.id}`}
                        className="underline underline-offset-2"
                      >
                        {episode.title}
                      </Link>
                      {episode.createdAt !== undefined && (
                        <span className="text-black/40 dark:text-white/40">
                          Ranked {formatRankedDate(episode.createdAt)}
                        </span>
                      )}
                    </span>
                    {episode.score !== undefined ? (
                      <span className="flex items-center gap-3">
                        <span className="font-medium">
                          {episode.score.toFixed(1)}
                          {episode.rank !== undefined && (
                            <span className="ml-1 font-normal text-black/50 dark:text-white/50">
                              (#{episode.rank})
                            </span>
                          )}
                        </span>
                        <ReRankButton
                          showId={showId}
                          episodeId={episode.id}
                          episodeLabel={formatEpisode(episode)}
                        />
                      </span>
                    ) : episode.bucket !== undefined ? (
                      <span className="rounded bg-black/5 px-2 py-1 text-xs text-black/70 dark:bg-white/10 dark:text-white/70">
                        {BUCKET_LABELS[episode.bucket] ?? episode.bucket}
                      </span>
                    ) : (
                      <Link
                        href={`/shows/${showId}/rank/${episode.id}`}
                        className="rounded bg-black px-3 py-1 text-xs text-white dark:bg-white dark:text-black"
                      >
                        Rank
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ))
      )}
    </div>
  );
}
