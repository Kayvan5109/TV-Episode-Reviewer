'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import type { ColdStartBucket } from '@/lib/ranking/types';
import { filterIdsBySeason, orderOldestFirst, type EpisodeOrderRow } from '@/lib/ranking/rankAllOrder';
import {
  getNextStepForEpisode,
  getShowRankingDisplay,
  submitColdStartAnswer,
  submitComparisonAnswer,
} from '@/lib/ranking-session';
import type { ComparisonResult, EpisodeId } from '@/lib/ranking-session';
import { createSupabaseServerClient } from '@/lib/supabase/serverSession';

/**
 * Result shape both actions below return: `undefined` on success (the caller just re-renders with
 * whatever `getNextStepForEpisode` now reports for this route's episode), `{ error }` if the
 * underlying `ranking-session` function threw (e.g. a stale/out-of-order submission, or the user
 * got signed out mid-session).
 */
export type RankingActionResult = { error: string } | undefined;

/**
 * Marks `showId` as "added to my shows" for the signed-in user — called only after a ranking
 * answer has actually been recorded (see `submitColdStart`/`submitComparison` below), which is
 * the moment this app now considers a show genuinely "added" rather than merely imported/viewed
 * (previously `user_shows` was written the moment a show was imported via `addShow` in
 * `src/app/shows/search/actions.ts`, which hands-on testing found meant clicking "Rank episodes"
 * and navigating away without ranking anything still left the show marked as added).
 *
 * Same `{ onConflict: 'user_id,show_id', ignoreDuplicates: true }` upsert `addShow` used to use —
 * still safe/idempotent to call on every successful ranking submission, not just the first.
 * Deliberately never throws: a `user_shows` write failing here must not mask or override the
 * ranking answer's own success, which already happened by the time this runs — so failures are
 * just logged.
 */
async function markShowAsAdded(showId: string): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return;
    }

    const { error } = await supabase
      .from('user_shows')
      .upsert(
        { user_id: user.id, show_id: showId },
        { onConflict: 'user_id,show_id', ignoreDuplicates: true }
      );

    if (error) {
      console.error(`Failed to mark show ${showId} as added for user ${user.id}:`, error.message);
    }
  } catch (error) {
    console.error(`Failed to mark show ${showId} as added:`, error);
  }
}

/**
 * Where a rank-all-mode "alreadyRanked" transition should send the user next: the show's (or, when
 * `seasonScope` is set, that one season's) next oldest-by-air-date unranked episode's rank page
 * (`?mode=rankAll` re-appended, so the mode survives, plus `&season=N` when scoped), or the show
 * page itself once nothing unranked is left in scope. Both `getShowRankingDisplay` (for the current
 * unranked-id list) and the episode ordering data (season/episode/air_date) are reloaded fresh here
 * rather than reused from anywhere earlier in the request — this always runs immediately after a
 * just-recorded write, so it must reflect that write, same "always reload" discipline
 * `@/lib/ranking-session/session.ts` follows throughout (see e.g. that file's
 * `resetEpisodeRanking`).
 *
 * `seasonScope`, when provided (season-scoped "Rank season" mode — see
 * `EpisodeListWithFilters.tsx`), narrows `display.unranked` down to just that season's episode ids
 * *before* ordering, so auto-advance only ever lands on episodes from that season and never spills
 * over into the rest of the show once it's exhausted — same "nothing left in scope -> show page"
 * fallback as whole-show mode, just scoped.
 *
 * A failed episode fetch here falls back to the show page rather than throwing out of what's
 * ultimately just a `redirect()` target computation — same fail-open posture `markShowAsAdded`
 * uses for its own non-critical failures.
 */
