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

// The service-role client used to resolve a username to its auth_email before authentication --
// see actions.ts's doc comment for why this can't go through the session-aware client.
const maybeSingle = vi.fn();
const ilike = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ ilike }));
const from = vi.fn(() => ({ select }));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(() => ({ from })),
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

function formDataFor(identifier?: string, password?: string) {
  const formData = new FormData();
  if (identifier !== undefined) formData.set('identifier', identifier);
  if (password !== undefined) formData.set('password', password);
  return formData;
}

describe('login server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a missing identifier without calling Supabase', async () => {
    const result = await login(undefined, formDataFor(undefined, 'secret123'));
    expect(result).toEqual({ error: 'Enter both a username or email and a password.' });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('rejects a missing password without calling Supabase', async () => {
    const result = await login(undefined, formDataFor('a@b.com', undefined));
    expect(result).toEqual({ error: 'Enter both a username or email and a password.' });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only identifier as missing', async () => {
    const result = await login(undefined, formDataFor('   ', 'secret123'));
    expect(result).toEqual({ error: 'Enter both a username or email and a password.' });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('signs in directly with an email identifier (no username lookup)', async () => {
    signInWithPassword.mockResolvedValue({ error: null });

    await expect(login(undefined, formDataFor('a@b.com', 'correctpass'))).rejects.toThrow(
      'REDIRECT:/dashboard'
    );

    expect(from).not.toHaveBeenCalled();
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'correctpass' });
  });

  it('resolves a username identifier to its auth_email before signing in', async () => {
    maybeSingle.mockResolvedValue({ data: { auth_email: 'gooduser@users.episode-ranker.internal' }, error: null });
    signInWithPassword.mockResolvedValue({ error: null });

    await expect(login(undefined, formDataFor('gooduser', 'correctpass'))).rejects.toThrow(
      'REDIRECT:/dashboard'
    );

    expect(from).toHaveBeenCalledWith('user_profiles');
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'gooduser@users.episode-ranker.internal',
      password: 'correctpass',
    });
  });

  it('fails with the same generic message as a wrong password when the username does not exist', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await login(undefined, formDataFor('nosuchuser', 'correctpass'));

    expect(result).toEqual({ error: 'Invalid login credentials' });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('escapes ILIKE wildcards in the identifier so a partial pattern cannot match a real username', async () => {
    // "adm%n" would, if `%` reached ILIKE unescaped, match any username starting with "adm" and
    // ending with "n" (e.g. a real "admin") without the caller ever knowing the literal username.
    // With the fix, `%` is escaped to a literal character, so the query looks for that exact
    // (nonexistent) string and finds nothing.
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await login(undefined, formDataFor('adm%n', 'correctpass'));

    expect(ilike).toHaveBeenCalledWith('username', 'adm\\%n');
    expect(result).toEqual({ error: 'Invalid login credentials' });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("surfaces Supabase's own error message rather than swallowing it", async () => {
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
