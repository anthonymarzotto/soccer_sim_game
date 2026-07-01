#!/usr/bin/env node
/**
 * check-gk-assists.js
 *
 * Scans a full game export for any goalkeeper assist credits and reports
 * how widespread the issue is across all played matches.
 *
 * Usage:
 *   node dev-tools/export-analysis/check-gk-assists.js <path-to-export.json>
 */

import fs from 'fs';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node check-gk-assists.js <path-to-export.json>');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

let matchesWithGkAssist = 0;
let totalMatches = 0;
let totalGkAssists = 0;

data.matches.forEach((m) => {
  if (!m.played || !m.matchReport) return;
  totalMatches++;

  const homeGkStats = m.matchReport.homePlayerStats.find((ps) => ps.position === 'GK');
  const awayGkStats = m.matchReport.awayPlayerStats.find((ps) => ps.position === 'GK');

  const homeGkAssists = homeGkStats?.assists ?? 0;
  const awayGkAssists = awayGkStats?.assists ?? 0;

  if (homeGkAssists > 0 || awayGkAssists > 0) {
    matchesWithGkAssist++;
    const homeTeam = data.teams.find((t) => t.id === m.homeTeamId)?.name ?? m.homeTeamId;
    const awayTeam = data.teams.find((t) => t.id === m.awayTeamId)?.name ?? m.awayTeamId;
    console.log(`Match ID: ${m.id} | Week ${m.week} | ${homeTeam} vs ${awayTeam}`);
    if (homeGkAssists > 0) {
      console.log(`  Home GK ${homeGkStats.playerName} — ${homeGkAssists} assist(s)`);
      totalGkAssists += homeGkAssists;
    }
    if (awayGkAssists > 0) {
      console.log(`  Away GK ${awayGkStats.playerName} — ${awayGkAssists} assist(s)`);
      totalGkAssists += awayGkAssists;
    }
  }
});

console.log(`\nPlayed matches checked : ${totalMatches}`);
console.log(`Matches with GK assist : ${matchesWithGkAssist} (${((matchesWithGkAssist / totalMatches) * 100).toFixed(2)}%)`);
console.log(`Total GK assists       : ${totalGkAssists}`);
