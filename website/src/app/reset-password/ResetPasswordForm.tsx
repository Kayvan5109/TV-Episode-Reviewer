'use client';

import { useActionState, useState } from 'react';
import type { FormEvent } from 'react';

import { resetPassword, type ResetPasswordFormState } from './actions';

const initialState: ResetPasswordFormState = undefined;

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(resetPassword, initialState);
  // Client-side-only check (never trusted as the real validation — `confirmPassword` crosses the
  // wire with the rest of the form data, but the server action never reads it, only `password`):
  // catches an obvious typo before spending the one-shot recovery session on a submit the user
  // didn't mean to make.
  const [mismatchError, setMismatchError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get('password') ?? '');
    const confirmPassword = String(formData.get('confirmPassword') ?? '');

    if (password !== confirmPassword) {
      event.preventDefault();
      setMismatchError('Passwords do not match.');
      return;
    }

    setMismatchError(null);
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          New password
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

      <div className="flex flex-col gap-1">
        <label htmlFor="confirmPassword" className="text-sm font-medium">
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          className="rounded border border-black/20 px-3 py-2 dark:border-white/30"
        />
      </div>

      {mismatchError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {mismatchError}
        </p>
      )}

      {!mismatchError && state?.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? 'Updating…' : 'Update password'}
      </button>
    </form>
  );
}
