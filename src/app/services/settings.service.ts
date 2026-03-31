
import { Injectable, signal, effect, computed, inject } from '@angular/core';
import { PersistenceService } from './persistence.service';
import { APP_DATA_SCHEMA_VERSION } from '../constants';
import { DataSchemaVersionService } from './data-schema-version.service';


const BADGE_STYLES = [
  'initials',
  'shield',
  'jersey',
  'dot',
  'bordered',
  'gradient',
  'text',
  'hexagon',
] as const;

export const ICON_BADGE_STYLES = [
  'shield',
  'jersey',
  'dot',
  'hexagon',
] as const;

export type BadgeStyle = typeof BADGE_STYLES[number];

export interface Settings {
  badgeStyle: BadgeStyle;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly persistenceService = inject(PersistenceService);
  private readonly dataSchemaVersionService = inject(DataSchemaVersionService);
  private readonly dataSchemaVersion = APP_DATA_SCHEMA_VERSION;
  private defaultSettings: Settings = {
    badgeStyle: 'initials'
  };
  private isHydrating = signal(true);
  private hasVersionMismatch = signal(false);
  private hydrationPromise: Promise<void> | null = null;
  private skipNextPersist = false;

  private settings = signal<Settings>(this.defaultSettings);

  badgeStyle = computed(() => this.settings().badgeStyle);
  readonly currentDataSchemaVersion = this.dataSchemaVersionService.currentDataSchemaVersion;
  readonly hasPersistedSettingsVersionMismatch = computed(
    () => this.dataSchemaVersionService.hasPersistedDataSchemaVersionMismatch() || this.hasVersionMismatch()
  );

  constructor() {
    void this.ensureHydrated();

    // Auto-save settings whenever they change after hydration is complete.
    effect(() => {
      const currentSettings = this.settings();
      if (this.isHydrating() || this.hasVersionMismatch()) {
        return;
      }

      if (this.skipNextPersist) {
        this.skipNextPersist = false;
        return;
      }

      void this.persistenceService.saveSettings({
        version: this.dataSchemaVersion,
        ...currentSettings
      }).catch(error => {
        console.error('Failed to save settings:', error);
      });
    });
  }

  ensureHydrated(): Promise<void> {
    if (this.hydrationPromise) {
      return this.hydrationPromise;
    }

    this.hydrationPromise = this.hydrateFromPersistence();
    return this.hydrationPromise;
  }

  private async hydrateFromPersistence(): Promise<void> {
    try {
      await this.dataSchemaVersionService.ensureHydrated();
      if (this.dataSchemaVersionService.hasPersistedDataSchemaVersionMismatch()) {
        return;
      }

      const stored = await this.persistenceService.loadSettings();
      if (stored) {
        if (stored.version !== this.dataSchemaVersion) {
          this.hasVersionMismatch.set(true);
          return;
        }

        this.hasVersionMismatch.set(false);
        this.settings.set(this.sanitizeSettings(stored));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      this.isHydrating.set(false);
    }
  }

  private sanitizeSettings(raw: { badgeStyle?: string }): Settings {
    const merged: Settings = {
      ...this.defaultSettings,
      ...(raw.badgeStyle ? { badgeStyle: raw.badgeStyle as BadgeStyle } : {})
    };

    if (!BADGE_STYLES.includes(merged.badgeStyle as BadgeStyle)) {
      merged.badgeStyle = this.defaultSettings.badgeStyle;
    }

    return merged;
  }

  setBadgeStyle(style: BadgeStyle): void {
    if (this.hasVersionMismatch()) {
      return;
    }

    this.settings.update(s => ({ ...s, badgeStyle: style }));
  }

  async resetToDefaultsAndClearPersisted(): Promise<void> {
    this.skipNextPersist = true;
    this.hasVersionMismatch.set(false);
    this.settings.set(this.defaultSettings);
    await this.persistenceService.clearSettings();
    await this.dataSchemaVersionService.markResolvedAfterReset();
  }

  getBadgeStyles(): BadgeStyle[] {
    return Array.from(BADGE_STYLES);
  }
}