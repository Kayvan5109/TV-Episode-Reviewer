import { beforeEach, describe, expect, it, vi } from 'vitest';

// Same stubbing approach as login/signup's own action tests -- a real cookie-backed session and a
// real Supabase project are both out of reach in a plain Vitest/node environment.
const getUser = vi.fn();
const eq = vi.fn();
const update = vi.fn(() => ({ eq }));
const insert = vi.fn();
const from = vi.fn(() => ({ update, insert }));

vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser },
    from,
  })),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { claimUsername, updateAvatar, updateProfile } from './actions';

function formDataFor(displayName?: string, visibility?: string) {
  const formData = new FormData();
  if (displayName !== undefined) formData.set('display_name', displayName);
  if (visibility !== undefined) formData.set('rankings_visibility', visibility);
  return formData;
}

function claimFormDataFor(username?: string) {
  const formData = new FormData();
  if (username !== undefined) formData.set('username', username);
  return formData;
}

describe('updateProfile server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    eq.mockResolvedValue({ error: null });
  });

  it('redirects to /login when signed out, without writing', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(updateProfile(undefined, formDataFor('Name', 'private'))).rejects.toThrow('REDIRECT:/login');
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects an invalid visibility value without writing', async () => {
    const result = await updateProfile(undefined, formDataFor('Name', 'sortof'));
    expect(result).toEqual({ status: 'error', error: 'Invalid visibility value.' });
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects a missing visibility value without writing', async () => {
    const result = await updateProfile(undefined, formDataFor('Name', undefined));
    expect(result).toEqual({ status: 'error', error: 'Invalid visibility value.' });
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects a display name over the max length without writing', async () => {
    const result = await updateProfile(undefined, formDataFor('x'.repeat(41), 'private'));
    expect(result).toEqual({
      status: 'error',
      error: 'Display name must be 40 characters or fewer.',
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('accepts a display name at the max length boundary', async () => {
    const result = await updateProfile(undefined, formDataFor('x'.repeat(40), 'private'));
    expect(result).toEqual({ status: 'success' });
  });

  it('updates display_name and rankings_visibility scoped to the signed-in user', async () => {
    const result = await updateProfile(undefined, formDataFor('Kayvan', 'public'));

    expect(from).toHaveBeenCalledWith('user_profiles');
    expect(update).toHaveBeenCalledWith({ display_name: 'Kayvan', rankings_visibility: 'public' });
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(result).toEqual({ status: 'success' });
  });

  it('clears display_name to null when submitted blank (falls back to username elsewhere in the app)', async () => {
    await updateProfile(undefined, formDataFor('', 'private'));
    expect(update).toHaveBeenCalledWith({ display_name: null, rankings_visibility: 'private' });
  });

  it('trims whitespace from display_name before saving', async () => {
    await updateProfile(undefined, formDataFor('  Kayvan  ', 'private'));
    expect(update).toHaveBeenCalledWith({ display_name: 'Kayvan', rankings_visibility: 'private' });
  });

  it('treats a whitespace-only display_name as blank (clears to null)', async () => {
    await updateProfile(undefined, formDataFor('   ', 'private'));
    expect(update).toHaveBeenCalledWith({ display_name: null, rankings_visibility: 'private' });
  });

  it("surfaces the DB's own error (e.g. a rejected update) rather than swallowing it", async () => {
    eq.mockResolvedValue({ error: { message: 'new row violates row-level security policy' } });
    const result = await updateProfile(undefined, formDataFor('Name', 'private'));
    expect(result).toEqual({ status: 'error', error: 'new row violates row-level security policy' });
  });
});

describe('claimUsername server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A legacy, pre-user_profiles account: signed in, real email already on auth.users.email (the
    // scenario this action exists for -- see actions.ts's claimUsername doc comment).
    getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'legacy@example.com' } } });
    insert.mockResolvedValue({ error: null });
  });

  it('redirects to /login when signed out, without writing', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(claimUsername(undefined, claimFormDataFor('newuser'))).rejects.toThrow('REDIRECT:/login');
    expect(from).not.toHaveBeenCalled();
  });

  it.each(['ab', 'a'.repeat(21), 'bad name', 'bad-name', 'bad$name'])(
    'rejects an invalid username format (%s) without writing',
    async (badUsername) => {
      const result = await claimUsername(undefined, claimFormDataFor(badUsername));
      expect(result).toEqual({
        status: 'error',
        error: 'Usernames must be 3-20 characters, using only letters, numbers, and underscores.',
      });
      expect(from).not.toHaveBeenCalled();
    }
  );

  it('rejects a missing username without writing', async () => {
    const result = await claimUsername(undefined, claimFormDataFor(undefined));
    expect(result).toEqual({
      status: 'error',
      error: 'Usernames must be 3-20 characters, using only letters, numbers, and underscores.',
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('inserts the user_profiles row with the real auth email and has_real_email true', async () => {
    const result = await claimUsername(undefined, claimFormDataFor('newuser'));

    expect(from).toHaveBeenCalledWith('user_profiles');
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      username: 'newuser',
      auth_email: 'legacy@example.com',
      has_real_email: true,
      rankings_visibility: 'private',
    });
    expect(result).toEqual({ status: 'success' });
  });

  it('trims whitespace from the submitted username before validating and saving', async () => {
    await claimUsername(undefined, claimFormDataFor('  newuser  '));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ username: 'newuser' }));
  });

  it('rejects with a clean "username taken" error on a unique-constraint violation (race condition), not the raw DB error', async () => {
    insert.mockResolvedValue({
      error: {
        code: '23505',
        message:
          'duplicate key value violates unique constraint "user_profiles_username_lower_idx"',
      },
    });

    const result = await claimUsername(undefined, claimFormDataFor('takenname'));

    expect(result).toEqual({
      status: 'error',
      error: 'That username is already taken. Please choose another.',
    });
  });

  it("surfaces the DB's own error for a non-uniqueness failure (e.g. a rejected RLS policy) rather than mislabeling it as taken", async () => {
    insert.mockResolvedValue({
      error: { code: '42501', message: 'new row violates row-level security policy' },
    });

    const result = await claimUsername(undefined, claimFormDataFor('newuser'));

    expect(result).toEqual({ status: 'error', error: 'new row violates row-level security policy' });
  });

  it('rejects when the signed-in user has no email on file, without writing', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: undefined } } });

    const result = await claimUsername(undefined, claimFormDataFor('newuser'));

    expect(result).toEqual({ status: 'error', error: 'Something went wrong. Please try again.' });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('updateAvatar server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    eq.mockResolvedValue({ error: null });
  });

  it('redirects to /login when signed out, without writing', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(updateAvatar('https://example.com/avatars/user-1/avatar-1.png')).rejects.toThrow(
      'REDIRECT:/login'
    );
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects an empty avatar URL without writing', async () => {
    const result = await updateAvatar('');
    expect(result).toEqual({ status: 'error', error: 'Invalid avatar URL.' });
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only avatar URL without writing', async () => {
    const result = await updateAvatar('   ');
    expect(result).toEqual({ status: 'error', error: 'Invalid avatar URL.' });
    expect(from).not.toHaveBeenCalled();
  });

  it('updates avatar_url on user_profiles scoped to the signed-in user', async () => {
    const result = await updateAvatar('https://example.com/avatars/user-1/avatar-1.png');

    expect(from).toHaveBeenCalledWith('user_profiles');
    expect(update).toHaveBeenCalledWith({ avatar_url: 'https://example.com/avatars/user-1/avatar-1.png' });
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(result).toEqual({ status: 'success' });
  });

  it("surfaces the DB's own error (e.g. a rejected update) rather than swallowing it", async () => {
    eq.mockResolvedValue({ error: { message: 'new row violates row-level security policy' } });
    const result = await updateAvatar('https://example.com/avatars/user-1/avatar-1.png');
    expect(result).toEqual({ status: 'error', error: 'new row violates row-level security policy' });
  });
});
