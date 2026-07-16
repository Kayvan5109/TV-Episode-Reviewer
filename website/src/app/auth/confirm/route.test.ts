import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyOtp = vi.fn();
vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { verifyOtp },
  })),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
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
  });

  it('redirects to /login with an error when token_hash is missing', async () => {
    await expect(GET(requestFor({ type: 'email' }))).rejects.toThrow(
      'REDIRECT:/login?error=confirmation-link-invalid'
    );
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('redirects to /login with an error when type is missing', async () => {
    await expect(GET(requestFor({ token_hash: 'abc123' }))).rejects.toThrow(
      'REDIRECT:/login?error=confirmation-link-invalid'
    );
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('redirects to /login with an error when Supabase rejects the token', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } });

    await expect(GET(requestFor({ token_hash: 'abc123', type: 'email' }))).rejects.toThrow(
      'REDIRECT:/login?error=confirmation-failed'
    );
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'email', token_hash: 'abc123' });
  });

  it('redirects to /dashboard once the token verifies successfully', async () => {
    verifyOtp.mockResolvedValue({ error: null });

    await expect(GET(requestFor({ token_hash: 'abc123', type: 'email' }))).rejects.toThrow(
      'REDIRECT:/dashboard'
    );
  });
});
