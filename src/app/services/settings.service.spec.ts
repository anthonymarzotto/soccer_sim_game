import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SettingsService } from './settings.service';
import { PersistenceService } from './persistence.service';
import { APP_DATA_SCHEMA_VERSION } from '../constants';

describe('SettingsService', () => {
  function setup(loadSettingsValue: { badgeStyle?: string; version?: string } | null) {
    TestBed.resetTestingModule();

    const persistenceSpy: Pick<PersistenceService, 'loadSettings' | 'saveSettings' | 'clearSettings'> = {
      loadSettings: vi.fn().mockResolvedValue(loadSettingsValue),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      clearSettings: vi.fn().mockResolvedValue(undefined)
    };

    TestBed.configureTestingModule({
      providers: [
        SettingsService,
        { provide: PersistenceService, useValue: persistenceSpy as PersistenceService }
      ]
    });

    const service = TestBed.inject(SettingsService);
    return { service, persistenceSpy };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('should hydrate settings from persistence', async () => {
    const { service, persistenceSpy } = setup({
      badgeStyle: 'shield',
      version: APP_DATA_SCHEMA_VERSION
    });
    await service.ensureHydrated();
    TestBed.flushEffects();

    expect(persistenceSpy.loadSettings).toHaveBeenCalled();
    expect(service.badgeStyle()).toBe('shield');
  });

  it('should fallback to default badge style for invalid persisted value', async () => {
    const { service } = setup({
      badgeStyle: 'invalid-style',
      version: APP_DATA_SCHEMA_VERSION
    });
    await service.ensureHydrated();
    TestBed.flushEffects();

    expect(service.badgeStyle()).toBe('initials');
  });

  it('should persist badge style changes after hydration', async () => {
    const { service, persistenceSpy } = setup({
      badgeStyle: 'shield',
      version: APP_DATA_SCHEMA_VERSION
    });
    await service.ensureHydrated();
    TestBed.flushEffects();

    service.setBadgeStyle('jersey');
    TestBed.flushEffects();

    expect(persistenceSpy.saveSettings).toHaveBeenCalledWith({
      badgeStyle: 'jersey',
      version: APP_DATA_SCHEMA_VERSION
    });
  });

  it('should keep defaults and set mismatch flag when persisted version is missing', async () => {
    const { service } = setup({ badgeStyle: 'shield' });
    await service.ensureHydrated();
    TestBed.flushEffects();

    expect(service.badgeStyle()).toBe('initials');
    expect(service.hasPersistedSettingsVersionMismatch()).toBe(true);
  });

  it('should keep defaults and set mismatch flag when persisted version is outdated', async () => {
    const { service } = setup({
      badgeStyle: 'shield',
      version: '0.0.1'
    });
    await service.ensureHydrated();
    TestBed.flushEffects();

    expect(service.badgeStyle()).toBe('initials');
    expect(service.hasPersistedSettingsVersionMismatch()).toBe(true);
  });

  it('should reset to defaults and clear persisted settings key', async () => {
    const { service, persistenceSpy } = setup({
      badgeStyle: 'hexagon',
      version: APP_DATA_SCHEMA_VERSION
    });
    await service.ensureHydrated();
    TestBed.flushEffects();

    await service.resetToDefaultsAndClearPersisted();
    TestBed.flushEffects();

    expect(service.badgeStyle()).toBe('initials');
    expect(persistenceSpy.clearSettings).toHaveBeenCalled();
  });
});
