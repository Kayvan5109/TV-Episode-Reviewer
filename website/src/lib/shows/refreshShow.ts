/**
 * Throttled background re-sync of a previously-imported show against TMDB.
 *
 * `importShowFromTmdb` is already idempotent (upserts on TMDB's own ids), so it's always safe to
 * call again — but it's a TMDB round trip (show details + every season), so read-only display pages
 * shouldn't do it on *every* view. `ensureShowSynced` gates that: it only re-imports when the show's
 * `shows.last_synced_at` (see `supabase/migrations/20260718020000_shows_last_synced_at.sql`) is
 * older than `SYNC_STALE_AFTER_MS`.
 *
 * Fail-open by design, matching `@/lib/shows/searchAnnotation.ts`'s pattern: a transient TMDB outage
 * during a page view must never break that page render. Any error from `importShowFromTmdb` is
 * caught and logged, never rethrown — the page just renders whatever's already in the DB, same as
 * before this feature existed.
 */

import { importShowFromTmdb } from '@/lib/shows/importShow';

/** How long a show's last TMDB sync is considered fresh before a page view triggers a re-sync. */
export const SYNC_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Pure: true if `lastSyncedAt` (an ISO timestamp, as read from `shows.last_synced_at`) is more than
 * `SYNC_STALE_AFTER_MS` old relative to `now`. `now` is injectable for deterministic unit testing.
 */
export function isShowStale(lastSyncedAt: string, now: Date = new Date()): boolean {
  const lastSynced = new Date(lastSyncedAt).getTime();
  return now.getTime() - lastSynced > SYNC_STALE_AFTER_MS;
}

/**
 * Re-imports `show` from TMDB if its last sync is stale, so a display page's next query picks up
 * any new episodes/seasons TMDB has added since it was last checked. No-op when still fresh.
 *
 * Swallows (rather than rethrows) any `importShowFromTmdb` failure — see module doc comment.
 */
export async function ensureShowSynced(show: {
  tmdbShowId: number;
  lastSyncedAt: string;
}): Promise<void> {
  if (!isShowStale(show.lastSyncedAt)) {
    return;
  }

  try {
    await importShowFromTmdb(show.tmdbShowId);
  } catch (error) {
    console.error(
      `ensureShowSynced: failed to refresh show (tmdb id ${show.tmdbShowId}) from TMDB`,
      error
    );
  }
}