async function nextRankAllDestination(showId: string, seasonScope?: number): Promise<string> {
  const display = await getShowRankingDisplay(showId);
  if (display.done) {
    return `/shows/${showId}`;
  }

  const supabase = await createSupabaseServerClient();
  const { data: episodesData, error } = await supabase
    .from('episodes')
    .select('id, season_number, episode_number, air_date')
    .eq('show_id', showId);

  if (error || !episodesData) {
    return `/shows/${showId}`;
  }

  const episodes = episodesData as EpisodeOrderRow[];
  const unrankedIds =
    seasonScope === undefined
      ? display.unranked
      : filterIdsBySeason(episodes, display.unranked, seasonScope);

  const nextEpisodeId = orderOldestFirst(episodes, unrankedIds)[0];
  if (!nextEpisodeId) {
    return `/shows/${showId}`;
  }

  let destination = appendQueryParam(`/shows/${showId}/rank/${nextEpisodeId}`, 'mode', 'rankAll');
  if (seasonScope !== undefined) {
    destination = appendQueryParam(destination, 'season', String(seasonScope));
  }
  return destination;
}

/**
 * Appends a query param to a URL that may or may not already have one — `nextRankAllDestination`
 * can hand back either a bare `/shows/${showId}` path or one that already carries `?mode=rankAll`,
 * so this can't just always use `?` or always use `&`.
 */
