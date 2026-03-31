import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SettingsService } from './settings.service';
import { PersistenceService } from './persistence.service';

describe('SettingsService', () => {
  function setup(loadSettingsValue: { badgeStyle: string } | null) {
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
    const { service, persistenceSpy } = setup({ badgeStyle: 'shield' });
    await service.ensureHydrated();
    TestBed.flushEffects();

    expect(persistenceSpy.loadSettings).toHaveBeenCalled();
    expect(service.badgeStyle()).toBe('shield');
  });

  it('should fallback to default badge style for invalid persisted value', async () => {
    const { service } = setup({ badgeStyle: 'invalid-style' });
    await service.ensureHydrated();
    TestBed.flushEffects();

    expect(service.badgeStyle()).toBe('initials');
  });

  it('should persist badge style changes after hydration', async () => {
    const { service, persistenceSpy } = setup({ badgeStyle: 'shield' });
    await service.ensureHydrated();
    TestBed.flushEffects();

    service.setBadgeStyle('jersey');
    TestBed.flushEffects();

    expect(persistenceSpy.saveSettings).toHaveBeenCalledWith({ badgeStyle: 'jersey' });
  });

  it('should reset to defaults and clear persisted settings key', async () => {
    const { service, persistenceSpy } = setup({ badgeStyle: 'hexagon' });
    await service.ensureHydrated();
    TestBed.flushEffects();

    await service.resetToDefaultsAndClearPersisted();
    TestBed.flushEffects();

    expect(service.badgeStyle()).toBe('initials');
    expect(persistenceSpy.clearSettings).toHaveBeenCalled();
  });
});
