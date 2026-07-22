/**
 * Shared username rules for username+password signup (Docs/STATUS.md Bucket 1 item 1).
 *
 * Supabase Auth is fundamentally email-based -- there's no native username-only signup. The
 * workaround: every username-backed account gets a synthetic, unreachable email generated from its
 * username (`{lowercased-username}@users.episode-ranker.internal`). `.internal` is an IANA-reserved
 * non-routable TLD (RFC 6761), so this address can never actually be contacted -- exactly what's
 * wanted here, since it exists only to satisfy Supabase Auth's schema, never to send mail.
 *
 * Format: 3-20 characters, letters/digits/underscores only. Mirrored by a CHECK constraint on
 * `user_profiles.username` in supabase/migrations/20260722000000_user_profiles.sql (defense in
 * depth -- this module is the authoritative, server-side check; the DB constraint is a backstop,
 * not the primary validation).
 */

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

const SYNTHETIC_EMAIL_DOMAIN = 'users.episode-ranker.internal';

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

/** Generates the synthetic Supabase Auth email for a given username. Always lowercases first, so
 * this stays consistent with `user_profiles`' case-insensitive uniqueness (a unique index on
 * `lower(username)`, not `citext` -- see that migration's header comment for why). */
export function syntheticEmailForUsername(username: string): string {
  return `${username.toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}
