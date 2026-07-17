import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `proxy.ts` calls `createServerClient` directly (there's no `serverSession.ts`-style wrapper for
// it — Proxy needs its own cookie plumbing tied to the request/response pair). Mock it at this
// level so both the code-exchange branch and the existing session-refresh/route-protection branch
// can be driven independently, the same way `auth/confirm/route.test.ts` mocks one level up.
const getUser = vi.fn();
const exchangeCodeForSession = vi.fn();
type CapturedSetAll = (
  cookies: { name: string; value: string; options: Record<string, unknown> }[],
  headers: Record<string, string>
) => void;
let capturedSetAll: CapturedSetAll | null = null;

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn((_url: string, _key: string, options: { cookies: { setAll: CapturedSetAll } }) => {
    capturedSetAll = options.cookies.setAll;
    return {
      auth: { getUser, exchangeCodeForSession },
    };
  }),
}));

import { proxy } from './proxy';

function requestFor(path: string, params: Record<string, string> = {}) {
  const url = new URL(path, 'http://localhost');
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return new NextRequest(url);
}

describe('proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedSetAll = null;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable-key';
    getUser.mockResolvedValue({ data: { user: null } });
  });

  describe('code-exchange branch (`?code=`, Supabase\'s default/stock confirmation-link pattern)', () => {
    it('calls exchangeCodeForSession with the code param and skips the route-protection logic entirely', async () => {
      exchangeCodeForSession.mockResolvedValue({ error: null });

      const response = await proxy(requestFor('/', { code: 'the-code-value' }));

      expect(exchangeCodeForSession).toHaveBeenCalledWith('the-code-value');
      expect(getUser).not.toHaveBeenCalled();
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('http://localhost/dashboard');
    });

    it('takes the code-exchange branch even on an otherwise-protected path, since the code param is what matters', async () => {
      exchangeCodeForSession.mockResolvedValue({ error: null });

      const response = await proxy(requestFor('/dashboard', { code: 'abc123' }));

      expect(exchangeCodeForSession).toHaveBeenCalledWith('abc123');
      expect(response.headers.get('location')).toBe('http://localhost/dashboard');
    });

    it('copies every cookie written during the exchange onto the /dashboard redirect, and the redirect target has no query string (the single-use code is not carried over)', async () => {
      exchangeCodeForSession.mockImplementation(async () => {
        capturedSetAll?.(
          [
            { name: 'sb-access-token', value: 'access-token-value', options: { path: '/', httpOnly: true } },
            { name: 'sb-refresh-token', value: 'refresh-token-value', options: { path: '/', httpOnly: true } },
          ],
          {}
        );
        return { error: null };
      });

      const response = await proxy(requestFor('/', { code: 'abc123' }));

      expect(response.headers.get('location')).toBe('http://localhost/dashboard');
      const setCookieHeaders = response.headers.getSetCookie();
      expect(
        setCookieHeaders.some((header) => header.startsWith('sb-access-token=access-token-value'))
      ).toBe(true);
      expect(
        setCookieHeaders.some((header) => header.startsWith('sb-refresh-token=refresh-token-value'))
      ).toBe(true);
    });

    it('redirects to /login?error=confirmation-failed when the exchange fails, attaching no cookies', async () => {
      exchangeCodeForSession.mockImplementation(async () => {
        capturedSetAll?.([{ name: 'should-not-appear', value: 'x', options: {} }], {});
        return { error: { message: 'invalid or expired code' } };
      });

      const response = await proxy(requestFor('/', { code: 'bad-code' }));

      expect(response.headers.get('location')).toBe('http://localhost/login?error=confirmation-failed');
      expect(response.headers.getSetCookie()).toHaveLength(0);
    });

    it('redirects to /login?error=confirmation-failed without calling exchangeCodeForSession when env vars are missing', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;

      const response = await proxy(requestFor('/', { code: 'abc123' }));

      expect(exchangeCodeForSession).not.toHaveBeenCalled();
      expect(response.headers.get('location')).toBe('http://localhost/login?error=confirmation-failed');
    });
  });

  describe('session refresh / route protection (no `code` param)', () => {
    it('does not attempt a code exchange when there is no code param', async () => {
      await proxy(requestFor('/'));

      expect(exchangeCodeForSession).not.toHaveBeenCalled();
      expect(getUser).toHaveBeenCalled();
    });

    it('redirects signed-out users away from /dashboard', async () => {
      getUser.mockResolvedValue({ data: { user: null } });

      const response = await proxy(requestFor('/dashboard'));

      expect(response.headers.get('location')).toBe('http://localhost/login');
    });

    it('lets a signed-in user through to /login without redirecting (re-authenticating never requires signing out first)', async () => {
      getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const response = await proxy(requestFor('/login'));

      expect(response.headers.get('location')).toBeNull();
    });

    it('redirects signed-in users away from /signup', async () => {
      getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const response = await proxy(requestFor('/signup'));

      expect(response.headers.get('location')).toBe('http://localhost/dashboard');
    });

    it('lets a signed-out user through to a public route without redirecting', async () => {
      getUser.mockResolvedValue({ data: { user: null } });

      const response = await proxy(requestFor('/'));

      expect(response.headers.get('location')).toBeNull();
    });

    it('lets a signed-in user through to /dashboard without redirecting', async () => {
      getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

      const response = await proxy(requestFor('/dashboard'));

      expect(response.headers.get('location')).toBeNull();
    });
  });
});
