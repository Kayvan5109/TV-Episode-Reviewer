/**
 * Types for the persistence/orchestration layer that sits on top of the pure ranking algorithm
 * (`@/lib/ranking`). This module is deliberately kept separate from `@/lib/ranking` — that
 * directory is the pure, DB-free algorithm (see its own module comment); everything here is
 * allowed to know about Supabase, `episode_rankings`, and `episode_comparisons`.
 */

import type { ComparisonResult, EpisodeId } from '@/lib/ranking/types';

/**
 * Thrown by the "replay" comparator (`makeReplayComparator` in `comparator.ts`) when the ranking
 * algorithm asks for a comparison between two episodes that has genuinely never been answered
 * before (no matching row in `episode_comparisons`, from either episode's perspective).
 *
 * This is the sentinel the whole resumable-comparison design hinges on: `addComparativeEpisode`
 * (from `@/lib/ranking`) expects a synchronous-or-async comparator and has no other way to signal
 * "stop and go ask the user something" mid-algorithm. Callers in this module (`deriveNextStep`)
 * catch this specific error and turn it into a `{ type: 'compare', ... }` step instead of letting
 * it propagate as a real failure — any other thrown error is a genuine bug and should propagate.
 */
export class NeedsComparisonInput extends Error {
  constructor(
    public readonly subject: EpisodeId,
    public readonly reference: EpisodeId
  ) {
    super(
      `Needs a real comparison answer between subject=${subject} and reference=${reference}`
    );
    this.name = 'NeedsComparisonInput';
  }
}

/**
 * "What should the user be asked/shown next for this show?" — the discriminated result
 * `getNextRankingStep` (and the `submit*` functions, which re-derive this after persisting an
 * answer) return. Deliberately just episode ids, not richer episode DTOs (title, season/episode
 * number, artwork): this module's job is orchestration/persistence, not shaping data for display —
 * the later ranking-UI work can join `episode_id` back against the `episodes` table (already
 * readable by any authenticated user, see `supabase/migrations/20260715000000_initial_schema.sql`)
 * however it wants to render each step.
 */
export type NextRankingStep =
  | { type: 'coldStart'; episode: EpisodeId }
  | { type: 'compare'; subject: EpisodeId; reference: EpisodeId }
  | { type: 'done' };

/** Re-exported for convenience so callers of this module don't also need to import from `@/lib/ranking`. */
export type { ComparisonResult, EpisodeId };
