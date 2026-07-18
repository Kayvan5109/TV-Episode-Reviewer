import { describe, expect, it } from 'vitest';
import { mapEpisodeCredits, mapSeasonEpisode, mapShowDetails, mapShowSearchResult } from './mappers';

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
          still_path: '/still.jpg',
          air_date: '2008-01-20',
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
      stillUrl: 'https://image.tmdb.org/t/p/w500/still.jpg',
      airDate: '2008-01-20',
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
          still_path: '/still.jpg',
          air_date: '2008-01-27',
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
      stillUrl: 'https://image.tmdb.org/t/p/w500/still.jpg',
      airDate: '2008-01-27',
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
          still_path: '/still.jpg',
          air_date: '2008-02-03',
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
      stillUrl: 'https://image.tmdb.org/t/p/w500/still.jpg',
      airDate: '2008-02-03',
    });
  });

  it('leaves stillUrl and airDate null when TMDB has no still_path/air_date for the episode', () => {
    expect(
      mapSeasonEpisode(
        {
          id: 62088,
          name: 'No Still Episode',
          season_number: 1,
          episode_number: 4,
          overview: 'Some overview.',
          still_path: null,
          air_date: null,
        },
        '/season-poster.jpg'
      )
    ).toEqual({
      tmdbEpisodeId: 62088,
      seasonNumber: 1,
      episodeNumber: 4,
      title: 'No Still Episode',
      seasonPosterUrl: 'https://image.tmdb.org/t/p/w500/season-poster.jpg',
      synopsis: 'Some overview.',
      stillUrl: null,
      airDate: null,
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
        status: 'Ended',
      })
    ).toEqual({
      tmdbShowId: 1396,
      title: 'Breaking Bad',
      posterUrl: 'https://image.tmdb.org/t/p/w500/abc.jpg',
      numberOfSeasons: 5,
      genres: ['Drama', 'Crime'],
      status: 'Ended',
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
        status: 'Returning Series',
      })
    ).toEqual({
      tmdbShowId: 2,
      title: 'No Poster Show',
      posterUrl: null,
      numberOfSeasons: 1,
      genres: ['Comedy'],
      status: 'Returning Series',
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
        status: 'Canceled',
      })
    ).toEqual({
      tmdbShowId: 3,
      title: 'No Genres Show',
      posterUrl: null,
      numberOfSeasons: 1,
      genres: [],
      status: 'Canceled',
    });
  });
});

describe('mapEpisodeCredits', () => {
  it('reshapes raw episode credits into directors/writers/cast', () => {
    expect(
      mapEpisodeCredits({
        cast: [
          { name: 'Bryan Cranston', character: 'Walter White' },
          { name: 'Aaron Paul', character: 'Jesse Pinkman' },
        ],
        crew: [
          { name: 'Vince Gilligan', job: 'Director' },
          { name: 'Vince Gilligan', job: 'Writer' },
          { name: 'Michelle MacLaren', job: 'Producer' },
        ],
      })
    ).toEqual({
      directors: ['Vince Gilligan'],
      writers: ['Vince Gilligan'],
      cast: ['Bryan Cranston', 'Aaron Paul'],
    });
  });

  it('returns empty arrays when cast and crew are both empty', () => {
    expect(mapEpisodeCredits({ cast: [], crew: [] })).toEqual({
      directors: [],
      writers: [],
      cast: [],
    });
  });

  it('returns empty directors/writers when crew has neither job', () => {
    expect(
      mapEpisodeCredits({
        cast: [],
        crew: [
          { name: 'Michelle MacLaren', job: 'Producer' },
          { name: 'Some Editor', job: 'Editor' },
        ],
      })
    ).toEqual({
      directors: [],
      writers: [],
      cast: [],
    });
  });

  it('truncates cast to the first 8 entries', () => {
    const cast = Array.from({ length: 10 }, (_, i) => ({
      name: `Actor ${i + 1}`,
      character: `Character ${i + 1}`,
    }));

    const result = mapEpisodeCredits({ cast, crew: [] });

    expect(result.cast).toEqual([
      'Actor 1',
      'Actor 2',
      'Actor 3',
      'Actor 4',
      'Actor 5',
      'Actor 6',
      'Actor 7',
      'Actor 8',
    ]);
  });

  it('de-dupes a director who appears twice with the same job', () => {
    expect(
      mapEpisodeCredits({
        cast: [],
        crew: [
          { name: 'Vince Gilligan', job: 'Director' },
          { name: 'Vince Gilligan', job: 'Director' },
        ],
      })
    ).toEqual({
      directors: ['Vince Gilligan'],
      writers: [],
      cast: [],
    });
  });
});
