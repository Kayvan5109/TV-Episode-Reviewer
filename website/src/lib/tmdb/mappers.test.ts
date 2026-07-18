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
          overview: 'A high school chemistry teacher turns to a life of crime.',
        },
        '/season-poster.jpg'
      )
    ).toEqual({
      tmdbEpisodeId: 62085,
      seasonNumber: 1,
      episodeNumber: 1,
      title: 'Pilot',
      seasonPosterUrl: 'https://image.tmdb.org/t/p/w500/season-poster.jpg',
      synopsis: 'A high school chemistry teacher turns to a life of crime.',
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
          overview: 'Some overview.',
        },
        null
      )
    ).toEqual({
      tmdbEpisodeId: 62086,
      seasonNumber: 1,
      episodeNumber: 2,
      title: 'No Poster Episode',
      seasonPosterUrl: null,
      synopsis: 'Some overview.',
    });
  });

  it('leaves synopsis null when TMDB has no overview for the episode', () => {
    expect(
      mapSeasonEpisode(
        {
          id: 62087,
          name: 'No Overview Episode',
          season_number: 1,
          episode_number: 3,
          overview: null,
        },
        '/season-poster.jpg'
      )
    ).toEqual({
      tmdbEpisodeId: 62087,
      seasonNumber: 1,
      episodeNumber: 3,
      title: 'No Overview Episode',
      seasonPosterUrl: 'https://image.tmdb.org/t/p/w500/season-poster.jpg',
      synopsis: null,
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
        genres: [
          { id: 18, name: 'Drama' },
          { id: 80, name: 'Crime' },
        ],
      })
    ).toEqual({
      tmdbShowId: 1396,
      title: 'Breaking Bad',
      posterUrl: 'https://image.tmdb.org/t/p/w500/abc.jpg',
      numberOfSeasons: 5,
      genres: ['Drama', 'Crime'],
    });
  });

  it('leaves posterUrl null when TMDB has no poster_path', () => {
    expect(
      mapShowDetails({
        id: 2,
        name: 'No Poster Show',
        poster_path: null,
        number_of_seasons: 1,
        genres: [{ id: 35, name: 'Comedy' }],
      })
    ).toEqual({
      tmdbShowId: 2,
      title: 'No Poster Show',
      posterUrl: null,
      numberOfSeasons: 1,
      genres: ['Comedy'],
    });
  });

  it('maps an empty genres array to an empty array, not null', () => {
    expect(
      mapShowDetails({
        id: 3,
        name: 'No Genres Show',
        poster_path: null,
        number_of_seasons: 1,
        genres: [],
      })
    ).toEqual({
      tmdbShowId: 3,
      title: 'No Genres Show',
      posterUrl: null,
      numberOfSeasons: 1,
      genres: [],
    });
  });
});
