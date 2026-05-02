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
import { CommentaryStyle, EventType, FieldZone, MatchPhase, MatchResult, PlayingStyle, Position, Role } from '../models/enums';
import { League, MatchStatistics, Player, Team } from '../models/types';
import { createEmptyPlayerCareerStats } from '../models/player-career-stats';
import { createTestPersonal as mockPersonal, createTestSeasonAttributes as mockSeasonAttrs, createTestPlayer } from '../testing/test-player-fixtures';

describe('GameService persistence integration', () => {
  function ensureSeasonSnapshots(storedLeague: League | null): League | null {
    if (!storedLeague) {
      return storedLeague;
    }

    const seasonYear = storedLeague.currentSeasonYear;
    const teams = storedLeague.teams.map(team => {
      if ((team.seasonSnapshots?.length ?? 0) > 0) {
        return team;
      }

      return {
        ...team,
        seasonSnapshots: [{
          seasonYear,
          playerIds: [...team.playerIds],
          stats: {
            ...team.stats,
            last5: [...team.stats.last5]
          }
        }]
      };
    });

    return {
      ...storedLeague,
      teams
    };
  }

  function setup(
    storedLeague: League | null = null,
    options: {
      fieldServiceSpy?: Pick<FieldService, 'validateFormationAssignments'>;
    } = {}
  ) {
    TestBed.resetTestingModule();
    const hydratedLeague = ensureSeasonSnapshots(storedLeague);

    const hasSchemaMismatch = signal(false);

    const generatorSpy: Pick<GeneratorService, 'generateLeague' | 'generateScheduleForSeason'> = {
      generateLeague: vi.fn().mockReturnValue({ teams: [], schedule: [], currentSeasonYear: 2026 }),
      generateScheduleForSeason: vi.fn().mockReturnValue([])
    };

    const persistenceSpy: Pick<PersistenceService, 'loadLeague' | 'saveLeague' | 'clearLeague' | 'saveLeagueMetadata' | 'saveTeam' | 'saveTeamDefinition' | 'saveMatch' | 'saveMatchResult'> = {
      loadLeague: vi.fn().mockResolvedValue(hydratedLeague),
      saveLeague: vi.fn().mockResolvedValue(undefined),
      clearLeague: vi.fn().mockResolvedValue(undefined),
      saveLeagueMetadata: vi.fn().mockResolvedValue(undefined),
      saveTeam: vi.fn().mockResolvedValue(undefined),
      saveTeamDefinition: vi.fn().mockResolvedValue(undefined),
      saveMatch: vi.fn().mockResolvedValue(undefined),
      saveMatchResult: vi.fn().mockResolvedValue(undefined)
    };

    const formationLibrarySpy: Pick<FormationLibraryService, 'getFormationSlots' | 'listPredefinedFormations' | 'getAllFormations' | 'getDefaultFormationId'> = {
      getFormationSlots: vi.fn().mockReturnValue(undefined),
      listPredefinedFormations: vi.fn().mockReturnValue([]),
      getAllFormations: vi.fn().mockReturnValue([]),
      getDefaultFormationId: vi.fn().mockReturnValue('formation_4_4_2')
    };

    const fieldServiceSpy = options.fieldServiceSpy ?? {
      validateFormationAssignments: vi.fn().mockReturnValue({ isValid: true, errors: [] })
    };

    TestBed.configureTestingModule({
      providers: [
        GameService,
        { provide: GeneratorService, useValue: generatorSpy as GeneratorService },
        { provide: PersistenceService, useValue: persistenceSpy as PersistenceService },
        {
          provide: DataSchemaVersionService,
          useValue: {
            hasPersistedDataSchemaVersionMismatch: hasSchemaMismatch.asReadonly()
          } as Pick<DataSchemaVersionService, 'hasPersistedDataSchemaVersionMismatch'>
        },
        { provide: MatchSimulationVariantBService, useValue: {} },
        { provide: CommentaryService, useValue: {} },
        { provide: StatisticsService, useValue: { generatePlayerStatistics: vi.fn().mockReturnValue([]) } },
        { provide: PostMatchAnalysisService, useValue: {} },
        { provide: FieldService, useValue: fieldServiceSpy as FieldService },
        { provide: FormationLibraryService, useValue: formationLibrarySpy as FormationLibraryService }
      ]
    });

    const service = TestBed.inject(GameService);
    return { service, generatorSpy, persistenceSpy, formationLibrarySpy, fieldServiceSpy, hasSchemaMismatch };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('should hydrate league from persistence', async () => {
    const { service } = setup({ teams: [], schedule: [], currentWeek: 4, currentSeasonYear: 2026 });
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
      currentWeek: 1, currentSeasonYear: 2026 });
  });

  it('should clear state and persisted league', async () => {
    const { service, persistenceSpy } = setup();
    await service.ensureHydrated();
    service.generateNewLeague();

    await service.clearLeague();

    expect(service.league()).toBeNull();
    expect(persistenceSpy.clearLeague).toHaveBeenCalled();
  });

  it('should persist metadata only when advancing week', async () => {
    const { service, persistenceSpy } = setup({ teams: [], schedule: [], currentWeek: 4, currentSeasonYear: 2026 });
    await service.ensureHydrated();

    service.advanceWeek();

    expect(service.league()?.currentWeek).toBe(5);
    expect(persistenceSpy.saveLeagueMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        currentWeek: 5,
        currentSeasonYear: 2026
      })
    );
    expect(persistenceSpy.saveTeam).not.toHaveBeenCalled();
  });

  it('should persist changed teams when advancing week heals or progresses injuries', async () => {
    const injuredPlayer = createTestPlayer({ id: 'player-1', teamId: 'team-1', role: Role.STARTER, seasonYear: 2026 });
    injuredPlayer.injuries = [{
      definitionId: 'hamstring_pull',
      totalWeeks: 4,
      weeksRemaining: 2,
      sustainedInSeason: 2026,
      sustainedInWeek: 3
    }];

    const healthyPlayer = createTestPlayer({ id: 'player-2', teamId: 'team-1', role: Role.BENCH, seasonYear: 2026 });
    const team: Team = {
      id: 'team-1',
      name: 'Team One',
      players: [injuredPlayer, healthyPlayer],
      playerIds: ['player-1', 'player-2'],
      stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] },
      selectedFormationId: 'formation_4_4_2',
      formationAssignments: { gk_1: 'player-1' },
      seasonSnapshots: [{
        seasonYear: 2026,
        playerIds: ['player-1', 'player-2'],
        stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] }
      }]
    };

    const { service, persistenceSpy } = setup({ teams: [team], schedule: [], currentWeek: 4, currentSeasonYear: 2026 });
    await service.ensureHydrated();

    service.advanceWeek();

    expect(service.league()?.currentWeek).toBe(5);
    expect(service.getPlayer('player-1')?.injuries[0]?.weeksRemaining).toBe(1);
    expect(persistenceSpy.saveTeam).toHaveBeenCalledTimes(1);
    expect(persistenceSpy.saveTeam).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'team-1',
        players: expect.arrayContaining([
          expect.objectContaining({
            id: 'player-1',
            injuries: expect.arrayContaining([
              expect.objectContaining({ weeksRemaining: 1 })
            ])
          })
        ])
      }),
      2026
    );
  });

  it('should not decrement injuries that were sustained during the week that just ended', async () => {
    const injuredPlayer = createTestPlayer({ id: 'player-1', teamId: 'team-1', role: Role.STARTER, seasonYear: 2026 });
    injuredPlayer.injuries = [{
      definitionId: 'hamstring_pull',
      totalWeeks: 1,
      weeksRemaining: 1,
      sustainedInSeason: 2026,
      sustainedInWeek: 4
    }];

    const team: Team = {
      id: 'team-1',
      name: 'Team One',
      players: [injuredPlayer],
      playerIds: ['player-1'],
      stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] },
      selectedFormationId: 'formation_4_4_2',
      formationAssignments: { gk_1: 'player-1' },
      seasonSnapshots: [{
        seasonYear: 2026,
        playerIds: ['player-1'],
        stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] }
      }]
    };

    const { service, persistenceSpy } = setup({ teams: [team], schedule: [], currentWeek: 4, currentSeasonYear: 2026 });
    await service.ensureHydrated();

    service.advanceWeek();

    expect(service.league()?.currentWeek).toBe(5);
    expect(service.getPlayer('player-1')?.injuries[0]?.weeksRemaining).toBe(1);
    expect(persistenceSpy.saveTeam).not.toHaveBeenCalled();
  });

  it('should block mutating league operations while schema mismatch is active', async () => {
    const { service, persistenceSpy, hasSchemaMismatch } = setup({ teams: [], schedule: [], currentWeek: 4, currentSeasonYear: 2026 });
    await service.ensureHydrated();

    hasSchemaMismatch.set(true);

    service.generateNewLeague();
    service.advanceWeek();
    service.setUserTeam('team-1');
    const started = service.startNewSeason();

    expect(service.league()?.currentWeek).toBe(4);
    expect(started).toBe(false);
    expect(persistenceSpy.saveLeague).not.toHaveBeenCalled();
    expect(persistenceSpy.saveLeagueMetadata).not.toHaveBeenCalled();
  });

  it('should ignore rapid repeated week simulation calls until lock cooldown ends', async () => {
    vi.useFakeTimers();

    try {
      const { service } = setup({ teams: [], schedule: [], currentWeek: 1, currentSeasonYear: 2026 });
      await service.ensureHydrated();

      service.simulateCurrentWeek();
      service.simulateCurrentWeek();

      expect(service.league()?.currentWeek).toBe(2);

      vi.runAllTimers();

      service.simulateCurrentWeek();
      expect(service.league()?.currentWeek).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should return structured readiness issues for formation and injured starters', async () => {
    const injuredStarter: Player = {
      ...createTestPlayer({ id: 'player-1', name: 'Alex Vale', teamId: 'team-1', role: Role.STARTER, seasonYear: 2026 }),
      injuries: [{
        definitionId: 'hamstring_pull',
        totalWeeks: 4,
        weeksRemaining: 3,
        sustainedInSeason: 2026,
        sustainedInWeek: 7
      }]
    };
    const benchPlayer = createTestPlayer({ id: 'player-2', name: 'Ben Hart', teamId: 'team-1', role: Role.BENCH, seasonYear: 2026 });
    const team: Team = {
      id: 'team-1',
      name: 'Team One',
      players: [injuredStarter, benchPlayer],
      playerIds: ['player-1', 'player-2'],
      selectedFormationId: 'formation_4_4_2',
      formationAssignments: { gk_1: 'player-1' },
      stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] },
      seasonSnapshots: [{
        seasonYear: 2026,
        playerIds: ['player-1', 'player-2'],
        stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] }
      }]
    };

    const { service } = setup(
      { teams: [team], schedule: [], currentWeek: 7, currentSeasonYear: 2026 },
      {
        fieldServiceSpy: {
          validateFormationAssignments: vi.fn().mockReturnValue({
            isValid: false,
            errors: ['Missing assignment for ST']
          })
        }
      }
    );
    await service.ensureHydrated();

    const readiness = service.getMatchReadiness('team-1');

    expect(readiness.isReady).toBe(false);
    expect(readiness.issues.map(issue => issue.message)).toEqual([
      'Missing assignment for ST',
      'Alex Vale is injured (Hamstring Pull, 3 weeks remaining) and cannot start.'
    ]);
    expect(readiness.issues[1]).toMatchObject({
      kind: 'injured-starter',
      playerId: 'player-1',
      injuryDefinitionId: 'hamstring_pull',
      injuryName: 'Hamstring Pull',
      weeksRemaining: 3
    });
  });

  it('should mark the season complete and block week simulation once all scheduled matches are played', async () => {
    const { service, persistenceSpy } = setup({
      teams: [],
      schedule: [
        { id: 'final-match', week: 1, homeTeamId: 'home', awayTeamId: 'away', played: true, homeScore: 2, awayScore: 1 }
      ],
      currentWeek: 1, currentSeasonYear: 2026 });
    await service.ensureHydrated();

    expect(service.isSeasonComplete()).toBe(true);

    service.simulateCurrentWeek();

    expect(service.league()?.currentWeek).toBe(1);
    expect(persistenceSpy.saveLeagueMetadata).not.toHaveBeenCalled();
  });

  it('should not start a new season before current season is complete', async () => {
    const { service, persistenceSpy } = setup({
      teams: [],
      schedule: [
        { id: 'm1', week: 1, seasonYear: 2026, homeTeamId: 'home', awayTeamId: 'away', played: false }
      ],
      currentWeek: 1,
      currentSeasonYear: 2026
    });
    await service.ensureHydrated();

    const started = service.startNewSeason();

    expect(started).toBe(false);
    expect(service.league()?.currentSeasonYear).toBe(2026);
    expect(persistenceSpy.saveLeague).not.toHaveBeenCalled();
  });

  it('should start a new season explicitly and seed next-season records', async () => {
    const storedLeague = {
      teams: [
        {
          id: 'team-1',
          name: 'Team One',
          players: [
            {
              id: 'p1',
              name: 'Player One',
              teamId: 'team-1',
              position: Position.GOALKEEPER,
              role: Role.STARTER,
              personal: mockPersonal({ height: 190, weight: 84, age: 29, nationality: 'ENG', seasonYear: 2026 }),
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 50, strength: 80, endurance: 75, flair: 40, vision: 70, determination: 80, tackling: 20, shooting: 15, heading: 35, longPassing: 55, shortPassing: 62, luck: 50, injuryRate: 8, overall: 78 })],
              careerStats: [createEmptyPlayerCareerStats(2026, 'team-1')]
            }
          ],
          playerIds: ['p1'],
          stats: {
            played: 1,
            won: 1,
            drawn: 0,
            lost: 0,
            goalsFor: 1,
            goalsAgainst: 0,
            points: 3,
            last5: [MatchResult.WIN]
          },
          seasonSnapshots: [{
            seasonYear: 2026,
            playerIds: ['p1'],
            stats: {
              played: 1,
              won: 1,
              drawn: 0,
              lost: 0,
              goalsFor: 1,
              goalsAgainst: 0,
              points: 3,
              last5: [MatchResult.WIN]
            }
          }],
          selectedFormationId: 'formation_4_4_2',
          formationAssignments: { gk_1: 'p1' }
        }
      ],
      schedule: [
        { id: 'm1', week: 1, seasonYear: 2026, homeTeamId: 'team-1', awayTeamId: 'team-1', played: true, homeScore: 1, awayScore: 0 }
      ],
      currentWeek: 1,
      currentSeasonYear: 2026
    };

    const { service, generatorSpy, persistenceSpy } = setup(storedLeague as unknown as League);
    vi.mocked(generatorSpy.generateScheduleForSeason).mockReturnValue([
      { id: 'n1', week: 1, seasonYear: 2027, homeTeamId: 'team-1', awayTeamId: 'team-1', played: false }
    ]);
    await service.ensureHydrated();

    const started = service.startNewSeason();
    const league = service.league();
    const player = league?.teams[0]?.players[0];
    const nextSnapshot = league?.teams[0]?.seasonSnapshots?.find(snapshot => snapshot.seasonYear === 2027);

    expect(started).toBe(true);
    expect(generatorSpy.generateScheduleForSeason).toHaveBeenCalledWith(expect.any(Array), 2027);
    expect(league?.currentSeasonYear).toBe(2027);
    expect(league?.currentWeek).toBe(1);
    expect(player?.seasonAttributes?.some(attributes => attributes.seasonYear === 2027)).toBe(true);
    expect(player?.careerStats.some(stats => stats.seasonYear === 2027)).toBe(true);
    expect(nextSnapshot).toBeDefined();
    expect(nextSnapshot?.stats.played).toBe(0);
    expect(league?.schedule.some(match => match.id === 'n1' && match.seasonYear === 2027)).toBe(true);
    expect(persistenceSpy.saveLeague).toHaveBeenCalledTimes(1);
  });

  it('should prune whole oldest seasons during explicit season rollover', async () => {
    const makePlayedMatch = (id: string, seasonYear: number): { id: string; week: number; seasonYear: number; homeTeamId: string; awayTeamId: string; played: boolean; homeScore: number; awayScore: number } => ({
      id,
      week: 1,
      seasonYear,
      homeTeamId: 'team-1',
      awayTeamId: 'team-1',
      played: true,
      homeScore: 0,
      awayScore: 0
    });

    const season2023 = Array.from({ length: 2000 }, (_, index) => makePlayedMatch(`2023-${index}`, 2023));
    const season2024 = Array.from({ length: 2000 }, (_, index) => makePlayedMatch(`2024-${index}`, 2024));
    const season2025 = Array.from({ length: 2000 }, (_, index) => makePlayedMatch(`2025-${index}`, 2025));

    const storedLeague = {
      teams: [],
      schedule: [...season2023, ...season2024, ...season2025],
      currentWeek: 1,
      currentSeasonYear: 2025
    };

    const { service, generatorSpy } = setup(storedLeague as unknown as League);
    vi.mocked(generatorSpy.generateScheduleForSeason).mockReturnValue([]);
    await service.ensureHydrated();

    const started = service.startNewSeason();
    const schedule = service.league()?.schedule ?? [];
    const remainingSeasons = new Set(schedule.map(match => match.seasonYear));

    expect(started).toBe(true);
    expect(schedule.length).toBeLessThanOrEqual(5000);
    expect(remainingSeasons.has(2023)).toBe(false);
    expect(remainingSeasons.has(2024)).toBe(true);
    expect(remainingSeasons.has(2025)).toBe(true);
  });

  it('should persist only changed team on formation assignment clear', async () => {
    const storedLeague = {
      teams: [
        {
          id: 'team-1',
          name: 'Team One',
          players: [
            {
              id: 'p1',
              name: 'Player One',
              teamId: 'team-1',
              position: Position.GOALKEEPER,
              role: Role.STARTER,
              personal: mockPersonal({ height: 190, weight: 84, age: 29, nationality: 'ENG', seasonYear: 2026 }),
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 50, strength: 80, endurance: 75, flair: 40, vision: 70, determination: 80, tackling: 20, shooting: 15, heading: 35, longPassing: 55, shortPassing: 62, luck: 50, injuryRate: 8, overall: 78 })],
              careerStats: [createEmptyPlayerCareerStats(2026, 'team-1')]
            }
          ],
          playerIds: ['p1'],
          stats: {
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            points: 0,
            last5: [MatchResult.DRAW]
          },
          selectedFormationId: 'formation_4_4_2',
          formationAssignments: {
            gk_1: 'p1'
          }
        },
        {
          id: 'team-2',
          name: 'Team Two',
          players: [],
          playerIds: [],
          stats: {
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            points: 0,
            last5: [MatchResult.DRAW]
          },
          selectedFormationId: 'formation_4_4_2',
          formationAssignments: {}
        }
      ],
      schedule: [],
      currentWeek: 1, currentSeasonYear: 2026 };

    const { service, persistenceSpy } = setup(storedLeague as { teams: []; schedule: []; currentWeek: number; currentSeasonYear: number });
    await service.ensureHydrated();

    service.clearFormationAssignment('team-1', 'gk_1');

    expect(persistenceSpy.saveTeamDefinition).toHaveBeenCalledTimes(1);
    expect(persistenceSpy.saveTeamDefinition).toHaveBeenCalledWith(expect.objectContaining({ id: 'team-1' }));
    expect(persistenceSpy.saveTeam).not.toHaveBeenCalled();
  });

  it('should clear starter assignment when moving a player to bench', async () => {
    const storedLeague = {
      teams: [
        {
          id: 'team-1',
          name: 'Team One',
          players: [
            {
              id: 'p1',
              name: 'Player One',
              teamId: 'team-1',
              position: Position.GOALKEEPER,
              role: Role.STARTER,
              personal: mockPersonal({ height: 190, weight: 84, age: 29, nationality: 'ENG', seasonYear: 2026 }),
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 50, strength: 80, endurance: 75, flair: 40, vision: 70, determination: 80, tackling: 20, shooting: 15, heading: 35, longPassing: 55, shortPassing: 62, luck: 50, injuryRate: 8, overall: 78 })],
              careerStats: [createEmptyPlayerCareerStats(2026, 'team-1')]
            },
            {
              id: 'p2',
              name: 'Player Two',
              teamId: 'team-1',
              position: Position.MIDFIELDER,
              role: Role.BENCH,
              personal: mockPersonal({ height: 180, weight: 78, age: 24, nationality: 'ENG', seasonYear: 2026 }),
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 61, strength: 70, endurance: 78, flair: 55, vision: 66, determination: 71, tackling: 52, shooting: 61, heading: 48, longPassing: 67, shortPassing: 72, luck: 52, injuryRate: 10, overall: 73 })],
              careerStats: [createEmptyPlayerCareerStats(2026, 'team-1')]
            }
          ],
          playerIds: ['p1', 'p2'],
          stats: {
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            points: 0,
            last5: [MatchResult.DRAW]
          },
          selectedFormationId: 'formation_4_4_2',
          formationAssignments: {
            gk_1: 'p1'
          }
        }
      ],
      schedule: [],
      currentWeek: 1, currentSeasonYear: 2026 };

    const { service } = setup(storedLeague as { teams: []; schedule: []; currentWeek: number; currentSeasonYear: number });
    await service.ensureHydrated();

    service.movePlayerToBench('team-1', 'p1');

    const updatedTeam = service.getTeam('team-1') as Team;
    const movedPlayer = service.getPlayersForTeam('team-1').find(player => player.id === 'p1');

    expect(updatedTeam.formationAssignments['gk_1']).toBe('');
    expect(movedPlayer?.role).toBe(Role.BENCH);
  });

  it('should not move an injured starter onto the bench to bypass readiness', async () => {
    const injuredStarter = createTestPlayer({ id: 'p1', name: 'Player One', teamId: 'team-1', role: Role.STARTER, seasonYear: 2026 });
    injuredStarter.injuries = [{
      definitionId: 'hamstring_pull',
      totalWeeks: 4,
      weeksRemaining: 3,
      sustainedInSeason: 2026,
      sustainedInWeek: 1
    }];

    const benchPlayer = createTestPlayer({ id: 'p2', name: 'Player Two', teamId: 'team-1', role: Role.BENCH, seasonYear: 2026 });

    const storedLeague = {
      teams: [
        {
          id: 'team-1',
          name: 'Team One',
          players: [injuredStarter, benchPlayer],
          playerIds: ['p1', 'p2'],
          stats: {
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            points: 0,
            last5: [MatchResult.DRAW]
          },
          selectedFormationId: 'formation_4_4_2',
          formationAssignments: {
            gk_1: 'p1'
          },
          seasonSnapshots: [{
            seasonYear: 2026,
            playerIds: ['p1', 'p2'],
            stats: {
              played: 0,
              won: 0,
              drawn: 0,
              lost: 0,
              goalsFor: 0,
              goalsAgainst: 0,
              points: 0,
              last5: [MatchResult.DRAW]
            }
          }]
        }
      ],
      schedule: [],
      currentWeek: 1, currentSeasonYear: 2026 };

    const { service } = setup(storedLeague as { teams: []; schedule: []; currentWeek: number; currentSeasonYear: number });
    await service.ensureHydrated();

    service.movePlayerToBench('team-1', 'p1');

    const updatedTeam = service.getTeam('team-1') as Team;
    const injuredPlayer = service.getPlayersForTeam('team-1').find(player => player.id === 'p1');
    const readiness = service.getMatchReadiness('team-1');

    expect(updatedTeam.formationAssignments['gk_1']).toBe('p1');
    expect(injuredPlayer?.role).toBe(Role.STARTER);
    expect(readiness.issues.map(issue => issue.message)).toContain(
      'Player One is injured (Hamstring Pull, 3 weeks remaining) and cannot start.'
    );
  });

  it('should report injured bench players as match-readiness issues', async () => {
    const healthyStarter = createTestPlayer({ id: 'player-1', name: 'Alex Vale', teamId: 'team-1', role: Role.STARTER, seasonYear: 2026 });
    const injuredBench = createTestPlayer({ id: 'player-2', name: 'Ben Hart', teamId: 'team-1', role: Role.BENCH, seasonYear: 2026 });
    injuredBench.injuries = [{
      definitionId: 'hamstring_pull',
      totalWeeks: 4,
      weeksRemaining: 3,
      sustainedInSeason: 2026,
      sustainedInWeek: 7
    }];

    const team: Team = {
      id: 'team-1',
      name: 'Team One',
      players: [healthyStarter, injuredBench],
      playerIds: ['player-1', 'player-2'],
      selectedFormationId: 'formation_4_4_2',
      formationAssignments: { gk_1: 'player-1' },
      stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] },
      seasonSnapshots: [{
        seasonYear: 2026,
        playerIds: ['player-1', 'player-2'],
        stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] }
      }]
    };

    const { service } = setup({ teams: [team], schedule: [], currentWeek: 7, currentSeasonYear: 2026 });
    await service.ensureHydrated();

    const readiness = service.getMatchReadiness('team-1');

    expect(readiness.isReady).toBe(false);
    expect(readiness.issues.map(issue => issue.message)).toContain(
      'Ben Hart is injured (Hamstring Pull, 3 weeks remaining) and cannot be on the bench.'
    );
  });

  it('should move starters with dropped slots to reserves when changing formation', async () => {
    const storedLeague = {
      teams: [
        {
          id: 'team-1',
          name: 'Team One',
          players: [
            {
              id: 'p1',
              name: 'Player One',
              teamId: 'team-1',
              position: Position.GOALKEEPER,
              role: Role.STARTER,
              personal: mockPersonal({ height: 190, weight: 84, age: 29, nationality: 'ENG', seasonYear: 2026 }),
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 50, strength: 80, endurance: 75, flair: 40, vision: 70, determination: 80, tackling: 20, shooting: 15, heading: 35, longPassing: 55, shortPassing: 62, luck: 50, injuryRate: 8, overall: 78 })],
              careerStats: [createEmptyPlayerCareerStats(2026, 'team-1')]
            },
            {
              id: 'p2',
              name: 'Player Two',
              teamId: 'team-1',
              position: Position.DEFENDER,
              role: Role.STARTER,
              personal: mockPersonal({ height: 184, weight: 79, age: 25, nationality: 'ENG', seasonYear: 2026 }),
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 62, strength: 74, endurance: 77, flair: 44, vision: 60, determination: 73, tackling: 79, shooting: 22, heading: 70, longPassing: 63, shortPassing: 67, luck: 46, injuryRate: 9, overall: 74 })],
              careerStats: [createEmptyPlayerCareerStats(2026, 'team-1')]
            }
          ],
          playerIds: ['p1', 'p2'],
          stats: {
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            points: 0,
            last5: [MatchResult.DRAW]
          },
          selectedFormationId: 'formation_old',
          formationAssignments: {
            gk_1: 'p1',
            def_1: 'p2'
          }
        }
      ],
      schedule: [],
      currentWeek: 1, currentSeasonYear: 2026 };

    const { service, formationLibrarySpy } = setup(storedLeague as { teams: []; schedule: []; currentWeek: number; currentSeasonYear: number });
    vi.mocked(formationLibrarySpy.getFormationSlots).mockImplementation((formationId: string) => {
      if (formationId === 'formation_new') {
        return [
          {
            slotId: 'gk_1',
            label: 'GK',
            preferredPosition: Position.GOALKEEPER,
            coordinates: { x: 50, y: 90 },
            zone: FieldZone.DEFENSE
          }
        ];
      }
      return undefined;
    });

    await service.ensureHydrated();
    service.changeTeamFormation('team-1', 'formation_new');

    const updatedTeam = service.getTeam('team-1') as Team;
    const updatedPlayers = service.getPlayersForTeam('team-1');
    const playerOne = updatedPlayers.find(player => player.id === 'p1');
    const playerTwo = updatedPlayers.find(player => player.id === 'p2');

    expect(updatedTeam.selectedFormationId).toBe('formation_new');
    expect(updatedTeam.formationAssignments).toEqual({ gk_1: 'p1' });
    expect(playerOne?.role).toBe(Role.STARTER);
    expect(playerTwo?.role).toBe(Role.RESERVE);
  });

  it('should resolve team players using playerIds order', async () => {
    const storedLeague = {
      teams: [
        {
          id: 'team-1',
          name: 'Team One',
          players: [
            {
              id: 'p2',
              name: 'Player Two',
              teamId: 'team-1',
              position: Position.DEFENDER,
              role: Role.STARTER,
              personal: mockPersonal({ height: 180, weight: 78, age: 24, nationality: 'ENG', seasonYear: 2026 }),
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 60, strength: 70, endurance: 72, flair: 50, vision: 58, determination: 66, tackling: 78, shooting: 30, heading: 65, longPassing: 60, shortPassing: 66, luck: 45, injuryRate: 10, overall: 72 })],
              careerStats: [createEmptyPlayerCareerStats(2026, 'team-1')]
            },
            {
              id: 'p1',
              name: 'Player One',
              teamId: 'team-1',
              position: Position.GOALKEEPER,
              role: Role.STARTER,
              personal: mockPersonal({ height: 192, weight: 85, age: 28, nationality: 'ENG', seasonYear: 2026 }),
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 50, strength: 78, endurance: 70, flair: 35, vision: 72, determination: 80, tackling: 18, shooting: 12, heading: 40, longPassing: 56, shortPassing: 60, luck: 52, injuryRate: 8, overall: 77 })],
              careerStats: [createEmptyPlayerCareerStats(2026, 'team-1')]
            }
          ],
          playerIds: ['p1', 'p2'],
          stats: {
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            points: 0,
            last5: [MatchResult.DRAW]
          },
          selectedFormationId: 'formation_4_4_2',
          formationAssignments: { gk_1: 'p1' }
        }
      ],
      schedule: [],
      currentWeek: 1, currentSeasonYear: 2026 };

    const { service } = setup(storedLeague as { teams: []; schedule: []; currentWeek: number; currentSeasonYear: number });
    await service.ensureHydrated();

    const players = service.getPlayersForTeam('team-1');
    expect(players.map(player => player.id)).toEqual(['p1', 'p2']);
  });

  it('should return balanced probabilities for unknown teams', async () => {
    const { service } = setup({ teams: [], schedule: [], currentWeek: 1, currentSeasonYear: 2026 });
    await service.ensureHydrated();

    const probabilities = service.getMatchProbabilities('missing-home', 'missing-away');
    expect(probabilities).toEqual({ home: 0, draw: 0, away: 0 });
  });

  it('should atomically persist completed match results', async () => {
    const storedLeague = {
      teams: [
        {
          id: 'team-1',
          name: 'Team One',
          players: [
            {
              id: 'p1',
              name: 'Player One',
              teamId: 'team-1',
              position: Position.GOALKEEPER,
              role: Role.STARTER,
              personal: mockPersonal({ height: 190, weight: 84, age: 29, nationality: 'ENG', seasonYear: 2026 }),
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 50, strength: 80, endurance: 75, flair: 40, vision: 70, determination: 80, tackling: 20, shooting: 15, heading: 35, longPassing: 55, shortPassing: 62, luck: 50, injuryRate: 8, overall: 78 })],
              careerStats: [createEmptyPlayerCareerStats(2026, 'team-1')]
            }
          ],
          playerIds: ['p1'],
          stats: {
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            points: 0,
            last5: [MatchResult.DRAW]
          },
          selectedFormationId: 'formation_4_4_2',
          formationAssignments: { gk_1: 'p1' }
        },
        {
          id: 'team-2',
          name: 'Team Two',
          players: [
            {
              id: 'p2',
              name: 'Player Two',
              teamId: 'team-2',
              position: Position.GOALKEEPER,
              role: Role.STARTER,
              personal: mockPersonal({ height: 191, weight: 83, age: 30, nationality: 'ENG', seasonYear: 2026 }),
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 48, strength: 81, endurance: 74, flair: 39, vision: 69, determination: 82, tackling: 18, shooting: 12, heading: 34, longPassing: 53, shortPassing: 61, luck: 52, injuryRate: 7, overall: 77 })],
              careerStats: [createEmptyPlayerCareerStats(2026, 'team-2')]
            }
          ],
          playerIds: ['p2'],
          stats: {
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            points: 0,
            last5: [MatchResult.DRAW]
          },
          selectedFormationId: 'formation_4_4_2',
          formationAssignments: { gk_1: 'p2' }
        }
      ],
      schedule: [
        {
          id: 'match-1',
          week: 1,
          homeTeamId: 'team-1',
          awayTeamId: 'team-2',
          played: false
        }
      ],
      currentWeek: 1, currentSeasonYear: 2026 };

    const { service, persistenceSpy } = setup(storedLeague as { teams: []; schedule: []; currentWeek: number; currentSeasonYear: number });
    await service.ensureHydrated();

    const homeTeam = service.getTeam('team-1') as Team;
    const awayTeam = service.getTeam('team-2') as Team;
    const match = service.getMatchesForWeek(1)[0];

    const matchState = {
      homeScore: 1,
      awayScore: 0,
      events: [],
      currentMinute: 90
    };
    const matchStats = {
      possession: { home: 50, away: 50 },
      shots: { home: 1, away: 0 },
      shotsOnTarget: { home: 1, away: 0 },
      corners: { home: 0, away: 0 },
      fouls: { home: 0, away: 0 },
      cards: {
        home: { yellow: 0, red: 0 },
        away: { yellow: 0, red: 0 }
      },
      passes: { home: 0, away: 0 },
      tackles: { home: 0, away: 0 },
      saves: { home: 0, away: 0 }
    } satisfies MatchStatistics;
    const matchReport = {
      matchId: 'match-1',
      finalScore: '1-0',
      keyMoments: [],
      tacticalAnalysis: {
        homeTeam: { possession: 50, shots: 1, corners: 0, fouls: 0, style: PlayingStyle.DEFENSIVE, effectiveness: 50 },
        awayTeam: { possession: 50, shots: 0, corners: 0, fouls: 0, style: PlayingStyle.DEFENSIVE, effectiveness: 40 },
        tacticalBattle: 'Even'
      },
      playerPerformances: {
        homeTeam: { mvp: { playerId: 'p1', playerName: 'Player One', position: Position.GOALKEEPER, rating: 7, goals: 0, assists: 0, shots: 0, passes: 0, tackles: 0, saves: 0, fouls: 0, yellowCards: 0, redCards: 0 }, topPerformers: [], strugglers: [], averageRating: 7 },
        awayTeam: { mvp: { playerId: 'p2', playerName: 'Player Two', position: Position.GOALKEEPER, rating: 6, goals: 0, assists: 0, shots: 0, passes: 0, tackles: 0, saves: 0, fouls: 0, yellowCards: 0, redCards: 0 }, topPerformers: [], strugglers: [], averageRating: 6 }
      },
      matchSummary: 'Summary',
      homePlayerStats: [],
      awayPlayerStats: []
    };

    (service as unknown as { updateLeagueWithMatchResult: (...args: unknown[]) => void }).updateLeagueWithMatchResult(
      match,
      matchState,
      homeTeam,
      awayTeam,
      [],
      matchStats,
      matchReport
    );

    expect(persistenceSpy.saveMatchResult).toHaveBeenCalledTimes(1);
    expect(persistenceSpy.saveMatchResult).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'match-1', played: true, homeScore: 1, awayScore: 0 }),
      expect.arrayContaining([
        expect.objectContaining({ id: 'team-1' }),
        expect.objectContaining({ id: 'team-2' })
      ]),
      2026
    );
    expect(persistenceSpy.saveTeam).not.toHaveBeenCalled();
    expect(persistenceSpy.saveMatch).not.toHaveBeenCalled();

    const homeKeeper = homeTeam.players.find(player => player.id === 'p1');
    const awayKeeper = awayTeam.players.find(player => player.id === 'p2');
    expect(homeKeeper?.careerStats[0]?.cleanSheets).toBe(1);
    expect(awayKeeper?.careerStats[0]?.cleanSheets).toBe(0);
  });

  it('should credit tackles and interceptions only to the turnover winner', async () => {
    const { service } = setup({ teams: [], schedule: [], currentWeek: 1, currentSeasonYear: 2026 });
    await service.ensureHydrated();

    const emptyStats = {
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
      last5: [] as MatchResult[]
    };

    const homeDefender = {
      id: 'home-def',
      name: 'Home Defender',
      teamId: 'team-1',
      position: Position.DEFENDER,
      role: Role.STARTER,
      careerStats: [createEmptyPlayerCareerStats(2026, 'team-1')]
    } as unknown as Player;
    const awayAttacker = {
      id: 'away-att',
      name: 'Away Attacker',
      teamId: 'team-2',
      position: Position.FORWARD,
      role: Role.STARTER,
      careerStats: [createEmptyPlayerCareerStats(2026, 'team-2')]
    } as unknown as Player;

    const homeTeam = {
      id: 'team-1',
      name: 'Team One',
      players: [homeDefender],
      playerIds: ['home-def'],
      stats: emptyStats,
      selectedFormationId: 'formation_4_4_2',
      formationAssignments: { slot_0: 'home-def' },
      seasonSnapshots: [{ seasonYear: 2026, playerIds: ['home-def'], stats: emptyStats }]
    } as unknown as Team;
    const awayTeam = {
      id: 'team-2',
      name: 'Team Two',
      players: [awayAttacker],
      playerIds: ['away-att'],
      stats: emptyStats,
      selectedFormationId: 'formation_4_4_2',
      formationAssignments: { slot_0: 'away-att' },
      seasonSnapshots: [{ seasonYear: 2026, playerIds: ['away-att'], stats: emptyStats }]
    } as unknown as Team;

    (service as unknown as {
      updatePlayerCareerStats: (matchState: unknown, homeTeam: Team, awayTeam: Team, homePlayerStats: unknown[], awayPlayerStats: unknown[]) => void;
    }).updatePlayerCareerStats(
      {
        ballPossession: {
          teamId: 'team-1',
          playerWithBall: 'home-def',
          location: { x: 50, y: 50 },
          phase: MatchPhase.BUILD_UP,
          passes: 0,
          timeElapsed: 0
        },
        events: [
          { id: 't1', type: EventType.TACKLE, description: '', playerIds: ['home-def', 'away-att'], location: { x: 50, y: 50 }, time: 30, success: true },
          { id: 'i1', type: EventType.INTERCEPTION, description: '', playerIds: ['home-def', 'away-att'], location: { x: 50, y: 50 }, time: 60, success: false }
        ],
        fatigueTimeline: [],
        currentMinute: 90,
        homeScore: 0,
        awayScore: 0,
        homeShots: 0,
        awayShots: 0,
        homeShotsOnTarget: 0,
        awayShotsOnTarget: 0,
        homePossession: 50,
        awayPossession: 50,
        homeCorners: 0,
        awayCorners: 0,
        homeFouls: 0,
        awayFouls: 0,
        homeYellowCards: 0,
        awayYellowCards: 0,
        homeRedCards: 0,
        awayRedCards: 0
      },
      homeTeam,
      awayTeam,
      [],
      []
    );

    expect(homeDefender.careerStats[0]?.tackles).toBe(1);
    expect(homeDefender.careerStats[0]?.interceptions).toBe(1);
    expect(awayAttacker.careerStats[0]?.tackles).toBe(0);
    expect(awayAttacker.careerStats[0]?.interceptions).toBe(0);
  });

  it('should persist assists from generated player statistics', async () => {
    const { service } = setup({ teams: [], schedule: [], currentWeek: 1, currentSeasonYear: 2026 });
    await service.ensureHydrated();

    const emptyStats = {
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
      last5: [] as MatchResult[]
    };

    const homePasser = {
      id: 'home-pass',
      name: 'Home Passer',
      teamId: 'team-1',
      position: Position.MIDFIELDER,
      role: Role.STARTER,
      careerStats: [createEmptyPlayerCareerStats(2026, 'team-1')]
    } as unknown as Player;
    const homeScorer = {
      id: 'home-score',
      name: 'Home Scorer',
      teamId: 'team-1',
      position: Position.FORWARD,
      role: Role.STARTER,
      careerStats: [createEmptyPlayerCareerStats(2026, 'team-1')]
    } as unknown as Player;
    const awayPlayer = {
      id: 'away-1',
      name: 'Away Player',
      teamId: 'team-2',
      position: Position.DEFENDER,
      role: Role.STARTER,
      careerStats: [createEmptyPlayerCareerStats(2026, 'team-2')]
    } as unknown as Player;

    const homeTeam = {
      id: 'team-1',
      name: 'Team One',
      players: [homePasser, homeScorer],
      playerIds: ['home-pass', 'home-score'],
      stats: emptyStats,
      selectedFormationId: 'formation_4_4_2',
      formationAssignments: { slot_0: 'home-pass', slot_1: 'home-score' },
      seasonSnapshots: [{ seasonYear: 2026, playerIds: ['home-pass', 'home-score'], stats: emptyStats }]
    } as unknown as Team;
    const awayTeam = {
      id: 'team-2',
      name: 'Team Two',
      players: [awayPlayer],
      playerIds: ['away-1'],
      stats: emptyStats,
      selectedFormationId: 'formation_4_4_2',
      formationAssignments: { slot_0: 'away-1' },
      seasonSnapshots: [{ seasonYear: 2026, playerIds: ['away-1'], stats: emptyStats }]
    } as unknown as Team;

    const makePlayerStats = (playerId: string, playerName: string, position: Position, assists: number, rating: number) => ({
      playerId,
      playerName,
      position,
      minutesPlayed: 90,
      passes: 0,
      passesSuccessful: 0,
      shots: 0,
      shotsOnTarget: 0,
      goals: 0,
      assists,
      tackles: 0,
      tacklesSuccessful: 0,
      interceptions: 0,
      fouls: 0,
      foulsSuffered: 0,
      yellowCards: 0,
      redCards: 0,
      saves: 0,
      rating
    });

    const homePlayerStats = [
      makePlayerStats('home-pass', 'Home Passer', Position.MIDFIELDER, 1, 60),
      makePlayerStats('home-score', 'Home Scorer', Position.FORWARD, 0, 70)
    ];
    const awayPlayerStats = [
      makePlayerStats('away-1', 'Away Player', Position.DEFENDER, 0, 55)
    ];

    (service as unknown as {
      updatePlayerCareerStats: (matchState: unknown, homeTeam: Team, awayTeam: Team, homePlayerStats: unknown[], awayPlayerStats: unknown[]) => void;
    }).updatePlayerCareerStats(
      {
        ballPossession: {
          teamId: 'team-1',
          playerWithBall: 'home-pass',
          location: { x: 50, y: 50 },
          phase: MatchPhase.BUILD_UP,
          passes: 0,
          timeElapsed: 0
        },
        events: [
          { id: 'p1', type: EventType.PASS, description: '', playerIds: ['home-pass', 'home-score'], location: { x: 50, y: 50 }, time: 12, success: true },
          { id: 'g1', type: EventType.GOAL, description: '', playerIds: ['home-score'], location: { x: 50, y: 50 }, time: 13, success: true }
        ],
        fatigueTimeline: [],
        currentMinute: 90,
        homeScore: 1,
        awayScore: 0,
        homeShots: 1,
        awayShots: 0,
        homeShotsOnTarget: 1,
        awayShotsOnTarget: 0,
        homePossession: 50,
        awayPossession: 50,
        homeCorners: 0,
        awayCorners: 0,
        homeFouls: 0,
        awayFouls: 0,
        homeYellowCards: 0,
        awayYellowCards: 0,
        homeRedCards: 0,
        awayRedCards: 0
      },
      homeTeam,
      awayTeam,
      homePlayerStats,
      awayPlayerStats
    );

    expect(homePasser.careerStats[0]?.assists).toBe(1);
    expect(homeScorer.careerStats[0]?.assists).toBe(0);
  });

  it('should truncate minutes played when a starter is sent off', async () => {
    const storedLeague = {
      teams: [
        {
          id: 'team-1',
          name: 'Team One',
          players: [
            {
              id: 'p1',
              name: 'Player One',
              teamId: 'team-1',
              position: Position.GOALKEEPER,
              role: Role.STARTER,
              personal: mockPersonal({ height: 190, weight: 84, age: 29, nationality: 'ENG', seasonYear: 2026 }),
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 50, strength: 80, endurance: 75, flair: 40, vision: 70, determination: 80, tackling: 20, shooting: 15, heading: 35, longPassing: 55, shortPassing: 62, luck: 50, injuryRate: 8, overall: 78 })],
              careerStats: [createEmptyPlayerCareerStats(2026, 'team-1')]
            }
          ],
          playerIds: ['p1'],
          stats: {
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            points: 0,
            last5: [MatchResult.DRAW]
          },
          selectedFormationId: 'formation_4_4_2',
          formationAssignments: { gk_1: 'p1' }
        },
        {
          id: 'team-2',
          name: 'Team Two',
          players: [
            {
              id: 'p2',
              name: 'Player Two',
              teamId: 'team-2',
              position: Position.GOALKEEPER,
              role: Role.STARTER,
              personal: mockPersonal({ height: 191, weight: 83, age: 30, nationality: 'ENG', seasonYear: 2026 }),
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 48, strength: 81, endurance: 74, flair: 39, vision: 69, determination: 82, tackling: 18, shooting: 12, heading: 34, longPassing: 53, shortPassing: 61, luck: 52, injuryRate: 7, overall: 77 })],
              careerStats: [createEmptyPlayerCareerStats(2026, 'team-2')]
            }
          ],
          playerIds: ['p2'],
          stats: {
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            points: 0,
            last5: [MatchResult.DRAW]
          },
          selectedFormationId: 'formation_4_4_2',
          formationAssignments: { gk_1: 'p2' }
        }
      ],
      schedule: [
        {
          id: 'match-1',
          week: 1,
          homeTeamId: 'team-1',
          awayTeamId: 'team-2',
          played: false
        }
      ],
      currentWeek: 1, currentSeasonYear: 2026 };

    const { service } = setup(storedLeague as { teams: []; schedule: []; currentWeek: number; currentSeasonYear: number });
    await service.ensureHydrated();

    const homeTeam = service.getTeam('team-1') as Team;
    const awayTeam = service.getTeam('team-2') as Team;
    const match = service.getMatchesForWeek(1)[0];

    const matchState = {
      homeScore: 0,
      awayScore: 0,
      currentMinute: 90,
      events: [
        {
          id: 'red-1',
          type: EventType.RED_CARD,
          description: 'Player One sent off',
          playerIds: ['p1'],
          location: { x: 50, y: 50 },
          time: 30,
          success: true
        }
      ]
    };

    const matchStats = {
      possession: { home: 45, away: 55 },
      shots: { home: 0, away: 0 },
      shotsOnTarget: { home: 0, away: 0 },
      corners: { home: 0, away: 0 },
      fouls: { home: 1, away: 0 },
      cards: {
        home: { yellow: 0, red: 1 },
        away: { yellow: 0, red: 0 }
      },
      passes: { home: 0, away: 0 },
      tackles: { home: 0, away: 0 },
      saves: { home: 0, away: 0 }
    } satisfies MatchStatistics;

    const matchReport = {
      matchId: 'match-1',
      finalScore: '0-0',
      keyMoments: [],
      tacticalAnalysis: {
        homeTeam: { possession: 45, shots: 0, corners: 0, fouls: 1, style: PlayingStyle.DEFENSIVE, effectiveness: 45 },
        awayTeam: { possession: 55, shots: 0, corners: 0, fouls: 0, style: PlayingStyle.DEFENSIVE, effectiveness: 55 },
        tacticalBattle: 'Away control'
      },
      playerPerformances: {
        homeTeam: { mvp: { playerId: 'p1', playerName: 'Player One', position: Position.GOALKEEPER, rating: 6, goals: 0, assists: 0, shots: 0, passes: 0, tackles: 0, saves: 0, fouls: 1, yellowCards: 0, redCards: 1 }, topPerformers: [], strugglers: [], averageRating: 6 },
        awayTeam: { mvp: { playerId: 'p2', playerName: 'Player Two', position: Position.GOALKEEPER, rating: 7, goals: 0, assists: 0, shots: 0, passes: 0, tackles: 0, saves: 0, fouls: 0, yellowCards: 0, redCards: 0 }, topPerformers: [], strugglers: [], averageRating: 7 },
      },
      matchSummary: 'Player One was dismissed in the first half.',
      homePlayerStats: [],
      awayPlayerStats: []
    };

    (service as unknown as { updateLeagueWithMatchResult: (...args: unknown[]) => void }).updateLeagueWithMatchResult(
      match,
      matchState,
      homeTeam,
      awayTeam,
      [],
      matchStats,
      matchReport
    );

    const homeKeeper = homeTeam.players.find(player => player.id === 'p1');
    const awayKeeper = awayTeam.players.find(player => player.id === 'p2');

    expect(homeKeeper?.careerStats[0]?.redCards).toBe(1);
    expect(homeKeeper?.careerStats[0]?.minutesPlayed).toBe(30);
    expect(homeKeeper?.careerStats[0]?.matchesPlayed).toBe(1);
    expect(awayKeeper?.careerStats[0]?.minutesPlayed).toBe(90);
  });

  it('should skip player career stat updates for forfeited matches', async () => {
    const storedLeague = {
      teams: [
        {
          id: 'team-1',
          name: 'Team One',
          players: [
            {
              id: 'p1',
              name: 'Player One',
              teamId: 'team-1',
              position: Position.GOALKEEPER,
              role: Role.STARTER,
              personal: mockPersonal({ height: 190, weight: 84, age: 29, nationality: 'ENG', seasonYear: 2026 }),
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 50, strength: 80, endurance: 75, flair: 40, vision: 70, determination: 80, tackling: 20, shooting: 15, heading: 35, longPassing: 55, shortPassing: 62, luck: 50, injuryRate: 8, overall: 78 })],
              careerStats: [createEmptyPlayerCareerStats(2026, 'team-1')]
            }
          ],
          playerIds: ['p1'],
          stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [MatchResult.DRAW] },
          selectedFormationId: 'formation_4_4_2',
          formationAssignments: { gk_1: 'p1' }
        },
        {
          id: 'team-2',
          name: 'Team Two',
          players: [
            {
              id: 'p2',
              name: 'Player Two',
              teamId: 'team-2',
              position: Position.GOALKEEPER,
              role: Role.STARTER,
              personal: mockPersonal({ height: 188, weight: 82, age: 28, nationality: 'ESP', seasonYear: 2026 }),
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 48, strength: 79, endurance: 74, flair: 38, vision: 68, determination: 79, tackling: 18, shooting: 14, heading: 33, longPassing: 54, shortPassing: 61, luck: 49, injuryRate: 7, overall: 77 })],
              careerStats: [createEmptyPlayerCareerStats(2026, 'team-2')]
            }
          ],
          playerIds: ['p2'],
          stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [MatchResult.DRAW] },
          selectedFormationId: 'formation_4_4_2',
          formationAssignments: { gk_1: 'p2' }
        }
      ],
      schedule: [
        {
          id: 'match-1',
          week: 1,
          homeTeamId: 'team-1',
          awayTeamId: 'team-2',
          played: false
        }
      ],
      currentWeek: 1, currentSeasonYear: 2026 };

    const { service } = setup(storedLeague as { teams: []; schedule: []; currentWeek: number; currentSeasonYear: number });
    await service.ensureHydrated();

    const homeTeam = service.getTeam('team-1') as Team;
    const awayTeam = service.getTeam('team-2') as Team;
    const match = service.getMatchesForWeek(1)[0];

    const matchState = {
      homeScore: 1,
      awayScore: 0,
      events: [],
      currentMinute: 37
    };
    const matchStats = {
      possession: { home: 50, away: 50 },
      shots: { home: 0, away: 0 },
      shotsOnTarget: { home: 0, away: 0 },
      corners: { home: 0, away: 0 },
      fouls: { home: 0, away: 0 },
      cards: {
        home: { yellow: 0, red: 0 },
        away: { yellow: 0, red: 0 }
      },
      passes: { home: 0, away: 0 },
      tackles: { home: 0, away: 0 },
      saves: { home: 0, away: 0 }
    } satisfies MatchStatistics;
    const matchReport = {
      matchId: 'match-1',
      finalScore: '1-0',
      keyMoments: [],
      tacticalAnalysis: {
        homeTeam: { possession: 50, shots: 0, corners: 0, fouls: 0, style: PlayingStyle.DEFENSIVE, effectiveness: 50 },
        awayTeam: { possession: 50, shots: 0, corners: 0, fouls: 0, style: PlayingStyle.DEFENSIVE, effectiveness: 40 },
        tacticalBattle: 'Even'
      },
      playerPerformances: {
        homeTeam: { mvp: { playerId: 'p1', playerName: 'Player One', position: Position.GOALKEEPER, rating: 7, goals: 0, assists: 0, shots: 0, passes: 0, tackles: 0, saves: 0, fouls: 0, yellowCards: 0, redCards: 0 }, topPerformers: [], strugglers: [], averageRating: 7 },
        awayTeam: { mvp: { playerId: 'p2', playerName: 'Player Two', position: Position.GOALKEEPER, rating: 6, goals: 0, assists: 0, shots: 0, passes: 0, tackles: 0, saves: 0, fouls: 0, yellowCards: 0, redCards: 0 }, topPerformers: [], strugglers: [], averageRating: 6 }
      },
      matchSummary: 'Forfeit'
    };

    (service as unknown as { updateLeagueWithMatchResult: (...args: unknown[]) => void }).updateLeagueWithMatchResult(
      match,
      matchState,
      homeTeam,
      awayTeam,
      [],
      matchStats,
      matchReport,
      true
    );

    expect(homeTeam.players[0].careerStats[0]?.cleanSheets).toBe(0);
    expect(homeTeam.players[0].careerStats[0]?.matchesPlayed).toBe(0);
    expect(homeTeam.players[0].careerStats[0]?.minutesPlayed).toBe(0);
    expect(awayTeam.players[0].careerStats[0]?.matchesPlayed).toBe(0);
  });

  it('should credit only the interval on the pitch when a substitute is later sent off', async () => {
    const makePlayer = (id: string, teamId: string, pos: Position, role: Role) => ({
      id,
      name: id,
      teamId,
      position: pos,
      role,
      personal: mockPersonal({ height: 182, weight: 79, age: 25, nationality: 'ENG', seasonYear: 2026 }),
      seasonAttributes: [mockSeasonAttrs(2026, { speed: 72, strength: 70, endurance: 74, flair: 60, vision: 62, determination: 68, tackling: 65, shooting: 40, heading: 60, longPassing: 58, shortPassing: 64, luck: 50, injuryRate: 8, overall: 72 })],
      careerStats: [createEmptyPlayerCareerStats(2026, 'team-2')]
    });

    const storedLeague = {
      teams: [
        {
          id: 'team-1',
          name: 'Team One',
          players: [
            makePlayer('p-starter', 'team-1', Position.MIDFIELDER, Role.STARTER),
            makePlayer('p-sub', 'team-1', Position.MIDFIELDER, Role.BENCH)
          ],
          playerIds: ['p-starter', 'p-sub'],
          stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [MatchResult.DRAW] },
          selectedFormationId: 'formation_4_4_2',
          formationAssignments: { gk_1: '' }
        },
        {
          id: 'team-2',
          name: 'Team Two',
          players: [makePlayer('p-opp', 'team-2', Position.GOALKEEPER, Role.STARTER)],
          playerIds: ['p-opp'],
          stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [MatchResult.DRAW] },
          selectedFormationId: 'formation_4_4_2',
          formationAssignments: { gk_1: 'p-opp' }
        }
      ],
      schedule: [{ id: 'match-sub-red', week: 1, homeTeamId: 'team-1', awayTeamId: 'team-2', played: false }],
      currentWeek: 1, currentSeasonYear: 2026 };

    const { service } = setup(storedLeague as { teams: []; schedule: []; currentWeek: number; currentSeasonYear: number });
    await service.ensureHydrated();

    const homeTeam = service.getTeam('team-1') as Team;
    const awayTeam = service.getTeam('team-2') as Team;
    const match = service.getMatchesForWeek(1)[0];

    // p-starter comes off at 60, p-sub comes on at 60 and is sent off at 75.
    const matchState = {
      homeScore: 0, awayScore: 0, currentMinute: 90,
      events: [
        {
          id: 'sub-1', type: EventType.SUBSTITUTION, description: 'Sub',
          playerIds: ['p-starter', 'p-sub'], location: { x: 50, y: 50 }, time: 60, success: true
        },
        {
          id: 'red-1', type: EventType.RED_CARD, description: 'Red card',
          playerIds: ['p-sub'], location: { x: 50, y: 50 }, time: 75, success: true
        }
      ]
    };

    const emptyStats = {
      possession: { home: 50, away: 50 }, shots: { home: 0, away: 0 },
      shotsOnTarget: { home: 0, away: 0 }, corners: { home: 0, away: 0 },
      fouls: { home: 1, away: 0 },
      cards: { home: { yellow: 0, red: 1 }, away: { yellow: 0, red: 0 } },
      passes: { home: 0, away: 0 }, tackles: { home: 0, away: 0 }, saves: { home: 0, away: 0 }
    } satisfies MatchStatistics;

    const matchReport = {
      matchId: 'match-sub-red', finalScore: '0-0', keyMoments: [],
      tacticalAnalysis: {
        homeTeam: { possession: 50, shots: 0, corners: 0, fouls: 1, style: PlayingStyle.DEFENSIVE, effectiveness: 50 },
        awayTeam: { possession: 50, shots: 0, corners: 0, fouls: 0, style: PlayingStyle.DEFENSIVE, effectiveness: 50 },
        tacticalBattle: 'Even'
      },
      playerPerformances: {
        homeTeam: { mvp: { playerId: 'p-sub', playerName: 'p-sub', position: Position.MIDFIELDER, rating: 5, goals: 0, assists: 0, shots: 0, passes: 0, tackles: 0, saves: 0, fouls: 1, yellowCards: 0, redCards: 1 }, topPerformers: [], strugglers: [], averageRating: 6 },
        awayTeam: { mvp: { playerId: 'p-opp', playerName: 'p-opp', position: Position.GOALKEEPER, rating: 7, goals: 0, assists: 0, shots: 0, passes: 0, tackles: 0, saves: 0, fouls: 0, yellowCards: 0, redCards: 0 }, topPerformers: [], strugglers: [], averageRating: 7 }
      },
      matchSummary: 'p-sub sent off after coming on.',
      homePlayerStats: [],
      awayPlayerStats: []
    };

    (service as unknown as { updateLeagueWithMatchResult: (...args: unknown[]) => void }).updateLeagueWithMatchResult(
      match, matchState, homeTeam, awayTeam, [], emptyStats, matchReport
    );

    const starter = homeTeam.players.find(p => p.id === 'p-starter');
    const sub = homeTeam.players.find(p => p.id === 'p-sub');

    // Starter played minutes 0-60.
    expect(starter?.careerStats[0]?.minutesPlayed).toBe(60);
    expect(starter?.careerStats[0]?.matchesPlayed).toBe(1);

    // Substitute played minutes 60-75 (15 minutes) then was dismissed.
    expect(sub?.careerStats[0]?.minutesPlayed).toBe(15);
    expect(sub?.careerStats[0]?.matchesPlayed).toBe(1);
    expect(sub?.careerStats[0]?.redCards).toBe(1);
  });

  it('should not double count shots when SHOT and GOAL are emitted for the same attempt', async () => {
    const makePlayer = (id: string, teamId: string, pos: Position, role: Role) => ({
      id,
      name: id,
      teamId,
      position: pos,
      role,
      personal: mockPersonal({ height: 182, weight: 79, age: 25, nationality: 'ENG', seasonYear: 2026 }),
      seasonAttributes: [mockSeasonAttrs(2026, { speed: 72, strength: 70, endurance: 74, flair: 60, vision: 62, determination: 68, tackling: 65, shooting: 40, heading: 60, longPassing: 58, shortPassing: 64, luck: 50, injuryRate: 8, overall: 72 })],
      careerStats: [createEmptyPlayerCareerStats(2026, 'team-2')]
    });

    const storedLeague = {
      teams: [
        {
          id: 'team-1',
          name: 'Team One',
          players: [
            makePlayer('p-home', 'team-1', Position.FORWARD, Role.STARTER),
            makePlayer('p-home-gk', 'team-1', Position.GOALKEEPER, Role.STARTER)
          ],
          playerIds: ['p-home', 'p-home-gk'],
          stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [MatchResult.DRAW] },
          selectedFormationId: 'formation_4_4_2',
          formationAssignments: { gk_1: 'p-home-gk' }
        },
        {
          id: 'team-2',
          name: 'Team Two',
          players: [makePlayer('p-away-gk', 'team-2', Position.GOALKEEPER, Role.STARTER)],
          playerIds: ['p-away-gk'],
          stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [MatchResult.DRAW] },
          selectedFormationId: 'formation_4_4_2',
          formationAssignments: { gk_1: 'p-away-gk' }
        }
      ],
      schedule: [{ id: 'match-shot-goal', week: 1, homeTeamId: 'team-1', awayTeamId: 'team-2', played: false }],
      currentWeek: 1, currentSeasonYear: 2026 };

    const { service } = setup(storedLeague as { teams: []; schedule: []; currentWeek: number; currentSeasonYear: number });
    await service.ensureHydrated();

    const homeTeam = service.getTeam('team-1') as Team;
    const awayTeam = service.getTeam('team-2') as Team;
    const match = service.getMatchesForWeek(1)[0];

    const matchState = {
      homeScore: 1,
      awayScore: 0,
      currentMinute: 90,
      events: [
        {
          id: 'shot-1', type: EventType.SHOT, description: 'Shot',
          playerIds: ['p-home'], location: { x: 50, y: 20 }, time: 12, success: true
        },
        {
          id: 'goal-1', type: EventType.GOAL, description: 'Goal',
          playerIds: ['p-home'], location: { x: 50, y: 15 }, time: 12, success: true
        }
      ]
    };

    const emptyStats = {
      possession: { home: 50, away: 50 }, shots: { home: 1, away: 0 },
      shotsOnTarget: { home: 1, away: 0 }, corners: { home: 0, away: 0 },
      fouls: { home: 0, away: 0 },
      cards: { home: { yellow: 0, red: 0 }, away: { yellow: 0, red: 0 } },
      passes: { home: 0, away: 0 }, tackles: { home: 0, away: 0 }, saves: { home: 0, away: 0 }
    } satisfies MatchStatistics;

    const matchReport = {
      matchId: 'match-shot-goal', finalScore: '1-0', keyMoments: [],
      tacticalAnalysis: {
        homeTeam: { possession: 50, shots: 1, corners: 0, fouls: 0, style: PlayingStyle.DEFENSIVE, effectiveness: 55 },
        awayTeam: { possession: 50, shots: 0, corners: 0, fouls: 0, style: PlayingStyle.DEFENSIVE, effectiveness: 45 },
        tacticalBattle: 'Even'
      },
      playerPerformances: {
        homeTeam: { mvp: { playerId: 'p-home', playerName: 'p-home', position: Position.FORWARD, rating: 8, goals: 1, assists: 0, shots: 1, passes: 0, tackles: 0, saves: 0, fouls: 0, yellowCards: 0, redCards: 0 }, topPerformers: [], strugglers: [], averageRating: 7 },
        awayTeam: { mvp: { playerId: 'p-away-gk', playerName: 'p-away-gk', position: Position.GOALKEEPER, rating: 6, goals: 0, assists: 0, shots: 0, passes: 0, tackles: 0, saves: 0, fouls: 0, yellowCards: 0, redCards: 0 }, topPerformers: [], strugglers: [], averageRating: 6 }
      },
      matchSummary: 'Single finished shot event path.',
      homePlayerStats: [],
      awayPlayerStats: []
    };

    (service as unknown as { updateLeagueWithMatchResult: (...args: unknown[]) => void }).updateLeagueWithMatchResult(
      match,
      matchState,
      homeTeam,
      awayTeam,
      [],
      emptyStats,
      matchReport
    );

    const scorer = homeTeam.players.find((player) => player.id === 'p-home');
    expect(scorer?.careerStats[0]?.shots).toBe(1);
    expect(scorer?.careerStats[0]?.shotsOnTarget).toBe(1);
    expect(scorer?.careerStats[0]?.goals).toBe(1);
  });
});

