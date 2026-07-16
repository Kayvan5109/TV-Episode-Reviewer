/**
 * Next.js Proxy (this version's renamed `middleware.ts` — see `website/AGENTS.md` and
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).
 *
 * Three jobs, the first two per `@supabase/ssr`'s standard Next.js pattern:
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
 * 3. Handle Supabase's *default/stock* email-confirmation link pattern (`<site>?code=<uuid>`) via
 *    `exchangeCodeForSession` — see `handleCodeExchange` below for why this lives here rather than
 *    in `src/app/page.tsx`, and why `src/app/auth/confirm/route.ts` (a *different* confirmation-
 *    link pattern) still exists alongside it.
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_ROUTES = ['/dashboard'];
const LOGGED_OUT_ONLY_ROUTES = ['/login', '/signup'];

/**
 * Handles the `?code=<uuid>` query param Supabase's *default/built-in* email provider's stock
 * "Confirm signup" template links to (`{{ .SiteURL }}?code=<uuid>`, landing on the site root).
 *
 * Why this exists alongside `src/app/auth/confirm/route.ts`: that route handles the *other*
 * confirmation-link pattern (`token_hash`/`type`, via `verifyOtp()`), which requires a *custom*
 * "Confirm signup" email template pointing at `/auth/confirm`. Supabase's free tier only honors a
 * custom template while custom SMTP is actively configured (see the changelog linked from
 * `Docs/STATUS.md`'s Bucket 4) — this project tried and gave up on custom SMTP, so it's back on
 * the default provider, which ignores the saved custom template and sends its own stock link
 * instead. That stock link uses the PKCE `code` pattern handled here, not `token_hash`. Both code
 * paths are kept: this one is what's actually reachable today; `/auth/confirm` stays ready for if/
 * when custom SMTP gets sorted out and the custom template can be restored.
 *
 * Why Proxy (not a Server Component page, e.g. `src/app/page.tsx`, which is where this `?code=`
 * lands): a Server Component can only *read* cookies, not write them (see
 * `src/lib/supabase/serverSession.ts`'s doc comment) — session cookies from the exchange would be
 * silently dropped. Proxy is the one place before render that can both intercept the request and
 * write response cookies, exactly like it already does for job 1 above.
 *
 * Security note: `exchangeCodeForSession` is what actually establishes the session — nothing about
 * *who* the resulting user is comes from any other, spoofable part of the request. The `code`
 * itself is a single-use credential (same sensitivity class as a session token) and must never be
 * logged; only the (non-secret) `error` case is used for redirect branching below.
 */
async function handleCodeExchange(request: NextRequest, code: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return NextResponse.redirect(new URL('/login?error=confirmation-failed', request.url));
  }

  // Unlike the main session-refresh flow below, this response is built once, at the end, and
  // returned immediately — no further Supabase calls happen against it in this request — so
  // cookies can just be captured here and copied onto the final redirect in one shot rather than
  // needing to stay in sync with a mutated request/response pair across multiple reads.
  let cookiesToSet: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookies) {
        cookiesToSet = cookies;
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL('/login?error=confirmation-failed', request.url));
  }

  // `new URL('/dashboard', request.url)` discards the original request's query string entirely
  // (it replaces the whole path+search, keeping only protocol/host from `request.url`) — so the
  // single-use `code` is never carried onto the redirect target, and can't be resubmitted via a
  // refresh once the browser lands on `/dashboard`.
  const response = NextResponse.redirect(new URL('/dashboard', request.url));
  cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}

export async function proxy(request: NextRequest) {
  // Early, clearly-separated path: see `handleCodeExchange` above. Deliberately checked before —
  // and entirely independent of — the session-refresh/route-protection logic below, so that logic
  // (heavily trafficked, security-relevant) can't be accidentally entangled with this branch.
  const code = request.nextUrl.searchParams.get('code');
  if (code) {
    return handleCodeExchange(request, code);
  }

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
