import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stub out the session-aware Supabase client factory so these tests exercise the action's own
// validation/error-surfacing/redirect logic without touching real cookies or a real Supabase
// project (both of which are out of reach in a plain Vitest/node environment — see this task's
// report for what still needs a hands-on browser + live Supabase check).
const signInWithPassword = vi.fn();
vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { signInWithPassword },
  })),
}));

// `redirect()` normally throws a special Next.js-internal error caught by the framework runtime.
// Outside of that runtime (i.e. in these tests) there's no such runtime to catch it, so it's
// stubbed to throw a plain, assertable error instead.
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { login } from './actions';

function formDataFor(email?: string, password?: string) {
  const formData = new FormData();
  if (email !== undefined) formData.set('email', email);
  if (password !== undefined) formData.set('password', password);
  return formData;
}

describe('login server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a missing email without calling Supabase', async () => {
    const result = await login(undefined, formDataFor(undefined, 'secret123'));
    expect(result).toEqual({ error: 'Enter both an email and a password.' });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('rejects a missing password without calling Supabase', async () => {
    const result = await login(undefined, formDataFor('a@b.com', undefined));
    expect(result).toEqual({ error: 'Enter both an email and a password.' });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only email as missing', async () => {
    const result = await login(undefined, formDataFor('   ', 'secret123'));
    expect(result).toEqual({ error: 'Enter both an email and a password.' });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('surfaces Supabase\'s own error message rather than swallowing it', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });

    const result = await login(undefined, formDataFor('a@b.com', 'wrongpass'));

    expect(result).toEqual({ error: 'Invalid login credentials' });
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'wrongpass' });
  });

  it('redirects to /dashboard on a successful sign-in', async () => {
    signInWithPassword.mockResolvedValue({ error: null });

    await expect(login(undefined, formDataFor('a@b.com', 'correctpass'))).rejects.toThrow(
      'REDIRECT:/dashboard'
    );
  });
});
