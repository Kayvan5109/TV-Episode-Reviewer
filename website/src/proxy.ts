/**
 * Next.js Proxy (this version's renamed `middleware.ts` — see `website/AGENTS.md` and
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).
 *
 * Two jobs, both per `@supabase/ssr`'s standard Next.js pattern:
 *
 * 1. Refresh the Supabase session on every request. Server Components can only *read* cookies
 *    (see `src/lib/supabase/serverSession.ts`), so if nothing ever refreshes an expiring access
 *    token, users get silently logged out. This is the one place with full read/write access to
 *    both the request and the response, so it's mandatory, not optional.
 * 2. Optimistic route protection: redirect signed-out users away from `/dashboard`, and redirect
 *    signed-in users away from `/login` and `/signup`. This is a fast, cookie-only check (no
 *    database round-trip beyond Supabase's own token validation) — the dashboard page itself does
 *    its own authoritative check too (see `src/app/dashboard/page.tsx`), since Proxy running on
 *    every route is only ever a first line of defense, not the only one (Next.js's authentication
 *    guide is explicit about this).
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_ROUTES = ['/dashboard'];
const LOGGED_OUT_ONLY_ROUTES = ['/login', '/signup'];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    // Misconfigured environment: let the request through rather than breaking every route. The
    // pages/actions that actually touch Supabase will surface a clear error instead.
    return response;
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Cookies must be set on both the request (so this same Proxy invocation sees the fresh
        // values) and the response (so the browser gets them) — see @supabase/ssr's docs.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Do not add logic between `createServerClient` and `getUser()` — a bug there can cause a user
  // to be randomly logged out. `getUser()` (not `getSession()`) is used because it revalidates the
  // token against Supabase Auth rather than trusting the cookie's contents as-is.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtectedRoute = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  const isLoggedOutOnlyRoute = LOGGED_OUT_ONLY_ROUTES.some((route) => pathname.startsWith(route));

  if (isProtectedRoute && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isLoggedOutOnlyRoute && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets, image optimization, and the TMDB proxy API (which
    // is unauthenticated and doesn't need session refresh on every call).
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
