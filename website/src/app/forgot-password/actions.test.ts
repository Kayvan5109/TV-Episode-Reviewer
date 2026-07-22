import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// See login/actions.test.ts for why this module is stubbed rather than exercised for real.
const resetPasswordForEmail = vi.fn();
vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { resetPasswordForEmail },
  })),
}));

// The service-role client used to resolve a username to its auth_email/has_real_email before
// authentication -- see actions.ts's doc comment for why this can't go through the session-aware
// client.
const maybeSingle = vi.fn();
const ilike = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ ilike }));
const from = vi.fn(() => ({ select }));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: vi.fn(() => ({ from })),
}));

import { forgotPassword } from './actions';

function formDataFor(identifier?: string) {
  const formData = new FormData();
  if (identifier !== undefined) formData.set('identifier', identifier);
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

  it('rejects a missing identifier without calling Supabase', async () => {
    const result = await forgotPassword(undefined, formDataFor(undefined));
    expect(result).toEqual({ status: 'error', error: 'Enter your username or email address.' });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only identifier as missing', async () => {
    const result = await forgotPassword(undefined, formDataFor('   '));
    expect(result).toEqual({ status: 'error', error: 'Enter your username or email address.' });
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

  it('calls resetPasswordForEmail with the trimmed email and the site URL as redirectTo, given an email directly', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });

    await forgotPassword(undefined, formDataFor('  a@b.com  '));

    expect(from).not.toHaveBeenCalled();
    expect(resetPasswordForEmail).toHaveBeenCalledWith('a@b.com', { redirectTo: 'https://example.com' });
  });

  it('returns a generic "sent" state on success given an email directly, revealing nothing about whether the account exists', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });

    const result = await forgotPassword(undefined, formDataFor('a@b.com'));

    expect(result).toEqual({ status: 'sent' });
  });

  it('surfaces a genuine Supabase error (e.g. rate limiting) rather than swallowing it', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { message: 'Email rate limit exceeded' } });

    const result = await forgotPassword(undefined, formDataFor('a@b.com'));

    expect(result).toEqual({ status: 'error', error: 'Email rate limit exceeded' });
  });

  it('resolves a username with has_real_email true to its auth_email and sends a reset link, "sent" state', async () => {
    maybeSingle.mockResolvedValue({
      data: { auth_email: 'gooduser@users.episode-ranker.internal', has_real_email: true },
      error: null,
    });
    resetPasswordForEmail.mockResolvedValue({ error: null });

    const result = await forgotPassword(undefined, formDataFor('gooduser'));

    expect(resetPasswordForEmail).toHaveBeenCalledWith('gooduser@users.episode-ranker.internal', {
      redirectTo: 'https://example.com',
    });
    expect(result).toEqual({ status: 'sent' });
  });

  it('returns a "noRecovery" state for a username-backed account with has_real_email false, without calling resetPasswordForEmail', async () => {
    maybeSingle.mockResolvedValue({
      data: { auth_email: 'gooduser@users.episode-ranker.internal', has_real_email: false },
      error: null,
    });

    const result = await forgotPassword(undefined, formDataFor('gooduser'));

    expect(result).toEqual({ status: 'noRecovery' });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('returns a distinct error for an unrecognized username, revealing (deliberately) that it does not exist', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await forgotPassword(undefined, formDataFor('nosuchuser'));

    expect(result).toEqual({ status: 'error', error: 'No account found with that username.' });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('escapes ILIKE wildcards in the identifier so a partial pattern cannot match a real username', async () => {
    // "good%r" would, if `%` reached ILIKE unescaped, match any username starting with "good" and
    // ending with "r" (e.g. a real "gooduser") without the caller ever knowing the literal
    // username -- and could trigger a real reset email to that account. With the fix, `%` is
    // escaped to a literal character, so the query looks for that exact (nonexistent) string and
    // finds nothing.
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await forgotPassword(undefined, formDataFor('good%r'));

    expect(ilike).toHaveBeenCalledWith('username', 'good\\%r');
    expect(result).toEqual({ status: 'error', error: 'No account found with that username.' });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
