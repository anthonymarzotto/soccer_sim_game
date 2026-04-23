import { isDevMode } from '@angular/core';
import { Player, PlayerSeasonAttributes, Stat, StatKey, Team, TeamSeasonSnapshot, TeamStats } from './types';

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

export function getCurrentPlayerSeasonAttributes(player: Player, seasonYear: number): PlayerSeasonAttributes {
  const current = getPlayerSeasonAttributesForYear(player, seasonYear);
  if (!current) {
    throw new Error(
      `getCurrentPlayerSeasonAttributes: missing season-${seasonYear} seasonAttributes for player "${player.id}" (${player.name}).`
    );
  }
  return current;
}

export function getStat(player: Player, seasonYear: number, key: StatKey): Stat {
  return getCurrentPlayerSeasonAttributes(player, seasonYear)[key];
}

export function getStatValue(player: Player, seasonYear: number, key: StatKey): number {
  return getStat(player, seasonYear, key).value;
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
