import { beforeEach, describe, expect, it, vi } from 'vitest';

const signOut = vi.fn();
const getUser = vi.fn();
const rpc = vi.fn();

const followRequestsDeleteEq2 = vi.fn();
const followRequestsDeleteEq1 = vi.fn(() => ({ eq: followRequestsDeleteEq2 }));
const followRequestsDelete = vi.fn(() => ({ eq: followRequestsDeleteEq1 }));

const from = vi.fn((table: string) => {
  if (table === 'follow_requests') return { delete: followRequestsDelete };
  throw new Error(`Unexpected table in test: ${table}`);
});

vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { signOut, getUser },
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

import { acceptFollowRequest, denyFollowRequest, logout } from './actions';

describe('logout server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('signs the user out and redirects to /login', async () => {
    signOut.mockResolvedValue({ error: null });

    await expect(logout()).rejects.toThrow('REDIRECT:/login');

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe('acceptFollowRequest server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'me' } } });
  });

  it('redirects to /login when signed out, without touching the DB', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(acceptFollowRequest('requester')).rejects.toThrow('REDIRECT:/login');
    expect(rpc).not.toHaveBeenCalled();
  });

  it(
    'delegates to the accept_follow_request RPC (the atomic, security-invoker DB function) rather ' +
      'than performing the two writes itself',
    async () => {
      rpc.mockResolvedValue({ data: null, error: null });

      const result = await acceptFollowRequest('requester');

      expect(rpc).toHaveBeenCalledWith('accept_follow_request', { p_requester_id: 'requester' });
      expect(result).toBeUndefined();
    }
  );

  it(
    'surfaces the RPC error rather than a silent success -- this is how a spoofed requesterId, or a ' +
      'request that no longer exists, is actually rejected (the function\'s own defensive re-check, ' +
      'not just the UI only ever rendering real pending requests)',
    async () => {
      rpc.mockResolvedValue({ data: null, error: { message: 'No pending follow request from that user to accept' } });

      const result = await acceptFollowRequest('not-a-real-requester');

      expect(result).toEqual({ error: "Couldn't accept that follow request." });
    }
  );
});

describe('denyFollowRequest server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'me' } } });
  });

  it('redirects to /login when signed out, without touching the DB', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(denyFollowRequest('requester')).rejects.toThrow('REDIRECT:/login');
    expect(from).not.toHaveBeenCalled();
  });

  it('deletes the follow_requests row scoped to requester_id = given id, target_id = me', async () => {
    followRequestsDeleteEq2.mockResolvedValue({ error: null });

    const result = await denyFollowRequest('requester');

    expect(followRequestsDelete).toHaveBeenCalled();
    expect(followRequestsDeleteEq1).toHaveBeenCalledWith('requester_id', 'requester');
    expect(followRequestsDeleteEq2).toHaveBeenCalledWith('target_id', 'me');
    expect(result).toBeUndefined();
  });

  it("surfaces the DB's own error rather than swallowing it", async () => {
    followRequestsDeleteEq2.mockResolvedValue({ error: { message: 'something went wrong' } });

    const result = await denyFollowRequest('requester');

    expect(result).toEqual({ error: "Couldn't deny that follow request." });
  });
});
