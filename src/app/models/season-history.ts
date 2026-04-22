import { isDevMode } from '@angular/core';
import { Player, PlayerSeasonAttributes, Team, TeamSeasonSnapshot, TeamStats } from './types';

export function createEmptyTeamStats(): TeamStats {
  return {
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
    last5: []
  };
}

export function getLatestPlayerSeasonAttributes(player: Player): PlayerSeasonAttributes | null {
  if (!player.seasonAttributes?.length) {
    return null;
  }

  return player.seasonAttributes[player.seasonAttributes.length - 1] ?? null;
}

export function getPlayerSeasonAttributesForYear(player: Player, seasonYear: number): PlayerSeasonAttributes | null {
  return (player.seasonAttributes ?? []).find(attributes => attributes.seasonYear === seasonYear) ?? null;
}

export function getCurrentPlayerSeasonAttributes(player: Player, currentSeasonYear: number): PlayerSeasonAttributes {
  const current = getPlayerSeasonAttributesForYear(player, currentSeasonYear);
  if (current) {
    return current;
  }

  const latest = getLatestPlayerSeasonAttributes(player);
  if (latest) {
    return latest;
  }

  return {
    seasonYear: currentSeasonYear,
    physical: player.physical,
    mental: player.mental,
    hidden: player.hidden,
    skills: player.skills,
    overall: player.overall
  };
}

export function getLatestTeamSeasonSnapshot(team: Team): TeamSeasonSnapshot | null {
  if (!team.seasonSnapshots?.length) {
    return null;
  }

  return team.seasonSnapshots[team.seasonSnapshots.length - 1] ?? null;
}

export function getTeamSeasonSnapshotForYear(team: Team, seasonYear: number): TeamSeasonSnapshot | null {
  return (team.seasonSnapshots ?? []).find(snapshot => snapshot.seasonYear === seasonYear) ?? null;
}

export function getCurrentTeamSeasonSnapshot(team: Team, currentSeasonYear: number): TeamSeasonSnapshot {
  const current = getTeamSeasonSnapshotForYear(team, currentSeasonYear);
  if (current) {
    return current;
  }

  const latest = getLatestTeamSeasonSnapshot(team);
  if (latest) {
    return latest;
  }

  return {
    seasonYear: currentSeasonYear,
    playerIds: [...team.playerIds],
    stats: { ...team.stats, last5: [...team.stats.last5] }
  };
}

export function withSortedUniqueSeasons<T extends { seasonYear: number }>(records: T[]): T[] {
  const bySeason = new Map<number, T>();
  const duplicateSeasons = new Set<number>();

  for (const record of records) {
    if (bySeason.has(record.seasonYear)) {
      duplicateSeasons.add(record.seasonYear);
    }

    bySeason.set(record.seasonYear, record);
  }

  if (duplicateSeasons.size > 0 && isDevMode()) {
    const duplicateList = [...duplicateSeasons].sort((a, b) => a - b).join(', ');
    throw new Error(`Duplicate season records detected for seasonYear(s): ${duplicateList}`);
  }

  return [...bySeason.values()].sort((left, right) => left.seasonYear - right.seasonYear);
}
