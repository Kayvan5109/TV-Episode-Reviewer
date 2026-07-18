'use client'; // Error boundaries must be Client Components.

import { useEffect } from 'react';

import * as Sentry from '@sentry/nextjs';

import './globals.css';

/**
 * Root-level error boundary — see `node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/error.md`'s "Global Error" section. This app had no error boundary at any
 * level before this file existed, so an uncaught render error anywhere would previously just crash
 * to Next.js's default unstyled error screen with nothing recorded anywhere.
 *
 * This file *replaces* the root layout entirely when it triggers (Next.js's rule, not a choice made
 * here), so per that doc it must define its own `<html>`/`<body>` and re-import global styles —
 * nothing from `src/app/layout.tsx` is inherited.
 *
 * The `Sentry.captureException` call is the only reason this file exists beyond satisfying that
 * doc: Next.js does not report to Sentry on its own. This is what actually gets uncaught client-side
 * React rendering errors (e.g. a bug in `ComparisonPrompt`, `ColdStartPicker`, `RemoveShowButton`, or
 * `ReRankButton` that a nested `error.tsx` doesn't catch first) into Sentry instead of only ever
 * showing up in the browser console.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h2 className="text-lg font-semibold">Something went wrong.</h2>
        <p className="text-sm text-black/60 dark:text-white/60">
          The error has been reported. Try reloading the page.
        </p>
        <button
          onClick={() => reset()}
          className="rounded-md border border-black/20 px-4 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
