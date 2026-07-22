import { beforeEach, describe, expect, it, vi } from 'vitest';

// See login/actions.test.ts for why these modules are stubbed rather than exercised for real.
// `createSupabaseServiceClient` is a plain (non-async) factory (see lib/supabase/server.ts),
// unlike the session-aware client -- mocked as such here rather than as an async factory.
const signInWithPassword = vi.fn();
vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { signInWithPassword },
  })),
}));

const createUser = vi.fn();
const deleteUser = vi.fn();
const maybeSingle = vi.fn();
const ilike = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ ilike }));
const insert = vi.fn();
const from = vi.fn(() => ({ select, insert }));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(() => ({
    from,
    auth: { admin: { createUser, deleteUser } },
  })),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { signup } from './actions';

function formDataFor(username?: string, password?: string) {
  const formData = new FormData();
  if (username !== undefined) formData.set('username', username);
  if (password !== undefined) formData.set('password', password);
  return formData;
}

describe('signup server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing profile found, so the happy path can proceed unless a test overrides it.
    maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it('rejects a missing username without calling Supabase', async () => {
    const result = await signup(undefined, formDataFor(undefined, 'secret123'));
    expect(result).toEqual({ status: 'error', error: 'Enter both a username and a password.' });
    expect(createUser).not.toHaveBeenCalled();
  });

  it('rejects a missing password without calling Supabase', async () => {
    const result = await signup(undefined, formDataFor('gooduser', undefined));
    expect(result).toEqual({ status: 'error', error: 'Enter both a username and a password.' });
    expect(createUser).not.toHaveBeenCalled();
  });

  it.each(['ab', 'a'.repeat(21), 'bad name', 'bad-name', 'bad$name'])(
    'rejects an invalid username format (%s) without calling Supabase',
    async (badUsername) => {
      const result = await signup(undefined, formDataFor(badUsername, 'secret123'));
      expect(result).toEqual({
        status: 'error',
        error: 'Usernames must be 3-20 characters, using only letters, numbers, and underscores.',
      });
      expect(createUser).not.toHaveBeenCalled();
    }
  );

  it('accepts a valid username at the boundary lengths', async () => {
    createUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    insert.mockResolvedValue({ error: null });
    signInWithPassword.mockResolvedValue({ error: null });

    await expect(signup(undefined, formDataFor('abc', 'goodpass123'))).rejects.toThrow(
      'REDIRECT:/dashboard'
    );
  });

  it('returns "username taken" from the pre-check without creating an auth account', async () => {
    maybeSingle.mockResolvedValue({ data: { user_id: 'existing-user' }, error: null });

    const result = await signup(undefined, formDataFor('takenname', 'secret123'));

    expect(result).toEqual({ status: 'error', error: 'That username is already taken. Please choose another.' });
    expect(createUser).not.toHaveBeenCalled();
  });

  it('creates the auth account via the Admin API with the synthetic email and email_confirm true', async () => {
    createUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    insert.mockResolvedValue({ error: null });
    signInWithPassword.mockResolvedValue({ error: null });

    await expect(signup(undefined, formDataFor('gooduser', 'goodpass123'))).rejects.toThrow(
      'REDIRECT:/dashboard'
    );

    expect(createUser).toHaveBeenCalledWith({
      email: 'gooduser@users.episode-ranker.internal',
      password: 'goodpass123',
      email_confirm: true,
    });
  });

  it("surfaces Supabase's own error message from admin.createUser (e.g. a weak-password rule) rather than swallowing it", async () => {
    createUser.mockResolvedValue({
      data: null,
      error: { message: 'Password should be at least 6 characters.' },
    });

    const result = await signup(undefined, formDataFor('gooduser', 'weak'));

    expect(result).toEqual({ status: 'error', error: 'Password should be at least 6 characters.' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('inserts the user_profiles row with the expected shape after creating the auth account', async () => {
    createUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    insert.mockResolvedValue({ error: null });
    signInWithPassword.mockResolvedValue({ error: null });

    await expect(signup(undefined, formDataFor('gooduser', 'goodpass123'))).rejects.toThrow(
      'REDIRECT:/dashboard'
    );

    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      username: 'gooduser',
      auth_email: 'gooduser@users.episode-ranker.internal',
      has_real_email: false,
      rankings_visibility: 'private',
    });
  });

  it('rolls back the auth account via admin.deleteUser when the user_profiles insert fails (race condition)', async () => {
    createUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    insert.mockResolvedValue({ error: { message: 'duplicate key value violates unique constraint' } });

    const result = await signup(undefined, formDataFor('gooduser', 'goodpass123'));

    expect(deleteUser).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ status: 'error', error: 'That username is already taken. Please choose another.' });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('signs in with the synthetic email and password, then redirects to /dashboard on success', async () => {
    createUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    insert.mockResolvedValue({ error: null });
    signInWithPassword.mockResolvedValue({ error: null });

    await expect(signup(undefined, formDataFor('gooduser', 'goodpass123'))).rejects.toThrow(
      'REDIRECT:/dashboard'
    );

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'gooduser@users.episode-ranker.internal',
      password: 'goodpass123',
    });
  });

  it('surfaces a sign-in error after the account was already created, without rolling anything back', async () => {
    createUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    insert.mockResolvedValue({ error: null });
    signInWithPassword.mockResolvedValue({ error: { message: 'Something went wrong signing in.' } });

    const result = await signup(undefined, formDataFor('gooduser', 'goodpass123'));

    expect(result).toEqual({ status: 'error', error: 'Something went wrong signing in.' });
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
