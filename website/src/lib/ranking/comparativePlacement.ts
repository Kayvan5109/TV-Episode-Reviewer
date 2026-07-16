import { MAX_TIE_BREAK_ATTEMPTS } from './constants';
import type { Comparator, ComparisonHistory, ComparisonResult, EpisodeId } from './types';

function cloneHistory(history: ComparisonHistory): ComparisonHistory {
  const copy: ComparisonHistory = new Map();
  for (const [id, records] of history) {
    copy.set(id, [...records]);
  }
  return copy;
}

function invert(result: ComparisonResult): ComparisonResult {
  if (result === 'better') return 'worse';
  if (result === 'worse') return 'better';
  return 'neutral';
}

/** Record a comparison from both sides: subject's perspective, and reference's inverse perspective. */
function recordComparison(
  history: ComparisonHistory,
  subject: EpisodeId,
  reference: EpisodeId,
  result: ComparisonResult
): void {
  const subjectRecords = history.get(subject) ?? [];
  subjectRecords.push({ with: reference, result });
  history.set(subject, subjectRecords);

  const referenceRecords = history.get(reference) ?? [];
  referenceRecords.push({ with: subject, result: invert(result) });
  history.set(reference, referenceRecords);
}

async function compare(
  comparator: Comparator,
  subject: EpisodeId,
  reference: EpisodeId,
  history: ComparisonHistory
): Promise<ComparisonResult> {
  const result = await comparator(subject, reference);
  recordComparison(history, subject, reference, result);
  return result;
}

/**
 * Find episode `b`'s "common reference episode" for tie-break purposes.
 *
 * CONFIRMED DECISION (no longer an open judgment call — Kayvan reviewed the alternatives and
 * specified this two-tier rule directly; this replaces the earlier "closest in rank among any
 * of b's history" heuristic, superseding it rather than sitting alongside it):
 *
 *   1. First tier: among `b`'s own comparison history, consider only episodes `b` has a
 *      *decisive* (non-neutral — 'better' or 'worse') recorded result against, and pick
 *      whichever of those is closest to `b` in current rank position.
 *   2. Second tier: if no decisive-relationship candidate exists (`b` has no history at all, or
 *      none of it is decisive), fall back to the closest-in-rank episode anywhere in the
 *      current `ranked` list — no relationship-history requirement at all.
 *
 * Rationale: a decisive prior comparison is the most informative anchor, since it's already
 * known to discriminate against `b`; absent that, rank proximity alone is still the next-best
 * bet for producing a discriminating result against the tied subject.
 *
 * Ties in distance (within either tier) are broken by lower rank index — purely for
 * determinism, not a considered choice.
 *
 * `exclude` removes episodes already tried earlier in the same tie-break chain, per the docs'
 * "excluding episodes already tried... to avoid loops" instruction. It applies at both tiers.
 */
export function findCommonReference(
  b: EpisodeId,
  ranked: readonly EpisodeId[],
  history: ComparisonHistory,
  exclude: ReadonlySet<EpisodeId>
): EpisodeId | undefined {
  const bIndex = ranked.indexOf(b);

  const closestInRank = (candidates: Iterable<EpisodeId>): EpisodeId | undefined => {
    let best: EpisodeId | undefined;
    let bestDistance = Infinity;
    let bestIndex = Infinity;

    for (const candidate of candidates) {
      if (exclude.has(candidate)) continue;
      const candidateIndex = ranked.indexOf(candidate);
      if (candidateIndex === -1) continue; // not currently in the ranked list; skip
      const distance = Math.abs(candidateIndex - bIndex);
      if (distance < bestDistance || (distance === bestDistance && candidateIndex < bestIndex)) {
        best = candidate;
        bestDistance = distance;
        bestIndex = candidateIndex;
      }
    }

    return best;
  };

  // Tier 1: closest partner with a decisive (non-neutral) recorded result against b.
  const bRecords = history.get(b) ?? [];
  const decisivePartners = bRecords.filter((r) => r.result !== 'neutral').map((r) => r.with);
  const decisive = closestInRank(decisivePartners);
  if (decisive) return decisive;

  // Tier 2: no decisive relationship to draw on — fall back to plain rank proximity, with no
  // history requirement at all.
  return closestInRank(ranked.filter((id) => id !== b));
}

export type TieBreakOutcome =
  | { result: 'better' | 'worse' }
  | { fallbackAdjacentTo: EpisodeId };