function appendQueryParam(url: string, key: string, value: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}${key}=${value}`;
}

/**
 * Redirects after an 'alreadyRanked' result — the one place this decision is made, shared by both
 * the catch-block stale-resubmission checks and the success-path checks in both `submitColdStart`
 * and `submitComparison` below (four call sites total, all needing identical behavior here). Plain
 * "back to the show page" when `rankAllMode` is false (unchanged single-episode behavior); straight
 * into the next unranked episode's rank page, still in rank-all mode (and still scoped to
 * `seasonScope`, when set — see `nextRankAllDestination`), when it's true.
 *
 * `notice`, when passed, is appended to the computed destination as a `notice` query param (e.g.
 * `'staleResubmission'` -> `&notice=staleResubmission`) — used only by the two catch-block call
 * sites below, where the resubmission that triggered this redirect never actually got recorded (the
 * original `submitColdStartAnswer`/`submitComparisonAnswer` call threw), unlike the two success-path
 * call sites, which reach 'alreadyRanked' immediately after a real, successful write and so have
 * nothing stale to report.
 *
 * Declared to return `Promise<never>` since `redirect()` always throws — it never actually returns
 * a value to its caller, matching every other `redirect(...)` call site in this file.
 */
async function redirectAfterAlreadyRanked(
  showId: string,
  rankAllMode: boolean,
  seasonScope?: number,
  notice?: 'staleResubmission'
): Promise<never> {
  const destination = rankAllMode ? await nextRankAllDestination(showId, seasonScope) : `/shows/${showId}`;
  redirect(notice ? appendQueryParam(destination, 'notice', notice) : destination);
}

/**
 * Thin wrapper around `submitColdStartAnswer`: catches thrown errors into a plain return value the
 * client component can display without crashing.
 *
 * On success, checks what's next for this episode. If the submission fully resolved this
 * episode's placement (`'alreadyRanked'`), there's nothing left to ask here, so this redirects
 * straight back to the show page rather than leaving the user on a "you're done" screen they'd
 * have to click off of themselves. Otherwise (more cold-start/comparison questions pending for
 * this same episode) it revalidates this specific episode's rank page instead, same as before.
 *
 * Either `revalidatePath` or `redirect` is required, not optional, in this Next.js version: a
 * Server Action only gets its calling route re-rendered in the same response if it calls
 * `revalidatePath`/`refresh`/`redirect` or mutates cookies — a plain return value alone does not
 * trigger a re-render (see `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`). Since
 * this page derives what to show entirely from live Supabase state (via `getNextStepForEpisode`)
 * rather than anything cached, invalidating its own path is exactly what's needed for the next
 * request to reflect the just-submitted answer when there's still something to show here.
 *
 * `rankAllMode` (set when the user entered the ranking flow via the show page's "Rank all" link, or
 * a season's "Rank season" link — see that page and `rank/[episodeId]/page.tsx`'s own `mode` search
 * param) changes only where the two 'alreadyRanked' branches below send the user: see
 * `redirectAfterAlreadyRanked`. `seasonScope`, set only for "Rank season" sessions (the `season`
 * search param — see `page.tsx`), narrows that auto-advance to just one season; `undefined` means
 * whole-show rank-all, unchanged from before this parameter existed.
 */
export async function submitColdStart(
  showId: string,
  episodeId: EpisodeId,
  bucket: ColdStartBucket,
  rankAllMode: boolean,
  seasonScope?: number
): Promise<RankingActionResult> {
  let step;
  try {
    step = await submitColdStartAnswer(showId, episodeId, bucket);
  } catch (error) {
    // A stale page (e.g. the user pressed back after already submitting this episode's answer)
    // can resubmit against an episode that's now fully ranked. `submitColdStartAnswer` correctly
    // rejects that as an error, but from the user's point of view it's not a failure at all — just
    // send them on (see `redirectAfterAlreadyRanked`) like the success path already does for
    // 'alreadyRanked'. Any other thrown error (a real bug, or this recheck itself failing) falls
    // through to the original error below, unchanged.
    const current = await getNextStepForEpisode(showId, episodeId).catch(() => null);
    if (current?.type === 'alreadyRanked') {
      await redirectAfterAlreadyRanked(showId, rankAllMode, seasonScope, 'staleResubmission');
    }

    return {
      error: error instanceof Error ? error.message : 'Failed to submit cold-start answer.',
    };
  }

  // The write succeeded — this show now genuinely counts as "added to my shows". See
  // `markShowAsAdded`'s doc comment for why this replaced writing `user_shows` from `addShow`.
  await markShowAsAdded(showId);

  if (step.type === 'alreadyRanked') {
    await redirectAfterAlreadyRanked(showId, rankAllMode, seasonScope);
  }

  revalidatePath(`/shows/${showId}/rank/${episodeId}`);
}

/**
 * Same shape as `submitColdStart`, wrapping `submitComparisonAnswer` instead. `subjectId` is
 * always this route's own `episodeId` — the caller (`ComparisonPrompt`) is fixed to that subject,
 * it just also needs `referenceId` to know which pending question it's answering. `rankAllMode` and
 * `seasonScope` have the same meaning and effect as they do on `submitColdStart` — see that
 * function's doc comment and `redirectAfterAlreadyRanked`.
 */
export async function submitComparison(
  showId: string,
  subjectId: EpisodeId,
  referenceId: EpisodeId,
  result: ComparisonResult,
  rankAllMode: boolean,
  seasonScope?: number
): Promise<RankingActionResult> {
  let step;
  try {
    step = await submitComparisonAnswer(showId, subjectId, referenceId, result);
  } catch (error) {
    // Same stale-resubmission case as `submitColdStart` above: a back-button page can resubmit a
    // comparison for a subject that's already fully ranked. `submitComparisonAnswer` correctly
    // rejects that (the pending step it finds no longer matches `referenceId`), but it's a benign
    // "you're already done here" situation, not a real error — redirect instead of showing it (see
    // `redirectAfterAlreadyRanked`). Any other thrown error (including this recheck itself failing)
    // falls through unchanged.
    const current = await getNextStepForEpisode(showId, subjectId).catch(() => null);
    if (current?.type === 'alreadyRanked') {
      await redirectAfterAlreadyRanked(showId, rankAllMode, seasonScope, 'staleResubmission');
    }

    return {
      error: error instanceof Error ? error.message : 'Failed to submit comparison answer.',
    };
  }

  // The write succeeded — this show now genuinely counts as "added to my shows". See
  // `markShowAsAdded`'s doc comment for why this replaced writing `user_shows` from `addShow`.
  await markShowAsAdded(showId);

  if (step.type === 'alreadyRanked') {
    await redirectAfterAlreadyRanked(showId, rankAllMode, seasonScope);
  }

  revalidatePath(`/shows/${showId}/rank/${subjectId}`);
}
