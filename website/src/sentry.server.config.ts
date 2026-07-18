/**
 * Sentry init for the Node.js runtime. Imported conditionally from `src/instrumentation.ts`'s
 * `register()` (see that file's doc comment) when `NEXT_RUNTIME === 'nodejs'` — this covers Server
 * Components, Route Handlers, Server Actions, and Proxy (which defaults to the Node.js runtime in
 * this Next.js version — see `src/proxy.ts`'s top-of-file comment).
 *
 * Kept deliberately minimal for Sentry's free tier: errors only, no session replay, tracing
 * effectively off (`tracesSampleRate: 0`).
 *
 * `NEXT_PUBLIC_SENTRY_DSN` — despite the `NEXT_PUBLIC_` prefix — is read here too (not just in the
 * client config) so one env var covers both; the DSN isn't a secret (Sentry's own docs: it can only
 * submit events, never read them), so there's no downside to it also being inlined into the client
 * bundle. See `.env.local.example`.
 *
 * `Sentry.init` with an empty/undefined `dsn` is a documented no-op — it logs a debug-only warning
 * and never sends events — so this is safe to leave unset in local dev and in CI (this repo's test
 * suite never sets it).
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
});
