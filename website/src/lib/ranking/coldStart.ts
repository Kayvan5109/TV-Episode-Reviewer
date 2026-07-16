import type { ColdStartBucket, ColdStartEntry, EpisodeId } from './types';

/**
 * JUDGMENT CALL — flagged for review, not decided in the docs:
 *
 * Ordering of cold-start episodes among themselves, since by definition they haven't been
 * compared to each other at all (that's the whole point of cold start). Chosen ordering:
 *
 *   1. Bucket order: liked > neutral > disliked.
 *   2. Within a bucket: most-recently-ranked first (a 'liked' episode ranked just now sits
 *      above an earlier 'liked' episode).
 *
 * Rationale: recency-within-bucket surfaces what the user most recently told us without
 * pretending we have any finer-grained ordering info than the bucket itself provides. This has
 * *not* been confirmed against Beli's actual behavior or discussed with the user — log it in
 * Docs/DevelopmentPlan.md's Issues for a real decision later.
 */
const BUCKET_RANK: Record<ColdStartBucket, number> = {
  liked: 0,
  neutral: 1,
  disliked: 2,
};

/** Sort cold-start entries into best-to-worst order per the judgment call documented above. */
export function orderColdStart(entries: readonly ColdStartEntry[]): ColdStartEntry[] {
  return [...entries].sort((a, b) => {
    const bucketDiff = BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket];
    if (bucketDiff !== 0) return bucketDiff;
    // Most-recently-ranked (higher sequence) first within a bucket.
    return b.sequence - a.sequence;
  });
}

/** Convenience: just the episode ids, in the order above. */
export function orderColdStartIds(entries: readonly ColdStartEntry[]): EpisodeId[] {
  return orderColdStart(entries).map((e) => e.episodeId);
}
