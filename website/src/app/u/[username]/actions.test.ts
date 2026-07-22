import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const rpc = vi.fn();

const followsInsert = vi.fn();
const followsDeleteEq2 = vi.fn();
const followsDeleteEq1 = vi.fn(() => ({ eq: followsDeleteEq2 }));
const followsDelete = vi.fn(() => ({ eq: followsDeleteEq1 }));
const followsSelectMaybeSingle = vi.fn();
const followsSelectEq2 = vi.fn(() => ({ maybeSingle: followsSelectMaybeSingle }));
const followsSelectEq1 = vi.fn(() => ({ eq: followsSelectEq2 }));
const followsSelect = vi.fn(() => ({ eq: followsSelectEq1 }));

const followRequestsInsert = vi.fn();
const followRequestsDeleteEq2 = vi.fn();
const followRequestsDeleteEq1 = vi.fn(() => ({ eq: followRequestsDeleteEq2 }));
const followRequestsDelete = vi.fn(() => ({ eq: followRequestsDeleteEq1 }));

const from = vi.fn((table: string) => {
  if (table === 'follows') return { insert: followsInsert, delete: followsDelete, select: followsSelect };
  if (table === 'follow_requests') return { insert: followRequestsInsert, delete: followRequestsDelete };
  throw new Error(`Unexpected table in test: ${table}`);
});

vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser },
    from,
    rpc,
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

import { cancelFollowRequest, followUser, requestToFollow, unfollowUser } from './actions';

const publicTarget = { user_id: 'them', username: 'them', display_name: null, rankings_visibility: 'public' };
const privateTarget = { user_id: 'them', username: 'them', display_name: null, rankings_visibility: 'private' };

describe('followUser server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'me' } } });
  });

  it('redirects to /login when signed out, without touching the DB', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(followUser('someone')).rejects.toThrow('REDIRECT:/login');
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns an error when the target username doesn't resolve to any user", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const result = await followUser('nosuchuser');

    expect(result).toEqual({ error: "Couldn't find that user." });
    expect(followsInsert).not.toHaveBeenCalled();
  });

  it('resolves the target via the profile_identity_by_username safe-projection RPC', async () => {
    rpc.mockResolvedValue({ data: [publicTarget], error: null });
    followsInsert.mockResolvedValue({ error: null });

    await followUser('them');

    expect(rpc).toHaveBeenCalledWith('profile_identity_by_username', { p_username: 'them' });
  });

  it('rejects following yourself without inserting anything', async () => {
    rpc.mockResolvedValue({ data: [{ ...publicTarget, user_id: 'me' }], error: null });

    const result = await followUser('myself');

    expect(result).toEqual({ error: "You can't follow yourself." });
    expect(followsInsert).not.toHaveBeenCalled();
  });

  it('inserts follower_id = me, followee_id = target on success', async () => {
    rpc.mockResolvedValue({ data: [publicTarget], error: null });
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
      rpc.mockResolvedValue({ data: [privateTarget], error: null });
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
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns an error when the target username doesn't resolve to any user", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const result = await unfollowUser('nosuchuser');

    expect(result).toEqual({ error: "Couldn't find that user." });
    expect(followsDelete).not.toHaveBeenCalled();
  });

  it('deletes the follow row scoped to follower = me, followee = target, even for a now-private target', async () => {
    rpc.mockResolvedValue({ data: [privateTarget], error: null });
    followsDeleteEq2.mockResolvedValue({ error: null });

    const result = await unfollowUser('them');

    expect(followsDelete).toHaveBeenCalled();
    expect(followsDeleteEq1).toHaveBeenCalledWith('follower_id', 'me');
    expect(followsDeleteEq2).toHaveBeenCalledWith('followee_id', 'them');
    expect(result).toBeUndefined();
  });

  it("surfaces the DB's own error rather than swallowing it", async () => {
    rpc.mockResolvedValue({ data: [privateTarget], error: null });
    followsDeleteEq2.mockResolvedValue({ error: { message: 'something went wrong' } });

    const result = await unfollowUser('them');

    expect(result).toEqual({ error: "Couldn't unfollow this user." });
  });
});

