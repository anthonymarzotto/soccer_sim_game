import { PlayerCareerStats } from './types';

export function createEmptyPlayerCareerStats(): PlayerCareerStats {
  return {
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
  };
}
