import { calculateAverageMatchRating, createEmptyPlayerCareerStats, formatAverageMatchRating, formatGamesPlayed } from './player-career-stats';

describe('player-career-stats defaults', () => {
  it('should include all tracked fields with zero defaults', () => {
    const stats = createEmptyPlayerCareerStats(2026, 'team-1');

    expect(stats).toEqual({
      seasonYear: 2026,
      teamId: 'team-1',
      matchesPlayed: 0,
      gamesStarted: 0,
      gamesSubbed: 0,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      shots: 0,
      shotsOnTarget: 0,
      tackles: 0,
      interceptions: 0,
      passes: 0,
      saves: 0,
      cleanSheets: 0,
      minutesPlayed: 0,
      fouls: 0,
      foulsSuffered: 0,
      totalMatchRating: 0,
      starNominations: { first: 0, second: 0, third: 0 }
    });
  });

  it('should calculate average match rating on the 1-10 display scale', () => {
    const stats = createEmptyPlayerCareerStats(2026, 'team-1');
    stats.matchesPlayed = 4;
    stats.totalMatchRating = 278;

    expect(calculateAverageMatchRating(stats)).toBe(6.95);
    expect(formatAverageMatchRating(stats)).toBe('7.0');
  });

  it('should return null and placeholder output when no matches were played', () => {
    const stats = createEmptyPlayerCareerStats(2026, 'team-1');

    expect(calculateAverageMatchRating(stats)).toBeNull();
    expect(formatAverageMatchRating(stats)).toBe('--');
  });

  describe('formatGamesPlayed', () => {
    it('should fall back to matchesPlayed if started or subbed are undefined', () => {
      expect(formatGamesPlayed({ matchesPlayed: 5 })).toBe('5');
      expect(formatGamesPlayed(null)).toBe('0');
    });

    it('should display only starts if gamesSubbed is 0', () => {
      expect(formatGamesPlayed({ matchesPlayed: 5, gamesStarted: 5, gamesSubbed: 0 })).toBe('5');
    });

    it('should display started(subbed) if gamesSubbed is non-zero', () => {
      expect(formatGamesPlayed({ matchesPlayed: 9, gamesStarted: 5, gamesSubbed: 4 })).toBe('5(4)');
      expect(formatGamesPlayed({ matchesPlayed: 4, gamesStarted: 0, gamesSubbed: 4 })).toBe('0(4)');
    });
  });
});
