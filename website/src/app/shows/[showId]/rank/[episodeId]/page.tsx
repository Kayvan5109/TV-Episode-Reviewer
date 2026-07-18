import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';
import { AppHeader } from '@/components/AppHeader';
import { getNextStepForEpisode } from '@/lib/ranking-session';

import { ColdStartPicker } from './ColdStartPicker';
import { ComparisonPrompt } from './ComparisonPrompt';

export const metadata: Metadata = {
  title: 'Rank episode — Episode Ranker',
};

// Session-dependent (auth guard) and drives a live, per-request ranking session — never statically
// cached, same reasoning as the other authenticated pages in this app.
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
  season_poster_url: string | null;
  synopsis: string | null;
}

function formatEpisode(episode: EpisodeRow): string {
  return `S${episode.season_number}E${episode.episode_number} — ${episode.title}`;
}

/**
 * Season-poster art for one side of the comparison screen. Rendered larger than the show-page
 * poster (`width={92} height={138}`) — on this screen the poster is the primary visual focal
 * point of each column rather than a small thumbnail next to text, since the two columns are the
 * whole point of the comparison layout. Renders nothing for episodes with no `season_poster_url`
 * (imported before this column existed, or a season TMDB has no poster for).
 */
function SeasonPoster({ episode }: { episode: EpisodeRow }) {
  if (!episode.season_poster_url) {
    return null;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external TMDB CDN image.
    <img
      src={episode.season_poster_url}
      alt=""
      width={120}
      height={180}
      className="h-[180px] w-[120px] rounded object-cover"
    />
  );
}

/**
 * One column of the comparison layout: poster, then season/episode + title, then synopsis (if
 * any). Shared between the `subject` (episode being placed) and `reference` (episode it's being
 * compared against) columns — both render identically, only the data differs.
 */
function EpisodeColumn({ episode }: { episode: EpisodeRow }) {
  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-2 text-center">
      <SeasonPoster episode={episode} />
      <p className="text-lg font-medium">{formatEpisode(episode)}</p>
      {episode.synopsis && (
        <p className="text-sm text-black/60 dark:text-white/60">{episode.synopsis}</p>
      )}
    </div>
  );
}

/**
 * Ranks one specific episode (`episodeId`), independent of the show's season/episode order — the
 * per-episode replacement for the old whole-show auto-advance `/shows/[showId]/rank` route.
 * `/shows/[showId]` links here per-episode (see that page), so the user chooses which episode to
 * rank next rather than always being forced through whatever's next in air-date order.
 *
 * Asks `getNextStepForEpisode(showId, episodeId)` what's needed to place *this* episode and
 * renders exactly that: a cold-start bucket pick, a better/worse/about-the-same comparison against
 * whatever reference episode the placement algorithm currently needs, or (if it's already fully
 * placed, e.g. a stale link or a double submission) a short "already ranked" message. Submitting
 * an answer (`actions.ts`) revalidates this same per-episode path, so the next render picks up
 * wherever this episode's placement left off.
 *
 * Always renders a "Return to show page" link regardless of which step is showing — the original
 * whole-show flow had no way back to `/shows/[showId]` once inside it, which hands-on testing
 * flagged as a real gap; this route deliberately never hides that link behind any state.
 */
export default async function RankEpisodePage({
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

  const { data: episodesData, error: episodesError } = await supabase
    .from('episodes')
    .select('id, season_number, episode_number, title, season_poster_url, synopsis')
    .eq('show_id', showId)
    .order('season_number', { ascending: true })
    .order('episode_number', { ascending: true });

  const episodes = (episodesData ?? []) as EpisodeRow[];
  const episodesById = new Map(episodes.map((row) => [row.id, row]));
  const episode = episodesById.get(episodeId);

  // A genuine "this episode doesn't exist / doesn't belong to this show" case (stale link, typo'd
  // id) is a 404, not something to render an error for — but a real fetch failure (episodesError)
  // isn't the same thing as "not found", so don't let that masquerade as a 404 either.
  if (!episodesError && !episode) {
    notFound();
  }

  return (
    <>
      <AppHeader />
      <div className="flex flex-1 flex-col items-center gap-6 p-8">
        <h1 className="text-2xl font-semibold">Rank {showRow.title}</h1>

        {episodesError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            Couldn&apos;t load episodes: {episodesError.message}
          </p>
        )}

        {!episodesError && episode && (
          <RankEpisodeStep showId={showId} episodeId={episodeId} episode={episode} episodesById={episodesById} />
        )}

        <Link href={`/shows/${showId}`} className="text-sm underline underline-offset-2">
          Return to show page
        </Link>
      </div>
    </>
  );
}

/**
 * Resolves and renders `getNextStepForEpisode`'s answer for this specific episode. Split out from
 * the page body only for readability — it's still a plain async server component, not a client
 * boundary.
 */
async function RankEpisodeStep({
  showId,
  episodeId,
  episode,
  episodesById,
}: {
  showId: string;
  episodeId: string;
  episode: EpisodeRow;
  episodesById: Map<string, EpisodeRow>;
}) {
  const step = await getNextStepForEpisode(showId, episodeId);

  // The 'compare' step gets its own two-column layout (subject vs. reference, prompt in the
  // middle) rather than the single-subject-block-plus-content wrapper the other step types share
  // below — the whole point of this step is showing both episodes side by side.
  if (step.type === 'compare') {
    const reference = episodesById.get(step.reference);
    return (
      <div className="flex w-full max-w-4xl flex-col items-center gap-6">
        <div className="flex w-full flex-col items-center justify-center gap-6 sm:flex-row sm:items-start sm:gap-8">
          <EpisodeColumn episode={episode} />
          <ComparisonPrompt showId={showId} subjectId={episodeId} referenceId={step.reference} />
          {reference ? (
            <EpisodeColumn episode={reference} />
          ) : (
            <p className="text-sm text-black/60 dark:text-white/60">{step.reference}</p>
          )}
        </div>
      </div>
    );
  }

  let stepContent: ReactNode;

  if (step.type === 'alreadyRanked') {
    stepContent = (
      <p className="text-sm text-black/60 dark:text-white/60">
        This episode is already ranked — nothing left to do here.
      </p>
    );
  } else {
    stepContent = (
      <div className="flex w-full max-w-2xl flex-col items-center gap-4">
        <p className="text-sm text-black/60 dark:text-white/60">Did you like this episode?</p>
        <ColdStartPicker showId={showId} episodeId={episodeId} />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-4">
      <div className="flex items-center justify-center gap-3">
        <SeasonPoster episode={episode} />
        <p className="text-lg font-medium">{formatEpisode(episode)}</p>
      </div>
      {stepContent}
    </div>
  );
}
