import { beforeEach, describe, expect, it, vi } from 'vitest';

const importShowFromTmdb = vi.fn();
vi.mock('@/lib/shows/importShow', () => ({
  importShowFromTmdb: (...args: unknown[]) => importShowFromTmdb(...args),
}));

import { ensureShowSynced, isShowStale, SYNC_STALE_AFTER_MS } from './refreshShow';

describe('isShowStale', () => {
  const now = new Date('2026-07-18T12:00:00.000Z');

  it('returns false for a show synced just now', () => {
    expect(isShowStale(now.toISOString(), now)).toBe(false);
  });

  it('returns false for a show synced just under the threshold ago', () => {
    const lastSyncedAt = new Date(now.getTime() - SYNC_STALE_AFTER_MS + 1).toISOString();
    expect(isShowStale(lastSyncedAt, now)).toBe(false);
  });

  it('returns false for a show synced exactly at the threshold', () => {
    const lastSyncedAt = new Date(now.getTime() - SYNC_STALE_AFTER_MS).toISOString();
    expect(isShowStale(lastSyncedAt, now)).toBe(false);
  });

  it('returns true for a show synced just over the threshold ago', () => {
    const lastSyncedAt = new Date(now.getTime() - SYNC_STALE_AFTER_MS - 1).toISOString();
    expect(isShowStale(lastSyncedAt, now)).toBe(true);
  });

  it('returns true for a show synced long ago', () => {
    const lastSyncedAt = new Date(now.getTime() - SYNC_STALE_AFTER_MS * 10).toISOString();
    expect(isShowStale(lastSyncedAt, now)).toBe(true);
  });
});

describe('ensureShowSynced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls importShowFromTmdb when the show is stale', async () => {
    const lastSyncedAt = new Date(Date.now() - SYNC_STALE_AFTER_MS * 2).toISOString();
    importShowFromTmdb.mockResolvedValue({ showId: 'show-uuid', episodeCount: 5 });

    await ensureShowSynced({ tmdbShowId: 1396, lastSyncedAt });

    expect(importShowFromTmdb).toHaveBeenCalledWith(1396);
  });

  it('does not call importShowFromTmdb when the show is still fresh', async () => {
    const lastSyncedAt = new Date().toISOString();

    await ensureShowSynced({ tmdbShowId: 1396, lastSyncedAt });

    expect(importShowFromTmdb).not.toHaveBeenCalled();
  });

  it('swallows a rejected importShowFromTmdb call rather than rethrowing', async () => {
    const lastSyncedAt = new Date(Date.now() - SYNC_STALE_AFTER_MS * 2).toISOString();
    importShowFromTmdb.mockRejectedValue(new Error('TMDB is down'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(ensureShowSynced({ tmdbShowId: 1396, lastSyncedAt })).resolves.toBeUndefined();

    expect(importShowFromTmdb).toHaveBeenCalledWith(1396);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
