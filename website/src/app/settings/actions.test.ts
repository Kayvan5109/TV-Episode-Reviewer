import { beforeEach, describe, expect, it, vi } from 'vitest';

// Same stubbing approach as login/signup's own action tests -- a real cookie-backed session and a
// real Supabase project are both out of reach in a plain Vitest/node environment.
const getUser = vi.fn();
const eq = vi.fn();
const update = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ update }));

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

import { updateProfile } from './actions';

function formDataFor(displayName?: string, visibility?: string) {
  const formData = new FormData();
  if (displayName !== undefined) formData.set('display_name', displayName);
  if (visibility !== undefined) formData.set('rankings_visibility', visibility);
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
