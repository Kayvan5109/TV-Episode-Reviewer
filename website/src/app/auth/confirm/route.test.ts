import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyOtp = vi.fn();
vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { verifyOtp },
  })),
}));

// `route.ts` re-reads `next/headers`' `cookies()` after `verifyOtp` to pick up whatever
// `createSupabaseServerClient`'s `setAll` wrote, so it can copy those cookies onto the redirect
// response explicitly (see the bug this guards against in `route.ts`'s docstring). Mocking it
// directly here — independent of the `serverSession` mock above — lets these tests simulate "some
// cookies got written mid-request" without needing a real Supabase client.
const getAll = vi.fn();
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll })),
}));

import { GET } from './route';

function requestFor(params: Record<string, string>) {
  const url = new URL('http://localhost/auth/confirm');
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return new NextRequest(url);
}

describe('GET /auth/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAll.mockReturnValue([]);
  });

  it('redirects to /login with an error when token_hash is missing', async () => {
    const response = await GET(requestFor({ type: 'email' }));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/login?error=confirmation-link-invalid'
    );
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('redirects to /login with an error when type is missing', async () => {
    const response = await GET(requestFor({ token_hash: 'abc123' }));

    expect(response.headers.get('location')).toBe(
      'http://localhost/login?error=confirmation-link-invalid'
    );
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('redirects to /login with an error when Supabase rejects the token', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } });

    const response = await GET(requestFor({ token_hash: 'abc123', type: 'email' }));

    expect(response.headers.get('location')).toBe('http://localhost/login?error=confirmation-failed');
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'email', token_hash: 'abc123' });
  });

  it('redirects to /dashboard once the token verifies successfully', async () => {
    verifyOtp.mockResolvedValue({ error: null });

    const response = await GET(requestFor({ token_hash: 'abc123', type: 'email' }));

    expect(response.headers.get('location')).toBe('http://localhost/dashboard');
  });

  // Regression test for the real bug: clicking a confirmation link left the user logged out on
  // `/login` even though `verifyOtp()` had succeeded server-side, because the session cookies
  // written mid-request weren't ending up on the redirect response the browser actually received.
  // This can't exercise the real browser/cookie-jar behavior (see the report), but it does prove
  // the code path that copies cookies onto the response actually runs and produces `Set-Cookie`
  // headers rather than silently dropping them.
  it('copies every cookie written during verifyOtp onto the /dashboard redirect response', async () => {
    verifyOtp.mockResolvedValue({ error: null });
    getAll.mockReturnValue([
      { name: 'sb-access-token', value: 'access-token-value', path: '/', httpOnly: true, sameSite: 'lax' },
      { name: 'sb-refresh-token', value: 'refresh-token-value', path: '/', httpOnly: true, sameSite: 'lax' },
    ]);

    const response = await GET(requestFor({ token_hash: 'abc123', type: 'email' }));

    expect(response.headers.get('location')).toBe('http://localhost/dashboard');
    const setCookieHeaders = response.headers.getSetCookie();
    expect(setCookieHeaders.some((header) => header.startsWith('sb-access-token=access-token-value'))).toBe(
      true
    );
    expect(setCookieHeaders.some((header) => header.startsWith('sb-refresh-token=refresh-token-value'))).toBe(
      true
    );
  });

  it('does not attach any cookies on the failure redirect', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } });
    getAll.mockReturnValue([{ name: 'should-not-appear', value: 'x' }]);

    const response = await GET(requestFor({ token_hash: 'abc123', type: 'email' }));

    expect(response.headers.getSetCookie()).toHaveLength(0);
  });
});
