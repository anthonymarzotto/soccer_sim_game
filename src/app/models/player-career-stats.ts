import { PlayerCareerStats } from './types';

type PlayerCareerRatingStats = Pick<PlayerCareerStats, 'matchesPlayed' | 'totalMatchRating'>;

export function createEmptyPlayerCareerStats(seasonYear: number, teamId: string): PlayerCareerStats {
  return {
    seasonYear,
    teamId,
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
    foulsSuffered: 0,
    totalMatchRating: 0,
    starNominations: { first: 0, second: 0, third: 0 }
  };
}

export function calculateAverageMatchRating(stats: PlayerCareerRatingStats): number | null {
  if (stats.matchesPlayed <= 0) {
    return null;
  }

  return stats.totalMatchRating / stats.matchesPlayed / 10;
}

export function formatAverageMatchRating(stats: PlayerCareerRatingStats): string {
  const averageRating = calculateAverageMatchRating(stats);
  return averageRating === null ? '--' : averageRating.toFixed(1);
}
