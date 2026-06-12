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
      finances: { tier: 3, transferBudget: 7000000, wagePointsCap: 65, wagePointsUsed: 50 },
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
      currentSeasonYear: 2026,
      transferListings: [],
      transferOffers: []
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

  it('startNewSeason — awards prize money based on rank and adds to transferBudget', async () => {
    const team1 = makeTeam('team-1', [], 'Team One');
    const team2 = makeTeam('team-2', [], 'Team Two');
    const team3 = makeTeam('team-3', [], 'Team Three');

    // Override the stats in the 2026 snapshot to give them points
    team1.seasonSnapshots = [{
      seasonYear: 2026,
      playerIds: [],
      stats: { played: 10, won: 3, drawn: 1, lost: 6, goalsFor: 10, goalsAgainst: 12, points: 10, last5: [] }
    }];
    team2.seasonSnapshots = [{
      seasonYear: 2026,
      playerIds: [],
      stats: { played: 10, won: 1, drawn: 2, lost: 7, goalsFor: 5, goalsAgainst: 15, points: 5, last5: [] }
    }];
    team3.seasonSnapshots = [{
      seasonYear: 2026,
      playerIds: [],
      stats: { played: 10, won: 0, drawn: 2, lost: 8, goalsFor: 2, goalsAgainst: 20, points: 2, last5: [] }
    }];

    // Set initial budgets
    team1.finances = { tier: 1, transferBudget: 2500000, wagePointsCap: 56, wagePointsUsed: 40 };
    team2.finances = { tier: 2, transferBudget: 1400000, wagePointsCap: 42, wagePointsUsed: 30 };
    team3.finances = { tier: 3, transferBudget: 700000, wagePointsCap: 29, wagePointsUsed: 20 };

    const league = makeLeague([team1, team2, team3], 'team-1');
    const { service } = setup(league, null);
    await service.ensureHydrated();

    service.startNewSeason();

    const updatedLeague = service.league();
    expect(updatedLeague).toBeDefined();

    const updatedTeam1 = updatedLeague!.teams.find(t => t.id === 'team-1');
    const updatedTeam2 = updatedLeague!.teams.find(t => t.id === 'team-2');
    const updatedTeam3 = updatedLeague!.teams.find(t => t.id === 'team-3');

    // We have 3 teams. Ranks:
    // team-1: Rank 1 -> prize = 200,000. Decayed budget = 2,500,000 * 0.8 = 2,000,000. Total = 2,200,000
    // team-2: Rank 2 -> prize = 150,000. Decayed budget = 1,400,000 * 0.8 = 1,120,000. Total = 1,270,000
    // team-3: Rank 3 -> prize = 100,000. Decayed budget = 700,000 * 0.8 = 560,000. Total = 660,000

    expect(updatedTeam1!.finances.transferBudget).toBe(2200000);
    expect(updatedTeam2!.finances.transferBudget).toBe(1270000);
    expect(updatedTeam3!.finances.transferBudget).toBe(660000);
  });
});
