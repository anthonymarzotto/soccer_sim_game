import { Injectable, inject } from '@angular/core';
import { League } from '../models/types';
import { AppDbService } from './app-db.service';

export interface PersistedSettings {
  badgeStyle: string;
}

const LEAGUE_STATE_KEY = 'league-state';
const SETTINGS_STATE_KEY = 'app-settings';
const SELECTED_WEEK_KEY = 'schedule-selected-week';

@Injectable({
  providedIn: 'root'
})
export class PersistenceService {
  private readonly appDb = inject(AppDbService);

  async loadLeague(): Promise<League | null> {
    return this.appDb.getState<League>(LEAGUE_STATE_KEY);
  }

  async saveLeague(league: League): Promise<void> {
    await this.appDb.putState(LEAGUE_STATE_KEY, league);
  }

  async clearLeague(): Promise<void> {
    await this.appDb.deleteState(LEAGUE_STATE_KEY);
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
