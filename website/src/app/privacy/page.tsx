import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy — Episode Ranker',
};

/**
 * Short static privacy notice — content drafted with Kayvan directly (not invented), see
 * Docs/STATUS.md. No personal data beyond account + ranking data, and exactly three third parties;
 * keep this page in sync if either of those ever changes.
 */
export default function PrivacyPage() {
  return (
    <div className="flex flex-1 flex-col items-center p-8">
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <h1 className="text-2xl font-semibold">Privacy</h1>

        <p>
          Episode Ranker collects only what it needs to run your account and store your rankings:
        </p>

        <ul className="list-disc pl-6">
          <li>Your email address and password, used to sign you in.</li>
          <li>
            Your episode rankings and comparisons — the show/episode opinions you record while
            using the app.
          </li>
        </ul>

        <p>That&apos;s it — no analytics, no tracking, and your data is never sold or shared.</p>

        <p>Three third-party services are involved in running the app:</p>

        <ul className="list-disc pl-6">
          <li>
            <span className="font-medium">Supabase</span> — hosts your account and stores your data
            (database and authentication).
          </li>
          <li>
            <span className="font-medium">TMDB</span> — supplies show and episode information
            (titles, posters, genres). TMDB never receives your account or ranking data.
          </li>
          <li>
            <span className="font-medium">Vercel</span> — hosts this website.
          </li>
        </ul>

        <Link href="/" className="text-sm underline underline-offset-2">
          Back home
        </Link>
      </div>
    </div>
  );
}
