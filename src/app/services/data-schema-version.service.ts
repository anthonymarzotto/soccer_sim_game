import { Injectable, inject, signal } from '@angular/core';
import { APP_DATA_SCHEMA_VERSION } from '../constants';
import { AppDbService } from './app-db.service';

const DATA_SCHEMA_VERSION_KEY = 'app-data-schema-version';

@Injectable({
  providedIn: 'root'
})
export class DataSchemaVersionService {
  private readonly appDb = inject(AppDbService);
  private readonly hasVersionMismatch = signal(false);
  private hydrationPromise: Promise<void> | null = null;

  readonly currentDataSchemaVersion = APP_DATA_SCHEMA_VERSION;
  readonly hasPersistedDataSchemaVersionMismatch = this.hasVersionMismatch.asReadonly();

  ensureHydrated(): Promise<void> {
    if (this.hydrationPromise) {
      return this.hydrationPromise;
    }

    this.hydrationPromise = this.hydrateSchemaVersion();
    return this.hydrationPromise;
  }

  async markResolvedAfterReset(): Promise<void> {
    this.hasVersionMismatch.set(false);
    await this.appDb.putState(DATA_SCHEMA_VERSION_KEY, this.currentDataSchemaVersion);
  }

  private async hydrateSchemaVersion(): Promise<void> {
    try {
      const persistedVersion = await this.appDb.getState<string>(DATA_SCHEMA_VERSION_KEY);

      if (persistedVersion && persistedVersion !== this.currentDataSchemaVersion) {
        this.hasVersionMismatch.set(true);
        return;
      }

      this.hasVersionMismatch.set(false);
      await this.appDb.putState(DATA_SCHEMA_VERSION_KEY, this.currentDataSchemaVersion);
    } catch (error) {
      console.error('Failed to hydrate data schema version:', error);
      this.hasVersionMismatch.set(false);
    }
  }
}