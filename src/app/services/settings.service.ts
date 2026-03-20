
import { Injectable, signal, effect, computed } from '@angular/core';


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

interface Settings {
  badgeStyle: BadgeStyle;
}

const STORAGE_KEY = 'soccer-sim-settings';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private defaultSettings: Settings = {
    badgeStyle: 'initials'
  };

  private settings = signal<Settings>(this.loadSettings());

  badgeStyle = computed(() => this.settings().badgeStyle);

  constructor() {
    // Auto-save settings to localStorage whenever they change
    effect(() => {
      const currentSettings = this.settings();
      this.saveSettings(currentSettings);
    });
  }

  private loadSettings(): Settings {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const merged: Settings = { ...this.defaultSettings, ...parsed };

        // Validate badgeStyle against the allowed BADGE_STYLES; fall back to default if invalid
        if (!BADGE_STYLES.includes(merged.badgeStyle as BadgeStyle)) {
          merged.badgeStyle = this.defaultSettings.badgeStyle;
        }

        return merged;
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
    return this.defaultSettings;
  }

  private saveSettings(settings: Settings): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  setBadgeStyle(style: BadgeStyle): void {
    this.settings.update(s => ({ ...s, badgeStyle: style }));
  }

  getBadgeStyles(): BadgeStyle[] {
    return Array.from(BADGE_STYLES);
  }
}