import { Injectable } from '@angular/core';
import { League, Match, Player, Team } from '../models/types';
import { normalizeTeamRoster } from '../models/team-players';
import {
  createEmptyTeamStats,
  getCurrentTeamSeasonSnapshot,
  withSortedUniqueSeasons
} from '../models/season-history';

export const LEAGUE_METADATA_KEY = 'default';

export interface PersistedLeagueMetadata {
  key: string;
  currentWeek: number;
  currentSeasonYear: number;
  userTeamId?: string;
  updatedAt: number;
}

export interface PersistedTeam {
  id: string;
  name: string;
  selectedFormationId: string;
  formationAssignments: Record<string, string>;
  seasonSnapshots: NonNullable<Team['seasonSnapshots']>;
}

export interface PersistedLeagueSnapshot {
  teams: PersistedTeam[];
  players: Player[];
  schedule: Match[];
  metadata: PersistedLeagueMetadata | null;
}

@Injectable({
  providedIn: 'root'
})
export class LeagueAssemblyService {
  toPersistedTeams(teams: Team[], seasonYear?: number): PersistedTeam[] {
    const resolvedSeasonYear = seasonYear ?? this.resolveCurrentSeasonYear(teams);

    return teams.map(team => {
      const normalizedTeam = normalizeTeamRoster(team);
      const currentSnapshot = getCurrentTeamSeasonSnapshot(normalizedTeam, resolvedSeasonYear);
      const seasonSnapshots = normalizedTeam.seasonSnapshots ?? [];
      const seasonSnapshotsWithoutCurrent = seasonSnapshots.filter(
        snapshot => snapshot.seasonYear !== currentSnapshot.seasonYear
      );

      return {
        id: normalizedTeam.id,
        name: normalizedTeam.name,
        selectedFormationId: normalizedTeam.selectedFormationId,
        formationAssignments: normalizedTeam.formationAssignments,
        seasonSnapshots: withSortedUniqueSeasons([
          ...seasonSnapshotsWithoutCurrent,
          {
            seasonYear: currentSnapshot.seasonYear,
            playerIds: [...currentSnapshot.playerIds],
            stats: {
              ...currentSnapshot.stats,
              last5: [...currentSnapshot.stats.last5]
            }
          }
        ])
      };
    });
  }

  extractPlayers(teams: Team[]): Player[] {
    return teams.flatMap(team => normalizeTeamRoster(team).players.map(player => ({
      ...player,
      seasonAttributes: withSortedUniqueSeasons(player.seasonAttributes ?? [])
    })));
  }

  toLeagueMetadata(league: Pick<League, 'currentWeek' | 'currentSeasonYear' | 'userTeamId'>): PersistedLeagueMetadata {
    return {
      key: LEAGUE_METADATA_KEY,
      currentWeek: league.currentWeek,
      currentSeasonYear: league.currentSeasonYear,
      userTeamId: league.userTeamId,
      updatedAt: Date.now()
    };
  }

  flattenLeague(league: League): PersistedLeagueSnapshot {
    const players = this.extractPlayers(league.teams);
    const teams = this.toPersistedTeams(league.teams, league.currentSeasonYear);
    const schedule = league.schedule.map(match => ({
      ...match,
      seasonYear: match.seasonYear ?? league.currentSeasonYear
    }));

    return {
      teams,
      players,
      schedule,
      metadata: this.toLeagueMetadata(league)
    };
  }

  assembleLeague(snapshot: PersistedLeagueSnapshot): League | null {
    const hasAnyData = snapshot.teams.length > 0 || snapshot.players.length > 0 || snapshot.schedule.length > 0;
    if (!hasAnyData && !snapshot.metadata) {
      return null;
    }

    const playersById = new Map(snapshot.players.map(player => [player.id, player]));
    const playersByTeamId = new Map<string, Player[]>();

    for (const player of snapshot.players) {
      const current = playersByTeamId.get(player.teamId) ?? [];
      current.push(player);
      playersByTeamId.set(player.teamId, current);
    }

    const currentSeasonYear = snapshot.metadata?.currentSeasonYear ?? new Date().getFullYear();
    const teams: Team[] = snapshot.teams.map(teamRecord => {
      const seasonSnapshot = getCurrentTeamSeasonSnapshot({
        id: teamRecord.id,
        name: teamRecord.name,
        players: [],
        playerIds: [],
        stats: createEmptyTeamStats(),
        selectedFormationId: teamRecord.selectedFormationId,
        formationAssignments: teamRecord.formationAssignments,
        seasonSnapshots: withSortedUniqueSeasons(teamRecord.seasonSnapshots)
      }, currentSeasonYear);

      const orderedPlayers: Player[] = seasonSnapshot.playerIds
        .map(playerId => playersById.get(playerId))
        .filter((player): player is Player => player !== undefined);

      const missingFromOrder = (playersByTeamId.get(teamRecord.id) ?? []).filter(
        player => !seasonSnapshot.playerIds.includes(player.id)
      );

      return normalizeTeamRoster({
        id: teamRecord.id,
        name: teamRecord.name,
        players: [...orderedPlayers, ...missingFromOrder],
        playerIds: seasonSnapshot.playerIds,
        stats: seasonSnapshot.stats,
        selectedFormationId: teamRecord.selectedFormationId,
        formationAssignments: teamRecord.formationAssignments,
        seasonSnapshots: withSortedUniqueSeasons(teamRecord.seasonSnapshots)
      });
    });

    return {
      teams,
      schedule: snapshot.schedule.map(match => ({
        ...match,
        seasonYear: match.seasonYear ?? currentSeasonYear
      })),
      currentWeek: snapshot.metadata?.currentWeek ?? 1,
      currentSeasonYear,
      userTeamId: snapshot.metadata?.userTeamId
    };
  }

  private resolveCurrentSeasonYear(teams: Team[]): number {
    const latestYear = teams
      .flatMap(team => (team.seasonSnapshots ?? []).map(snapshot => snapshot.seasonYear))
      .reduce<number | null>((maxYear, seasonYear) => {
        if (maxYear === null || seasonYear > maxYear) {
          return seasonYear;
        }

        return maxYear;
      }, null);

    return latestYear ?? new Date().getFullYear();
  }
}
