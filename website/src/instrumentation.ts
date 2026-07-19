/**
 * Next.js server-startup instrumentation hook — see
 * `node_modules/next/dist/docs/01-app/02-guides/instrumentation.md` and
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`.
 *
 * Two separate things happen here:
 *
 * 1. `register()` runs once, before the server starts handling requests, in whichever runtime(s)
 *    Next.js uses (Node.js always; Edge only if something opts in). It conditionally loads the
 *    right Sentry config file by runtime, per Next.js's own documented pattern for this hook.
 * 2. `onRequestError` is a separate, optional export Next.js calls itself whenever it catches a
 *    server-side error — covering Server Components, Route Handlers, Server Actions, and Proxy
 *    alike (see that doc's `context.routeType` field). `Sentry.captureRequestError` is the SDK's
 *    ready-made handler for exactly this export; wiring it in is the entire integration on the
 *    server side beyond `Sentry.init` itself. This is a native Next.js mechanism, not something
 *    that depends on wrapping `next.config.ts` with `withSentryConfig` (deliberately not done here —
 *    see the report for why).
 */
import * as Sentry from '@sentry/nextjs';
import { type Instrumentation } from 'next';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

/**
 * Wraps `Sentry.captureRequestError` instead of exporting it directly (`export const
 * onRequestError = Sentry.captureRequestError`) because that direct form silently drops
 * server-side error reports on Vercel's Node.js runtime.
 *
 * `Sentry.captureRequestError` itself is synchronous — by the time it returns, the exception has
 * already been captured and queued. But internally it also kicks off an unawaited
 * `responseEnd.waitUntil(responseEnd.flushSafelyWithTimeout())`, and that `waitUntil` (from
 * `@sentry/core`'s `vercelWaitUntil`) only does anything when `typeof EdgeRuntime === 'string'` —
 * i.e. Vercel's Edge runtime. This app's Server Actions/Route Handlers/Server Components run on
 * the standard Node.js runtime, so that flush is a no-op there, and Vercel freezes the function
 * right after the response is sent — before the abandoned flush promise ever gets a chance to send
 * the event to Sentry's ingest API.
 *
 * The fix: call `captureRequestError` (capture already happens synchronously), then explicitly
 * `await Sentry.flush(...)` ourselves so Next.js keeps the function alive until the event is
 * actually sent (or the timeout elapses). Do not "simplify" this back to the direct export.
 */
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  Sentry.captureRequestError(...args);
  await Sentry.flush(2000);
};
