import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';
import { AppHeader } from '@/components/AppHeader';
import { getShowRankingDisplay } from '@/lib/ranking-session';
import { ensureShowSynced } from '@/lib/shows/refreshShow';

import { RemoveShowButton } from './RemoveShowButton';
import { ReRankButton } from './ReRankButton';

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
}

const BUCKET_LABELS: Record<string, string> = {
  liked: 'Liked',
  neutral: 'Neutral',
  disliked: 'Disliked',
};

/** Matches `rank/[episodeId]/page.tsx`'s own `formatEpisode` — used here for `ReRankButton`'s confirm message. */
function formatEpisode(episode: EpisodeRow): string {
  return `S${episode.season_number}E${episode.episode_number} — ${episode.title}`;
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
 */
export default async function ShowDetailPage({
  params,
}: {
  params: Promise<{ showId: string }>;
}) {
  const { showId } = await params;

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
    .select('id, season_number, episode_number, title')
    .eq('show_id', showId)
    .order('season_number', { ascending: true })
    .order('episode_number', { ascending: true });

  const episodes = (episodesData ?? []) as EpisodeRow[];

  const seasons = new Map<number, EpisodeRow[]>();
  for (const episode of episodes) {
    const seasonEpisodes = seasons.get(episode.season_number) ?? [];
    seasonEpisodes.push(episode);
    seasons.set(episode.season_number, seasonEpisodes);
  }

  // Only worth asking for ranking status if there's actually something to rank and the episode
  // fetch itself succeeded — an empty/errored episode list has nothing for `getShowRankingDisplay`
  // to say anyway.
  const display = !episodesError && episodes.length > 0 ? await getShowRankingDisplay(showId) : null;

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

  /** e.g. "Jul 15" — concise, no year (all ranking data is recent enough that the year is noise). */
  function formatRankedDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return (
    <>
      <AppHeader />
      <div className="flex flex-1 flex-col items-center gap-6 p-8">
        <div className="flex w-full max-w-2xl items-start justify-between gap-4">
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
            </div>
          </div>
          <RemoveShowButton showId={showId} showTitle={showRow.title} />
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
          <div className="flex w-full max-w-2xl flex-col gap-6">
            {[...seasons.entries()]
              .sort(([a], [b]) => a - b)
              .map(([seasonNumber, seasonEpisodes]) => (
                <div key={seasonNumber} className="flex flex-col gap-2">
                  <h2 className="text-lg font-medium">Season {seasonNumber}</h2>
                  <ol className="flex flex-col gap-2">
                    {seasonEpisodes.map((episode) => {
                      const score = scoreByEpisode.get(episode.id);
                      const rank = rankByEpisode.get(episode.id);
                      const bucket = bucketByEpisode.get(episode.id);
                      const createdAt = createdAtByEpisode.get(episode.id);
                      return (
                        <li
                          key={episode.id}
                          className="flex items-center justify-between gap-3 rounded border border-black/10 p-2 text-sm dark:border-white/20"
                        >
                          <span className="flex gap-3">
                            <span className="text-black/50 dark:text-white/50">
                              E{episode.episode_number}
                            </span>
                            <span>{episode.title}</span>
                            {createdAt !== undefined && (
                              <span className="text-black/40 dark:text-white/40">
                                Ranked {formatRankedDate(createdAt)}
                              </span>
                            )}
                          </span>
                          {score !== undefined ? (
                            <span className="flex items-center gap-3">
                              <span className="font-medium">
                                {score.toFixed(1)}
                                {rank !== undefined && (
                                  <span className="ml-1 font-normal text-black/50 dark:text-white/50">
                                    (#{rank})
                                  </span>
                                )}
                              </span>
                              <ReRankButton
                                showId={showId}
                                episodeId={episode.id}
                                episodeLabel={formatEpisode(episode)}
                              />
                            </span>
                          ) : bucket !== undefined ? (
                            <span className="rounded bg-black/5 px-2 py-1 text-xs text-black/70 dark:bg-white/10 dark:text-white/70">
                              {BUCKET_LABELS[bucket] ?? bucket}
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
                      );
                    })}
                  </ol>
                </div>
              ))}
          </div>
        )}
      </div>
    </>
  );
}
