import { Injectable, isDevMode } from '@angular/core';
import { League, Match, Player, PlayerSeasonAttributes, Team } from '../models/types';
import { normalizeTeamRoster } from '../models/team-players';
import {
  getTeamSeasonSnapshotForYear,
  withSortedUniqueSeasons
} from '../models/season-history';
import { STAT_KEYS, buildStat, isValidStatValue } from '../models/stat-definitions';
import {
  PersistedPlayerRecord,
  PersistedPlayerSeasonAttributesRecord
} from './app-db.service';

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
  players: PersistedPlayerRecord[];
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
      const currentSnapshot = getTeamSeasonSnapshotForYear(normalizedTeam, resolvedSeasonYear);
      if (!currentSnapshot) {
        throw new Error(
          `toPersistedTeams: missing season snapshot for year ${resolvedSeasonYear} on team "${normalizedTeam.id}". ` +
          `Persisting would silently corrupt season history. Ensure current-season records exist before saving.`
        );
      }
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

  extractPlayers(teams: Team[], seasonYear?: number): PersistedPlayerRecord[] {
    const resolvedSeasonYear = seasonYear ?? this.resolveCurrentSeasonYear(teams);

    return teams.flatMap(team => normalizeTeamRoster(team).players.map(player => {
      const seasonAttributes = withSortedUniqueSeasons(player.seasonAttributes ?? []);
      const hasCurrentSeasonAttrs = seasonAttributes.some(attrs => attrs.seasonYear === resolvedSeasonYear);
      if (!hasCurrentSeasonAttrs) {
        throw new Error(
          `extractPlayers: missing season-${resolvedSeasonYear} seasonAttributes for player "${player.id}" (${player.name}). ` +
          `Persisting would silently corrupt season history. Ensure current-season records exist before saving.`
        );
      }

      const birthdayDate = player.personal.birthday instanceof Date
        ? player.personal.birthday
        : new Date(player.personal.birthday as unknown as string);
      if (isNaN(birthdayDate.getTime())) {
        throw new Error(
          `extractPlayers: invalid birthday for player "${player.id}" (${player.name}): "${player.personal.birthday}"`
        );
      }

      return {
        id: player.id,
        name: player.name,
        teamId: player.teamId,
        position: player.position,
        role: player.role,
        personal: {
          height: player.personal.height,
          weight: player.personal.weight,
          nationality: player.personal.nationality,
          birthday: birthdayDate.toISOString()
        },
        seasonAttributes: seasonAttributes.map(attrs => this.serializeSeasonAttributes(attrs)),
        careerStats: player.careerStats
      };
    }));
  }

  private serializeSeasonAttributes(attrs: PlayerSeasonAttributes): PersistedPlayerSeasonAttributesRecord {
    const values: Record<string, number> = {};
    for (const key of STAT_KEYS) {
      values[key] = attrs[key].value;
    }
    return { seasonYear: attrs.seasonYear, values };
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
    const players = this.extractPlayers(league.teams, league.currentSeasonYear);
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

    const currentSeasonYear = snapshot.metadata?.currentSeasonYear ?? new Date().getFullYear();

    const hydratedPlayers: (Player | null)[] = snapshot.players.map(record => this.hydratePersistedPlayer(record, currentSeasonYear));
    if (hydratedPlayers.some(player => player === null)) {
      return null;
    }

    const hydratedPlayersNonNull = hydratedPlayers as Player[];
    const playersById = new Map(hydratedPlayersNonNull.map(player => [player.id, player]));
    const playersByTeamId = new Map<string, Player[]>();

    for (const player of hydratedPlayersNonNull) {
      const current = playersByTeamId.get(player.teamId) ?? [];
      current.push(player);
      playersByTeamId.set(player.teamId, current);
    }

    const teams: (Team | null)[] = snapshot.teams.map(teamRecord => {
      const seasonSnapshot = teamRecord.seasonSnapshots.find(s => s.seasonYear === currentSeasonYear);
      if (!seasonSnapshot) {
        const message =
          `assembleLeague: missing season-${currentSeasonYear} snapshot for team "${teamRecord.id}". ` +
          `Persisted data is incompatible; reset required.`;
        if (isDevMode()) {
          throw new Error(message);
        }
        return null;
      }

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

    if (teams.some(t => t === null)) {
      return null;
    }

    return {
      teams: teams as Team[],
      schedule: snapshot.schedule.map(match => ({
        ...match,
        seasonYear: match.seasonYear ?? currentSeasonYear
      })),
      currentWeek: snapshot.metadata?.currentWeek ?? 1,
      currentSeasonYear,
      userTeamId: snapshot.metadata?.userTeamId
    };
  }

  private hydratePersistedPlayer(record: PersistedPlayerRecord, currentSeasonYear: number): Player | null {
    const rehydratedAttributes = this.rehydrateSeasonAttributes(record.seasonAttributes ?? []);
    if (!rehydratedAttributes) {
      const message =
        `assembleLeague: invalid or out-of-range stat value in seasonAttributes for player "${record.id}" (${record.name}). ` +
        `Persisted data is incompatible; reset required.`;
      if (isDevMode()) {
        throw new Error(message);
      }
      return null;
    }
    const seasonAttributes = withSortedUniqueSeasons(rehydratedAttributes);
    const currentAttrs = seasonAttributes.find(attrs => attrs.seasonYear === currentSeasonYear);

    if (!currentAttrs) {
      const message =
        `assembleLeague: missing season-${currentSeasonYear} seasonAttributes for player "${record.id}" (${record.name}). ` +
        `Persisted data is incompatible; reset required.`;
      if (isDevMode()) {
        throw new Error(message);
      }
      return null;
    }

    const personal = this.rehydratePersonal(record.personal);
    if (!personal) {
      const message =
        `assembleLeague: invalid personal.birthday for player "${record.id}" (${record.name}). ` +
        `Persisted data is incompatible; reset required.`;
      if (isDevMode()) {
        throw new Error(message);
      }
      return null;
    }

    return {
      id: record.id,
      name: record.name,
      teamId: record.teamId,
      position: record.position,
      role: record.role,
      personal,
      seasonAttributes,
      careerStats: record.careerStats
    };
  }

  private rehydrateSeasonAttributes(records: PersistedPlayerSeasonAttributesRecord[]): PlayerSeasonAttributes[] | null {
    const result: PlayerSeasonAttributes[] = [];
    for (const record of records) {
      const values = record.values ?? {};
      const built: Partial<PlayerSeasonAttributes> = { seasonYear: record.seasonYear };
      for (const key of STAT_KEYS) {
        const value = (values as Record<string, unknown>)[key];
        if (!isValidStatValue(value)) {
          return null;
        }
        (built as Record<string, unknown>)[key] = buildStat(key, value);
      }
      // Safe: the loop above covers every key in STAT_KEYS, and any missing/invalid
      // value causes an early return null, so all required fields are present here.
      result.push(built as PlayerSeasonAttributes);
    }
    return result;
  }

  private rehydratePersonal(personal: { height: number; weight: number; nationality: string; birthday: Date | string }): Player['personal'] | null {
    const birthday = personal.birthday instanceof Date ? personal.birthday : new Date(personal.birthday);
    if (Number.isNaN(birthday.getTime())) {
      return null;
    }
    return {
      height: personal.height,
      weight: personal.weight,
      nationality: personal.nationality,
      birthday
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
