import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';
import { AppHeader } from '@/components/AppHeader';

export const metadata: Metadata = {
  title: 'Show — Episode Ranker',
};

// Session-dependent (auth guard) and reads freshly-imported data — never statically cached.
export const dynamic = 'force-dynamic';

interface ShowRow {
  id: string;
  title: string;
  poster_url: string | null;
}

interface EpisodeRow {
  id: string;
  season_number: number;
  episode_number: number;
  title: string;
}

/**
 * Show detail page: confirms a show's episode import worked by listing everything that got
 * pulled in from TMDB, grouped by season. Reads `shows`/`episodes` via the *session-aware* client
 * — RLS lets any signed-in user read this global reference data (see
 * `supabase/migrations/20260715000000_initial_schema.sql`), so this isn't scoped to "shows this
 * particular user added".
 *
 * The actual ranking flow (cold-start buckets, comparisons) is piece 2b's work — "Start ranking"
 * below is a visible, disabled placeholder only.
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
    .select('id, title, poster_url')
    .eq('id', showId)
    .maybeSingle();

  if (!show) {
    notFound();
  }

  const { data: episodesData, error: episodesError } = await supabase
    .from('episodes')
    .select('id, season_number, episode_number, title')
    .eq('show_id', showId)
    .order('season_number', { ascending: true })
    .order('episode_number', { ascending: true });

  const showRow = show as ShowRow;
  const episodes = (episodesData ?? []) as EpisodeRow[];

  const seasons = new Map<number, EpisodeRow[]>();
  for (const episode of episodes) {
    const seasonEpisodes = seasons.get(episode.season_number) ?? [];
    seasonEpisodes.push(episode);
    seasons.set(episode.season_number, seasonEpisodes);
  }

  return (
    <>
      <AppHeader />
      <div className="flex flex-1 flex-col items-center gap-6 p-8">
        <div className="flex w-full max-w-2xl items-center gap-4">
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
            <p className="text-sm text-black/60 dark:text-white/60">
              {episodes.length} episode{episodes.length === 1 ? '' : 's'} imported
            </p>
            <button
              type="button"
              disabled
              title="Ranking isn't built yet — coming in the next piece of work."
              className="w-fit rounded bg-black px-4 py-2 text-sm text-white opacity-50 dark:bg-white dark:text-black"
            >
              Start ranking
            </button>
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
          <div className="flex w-full max-w-2xl flex-col gap-6">
            {[...seasons.entries()]
              .sort(([a], [b]) => a - b)
              .map(([seasonNumber, seasonEpisodes]) => (
                <div key={seasonNumber} className="flex flex-col gap-2">
                  <h2 className="text-lg font-medium">Season {seasonNumber}</h2>
                  <ol className="flex flex-col gap-1">
                    {seasonEpisodes.map((episode) => (
                      <li key={episode.id} className="flex gap-3 text-sm">
                        <span className="text-black/50 dark:text-white/50">
                          E{episode.episode_number}
                        </span>
                        <span>{episode.title}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
          </div>
        )}
      </div>
    </>
  );
}
