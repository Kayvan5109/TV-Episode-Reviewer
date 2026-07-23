import { redirect } from 'next/navigation';

/**
 * `/settings` was merged into `/dashboard` ("My Profile" -- see Docs/STATUS.md's dated entry for
 * this merge). This route is kept, rather than deleted outright, purely so the one existing external
 * link to it (`/u/[username]`'s old "Edit your profile" link, now pointed straight at `/dashboard`
 * instead -- no need to round-trip through here) and any bookmarks/saved links still work. A plain
 * server-side redirect -- no session check needed here, since `/dashboard` does its own
 * authoritative `getUser()` check regardless of how a request arrives at it.
 */
export default function SettingsPage() {
  redirect('/dashboard');
}
