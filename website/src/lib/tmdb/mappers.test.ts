import { describe, expect, it } from 'vitest';
import { mapSeasonEpisode, mapShowSearchResult } from './mappers';

describe('mapShowSearchResult', () => {
  it('reshapes a raw TMDB search result into the app shape', () => {
    expect(
      mapShowSearchResult({ id: 1396, name: 'Breaking Bad', poster_path: '/abc.jpg' })
    ).toEqual({
      tmdbShowId: 1396,
      title: 'Breaking Bad',
      posterUrl: 'https://image.tmdb.org/t/p/w500/abc.jpg',
    });
  });

  it('leaves posterUrl null when TMDB has no poster_path', () => {
    expect(mapShowSearchResult({ id: 1, name: 'No Poster Show', poster_path: null })).toEqual({
      tmdbShowId: 1,
      title: 'No Poster Show',
      posterUrl: null,
    });
  });
});

describe('mapSeasonEpisode', () => {
  it('reshapes a raw TMDB season episode into the app shape', () => {
    expect(
      mapSeasonEpisode({
        id: 62085,
        name: 'Pilot',
        season_number: 1,
        episode_number: 1,
      })
    ).toEqual({
      tmdbEpisodeId: 62085,
      seasonNumber: 1,
      episodeNumber: 1,
      title: 'Pilot',
    });
  });
});
