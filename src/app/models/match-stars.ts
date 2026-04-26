import { PlayerStatistics } from './types';

export interface MatchStarEntry {
  rank: 1 | 2 | 3;
  stats: PlayerStatistics;
  teamId: string;
}

/**
 * Determine the top-3 "Stars of the Game" across both teams.
 *
 * Players with rating === 0 (bench players who never entered) are excluded.
 *
 * Tie-break order:
 *   1. Higher rating
 *   2. Player on the winning team (pass null for a draw)
 *   3. Goals
 *   4. Saves
 *   5. Assists
 *   6. Fewer cards (yellow + red)
 *   7. Stable playerId ordering (lexicographic)
 */
export function rankThreeStars(
  homePlayerStats: PlayerStatistics[],
  awayPlayerStats: PlayerStatistics[],
  winningTeamId: string | null,
  homeTeamId: string,
  awayTeamId: string
): MatchStarEntry[] {
  const candidates = [
    ...homePlayerStats.map(s => ({ stats: s, teamId: homeTeamId })),
    ...awayPlayerStats.map(s => ({ stats: s, teamId: awayTeamId }))
  ].filter(c => c.stats.rating > 0);

  candidates.sort((a, b) => {
    // 1. Higher rating
    if (b.stats.rating !== a.stats.rating) return b.stats.rating - a.stats.rating;

    // 2. Winning team
    const aOnWinner = winningTeamId !== null && a.teamId === winningTeamId ? 1 : 0;
    const bOnWinner = winningTeamId !== null && b.teamId === winningTeamId ? 1 : 0;
    if (bOnWinner !== aOnWinner) return bOnWinner - aOnWinner;

    // 3. Goals
    if (b.stats.goals !== a.stats.goals) return b.stats.goals - a.stats.goals;

    // 4. Saves
    if (b.stats.saves !== a.stats.saves) return b.stats.saves - a.stats.saves;

    // 5. Assists
    if (b.stats.assists !== a.stats.assists) return b.stats.assists - a.stats.assists;

    // 6. Fewer cards
    const aCards = a.stats.yellowCards + a.stats.redCards;
    const bCards = b.stats.yellowCards + b.stats.redCards;
    if (aCards !== bCards) return aCards - bCards;

    // 7. Stable playerId ordering
    return a.stats.playerId < b.stats.playerId ? -1 : a.stats.playerId > b.stats.playerId ? 1 : 0;
  });

  return candidates.slice(0, 3).map((c, i) => ({
    rank: (i + 1) as 1 | 2 | 3,
    stats: c.stats,
    teamId: c.teamId
  }));
}
