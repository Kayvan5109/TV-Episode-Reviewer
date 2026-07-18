import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';
import { AppHeader } from '@/components/AppHeader';
import { getEpisodeComparisonRecord, getShowRankingDisplay } from '@/lib/ranking-session';
import type { EpisodeComparisonRecord } from '@/lib/ranking-session';
import { isSeasonFinale } from '@/lib/shows/seasonFinale';

import { ReRankButton } from '../../ReRankButton';
import { formatEpisode } from '../../rank/[episodeId]/episodeDisplay';

export const metadata: Metadata = {
  title: 'Episode — Episode Ranker',
};

// Session-dependent (auth guard) and reads per-user ranking status — never statically cached, same
// reasoning as the other authenticated pages in this app.
export const dynamic = 'force-dynamic';

interface ShowRow {
  id: string;
  title: string;
  status: string | null;
}

interface EpisodeRow {
  id: string;
  season_number: number;
  episode_number: number;
  title: string;
  still_url: string | null;
  season_poster_url: string | null;
  air_date: string | null;
  synopsis: string | null;
}

interface EpisodeSeasonRow {
  season_number: number;
  episode_number: number;
}

/** Matches the show page's own tiny bucket-label map (`BUCKET_LABELS`) — kept separate rather than
 * shared, same "don't force a shared-module refactor for a 3-entry map" judgment call. */
const BUCKET_LABELS: Record<string, string> = {
  liked: 'Liked',
  neutral: 'Neutral',
  disliked: 'Disliked',
};

/** e.g. "5 wins, 2 losses, 1 tie" — correct singular/plural for each category independently. */
function formatComparisonRecord(record: EpisodeComparisonRecord): string {
  const wins = `${record.wins} win${record.wins === 1 ? '' : 's'}`;
  const losses = `${record.losses} loss${record.losses === 1 ? '' : 'es'}`;
  const ties = `${record.ties} tie${record.ties === 1 ? '' : 's'}`;
  return `${wins}, ${losses}, ${ties}`;
}

/**
 * e.g. "Aired Jul 15, 2015" — unlike `formatRankedDate` on the show page (which omits the year
 * since ranking dates are always recent), air dates can span decades, so the year matters here.
 */
function formatAirDate(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  return `Aired ${date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })}`;
}

/**
 * Episode detail page: title, season/episode number, air date, synopsis, a hero still image
 * (falling back to the season poster when this specific episode has no still), a "Season finale"
 * badge when applicable, this user's personal win/loss/tie comparison record, and this episode's
 * ranking status (score + re-rank, cold-start bucket, or a "Rank this episode" link) — see
 * `Docs/AppSpec.md`/`Docs/STATUS.md`'s Tier A item 8(a)/(b)/(c) plus the rank/re-rank button added
 * alongside them. Deliberately doesn't build credits/cast yet — that's a separate follow-up item.
 *
 * Reads `shows`/`episodes` via the *session-aware* client — global reference data any signed-in
 * user can read (see `supabase/migrations/20260715000000_initial_schema.sql`). The episode read is
 * scoped to both `id` and `show_id` — a stale/wrong-show link 404s instead of silently rendering an
 * episode that belongs to a different show than the one in the URL. `getEpisodeComparisonRecord`/
 * `getShowRankingDisplay` (from `@/lib/ranking-session`) are, by contrast, genuinely per-user —
 * both derive the signed-in user themselves.
 */
