import { Injectable, inject } from '@angular/core';
import { League, Match, Team } from '../models/types';
import { AppDbService } from './app-db.service';
import { NormalizedDbService } from './normalized-db.service';
import { DataSchemaVersionService } from './data-schema-version.service';

export interface PersistedSettings {
  version: string;
  badgeStyle: string;
  simulationVariant?: 'B';
  simulationSeed?: string;
}

export interface PersistedSettingsRecord {
  version?: string;
  badgeStyle?: string;
  simulationVariant?: string;
  simulationSeed?: string;
}

const SETTINGS_STATE_KEY = 'app-settings';
const SELECTED_WEEK_KEY = 'schedule-selected-week';

@Injectable({
  providedIn: 'root'
})
export class PersistenceService {
  private readonly appDb = inject(AppDbService);
  private readonly normalizedDb = inject(NormalizedDbService);
  private readonly dataSchemaVersionService = inject(DataSchemaVersionService);
  private normalizedWriteQueue = Promise.resolve();

  private async shouldBlockMutatingWrite(): Promise<boolean> {
    await this.dataSchemaVersionService.ensureHydrated();
    return this.dataSchemaVersionService.hasPersistedDataSchemaVersionMismatch();
  }

  private enqueueNormalizedWrite(operation: () => Promise<void>): Promise<void> {
    const queuedOperation = this.normalizedWriteQueue.then(operation, operation);
    this.normalizedWriteQueue = queuedOperation.catch(() => undefined);
    return queuedOperation;
  }

  private async doSafeNormalizedWrite(operation: () => Promise<void>): Promise<void> {
    if (await this.shouldBlockMutatingWrite()) {
      return;
    }

    await this.enqueueNormalizedWrite(operation);
  }

  private async doSafeStateWrite<TValue>(key: string, value: TValue): Promise<void> {
    if (await this.shouldBlockMutatingWrite()) {
      return;
    }

    await this.appDb.putState(key, value);
  }

  async loadLeague(): Promise<League | null> {
    return this.normalizedDb.loadLeague();
  }

  async saveLeague(league: League): Promise<void> {
    await this.doSafeNormalizedWrite(() => this.normalizedDb.saveLeague(league));
  }

  async clearLeague(): Promise<void> {
    await this.enqueueNormalizedWrite(() => this.normalizedDb.clearLeagueData());
  }

  async saveLeagueMetadata(metadata: Pick<League, 'currentWeek' | 'currentSeasonYear' | 'userTeamId'>): Promise<void> {
    await this.doSafeNormalizedWrite(() => this.normalizedDb.saveLeagueMetadata(metadata));
  }

  async saveTeam(team: Team, seasonYear: number): Promise<void> {
    await this.doSafeNormalizedWrite(() => this.normalizedDb.saveTeamFromLeague(team, seasonYear));
  }

  async saveTeamDefinition(team: Team): Promise<void> {
    await this.doSafeNormalizedWrite(() => this.normalizedDb.saveTeamDefinitionFromLeague(team));
  }

  async saveMatchResult(match: Match, teams: Team[], seasonYear: number): Promise<void> {
    await this.doSafeNormalizedWrite(() => this.normalizedDb.saveMatchResultFromLeague(match, teams, seasonYear));
  }

  async saveMatch(match: Match): Promise<void> {
    await this.doSafeNormalizedWrite(() => this.normalizedDb.saveMatch(match));
  }

  async loadSettings(): Promise<PersistedSettingsRecord | null> {
    return this.appDb.getState<PersistedSettingsRecord>(SETTINGS_STATE_KEY);
  }

  async saveSettings(settings: PersistedSettings): Promise<void> {
    await this.doSafeStateWrite(SETTINGS_STATE_KEY, settings);
  }

  async clearSettings(): Promise<void> {
    await this.appDb.deleteState(SETTINGS_STATE_KEY);
  }

  async loadSelectedWeek(): Promise<number | null> {
    return this.appDb.getState<number>(SELECTED_WEEK_KEY);
  }

  async saveSelectedWeek(week: number): Promise<void> {
    await this.doSafeStateWrite(SELECTED_WEEK_KEY, week);
  }

  async clearSelectedWeek(): Promise<void> {
    await this.appDb.deleteState(SELECTED_WEEK_KEY);
  }
}
