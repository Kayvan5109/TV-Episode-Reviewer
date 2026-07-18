import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';
import { AppHeader } from '@/components/AppHeader';
import { getShowRankingDisplay } from '@/lib/ranking-session';
import { assignTiers, findGatekeeperGap, seasonAverageScores, type Tier } from '@/lib/ranking/stats';

export const metadata: Metadata = {
  title: 'Stats — Episode Ranker',
};

// Session-dependent (auth guard) and reads freshly-derived ranking data — never statically cached,
// same reasoning as the other authenticated show routes.
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

type RankedEntry = { episodeId: string; score: number; rank: number; createdAt: string };

const TIER_ORDER: readonly Tier[] = ['S', 'A', 'B', 'C', 'D'];

/** Matches `shows/[showId]/page.tsx` and `rank/[episodeId]/episodeDisplay.ts`'s own `formatEpisode`. */
function formatEpisode(episode: EpisodeRow): string {
  return `S${episode.season_number}E${episode.episode_number} — ${episode.title}`;
}

/**
 * Season-quality heatmap color scale — the dataviz skill's sequential ramp (one hue, light->dark;
 * `palette.md`'s "Sequential hue" table, blue, steps 100-700). Every hex below is copied verbatim
 * from that table (check 6 of the skill's color-formula.md: documented palette only, no eyeballed
 * values), ordered light (step 100) to dark (step 700).
 *
 * Per color-formula.md, a sequential ramp "flips anchor in dark": in light mode the lightest step
 * anchors "near zero" (receding toward the near-white light surface) while the darkest step
 * anchors the highest magnitude (popping against it); on the near-black dark surface that
 * relationship inverts, so the *lightest* step is what pops and the darkest step is what recedes.
 * `HEAT_STEP_LOOKUP` below encodes that: for bucket index `i` (0 = lowest score, last = highest),
 * the light-mode color is `HEAT_STEPS[i]` and the dark-mode color is the mirrored
 * `HEAT_STEPS[length - 1 - i]`.
 */
const HEAT_STEPS = [
  '#cde2fb', // 100
  '#9ec5f4', // 200
  '#6da7ec', // 300
  '#3987e5', // 400
  '#256abf', // 500
  '#184f95', // 600
  '#0d366b', // 700
] as const;

