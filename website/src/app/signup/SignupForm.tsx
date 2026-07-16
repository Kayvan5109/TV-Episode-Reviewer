'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { signup, type SignupFormState } from './actions';

const initialState: SignupFormState = undefined;

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, initialState);

  if (state?.status === 'confirmEmail') {
    return (
      <div className="flex w-full max-w-sm flex-col gap-3 text-center">
        <p>Check your email to confirm your account, then log in.</p>
        <Link href="/login" className="underline">
          Go to login
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

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
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
        {pending ? 'Signing up…' : 'Sign up'}
      </button>

      <p className="text-sm">
        Already have an account?{' '}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
