import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';
import { AppHeader } from '@/components/AppHeader';
import { getShowRankingDisplay } from '@/lib/ranking-session';
import { orderOldestFirst } from '@/lib/ranking/rankAllOrder';
import { rankSeasons, seasonAverageScores } from '@/lib/ranking/stats';
import { ensureShowSynced } from '@/lib/shows/refreshShow';

import { EpisodeListWithFilters, type EpisodeWithStatus, type SeasonRankInfo } from './EpisodeListWithFilters';
import { RemoveShowButton } from './RemoveShowButton';

export const metadata: Metadata = {
  title: 'Show — Episode Ranker',
};

// Session-dependent (auth guard) and reads freshly-imported data — never statically cached.
export const dynamic = 'force-dynamic';

interface ShowRow {
  id: string;
  title: string;
  poster_url: string | null;
  genres: string[] | null;
  tmdb_show_id: number;
  last_synced_at: string;
}

interface EpisodeRow {
  id: string;
  season_number: number;
  episode_number: number;
  title: string;
  air_date: string | null;
}

/**
 * Show detail page: a real per-episode list, grouped by season. Each row shows that episode's
 * current ranking status — a derived 1-10 score once it's ranked, its cold-start bucket while
 * mid-judgment, or a "Rank" link if it hasn't been touched at all yet. Clicking any unranked
 * episode starts ranking *that one specifically*
 * (`/shows/[showId]/rank/[episodeId]`, see that route's own doc comment) in whatever order the
 * user picks — not forced season/episode order.
 *
 * This replaces an earlier version of this page that just showed an episode count and a single
 * "Start ranking" button into a fixed whole-show auto-advance flow: hands-on testing found that
 * flow gave no way to pick a specific episode, no way to see current rankings mid-show, and no way
 * back out of it (see Docs/DevelopmentPlan.md's Phase 1 write-up for the full account).
 *
 * Reads `shows`/`episodes` via the *session-aware* client — RLS lets any signed-in user read this
 * global reference data (see `supabase/migrations/20260715000000_initial_schema.sql`), so this
 * isn't scoped to "shows this particular user added". Ranking status, by contrast, is genuinely
 * per-user (`getShowRankingDisplay`, from `@/lib/ranking-session`, scopes it via the signed-in
 * user itself).
 *
 * Accepts an optional `notice` query param — set to `'staleResubmission'` by `actions.ts`'s
 * `redirectAfterAlreadyRanked` when a stale resubmission (e.g. browser back to an already-answered
 * ranking question) landed here instead of recording anything, so the user isn't left wondering
 * whether their click did something. Informational, not an error — nothing actually went wrong.
 */
