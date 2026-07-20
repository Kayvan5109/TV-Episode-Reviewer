/**
 * Shown when a ranking submission turned out to be stale — e.g. the user pressed browser-back
 * after already answering a like/dislike/comparison prompt — and got redirected here instead of
 * recording anything new (see `rank/[episodeId]/actions.ts`'s `redirectAfterAlreadyRanked`, which
 * sets the `notice=staleResubmission` query param both pages below key off of). It's purely
 * informational, not an error: nothing went wrong, the user just didn't need to be asked again.
 *
 * Deliberately a *third* visual tier, distinct from this app's other two text conventions:
 * - not the plain muted-caption style used for ordinary secondary text (e.g. `ShowSearchForm`'s
 *   "No shows found for…") — that's exactly what made this notice easy to miss (Docs/STATUS.md,
 *   Bucket 4 item 19).
 * - not the `role="alert"` + `text-red-600` error styling used throughout the app — this isn't an
 *   error.
 * Instead: a bordered, tinted box with a leading icon and bold label, `role="status"` (matching
 * this app's existing use of `role="status"` for non-error informational/live text, e.g.
 * `ShowSearchForm`'s "Searching…"). Per this app's "color is never the only signal" rule (see the
 * heatmap/tier color usage in `stats/page.tsx`, which always pairs color with a literal
 * letter/label), the blue tint isn't left to carry the meaning alone — it's paired with an icon
 * glyph, bold text, and a border.
 *
 * A shared component (rather than duplicating the markup) because the exact same condition and
 * message render in two places — `shows/[showId]/page.tsx` and
 * `shows/[showId]/rank/[episodeId]/page.tsx` — and duplicated styling only drifts apart over time.
 * Deliberately trivial: no props, no logic, just markup.
 */
export function StaleResubmissionNotice() {
  return (
    <p
      role="status"
      className="flex w-full max-w-2xl items-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900 dark:border-blue-400/40 dark:bg-blue-950/40 dark:text-blue-200"
    >
      <span aria-hidden="true">ℹ️</span>
      <span>This episode was already ranked — nothing changed.</span>
    </p>
  );
}
