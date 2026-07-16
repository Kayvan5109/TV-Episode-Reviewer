import { beforeEach, describe, expect, it, vi } from 'vitest';

const signOut = vi.fn();
vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { signOut },
  })),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { logout } from './actions';

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
