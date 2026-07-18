/**
 * Next.js client-side instrumentation entry point — see
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md`.
 *
 * This file convention — not the older `sentry.client.config.ts` pattern some Sentry+Next.js guides
 * still show — is what this Next.js version (16.2) actually loads: Next.js runs it once, after the
 * HTML document loads but before React hydration begins, which is exactly when Sentry needs to
 * install its `window.onerror` / `unhandledrejection` handlers, before user interaction is possible.
 *
 * Same minimal, free-tier-friendly config as the server/edge configs: errors only, tracing
 * effectively off. See `sentry.server.config.ts` for why `NEXT_PUBLIC_SENTRY_DSN` being unset is
 * safe (no-op, no throw) — this is the file where the `NEXT_PUBLIC_` prefix is actually load-bearing,
 * since only `NEXT_PUBLIC_`-prefixed env vars get inlined into the browser bundle.
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
});