function hexToLinearChannel(byteValue: number): number {
  const srgb = byteValue / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance — same formula as the dataviz skill's `validate_palette.js`. */
function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => hexToLinearChannel(parseInt(clean.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors — same formula as the dataviz skill's `validate_palette.js`. */
function contrastRatio(hexA: string, hexB: string): number {
  const [lighter, darker] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Legible ink color for text placed *inside* a colored fill — the documented exception in the
 * dataviz skill's marks-and-anatomy.md ("a label set inside a colored fill... is the one
 * exception: pick white or ink by the fill's luminance so it always clears contrast"), rather than
 * this app's usual fixed black/white text tokens.
 */
function readableInkFor(fillHex: string): '#0b0b0b' | '#ffffff' {
  return contrastRatio(fillHex, '#0b0b0b') >= contrastRatio(fillHex, '#ffffff') ? '#0b0b0b' : '#ffffff';
}

interface HeatStep {
  light: string;
  dark: string;
  lightText: '#0b0b0b' | '#ffffff';
  darkText: '#0b0b0b' | '#ffffff';
}

const HEAT_STEP_COUNT = HEAT_STEPS.length;

const HEAT_STEP_LOOKUP: HeatStep[] = HEAT_STEPS.map((light, index) => {
  const dark = HEAT_STEPS[HEAT_STEP_COUNT - 1 - index];
  return { light, dark, lightText: readableInkFor(light), darkText: readableInkFor(dark) };
});

/** Scoped CSS for each `heat-step-N` class, light value plus its dark-mode override. */
const HEAT_CSS = [
  ...HEAT_STEP_LOOKUP.map(
    (step, index) => `.heat-step-${index} { background-color: ${step.light}; color: ${step.lightText}; }`
  ),
  '@media (prefers-color-scheme: dark) {',
  ...HEAT_STEP_LOOKUP.map(
    (step, index) => `  .heat-step-${index} { background-color: ${step.dark}; color: ${step.darkText}; }`
  ),
  '}',
].join('\n');

/**
 * Bucket index (0 = lowest season average in this show, `HEAT_STEP_COUNT - 1` = highest) —
 * normalized *relative to this show's own season averages*, not the absolute 1-10 score domain.
 * Absolute scores compress for small shows (`score.ts`'s `spread` function), which would wash out
 * the heatmap's contrast for exactly the shows that would benefit most from seeing which of their
 * few seasons is comparatively better; relative normalization always uses the show's own visible
 * range. A show with only one distinct season average (or one season total) has no variation to
 * encode, so it gets the ramp's neutral midpoint rather than an arbitrary end.
 */
function heatStepIndex(averageScore: number, min: number, max: number): number {
  if (max <= min) return Math.floor(HEAT_STEP_COUNT / 2);
  const t = (averageScore - min) / (max - min);
  return Math.min(HEAT_STEP_COUNT - 1, Math.max(0, Math.round(t * (HEAT_STEP_COUNT - 1))));
}

function formatGatekeeperEpisode(episode: EpisodeRow | undefined, fallbackId: string): string {
  return episode ? formatEpisode(episode) : fallbackId;
}

/**
 * Per-show stats page: an auto-generated tier list, a season-quality heatmap, and the "gatekeeper
 * episode" stat (biggest score gap between two adjacent ranked positions) — all derived purely
 * from `getShowRankingDisplay`'s already-computed `ranked` array (see `@/lib/ranking/stats`).
 * Read-only throughout; no editing/override UI (tier lists specifically are confirmed
 * auto-generated only, see Docs/STATUS.md's Tier A item 2 write-up).
 *
 * `coldStartPending`/`unranked` episodes have no meaningful position yet and are excluded from
 * every stat here, same as `@/lib/ranking/stats`'s own functions assume.
 */
export default async function StatsPage({
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
  const episodeById = new Map(episodes.map((episode) => [episode.id, episode]));
  const episodeSeasonById = new Map(episodes.map((episode) => [episode.id, episode.season_number]));

  // Same "only worth asking if there's actually something to rank and the fetch succeeded"
  // reasoning as `shows/[showId]/page.tsx` — an empty/errored episode list has nothing for
  // `getShowRankingDisplay` to say anyway.
  const display = !episodesError && episodes.length > 0 ? await getShowRankingDisplay(showId) : null;
  const hasStats = display !== null && display.ranked.length > 0;

  return (
    <>
      <AppHeader />
      <div className="flex flex-1 flex-col items-center gap-6 p-8">
        <div className="flex w-full max-w-2xl flex-col gap-2">
          <h1 className="text-2xl font-semibold">{showRow.title} — Stats</h1>
          <Link href={`/shows/${showId}`} className="text-sm underline">
            ← Back to {showRow.title}
          </Link>
        </div>

        {episodesError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            Couldn&apos;t load episodes: {episodesError.message}
          </p>
        )}

        {!episodesError && !hasStats && (
          <p className="text-sm text-black/60 dark:text-white/60">
            Not enough ranked episodes yet to show stats.
          </p>
        )}

        {!episodesError && hasStats && display && (
          <StatsSections
            ranked={display.ranked}
            episodeById={episodeById}
            episodeSeasonById={episodeSeasonById}
          />
        )}
      </div>
    </>
  );
}

function StatsSections({
  ranked,
  episodeById,
  episodeSeasonById,
}: {
  ranked: RankedEntry[];
  episodeById: Map<string, EpisodeRow>;
  episodeSeasonById: Map<string, number>;
}) {
  const tierByEpisode = assignTiers(ranked);
  const seasonAverages = seasonAverageScores(ranked, episodeSeasonById);
  const gatekeeper = findGatekeeperGap(ranked);
  const scoreByEpisode = new Map(ranked.map((entry) => [entry.episodeId, entry.score]));

  const seasonScores = seasonAverages.map((season) => season.averageScore);
  const minSeasonScore = seasonScores.length > 0 ? Math.min(...seasonScores) : 0;
  const maxSeasonScore = seasonScores.length > 0 ? Math.max(...seasonScores) : 0;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-8">
      <style>{HEAT_CSS}</style>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Tier list</h2>
        {TIER_ORDER.map((tier) => {
          // `ranked` is already best-to-worst by construction (`getShowRankingDisplay`), so
          // filtering preserves that order within the tier without any extra sorting.
          const entries = ranked.filter((entry) => tierByEpisode.get(entry.episodeId) === tier);
          if (entries.length === 0) return null;
          return (
            <div key={tier} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-black/70 dark:text-white/70">Tier {tier}</h3>
              <ol className="flex flex-col gap-1">
                {entries.map((entry) => {
                  const episode = episodeById.get(entry.episodeId);
                  const label = episode ? formatEpisode(episode) : entry.episodeId;
                  return (
                    <li
                      key={entry.episodeId}
                      className="rounded border border-black/10 p-2 text-sm dark:border-white/20"
                    >
                      {label} ({entry.score.toFixed(1)})
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </section>

      {seasonAverages.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Season-quality heatmap</h2>
          <div className="flex flex-col gap-2">
            {seasonAverages.map((season) => {
              const stepIndex = heatStepIndex(season.averageScore, minSeasonScore, maxSeasonScore);
              return (
                <div
                  key={season.seasonNumber}
                  className={`heat-step-${stepIndex} flex items-center justify-between rounded px-3 py-2 text-sm font-medium`}
                >
                  <span>Season {season.seasonNumber}</span>
                  <span>{season.averageScore.toFixed(1)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {gatekeeper && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Gatekeeper episode</h2>
          <p className="text-sm text-black/70 dark:text-white/70">
            Your biggest ranking gap:{' '}
            <strong>
              {formatGatekeeperEpisode(episodeById.get(gatekeeper.betterEpisodeId), gatekeeper.betterEpisodeId)}
            </strong>{' '}
            ({(scoreByEpisode.get(gatekeeper.betterEpisodeId) ?? 0).toFixed(1)}) to{' '}
            <strong>
              {formatGatekeeperEpisode(episodeById.get(gatekeeper.worseEpisodeId), gatekeeper.worseEpisodeId)}
            </strong>{' '}
            ({(scoreByEpisode.get(gatekeeper.worseEpisodeId) ?? 0).toFixed(1)}), a gap of{' '}
            {gatekeeper.gap.toFixed(1)}.
          </p>
        </section>
      )}
    </div>
  );
}
