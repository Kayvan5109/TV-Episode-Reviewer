import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';
import { AppHeader } from '@/components/AppHeader';
import { getNextAllStarStep } from '@/lib/all-star-session';

import { AllStarComparisonPrompt } from './AllStarComparisonPrompt';
import type { AllStarEpisodeDisplay } from './episodeDisplay';

export const metadata: Metadata = {
  title: 'Rank Top Episodes — Episode Ranker',
};

// Session-dependent (auth guard) and drives a live, per-request comparison session — never
// statically cached, same reasoning as every other authenticated ranking page in this app.
export const dynamic = 'force-dynamic';

/**
 * The Top Episodes comparison screen (Docs/STATUS.md Bucket 4 item 15, "All Stars Mode") — places
 * whichever show's #1 episode is currently pending in the cross-show pool, one at a time, via
 * `getNextAllStarStep` (`@/lib/all-star-session`). Deliberately no `[episodeId]` route segment,
 * unlike the per-show rank flow (`@/shows/[showId]/rank/[episodeId]`): there's no per-episode
 * picker here, no "rank any entrant in whatever order you choose" concept — the pool is always
 * driven by one linear queue (`deriveNextAllStarStep`'s `pendingShowIds` order), so there's nothing
 * for a route param to select between. Submitting an answer (`actions.ts`) auto-advances to the
 * next pending entrant automatically, the same way whole-show "Rank all" mode auto-advances,
 * ending back on the dashboard once nothing's left pending.
 *
 * Known, deliberate v1 gap: unlike the per-show comparison screen, clicking an episode's title here
 * does *not* carry a `returnToRank`-style round trip back into this flow — the episode detail
 * page's "Return to ranking" link only exists for the per-show rank route. A user who clicks a
 * title mid-comparison has to navigate back to `/top-episodes/rank` manually (from the dashboard's
 * "Update Top Episodes" button, or a plain address-bar/back-button trip) to continue. Not built
 * for v1 since it would mean extending the episode detail page's `returnToRank` handling to a
 * second, differently-shaped flow — a real but bounded and skippable piece of scope, logged here
 * explicitly per this feature's own build instructions rather than silently left as a gap.
 */
export default async function TopEpisodesRankPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const step = await getNextAllStarStep();

  if (step.type === 'done') {
    redirect('/dashboard');
  }

  const { data: episodesData, error: episodesError } = await supabase
    .from('episodes')
    .select('id, show_id, season_number, episode_number, title, season_poster_url, still_url, synopsis')
    .in('id', [step.subject, step.reference]);

  const episodeRows = (episodesData ?? []) as {
    id: string;
    show_id: string;
    season_number: number;
    episode_number: number;
    title: string;
    season_poster_url: string | null;
    still_url: string | null;
    synopsis: string | null;
  }[];

  const showIds = [...new Set(episodeRows.map((row) => row.show_id))];
  const { data: showsData } = showIds.length > 0
    ? await supabase.from('shows').select('id, title').in('id', showIds)
    : { data: [] as { id: string; title: string }[] };
  const showTitleById = new Map((showsData ?? []).map((show) => [show.id, show.title]));

  function toDisplay(episodeId: string): AllStarEpisodeDisplay | undefined {
    const row = episodeRows.find((r) => r.id === episodeId);
    if (!row) return undefined;
    return {
      id: row.id,
      showId: row.show_id,
      showTitle: showTitleById.get(row.show_id) ?? 'Unknown show',
      season_number: row.season_number,
      episode_number: row.episode_number,
      title: row.title,
      season_poster_url: row.season_poster_url,
      still_url: row.still_url,
      synopsis: row.synopsis,
    };
  }

  const subject = toDisplay(step.subject);
  const reference = toDisplay(step.reference);

  return (
    <>
      <AppHeader />
      <div className="flex flex-1 flex-col items-center gap-6 p-8">
        <h1 className="text-2xl font-semibold">Rank Top Episodes</h1>

        {episodesError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            Couldn&apos;t load episodes: {episodesError.message}
          </p>
        )}

        {!episodesError && subject && reference && (
          <div className="flex w-full max-w-4xl flex-col items-center gap-6">
            <AllStarComparisonPrompt subject={subject} reference={reference} />
          </div>
        )}

        {!episodesError && (!subject || !reference) && (
          <p className="text-sm text-black/60 dark:text-white/60">
            Couldn&apos;t load one of the episodes being compared.
          </p>
        )}

        <Link href="/dashboard" className="text-sm underline underline-offset-2">
          Return to dashboard
        </Link>
      </div>
    </>
  );
}
