#!/usr/bin/env node
/**
 * inspect-match.js
 *
 * Given an export file and a match ID, prints each goal event and the
 * 5 events that led up to it so you can trace how a goal was scored.
 *
 * Usage:
 *   node dev-tools/export-analysis/inspect-match.js <path-to-export.json> <matchId>
 */

import fs from 'fs';

const [filePath, matchId] = process.argv.slice(2);
if (!filePath || !matchId) {
  console.error('Usage: node inspect-match.js <path-to-export.json> <matchId>');
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
console.log(`\nMatch: ${homeTeam} ${match.homeScore ?? '?'} – ${match.awayScore ?? '?'} ${awayTeam}  (week ${match.week})`);

// Key events (summary level)
if (match.keyEvents?.length) {
  console.log(`\n── Key Events (${match.keyEvents.length}) ──`);
  match.keyEvents.forEach((ke, idx) => {
    const players = (ke.playerIds ?? []).map((id) => {
      const p = data.players?.find((x) => x.id === id);
      return p ? `${p.name} (${p.position})` : id;
    });
    console.log(`[${idx}] ${ke.time}' ${ke.type}  ${players.join(', ')}`);
    console.log(`     "${ke.description}"`);
  });
}

// Full play-by-play: print goals + preceding 5 events
const events = match.matchState?.events ?? match.events;
if (events?.length) {
  console.log(`\n── Play-by-play goals with context (${events.length} total events) ──`);
  events.forEach((e, idx) => {
    if (e.type !== 'GOAL') return;
    const start = Math.max(0, idx - 5);
    console.log(`\nGoal at minute ${e.time} — scorer ${e.playerIds?.[0]}`);
    for (let i = start; i <= idx; i++) {
      const pe = events[i];
      const marker = i === idx ? '>>>' : '   ';
      console.log(
        `${marker} [${i}] ${pe.type} players=[${pe.playerIds?.join(', ')}] success=${pe.success} data=${JSON.stringify(pe.additionalData ?? {})}`,
      );
    }
  });
} else {
  console.log('\n(No full play-by-play events found on this match record.)');
}
