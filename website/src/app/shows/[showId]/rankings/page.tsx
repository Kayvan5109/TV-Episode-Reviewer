import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';
import { AppHeader } from '@/components/AppHeader';
import { getShowRankingDisplay } from '@/lib/ranking-session';
import { ensureShowSynced } from '@/lib/shows/refreshShow';

export const metadata: Metadata = {
  title: 'Rankings — Episode Ranker',
};

// Session-dependent (auth guard) and reads freshly-derived ranking data — never statically cached.
export const dynamic = 'force-dynamic';

interface ShowRow {
  id: string;
  title: string;
  tmdb_show_id: number;
  last_synced_at: string;
}

interface EpisodeRow {
  id: string;
  season_number: number;
  episode_number: number;
  title: string;
}

/** Matches `shows/[showId]/page.tsx`'s own `formatEpisode`. */
function formatEpisode(episode: EpisodeRow): string {
  return `S${episode.season_number}E${episode.episode_number} — ${episode.title}`;
}

/**
 * Read-only, best-to-worst view of a show's ranked episodes — distinct from `/shows/[showId]`,
 * which lists every episode grouped by season for picking what to rank next rather than for seeing
 * the current ranking order.
 *
 * `getShowRankingDisplay`'s `ranked` array is already sorted best-to-worst by construction (index 0
 * = best), so this page does no sorting or ranking-logic of its own — it's purely a rendering of
 * that call's output. When ranking isn't finished yet (`done: false`), the derived order for the
 * subset of episodes already placed is still shown, with a note about what's not reflected in it
 * yet (still-cold-start-pending and fully untouched episodes) — consistent with this app's "scores
 * are derived and shift on insertion" design (see Docs/AppSpec.md).
 */
export default async function ShowRankingsPage({
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
    .select('id, title, tmdb_show_id, last_synced_at')
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

  const { data: episodesData } = await supabase
    .from('episodes')
    .select('id, season_number, episode_number, title')
    .eq('show_id', showId)
    .order('season_number', { ascending: true })
    .order('episode_number', { ascending: true });

  const episodeById = new Map<string, EpisodeRow>();
  for (const episode of (episodesData ?? []) as EpisodeRow[]) {
    episodeById.set(episode.id, episode);
  }

  const display = await getShowRankingDisplay(showId);

  return (
    <>
      <AppHeader />
      <div className="flex flex-1 flex-col items-center gap-6 p-8">
        <div className="flex w-full max-w-2xl flex-col gap-2">
          <h1 className="text-2xl font-semibold">{showRow.title} — Rankings</h1>
          <Link href={`/shows/${showId}`} className="text-sm underline">
            Back to {showRow.title}
          </Link>
        </div>

        <div className="flex w-full max-w-2xl flex-col gap-6">
          {display.ranked.length === 0 ? (
            <p className="text-sm text-black/60 dark:text-white/60">Nothing ranked yet.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {display.ranked.map(({ episodeId, score }, index) => {
                const episode = episodeById.get(episodeId);
                return (
                  <li
                    key={episodeId}
                    className="flex items-center justify-between gap-3 rounded border border-black/10 p-2 text-sm dark:border-white/20"
                  >
                    <span className="flex gap-3">
                      <span className="w-6 text-right text-black/50 dark:text-white/50">
                        {index + 1}.
                      </span>
                      <span>{episode ? formatEpisode(episode) : episodeId}</span>
                    </span>
                    <span className="font-medium">{score.toFixed(1)}</span>
                  </li>
                );
              })}
            </ol>
          )}

          {!display.done && (display.coldStartPending.length > 0 || display.unranked.length > 0) && (
            <p className="text-sm text-black/60 dark:text-white/60">
              This is a live snapshot, not a finished ranking: {display.coldStartPending.length}{' '}
              episode{display.coldStartPending.length === 1 ? '' : 's'} still being placed and{' '}
              {display.unranked.length} not ranked yet aren&apos;t reflected above.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
