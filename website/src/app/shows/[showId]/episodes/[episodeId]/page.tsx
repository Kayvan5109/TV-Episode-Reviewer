import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';
import { AppHeader } from '@/components/AppHeader';

export const metadata: Metadata = {
  title: 'Episode — Episode Ranker',
};

// Session-dependent (auth guard) — never statically cached, same reasoning as the other
// authenticated pages in this app.
export const dynamic = 'force-dynamic';

interface ShowRow {
  id: string;
  title: string;
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
 * Episode detail page: title, season/episode number, air date, synopsis, and a hero still image
 * (falling back to the season poster when this specific episode has no still) — see
 * `Docs/AppSpec.md`/`Docs/STATUS.md`'s Tier A item 8(a). Deliberately doesn't build the season-
 * finale flag, win/loss record, or credits/cast yet — those are separate follow-up items.
 *
 * Reads `episodes` via the *session-aware* client, scoped to both `id` and `show_id` — this is
 * global reference data any signed-in user can read (see
 * `supabase/migrations/20260715000000_initial_schema.sql`), but scoping to `show_id` too (rather
 * than just `id`) means a stale/wrong-show link 404s instead of silently rendering an episode that
 * belongs to a different show than the one in the URL.
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
    .select('id, title')
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
              <div className="flex flex-col gap-1">
                <p className="text-sm text-black/60 dark:text-white/60">
                  Season {episode.season_number}, Episode {episode.episode_number}
                </p>
                <h1 className="text-2xl font-semibold">{episode.title}</h1>
              </div>
              {episode.air_date && (
                <p className="text-sm text-black/60 dark:text-white/60">
                  {formatAirDate(episode.air_date)}
                </p>
              )}
              {episode.synopsis && (
                <p className="text-base text-black/80 dark:text-white/80">{episode.synopsis}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
