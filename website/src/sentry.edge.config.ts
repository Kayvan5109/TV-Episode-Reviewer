/**
 * Sentry init for the Edge runtime. Imported conditionally from `src/instrumentation.ts`'s
 * `register()` when `NEXT_RUNTIME === 'edge'`.
 *
 * Nothing in this app opts into the Edge runtime today — Proxy defaults to Node.js in this Next.js
 * version (see `sentry.server.config.ts`'s comment and `src/proxy.ts`), and no Route Handler sets
 * `export const runtime = 'edge'`. This file exists so error capture keeps working automatically if
 * that ever changes, without anyone having to remember to add Sentry support at that point.
 *
 * Same minimal, free-tier-friendly config as `sentry.server.config.ts` — see that file's comment
 * for why `NEXT_PUBLIC_SENTRY_DSN` is read here and why an unset DSN is safe.
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
});
