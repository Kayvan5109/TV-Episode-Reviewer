import { describe, expect, it } from 'vitest';

import { resolveProfileView, type ProfileRow } from './resolveProfileView';

const publicRow: ProfileRow = {
  user_id: 'them',
  username: 'them',
  display_name: 'Them',
  rankings_visibility: 'public',
};

const privateRow: ProfileRow = {
  user_id: 'them',
  username: 'them',
  display_name: 'Them',
  rankings_visibility: 'private',
};

describe('resolveProfileView', () => {
  it('treats a null row (RLS returned nothing) as not found', () => {
    expect(resolveProfileView(null, 'viewer')).toEqual({ found: false });
  });

  it(
    'renders identically for a genuinely nonexistent username and a private username that is not ' +
      "the viewer's own -- both surface to this function as `null` (RLS returns no row for either " +
      'case), so the same `{ found: false }` shape covers both, by construction, not by a case-by-case check',
    () => {
      const nonexistent = resolveProfileView(null, 'viewer');
      const privateNotMine = resolveProfileView(null, 'viewer');
      expect(nonexistent).toEqual(privateNotMine);
      expect(nonexistent).toEqual({ found: false });
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
