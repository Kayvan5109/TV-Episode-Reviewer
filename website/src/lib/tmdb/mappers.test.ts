import { describe, expect, it } from 'vitest';
import { mapSeasonEpisode, mapShowDetails, mapShowSearchResult } from './mappers';

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
      mapSeasonEpisode(
        {
          id: 62085,
          name: 'Pilot',
          season_number: 1,
          episode_number: 1,
        },
        '/season-poster.jpg'
      )
    ).toEqual({
      tmdbEpisodeId: 62085,
      seasonNumber: 1,
      episodeNumber: 1,
      title: 'Pilot',
      seasonPosterUrl: 'https://image.tmdb.org/t/p/w500/season-poster.jpg',
    });
  });

  it('leaves seasonPosterUrl null when TMDB has no poster_path for the season', () => {
    expect(
      mapSeasonEpisode(
        {
          id: 62086,
          name: 'No Poster Episode',
          season_number: 1,
          episode_number: 2,
        },
        null
      )
    ).toEqual({
      tmdbEpisodeId: 62086,
      seasonNumber: 1,
      episodeNumber: 2,
      title: 'No Poster Episode',
      seasonPosterUrl: null,
    });
  });
});

describe('mapShowDetails', () => {
  it('reshapes raw TMDB show details into the app shape', () => {
    expect(
      mapShowDetails({
        id: 1396,
        name: 'Breaking Bad',
        poster_path: '/abc.jpg',
        number_of_seasons: 5,
      })
    ).toEqual({
      tmdbShowId: 1396,
      title: 'Breaking Bad',
      posterUrl: 'https://image.tmdb.org/t/p/w500/abc.jpg',
      numberOfSeasons: 5,
    });
  });

  it('leaves posterUrl null when TMDB has no poster_path', () => {
    expect(
      mapShowDetails({ id: 2, name: 'No Poster Show', poster_path: null, number_of_seasons: 1 })
    ).toEqual({
      tmdbShowId: 2,
      title: 'No Poster Show',
      posterUrl: null,
      numberOfSeasons: 1,
    });
  });
});