export default async function EpisodeDetailPage({
  params,
}: {
  params: Promise<{ showId: string; episodeId: string }>;
}) {
  const { showId, episodeId } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: show } = await supabase
    .from('shows')
    .select('id, title, status')
    .eq('id', showId)
    .maybeSingle();

  if (!show) {
    notFound();
  }

  const showRow = show as ShowRow;

  const { data: episodeData, error: episodeError } = await supabase
    .from('episodes')
    .select('id, season_number, episode_number, title, still_url, season_poster_url, air_date, synopsis')
    .eq('id', episodeId)
    .eq('show_id', showId)
    .maybeSingle();

  if (!episodeError && !episodeData) {
    notFound();
  }

  const episode = episodeData as EpisodeRow | null;
  const imageUrl = episode ? episode.still_url ?? episode.season_poster_url : null;

  // Lightweight, all-episodes-of-the-show fetch (same pattern as `shows/[showId]/page.tsx`'s own
  // episode list, just fewer columns) — feeds `isSeasonFinale`'s "does a later season already
  // exist" check.
  const { data: allEpisodesData } = episode
    ? await supabase.from('episodes').select('season_number, episode_number').eq('show_id', showId)
    : { data: null };
  const allEpisodes = (allEpisodesData ?? []) as EpisodeSeasonRow[];

  const isFinale =
    episode !== null &&
    isSeasonFinale(
      { seasonNumber: episode.season_number, episodeNumber: episode.episode_number },
      allEpisodes.map((row) => ({ seasonNumber: row.season_number, episodeNumber: row.episode_number })),
      showRow.status
    );

  const comparisonRecord = episode ? await getEpisodeComparisonRecord(episodeId) : null;
  const hasComparisonRecord =
    comparisonRecord !== null &&
    comparisonRecord.wins + comparisonRecord.losses + comparisonRecord.ties > 0;

  const rankingDisplay = episode ? await getShowRankingDisplay(showId) : null;
  const rankedEntry = rankingDisplay?.ranked.find((entry) => entry.episodeId === episodeId);
  const coldStartEntry =
    rankingDisplay && !rankingDisplay.done
      ? rankingDisplay.coldStartPending.find((entry) => entry.episodeId === episodeId)
      : undefined;

  return (
    <>
      <AppHeader />
      <div className="flex flex-1 flex-col items-center gap-6 p-8">
        <div className="flex w-full max-w-2xl flex-col gap-6">
          <Link href={`/shows/${showId}`} className="text-sm underline underline-offset-2">
            ← Back to {showRow.title}
          </Link>

          {episodeError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              Couldn&apos;t load episode: {episodeError.message}
            </p>
          )}

          {!episodeError && episode && (
            <div className="flex flex-col gap-4">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- external TMDB CDN image.
                <img
                  src={imageUrl}
                  alt=""
                  width={640}
                  height={360}
                  className="h-[360px] w-full rounded object-cover"
                />
              ) : null}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-black/60 dark:text-white/60">
                    Season {episode.season_number}, Episode {episode.episode_number}
                  </p>
                  {isFinale && (
                    <span className="rounded bg-black/5 px-2 py-1 text-xs text-black/70 dark:bg-white/10 dark:text-white/70">
                      Season finale
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-semibold">{episode.title}</h1>
              </div>

              <div className="flex items-center gap-3">
                {rankedEntry ? (
                  <>
                    <span className="text-sm font-medium">
                      {rankedEntry.score.toFixed(1)}
                      <span className="ml-1 font-normal text-black/50 dark:text-white/50">
                        (#{rankedEntry.rank})
                      </span>
                    </span>
                    <ReRankButton
                      showId={showId}
                      episodeId={episode.id}
                      episodeLabel={formatEpisode(episode)}
                    />
                  </>
                ) : coldStartEntry ? (
                  <span className="rounded bg-black/5 px-2 py-1 text-xs text-black/70 dark:bg-white/10 dark:text-white/70">
                    {BUCKET_LABELS[coldStartEntry.bucket] ?? coldStartEntry.bucket}
                  </span>
                ) : (
                  <Link
                    href={`/shows/${showId}/rank/${episode.id}`}
                    className="rounded bg-black px-3 py-1 text-xs text-white dark:bg-white dark:text-black"
                  >
                    Rank this episode
                  </Link>
                )}
              </div>

              {episode.air_date && (
                <p className="text-sm text-black/60 dark:text-white/60">
                  {formatAirDate(episode.air_date)}
                </p>
              )}
              {episode.synopsis && (
                <p className="text-base text-black/80 dark:text-white/80">{episode.synopsis}</p>
              )}
              {hasComparisonRecord && comparisonRecord && (
                <p className="text-sm text-black/60 dark:text-white/60">
                  {formatComparisonRecord(comparisonRecord)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
