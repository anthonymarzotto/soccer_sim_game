import { PlayerCareerStats } from './types';

type PlayerCareerRatingStats = Pick<PlayerCareerStats, 'matchesPlayed' | 'totalMatchRating'>;

export function createEmptyPlayerCareerStats(seasonYear: number, teamId: string, wage = 0, marketValue?: number): PlayerCareerStats {
  return {
    seasonYear,
    teamId,
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
    starNominations: { first: 0, second: 0, third: 0 },
    wage,
    ...(marketValue !== undefined ? { marketValue } : {})
  };
}

export function scaleMatchRating(rating: number): number {
  return rating / 10;
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

export function formatGamesPlayed(stats: { matchesPlayed: number; gamesStarted?: number; gamesSubbed?: number } | undefined | null): string {
  if (!stats) return '0';
  const matches = stats.matchesPlayed ?? 0;
  const started = stats.gamesStarted;
  const subbed = stats.gamesSubbed;

  if (started === undefined || subbed === undefined) {
    return String(matches);
  }

  if (subbed === 0) {
    return String(started);
  }

  return `${started}(${subbed})`;
}

