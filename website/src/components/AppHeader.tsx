import Link from 'next/link';

/**
 * Small, persistent header for every authenticated page (`/dashboard`, `/shows/search`,
 * `/shows/[showId]`) — before this existed, a user on e.g. `/shows/search` had no way back to
 * `/dashboard` except editing the URL directly. Deliberately minimal (no design polish): just
 * enough to always have a way back. Not shown on `/login`/`/signup` — no dashboard link makes
 * sense for a logged-out user.
 *
 * A plain shared component (imported into each page individually) rather than a route-group
 * layout: the three authenticated pages already live at their natural URLs
 * (`src/app/dashboard`, `src/app/shows/...`), and restructuring them under a
 * `src/app/(authenticated)/` route group to get a shared `layout.tsx` would touch a lot of
 * existing file paths/imports for what's a one-line-per-page addition. Revisit that if a fourth
 * authenticated page's worth of duplication makes it feel worth it.
 */
export function AppHeader() {
  return (
    <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/20">
      <span className="font-semibold">Episode Ranker</span>
      <Link href="/dashboard" className="text-sm underline underline-offset-2">
        Dashboard
      </Link>
    </header>
  );
}
