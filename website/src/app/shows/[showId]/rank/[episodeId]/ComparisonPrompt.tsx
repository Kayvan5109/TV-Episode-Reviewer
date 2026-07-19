'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import type { ComparisonResult } from '@/lib/ranking-session';

import { submitComparison } from './actions';
import { formatEpisode, type EpisodeDisplay } from './episodeDisplay';

/**
 * Which comparison outcome clicking a given side's poster maps to. Per `ComparisonResult`'s
 * semantics (`'better'` means *the subject is better than the reference* — see
 * `src/lib/ranking/types.ts`), clicking the subject's poster means "the subject was better" and
 * clicking the reference's poster means "the subject was worse" (i.e. the reference was better).
 * Pulled out as a small pure function — rather than inlined at the two call sites — so the
 * click→result mapping itself is unit-testable without rendering anything (see
 * `ComparisonPrompt.test.ts`), matching how the rest of this codebase tests pure logic directly.
 */
export function resultForClickedSide(side: 'subject' | 'reference'): ComparisonResult {
  return side === 'subject' ? 'better' : 'worse';
}

/**
 * One side's clickable poster. Renders the real poster image when the episode has one; otherwise
 * a same-sized bordered placeholder holding the episode's title, so there's still something to
 * click for posterless episodes (imported before the poster column existed, or a season TMDB has
 * no poster for) — ranking must not be blocked just because artwork is missing.
 */
function PosterButton({
  episode,
  disabled,
  onClick,
}: {
  episode: EpisodeDisplay;
  disabled: boolean;
  onClick: () => void;
}) {
  const imageUrl = episode.still_url ?? episode.season_poster_url;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={`This one was better: ${formatEpisode(episode)}`}
      className="rounded transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external TMDB CDN image.
        <img
          src={imageUrl}
          alt=""
          width={120}
          height={180}
          className="h-[180px] w-[120px] rounded object-cover"
        />
      ) : (
        <div className="flex h-[180px] w-[120px] items-center justify-center rounded border border-dashed border-black/30 p-2 text-center text-xs text-black/60 dark:border-white/30 dark:text-white/60">
          {episode.title}
        </div>
      )}
    </button>
  );
}

/**
 * One column of the comparison layout: clickable poster (or placeholder), then season/episode +
 * title, then synopsis (if any). The poster is the click target that submits a comparison answer;
 * the title is a *separate* link (`Link`, not a button) through to that episode's detail page, so
 * reading it can't cause an accidental submission — they're independent elements with no nested
 * interactivity. The title link always carries `returnToRank` set to the *subject* episode's id
 * (`returnToRankId`), not this column's own `episode.id` — the reference side has no pending
 * ranking step of its own to return to, only the subject does (see the doc comment on
 * `ComparisonPrompt` below). Shared between the `subject` and `reference` sides; only the data and
 * the resulting `ComparisonResult` differ.
 */
function ComparisonColumn({
  episode,
  showId,
  returnToRankId,
  disabled,
  onPick,
}: {
  episode: EpisodeDisplay;
  showId: string;
  returnToRankId: string;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-2 text-center">
      <PosterButton episode={episode} disabled={disabled} onClick={onPick} />
      <Link
        href={`/shows/${showId}/episodes/${episode.id}?returnToRank=${returnToRankId}`}
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
 * Comparison answer picker, redesigned per Kayvan's request after using the just-shipped
 * two-column layout: instead of separate "Better"/"Worse" buttons below each column, the poster
 * itself is now the click target — clicking `subject`'s poster means "this one was better",
 * clicking `reference`'s poster means the same for that side (`resultForClickedSide` above). The
 * only remaining button is "I can't decide" (unchanged `result: 'neutral'`), roughly centered
 * between the two columns.
 *
 * Takes the subject/reference episodes as plain serializable data (matching the `episodes` table
 * shape via `EpisodeDisplay`) rather than JSX, and renders both full columns itself — poster
 * click handling has to live in a Client Component, so the columns moved here from `page.tsx`'s
 * (Server Component) `EpisodeColumn` for this step only; `page.tsx` still uses its own
 * `EpisodeColumn`/`SeasonPoster` for the non-interactive cold-start/already-ranked display.
 *
 * Same pending/error UX as before: interaction is disabled while a submission is in flight, and a
 * thrown error is surfaced as an alert below the row.
 *
 * `rankAllMode` is passed straight through to `submitComparison` unchanged — this component makes
 * no decisions based on it itself, it's purely threaded from the rank page's `mode` search param
 * down to the action that needs it (see `actions.ts`).
 */
export function ComparisonPrompt({
  showId,
  subject,
  reference,
  rankAllMode,
}: {
  showId: string;
  subject: EpisodeDisplay;
  reference: EpisodeDisplay;
  rankAllMode: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handlePick(result: ComparisonResult) {
    setError(null);
    startTransition(async () => {
      const outcome = await submitComparison(showId, subject.id, reference.id, result, rankAllMode);
      if (outcome?.error) {
        setError(outcome.error);
      }
    });
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <h2 className="text-lg font-medium">Which episode did you like better?</h2>
      <div className="flex w-full flex-col items-center justify-center gap-6 sm:flex-row sm:items-start sm:gap-8">
        <ComparisonColumn
          episode={subject}
          showId={showId}
          returnToRankId={subject.id}
          disabled={isPending}
          onPick={() => handlePick(resultForClickedSide('subject'))}
        />
        <div className="flex items-center justify-center sm:h-[180px]">
          <button
            type="button"
            disabled={isPending}
            onClick={() => handlePick('neutral')}
            className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            I can&apos;t decide
          </button>
        </div>
        <ComparisonColumn
          episode={reference}
          showId={showId}
          returnToRankId={subject.id}
          disabled={isPending}
          onPick={() => handlePick(resultForClickedSide('reference'))}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
