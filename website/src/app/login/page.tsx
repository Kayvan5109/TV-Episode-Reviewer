import type { Metadata } from 'next';

import { getLoginErrorMessage } from './errorMessages';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = {
  title: 'Log in — Episode Ranker',
};

// Reads `searchParams` (an `error` code from `/auth/confirm`'s redirects) on every request rather
// than serving a cached page — the error message shown depends on the specific request's query
// string, so this can never be statically prerendered.
export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = getLoginErrorMessage(error);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Log in</h1>
      {errorMessage && (
        <p role="alert" className="w-full max-w-sm text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      )}
      <LoginForm />
    </div>
  );
}
