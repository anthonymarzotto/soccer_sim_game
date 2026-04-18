import { createEmptyPlayerCareerStats } from './player-career-stats';

describe('player-career-stats defaults', () => {
  it('should include all tracked fields with zero defaults', () => {
    const stats = createEmptyPlayerCareerStats(2026, 'team-1');

    expect(stats).toEqual({
      seasonYear: 2026,
      teamId: 'team-1',
      matchesPlayed: 0,
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
      foulsSuffered: 0
    });
  });
});
