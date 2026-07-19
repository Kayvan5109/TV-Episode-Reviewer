import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/serverSession';
import { AppHeader } from '@/components/AppHeader';
import { getShowRankingDisplay } from '@/lib/ranking-session';
import {
  assignTiers,
  buildComparisonMatrix,
  buildSeasonTimelineOrder,
  comparisonHistoryByEpisode,
  findGatekeeperGap,
  seasonAverageScores,
  type ComparisonRow,
  type MatrixCellResult,
  type Tier,
} from '@/lib/ranking/stats';

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
  air_date: string | null;
}

type RankedEntry = { episodeId: string; score: number; rank: number; createdAt: string };

const TIER_ORDER: readonly Tier[] = ['S', 'A', 'B', 'C', 'D'];

/** Matches `shows/[showId]/page.tsx` and `rank/[episodeId]/episodeDisplay.ts`'s own `formatEpisode`. */
function formatEpisode(episode: EpisodeRow): string {
  return `S${episode.season_number}E${episode.episode_number} — ${episode.title}`;
}

/** Short season/episode code only (no title) — used for the matrix's row/column headers and the
 * timeline's axis labels, where the full title would be too wide; the full title is still reachable
 * via each element's `title` attribute (native hover tooltip). */
function formatEpisodeShort(episode: EpisodeRow): string {
  return `S${episode.season_number}E${episode.episode_number}`;
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
 * Win/loss matrix cell colors — the dataviz skill's fixed **status** palette (`palette.md`'s status
 * table), not the categorical/sequential ramps: a win/loss/tie result is a *state* of the
 * comparison, not a series identity, so it gets the reserved status hexes (`good`/`critical`, plus
 * `warning` standing in for "tie" — there's no dedicated neutral status slot). These three hexes are
 * mode-invariant (same value in both `palette.md`'s light and dark status columns), so unlike
 * `HEAT_STEPS` above there's no separate dark variant to compute — only the ink color (via the same
 * `readableInkFor` already defined above) needs to react to the fill. Per the skill's status-color
 * rule, color is never the only signal here: every cell also carries a literal "W"/"L"/"T" letter.
 */
const MATRIX_STATUS_COLORS = {
  win: '#0ca30c', // status "good"
  loss: '#d03b3b', // status "critical"
  tie: '#fab219', // status "warning", standing in for "tie" (no dedicated neutral status slot)
} as const;

const MATRIX_CSS = Object.entries(MATRIX_STATUS_COLORS)
  .map(([key, hex]) => `.matrix-cell-${key} { background-color: ${hex}; color: ${readableInkFor(hex)}; }`)
  .join('\n');

/**
 * Season-timeline line/marker/gridline colors. The line is a single series (one score line per
 * show), so per the dataviz skill's marks-and-anatomy.md ("a single series needs no legend box") it
 * takes the categorical palette's slot-1 blue rather than needing a legend — the same hue as this
 * page's own heatmap sequential ramp (`HEAT_STEPS`), both light→dark variants copied verbatim from
 * `palette.md`. Gridline/axis hexes are `palette.md`'s "Chart chrome & ink" table, copied verbatim.
 */
const TIMELINE_COLORS = {
  line: { light: '#2a78d6', dark: '#3987e5' }, // categorical slot 1 / sequential-hue base, light->dark
  grid: { light: '#e1e0d9', dark: '#2c2c2a' }, // gridline (hairline)
  axis: { light: '#c3c2b7', dark: '#383835' }, // baseline / axis
} as const;

const TIMELINE_CSS = [
  `.timeline-line { stroke: ${TIMELINE_COLORS.line.light}; }`,
  `.timeline-marker { fill: ${TIMELINE_COLORS.line.light}; }`,
  `.timeline-grid { stroke: ${TIMELINE_COLORS.grid.light}; }`,
  `.timeline-axis { stroke: ${TIMELINE_COLORS.axis.light}; }`,
  '@media (prefers-color-scheme: dark) {',
  `  .timeline-line { stroke: ${TIMELINE_COLORS.line.dark}; }`,
  `  .timeline-marker { fill: ${TIMELINE_COLORS.line.dark}; }`,
  `  .timeline-grid { stroke: ${TIMELINE_COLORS.grid.dark}; }`,
  `  .timeline-axis { stroke: ${TIMELINE_COLORS.axis.dark}; }`,
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
    .select('id, season_number, episode_number, title, air_date')
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

  // `episode_comparisons` rows for this show's episodes, this user only — needed for the win/loss
  // matrix and comparison-history sections below. No `.in('episode_a_id'/'episode_b_id', episodeIds)`
  // here — see Docs/STATUS.md Bucket 1 item 1: embedding every episode id of a show as a literal id
  // list in the query URL eventually exceeds Supabase/PostgREST's URL-length limit for shows with
  // enough episodes. `.eq('user_id', user.id)` alone already bounds this to one person's lifetime
  // comparison data; filtering down to this show's episodes (either side) happens in application
  // code instead, via `episodeIdSet`. That also means a comparison between two episodes *both* in
  // this show's list can only ever come back once, so the old "query both sides, dedupe by row id"
  // dance (which existed specifically to route around the id-list problem) collapses into one query.
  // Only fetched when there's actually ranked data to build a matrix from.
  let comparisons: ComparisonRow[] = [];
  if (hasStats) {
    const episodeIdSet = new Set(episodes.map((episode) => episode.id));
    const { data: comparisonRowsRaw, error: comparisonsError } = await supabase
      .from('episode_comparisons')
      .select('id, episode_a_id, episode_b_id, result')
      .eq('user_id', user.id);

    if (comparisonsError) {
      throw new Error(`Failed to load episode comparisons: ${comparisonsError.message}`);
    }

    type RawComparisonRow = {
      id: string;
      episode_a_id: string;
      episode_b_id: string;
      result: ComparisonRow['result'];
    };

    comparisons = ((comparisonRowsRaw ?? []) as RawComparisonRow[])
      .filter((row) => episodeIdSet.has(row.episode_a_id) || episodeIdSet.has(row.episode_b_id))
      .map((row) => ({
        episodeAId: row.episode_a_id,
        episodeBId: row.episode_b_id,
        result: row.result,
      }));
  }

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
            comparisons={comparisons}
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
  comparisons,
}: {
  ranked: RankedEntry[];
  episodeById: Map<string, EpisodeRow>;
  episodeSeasonById: Map<string, number>;
  comparisons: ComparisonRow[];
}) {
  const tierByEpisode = assignTiers(ranked);
  const seasonAverages = seasonAverageScores(ranked, episodeSeasonById);
  const gatekeeper = findGatekeeperGap(ranked);
  const scoreByEpisode = new Map(ranked.map((entry) => [entry.episodeId, entry.score]));

  const seasonScores = seasonAverages.map((season) => season.averageScore);
  const minSeasonScore = seasonScores.length > 0 ? Math.min(...seasonScores) : 0;
  const maxSeasonScore = seasonScores.length > 0 ? Math.max(...seasonScores) : 0;

  // `ranked` is already best-to-worst (`getShowRankingDisplay`'s contract), so this order doubles
  // directly as the win/loss matrix's row/column order without any extra sorting.
  const rankedEpisodeIds = ranked.map((entry) => entry.episodeId);
  const matrix = buildComparisonMatrix(rankedEpisodeIds, comparisons);
  const comparisonHistory = comparisonHistoryByEpisode(rankedEpisodeIds, matrix);
  const hasAnyComparisonHistory = [...comparisonHistory.values()].some((entries) => entries.length > 0);

  const episodeInfoById = new Map(
    [...episodeById.entries()].map(([id, episode]) => [
      id,
      { seasonNumber: episode.season_number, episodeNumber: episode.episode_number, airDate: episode.air_date },
    ])
  );
  const timelineOrder = ranked.length >= 2 ? buildSeasonTimelineOrder(ranked, episodeInfoById) : [];

  return (
    <div className="flex w-full max-w-2xl flex-col gap-8">
      <style>{[HEAT_CSS, MATRIX_CSS, TIMELINE_CSS].join('\n')}</style>

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

      {rankedEpisodeIds.length >= 2 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Win/loss matrix</h2>
          <p className="text-sm text-black/60 dark:text-white/60">
            Only *direct* recorded comparisons — a blank cell means these two episodes were never
            compared head-to-head, even if their relative order is already known transitively
            through other episodes.
          </p>
          <ComparisonMatrixTable rankedEpisodeIds={rankedEpisodeIds} episodeById={episodeById} matrix={matrix} />
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Comparison history</h2>
        {hasAnyComparisonHistory ? (
          <ol className="flex flex-col gap-2">
            {/*
             * `AppSpec.md` originally called this a "comparison/relationship graph." This renders
             * the same underlying direct-comparison data (`comparisonHistory`, built from
             * `buildComparisonMatrix`'s output — see `@/lib/ranking/stats`) as a flat per-episode
             * list instead of an actual node-link graph, to avoid pulling in a graph-layout library
             * as a new dependency for a single-user personal project — see that function's doc
             * comment for the full reasoning. An episode with zero direct comparisons is simply
             * omitted from this list (rather than rendered with an empty body) for readability.
             */}
            {ranked.map((entry) => {
              const opponents = comparisonHistory.get(entry.episodeId) ?? [];
              if (opponents.length === 0) return null;

              const episode = episodeById.get(entry.episodeId);
              const label = episode ? formatEpisode(episode) : entry.episodeId;
              const summary = opponents
                .map((opponent) => {
                  const opponentEpisode = episodeById.get(opponent.opponentEpisodeId);
                  const opponentLabel = opponentEpisode
                    ? formatEpisode(opponentEpisode)
                    : opponent.opponentEpisodeId;
                  const verb =
                    opponent.result === 'win' ? 'beat' : opponent.result === 'loss' ? 'lost to' : 'tied with';
                  return `${verb} ${opponentLabel}`;
                })
                .join('; ');

              return (
                <li key={entry.episodeId} className="rounded border border-black/10 p-2 text-sm dark:border-white/20">
                  <strong>{label}</strong>: {summary}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-black/60 dark:text-white/60">No direct comparisons recorded yet.</p>
        )}
      </section>

      {timelineOrder.length >= 2 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Season timeline</h2>
          <p className="text-sm text-black/60 dark:text-white/60">
            Ranked score across the show&apos;s run, in air-date order (episodes missing an air date
            fall back to season/episode order).
          </p>
          <SeasonTimelineChart timelineOrder={timelineOrder} episodeById={episodeById} episodeInfoById={episodeInfoById} />
        </section>
      )}
    </div>
  );
}

function ComparisonMatrixTable({
  rankedEpisodeIds,
  episodeById,
  matrix,
}: {
  rankedEpisodeIds: string[];
  episodeById: Map<string, EpisodeRow>;
  matrix: MatrixCellResult[][];
}) {
  return (
    <div className="max-h-[70vh] overflow-auto rounded border border-black/10 dark:border-white/20">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 top-0 z-30 border border-black/10 bg-white p-1 dark:border-white/20 dark:bg-black"
            />
            {rankedEpisodeIds.map((colId) => {
              const episode = episodeById.get(colId);
              return (
                <th
                  key={colId}
                  scope="col"
                  title={episode ? formatEpisode(episode) : colId}
                  className="sticky top-0 z-20 whitespace-nowrap border border-black/10 bg-white p-1 font-medium dark:border-white/20 dark:bg-black"
                >
                  {episode ? formatEpisodeShort(episode) : colId}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rankedEpisodeIds.map((rowId, i) => {
            const rowEpisode = episodeById.get(rowId);
            const rowLabel = rowEpisode ? formatEpisode(rowEpisode) : rowId;
            return (
              <tr key={rowId}>
                <th
                  scope="row"
                  title={rowLabel}
                  className="sticky left-0 z-10 whitespace-nowrap border border-black/10 bg-white p-1 text-left font-medium dark:border-white/20 dark:bg-black"
                >
                  {rowEpisode ? formatEpisodeShort(rowEpisode) : rowId}
                </th>
                {rankedEpisodeIds.map((colId, j) => {
                  // Diagonal: an episode against itself — always visually distinct, never a real
                  // comparison (see `buildComparisonMatrix`'s doc comment: `matrix[i][i]` is always null).
                  if (i === j) {
                    return (
                      <td
                        key={colId}
                        aria-hidden
                        className="border border-black/10 bg-black/10 p-1 text-center dark:border-white/20 dark:bg-white/10"
                      />
                    );
                  }

                  const colEpisode = episodeById.get(colId);
                  const colLabel = colEpisode ? formatEpisode(colEpisode) : colId;
                  const cell = matrix[i]?.[j] ?? null;

                  if (cell === null) {
                    return (
                      <td
                        key={colId}
                        title={`${rowLabel} vs ${colLabel}: never directly compared`}
                        className="border border-black/10 p-1 text-center text-black/30 dark:border-white/20 dark:text-white/30"
                      >
                        {'–'}
                      </td>
                    );
                  }

                  const label = cell === 'win' ? 'W' : cell === 'loss' ? 'L' : 'T';
                  const outcome = cell === 'win' ? 'won' : cell === 'loss' ? 'lost' : 'tied';
                  return (
                    <td
                      key={colId}
                      title={`${rowLabel} vs ${colLabel}: ${outcome}`}
                      className={`matrix-cell-${cell} border border-black/10 p-1 text-center font-semibold dark:border-white/20`}
                    >
                      {label}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Simple scatter/line chart, plain inline SVG per the dataviz skill's guidance (no charting
 * dependency for a single line series). This is a static server-rendered page with no client-side
 * JS elsewhere on it (the heatmap above is the same "value is always visible as text, no hover-only
 * data" style) — rather than building a full interactive crosshair+tooltip layer (which would need a
 * client component), each point ships a native SVG `<title>` for hover detail, and the score is
 * always readable directly (endpoint labels here; every score is also visible in the tier list
 * above). Deliberate scope match to this page's existing interactivity bar, not an oversight.
 */
function SeasonTimelineChart({
  timelineOrder,
  episodeById,
  episodeInfoById,
}: {
  timelineOrder: { episodeId: string; score: number }[];
  episodeById: Map<string, EpisodeRow>;
  episodeInfoById: Map<string, { seasonNumber: number; episodeNumber: number; airDate: string | null }>;
}) {
  const n = timelineOrder.length;
  const paddingLeft = 32;
  const paddingRight = 20;
  const paddingTop = 24;
  const paddingBottom = 40;
  const chartHeight = 200;
  const stepX = 32;
  const chartWidth = Math.max(240, (n - 1) * stepX);
  const width = paddingLeft + chartWidth + paddingRight;
  const height = paddingTop + chartHeight + paddingBottom;

  const yMin = 1;
  const yMax = 10;
  const yTicks = [2, 4, 6, 8, 10];

  const xFor = (index: number) => paddingLeft + (index / (n - 1)) * chartWidth;
  const yFor = (score: number) => paddingTop + chartHeight - ((score - yMin) / (yMax - yMin)) * chartHeight;

  const points = timelineOrder.map((point, index) => ({ ...point, x: xFor(index), y: yFor(point.score) }));
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const firstEpisode = episodeById.get(firstPoint.episodeId);
  const lastEpisode = episodeById.get(lastPoint.episodeId);

  return (
    <div className="overflow-x-auto rounded border border-black/10 p-2 dark:border-white/20">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Season timeline: ranked score over time for ${n} episodes`}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={paddingLeft}
              y1={yFor(tick)}
              x2={paddingLeft + chartWidth}
              y2={yFor(tick)}
              className="timeline-grid"
              strokeWidth={1}
            />
            <text
              x={paddingLeft - 6}
              y={yFor(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={11}
              fill="currentColor"
              className="text-black/50 dark:text-white/50"
            >
              {tick}
            </text>
          </g>
        ))}

        <line
          x1={paddingLeft}
          y1={paddingTop + chartHeight}
          x2={paddingLeft + chartWidth}
          y2={paddingTop + chartHeight}
          className="timeline-axis"
          strokeWidth={1}
        />

        <path d={linePath} fill="none" className="timeline-line" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {points.map((point) => {
          const episode = episodeById.get(point.episodeId);
          const label = episode ? formatEpisode(episode) : point.episodeId;
          const info = episodeInfoById.get(point.episodeId);
          const dateLabel = info?.airDate ? ` — ${info.airDate}` : '';
          return (
            <circle
              key={point.episodeId}
              cx={point.x}
              cy={point.y}
              r={4}
              className="timeline-marker"
              stroke="var(--background)"
              strokeWidth={2}
            >
              <title>{`${label}${dateLabel}: ${point.score.toFixed(1)}`}</title>
            </circle>
          );
        })}

        {/* Direct labels at the line's ends only (marks-and-anatomy.md: "label the endpoint... let
            the rest ride the tooltip") — the score value above each end point, the episode's
            short code below the axis. */}
        <text
          x={firstPoint.x}
          y={firstPoint.y - 10}
          textAnchor="start"
          fontSize={11}
          fill="currentColor"
          className="text-black/70 dark:text-white/70"
        >
          {firstPoint.score.toFixed(1)}
        </text>
        <text
          x={lastPoint.x}
          y={lastPoint.y - 10}
          textAnchor="end"
          fontSize={11}
          fill="currentColor"
          className="text-black/70 dark:text-white/70"
        >
          {lastPoint.score.toFixed(1)}
        </text>

        <text
          x={firstPoint.x}
          y={height - 8}
          textAnchor="start"
          fontSize={11}
          fill="currentColor"
          className="text-black/50 dark:text-white/50"
        >
          {firstEpisode ? formatEpisodeShort(firstEpisode) : ''}
        </text>
        <text
          x={lastPoint.x}
          y={height - 8}
          textAnchor="end"
          fontSize={11}
          fill="currentColor"
          className="text-black/50 dark:text-white/50"
        >
          {lastEpisode ? formatEpisodeShort(lastEpisode) : ''}
        </text>
      </svg>
    </div>
  );
}
