import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { GameService } from './game.service';
import { GeneratorService } from './generator.service';
import { MatchSimulationVariantBService } from './match.simulation.variant-b.service';
import { CommentaryService } from './commentary.service';
import { StatisticsService } from './statistics.service';
import { PostMatchAnalysisService } from './post.match.analysis.service';
import { FieldService } from './field.service';
import { FormationLibraryService } from './formation-library.service';
import { PersistenceService } from './persistence.service';
import { DataSchemaVersionService } from './data-schema-version.service';
import { Role } from '../models/enums';
import { League, SeasonTransitionLog, Team } from '../models/types';
import { createTestPlayer } from '../testing/test-player-fixtures';

describe('GameService — season transition log', () => {
  function makeTeam(id: string, players: ReturnType<typeof createTestPlayer>[], name = 'Test FC'): Team {
    return {
      id,
      name,
      players,
      playerIds: players.map(p => p.id),
      stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] },
      selectedFormationId: 'formation_4_4_2',
      formationAssignments: {},
      seasonSnapshots: [{
        seasonYear: 2026,
        playerIds: players.map(p => p.id),
        stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] }
      }]
    };
  }

  function makeLeague(teams: Team[], userTeamId?: string): League {
    return {
      userTeamId,
      teams,
      schedule: [
        { id: 'm1', week: 1, seasonYear: 2026, homeTeamId: teams[0].id, awayTeamId: teams[0].id, played: true, homeScore: 0, awayScore: 0 }
      ],
      currentWeek: 1,
      currentSeasonYear: 2026
    };
  }

  /**
   * `persistedLog` is wired before inject() so it is available during
   * the constructor's ensureHydrated() call.
   */
  function setup(league: League | null = null, persistedLog: SeasonTransitionLog | null = null) {
    TestBed.resetTestingModule();

    const replacementPlayer = createTestPlayer({ id: 'replacement', teamId: 'team-1', age: 17, seasonYear: 2027 });

    const generatorSpy: Pick<GeneratorService, 'generateLeague' | 'generateScheduleForSeason' | 'generatePlayer'> = {
      generateLeague: vi.fn().mockReturnValue({ teams: [], schedule: [], currentSeasonYear: 2026 }),
      generateScheduleForSeason: vi.fn().mockReturnValue([]),
      generatePlayer: vi.fn().mockReturnValue(replacementPlayer)
    };

    const persistenceSpy: Pick<
      PersistenceService,
      'loadLeague' | 'saveLeague' | 'clearLeague' | 'saveLeagueMetadata' | 'saveTeam' | 'saveTeamDefinition' | 'saveMatch' | 'saveMatchResult' | 'loadSeasonTransitionLog' | 'saveSeasonTransitionLog'
    > = {
      loadLeague: vi.fn().mockResolvedValue(league),
      saveLeague: vi.fn().mockResolvedValue(undefined),
      clearLeague: vi.fn().mockResolvedValue(undefined),
      saveLeagueMetadata: vi.fn().mockResolvedValue(undefined),
      saveTeam: vi.fn().mockResolvedValue(undefined),
      saveTeamDefinition: vi.fn().mockResolvedValue(undefined),
      saveMatch: vi.fn().mockResolvedValue(undefined),
      saveMatchResult: vi.fn().mockResolvedValue(undefined),
      loadSeasonTransitionLog: vi.fn().mockResolvedValue(persistedLog),
      saveSeasonTransitionLog: vi.fn().mockResolvedValue(undefined)
    };

    TestBed.configureTestingModule({
      providers: [
        GameService,
        { provide: GeneratorService, useValue: generatorSpy as GeneratorService },
        { provide: PersistenceService, useValue: persistenceSpy as PersistenceService },
        {
          provide: DataSchemaVersionService,
          useValue: { hasPersistedDataSchemaVersionMismatch: signal(false).asReadonly() } as Pick<DataSchemaVersionService, 'hasPersistedDataSchemaVersionMismatch'>
        },
        { provide: MatchSimulationVariantBService, useValue: {} },
        { provide: CommentaryService, useValue: {} },
        { provide: StatisticsService, useValue: { generatePlayerStatistics: vi.fn().mockReturnValue([]) } },
        { provide: PostMatchAnalysisService, useValue: {} },
        { provide: FieldService, useValue: { validateFormationAssignments: vi.fn().mockReturnValue({ isValid: true, errors: [] }) } },
        {
          provide: FormationLibraryService,
          useValue: {
            getFormationSlots: vi.fn().mockReturnValue([]),
            listPredefinedFormations: vi.fn().mockReturnValue([]),
            getAllFormations: vi.fn().mockReturnValue([]),
            getDefaultFormationId: vi.fn().mockReturnValue('formation_4_4_2')
          }
        }
      ]
    });

    return { service: TestBed.inject(GameService), persistenceSpy };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('dismissTeamTransitionEvents — appends teamId to dismissedTeamIds and persists', async () => {
    const league = makeLeague([makeTeam('team-1', [])], 'team-1');
    // seasonYear must equal league.currentSeasonYear - 1 to pass the hydration staleness check
    const existingLog: SeasonTransitionLog = { seasonYear: 2025, events: [], isRead: false, dismissedTeamIds: ['team-99'] };
    const { service, persistenceSpy } = setup(league, existingLog);
    await service.ensureHydrated();

    service.dismissTeamTransitionEvents('team-1');

    expect(persistenceSpy.saveSeasonTransitionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        isRead: false,
        dismissedTeamIds: ['team-99', 'team-1']
      })
    );
    // The whole log is still unread — only the team-level events were dismissed
    expect(service.unreadSeasonTransitionLog()).not.toBeNull();
  });

  it('dismissTeamTransitionEvents — is a no-op when no log is loaded', async () => {
    const { service, persistenceSpy } = setup(null, null);
    await service.ensureHydrated();

    service.dismissTeamTransitionEvents('team-1');

    expect(persistenceSpy.saveSeasonTransitionLog).not.toHaveBeenCalled();
  });

  it('dismissTeamTransitionEvents — does not add duplicate teamIds', async () => {
    const league = makeLeague([makeTeam('team-1', [])], 'team-1');
    const existingLog: SeasonTransitionLog = { seasonYear: 2025, events: [], isRead: false, dismissedTeamIds: ['team-1'] };
    const { service, persistenceSpy } = setup(league, existingLog);
    await service.ensureHydrated();

    service.dismissTeamTransitionEvents('team-1');

    // Should not call save because it's already dismissed
    expect(persistenceSpy.saveSeasonTransitionLog).not.toHaveBeenCalled();
  });

  it('markSeasonTransitionLogRead — sets isRead to true but preserves dismissedTeamIds', async () => {
    const league = makeLeague([makeTeam('team-1', [])], 'team-1');
    const existingLog: SeasonTransitionLog = {
      seasonYear: 2025, events: [], isRead: false, dismissedTeamIds: ['team-already-dismissed']
    };
    const { service, persistenceSpy } = setup(league, existingLog);
    await service.ensureHydrated();

    service.markSeasonTransitionLogRead();

    expect(persistenceSpy.saveSeasonTransitionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        isRead: true,
        dismissedTeamIds: ['team-already-dismissed']
      })
    );
    expect(service.unreadSeasonTransitionLog()).toBeNull();
  });

  it('startNewSeason — emits retirement events for every retiring player, including non-notable CPU players, and initializes dismissedTeamIds as []', async () => {
    // age >= 45 is an unconditional retire in assessRetirements — no RNG involved
    const userRetiree = createTestPlayer({ id: 'user-retiree', teamId: 'team-1', age: 46, role: Role.RESERVE, seasonYear: 2026 });
    // CPU player with deliberately low overall — previously excluded by the "isNotable" guard
    const cpuRetiree = createTestPlayer({
      id: 'cpu-retiree', teamId: 'team-2', age: 46, role: Role.RESERVE, seasonYear: 2026, stats: { overall: 50 }
    });

    const league = makeLeague([
      makeTeam('team-1', [userRetiree], 'User FC'),
      makeTeam('team-2', [cpuRetiree], 'CPU FC')
    ], 'team-1');

    const { service, persistenceSpy } = setup(league, null);
    await service.ensureHydrated();

    service.startNewSeason();

    const savedLog = vi.mocked(persistenceSpy.saveSeasonTransitionLog).mock.calls[0]?.[0];
    expect(savedLog).toBeDefined();

    // New logs always start with an empty dismissedTeamIds array
    expect(savedLog.dismissedTeamIds).toEqual([]);
    expect(savedLog.isRead).toBe(false);

    // Both the user-team retiree and the non-notable CPU retiree must produce events
    const eventTeamIds = savedLog.events.map((e: { teamId: string }) => e.teamId);
    expect(eventTeamIds).toContain('team-1');
    expect(eventTeamIds).toContain('team-2');

    // Every event should be a retirement
    expect(savedLog.events.every((e: { category: string }) => e.category === 'retirement')).toBe(true);
  });
});
