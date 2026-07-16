/**
 * Maps the `?error=` codes `src/app/auth/confirm/route.ts` redirects to `/login` with into a
 * human-readable message for `page.tsx` to display. Pulled out into its own pure function (rather
 * than living inline in the page) specifically so this mapping logic is unit-testable — this
 * codebase has no React-component test setup (see `website/AGENTS.md`/`vitest.config.ts`: only
 * plain `.ts` logic gets `.test.ts` coverage), so keeping the actual decision logic here, with the
 * page itself as a thin wrapper, is what makes it testable at all.
 *
 * Returns `null` (render nothing) for a missing or unrecognized code — an *unrecognized* code still
 * falls back to a generic message via `ERROR_MESSAGES`, but no `error` param at all renders nothing.
 */
const ERROR_MESSAGES: Record<string, string> = {
  'confirmation-failed':
    "That confirmation link is invalid or has expired. If you've already clicked it once, your " +
    'account may already be confirmed — try logging in below.',
  'confirmation-link-invalid':
    'That confirmation link is missing information it needs. Please use the link from your ' +
    'confirmation email exactly as it was sent, rather than a copy or a retyped URL.',
};

const GENERIC_ERROR_MESSAGE =
  'Something went wrong confirming your email. Please try logging in below, or request a new ' +
  'confirmation email.';

export function getLoginErrorMessage(error: string | undefined): string | null {
  if (!error) {
    return null;
  }

  return ERROR_MESSAGES[error] ?? GENERIC_ERROR_MESSAGE;
}
