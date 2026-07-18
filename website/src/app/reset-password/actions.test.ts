import { beforeEach, describe, expect, it, vi } from 'vitest';

// See login/actions.test.ts for why this module is stubbed rather than exercised for real.
const updateUser = vi.fn();
vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { updateUser },
  })),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { resetPassword } from './actions';

function formDataFor(password?: string) {
  const formData = new FormData();
  if (password !== undefined) formData.set('password', password);
  return formData;
}

describe('resetPassword server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a missing password without calling Supabase', async () => {
    const result = await resetPassword(undefined, formDataFor(undefined));
    expect(result).toEqual({ error: 'Enter a new password.' });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("surfaces Supabase's own error message rather than swallowing it", async () => {
    updateUser.mockResolvedValue({ error: { message: 'Auth session missing!' } });

    const result = await resetPassword(undefined, formDataFor('newpass123'));

    expect(result).toEqual({ error: 'Auth session missing!' });
    expect(updateUser).toHaveBeenCalledWith({ password: 'newpass123' });
  });

  it('redirects to /dashboard on a successful password update', async () => {
    updateUser.mockResolvedValue({ error: null });

    await expect(resetPassword(undefined, formDataFor('newpass123'))).rejects.toThrow('REDIRECT:/dashboard');
  });
});
