import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';
import { AppHeader } from '@/components/AppHeader';
import { getNextStepForEpisode } from '@/lib/ranking-session';

import { ColdStartPicker } from './ColdStartPicker';
import { ComparisonPrompt } from './ComparisonPrompt';
import { formatEpisode, type EpisodeDisplay } from './episodeDisplay';

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

// Same shape as `EpisodeDisplay` (see `episodeDisplay.ts`) — kept as a local alias since this file
// also carries the raw Supabase row type naming (`*Row`) used throughout the rest of the page.
type EpisodeRow = EpisodeDisplay;

/**
 * Episode-still art for one side of the comparison screen (falling back to the season poster when
 * this specific episode has no still of its own — same convention as the episode detail page's
 * `imageUrl`). Rendered larger than the show-page poster (`width={92} height={138}`) — on this
 * screen the image is the primary visual focal point of each column rather than a small thumbnail
 * next to text, since the two columns are the whole point of the comparison layout. Renders
 * nothing for episodes with neither a still nor a season poster (imported before either column
 * existed, or TMDB has no artwork for that episode/season).
 */
function SeasonPoster({ episode }: { episode: EpisodeRow }) {
  const imageUrl = episode.still_url ?? episode.season_poster_url;
  if (!imageUrl) {
    return null;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external TMDB CDN image.
    <img
      src={imageUrl}
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
 *
 * The title links through to that episode's detail page, carrying `returnToRank` set to
 * `episode.id` itself — every caller of this component passes the *subject* episode (the one
 * currently being placed; there's no separate reference episode rendered via this component, see
 * `ComparisonColumn` in `ComparisonPrompt.tsx` for that), so `episode.id` is always the right id to
 * return to. When `rankAllMode` is true, `&mode=rankAll` is also appended to that link — otherwise
 * the round trip through the episode detail page's "Return to ranking" link would silently drop the
 * user out of rank-all mode (see that page's own `mode` search param handling).
 */
function EpisodeColumn({
  episode,
  showId,
  rankAllMode,
}: {
  episode: EpisodeRow;
  showId: string;
  rankAllMode: boolean;
}) {
  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-2 text-center">
      <SeasonPoster episode={episode} />
      <Link
        href={`/shows/${showId}/episodes/${episode.id}?returnToRank=${episode.id}${
          rankAllMode ? '&mode=rankAll' : ''
        }`}
        className="text-lg font-medium underline underline-offset-2"
      >
        {formatEpisode(episode)}
      </Link>
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
 *
 * Also accepts an optional `notice` query param — set to `'staleResubmission'` by `actions.ts`'s
 * `redirectAfterAlreadyRanked` when a rank-all-mode stale resubmission redirects here (the *next*
 * episode's rank page) instead of the show page. Same informational message the show page renders
 * for its own single-episode-mode case — see that page's doc comment.
 */
export default async function RankEpisodePage({
  params,
  searchParams,
}: {
  params: Promise<{ showId: string; episodeId: string }>;
  searchParams: Promise<{ mode?: string; notice?: string }>;
}) {
  const { showId, episodeId } = await params;
  const { mode, notice } = await searchParams;
  // "Rank all" mode: set by the show page's "Rank all" link (see `shows/[showId]/page.tsx`) and
  // threaded down to `ColdStartPicker`/`ComparisonPrompt` so their submissions (`actions.ts`) know
  // to auto-advance to the next oldest-unranked episode instead of returning to the show page —
  // see `actions.ts`'s `nextRankAllDestination` for where that actually happens.
  const rankAllMode = mode === 'rankAll';

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
    .select('id, season_number, episode_number, title, season_poster_url, still_url, synopsis')
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
        {notice === 'staleResubmission' && (
          <p className="w-full max-w-2xl text-sm text-black/60 dark:text-white/60">
            This episode was already ranked — nothing changed.
          </p>
        )}
        <h1 className="text-2xl font-semibold">
          {episode
            ? `Rank ${episode.title} from Season ${episode.season_number} of ${showRow.title}`
            : `Rank ${showRow.title}`}
        </h1>

        {episodesError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            Couldn&apos;t load episodes: {episodesError.message}
          </p>
        )}

        {!episodesError && episode && (
          <RankEpisodeStep
            showId={showId}
            episodeId={episodeId}
            episode={episode}
            episodesById={episodesById}
            rankAllMode={rankAllMode}
          />
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
  rankAllMode,
}: {
  showId: string;
  episodeId: string;
  episode: EpisodeRow;
  episodesById: Map<string, EpisodeRow>;
  rankAllMode: boolean;
}) {
  const step = await getNextStepForEpisode(showId, episodeId);

  // The 'compare' step gets its own layout — `ComparisonPrompt` (a Client Component) now renders
  // both episode columns itself, since clicking directly on a poster is what submits the answer
  // (see that component's doc comment), rather than a shared subject-block-plus-content wrapper.
  if (step.type === 'compare') {
    const reference = episodesById.get(step.reference);
    return (
      <div className="flex w-full max-w-4xl flex-col items-center gap-6">
        {reference ? (
          <ComparisonPrompt
            showId={showId}
            subject={episode}
            reference={reference}
            rankAllMode={rankAllMode}
          />
        ) : (
          // Defensive fallback only — `step.reference` should always be one of this show's own
          // episodes, already loaded into `episodesById`. Without the reference episode's own
          // display data there's no poster to make clickable, so this can't offer the redesigned
          // click-to-answer UI at all; just show what we do know and let the user bail out via the
          // "Return to show page" link the page always renders.
          <>
            <EpisodeColumn episode={episode} showId={showId} rankAllMode={rankAllMode} />
            <p className="text-sm text-black/60 dark:text-white/60">
              Couldn&apos;t load the comparison episode ({step.reference}).
            </p>
          </>
        )}
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
        <ColdStartPicker showId={showId} episodeId={episodeId} rankAllMode={rankAllMode} />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-4">
      {/* Full poster+title+synopsis column, not just a small poster+title — Kayvan wants the
          synopsis visible while cold-ranking the first few episodes too, not only on the
          two-episode compare screen. Harmless for the rare 'alreadyRanked' stale-link case too. */}
      <EpisodeColumn episode={episode} showId={showId} rankAllMode={rankAllMode} />
      {stepContent}
    </div>
  );
}
