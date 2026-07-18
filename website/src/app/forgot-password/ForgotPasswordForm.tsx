'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { forgotPassword, type ForgotPasswordFormState } from './actions';

const initialState: ForgotPasswordFormState = undefined;

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(forgotPassword, initialState);

  if (state?.status === 'sent') {
    return (
      <div className="flex w-full max-w-sm flex-col gap-3 text-center">
        <p>If that email has an account, we&apos;ve sent a link to reset the password. Check your inbox.</p>
        <Link href="/login" className="underline">
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded border border-black/20 px-3 py-2 dark:border-white/30"
        />
      </div>

      {state?.status === 'error' && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? 'Sending…' : 'Send reset link'}
      </button>

      <p className="text-sm">
        Remembered your password?{' '}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
