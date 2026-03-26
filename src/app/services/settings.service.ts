
import { Injectable, signal, effect, computed, inject } from '@angular/core';
import { PersistenceService } from './persistence.service';


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
  private defaultSettings: Settings = {
    badgeStyle: 'initials'
  };
  private isHydrating = signal(true);
  private hydrationPromise: Promise<void> | null = null;
  private skipNextPersist = false;

  private settings = signal<Settings>(this.defaultSettings);

  badgeStyle = computed(() => this.settings().badgeStyle);

  constructor() {
    void this.ensureHydrated();

    // Auto-save settings whenever they change after hydration is complete.
    effect(() => {
      const currentSettings = this.settings();
      if (this.isHydrating()) {
        return;
      }

      if (this.skipNextPersist) {
        this.skipNextPersist = false;
        return;
      }

      void this.persistenceService.saveSettings(currentSettings);
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
      const stored = await this.persistenceService.loadSettings();
      if (stored) {
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
    this.settings.update(s => ({ ...s, badgeStyle: style }));
  }

  async resetToDefaultsAndClearPersisted(): Promise<void> {
    this.skipNextPersist = true;
    this.settings.set(this.defaultSettings);
    await this.persistenceService.clearSettings();
  }

  getBadgeStyles(): BadgeStyle[] {
    return Array.from(BADGE_STYLES);
  }
}