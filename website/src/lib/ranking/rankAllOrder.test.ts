import { describe, expect, it } from 'vitest';

import { orderOldestFirst, type EpisodeOrderRow } from './rankAllOrder';

function episode(
  id: string,
  seasonNumber: number,
  episodeNumber: number,
  airDate: string | null
): EpisodeOrderRow {
  return { id, season_number: seasonNumber, episode_number: episodeNumber, air_date: airDate };
}

describe('orderOldestFirst', () => {
  it('sorts primarily by air_date, oldest first', () => {
    const episodes = [
      episode('c', 1, 3, '2020-03-01'),
      episode('a', 1, 1, '2020-01-01'),
      episode('b', 1, 2, '2020-02-01'),
    ];

    expect(orderOldestFirst(episodes, ['c', 'a', 'b'])).toEqual(['a', 'b', 'c']);
  });

  it('falls back to season/episode order when air_date is missing on both sides', () => {
    const episodes = [
      episode('s2e1', 2, 1, null),
      episode('s1e2', 1, 2, null),
      episode('s1e1', 1, 1, null),
    ];

    expect(orderOldestFirst(episodes, ['s2e1', 's1e2', 's1e1'])).toEqual(['s1e1', 's1e2', 's2e1']);
  });

  it('places an undated episode among dated ones via the season/episode fallback, without inventing a date', () => {
    const episodes = [
      episode('dated-late', 1, 3, '2020-03-01'),
      episode('undated', 1, 2, null),
      episode('dated-early', 1, 1, '2020-01-01'),
    ];

    expect(orderOldestFirst(episodes, ['dated-late', 'undated', 'dated-early'])).toEqual([
      'dated-early',
      'undated',
      'dated-late',
    ]);
  });

  it('breaks a same-air-date tie via season/episode order', () => {
    const episodes = [
      episode('e2', 1, 2, '2020-01-01'),
      episode('e1', 1, 1, '2020-01-01'),
    ];

    expect(orderOldestFirst(episodes, ['e2', 'e1'])).toEqual(['e1', 'e2']);
  });

  it('only returns ids present in the episodes list, silently dropping any that are not found', () => {
    const episodes = [episode('a', 1, 1, '2020-01-01')];

    expect(orderOldestFirst(episodes, ['a', 'stale-id'])).toEqual(['a']);
  });

  it('returns an empty array when episodeIds is empty', () => {
    const episodes = [episode('a', 1, 1, '2020-01-01')];

    expect(orderOldestFirst(episodes, [])).toEqual([]);
  });

  it('does not mutate the input episodes array', () => {
    const episodes = [
      episode('b', 1, 2, '2020-02-01'),
      episode('a', 1, 1, '2020-01-01'),
    ];
    const copy = [...episodes];

    orderOldestFirst(episodes, ['b', 'a']);

    expect(episodes).toEqual(copy);
  });
});
