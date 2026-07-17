import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const createSupabaseServerClient = vi.fn(async () => ({
  auth: { getUser },
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

  // Deliberately does NOT write a `user_shows` row: importing/viewing a show is not the same as
  // "adding" it. That happens instead the first time a ranking answer is actually submitted — see
  // `markShowAsAdded` in `src/app/shows/[showId]/rank/[episodeId]/actions.ts`.
  it('imports the show and redirects to the show page, without recording it under the user yet', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.com' } } });
    importShowFromTmdb.mockResolvedValue({ showId: 'show-uuid', episodeCount: 10 });

    await expect(addShow(1396, undefined, new FormData())).rejects.toThrow(
      'REDIRECT:/shows/show-uuid'
    );

    expect(importShowFromTmdb).toHaveBeenCalledWith(1396);
  });

  it('returns an error state if the TMDB import fails, without redirecting', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    importShowFromTmdb.mockRejectedValue(new Error('TMDB is down'));

    const result = await addShow(1396, undefined, new FormData());

    expect(result).toEqual({ error: "Couldn't import this show from TMDB: TMDB is down" });
  });
});
