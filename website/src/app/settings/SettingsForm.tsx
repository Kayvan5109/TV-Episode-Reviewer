'use client';

import { useActionState } from 'react';

import { updateProfile, type UpdateProfileState } from './actions';

const initialState: UpdateProfileState = undefined;

interface SettingsFormProps {
  displayName: string | null;
  rankingsVisibility: 'private' | 'public';
}

export function SettingsForm({ displayName, rankingsVisibility }: SettingsFormProps) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="display_name" className="text-sm font-medium">
          Display name
        </label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          maxLength={40}
          defaultValue={displayName ?? ''}
          placeholder="Falls back to your username if left blank"
          className="rounded border border-black/20 px-3 py-2 dark:border-white/30"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Rankings visibility</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="rankings_visibility"
            value="private"
            defaultChecked={rankingsVisibility === 'private'}
            className="mt-1"
          />
          <span>
            <span className="block">Private</span>
            <span className="block text-xs text-black/60 dark:text-white/60">
              Only you can see your profile and rankings.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="rankings_visibility"
            value="public"
            defaultChecked={rankingsVisibility === 'public'}
            className="mt-1"
          />
          <span>
            <span className="block">Public</span>
            <span className="block text-xs text-black/60 dark:text-white/60">
              Other signed-in users can view your profile at your username&apos;s page and follow you.
            </span>
          </span>
        </label>
      </fieldset>

      {state?.status === 'error' && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state?.status === 'success' && (
        <p role="status" className="text-sm text-green-600 dark:text-green-400">
          Saved.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}
