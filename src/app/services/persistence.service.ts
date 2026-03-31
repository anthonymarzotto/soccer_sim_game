import { Injectable, inject } from '@angular/core';
import { League, Match, Team } from '../models/types';
import { AppDbService } from './app-db.service';
import { NormalizedDbService } from './normalized-db.service';

export interface PersistedSettings {
  badgeStyle: string;
}

const SETTINGS_STATE_KEY = 'app-settings';
const SELECTED_WEEK_KEY = 'schedule-selected-week';

@Injectable({
  providedIn: 'root'
})
export class PersistenceService {
  private readonly appDb = inject(AppDbService);
  private readonly normalizedDb = inject(NormalizedDbService);
  private normalizedWriteQueue = Promise.resolve();

  private enqueueNormalizedWrite(operation: () => Promise<void>): Promise<void> {
    const queuedOperation = this.normalizedWriteQueue.then(operation, operation);
    this.normalizedWriteQueue = queuedOperation.catch(() => undefined);
    return queuedOperation;
  }

  async loadLeague(): Promise<League | null> {
    return this.normalizedDb.loadLeague();
  }

  async saveLeague(league: League): Promise<void> {
    await this.enqueueNormalizedWrite(() => this.normalizedDb.saveLeague(league));
  }

  async clearLeague(): Promise<void> {
    await this.enqueueNormalizedWrite(() => this.normalizedDb.clearLeagueData());
  }

  async saveLeagueMetadata(metadata: Pick<League, 'currentWeek' | 'userTeamId'>): Promise<void> {
    await this.enqueueNormalizedWrite(() => this.normalizedDb.saveLeagueMetadata(metadata));
  }

  async saveTeam(team: Team): Promise<void> {
    await this.enqueueNormalizedWrite(() => this.normalizedDb.saveTeamFromLeague(team));
  }

  async saveTeamDefinition(team: Team): Promise<void> {
    await this.enqueueNormalizedWrite(() => this.normalizedDb.saveTeamDefinitionFromLeague(team));
  }

  async saveMatchResult(match: Match, teams: Team[]): Promise<void> {
    await this.enqueueNormalizedWrite(() => this.normalizedDb.saveMatchResultFromLeague(match, teams));
  }

  async saveMatch(match: Match): Promise<void> {
    await this.enqueueNormalizedWrite(() => this.normalizedDb.saveMatch(match));
  }

  async loadSettings(): Promise<PersistedSettings | null> {
    return this.appDb.getState<PersistedSettings>(SETTINGS_STATE_KEY);
  }

  async saveSettings(settings: PersistedSettings): Promise<void> {
    await this.appDb.putState(SETTINGS_STATE_KEY, settings);
  }

  async clearSettings(): Promise<void> {
    await this.appDb.deleteState(SETTINGS_STATE_KEY);
  }

  async loadSelectedWeek(): Promise<number | null> {
    return this.appDb.getState<number>(SELECTED_WEEK_KEY);
  }

  async saveSelectedWeek(week: number): Promise<void> {
    await this.appDb.putState(SELECTED_WEEK_KEY, week);
  }

  async clearSelectedWeek(): Promise<void> {
    await this.appDb.deleteState(SELECTED_WEEK_KEY);
  }
}