export default async function ShowDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ showId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { showId } = await params;
  const { notice } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: show } = await supabase
    .from('shows')
    .select('id, title, poster_url, genres, tmdb_show_id, last_synced_at')
    .eq('id', showId)
    .maybeSingle();

  if (!show) {
    notFound();
  }

  const showRow = show as ShowRow;
  await ensureShowSynced({
    tmdbShowId: showRow.tmdb_show_id,
    lastSyncedAt: showRow.last_synced_at,
  });

  const { data: episodesData, error: episodesError } = await supabase
    .from('episodes')
    .select('id, season_number, episode_number, title, air_date')
    .eq('show_id', showId)
    .order('season_number', { ascending: true })
    .order('episode_number', { ascending: true });

  const episodes = (episodesData ?? []) as EpisodeRow[];

  // Only worth asking for ranking status if there's actually something to rank and the episode
  // fetch itself succeeded — an empty/errored episode list has nothing for `getShowRankingDisplay`
  // to say anyway.
  const display = !episodesError && episodes.length > 0 ? await getShowRankingDisplay(showId) : null;

  // "Rank all" entry point: the oldest-by-air-date unranked episode, if any. Only meaningful (and
  // only rendered) when there's at least one fully-untouched episode left — `display.unranked`
  // already excludes anything ranked or mid-cold-start, matching the per-episode "Rank" links above.
  const rankAllEpisodeId =
    display && !display.done && display.unranked.length > 0
      ? orderOldestFirst(episodes, display.unranked)[0]
      : undefined;

  const scoreByEpisode = new Map<string, number>();
  const rankByEpisode = new Map<string, number>();
  const bucketByEpisode = new Map<string, string>();
  const createdAtByEpisode = new Map<string, string>();
  if (display) {
    for (const { episodeId, score, rank, createdAt } of display.ranked) {
      scoreByEpisode.set(episodeId, score);
      rankByEpisode.set(episodeId, rank);
      createdAtByEpisode.set(episodeId, createdAt);
    }
    if (!display.done) {
      for (const { episodeId, bucket, createdAt } of display.coldStartPending) {
        bucketByEpisode.set(episodeId, bucket);
        createdAtByEpisode.set(episodeId, createdAt);
      }
    }
  }

  // Derived season ranking (`Docs/STATUS.md`'s "season rank badge" item): each season's rank
  // relative to the show's other seasons, purely from already-ranked episodes' scores — no new
  // comparison flow, no schema change. `episodeSeasonById` follows the same pattern
  // `stats/page.tsx` already uses for the same purpose. Only seasons with at least one ranked
  // episode get an average (`seasonAverageScores`'s own contract), so a season with zero ranked
  // episodes simply has no entry in `seasonRanks` below and renders no badge.
  const episodeSeasonById = new Map(episodes.map((episode) => [episode.id, episode.season_number]));
  const seasonAverages = display ? seasonAverageScores(display.ranked, episodeSeasonById) : [];
  const seasonRankById = rankSeasons(seasonAverages);
  // Plain array, not a `Map` — same "plain array/object, not a `Map`" convention
  // `EpisodeListWithFilters`'s own doc comment already established for its `episodes` prop, since
  // this also crosses the Server->Client Component boundary.
  const seasonRanks: SeasonRankInfo[] = seasonAverages.map(({ seasonNumber, averageScore }) => ({
    seasonNumber,
    rank: seasonRankById.get(seasonNumber)!,
    averageScore,
  }));

  // Flattened, plain-object view of `episodes` + the four ranking-status lookups above, handed to
  // `EpisodeListWithFilters` (a Client Component) instead of the `Map`s themselves — plain
  // objects/arrays serialize cleanly as Server→Client Component props, and the client component
  // needs a flat array to re-derive filtered season groupings live as the user filters/searches
  // (see that file's own doc comment).
  const episodesWithStatus: EpisodeWithStatus[] = episodes.map((episode) => ({
    id: episode.id,
    season_number: episode.season_number,
    episode_number: episode.episode_number,
    title: episode.title,
    air_date: episode.air_date,
    score: scoreByEpisode.get(episode.id),
    rank: rankByEpisode.get(episode.id),
    bucket: bucketByEpisode.get(episode.id),
    createdAt: createdAtByEpisode.get(episode.id),
  }));

  return (
    <>
      <AppHeader />
      <div className="flex flex-1 flex-col items-center gap-6 p-8">
        {notice === 'staleResubmission' && (
          <p className="w-full max-w-2xl text-sm text-black/60 dark:text-white/60">
            This episode was already ranked — nothing changed.
          </p>
        )}
        <div className="flex w-full max-w-2xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            {showRow.poster_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- external TMDB CDN image.
              <img
                src={showRow.poster_url}
                alt=""
                width={92}
                height={138}
                className="h-[138px] w-[92px] rounded object-cover"
              />
            ) : null}
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold">{showRow.title}</h1>
              {showRow.genres && showRow.genres.length > 0 && (
                <p className="text-sm text-black/60 dark:text-white/60">{showRow.genres.join(', ')}</p>
              )}
              {display && (
                <p className="text-sm text-black/60 dark:text-white/60">
                  {(() => {
                    // Numerator counts episodes with *some* opinion given (fully ranked, or
                    // mid-cold-start-judged but not yet placed) — see Docs/STATUS.md's decision
                    // that this is closer to "the user has given an opinion on it" than counting
                    // only fully-placed episodes.
                    const rankedCount =
                      display.ranked.length + (display.done ? 0 : display.coldStartPending.length);
                    const total = episodes.length;
                    const percent = total > 0 ? Math.round((rankedCount / total) * 100) : 0;
                    return `${percent}% (${rankedCount}/${total}) episodes ranked`;
                  })()}
                </p>
              )}
              {display && display.confidence !== null && (
                <p className="text-sm text-black/60 dark:text-white/60">
                  Your {showRow.title} rankings are {Math.round(display.confidence)}% stable.
                </p>
              )}
              {display?.done && (
                <p className="text-sm font-medium text-green-700 dark:text-green-400">Ranking complete</p>
              )}
              <Link href={`/shows/${showId}/rankings`} className="text-sm underline">
                See episodes ranked best to worst
              </Link>
              <Link href={`/shows/${showId}/stats`} className="text-sm underline">
                See stats
              </Link>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <RemoveShowButton showId={showId} showTitle={showRow.title} />
            {rankAllEpisodeId && (
              <Link
                href={`/shows/${showId}/rank/${rankAllEpisodeId}?mode=rankAll`}
                className="whitespace-nowrap rounded border border-blue-600 px-3 py-1.5 text-sm text-blue-600 dark:border-blue-400 dark:text-blue-400"
              >
                Rank all
              </Link>
            )}
          </div>
        </div>

        {episodesError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            Couldn&apos;t load episodes: {episodesError.message}
          </p>
        )}

        {!episodesError && episodes.length === 0 && (
          <p className="text-sm text-black/60 dark:text-white/60">No episodes imported for this show yet.</p>
        )}

        {!episodesError && episodes.length > 0 && (
          <EpisodeListWithFilters showId={showId} episodes={episodesWithStatus} seasonRanks={seasonRanks} />
        )}
      </div>
    </>
  );
}
