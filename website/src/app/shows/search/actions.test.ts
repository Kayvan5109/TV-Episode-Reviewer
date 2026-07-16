import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const userShowsUpsert = vi.fn();
const from = vi.fn(() => ({ upsert: userShowsUpsert }));
const createSupabaseServerClient = vi.fn(async () => ({
  auth: { getUser },
  from,
}));
vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}));

const importShowFromTmdb = vi.fn();
vi.mock('@/lib/shows/importShow', () => ({
  importShowFromTmdb: (...args: unknown[]) => importShowFromTmdb(...args),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { addShow } from './actions';

describe('addShow server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userShowsUpsert.mockResolvedValue({ data: null, error: null });
  });

  it('returns an error for a non-positive-integer tmdbShowId without touching the session or TMDB', async () => {
    const result = await addShow(0, undefined, new FormData());
    expect(result).toEqual({ error: 'Invalid show.' });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(importShowFromTmdb).not.toHaveBeenCalled();
  });

  it('redirects to /login when there is no signed-in user (never trusts the client)', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    await expect(addShow(1396, undefined, new FormData())).rejects.toThrow('REDIRECT:/login');

    expect(importShowFromTmdb).not.toHaveBeenCalled();
  });

  it('imports the show, records it under the signed-in user, and redirects to the show page', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.com' } } });
    importShowFromTmdb.mockResolvedValue({ showId: 'show-uuid', episodeCount: 10 });

    await expect(addShow(1396, undefined, new FormData())).rejects.toThrow(
      'REDIRECT:/shows/show-uuid'
    );

    expect(importShowFromTmdb).toHaveBeenCalledWith(1396);
    expect(from).toHaveBeenCalledWith('user_shows');
    expect(userShowsUpsert).toHaveBeenCalledWith(
      { user_id: 'user-1', show_id: 'show-uuid' },
      { onConflict: 'user_id,show_id', ignoreDuplicates: true }
    );
  });

  it('returns an error state if the TMDB import fails, without redirecting', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    importShowFromTmdb.mockRejectedValue(new Error('TMDB is down'));

    const result = await addShow(1396, undefined, new FormData());

    expect(result).toEqual({ error: "Couldn't import this show from TMDB: TMDB is down" });
    expect(userShowsUpsert).not.toHaveBeenCalled();
  });

  it('returns an error state if saving to the user_shows list fails', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    importShowFromTmdb.mockResolvedValue({ showId: 'show-uuid', episodeCount: 10 });
    userShowsUpsert.mockResolvedValue({ data: null, error: { message: 'db down' } });

    const result = await addShow(1396, undefined, new FormData());

    expect(result).toEqual({
      error: "Show was imported, but couldn't add it to your list: db down",
    });
  });
});
