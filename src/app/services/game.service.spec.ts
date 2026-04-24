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
import { CommentaryStyle, EventType, FieldZone, MatchResult, PlayingStyle, Position, Role } from '../models/enums';
import { League, MatchStatistics, Team } from '../models/types';
import { createEmptyPlayerCareerStats } from '../models/player-career-stats';
import { createTestPersonal as mockPersonal, createTestSeasonAttributes as mockSeasonAttrs } from '../testing/test-player-fixtures';

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

  function setup(storedLeague: League | null = null) {
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

    const formationLibrarySpy: Pick<FormationLibraryService, 'getFormationSlots'> = {
      getFormationSlots: vi.fn().mockReturnValue(undefined)
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
        { provide: StatisticsService, useValue: {} },
        { provide: PostMatchAnalysisService, useValue: {} },
        { provide: FieldService, useValue: {} },
        { provide: FormationLibraryService, useValue: formationLibrarySpy as FormationLibraryService }
      ]
    });

    const service = TestBed.inject(GameService);
    return { service, generatorSpy, persistenceSpy, formationLibrarySpy, hasSchemaMismatch };
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
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 50, strength: 80, endurance: 75, flair: 40, vision: 70, determination: 80, tackling: 20, shooting: 15, heading: 35, longPassing: 55, shortPassing: 62, goalkeeping: 88, luck: 50, injuryRate: 8, overall: 78 })],
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
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 50, strength: 80, endurance: 75, flair: 40, vision: 70, determination: 80, tackling: 20, shooting: 15, heading: 35, longPassing: 55, shortPassing: 62, goalkeeping: 88, luck: 50, injuryRate: 8, overall: 78 })],
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
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 50, strength: 80, endurance: 75, flair: 40, vision: 70, determination: 80, tackling: 20, shooting: 15, heading: 35, longPassing: 55, shortPassing: 62, goalkeeping: 88, luck: 50, injuryRate: 8, overall: 78 })],
              careerStats: [createEmptyPlayerCareerStats(2026, 'team-1')]
            },
            {
              id: 'p2',
              name: 'Player Two',
              teamId: 'team-1',
              position: Position.MIDFIELDER,
              role: Role.BENCH,
              personal: mockPersonal({ height: 180, weight: 78, age: 24, nationality: 'ENG', seasonYear: 2026 }),
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 61, strength: 70, endurance: 78, flair: 55, vision: 66, determination: 71, tackling: 52, shooting: 61, heading: 48, longPassing: 67, shortPassing: 72, goalkeeping: 6, luck: 52, injuryRate: 10, overall: 73 })],
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
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 50, strength: 80, endurance: 75, flair: 40, vision: 70, determination: 80, tackling: 20, shooting: 15, heading: 35, longPassing: 55, shortPassing: 62, goalkeeping: 88, luck: 50, injuryRate: 8, overall: 78 })],
              careerStats: [createEmptyPlayerCareerStats(2026, 'team-1')]
            },
            {
              id: 'p2',
              name: 'Player Two',
              teamId: 'team-1',
              position: Position.DEFENDER,
              role: Role.STARTER,
              personal: mockPersonal({ height: 184, weight: 79, age: 25, nationality: 'ENG', seasonYear: 2026 }),
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 62, strength: 74, endurance: 77, flair: 44, vision: 60, determination: 73, tackling: 79, shooting: 22, heading: 70, longPassing: 63, shortPassing: 67, goalkeeping: 4, luck: 46, injuryRate: 9, overall: 74 })],
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
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 60, strength: 70, endurance: 72, flair: 50, vision: 58, determination: 66, tackling: 78, shooting: 30, heading: 65, longPassing: 60, shortPassing: 66, goalkeeping: 5, luck: 45, injuryRate: 10, overall: 72 })],
              careerStats: [createEmptyPlayerCareerStats(2026, 'team-1')]
            },
            {
              id: 'p1',
              name: 'Player One',
              teamId: 'team-1',
              position: Position.GOALKEEPER,
              role: Role.STARTER,
              personal: mockPersonal({ height: 192, weight: 85, age: 28, nationality: 'ENG', seasonYear: 2026 }),
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 50, strength: 78, endurance: 70, flair: 35, vision: 72, determination: 80, tackling: 18, shooting: 12, heading: 40, longPassing: 56, shortPassing: 60, goalkeeping: 86, luck: 52, injuryRate: 8, overall: 77 })],
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
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 50, strength: 80, endurance: 75, flair: 40, vision: 70, determination: 80, tackling: 20, shooting: 15, heading: 35, longPassing: 55, shortPassing: 62, goalkeeping: 88, luck: 50, injuryRate: 8, overall: 78 })],
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
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 48, strength: 81, endurance: 74, flair: 39, vision: 69, determination: 82, tackling: 18, shooting: 12, heading: 34, longPassing: 53, shortPassing: 61, goalkeeping: 87, luck: 52, injuryRate: 7, overall: 77 })],
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
      matchSummary: 'Summary'
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
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 50, strength: 80, endurance: 75, flair: 40, vision: 70, determination: 80, tackling: 20, shooting: 15, heading: 35, longPassing: 55, shortPassing: 62, goalkeeping: 88, luck: 50, injuryRate: 8, overall: 78 })],
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
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 48, strength: 81, endurance: 74, flair: 39, vision: 69, determination: 82, tackling: 18, shooting: 12, heading: 34, longPassing: 53, shortPassing: 61, goalkeeping: 87, luck: 52, injuryRate: 7, overall: 77 })],
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
      matchSummary: 'Player One was dismissed in the first half.'
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
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 50, strength: 80, endurance: 75, flair: 40, vision: 70, determination: 80, tackling: 20, shooting: 15, heading: 35, longPassing: 55, shortPassing: 62, goalkeeping: 88, luck: 50, injuryRate: 8, overall: 78 })],
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
              seasonAttributes: [mockSeasonAttrs(2026, { speed: 48, strength: 79, endurance: 74, flair: 38, vision: 68, determination: 79, tackling: 18, shooting: 14, heading: 33, longPassing: 54, shortPassing: 61, goalkeeping: 86, luck: 49, injuryRate: 7, overall: 77 })],
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
      seasonAttributes: [mockSeasonAttrs(2026, { speed: 72, strength: 70, endurance: 74, flair: 60, vision: 62, determination: 68, tackling: 65, shooting: 40, heading: 60, longPassing: 58, shortPassing: 64, goalkeeping: 5, luck: 50, injuryRate: 8, overall: 72 })],
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
      matchSummary: 'p-sub sent off after coming on.'
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
      seasonAttributes: [mockSeasonAttrs(2026, { speed: 72, strength: 70, endurance: 74, flair: 60, vision: 62, determination: 68, tackling: 65, shooting: 40, heading: 60, longPassing: 58, shortPassing: 64, goalkeeping: 5, luck: 50, injuryRate: 8, overall: 72 })],
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
      matchSummary: 'Single finished shot event path.'
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
            saveLeagueMetadata: vi.fn().mockResolvedValue(undefined),
            saveMatchResult: vi.fn().mockResolvedValue(undefined)
          }
        },
        { provide: MatchSimulationVariantBService, useValue: variantBSpy },
        { provide: CommentaryService, useValue: { generateCommentary: vi.fn().mockReturnValue([]) } },
        { provide: StatisticsService, useValue: { generateMatchStatistics: vi.fn().mockReturnValue({} as MatchStatistics) } },
        { provide: PostMatchAnalysisService, useValue: { generateMatchReport: vi.fn().mockReturnValue({}) } },
        { provide: FieldService, useValue: {} },
        { provide: FormationLibraryService, useValue: {} }
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
            saveLeagueMetadata: vi.fn().mockResolvedValue(undefined),
            saveMatchResult: vi.fn().mockResolvedValue(undefined)
          }
        },
        { provide: MatchSimulationVariantBService, useValue: variantBSpy },
        { provide: CommentaryService, useValue: { generateCommentary: vi.fn().mockReturnValue([]) } },
        { provide: StatisticsService, useValue: { generateMatchStatistics: vi.fn().mockReturnValue({} as MatchStatistics) } },
        { provide: PostMatchAnalysisService, useValue: { generateMatchReport: vi.fn().mockReturnValue({}) } },
        { provide: FieldService, useValue: {} },
        { provide: FormationLibraryService, useValue: {} }
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
        { provide: StatisticsService, useValue: { generateMatchStatistics: vi.fn().mockReturnValue({} as MatchStatistics) } },
        { provide: PostMatchAnalysisService, useValue: { generateMatchReport: vi.fn().mockReturnValue({}) } },
        { provide: FieldService, useValue: {} },
        { provide: FormationLibraryService, useValue: {} }
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
    const statisticsSpy = { generateMatchStatistics: vi.fn().mockReturnValue({} as MatchStatistics) };
    const reportSpy = { generateMatchReport: vi.fn().mockReturnValue({}) };
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
        { provide: FormationLibraryService, useValue: {} }
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
