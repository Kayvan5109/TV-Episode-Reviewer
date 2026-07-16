import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';
import { AppHeader } from '@/components/AppHeader';
import { getNextRankingStep, getRankedEpisodeOrder } from '@/lib/ranking-session';
import { scoreForPosition } from '@/lib/ranking/score';

import { ColdStartPicker } from './ColdStartPicker';
import { ComparisonPrompt } from './ComparisonPrompt';

export const metadata: Metadata = {
  title: 'Rank episodes — Episode Ranker',
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
}

function formatEpisode(episode: EpisodeRow): string {
  return `S${episode.season_number}E${episode.episode_number} — ${episode.title}`;
}

/**
 * The actual ranking flow for a show: on each request, asks `getNextRankingStep` what's pending
 * and renders exactly that — a cold-start bucket pick, a better/worse/about-the-same comparison,
 * or (once `'done'`) the full ranked list with derived 1-10 scores. Submitting an answer
 * (`actions.ts`) revalidates this same path, so the next render picks up wherever the session
 * left off; there's no separate "step" state kept in the URL or client — the DB via
 * `ranking-session` is the only source of truth for where a given user is in a given show's
 * ranking.
 */
export default async function RankEpisodesPage({
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
    .select('id, title')
    .eq('id', showId)
    .maybeSingle();

  if (!show) {
    notFound();
  }

  const showRow = show as ShowRow;

  const { data: episodesData, error: episodesError } = await supabase
    .from('episodes')
    .select('id, season_number, episode_number, title')
    .eq('show_id', showId)
    .order('season_number', { ascending: true })
    .order('episode_number', { ascending: true });

  const episodes = (episodesData ?? []) as EpisodeRow[];
  const episodesById = new Map(episodes.map((episode) => [episode.id, episode]));

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

        {/* A show could theoretically have 0 imported episodes (e.g. TMDB import failed to
            populate any) — nothing to rank, so say so rather than asking `getNextRankingStep`
            anything (it would just report `'done'` with an empty list anyway). */}
        {!episodesError && episodes.length === 0 && (
          <p className="text-sm text-black/60 dark:text-white/60">
            No episodes imported for this show yet — nothing to rank.
          </p>
        )}

        {!episodesError && episodes.length > 0 && (
          <RankingStepView showId={showId} episodesById={episodesById} />
        )}
      </div>
    </>
  );
}

/**
 * Renders whatever `getNextRankingStep` reports right now. Split out from the page body only for
 * readability (it's still a plain async server component, not a client boundary) — it needs the
 * episode lookup map to turn bare ids into display strings.
 */
async function RankingStepView({
  showId,
  episodesById,
}: {
  showId: string;
  episodesById: Map<string, EpisodeRow>;
}) {
  const step = await getNextRankingStep(showId);

  if (step.type === 'coldStart') {
    const episode = episodesById.get(step.episode);
    return (
      <div className="flex w-full max-w-2xl flex-col items-center gap-4">
        <p className="text-lg font-medium">{episode ? formatEpisode(episode) : step.episode}</p>
        <p className="text-sm text-black/60 dark:text-white/60">Did you like this episode?</p>
        <ColdStartPicker showId={showId} episodeId={step.episode} />
      </div>
    );
  }

  if (step.type === 'compare') {
    const subject = episodesById.get(step.subject);
    const reference = episodesById.get(step.reference);
    const subjectLabel = subject ? formatEpisode(subject) : step.subject;
    const referenceLabel = reference ? formatEpisode(reference) : step.reference;

    return (
      <div className="flex w-full max-w-2xl flex-col items-center gap-4">
        <p className="text-center text-lg">
          Compared to <span className="font-medium">{referenceLabel}</span>, is{' '}
          <span className="font-medium">{subjectLabel}</span> better, worse, or about the same?
        </p>
        <ComparisonPrompt showId={showId} subjectId={step.subject} referenceId={step.reference} />
      </div>
    );
  }

  // step.type === 'done' — everything's placed; fetch the final order and derive display scores.
  const order = await getRankedEpisodeOrder(showId);

  if (!order || order.length === 0) {
    // Shouldn't normally happen right after `getNextRankingStep` reported `'done'` with episodes
    // present, but render something sensible rather than crashing if it ever does.
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        Nothing ranked yet.
      </p>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <p className="text-sm text-black/60 dark:text-white/60">
        Ranking complete — here&apos;s your list, best to worst.
      </p>
      <ol className="flex flex-col gap-1">
        {order.map((episodeId, index) => {
          const episode = episodesById.get(episodeId);
          const score = scoreForPosition(index + 1, order.length);
          return (
            <li
              key={episodeId}
              className="flex items-center justify-between gap-3 rounded border border-black/10 p-2 text-sm dark:border-white/20"
            >
              <span>
                {index + 1}. {episode ? formatEpisode(episode) : episodeId}
              </span>
              <span className="font-medium">{score.toFixed(1)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
