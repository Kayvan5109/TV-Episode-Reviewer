import { describe, expect, it } from 'vitest';
import { annotateAlreadyAdded, type ShowIdentity } from './searchAnnotation';
import type { ShowSearchResult } from '@/lib/tmdb/types';

const breakingBad: ShowSearchResult = {
  tmdbShowId: 1396,
  title: 'Breaking Bad',
  posterUrl: 'https://image.tmdb.org/t/p/w500/abc.jpg',
};

const betterCallSaul: ShowSearchResult = {
  tmdbShowId: 60059,
  title: 'Better Call Saul',
  posterUrl: null,
};

const neverImported: ShowSearchResult = {
  tmdbShowId: 999,
  title: 'Not In Our DB At All',
  posterUrl: null,
};

describe('annotateAlreadyAdded', () => {
  it('marks a result as already added when it is both a known show and in the added set', () => {
    const knownShows: ShowIdentity[] = [{ id: 'show-uuid-1', tmdbShowId: 1396 }];
    const addedShowIds = new Set(['show-uuid-1']);

    const result = annotateAlreadyAdded([breakingBad], knownShows, addedShowIds);

    expect(result).toEqual([
      { ...breakingBad, alreadyAdded: true, showId: 'show-uuid-1' },
    ]);
  });

  it('does not mark a result as added when it exists in `shows` but not in this user\'s `user_shows`', () => {
    const knownShows: ShowIdentity[] = [{ id: 'show-uuid-1', tmdbShowId: 1396 }];
    const addedShowIds = new Set<string>(); // some other user imported it, not this one

    const result = annotateAlreadyAdded([breakingBad], knownShows, addedShowIds);

    expect(result).toEqual([{ ...breakingBad, alreadyAdded: false, showId: null }]);
  });

  it('does not mark a result as added when it does not exist in `shows` at all', () => {
    const result = annotateAlreadyAdded([neverImported], [], new Set());

    expect(result).toEqual([{ ...neverImported, alreadyAdded: false, showId: null }]);
  });

  it('handles a mixed result set independently per result', () => {
    const knownShows: ShowIdentity[] = [
      { id: 'show-uuid-1', tmdbShowId: 1396 },
      { id: 'show-uuid-2', tmdbShowId: 60059 },
    ];
    const addedShowIds = new Set(['show-uuid-1']); // only Breaking Bad added by this user

    const result = annotateAlreadyAdded(
      [breakingBad, betterCallSaul, neverImported],
      knownShows,
      addedShowIds
    );

    expect(result).toEqual([
      { ...breakingBad, alreadyAdded: true, showId: 'show-uuid-1' },
      { ...betterCallSaul, alreadyAdded: false, showId: null },
      { ...neverImported, alreadyAdded: false, showId: null },
    ]);
  });

  it('returns an empty array for an empty result set', () => {
    expect(annotateAlreadyAdded([], [], new Set())).toEqual([]);
  });
});
