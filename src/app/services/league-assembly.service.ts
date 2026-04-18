import { Injectable } from '@angular/core';
import { League, Match, Player, Team } from '../models/types';
import { normalizeTeamRoster } from '../models/team-players';

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
  playerIds: string[];
  stats: Team['stats'];
  selectedFormationId: string;
  formationAssignments: Record<string, string>;
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
  toPersistedTeams(teams: Team[]): PersistedTeam[] {
    return teams.map(team => {
      const normalizedTeam = normalizeTeamRoster(team);

      return {
        id: normalizedTeam.id,
        name: normalizedTeam.name,
        playerIds: normalizedTeam.playerIds,
        stats: normalizedTeam.stats,
        selectedFormationId: normalizedTeam.selectedFormationId,
        formationAssignments: normalizedTeam.formationAssignments
      };
    });
  }

  extractPlayers(teams: Team[]): Player[] {
    return teams.flatMap(team => normalizeTeamRoster(team).players);
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
    const teams = this.toPersistedTeams(league.teams);

    return {
      teams,
      players,
      schedule: league.schedule,
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

    const teams: Team[] = snapshot.teams.map(teamRecord => {
      const orderedPlayers: Player[] = teamRecord.playerIds
        .map(playerId => playersById.get(playerId))
        .filter((player): player is Player => player !== undefined);

      const missingFromOrder = (playersByTeamId.get(teamRecord.id) ?? []).filter(
        player => !teamRecord.playerIds.includes(player.id)
      );

      return normalizeTeamRoster({
        id: teamRecord.id,
        name: teamRecord.name,
        players: [...orderedPlayers, ...missingFromOrder],
        playerIds: teamRecord.playerIds,
        stats: teamRecord.stats,
        selectedFormationId: teamRecord.selectedFormationId,
        formationAssignments: teamRecord.formationAssignments
      });
    });

    return {
      teams,
      schedule: snapshot.schedule,
      currentWeek: snapshot.metadata?.currentWeek ?? 1,
      currentSeasonYear: snapshot.metadata?.currentSeasonYear ?? new Date().getFullYear(),
      userTeamId: snapshot.metadata?.userTeamId
    };
  }
}
