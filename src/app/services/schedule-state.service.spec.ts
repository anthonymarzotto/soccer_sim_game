import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { League } from '../models/types';
import { GameService } from './game.service';
import { PersistenceService } from './persistence.service';
import { ScheduleStateService } from './schedule-state.service';

describe('ScheduleStateService', () => {
  function setup(persistedWeek: number | null) {
    TestBed.resetTestingModule();

    const persistenceSpy: Pick<PersistenceService, 'loadSelectedWeek' | 'saveSelectedWeek' | 'clearSelectedWeek'> = {
      loadSelectedWeek: vi.fn().mockResolvedValue(persistedWeek),
      saveSelectedWeek: vi.fn().mockResolvedValue(undefined),
      clearSelectedWeek: vi.fn().mockResolvedValue(undefined)
    };

    const leagueSignal = signal<League | null>({
      teams: Array.from({ length: 10 }, (_, i) => ({
        id: `t${i}`,
        name: `Team ${i}`,
        players: [],
        stats: {
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          points: 0,
          last5: []
        },
        selectedFormationId: 'formation_4_4_2',
        formationAssignments: {}
      })),
      schedule: [],
      currentWeek: 3
    });

    TestBed.configureTestingModule({
      providers: [
        ScheduleStateService,
        { provide: PersistenceService, useValue: persistenceSpy as PersistenceService },
        { provide: GameService, useValue: { league: leagueSignal.asReadonly() } }
      ]
    });

    const service = TestBed.inject(ScheduleStateService);
    return { service, persistenceSpy };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('should default selected week to league current week when no persisted value exists', async () => {
    const { service } = setup(null);
    await service.ensureHydrated();
    TestBed.flushEffects();

    expect(service.selectedWeek()).toBe(3);
  });

  it('should hydrate selected week from persistence and clamp to max week', async () => {
    const { service } = setup(99);
    await service.ensureHydrated();
    TestBed.flushEffects();

    // For 10 teams, max weeks is (10 - 1) * 2 = 18.
    expect(service.selectedWeek()).toBe(18);
  });

  it('should persist selected week changes after hydration', async () => {
    const { service, persistenceSpy } = setup(null);
    await service.ensureHydrated();
    TestBed.flushEffects();

    service.selectedWeek.set(5);
    TestBed.flushEffects();

    expect(persistenceSpy.saveSelectedWeek).toHaveBeenCalledWith(5);
  });

  it('should clear persisted week and reset to week 1', async () => {
    const { service, persistenceSpy } = setup(null);
    await service.clearPersistedWeek();
    TestBed.flushEffects();

    expect(service.selectedWeek()).toBe(1);
    expect(persistenceSpy.clearSelectedWeek).toHaveBeenCalled();
  });

  it('should initialize from fallback and then respond to user changes', async () => {
    const { service, persistenceSpy } = setup(null);
    await service.ensureHydrated();
    TestBed.flushEffects();

    // After hydration with fallback: selectedWeek should be league.currentWeek
    expect(service.selectedWeek()).toBe(3);

    // Next change should persist (initialization flag set, allowing persistence)
    service.selectedWeek.set(4);
    TestBed.flushEffects();

    // Should have persisted the new week
    expect(persistenceSpy.saveSelectedWeek).toHaveBeenCalledWith(4);
  });

  it('should suppress one persist operation in clearPersistedWeek', async () => {
    const { service, persistenceSpy } = setup(5);
    await service.ensureHydrated();
    TestBed.flushEffects();

    // Clear should suppress the immediate week.set(1) persist
    await service.clearPersistedWeek();
    TestBed.flushEffects();

    expect(persistenceSpy.clearSelectedWeek).toHaveBeenCalled();
    // saveSelectedWeek should not be called with week 1 from clearPersistedWeek
    expect(persistenceSpy.saveSelectedWeek).not.toHaveBeenCalledWith(1);

    // But subsequent user changes should persist
    service.selectedWeek.set(2);
    TestBed.flushEffects();

    expect(persistenceSpy.saveSelectedWeek).toHaveBeenCalledWith(2);
  });
});
