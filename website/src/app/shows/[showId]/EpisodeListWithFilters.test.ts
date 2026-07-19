import { describe, expect, it } from 'vitest';

import {
  filterEpisodes,
  groupBySeason,
  isSeasonComplete,
  matchesSearch,
  searchableText,
  type EpisodeWithStatus,
} from './EpisodeListWithFilters';

function makeEpisode(overrides: Partial<EpisodeWithStatus> & { id: string }): EpisodeWithStatus {
  return {
    season_number: 1,
    episode_number: 1,
    title: 'Untitled',
    air_date: null,
    ...overrides,
  };
}

const pilot = makeEpisode({
  id: 'e1',
  season_number: 1,
  episode_number: 1,
  title: 'Pilot',
  score: 8.5,
  rank: 2,
});
const chapterTwo = makeEpisode({
  id: 'e2',
  season_number: 1,
  episode_number: 2,
  title: 'Chapter Two',
  bucket: 'liked',
});
const theReturn = makeEpisode({
  id: 'e3',
  season_number: 2,
  episode_number: 1,
  title: 'The Return',
  // Untouched — no score, no bucket.
});
const finale = makeEpisode({
  id: 'e4',
  season_number: 2,
  episode_number: 2,
  title: 'Series Finale',
  score: 9.1,
  rank: 1,
});

const allEpisodes = [pilot, chapterTwo, theReturn, finale];

describe('searchableText', () => {
  it('includes the title, bare episode number, and an sXeY code, lowercased', () => {
    expect(searchableText(pilot)).toBe('pilot 1 s1e1');
  });
});

describe('matchesSearch', () => {
  it('matches on a title fragment, case-insensitively', () => {
    expect(matchesSearch(chapterTwo, 'chapter')).toBe(true);
    expect(matchesSearch(chapterTwo, 'CHAPTER')).toBe(true);
    expect(matchesSearch(chapterTwo, 'nope')).toBe(false);
  });

  it('matches on a bare episode number', () => {
    expect(matchesSearch(finale, '2')).toBe(true);
  });

  it('matches on an "sXeY" code', () => {
    expect(matchesSearch(theReturn, 's2e1')).toBe(true);
    expect(matchesSearch(theReturn, 'S2E1')).toBe(true);
    expect(matchesSearch(theReturn, 's1e1')).toBe(false);
  });

  it('treats an empty or blank query as matching everything', () => {
    expect(matchesSearch(pilot, '')).toBe(true);
    expect(matchesSearch(pilot, '   ')).toBe(true);
  });
});

describe('groupBySeason', () => {
  it('groups episodes by season_number, preserving each season\'s episode order', () => {
    const seasons = groupBySeason(allEpisodes);
    expect([...seasons.keys()].sort()).toEqual([1, 2]);
    expect(seasons.get(1)).toEqual([pilot, chapterTwo]);
    expect(seasons.get(2)).toEqual([theReturn, finale]);
  });
});

describe('isSeasonComplete', () => {
  it('is true when every episode has a score or a bucket', () => {
    expect(isSeasonComplete([pilot, chapterTwo])).toBe(true);
  });

  it('is false when any episode has neither a score nor a bucket', () => {
    expect(isSeasonComplete([theReturn, finale])).toBe(false);
  });
});

describe('filterEpisodes', () => {
  it('season-only: narrows to just the selected season, ignoring search', () => {
    expect(filterEpisodes(allEpisodes, { season: 2, query: '' })).toEqual([theReturn, finale]);
  });

  it('search-only: matches across all seasons when season is "all"', () => {
    expect(filterEpisodes(allEpisodes, { season: 'all', query: 'finale' })).toEqual([finale]);
  });

  it('combined: season and search apply together (AND)', () => {
    // "e" matches every title here, but restricting to season 1 should exclude season 2's episodes.
    expect(filterEpisodes(allEpisodes, { season: 1, query: 'e' })).toEqual([pilot, chapterTwo]);
    // A season-1-only title shouldn't show up when filtered to season 2.
    expect(filterEpisodes(allEpisodes, { season: 2, query: 'pilot' })).toEqual([]);
  });

  it('no-match: returns an empty array when nothing matches, within a season or across the whole show', () => {
    expect(filterEpisodes(allEpisodes, { season: 'all', query: 'nonexistent' })).toEqual([]);
    expect(filterEpisodes(allEpisodes, { season: 1, query: 'nonexistent' })).toEqual([]);
  });

  it('"all" seasons plus an empty query returns everything, unfiltered', () => {
    expect(filterEpisodes(allEpisodes, { season: 'all', query: '' })).toEqual(allEpisodes);
  });
});

describe('the "Complete" badge is unaffected by search (season 1 is complete either way)', () => {
  it('stays true when computed from the full season, even though a search query would hide one of its episodes', () => {
    // Simulates the component's own approach: `isSeasonComplete` must be called with the season's
    // *full* episode list (from `groupBySeason(allEpisodes)`), never with the post-search filtered
    // subset — searching for "pilot" would filter season 1 down to just `pilot`, but the badge
    // should still reflect that season 1 (pilot + chapterTwo) is genuinely complete.
    const fullSeasons = groupBySeason(allEpisodes);
    const searchFiltered = filterEpisodes(allEpisodes, { season: 'all', query: 'pilot' });
    const filteredSeasons = groupBySeason(searchFiltered);

    expect(filteredSeasons.get(1)).toEqual([pilot]);
    expect(isSeasonComplete(filteredSeasons.get(1) ?? [])).toBe(true); // trivially true: 1/1 filtered episode is scored
    expect(isSeasonComplete(fullSeasons.get(1) ?? [])).toBe(true); // true from the full season too, correctly

    // A sharper case: hide the *complete* episode and keep only the incomplete one via search.
    const chapterOnly = filterEpisodes(allEpisodes, { season: 'all', query: 'chapter' });
    const chapterOnlySeasons = groupBySeason(chapterOnly);
    expect(chapterOnlySeasons.get(1)).toEqual([chapterTwo]);
    expect(isSeasonComplete(chapterOnlySeasons.get(1) ?? [])).toBe(true);
    // Full season 1 (pilot + chapterTwo) is still complete regardless — same answer here, but the
    // point is the badge must be sourced from `fullSeasons`, not `filteredSeasons`.
    expect(isSeasonComplete(fullSeasons.get(1) ?? [])).toBe(true);

    // Season 2 makes the distinction real: it's incomplete overall (`theReturn` has neither score
    // nor bucket), but a search for "finale" filters it down to just the complete episode.
    const financeSearch = filterEpisodes(allEpisodes, { season: 'all', query: 'finale' });
    const financeSeasons = groupBySeason(financeSearch);
    expect(isSeasonComplete(financeSeasons.get(2) ?? [])).toBe(true); // filtered subset looks complete...
    expect(isSeasonComplete(fullSeasons.get(2) ?? [])).toBe(false); // ...but the real, full season 2 is not.
  });
});
