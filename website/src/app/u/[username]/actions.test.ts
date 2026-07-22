import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();

const profileMaybeSingle = vi.fn();
const profileIlike = vi.fn(() => ({ maybeSingle: profileMaybeSingle }));
const profileSelect = vi.fn(() => ({ ilike: profileIlike }));

const followsInsert = vi.fn();
const followsDeleteEq2 = vi.fn();
const followsDeleteEq1 = vi.fn(() => ({ eq: followsDeleteEq2 }));
const followsDelete = vi.fn(() => ({ eq: followsDeleteEq1 }));

const from = vi.fn((table: string) => {
  if (table === 'user_profiles') return { select: profileSelect };
  if (table === 'follows') return { insert: followsInsert, delete: followsDelete };
  throw new Error(`Unexpected table in test: ${table}`);
});

vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser },
    from,
  })),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { followUser, unfollowUser } from './actions';

describe('followUser server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'me' } } });
  });

  it('redirects to /login when signed out, without touching the DB', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(followUser('someone')).rejects.toThrow('REDIRECT:/login');
    expect(from).not.toHaveBeenCalled();
  });

  it("returns an error when the target username doesn't resolve to any user", async () => {
    profileMaybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await followUser('nosuchuser');

    expect(result).toEqual({ error: "Couldn't find that user." });
    expect(followsInsert).not.toHaveBeenCalled();
  });

  it('escapes ILIKE wildcards in the username so a partial pattern cannot resolve to a real user', async () => {
    profileMaybeSingle.mockResolvedValue({ data: null, error: null });

    await followUser('adm%n');

    expect(profileIlike).toHaveBeenCalledWith('username', 'adm\\%n');
  });

  it('rejects following yourself without inserting anything', async () => {
    profileMaybeSingle.mockResolvedValue({ data: { user_id: 'me' }, error: null });

    const result = await followUser('myself');

    expect(result).toEqual({ error: "You can't follow yourself." });
    expect(followsInsert).not.toHaveBeenCalled();
  });

  it('inserts follower_id = me, followee_id = target on success', async () => {
    profileMaybeSingle.mockResolvedValue({ data: { user_id: 'them' }, error: null });
    followsInsert.mockResolvedValue({ error: null });

    const result = await followUser('them');

    expect(followsInsert).toHaveBeenCalledWith({ follower_id: 'me', followee_id: 'them' });
    expect(result).toBeUndefined();
  });

  it(
    'surfaces a real error, not a silent success, when the DB rejects the insert -- this is how a ' +
      "direct call against a private target is actually rejected (the INSERT policy's WITH CHECK " +
      'subquery against user_profiles.rankings_visibility, not just the UI hiding the button)',
    async () => {
      profileMaybeSingle.mockResolvedValue({ data: { user_id: 'them' }, error: null });
      followsInsert.mockResolvedValue({
        error: { message: 'new row violates row-level security policy for table "follows"' },
      });

      const result = await followUser('them');

      expect(result).toEqual({ error: "Couldn't follow this user. Their rankings may not be public." });
    }
  );
});

describe('unfollowUser server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'me' } } });
  });

  it('redirects to /login when signed out, without touching the DB', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(unfollowUser('someone')).rejects.toThrow('REDIRECT:/login');
    expect(from).not.toHaveBeenCalled();
  });

  it("returns an error when the target username doesn't resolve to any user", async () => {
    profileMaybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await unfollowUser('nosuchuser');

    expect(result).toEqual({ error: "Couldn't find that user." });
    expect(followsDelete).not.toHaveBeenCalled();
  });

  it('deletes the follow row scoped to follower = me, followee = target', async () => {
    profileMaybeSingle.mockResolvedValue({ data: { user_id: 'them' }, error: null });
    followsDeleteEq2.mockResolvedValue({ error: null });

    const result = await unfollowUser('them');

    expect(followsDelete).toHaveBeenCalled();
    expect(followsDeleteEq1).toHaveBeenCalledWith('follower_id', 'me');
    expect(followsDeleteEq2).toHaveBeenCalledWith('followee_id', 'them');
    expect(result).toBeUndefined();
  });

  it("surfaces the DB's own error rather than swallowing it", async () => {
    profileMaybeSingle.mockResolvedValue({ data: { user_id: 'them' }, error: null });
    followsDeleteEq2.mockResolvedValue({ error: { message: 'something went wrong' } });

    const result = await unfollowUser('them');

    expect(result).toEqual({ error: "Couldn't unfollow this user." });
  });
});
