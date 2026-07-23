import { describe, expect, it } from 'vitest';

import { resolveProfileView, type ProfileRow } from './resolveProfileView';

const publicRow: ProfileRow = {
  user_id: 'them',
  username: 'them',
  display_name: 'Them',
  rankings_visibility: 'public',
  avatar_url: null,
};

const privateRow: ProfileRow = {
  user_id: 'them',
  username: 'them',
  display_name: 'Them',
  rankings_visibility: 'private',
  avatar_url: null,
};

describe('resolveProfileView', () => {
  it('treats a null row (profile_identity_by_username found nothing -- genuinely nonexistent username) as not found', () => {
    expect(resolveProfileView(null, 'viewer')).toEqual({ found: false });
  });

  it(
    "finds a private profile that isn't the viewer's own, with isOwnProfile: false -- revised " +
      "2026-07-22: a private profile is now identifiable, no longer collapsed with a nonexistent " +
      'one (see this file\'s header comment for the full history)',
    () => {
      expect(resolveProfileView(privateRow, 'viewer')).toEqual({
        found: true,
        profile: privateRow,
        isOwnProfile: false,
      });
    }
  );

  it("finds a public profile that isn't the viewer's own, with isOwnProfile: false", () => {
    expect(resolveProfileView(publicRow, 'viewer')).toEqual({
      found: true,
      profile: publicRow,
      isOwnProfile: false,
    });
  });

  it("finds the viewer's own profile even when private, with isOwnProfile: true", () => {
    const ownRow: ProfileRow = { ...privateRow, user_id: 'viewer', username: 'viewer' };
    expect(resolveProfileView(ownRow, 'viewer')).toEqual({
      found: true,
      profile: ownRow,
      isOwnProfile: true,
    });
  });

  it("finds the viewer's own profile when public too, with isOwnProfile: true", () => {
    const ownRow: ProfileRow = { ...publicRow, user_id: 'viewer', username: 'viewer' };
    expect(resolveProfileView(ownRow, 'viewer')).toEqual({
      found: true,
      profile: ownRow,
      isOwnProfile: true,
    });
  });
});
