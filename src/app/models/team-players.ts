import { isDevMode } from '@angular/core';
import { Player, Team } from './types';
import { getLatestTeamSeasonSnapshot } from './season-history';

function checkInvariant(team: Team, issues: string[]): void {
  if (issues.length === 0) {
    return;
  }

  if (isDevMode()) {
    const message = `Team playerIds mismatch for ${team.name} (${team.id}): ${issues.join('; ')}`;
    throw new Error(message);
  }
}

export function getTeamPlayerInvariantIssues(team: Team, explicitPlayers?: Player[]): string[] {
  const sourcePlayers = explicitPlayers ?? team.players;
  const snapshot = getLatestTeamSeasonSnapshot(team);
  const issues: string[] = [];

  if (!snapshot) {
    issues.push('missing latest season snapshot');
    return issues;
  }

  const snapshotPlayerIds = snapshot.playerIds;

  const duplicatePlayerIds = snapshotPlayerIds.filter((playerId, index) => snapshotPlayerIds.indexOf(playerId) !== index);
  if (duplicatePlayerIds.length > 0) {
    issues.push(`duplicate playerIds: ${duplicatePlayerIds.join(', ')}`);
  }

  const sourceIds = sourcePlayers.map(player => player.id);
  const duplicateSourceIds = sourceIds.filter((playerId, index) => sourceIds.indexOf(playerId) !== index);
  if (duplicateSourceIds.length > 0) {
    issues.push(`duplicate players: ${duplicateSourceIds.join(', ')}`);
  }

  const sourceIdSet = new Set(sourceIds);
  const missingPlayers = snapshotPlayerIds.filter(playerId => !sourceIdSet.has(playerId));
  if (missingPlayers.length > 0) {
    issues.push(`missing players for ids: ${missingPlayers.join(', ')}`);
  }

  const playerIdSet = new Set(snapshotPlayerIds);
  const extraPlayers = sourceIds.filter(playerId => !playerIdSet.has(playerId));
  if (extraPlayers.length > 0) {
    issues.push(`players missing from playerIds: ${extraPlayers.join(', ')}`);
  }

  return issues;
}

export function normalizeTeamRoster(team: Team, explicitPlayers?: Player[]): Team {
  const sourcePlayers = explicitPlayers ?? team.players;
  const snapshot = getLatestTeamSeasonSnapshot(team);
  const seasonSnapshots = team.seasonSnapshots ?? {};
  const preferredPlayerIds = snapshot?.playerIds ?? [];
  const uniquePlayers: Player[] = [];
  const seenIds = new Set<string>();

  for (const player of sourcePlayers) {
    if (seenIds.has(player.id)) {
      continue;
    }

    seenIds.add(player.id);
    uniquePlayers.push(player);
  }

  const playersById = new Map(uniquePlayers.map(player => [player.id, player]));
  const orderedPlayers: Player[] = [];
  const orderedIds = new Set<string>();

  for (const playerId of preferredPlayerIds) {
    const player = playersById.get(playerId);
    if (!player || orderedIds.has(playerId)) {
      continue;
    }

    orderedPlayers.push(player);
    orderedIds.add(playerId);
  }

  const extraPlayers = uniquePlayers.filter(player => !orderedIds.has(player.id));
  const normalizedPlayers = [...orderedPlayers, ...extraPlayers];

  return {
    ...team,
    players: normalizedPlayers,
    playerIds: normalizedPlayers.map(player => player.id),
    seasonSnapshots: snapshot ? {
      ...seasonSnapshots,
      [snapshot.seasonYear]: {
        ...snapshot,
        playerIds: normalizedPlayers.map(player => player.id)
      }
    } : seasonSnapshots
  };
}

/**
 * Resolve team players in canonical playerIds order. Teams must already be normalized.
 */
export function resolveTeamPlayers(team: Team, explicitPlayers?: Player[]): Player[] {
  const issues = getTeamPlayerInvariantIssues(team, explicitPlayers);
  checkInvariant(team, issues);
  return normalizeTeamRoster(team, explicitPlayers).players;
}
