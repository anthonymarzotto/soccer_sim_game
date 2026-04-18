import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import Dexie, { Table } from 'dexie';
import { Match, Player, TeamStats } from '../models/types';
import { Position, Role } from '../models/enums';

interface AppStateRecord<TValue = unknown> {
  key: string;
  value: TValue;
  updatedAt: number;
}

export interface PersistedTeamRecord {
  id: string;
  name: string;
  playerIds: string[];
  stats: TeamStats;
  selectedFormationId: string;
  formationAssignments: Record<string, string>;
}

export interface PersistedPlayerRecord {
  id: string;
  name: string;
  teamId: string;
  position: Position;
  role: Role;
  personal: Player['personal'];
  physical: Player['physical'];
  mental: Player['mental'];
  skills: Player['skills'];
  hidden: Player['hidden'];
  overall: number;
  careerStats: Player['careerStats'];
}

export type PersistedMatchRecord = Match;

export interface PersistedLeagueMetadataRecord {
  key: string;
  currentWeek: number;
  currentSeasonYear: number;
  userTeamId?: string;
  updatedAt: number;
}

export class SoccerSimDexieDatabase extends Dexie {
  appState!: Table<AppStateRecord, string>;
  teams!: Table<PersistedTeamRecord, string>;
  players!: Table<PersistedPlayerRecord, string>;
  matches!: Table<PersistedMatchRecord, string>;
  leagueMetadata!: Table<PersistedLeagueMetadataRecord, string>;

  constructor() {
    super('soccer-sim-db');

    this.version(1).stores({
      appState: '&key,updatedAt'
    });

    this.version(2).stores({
      appState: '&key,updatedAt',
      teams: '&id',
      players: '&id,teamId',
      matches: '&id,week',
      leagueMetadata: '&key,updatedAt'
    });
  }
}

@Injectable({
  providedIn: 'root'
})
export class AppDbService {
  private readonly platformId = inject(PLATFORM_ID);
  private db: SoccerSimDexieDatabase | null = null;
  private dbInitPromise: Promise<SoccerSimDexieDatabase | null> | null = null;

  async getState<TValue>(key: string): Promise<TValue | null> {
    const db = await this.getDb();
    if (!db) return null;

    const record = await db.appState.get(key);
    return record ? (record.value as TValue) : null;
  }

  async putState<TValue>(key: string, value: TValue): Promise<void> {
    const db = await this.getDb();
    if (!db) return;

    await db.appState.put({
      key,
      value,
      updatedAt: Date.now()
    });
  }

  async deleteState(key: string): Promise<void> {
    const db = await this.getDb();
    if (!db) return;

    await db.appState.delete(key);
  }

  async getAllFromTable<TValue>(tableName: string): Promise<TValue[]> {
    const db = await this.getDb();
    if (!db) return [];

    return db.table(tableName).toArray() as Promise<TValue[]>;
  }

  async bulkPutToTable<TValue>(tableName: string, values: TValue[]): Promise<void> {
    const db = await this.getDb();
    if (!db) return;

    await db.table(tableName).bulkPut(values);
  }

  async clearTable(tableName: string): Promise<void> {
    const db = await this.getDb();
    if (!db) return;

    await db.table(tableName).clear();
  }

  async withDb<TResult>(operation: (db: SoccerSimDexieDatabase) => Promise<TResult>): Promise<TResult | null> {
    const db = await this.getDb();
    if (!db) return null;

    return operation(db);
  }

  private async getDb(): Promise<SoccerSimDexieDatabase | null> {
    if (this.db) {
      return this.db;
    }

    if (this.dbInitPromise) {
      return this.dbInitPromise;
    }

    this.dbInitPromise = this.initializeDb();
    return this.dbInitPromise;
  }

  private async initializeDb(): Promise<SoccerSimDexieDatabase | null> {
    if (!isPlatformBrowser(this.platformId) || typeof indexedDB === 'undefined') {
      return null;
    }

    try {
      const database = new SoccerSimDexieDatabase();
      await database.open();
      this.db = database;
      return database;
    } catch (error) {
      console.error('Failed to initialize IndexedDB:', error);
      return null;
    }
  }
}
