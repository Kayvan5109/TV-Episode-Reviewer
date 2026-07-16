/**
 * Core types for the episode ranking algorithm.
 *
 * Deliberately decoupled from any persistence layer (Supabase, etc.) — this module operates
 * purely on episode identifiers and in-memory state, so it can be unit tested without a
 * database and reused as-is once real storage exists. See Docs/AppSpec.md's "Data model"
 * section: comparison history + rank position is the durable state; the 1-10 score is always
 * derived on demand (see score.ts), never stored.
 */

export type EpisodeId = string;

/** Coarse cold-start judgment a user gives an episode before comparative ranking kicks in. */
export type ColdStartBucket = 'liked' | 'neutral' | 'disliked';

/** Result of comparing one episode ("the subject") against another ("the reference"). */
export type ComparisonResult = 'better' | 'worse' | 'neutral';

/**
 * Injectable comparison oracle: given two episode ids, answer how `subject` compares to
 * `reference` ('better' means subject is better than reference). In production this resolves
 * via a user prompt; in tests it's a scripted function, e.g. over hidden "true quality" values.
 * May be sync or async, since a real UI-driven comparison is inherently asynchronous (waiting
 * on user input).
 */
export type Comparator = (
  subject: EpisodeId,
  reference: EpisodeId
) => ComparisonResult | Promise<ComparisonResult>;

/** One entry in an episode's comparison history: "I was compared to X, and I was ___ relative to X." */
export interface ComparisonRecord {
  with: EpisodeId;
  result: ComparisonResult;
}

/** Full comparison history, keyed by episode id. Only populated for comparatively-placed episodes. */
export type ComparisonHistory = Map<EpisodeId, ComparisonRecord[]>;

/** A cold-start episode and the bucket it was given, plus enough info to order it among peers. */
export interface ColdStartEntry {
  episodeId: EpisodeId;
  bucket: ColdStartBucket;
  /** Monotonically increasing sequence number; higher = ranked more recently. */
  sequence: number;
}

/**
 * Full per-show ranking state. Mirrors the durable state described in AppSpec.md's data model.
 */
export interface ShowRankingState {
  /** Episodes still in cold-start mode, not yet folded into comparative ranking. */
  coldStart: ColdStartEntry[];
  /** Comparatively-ranked episodes, best (index 0) to worst (index length - 1). */
  ranked: EpisodeId[];
  /** Comparison history for every episode that has gone through comparative placement. */
  history: ComparisonHistory;
}
