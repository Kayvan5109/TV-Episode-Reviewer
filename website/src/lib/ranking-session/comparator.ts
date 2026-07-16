/**
 * The "replay" comparator: bridges the pure algorithm's synchronous-callback `Comparator` shape
 * (`@/lib/ranking/types`) with a real request/response website, where an actual new comparison
 * answer only ever arrives on a *later* HTTP request.
 *
 * Given a `ShowRankingState` reconstructed from the DB (see `reconstruct.ts`), this returns a
 * `Comparator` that:
 *   - answers instantly from the reconstructed history if this exact pair has already been
 *     compared (from either side — `reconstructShowRankingState` populates both directions), and
 *   - throws `NeedsComparisonInput` the first time it's asked about a pair with no recorded
 *     answer — that's the signal to stop and surface the question to the user instead of
 *     fabricating a result.
 */

import type { Comparator, ComparisonHistory } from '@/lib/ranking/types';
import { NeedsComparisonInput } from './types';

export function makeReplayComparator(history: ComparisonHistory): Comparator {
  return (subject, reference) => {
    const subjectRecords = history.get(subject) ?? [];
    const existing = subjectRecords.find((record) => record.with === reference);
    if (existing) {
      return existing.result;
    }
    throw new NeedsComparisonInput(subject, reference);
  };
}