describe('requestToFollow server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'me' } } });
    // Not already following, by default -- individual tests override when they need the opposite.
    followsSelectMaybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it('redirects to /login when signed out, without touching the DB', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(requestToFollow('someone')).rejects.toThrow('REDIRECT:/login');
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns an error when the target username doesn't resolve to any user", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const result = await requestToFollow('nosuchuser');

    expect(result).toEqual({ error: "Couldn't find that user." });
    expect(followRequestsInsert).not.toHaveBeenCalled();
  });

  it('rejects requesting to follow yourself without inserting anything', async () => {
    rpc.mockResolvedValue({ data: [{ ...privateTarget, user_id: 'me' }], error: null });

    const result = await requestToFollow('myself');

    expect(result).toEqual({ error: "You can't follow yourself." });
    expect(followRequestsInsert).not.toHaveBeenCalled();
  });

  it('inserts requester_id = me, target_id = target into follow_requests when the target is private', async () => {
    rpc.mockResolvedValue({ data: [privateTarget], error: null });
    followRequestsInsert.mockResolvedValue({ error: null });

    const result = await requestToFollow('them');

    expect(followRequestsInsert).toHaveBeenCalledWith({ requester_id: 'me', target_id: 'them' });
    expect(followsInsert).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it(
    "routes a public target through the normal instant-follow path instead of inserting a " +
      "follow_requests row -- the two paths are mutually exclusive by the target's current visibility",
    async () => {
      rpc.mockResolvedValue({ data: [publicTarget], error: null });
      followsInsert.mockResolvedValue({ error: null });

      const result = await requestToFollow('them');

      expect(followsInsert).toHaveBeenCalledWith({ follower_id: 'me', followee_id: 'them' });
      expect(followRequestsInsert).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    }
  );

  it('surfaces the DB error when the insert is rejected (e.g. a duplicate pending request)', async () => {
    rpc.mockResolvedValue({ data: [privateTarget], error: null });
    followRequestsInsert.mockResolvedValue({
      error: { message: 'duplicate key value violates unique constraint "follow_requests_pkey"' },
    });

    const result = await requestToFollow('them');

    expect(result).toEqual({ error: "Couldn't send a follow request." });
  });

  it(
    'rejects with a clear error, without inserting anything, when the caller already has an ' +
      "accepted follows row for this target -- an existing accepted follower is never asked to " +
      're-request (this is the defensive backstop for a direct call bypassing the UI, which already ' +
      "hides the request button in this state)",
    async () => {
      rpc.mockResolvedValue({ data: [privateTarget], error: null });
      followsSelectMaybeSingle.mockResolvedValue({ data: { follower_id: 'me' }, error: null });

      const result = await requestToFollow('them');

      expect(result).toEqual({ error: "You're already following this user." });
      expect(followRequestsInsert).not.toHaveBeenCalled();
      expect(followsInsert).not.toHaveBeenCalled();
    }
  );
});

describe('cancelFollowRequest server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'me' } } });
  });

  it('redirects to /login when signed out, without touching the DB', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(cancelFollowRequest('someone')).rejects.toThrow('REDIRECT:/login');
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns an error when the target username doesn't resolve to any user", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const result = await cancelFollowRequest('nosuchuser');

    expect(result).toEqual({ error: "Couldn't find that user." });
    expect(followRequestsDelete).not.toHaveBeenCalled();
  });

  it('deletes the follow_requests row scoped to requester = me, target = target', async () => {
    rpc.mockResolvedValue({ data: [privateTarget], error: null });
    followRequestsDeleteEq2.mockResolvedValue({ error: null });

    const result = await cancelFollowRequest('them');

    expect(followRequestsDelete).toHaveBeenCalled();
    expect(followRequestsDeleteEq1).toHaveBeenCalledWith('requester_id', 'me');
    expect(followRequestsDeleteEq2).toHaveBeenCalledWith('target_id', 'them');
    expect(result).toBeUndefined();
  });

  it("surfaces the DB's own error rather than swallowing it", async () => {
    rpc.mockResolvedValue({ data: [privateTarget], error: null });
    followRequestsDeleteEq2.mockResolvedValue({ error: { message: 'something went wrong' } });

    const result = await cancelFollowRequest('them');

    expect(result).toEqual({ error: "Couldn't cancel that request." });
  });
});
