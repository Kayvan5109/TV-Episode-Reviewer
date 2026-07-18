import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// See login/actions.test.ts for why this module is stubbed rather than exercised for real.
const resetPasswordForEmail = vi.fn();
vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { resetPasswordForEmail },
  })),
}));

import { forgotPassword } from './actions';

function formDataFor(email?: string) {
  const formData = new FormData();
  if (email !== undefined) formData.set('email', email);
  return formData;
}

describe('forgotPassword server action', () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  });

  it('rejects a missing email without calling Supabase', async () => {
    const result = await forgotPassword(undefined, formDataFor(undefined));
    expect(result).toEqual({ status: 'error', error: 'Enter an email address.' });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only email as missing', async () => {
    const result = await forgotPassword(undefined, formDataFor('   '));
    expect(result).toEqual({ status: 'error', error: 'Enter an email address.' });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('returns an error without calling Supabase when NEXT_PUBLIC_SITE_URL is not configured', async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;

    const result = await forgotPassword(undefined, formDataFor('a@b.com'));

    expect(result).toEqual({
      status: 'error',
      error: 'Password reset is not available right now. Please try again later.',
    });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('calls resetPasswordForEmail with the trimmed email and the site URL as redirectTo', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });

    await forgotPassword(undefined, formDataFor('  a@b.com  '));

    expect(resetPasswordForEmail).toHaveBeenCalledWith('a@b.com', { redirectTo: 'https://example.com' });
  });

  it('returns a generic "sent" state on success, revealing nothing about whether the account exists', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });

    const result = await forgotPassword(undefined, formDataFor('a@b.com'));

    expect(result).toEqual({ status: 'sent' });
  });

  it('surfaces a genuine Supabase error (e.g. rate limiting) rather than swallowing it', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { message: 'Email rate limit exceeded' } });

    const result = await forgotPassword(undefined, formDataFor('a@b.com'));

    expect(result).toEqual({ status: 'error', error: 'Email rate limit exceeded' });
  });
});