describe('GameService simulation engine', () => {
  it('should block week simulation while a single-match session is active', async () => {
    TestBed.resetTestingModule();

    const variantBSpy = {
      simulateMatch: vi.fn().mockReturnValue({
        currentMinute: 90,
        events: [],
        homeScore: 0,
        awayScore: 0,
        homeShots: 0,
        awayShots: 0,
        homeShotsOnTarget: 0,
        awayShotsOnTarget: 0
      })
    };

    TestBed.configureTestingModule({
      providers: [
        GameService,
        { provide: GeneratorService, useValue: { generateLeague: vi.fn() } },
        {
          provide: PersistenceService,
          useValue: {
            loadLeague: vi.fn().mockResolvedValue({
              teams: [
                { id: 'home', name: 'Home', stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] }, players: [], playerIds: [], selectedFormationId: 'formation_4_4_2', formationAssignments: {} },
                { id: 'away', name: 'Away', stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] }, players: [], playerIds: [], selectedFormationId: 'formation_4_4_2', formationAssignments: {} }
              ],
              schedule: [{ id: 'm1', week: 1, homeTeamId: 'home', awayTeamId: 'away', played: false }],
              currentWeek: 1,
              currentSeasonYear: 2026
            }),
            saveTeam: vi.fn().mockResolvedValue(undefined),
            saveLeagueMetadata: vi.fn().mockResolvedValue(undefined),
            saveMatchResult: vi.fn().mockResolvedValue(undefined)
          }
        },
        { provide: MatchSimulationVariantBService, useValue: variantBSpy },
        { provide: CommentaryService, useValue: { generateCommentary: vi.fn().mockReturnValue([]) } },
        { provide: StatisticsService, useValue: { generateMatchStatistics: vi.fn().mockReturnValue({} as MatchStatistics), generatePlayerStatistics: vi.fn().mockReturnValue([]) } },
        { provide: PostMatchAnalysisService, useValue: { generateMatchReport: vi.fn().mockReturnValue({ homePlayerStats: [], awayPlayerStats: [] }) } },
        { provide: FieldService, useValue: {} },
        { provide: FormationLibraryService, useValue: { listPredefinedFormations: () => [], getAllFormations: () => [], getDefaultFormationId: () => 'formation_4_4_2' } }
      ]
    });

    const service = TestBed.inject(GameService);
    await service.ensureHydrated();

    service.beginSingleMatchSimulationSession();
    service.simulateCurrentWeek();

    expect(variantBSpy.simulateMatch).not.toHaveBeenCalled();
    expect(service.league()?.currentWeek).toBe(1);
  });

  it('should allow week simulation after ending single-match session lock', async () => {
    TestBed.resetTestingModule();

    const variantBSpy = {
      simulateMatch: vi.fn().mockReturnValue({
        currentMinute: 90,
        events: [],
        homeScore: 0,
        awayScore: 0,
        homeShots: 0,
        awayShots: 0,
        homeShotsOnTarget: 0,
        awayShotsOnTarget: 0
      })
    };

    TestBed.configureTestingModule({
      providers: [
        GameService,
        { provide: GeneratorService, useValue: { generateLeague: vi.fn() } },
        {
          provide: PersistenceService,
          useValue: {
            loadLeague: vi.fn().mockResolvedValue({
              teams: [
                { id: 'home', name: 'Home', stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] }, seasonSnapshots: [{ seasonYear: 2026, playerIds: [], stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] } }], players: [], playerIds: [], selectedFormationId: 'formation_4_4_2', formationAssignments: {} },
                { id: 'away', name: 'Away', stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] }, seasonSnapshots: [{ seasonYear: 2026, playerIds: [], stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] } }], players: [], playerIds: [], selectedFormationId: 'formation_4_4_2', formationAssignments: {} }
              ],
              schedule: [{ id: 'm1', week: 1, seasonYear: 2026, homeTeamId: 'home', awayTeamId: 'away', played: false }],
              currentWeek: 1,
              currentSeasonYear: 2026
            }),
            saveTeam: vi.fn().mockResolvedValue(undefined),
            saveLeagueMetadata: vi.fn().mockResolvedValue(undefined),
            saveMatchResult: vi.fn().mockResolvedValue(undefined)
          }
        },
        { provide: MatchSimulationVariantBService, useValue: variantBSpy },
        { provide: CommentaryService, useValue: { generateCommentary: vi.fn().mockReturnValue([]) } },
        { provide: StatisticsService, useValue: { generateMatchStatistics: vi.fn().mockReturnValue({} as MatchStatistics), generatePlayerStatistics: vi.fn().mockReturnValue([]) } },
        { provide: PostMatchAnalysisService, useValue: { generateMatchReport: vi.fn().mockReturnValue({ homePlayerStats: [], awayPlayerStats: [] }) } },
        { provide: FieldService, useValue: {} },
        { provide: FormationLibraryService, useValue: { listPredefinedFormations: () => [], getAllFormations: () => [], getDefaultFormationId: () => 'formation_4_4_2' } }
      ]
    });

    const service = TestBed.inject(GameService);
    await service.ensureHydrated();

    service.beginSingleMatchSimulationSession();
    service.simulateCurrentWeek({ skipCommentary: true });
    expect(variantBSpy.simulateMatch).not.toHaveBeenCalled();
    expect(service.league()?.currentWeek).toBe(1);

    service.endSingleMatchSimulationSession();
    service.simulateCurrentWeek({ skipCommentary: true });

    expect(variantBSpy.simulateMatch).toHaveBeenCalledTimes(1);
    expect(service.league()?.currentWeek).toBe(2);
  });

  it('should block single-match simulation while a week simulation is active', () => {
    TestBed.resetTestingModule();

    const variantBSpy = {
      simulateMatch: vi.fn().mockReturnValue({
        currentMinute: 90,
        events: [],
        homeScore: 0,
        awayScore: 0,
        homeShots: 0,
        awayShots: 0,
        homeShotsOnTarget: 0,
        awayShotsOnTarget: 0
      })
    };

    TestBed.configureTestingModule({
      providers: [
        GameService,
        { provide: GeneratorService, useValue: { generateLeague: vi.fn() } },
        { provide: PersistenceService, useValue: { loadLeague: vi.fn().mockResolvedValue(null) } },
        { provide: MatchSimulationVariantBService, useValue: variantBSpy },
        { provide: CommentaryService, useValue: { generateCommentary: vi.fn().mockReturnValue([]) } },
        { provide: StatisticsService, useValue: { generateMatchStatistics: vi.fn().mockReturnValue({} as MatchStatistics), generatePlayerStatistics: vi.fn().mockReturnValue([]) } },
        { provide: PostMatchAnalysisService, useValue: { generateMatchReport: vi.fn().mockReturnValue({ homePlayerStats: [], awayPlayerStats: [] }) } },
        { provide: FieldService, useValue: {} },
        { provide: FormationLibraryService, useValue: { listPredefinedFormations: () => [], getAllFormations: () => [], getDefaultFormationId: () => 'formation_4_4_2' } }
      ]
    });

    const service = TestBed.inject(GameService);

    (service as unknown as {
      isSimulatingWeekState: { set: (value: boolean) => void };
    }).isSimulatingWeekState.set(true);

    const result = service.simulateMatchWithDetails(
      { id: 'match-1' } as never,
      { id: 'home' } as never,
      { id: 'away' } as never,
      { skipCommentary: true }
    );

    expect(result).toBeNull();
    expect(variantBSpy.simulateMatch).not.toHaveBeenCalled();
  });

  it('should use MatchSimulationVariantBService for match simulation', () => {
    TestBed.resetTestingModule();

    const variantBMatchState = {
      currentMinute: 90,
      events: [],
      homeScore: 0,
      awayScore: 0,
      homeShots: 0,
      awayShots: 0,
      homeShotsOnTarget: 0,
      awayShotsOnTarget: 0
    };
    const variantBSpy = { simulateMatch: vi.fn().mockReturnValue(variantBMatchState) };
    const statisticsSpy = { generateMatchStatistics: vi.fn().mockReturnValue({} as MatchStatistics), generatePlayerStatistics: vi.fn().mockReturnValue([]) };
    const reportSpy = { generateMatchReport: vi.fn().mockReturnValue({ homePlayerStats: [], awayPlayerStats: [] }) };
    const commentarySpy = { generateCommentary: vi.fn().mockReturnValue([]) };

    TestBed.configureTestingModule({
      providers: [
        GameService,
        { provide: GeneratorService, useValue: { generateLeague: vi.fn() } },
        { provide: PersistenceService, useValue: { loadLeague: vi.fn().mockResolvedValue(null) } },
        { provide: MatchSimulationVariantBService, useValue: variantBSpy },
        { provide: CommentaryService, useValue: commentarySpy },
        { provide: StatisticsService, useValue: statisticsSpy },
        { provide: PostMatchAnalysisService, useValue: reportSpy },
        { provide: FieldService, useValue: {} },
        { provide: FormationLibraryService, useValue: { listPredefinedFormations: () => [], getAllFormations: () => [], getDefaultFormationId: () => 'formation_4_4_2' } }
      ]
    });

    const service = TestBed.inject(GameService);

    service.simulateMatchWithDetails({ id: 'match-1', seasonYear: 2026 } as never, { id: 'home' } as never, { id: 'away' } as never, {
      enablePlayByPlay: true,
      enableSpatialTracking: true,
      enableTactics: true,
      enableFatigue: true,
      commentaryStyle: CommentaryStyle.DETAILED,
      skipCommentary: true
    });

    expect(variantBSpy.simulateMatch).toHaveBeenCalledTimes(1);
    expect(variantBSpy.simulateMatch).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'match-1' }),
      expect.objectContaining({ id: 'home' }),
      expect.objectContaining({ id: 'away' }),
      expect.objectContaining({ simulationVariant: 'B' })
    );
  });
});

