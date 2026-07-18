import { describe, expect, it } from 'vitest';

import { isSeasonFinale, type EpisodeSeasonInfo } from './seasonFinale';

describe('isSeasonFinale', () => {
  it('is a finale when it has the highest episode number in its season and a later season exists', () => {
    const allEpisodes: EpisodeSeasonInfo[] = [
      { seasonNumber: 1, episodeNumber: 1 },
      { seasonNumber: 1, episodeNumber: 2 },
      { seasonNumber: 1, episodeNumber: 3 },
      { seasonNumber: 2, episodeNumber: 1 },
    ];

    expect(isSeasonFinale({ seasonNumber: 1, episodeNumber: 3 }, allEpisodes, null)).toBe(true);
  });

  it('is a finale when it is the highest episode of the last season and the show status is Ended', () => {
    const allEpisodes: EpisodeSeasonInfo[] = [
      { seasonNumber: 1, episodeNumber: 1 },
      { seasonNumber: 1, episodeNumber: 2 },
    ];

    expect(isSeasonFinale({ seasonNumber: 1, episodeNumber: 2 }, allEpisodes, 'Ended')).toBe(true);
  });

  it('is a finale when it is the highest episode of the last season and the show status is Canceled', () => {
    const allEpisodes: EpisodeSeasonInfo[] = [
      { seasonNumber: 1, episodeNumber: 1 },
      { seasonNumber: 1, episodeNumber: 2 },
    ];

    expect(isSeasonFinale({ seasonNumber: 1, episodeNumber: 2 }, allEpisodes, 'Canceled')).toBe(true);
  });

  it('is not a finale when it is the highest episode of the last season but the show is still airing', () => {
    const allEpisodes: EpisodeSeasonInfo[] = [
      { seasonNumber: 1, episodeNumber: 1 },
      { seasonNumber: 1, episodeNumber: 2 },
    ];

    expect(isSeasonFinale({ seasonNumber: 1, episodeNumber: 2 }, allEpisodes, 'Returning Series')).toBe(
      false
    );
    expect(isSeasonFinale({ seasonNumber: 1, episodeNumber: 2 }, allEpisodes, null)).toBe(false);
  });

  it('is never a finale when it is not the highest episode number in its season, regardless of status or later seasons', () => {
    const allEpisodes: EpisodeSeasonInfo[] = [
      { seasonNumber: 1, episodeNumber: 1 },
      { seasonNumber: 1, episodeNumber: 2 },
      { seasonNumber: 2, episodeNumber: 1 },
    ];

    expect(isSeasonFinale({ seasonNumber: 1, episodeNumber: 1 }, allEpisodes, 'Ended')).toBe(false);
  });
});
