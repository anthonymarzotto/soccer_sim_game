import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GameService } from './game.service';
import { GeneratorService } from './generator.service';
import { MatchSimulationService } from './match.simulation.service';
import { CommentaryService } from './commentary.service';
import { StatisticsService } from './statistics.service';
import { PostMatchAnalysisService } from './post.match.analysis.service';
import { FieldService } from './field.service';
import { FormationLibraryService } from './formation-library.service';
import { PersistenceService } from './persistence.service';

describe('GameService persistence integration', () => {
  function setup(storedLeague: { teams: []; schedule: []; currentWeek: number } | null = null) {
    TestBed.resetTestingModule();

    const generatorSpy: Pick<GeneratorService, 'generateLeague'> = {
      generateLeague: vi.fn().mockReturnValue({ teams: [], schedule: [] })
    };

    const persistenceSpy: Pick<PersistenceService, 'loadLeague' | 'saveLeague' | 'clearLeague'> = {
      loadLeague: vi.fn().mockResolvedValue(storedLeague),
      saveLeague: vi.fn().mockResolvedValue(undefined),
      clearLeague: vi.fn().mockResolvedValue(undefined)
    };

    TestBed.configureTestingModule({
      providers: [
        GameService,
        { provide: GeneratorService, useValue: generatorSpy as GeneratorService },
        { provide: PersistenceService, useValue: persistenceSpy as PersistenceService },
        { provide: MatchSimulationService, useValue: {} },
        { provide: CommentaryService, useValue: {} },
        { provide: StatisticsService, useValue: {} },
        { provide: PostMatchAnalysisService, useValue: {} },
        { provide: FieldService, useValue: {} },
        { provide: FormationLibraryService, useValue: {} }
      ]
    });

    const service = TestBed.inject(GameService);
    return { service, generatorSpy, persistenceSpy };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('should hydrate league from persistence', async () => {
    const { service } = setup({ teams: [], schedule: [], currentWeek: 4 });
    await service.ensureHydrated();

    expect(service.league()?.currentWeek).toBe(4);
  });

  it('should persist league after generating a new league', async () => {
    const { service, generatorSpy, persistenceSpy } = setup();
    await service.ensureHydrated();

    service.generateNewLeague();

    expect(generatorSpy.generateLeague).toHaveBeenCalled();
    expect(persistenceSpy.saveLeague).toHaveBeenCalledWith({
      teams: [],
      schedule: [],
      currentWeek: 1
    });
  });

  it('should clear state and persisted league', async () => {
    const { service, persistenceSpy } = setup();
    await service.ensureHydrated();
    service.generateNewLeague();

    await service.clearLeague();

    expect(service.league()).toBeNull();
    expect(persistenceSpy.clearLeague).toHaveBeenCalled();
  });
});
