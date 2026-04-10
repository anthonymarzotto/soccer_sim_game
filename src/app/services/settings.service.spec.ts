import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { SettingsService } from './settings.service';
import { PersistenceService } from './persistence.service';
import { APP_DATA_SCHEMA_VERSION, SIMULATION_SEED_MAX_LENGTH } from '../constants';
import { DataSchemaVersionService } from './data-schema-version.service';

describe('SettingsService', () => {
  function setup(loadSettingsValue: { badgeStyle?: string; simulationVariant?: string; simulationSeed?: string; version?: string } | null) {
    TestBed.resetTestingModule();

    const persistenceSpy: Pick<PersistenceService, 'loadSettings' | 'saveSettings' | 'clearSettings'> = {
      loadSettings: vi.fn().mockResolvedValue(loadSettingsValue),
      saveSettings: vi.fn().mockResolvedValue(undefined),
      clearSettings: vi.fn().mockResolvedValue(undefined)
    };

    const hasSchemaMismatch = signal(false);

    const dataSchemaVersionSpy: Pick<
      DataSchemaVersionService,
      'currentDataSchemaVersion' | 'ensureHydrated' | 'hasPersistedDataSchemaVersionMismatch' | 'markResolvedAfterReset'
    > = {
      currentDataSchemaVersion: APP_DATA_SCHEMA_VERSION,
      ensureHydrated: vi.fn().mockResolvedValue(undefined),
      hasPersistedDataSchemaVersionMismatch: hasSchemaMismatch.asReadonly(),
      markResolvedAfterReset: vi.fn().mockResolvedValue(undefined)
    };

    TestBed.configureTestingModule({
      providers: [
        SettingsService,
        { provide: PersistenceService, useValue: persistenceSpy as PersistenceService },
        { provide: DataSchemaVersionService, useValue: dataSchemaVersionSpy as DataSchemaVersionService }
      ]
    });

    const service = TestBed.inject(SettingsService);
    return { service, persistenceSpy, dataSchemaVersionSpy };
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
      simulationVariant: 'B',
      simulationSeed: '',
      version: APP_DATA_SCHEMA_VERSION
    });
  });

  it('should keep defaults and set mismatch flag when persisted version is missing', async () => {
    const { service, persistenceSpy } = setup({ badgeStyle: 'shield' });
    await service.ensureHydrated();
    TestBed.flushEffects();

    expect(service.badgeStyle()).toBe('initials');
    expect(service.hasPersistedSettingsVersionMismatch()).toBe(true);
    expect(persistenceSpy.saveSettings).not.toHaveBeenCalled();
  });

  it('should keep defaults and set mismatch flag when persisted version is outdated', async () => {
    const { service, persistenceSpy } = setup({
      badgeStyle: 'shield',
      version: '0.0.1'
    });
    await service.ensureHydrated();
    TestBed.flushEffects();

    expect(service.badgeStyle()).toBe('initials');
    expect(service.hasPersistedSettingsVersionMismatch()).toBe(true);
    expect(persistenceSpy.saveSettings).not.toHaveBeenCalled();
  });

  it('should block style updates while persisted version mismatch is active', async () => {
    const { service, persistenceSpy } = setup({
      badgeStyle: 'shield',
      version: '0.0.1'
    });
    await service.ensureHydrated();
    TestBed.flushEffects();

    service.setBadgeStyle('jersey');
    TestBed.flushEffects();

    expect(service.badgeStyle()).toBe('initials');
    expect(service.hasPersistedSettingsVersionMismatch()).toBe(true);
    expect(persistenceSpy.saveSettings).not.toHaveBeenCalled();
  });

  it('should reset to defaults and clear persisted settings key', async () => {
    const { service, persistenceSpy, dataSchemaVersionSpy } = setup({
      badgeStyle: 'hexagon',
      version: APP_DATA_SCHEMA_VERSION
    });
    await service.ensureHydrated();
    TestBed.flushEffects();

    await service.resetToDefaultsAndClearPersisted();
    TestBed.flushEffects();

    expect(service.badgeStyle()).toBe('initials');
    expect(persistenceSpy.clearSettings).toHaveBeenCalled();
    expect(dataSchemaVersionSpy.markResolvedAfterReset).toHaveBeenCalled();
  });

  it('should allow persistence again after resetting mismatch state', async () => {
    const { service, persistenceSpy } = setup({
      badgeStyle: 'shield',
      version: '0.0.1'
    });
    await service.ensureHydrated();
    TestBed.flushEffects();

    await service.resetToDefaultsAndClearPersisted();
    TestBed.flushEffects();

    service.setBadgeStyle('jersey');
    TestBed.flushEffects();

    expect(service.hasPersistedSettingsVersionMismatch()).toBe(false);
    expect(service.badgeStyle()).toBe('jersey');
    expect(persistenceSpy.saveSettings).toHaveBeenCalledWith({
      badgeStyle: 'jersey',
      simulationVariant: 'B',
      simulationSeed: '',
      version: APP_DATA_SCHEMA_VERSION
    });
  });

  it('should sanitize persisted simulation seed by trimming and enforcing max length', async () => {
    const persistedSeed = `   ${'x'.repeat(SIMULATION_SEED_MAX_LENGTH + 12)}   `;
    const expectedSeed = 'x'.repeat(SIMULATION_SEED_MAX_LENGTH);
    const { service } = setup({
      badgeStyle: 'shield',
      simulationVariant: 'B',
      simulationSeed: persistedSeed,
      version: APP_DATA_SCHEMA_VERSION
    });

    await service.ensureHydrated();
    TestBed.flushEffects();

    expect(service.simulationSeed()).toBe(expectedSeed);
  });

  it('should normalize simulation seed on update before persisting', async () => {
    const { service, persistenceSpy } = setup({
      badgeStyle: 'shield',
      simulationVariant: 'B',
      simulationSeed: '',
      version: APP_DATA_SCHEMA_VERSION
    });
    await service.ensureHydrated();
    TestBed.flushEffects();

    const updatedSeed = `  ${'seed'.repeat(40)}  `;
    const expectedSeed = ('seed'.repeat(40)).slice(0, SIMULATION_SEED_MAX_LENGTH);
    service.setSimulationSeed(updatedSeed);
    TestBed.flushEffects();

    expect(service.simulationSeed()).toBe(expectedSeed);
    expect(persistenceSpy.saveSettings).toHaveBeenLastCalledWith({
      badgeStyle: 'shield',
      simulationVariant: 'B',
      simulationSeed: expectedSeed,
      version: APP_DATA_SCHEMA_VERSION
    });
  });
});
