'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import type { ComparisonResult } from '@/lib/all-star-session';

import { submitAllStarComparison } from './actions';
import { formatAllStarEpisode, type AllStarEpisodeDisplay } from './episodeDisplay';

/**
 * Same click→result mapping as `@/app/shows/[showId]/rank/[episodeId]/ComparisonPrompt.tsx`'s
 * `resultForClickedSide` — clicking the subject's poster means "the subject was better", clicking
 * the reference's poster means "the subject was worse". Kept as its own copy rather than importing
 * the per-show component's version: that file also carries per-show-only concerns (`rankAllMode`/
 * `seasonScope`), and this is a two-line pure function, not worth threading a cross-module import
 * for.
 */
export function resultForClickedSide(side: 'subject' | 'reference'): ComparisonResult {
  return side === 'subject' ? 'better' : 'worse';
}

/**
 * One side's clickable poster — same visual language as the per-show comparison screen's
 * `PosterButton`: the real poster/still when available, otherwise a same-sized bordered
 * placeholder holding the episode's title, so posterless episodes are still clickable.
 */
function PosterButton({
  episode,
  disabled,
  onClick,
}: {
  episode: AllStarEpisodeDisplay;
  disabled: boolean;
  onClick: () => void;
}) {
  const imageUrl = episode.still_url ?? episode.season_poster_url;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={`This one was better: ${formatAllStarEpisode(episode)}, ${episode.showTitle}`}
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
 * One column of the comparison layout: clickable poster, show title (bold — essential context here
 * since the two sides can be from entirely different shows, unlike the per-show comparison
 * screen), season/episode + episode title (its own link through to the episode detail page — no
 * `returnToRank`/round-trip preservation for this route in v1; a click-through-and-back just lands
 * on the episode page with no way back into this flow other than navigating to
 * `/top-episodes/rank` again, a deliberate, known v1 limitation — see this route's own doc
 * comment), then synopsis if any.
 */
function AllStarComparisonColumn({
  episode,
  disabled,
  onPick,
}: {
  episode: AllStarEpisodeDisplay;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-2 text-center">
      <PosterButton episode={episode} disabled={disabled} onClick={onPick} />
      <span className="text-sm font-semibold text-black/70 dark:text-white/70">{episode.showTitle}</span>
      <Link
        href={`/shows/${episode.showId}/episodes/${episode.id}`}
        className="text-lg font-medium underline underline-offset-2"
      >
        {formatAllStarEpisode(episode)}
      </Link>
      {episode.synopsis && (
        <p className="text-sm text-black/60 dark:text-white/60">{episode.synopsis}</p>
      )}
    </div>
  );
}

/**
 * The Top Episodes comparison screen — same click-a-poster-to-answer visual language as
 * `@/app/shows/[showId]/rank/[episodeId]/ComparisonPrompt.tsx`, adapted for cross-show pairs: each
 * column carries and displays its own show, since the two compared episodes need not share one
 * (see `AllStarEpisodeDisplay`).
 */
export function AllStarComparisonPrompt({
  subject,
  reference,
}: {
  subject: AllStarEpisodeDisplay;
  reference: AllStarEpisodeDisplay;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handlePick(result: ComparisonResult) {
    setError(null);
    startTransition(async () => {
      const outcome = await submitAllStarComparison(subject.id, reference.id, result);
      if (outcome?.error) {
        setError(outcome.error);
      }
    });
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <h2 className="text-lg font-medium">Which episode did you like better?</h2>
      <div className="flex w-full flex-col items-center justify-center gap-6 sm:flex-row sm:items-start sm:gap-8">
        <AllStarComparisonColumn
          episode={subject}
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
        <AllStarComparisonColumn
          episode={reference}
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
