#!/usr/bin/env node
/**
 * inspect-match-report.js
 *
 * Prints the match report (scorers, assisters, ratings) for a given match.
 * Highlights any players with goals or assists.
 *
 * Usage:
 *   node dev-tools/export-analysis/inspect-match-report.js <path-to-export.json> <matchId> [playerId]
 *
 * If a playerId is provided, the full stats row for that player is printed
 * alongside the goal/assist highlights.
 */

import fs from 'fs';

const [filePath, matchId, focusPlayerId] = process.argv.slice(2);
if (!filePath || !matchId) {
  console.error('Usage: node inspect-match-report.js <path-to-export.json> <matchId> [playerId]');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const match = data.matches?.find((m) => m.id === matchId);
if (!match) {
  console.error(`Match "${matchId}" not found in export.`);
  process.exit(1);
}

const homeTeam = data.teams?.find((t) => t.id === match.homeTeamId)?.name ?? match.homeTeamId;
const awayTeam = data.teams?.find((t) => t.id === match.awayTeamId)?.name ?? match.awayTeamId;

console.log(`\nMatch Report — ${homeTeam} ${match.homeScore ?? '?'} – ${match.awayScore ?? '?'} ${awayTeam}  (week ${match.week})`);
console.log(`Final Score: ${match.matchReport?.finalScore ?? 'n/a'}`);

const printStats = (label, stats) => {
  console.log(`\n── ${label} ──`);
  if (!stats?.length) { console.log('  (no data)'); return; }
  stats.forEach((ps) => {
    const hasFocus = focusPlayerId && ps.playerId === focusPlayerId;
    const hasGoalOrAssist = ps.goals > 0 || ps.assists > 0;
    if (hasFocus || hasGoalOrAssist) {
      const tag = hasFocus ? ' ◀ FOCUS' : '';
      console.log(
        `  ${ps.playerName} (${ps.position})${tag}` +
        ` | Goals: ${ps.goals}` +
        ` | Assists: ${ps.assists}` +
        ` | Rating: ${ps.rating?.toFixed(1) ?? '?'}` +
        ` | Saves: ${ps.saves ?? 0}`,
      );
    }
  });
};

printStats(`${homeTeam} (home)`, match.matchReport?.homePlayerStats);
printStats(`${awayTeam} (away)`, match.matchReport?.awayPlayerStats);

if (focusPlayerId) {
  const player = data.players?.find((p) => p.id === focusPlayerId);
  console.log(`\nFocus player: ${player ? `${player.name} (${player.position})` : focusPlayerId}`);
}
