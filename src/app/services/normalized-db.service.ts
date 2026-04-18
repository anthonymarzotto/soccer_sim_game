import { Injectable, inject } from '@angular/core';
import {
  AppDbService,
  PersistedLeagueMetadataRecord
} from './app-db.service';
import {
  LeagueAssemblyService,
  LEAGUE_METADATA_KEY,
  PersistedLeagueMetadata,
  PersistedLeagueSnapshot,
  PersistedTeam
} from './league-assembly.service';
import { League, Match, Player, Team } from '../models/types';
import { normalizeTeamRoster, resolveTeamPlayers } from '../models/team-players';

const TABLE_TEAMS = 'teams';
const TABLE_PLAYERS = 'players';
const TABLE_MATCHES = 'matches';
const TABLE_LEAGUE_METADATA = 'leagueMetadata';

@Injectable({
  providedIn: 'root'
})
export class NormalizedDbService {
  private readonly appDb = inject(AppDbService);
  private readonly leagueAssembly = inject(LeagueAssemblyService);

  async loadLeague(): Promise<League | null> {
    const [teams, players, schedule, metadata] = await Promise.all([
      this.loadTeams(),
      this.loadPlayers(),
      this.loadSchedule(),
      this.loadLeagueMetadata()
    ]);

    const snapshot: PersistedLeagueSnapshot = {
      teams,
      players,
      schedule,
      metadata
    };

    return this.leagueAssembly.assembleLeague(snapshot);
  }

  async saveLeague(league: League): Promise<void> {
    const snapshot = this.leagueAssembly.flattenLeague(league);

    await this.appDb.withDb(async db => {
      await db.transaction('rw', db.teams, db.players, db.matches, db.leagueMetadata, async () => {
        await db.teams.clear();
        await db.players.clear();
        await db.matches.clear();

        if (snapshot.teams.length > 0) {
          await db.teams.bulkPut(snapshot.teams);
        }

        if (snapshot.players.length > 0) {
          await db.players.bulkPut(snapshot.players);
        }

        if (snapshot.schedule.length > 0) {
          await db.matches.bulkPut(snapshot.schedule);
        }

        if (snapshot.metadata) {
          await db.leagueMetadata.put(snapshot.metadata as PersistedLeagueMetadataRecord);
        }
      });
    });
  }

  async clearLeagueData(): Promise<void> {
    await this.appDb.withDb(async db => {
      await db.transaction('rw', db.teams, db.players, db.matches, db.leagueMetadata, async () => {
        await db.teams.clear();
        await db.players.clear();
        await db.matches.clear();
        await db.leagueMetadata.clear();
      });
    });
  }

  async loadTeams(): Promise<PersistedTeam[]> {
    return this.appDb.getAllFromTable<PersistedTeam>(TABLE_TEAMS);
  }

  async saveTeamFromLeague(team: Team): Promise<void> {
    const normalizedTeam = normalizeTeamRoster(team);
    const persistedTeam = this.leagueAssembly.toPersistedTeams([normalizedTeam])[0];
    const players = resolveTeamPlayers(normalizedTeam);

    await this.appDb.withDb(async db => {
      await db.transaction('rw', db.teams, db.players, async () => {
        await db.teams.put(persistedTeam);

        const existingPlayerIdsForTeam = (await db.players.where('teamId').equals(team.id).primaryKeys()) as string[];
        const incomingPlayerIds = new Set(players.map(player => player.id));
        const deletedPlayerIds = existingPlayerIdsForTeam.filter(id => !incomingPlayerIds.has(id));

        if (deletedPlayerIds.length > 0) {
          await db.players.bulkDelete(deletedPlayerIds);
        }

        if (players.length > 0) {
          await db.players.bulkPut(players);
        }
      });
    });
  }

  async saveTeamDefinitionFromLeague(team: Team): Promise<void> {
    const persistedTeam = this.leagueAssembly.toPersistedTeams([normalizeTeamRoster(team)])[0];
    await this.appDb.bulkPutToTable(TABLE_TEAMS, [persistedTeam]);
  }

  async saveMatchResultFromLeague(match: Match, teams: Team[]): Promise<void> {
    const normalizedTeams = teams.map(team => normalizeTeamRoster(team));
    const persistedTeams = this.leagueAssembly.toPersistedTeams(normalizedTeams);
    const players = normalizedTeams.flatMap(team => resolveTeamPlayers(team));

    await this.appDb.withDb(async db => {
      await db.transaction('rw', db.teams, db.players, db.matches, async () => {
        if (persistedTeams.length > 0) {
          await db.teams.bulkPut(persistedTeams);
        }

        if (players.length > 0) {
          await db.players.bulkPut(players);
        }

        await db.matches.put(match);
      });
    });
  }

  async loadPlayers(): Promise<Player[]> {
    return this.appDb.getAllFromTable<Player>(TABLE_PLAYERS);
  }

  async loadSchedule(): Promise<Match[]> {
    return this.appDb.getAllFromTable<Match>(TABLE_MATCHES);
  }

  async saveMatch(match: Match): Promise<void> {
    await this.appDb.bulkPutToTable(TABLE_MATCHES, [match]);
  }

  async loadLeagueMetadata(): Promise<PersistedLeagueMetadata | null> {
    const records = await this.appDb.getAllFromTable<PersistedLeagueMetadata>(TABLE_LEAGUE_METADATA);
    return records.find(record => record.key === LEAGUE_METADATA_KEY) ?? null;
  }

  async saveLeagueMetadata(metadata: Pick<PersistedLeagueMetadata, 'currentWeek' | 'currentSeasonYear' | 'userTeamId'>): Promise<void> {
    const nextRecord = this.leagueAssembly.toLeagueMetadata(metadata);

    await this.appDb.bulkPutToTable(TABLE_LEAGUE_METADATA, [nextRecord]);
  }
}
