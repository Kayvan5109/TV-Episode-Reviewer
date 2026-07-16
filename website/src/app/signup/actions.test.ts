import { beforeEach, describe, expect, it, vi } from 'vitest';

// See login/actions.test.ts for why these two modules are stubbed rather than exercised for real.
const signUp = vi.fn();
vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { signUp },
  })),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { signup } from './actions';

function formDataFor(email?: string, password?: string) {
  const formData = new FormData();
  if (email !== undefined) formData.set('email', email);
  if (password !== undefined) formData.set('password', password);
  return formData;
}

describe('signup server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a missing email without calling Supabase', async () => {
    const result = await signup(undefined, formDataFor(undefined, 'secret123'));
    expect(result).toEqual({ status: 'error', error: 'Enter both an email and a password.' });
    expect(signUp).not.toHaveBeenCalled();
  });

  it('rejects a missing password without calling Supabase', async () => {
    const result = await signup(undefined, formDataFor('a@b.com', undefined));
    expect(result).toEqual({ status: 'error', error: 'Enter both an email and a password.' });
    expect(signUp).not.toHaveBeenCalled();
  });

  it("surfaces Supabase's own error message (e.g. a weak-password rule) rather than swallowing it", async () => {
    signUp.mockResolvedValue({ data: null, error: { message: 'Password should be at least 6 characters.' } });

    const result = await signup(undefined, formDataFor('a@b.com', 'weak'));

    expect(result).toEqual({ status: 'error', error: 'Password should be at least 6 characters.' });
  });

  it('returns a "confirm your email" state when signup succeeds but no session comes back (email confirmation is on)', async () => {
    signUp.mockResolvedValue({ data: { session: null, user: { id: 'user-1' } }, error: null });

    const result = await signup(undefined, formDataFor('a@b.com', 'goodpass123'));

    expect(result).toEqual({ status: 'confirmEmail' });
  });

  it('redirects to /dashboard when signup returns a session immediately (email confirmation is off)', async () => {
    signUp.mockResolvedValue({ data: { session: { access_token: 'x' }, user: { id: 'user-1' } }, error: null });

    await expect(signup(undefined, formDataFor('a@b.com', 'goodpass123'))).rejects.toThrow(
      'REDIRECT:/dashboard'
    );
  });
});
