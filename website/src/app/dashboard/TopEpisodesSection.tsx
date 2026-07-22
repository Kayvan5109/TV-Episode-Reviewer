import Link from 'next/link';

import type { AllStarDisplay } from '@/lib/all-star-session';

import { ResetTopEpisodesButton } from './ResetTopEpisodesButton';

/**
 * The dashboard's "Top Episodes" section (Docs/STATUS.md Bucket 4 item 15, "All Stars Mode") —
 * ranks every tracked show's current #1 episode against each other, cross-show. Renders nothing at
 * all when `display.eligible` is `false` (fewer than 4 tracked shows have a live #1 yet — see
 * `@/lib/all-star-session`'s `ELIGIBILITY_THRESHOLD`), per the UX spec's explicit "no teaser, no
 * '3 more to go', keep it simple for v1" instruction.
 *
 * `showTitleById` is resolved by the caller (`page.tsx`) via one batched query over the small set
 * of show ids this section actually needs (every id in `display.ranked` plus every id in
 * `display.staleShowIds`) — same accepted-exception pattern as this page's existing
 * `topEpisodeById` lookup (bounded by how many shows a user tracks, not by any single show's
 * episode count; see Docs/STATUS.md Bucket 1 item 1's write-up of exactly this distinction).
 *
 * Three states, matching the UX spec exactly. "First time" vs "returning" is driven by the
 * durable `display.hasCompletedOnce` flag (`all_star_progress.has_completed_once`), *not* by
 * whether `display.ranked` happens to be empty right now — placing the very first entrant into an
 * empty pool takes zero comparisons by design, so `ranked` can already be non-empty by the time a
 * newly-eligible user's very first dashboard load finishes computing display state, before they've
 * clicked anything. See `@/lib/all-star-session`'s `loadHasCompletedOnce` doc comment for the full
 * writeup.
 *
 *   - First time (`!display.hasCompletedOnce`): a single "Rank Top Episodes" button. (The ranked
 *     list, if any entries exist yet from the zero-comparison auto-placement above, still renders
 *     alongside it -- see below.)
 *   - Some pending (new shows became eligible, and/or reconciliation just found stale entries):
 *     a notice naming which show(s) changed (the removal already happened automatically by the
 *     time this renders — see `@/lib/all-star-session`'s reconciliation), an "Update Top Episodes"
 *     button to continue placing, and a separate, quieter full-reset option.
 *   - Up to date (`display.done`): the full ranked list (rank, title, which show, score) plus the
 *     same quiet full-reset option.
 *
 * The ranked list and the "something's pending" notice/button are *not* mutually exclusive: the
 * list renders whenever `display.ranked` has entries, regardless of `display.done` — a stale
 * show's #1 changing shouldn't make the user's entire list disappear while they go re-confirm just
 * that one show (see `@/lib/all-star-session`'s `buildDisplayRanked` for how a stale show's new #1
 * gets a placeholder slot in the list at its old position). `entry.isPlaceholder` marks that
 * synthetic, not-yet-reconfirmed slot with a lighter treatment + "pending" label.
 */
export function TopEpisodesSection({
  display,
  showTitleById,
  episodeById,
}: {
  display: AllStarDisplay;
  showTitleById: Map<string, { title: string }>;
  episodeById: Map<string, { title: string; season_number: number; episode_number: number }>;
}) {
  if (!display.eligible) {
    return null;
  }

  // Durable per-user history, not a per-request derived value -- see the module comment above and
  // `@/lib/all-star-session`'s `loadHasCompletedOnce` for why `display.ranked.length === 0` used
  // to be (and no longer is) how this was computed.
  const isFirstTime = !display.hasCompletedOnce;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-semibold">Top Episodes</h1>

      {/* Renders whenever there's anything placed, regardless of `display.done` -- the list and
          the "something's pending" notice/button below are not mutually exclusive states. A stale
          show's #1 changing shouldn't hide every other, unaffected show's correctly-placed entry;
          its own old slot instead shows a placeholder (`entry.isPlaceholder`) for its new #1 until
          the user actually confirms it via real comparative placement. */}
      {display.ranked.length > 0 && (
        <ol className="flex flex-col gap-2">
          {display.ranked.map((entry) => {
            const episode = episodeById.get(entry.episodeId);
            return (
              <li
                key={entry.episodeId}
                className={`flex items-center justify-between rounded border p-3 ${
                  entry.isPlaceholder
                    ? 'border-dashed border-black/20 opacity-70 dark:border-white/30'
                    : 'border-black/10 dark:border-white/20'
                }`}
              >
                <span className="flex flex-col">
                  <span className="font-medium">
                    #{entry.rank} — {episode ? `S${episode.season_number}E${episode.episode_number} — ${episode.title}` : 'Unknown episode'}
                    {entry.isPlaceholder && (
                      <span className="ml-2 rounded bg-black/10 px-1.5 py-0.5 text-xs font-normal text-black/60 dark:bg-white/10 dark:text-white/60">
                        pending
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-black/60 dark:text-white/60">
                    {showTitleById.get(entry.showId)?.title ?? 'Unknown show'}
                  </span>
                </span>
                <span className="text-sm text-black/60 dark:text-white/60">{entry.score.toFixed(1)}</span>
              </li>
            );
          })}
        </ol>
      )}

      {display.done && <ResetTopEpisodesButton />}

      {!display.done && isFirstTime && (
        <Link
          href="/top-episodes/rank"
          className="w-fit whitespace-nowrap rounded border border-blue-600 px-3 py-1.5 text-sm text-blue-600 dark:border-blue-400 dark:text-blue-400"
        >
          Rank Top Episodes
        </Link>
      )}

      {!display.done && !isFirstTime && (
        <div className="flex flex-col gap-3">
          {display.staleShowIds.length > 0 && (
            <p
              role="status"
              className="flex w-full items-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900 dark:border-blue-400/40 dark:bg-blue-950/40 dark:text-blue-200"
            >
              <span aria-hidden="true">ℹ️</span>
              <span>
                Your #1 for{' '}
                {display.staleShowIds
                  .map((showId) => `"${showTitleById.get(showId)?.title ?? 'a show'}"`)
                  .join(', ')}{' '}
                changed since your last Top Episodes ranking — updated automatically.
              </span>
            </p>
          )}
          <Link
            href="/top-episodes/rank"
            className="w-fit whitespace-nowrap rounded border border-blue-600 px-3 py-1.5 text-sm text-blue-600 dark:border-blue-400 dark:text-blue-400"
          >
            Update Top Episodes
          </Link>
          <ResetTopEpisodesButton />
        </div>
      )}
    </div>
  );
}
