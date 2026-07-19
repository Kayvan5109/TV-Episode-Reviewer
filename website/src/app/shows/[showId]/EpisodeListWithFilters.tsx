'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { orderOldestFirst } from '@/lib/ranking/rankAllOrder';

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

/**
 * One season's derived rank relative to the show's other seasons (see `@/lib/ranking/stats`'s
 * `rankSeasons`), flattened to a plain array — same "plain array/object, not a `Map`" convention
 * this file's own `episodes` prop already follows for crossing the Server->Client Component
 * boundary. Only seasons with at least one ranked episode appear here at all (`seasonAverageScores`'
 * own contract) — a season with zero ranked episodes has no average to rank and gets no badge.
 */
export interface SeasonRankInfo {
  seasonNumber: number;
  /** 1-based rank among this show's seasons that have at least one ranked episode; 1 = best. */
  rank: number;
  averageScore: number;
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
 * For each season, the id of its own oldest-by-air-date unranked episode — the landing target for
 * that season's "Rank season" button. Mirrors `shows/[showId]/page.tsx`'s own whole-show
 * `rankAllEpisodeId` computation (unranked = no score and no bucket, ordered via
 * `orderOldestFirst`), just scoped to one season's episodes instead of the whole show's.
 *
 * `fullSeasons` must be the *unfiltered* per-season grouping (this component's own `fullSeasons`
 * memo, built from the full `episodes` prop) — same "Complete" badge reasoning: which episode a
 * season's rank-all button targets must not depend on whatever's currently typed into the search
 * box or which season filter is selected.
 *
 * A season with nothing unranked gets no entry in the returned map — same "no button when there's
 * nothing to rank" logic as the whole-show "Rank all" link only rendering when
 * `display.unranked.length > 0`.
 */
export function seasonRankAllTargets(fullSeasons: Map<number, EpisodeWithStatus[]>): Map<number, string> {
  const targets = new Map<number, string>();
  for (const [seasonNumber, seasonEpisodes] of fullSeasons) {
    const unrankedIds = seasonEpisodes
      .filter((episode) => episode.score === undefined && episode.bucket === undefined)
      .map((episode) => episode.id);
    if (unrankedIds.length === 0) {
      continue;
    }
    const oldestFirst = orderOldestFirst(seasonEpisodes, unrankedIds)[0];
    if (oldestFirst) {
      targets.set(seasonNumber, oldestFirst);
    }
  }
  return targets;
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
 *
 * `seasonRanks` (see `SeasonRankInfo`) drives a second badge, "#N", next to a season's "Complete"
 * badge when both apply — same "a property of the season as a whole" reasoning as "Complete": it's
 * derived from every ranked episode in the season regardless of the current search/season filter,
 * so it's looked up by season number directly rather than recomputed from any filtered grouping.
 *
 * A "Rank season" link (see `seasonRankAllTargets`) sits alongside those badges, for seasons that
 * still have at least one unranked episode — same `fullSeasons`-not-`filteredSeasons` reasoning: it
 * links to `/shows/[showId]/rank/[episodeId]?mode=rankAll&season=N`, the season-scoped generalization
 * of the show page's own whole-show "Rank all" link (`?mode=rankAll`, no `season` param — see
 * `page.tsx` and `rank/[episodeId]/actions.ts`'s `nextRankAllDestination`).
 */
export function EpisodeListWithFilters({
  showId,
  episodes,
  seasonRanks,
}: {
  showId: string;
  episodes: EpisodeWithStatus[];
  seasonRanks: SeasonRankInfo[];
}) {
  const [selectedSeason, setSelectedSeason] = useState<number | 'all'>('all');
  const [query, setQuery] = useState('');

  const seasonRankByNumber = useMemo(
    () => new Map(seasonRanks.map((info) => [info.seasonNumber, info])),
    [seasonRanks]
  );

  const seasonNumbers = useMemo(
    () => [...new Set(episodes.map((episode) => episode.season_number))].sort((a, b) => a - b),
    [episodes]
  );

  const fullSeasons = useMemo(() => groupBySeason(episodes), [episodes]);

  // Landing target for each season's "Rank season" button — see `seasonRankAllTargets`'s own doc
  // comment for why this is derived from `fullSeasons` (unfiltered) rather than `filteredSeasons`.
  const seasonRankAllTargetByNumber = useMemo(() => seasonRankAllTargets(fullSeasons), [fullSeasons]);

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
          .map(([seasonNumber, seasonEpisodes]) => {
            const seasonRank = seasonRankByNumber.get(seasonNumber);
            const seasonRankAllTarget = seasonRankAllTargetByNumber.get(seasonNumber);
            return (
              <div key={seasonNumber} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-medium">Season {seasonNumber}</h2>
                  {isSeasonComplete(fullSeasons.get(seasonNumber) ?? []) && (
                    <span className="rounded bg-black/5 px-2 py-1 text-xs text-black/70 dark:bg-white/10 dark:text-white/70">
                      Complete
                    </span>
                  )}
                  {seasonRank && (
                    <span
                      title={`Average score: ${seasonRank.averageScore.toFixed(1)}`}
                      className="rounded bg-black/5 px-2 py-1 text-xs text-black/70 dark:bg-white/10 dark:text-white/70"
                    >
                      #{seasonRank.rank}
                    </span>
                  )}
                  {seasonRankAllTarget && (
                    <Link
                      href={`/shows/${showId}/rank/${seasonRankAllTarget}?mode=rankAll&season=${seasonNumber}`}
                      className="whitespace-nowrap rounded border border-blue-600 px-2 py-1 text-xs text-blue-600 dark:border-blue-400 dark:text-blue-400"
                    >
                      Rank season
                    </Link>
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
            );
          })
      )}
    </div>
  );
}
