import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('@/lib/supabase/serverSession', () => ({
  createSupabaseServerClient: async () => ({ rpc }),
}));

import { lookupProfileIdentitiesByUserIds, lookupProfileIdentityByUsername } from './profileIdentity';

describe('lookupProfileIdentityByUsername', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the profile_identity_by_username RPC with the given username', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await lookupProfileIdentityByUsername('someone');
    expect(rpc).toHaveBeenCalledWith('profile_identity_by_username', { p_username: 'someone' });
  });

  it('returns the single row when the RPC finds a profile (public or private -- the whole point of this function)', async () => {
    const row = {
      user_id: 'them',
      username: 'them',
      display_name: 'Them',
      rankings_visibility: 'private' as const,
      avatar_url: 'https://example.com/avatars/them/avatar-1.png',
    };
    rpc.mockResolvedValue({ data: [row], error: null });

    const result = await lookupProfileIdentityByUsername('them');

    expect(result).toEqual(row);
  });

  it('returns null when the RPC returns no rows (genuinely nonexistent username)', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await lookupProfileIdentityByUsername('nosuchuser')).toBeNull();
  });

  it('returns null when the RPC returns null data', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await lookupProfileIdentityByUsername('nosuchuser')).toBeNull();
  });
});

describe('lookupProfileIdentitiesByUserIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('short-circuits to [] without calling the RPC when given an empty list', async () => {
    const result = await lookupProfileIdentitiesByUserIds([]);
    expect(result).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('calls the profile_identities_by_user_ids RPC with the given ids', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await lookupProfileIdentitiesByUserIds(['a', 'b']);
    expect(rpc).toHaveBeenCalledWith('profile_identities_by_user_ids', { p_user_ids: ['a', 'b'] });
  });

  it('returns every row the RPC finds, including private profiles (the fix for the vanishing-Following-entry bug)', async () => {
    const rows = [
      { user_id: 'a', username: 'alice', display_name: null, rankings_visibility: 'public' as const, avatar_url: null },
      {
        user_id: 'b',
        username: 'bob',
        display_name: 'Bob',
        rankings_visibility: 'private' as const,
        avatar_url: 'https://example.com/avatars/b/avatar-1.png',
      },
    ];
    rpc.mockResolvedValue({ data: rows, error: null });

    const result = await lookupProfileIdentitiesByUserIds(['a', 'b']);

    expect(result).toEqual(rows);
  });

  it('returns [] when the RPC returns null data', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await lookupProfileIdentitiesByUserIds(['a'])).toEqual([]);
  });
});
