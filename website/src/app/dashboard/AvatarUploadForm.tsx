'use client';

import { useState } from 'react';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';

import { updateAvatar } from './actions';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

type UploadStatus = 'idle' | 'uploading' | 'error' | 'success';

interface AvatarUploadFormProps {
  userId: string;
  username: string;
  initialAvatarUrl: string | null;
}

/**
 * Avatar upload control on `/dashboard` (moved here from `/settings` when the two pages were merged
 * into one "My Profile" page -- see Docs/STATUS.md's dated entry for that merge). Uploads directly
 * to the public `avatars` Storage bucket via the browser Supabase client (`@/lib/supabase/client`)
 * -- not through a Server Action, since a Server Action would have to receive the whole file over
 * the wire a second time for no benefit; the browser talking to Supabase Storage directly is the
 * standard pattern here, and object-level RLS on `storage.objects` (restricted to a
 * `{auth.uid()}/...` path prefix -- see
 * `supabase/migrations/20260723010000_account_page_visibility.sql`) is what actually keeps this safe,
 * not anything client-side.
 *
 * Every upload writes to a **fresh** filename (`avatar-{timestamp}.{ext}`), never a fixed one --
 * sidesteps any CDN/browser caching staleness on replace (a fixed name would need real
 * cache-busting query params instead), and is simpler than reasoning about overwrite semantics.
 * Old avatar objects are never deleted here -- accepted, low-stakes clutter for a personal-use app at
 * this scale (mirrors this codebase's existing "accepted, not chased" posture on similarly small
 * cleanup gaps, e.g. `all-star-session/session.ts`'s orphaned-comparisons note).
 *
 * Client-side validation (MIME type, size cap) is a UX nicety only, not the security boundary --
 * `storage.objects`' own INSERT policy (path-prefix check) is what actually enforces who can write
 * where; this just avoids a pointless upload attempt and gives a fast, specific error message.
 *
 * On successful upload, calls the `updateAvatar` Server Action (`./actions.ts`) directly as a plain
 * async function (not via `useActionState`/`<form action>` -- there's no `<form>` submission here,
 * just "upload finished, now persist the URL").
 */
export function AvatarUploadForm({ userId, username, initialAvatarUrl }: AvatarUploadFormProps) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset the input so selecting the exact same file again still fires a change event.
    event.target.value = '';
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setStatus('error');
      setError('Please choose a PNG, JPEG, or WEBP image.');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setStatus('error');
      setError('Image must be 2MB or smaller.');
      return;
    }

    setStatus('uploading');
    setError(null);

    const extension = EXTENSION_BY_TYPE[file.type];
    const path = `${userId}/avatar-${Date.now()}.${extension}`;

    const supabase = createSupabaseBrowserClient();
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
      contentType: file.type,
    });

    if (uploadError) {
      setStatus('error');
      setError(`Upload failed: ${uploadError.message}`);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('avatars').getPublicUrl(path);

    const result = await updateAvatar(publicUrl);

    if (result.status === 'error') {
      setStatus('error');
      setError(result.error);
      return;
    }

    setAvatarUrl(publicUrl);
    setStatus('success');
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Avatar</span>
      <div className="flex items-center gap-3">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage CDN image.
          <img
            src={avatarUrl}
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/10 text-xl font-medium dark:bg-white/10">
            {username.charAt(0).toUpperCase()}
          </span>
        )}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
          disabled={status === 'uploading'}
          className="text-sm"
        />
      </div>
      {status === 'uploading' && (
        <p className="text-xs text-black/60 dark:text-white/60">Uploading…</p>
      )}
      {status === 'error' && error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {status === 'success' && (
        <p role="status" className="text-sm text-green-600 dark:text-green-400">
          Avatar updated.
        </p>
      )}
    </div>
  );
}