/**
 * Resolve a neutral (tied) comparison between `subject` and `pivot` by walking `pivot`'s
 * comparison history for a common reference episode, per Docs/DevelopmentPlan.md's "Ranking
 * Algorithm" tie-break mechanic. See `findCommonReference` above for the (now confirmed)
 * selection rule, and the fallback comments below for the tie-break attempts cap and
 * final-fallback behavior, which are still open judgment calls.
 */
export async function resolveTie(
  subject: EpisodeId,
  pivot: EpisodeId,
  ranked: readonly EpisodeId[],
  history: ComparisonHistory,
  comparator: Comparator
): Promise<TieBreakOutcome> {
  const tried = new Set<EpisodeId>([pivot]);
  let current = pivot;

  for (let attempt = 0; attempt < MAX_TIE_BREAK_ATTEMPTS; attempt++) {
    const reference = findCommonReference(current, ranked, history, tried);
    if (!reference) {
      // JUDGMENT CALL — flagged for review: `current` has no (further) comparison history to
      // draw a common reference from. On the first attempt this is exactly the docs' "B has no
      // prior comparison history at all" case (e.g. B was placed very early); on a later
      // attempt it's the analogous situation one hop into the chain. Either way, fall back to
      // inserting adjacent to `current` rather than leaving the tie unresolved.
      return { fallbackAdjacentTo: current };
    }
    tried.add(reference);
    const result = await compare(comparator, subject, reference, history);
    if (result !== 'neutral') {
      return { result };
    }
    // Still neutral — recurse using `reference` as the new pivot to search for a *further*
    // common reference, excluding everything already tried in this chain (per the docs).
    current = reference;
  }

  // JUDGMENT CALL — flagged for review: exhausted MAX_TIE_BREAK_ATTEMPTS common-reference
  // comparisons and every one came back neutral too. Docs/DevelopmentPlan.md flags this exact
  // scenario as unresolved; fall back to treating it as a genuine tie and inserting adjacent to
  // whichever episode was compared against last.
  return { fallbackAdjacentTo: current };
}

export interface ComparativePlacementResult {
  ranked: EpisodeId[];
  history: ComparisonHistory;
  insertedAtIndex: number;
}

/**
 * Place a new episode into an already-ranked list via binary-insertion-style comparison
 * (Docs/DevelopmentPlan.md's "Comparative placement"), falling back to the tie-break mechanic
 * above whenever a comparison comes back neutral instead of stopping outright.
 *
 * JUDGMENT CALL (see comparativePlacement's tie-break handling below): when a tie-break
 * resolves via a common reference C instead of the original pivot B, we use the subject-vs-C
 * result as a direct stand-in for what the (neutral) subject-vs-B comparison would have shown,
 * narrowing the search exactly as the ordinary better/worse branches do. We deliberately don't
 * try to use C's own rank position as an independent narrowing bound — combining "subject ~ B"
 * with "subject vs C" that way would require assumptions about transitivity the docs don't
 * specify, and this simpler interpretation still satisfies "use that result to continue
 * narrowing the binary search" from the spec.
 */
export async function placeEpisodeComparatively(
  ranked: readonly EpisodeId[],
  history: ComparisonHistory,
  subject: EpisodeId,
  comparator: Comparator
): Promise<ComparativePlacementResult> {
  if (ranked.includes(subject)) {
    throw new Error(`Episode ${subject} is already in the ranked list`);
  }

  const workingHistory = cloneHistory(history);
  let lo = 0;
  let hi = ranked.length - 1;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const pivot = ranked[mid];
    const result = await compare(comparator, subject, pivot, workingHistory);

    if (result === 'better') {
      hi = mid - 1;
      continue;
    }
    if (result === 'worse') {
      lo = mid + 1;
      continue;
    }

    // Neutral: don't stop here — break the tie via a common reference episode instead.
    const outcome = await resolveTie(subject, pivot, ranked, workingHistory, comparator);
    if ('fallbackAdjacentTo' in outcome) {
      const adjacentIndex = ranked.indexOf(outcome.fallbackAdjacentTo);
      // JUDGMENT CALL — flagged for review: "adjacent" means immediately *after* (worse than)
      // the reference episode. The docs don't specify before-vs-after; "after" was picked
      // arbitrarily for determinism, alongside the other tie-break judgment calls above.
      const newRanked = [...ranked];
      newRanked.splice(adjacentIndex + 1, 0, subject);
      return { ranked: newRanked, history: workingHistory, insertedAtIndex: adjacentIndex + 1 };
    }

    if (outcome.result === 'better') {
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  const newRanked = [...ranked];
  newRanked.splice(lo, 0, subject);
  return { ranked: newRanked, history: workingHistory, insertedAtIndex: lo };
}