describe('GameService dressBestPlayers', () => {
  const SEASON_YEAR = 2026;

  function makePlayer(id: string, position: Position, overall: number): Player {
    return createTestPlayer({ id, position, role: Role.RESERVE, seasonYear: SEASON_YEAR, stats: { overall } });
  }

  function makeTeam(id: string, players: Player[]): Team {
    return {
      id,
      name: id,
      players,
      playerIds: players.map(p => p.id),
      stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] },
      selectedFormationId: 'formation_4_4_2',
      formationAssignments: {},
      seasonSnapshots: [{ seasonYear: SEASON_YEAR, playerIds: players.map(p => p.id), stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] } }]
    };
  }

  function buildService(predefinedFormations: unknown[], allFormations = predefinedFormations) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        GameService,
        { provide: GeneratorService, useValue: { generateLeague: vi.fn() } },
        { provide: PersistenceService, useValue: { loadLeague: vi.fn().mockResolvedValue(null) } },
        { provide: DataSchemaVersionService, useValue: { hasPersistedDataSchemaVersionMismatch: signal(false).asReadonly() } },
        { provide: MatchSimulationVariantBService, useValue: {} },
        { provide: CommentaryService, useValue: {} },
        { provide: StatisticsService, useValue: { generatePlayerStatistics: vi.fn().mockReturnValue([]) } },
        { provide: PostMatchAnalysisService, useValue: {} },
        { provide: FieldService, useValue: {} },
        {
          provide: FormationLibraryService,
          useValue: {
            listPredefinedFormations: () => predefinedFormations,
            getAllFormations: () => allFormations,
            getDefaultFormationId: () => 'formation_4_4_2'
          }
        }
      ]
    });
    return TestBed.inject(GameService);
  }

  function callDressBestPlayers(service: GameService, teams: Team[]): Team[] {
    return (service as unknown as { dressBestPlayers: (t: Team[]) => Team[] }).dressBestPlayers(teams);
  }

  afterEach(() => TestBed.resetTestingModule());

  it('uses 4-4-2 hardcoded fallback keys when no formations are available', () => {
    const players = [
      makePlayer('gk1', Position.GOALKEEPER, 80),
      makePlayer('def1', Position.DEFENDER, 80),
      makePlayer('def2', Position.DEFENDER, 80),
      makePlayer('def3', Position.DEFENDER, 80),
      makePlayer('def4', Position.DEFENDER, 80),
      makePlayer('mid1', Position.MIDFIELDER, 80),
      makePlayer('mid2', Position.MIDFIELDER, 80),
      makePlayer('mid3', Position.MIDFIELDER, 80),
      makePlayer('mid4', Position.MIDFIELDER, 80),
      makePlayer('fwd1', Position.FORWARD, 80),
      makePlayer('fwd2', Position.FORWARD, 80),
    ];
    const service = buildService([]);
    const [result] = callDressBestPlayers(service, [makeTeam('t1', players)]);

    expect(result.selectedFormationId).toBe('formation_4_4_2');
    expect(result.formationAssignments['gk_1']).toBe('gk1');
    expect(result.formationAssignments['att_l']).toBe('fwd1');
    expect(result.formationAssignments['att_r']).toBe('fwd2');
    // All 11 hardcoded keys must be present
    const expectedKeys = ['gk_1', 'def_l', 'def_lc', 'def_rc', 'def_r', 'mid_l', 'mid_lc', 'mid_rc', 'mid_r', 'att_l', 'att_r'];
    expect(Object.keys(result.formationAssignments).sort()).toEqual(expectedKeys.sort());
  });

  it('falls back to 4-4-2 hardcoded keys when the only available formation cannot be filled', () => {
    // Formation requires 3 FWD, but team has only 2 → not viable
    const formation433 = {
      id: 'formation_4_3_3',
      name: '4-3-3',
      shortCode: '4-3-3',
      isUserDefined: false,
      createdAt: 0,
      slots: [
        { slotId: 'gk_1', preferredPosition: Position.GOALKEEPER, label: 'GK', coordinates: { x: 50, y: 5 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_l', preferredPosition: Position.DEFENDER, label: 'LB', coordinates: { x: 20, y: 25 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_lc', preferredPosition: Position.DEFENDER, label: 'LCB', coordinates: { x: 35, y: 15 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_rc', preferredPosition: Position.DEFENDER, label: 'RCB', coordinates: { x: 65, y: 15 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_r', preferredPosition: Position.DEFENDER, label: 'RB', coordinates: { x: 80, y: 25 }, zone: FieldZone.DEFENSE },
        { slotId: 'mid_lc', preferredPosition: Position.MIDFIELDER, label: 'LCM', coordinates: { x: 36, y: 52 }, zone: FieldZone.MIDFIELD },
        { slotId: 'mid_c', preferredPosition: Position.MIDFIELDER, label: 'CM', coordinates: { x: 50, y: 47 }, zone: FieldZone.MIDFIELD },
        { slotId: 'mid_rc', preferredPosition: Position.MIDFIELDER, label: 'RCM', coordinates: { x: 64, y: 52 }, zone: FieldZone.MIDFIELD },
        { slotId: 'att_l', preferredPosition: Position.FORWARD, label: 'LW', coordinates: { x: 22, y: 78 }, zone: FieldZone.ATTACK },
        { slotId: 'att_c', preferredPosition: Position.FORWARD, label: 'CF', coordinates: { x: 50, y: 84 }, zone: FieldZone.ATTACK },
        { slotId: 'att_r', preferredPosition: Position.FORWARD, label: 'RW', coordinates: { x: 78, y: 78 }, zone: FieldZone.ATTACK },
      ]
    };
    const players = [
      makePlayer('gk1', Position.GOALKEEPER, 80),
      makePlayer('def1', Position.DEFENDER, 80),
      makePlayer('def2', Position.DEFENDER, 80),
      makePlayer('def3', Position.DEFENDER, 80),
      makePlayer('def4', Position.DEFENDER, 80),
      makePlayer('mid1', Position.MIDFIELDER, 80),
      makePlayer('mid2', Position.MIDFIELDER, 80),
      makePlayer('mid3', Position.MIDFIELDER, 80),
      makePlayer('fwd1', Position.FORWARD, 80),
      makePlayer('fwd2', Position.FORWARD, 80),
      makePlayer('mid4', Position.MIDFIELDER, 80), // only 2 FWD, not 3
    ];
    const service = buildService([formation433]);
    const [result] = callDressBestPlayers(service, [makeTeam('t1', players)]);

    // 4-3-3 is not viable → hardcoded 4-4-2 fallback
    expect(result.selectedFormationId).toBe('formation_4_4_2');
    const expectedKeys = ['gk_1', 'def_l', 'def_lc', 'def_rc', 'def_r', 'mid_l', 'mid_lc', 'mid_rc', 'mid_r', 'att_l', 'att_r'];
    expect(Object.keys(result.formationAssignments).sort()).toEqual(expectedKeys.sort());
  });

  it('selects a viable formation and assigns the best players to its slots', () => {
    const formation433 = {
      id: 'formation_4_3_3',
      name: '4-3-3',
      shortCode: '4-3-3',
      isUserDefined: false,
      createdAt: 0,
      slots: [
        { slotId: 'gk_1', preferredPosition: Position.GOALKEEPER, label: 'GK', coordinates: { x: 50, y: 5 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_l', preferredPosition: Position.DEFENDER, label: 'LB', coordinates: { x: 20, y: 25 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_lc', preferredPosition: Position.DEFENDER, label: 'LCB', coordinates: { x: 35, y: 15 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_rc', preferredPosition: Position.DEFENDER, label: 'RCB', coordinates: { x: 65, y: 15 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_r', preferredPosition: Position.DEFENDER, label: 'RB', coordinates: { x: 80, y: 25 }, zone: FieldZone.DEFENSE },
        { slotId: 'mid_lc', preferredPosition: Position.MIDFIELDER, label: 'LCM', coordinates: { x: 36, y: 52 }, zone: FieldZone.MIDFIELD },
        { slotId: 'mid_c', preferredPosition: Position.MIDFIELDER, label: 'CM', coordinates: { x: 50, y: 47 }, zone: FieldZone.MIDFIELD },
        { slotId: 'mid_rc', preferredPosition: Position.MIDFIELDER, label: 'RCM', coordinates: { x: 64, y: 52 }, zone: FieldZone.MIDFIELD },
        { slotId: 'att_l', preferredPosition: Position.FORWARD, label: 'LW', coordinates: { x: 22, y: 78 }, zone: FieldZone.ATTACK },
        { slotId: 'att_c', preferredPosition: Position.FORWARD, label: 'CF', coordinates: { x: 50, y: 84 }, zone: FieldZone.ATTACK },
        { slotId: 'att_r', preferredPosition: Position.FORWARD, label: 'RW', coordinates: { x: 78, y: 78 }, zone: FieldZone.ATTACK },
      ]
    };
    const players = [
      makePlayer('gk1', Position.GOALKEEPER, 85),
      makePlayer('def1', Position.DEFENDER, 80),
      makePlayer('def2', Position.DEFENDER, 80),
      makePlayer('def3', Position.DEFENDER, 80),
      makePlayer('def4', Position.DEFENDER, 80),
      makePlayer('mid1', Position.MIDFIELDER, 80),
      makePlayer('mid2', Position.MIDFIELDER, 80),
      makePlayer('mid3', Position.MIDFIELDER, 80),
      makePlayer('fwd1', Position.FORWARD, 80),
      makePlayer('fwd2', Position.FORWARD, 80),
      makePlayer('fwd3', Position.FORWARD, 80),
    ];
    const service = buildService([formation433]);
    const [result] = callDressBestPlayers(service, [makeTeam('t1', players)]);

    expect(result.selectedFormationId).toBe('formation_4_3_3');
    // All 11 formation slots must be filled
    const formationSlotIds = formation433.slots.map(s => s.slotId).sort();
    expect(Object.keys(result.formationAssignments).sort()).toEqual(formationSlotIds);
    // The GK should be assigned
    expect(result.formationAssignments['gk_1']).toBe('gk1');
    // Assigned players must be marked STARTER
    const assignedIds = new Set(Object.values(result.formationAssignments));
    const starters = result.players.filter(p => p.role === Role.STARTER);
    expect(starters.map(p => p.id).sort()).toEqual([...assignedIds].sort());
  });

  it('picks the higher-scoring formation when multiple are viable', () => {
    // 4-4-2: sums 4 MID (90 each) + 2 FWD (70 each) = 360 + 140 = 500 for non-GK/DEF part
    // 4-3-3: sums 3 MID (90 each) + 3 FWD (70 each) = 270 + 210 = 480 for non-GK/DEF part
    // → 4-4-2 scores higher
    const formation442 = {
      id: 'formation_4_4_2',
      name: '4-4-2',
      shortCode: '4-4-2',
      isUserDefined: false,
      createdAt: 0,
      slots: [
        { slotId: 'gk_1', preferredPosition: Position.GOALKEEPER, label: 'GK', coordinates: { x: 50, y: 5 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_l', preferredPosition: Position.DEFENDER, label: 'LB', coordinates: { x: 20, y: 25 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_lc', preferredPosition: Position.DEFENDER, label: 'LCB', coordinates: { x: 35, y: 15 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_rc', preferredPosition: Position.DEFENDER, label: 'RCB', coordinates: { x: 65, y: 15 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_r', preferredPosition: Position.DEFENDER, label: 'RB', coordinates: { x: 80, y: 25 }, zone: FieldZone.DEFENSE },
        { slotId: 'mid_l', preferredPosition: Position.MIDFIELDER, label: 'LM', coordinates: { x: 15, y: 50 }, zone: FieldZone.MIDFIELD },
        { slotId: 'mid_lc', preferredPosition: Position.MIDFIELDER, label: 'LCM', coordinates: { x: 40, y: 50 }, zone: FieldZone.MIDFIELD },
        { slotId: 'mid_rc', preferredPosition: Position.MIDFIELDER, label: 'RCM', coordinates: { x: 60, y: 50 }, zone: FieldZone.MIDFIELD },
        { slotId: 'mid_r', preferredPosition: Position.MIDFIELDER, label: 'RM', coordinates: { x: 85, y: 50 }, zone: FieldZone.MIDFIELD },
        { slotId: 'att_l', preferredPosition: Position.FORWARD, label: 'LS', coordinates: { x: 35, y: 80 }, zone: FieldZone.ATTACK },
        { slotId: 'att_r', preferredPosition: Position.FORWARD, label: 'RS', coordinates: { x: 65, y: 80 }, zone: FieldZone.ATTACK },
      ]
    };
    const formation433 = {
      id: 'formation_4_3_3',
      name: '4-3-3',
      shortCode: '4-3-3',
      isUserDefined: false,
      createdAt: 0,
      slots: [
        { slotId: 'gk_1', preferredPosition: Position.GOALKEEPER, label: 'GK', coordinates: { x: 50, y: 5 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_l', preferredPosition: Position.DEFENDER, label: 'LB', coordinates: { x: 20, y: 25 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_lc', preferredPosition: Position.DEFENDER, label: 'LCB', coordinates: { x: 35, y: 15 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_rc', preferredPosition: Position.DEFENDER, label: 'RCB', coordinates: { x: 65, y: 15 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_r', preferredPosition: Position.DEFENDER, label: 'RB', coordinates: { x: 80, y: 25 }, zone: FieldZone.DEFENSE },
        { slotId: 'mid_lc', preferredPosition: Position.MIDFIELDER, label: 'LCM', coordinates: { x: 36, y: 52 }, zone: FieldZone.MIDFIELD },
        { slotId: 'mid_c', preferredPosition: Position.MIDFIELDER, label: 'CM', coordinates: { x: 50, y: 47 }, zone: FieldZone.MIDFIELD },
        { slotId: 'mid_rc', preferredPosition: Position.MIDFIELDER, label: 'RCM', coordinates: { x: 64, y: 52 }, zone: FieldZone.MIDFIELD },
        { slotId: 'att_l', preferredPosition: Position.FORWARD, label: 'LW', coordinates: { x: 22, y: 78 }, zone: FieldZone.ATTACK },
        { slotId: 'att_c', preferredPosition: Position.FORWARD, label: 'CF', coordinates: { x: 50, y: 84 }, zone: FieldZone.ATTACK },
        { slotId: 'att_r', preferredPosition: Position.FORWARD, label: 'RW', coordinates: { x: 78, y: 78 }, zone: FieldZone.ATTACK },
      ]
    };
    const players = [
      makePlayer('gk1', Position.GOALKEEPER, 80),
      makePlayer('def1', Position.DEFENDER, 80),
      makePlayer('def2', Position.DEFENDER, 80),
      makePlayer('def3', Position.DEFENDER, 80),
      makePlayer('def4', Position.DEFENDER, 80),
      makePlayer('mid1', Position.MIDFIELDER, 90),
      makePlayer('mid2', Position.MIDFIELDER, 90),
      makePlayer('mid3', Position.MIDFIELDER, 90),
      makePlayer('mid4', Position.MIDFIELDER, 90),
      makePlayer('fwd1', Position.FORWARD, 70),
      makePlayer('fwd2', Position.FORWARD, 70),
      makePlayer('fwd3', Position.FORWARD, 70),
    ];
    const service = buildService([formation433, formation442]);
    const [result] = callDressBestPlayers(service, [makeTeam('t1', players)]);

    expect(result.selectedFormationId).toBe('formation_4_4_2');
  });

  it('ignores user-defined formations when selecting CPU lineups', () => {
    const predefined442 = {
      id: 'formation_4_4_2',
      name: '4-4-2',
      shortCode: '4-4-2',
      isUserDefined: false,
      createdAt: 0,
      slots: [
        { slotId: 'gk_1', preferredPosition: Position.GOALKEEPER, label: 'GK', coordinates: { x: 50, y: 5 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_l', preferredPosition: Position.DEFENDER, label: 'LB', coordinates: { x: 20, y: 25 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_lc', preferredPosition: Position.DEFENDER, label: 'LCB', coordinates: { x: 35, y: 15 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_rc', preferredPosition: Position.DEFENDER, label: 'RCB', coordinates: { x: 65, y: 15 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_r', preferredPosition: Position.DEFENDER, label: 'RB', coordinates: { x: 80, y: 25 }, zone: FieldZone.DEFENSE },
        { slotId: 'mid_l', preferredPosition: Position.MIDFIELDER, label: 'LM', coordinates: { x: 15, y: 50 }, zone: FieldZone.MIDFIELD },
        { slotId: 'mid_lc', preferredPosition: Position.MIDFIELDER, label: 'LCM', coordinates: { x: 40, y: 50 }, zone: FieldZone.MIDFIELD },
        { slotId: 'mid_rc', preferredPosition: Position.MIDFIELDER, label: 'RCM', coordinates: { x: 60, y: 50 }, zone: FieldZone.MIDFIELD },
        { slotId: 'mid_r', preferredPosition: Position.MIDFIELDER, label: 'RM', coordinates: { x: 85, y: 50 }, zone: FieldZone.MIDFIELD },
        { slotId: 'att_l', preferredPosition: Position.FORWARD, label: 'LS', coordinates: { x: 35, y: 80 }, zone: FieldZone.ATTACK },
        { slotId: 'att_r', preferredPosition: Position.FORWARD, label: 'RS', coordinates: { x: 65, y: 80 }, zone: FieldZone.ATTACK },
      ]
    };
    const userDefined433 = {
      id: 'user_4_3_3',
      name: 'User 4-3-3',
      shortCode: '4-3-3',
      isUserDefined: true,
      createdAt: 0,
      slots: [
        { slotId: 'gk_1', preferredPosition: Position.GOALKEEPER, label: 'GK', coordinates: { x: 50, y: 5 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_l', preferredPosition: Position.DEFENDER, label: 'LB', coordinates: { x: 20, y: 25 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_lc', preferredPosition: Position.DEFENDER, label: 'LCB', coordinates: { x: 35, y: 15 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_rc', preferredPosition: Position.DEFENDER, label: 'RCB', coordinates: { x: 65, y: 15 }, zone: FieldZone.DEFENSE },
        { slotId: 'def_r', preferredPosition: Position.DEFENDER, label: 'RB', coordinates: { x: 80, y: 25 }, zone: FieldZone.DEFENSE },
        { slotId: 'mid_lc', preferredPosition: Position.MIDFIELDER, label: 'LCM', coordinates: { x: 36, y: 52 }, zone: FieldZone.MIDFIELD },
        { slotId: 'mid_c', preferredPosition: Position.MIDFIELDER, label: 'CM', coordinates: { x: 50, y: 47 }, zone: FieldZone.MIDFIELD },
        { slotId: 'mid_rc', preferredPosition: Position.MIDFIELDER, label: 'RCM', coordinates: { x: 64, y: 52 }, zone: FieldZone.MIDFIELD },
        { slotId: 'att_l', preferredPosition: Position.FORWARD, label: 'LW', coordinates: { x: 22, y: 78 }, zone: FieldZone.ATTACK },
        { slotId: 'att_c', preferredPosition: Position.FORWARD, label: 'CF', coordinates: { x: 50, y: 84 }, zone: FieldZone.ATTACK },
        { slotId: 'att_r', preferredPosition: Position.FORWARD, label: 'RW', coordinates: { x: 78, y: 78 }, zone: FieldZone.ATTACK },
      ]
    };
    const players = [
      makePlayer('gk1', Position.GOALKEEPER, 80),
      makePlayer('def1', Position.DEFENDER, 80),
      makePlayer('def2', Position.DEFENDER, 80),
      makePlayer('def3', Position.DEFENDER, 80),
      makePlayer('def4', Position.DEFENDER, 80),
      makePlayer('mid1', Position.MIDFIELDER, 70),
      makePlayer('mid2', Position.MIDFIELDER, 70),
      makePlayer('mid3', Position.MIDFIELDER, 70),
      makePlayer('mid4', Position.MIDFIELDER, 70),
      makePlayer('fwd1', Position.FORWARD, 90),
      makePlayer('fwd2', Position.FORWARD, 90),
      makePlayer('fwd3', Position.FORWARD, 90),
    ];
    const service = buildService([predefined442], [userDefined433, predefined442]);
    const [result] = callDressBestPlayers(service, [makeTeam('t1', players)]);

    expect(result.selectedFormationId).toBe('formation_4_4_2');
    expect(result.formationAssignments['att_l']).toBe('fwd1');
    expect(result.formationAssignments['att_r']).toBe('fwd2');
  });

  it('backfills open bench spots with available reserves when position injuries leave gaps', () => {
    // Team has the minimum viable 4-4-2 squad, but both bench-eligible midfielders
    // are injured. The 2 extra defenders (who would otherwise sit in Reserves) should
    // be promoted to fill those open bench spots.
    const formation442 = {
      id: 'formation_4_4_2',
      name: '4-4-2',
      shortCode: '4-4-2',
      isUserDefined: false,
      createdAt: 0,
      slots: [
        { slotId: 'gk_1',   preferredPosition: Position.GOALKEEPER, label: 'GK',  coordinates: { x: 50, y: 5  }, zone: FieldZone.DEFENSE  },
        { slotId: 'def_l',  preferredPosition: Position.DEFENDER,   label: 'LB',  coordinates: { x: 20, y: 25 }, zone: FieldZone.DEFENSE  },
        { slotId: 'def_lc', preferredPosition: Position.DEFENDER,   label: 'LCB', coordinates: { x: 35, y: 15 }, zone: FieldZone.DEFENSE  },
        { slotId: 'def_rc', preferredPosition: Position.DEFENDER,   label: 'RCB', coordinates: { x: 65, y: 15 }, zone: FieldZone.DEFENSE  },
        { slotId: 'def_r',  preferredPosition: Position.DEFENDER,   label: 'RB',  coordinates: { x: 80, y: 25 }, zone: FieldZone.DEFENSE  },
        { slotId: 'mid_l',  preferredPosition: Position.MIDFIELDER, label: 'LM',  coordinates: { x: 15, y: 50 }, zone: FieldZone.MIDFIELD },
        { slotId: 'mid_lc', preferredPosition: Position.MIDFIELDER, label: 'LCM', coordinates: { x: 40, y: 50 }, zone: FieldZone.MIDFIELD },
        { slotId: 'mid_rc', preferredPosition: Position.MIDFIELDER, label: 'RCM', coordinates: { x: 60, y: 50 }, zone: FieldZone.MIDFIELD },
        { slotId: 'mid_r',  preferredPosition: Position.MIDFIELDER, label: 'RM',  coordinates: { x: 85, y: 50 }, zone: FieldZone.MIDFIELD },
        { slotId: 'att_l',  preferredPosition: Position.FORWARD,    label: 'LS',  coordinates: { x: 35, y: 80 }, zone: FieldZone.ATTACK   },
        { slotId: 'att_r',  preferredPosition: Position.FORWARD,    label: 'RS',  coordinates: { x: 65, y: 80 }, zone: FieldZone.ATTACK   },
      ]
    };

    const injuredMid = (id: string): Player => ({
      ...makePlayer(id, Position.MIDFIELDER, 75),
      injuries: [{ definitionId: 'hamstring_pull', totalWeeks: 3, weeksRemaining: 3, sustainedInSeason: 2026, sustainedInWeek: 1 }]
    });

    const players = [
      makePlayer('gk1',   Position.GOALKEEPER, 80),
      makePlayer('def1',  Position.DEFENDER,   80),
      makePlayer('def2',  Position.DEFENDER,   80),
      makePlayer('def3',  Position.DEFENDER,   80),
      makePlayer('def4',  Position.DEFENDER,   80),
      // 2 extra healthy defenders that should backfill the bench
      makePlayer('def5',  Position.DEFENDER,   75),
      makePlayer('def6',  Position.DEFENDER,   74),
      makePlayer('mid1',  Position.MIDFIELDER, 80),
      makePlayer('mid2',  Position.MIDFIELDER, 80),
      makePlayer('mid3',  Position.MIDFIELDER, 80),
      makePlayer('mid4',  Position.MIDFIELDER, 80),
      // 2 bench-eligible midfielders who are injured → leave 2 open bench slots
      injuredMid('mid5'),
      injuredMid('mid6'),
      makePlayer('fwd1',  Position.FORWARD,    80),
      makePlayer('fwd2',  Position.FORWARD,    80),
    ];

    const service = buildService([formation442]);
    const [result] = callDressBestPlayers(service, [makeTeam('t1', players)]);

    const benchPlayers = result.players.filter(p => p.role === Role.BENCH);
    const reservePlayers = result.players.filter(p => p.role === Role.RESERVE);

    // The 2 injured midfielders must not be on the bench
    expect(benchPlayers.map(p => p.id)).not.toContain('mid5');
    expect(benchPlayers.map(p => p.id)).not.toContain('mid6');

    // def5 and def6 should have backfilled the 2 open bench spots
    expect(benchPlayers.map(p => p.id)).toContain('def5');
    expect(benchPlayers.map(p => p.id)).toContain('def6');

    // Injured players should be in reserves
    expect(reservePlayers.map(p => p.id)).toContain('mid5');
    expect(reservePlayers.map(p => p.id)).toContain('mid6');
  });
});

