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
import { MatchResult, Position, Role } from '../models/enums';
import { MatchStatistics, Team } from '../models/types';

describe('GameService persistence integration', () => {
  function setup(storedLeague: { teams: []; schedule: []; currentWeek: number } | null = null) {
    TestBed.resetTestingModule();

    const generatorSpy: Pick<GeneratorService, 'generateLeague'> = {
      generateLeague: vi.fn().mockReturnValue({ teams: [], schedule: [] })
    };

    const persistenceSpy: Pick<PersistenceService, 'loadLeague' | 'saveLeague' | 'clearLeague' | 'saveLeagueMetadata' | 'saveTeam' | 'saveTeamDefinition' | 'saveMatch' | 'saveMatchResult'> = {
      loadLeague: vi.fn().mockResolvedValue(storedLeague),
      saveLeague: vi.fn().mockResolvedValue(undefined),
      clearLeague: vi.fn().mockResolvedValue(undefined),
      saveLeagueMetadata: vi.fn().mockResolvedValue(undefined),
      saveTeam: vi.fn().mockResolvedValue(undefined),
      saveTeamDefinition: vi.fn().mockResolvedValue(undefined),
      saveMatch: vi.fn().mockResolvedValue(undefined),
      saveMatchResult: vi.fn().mockResolvedValue(undefined)
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

  it('should persist metadata only when advancing week', async () => {
    const { service, persistenceSpy } = setup({ teams: [], schedule: [], currentWeek: 4 });
    await service.ensureHydrated();

    service.advanceWeek();

    expect(service.league()?.currentWeek).toBe(5);
    expect(persistenceSpy.saveLeagueMetadata).toHaveBeenCalledWith({
      teams: [],
      schedule: [],
      currentWeek: 5
    });
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
              personal: { height: 190, weight: 84, age: 29, nationality: 'ENG' },
              physical: { speed: 50, strength: 80, endurance: 75 },
              mental: { flair: 40, vision: 70, determination: 80 },
              skills: { tackling: 20, shooting: 15, heading: 35, longPassing: 55, shortPassing: 62, goalkeeping: 88 },
              hidden: { luck: 50, injuryRate: 8 },
              overall: 78,
              careerStats: {
                matchesPlayed: 0,
                goals: 0,
                assists: 0,
                yellowCards: 0,
                redCards: 0,
                shots: 0,
                shotsOnTarget: 0,
                tackles: 0,
                interceptions: 0,
                passes: 0,
                saves: 0,
                cleanSheets: 0,
                minutesPlayed: 0
              }
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
      currentWeek: 1
    };

    const { service, persistenceSpy } = setup(storedLeague as { teams: []; schedule: []; currentWeek: number });
    await service.ensureHydrated();

    service.clearFormationAssignment('team-1', 'gk_1');

    expect(persistenceSpy.saveTeamDefinition).toHaveBeenCalledTimes(1);
    expect(persistenceSpy.saveTeamDefinition).toHaveBeenCalledWith(expect.objectContaining({ id: 'team-1' }));
    expect(persistenceSpy.saveTeam).not.toHaveBeenCalled();
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
              personal: { height: 180, weight: 78, age: 24, nationality: 'ENG' },
              physical: { speed: 60, strength: 70, endurance: 72 },
              mental: { flair: 50, vision: 58, determination: 66 },
              skills: { tackling: 78, shooting: 30, heading: 65, longPassing: 60, shortPassing: 66, goalkeeping: 5 },
              hidden: { luck: 45, injuryRate: 10 },
              overall: 72,
              careerStats: {
                matchesPlayed: 0,
                goals: 0,
                assists: 0,
                yellowCards: 0,
                redCards: 0,
                shots: 0,
                shotsOnTarget: 0,
                tackles: 0,
                interceptions: 0,
                passes: 0,
                saves: 0,
                cleanSheets: 0,
                minutesPlayed: 0
              }
            },
            {
              id: 'p1',
              name: 'Player One',
              teamId: 'team-1',
              position: Position.GOALKEEPER,
              role: Role.STARTER,
              personal: { height: 192, weight: 85, age: 28, nationality: 'ENG' },
              physical: { speed: 50, strength: 78, endurance: 70 },
              mental: { flair: 35, vision: 72, determination: 80 },
              skills: { tackling: 18, shooting: 12, heading: 40, longPassing: 56, shortPassing: 60, goalkeeping: 86 },
              hidden: { luck: 52, injuryRate: 8 },
              overall: 77,
              careerStats: {
                matchesPlayed: 0,
                goals: 0,
                assists: 0,
                yellowCards: 0,
                redCards: 0,
                shots: 0,
                shotsOnTarget: 0,
                tackles: 0,
                interceptions: 0,
                passes: 0,
                saves: 0,
                cleanSheets: 0,
                minutesPlayed: 0
              }
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
      currentWeek: 1
    };

    const { service } = setup(storedLeague as { teams: []; schedule: []; currentWeek: number });
    await service.ensureHydrated();

    const players = service.getPlayersForTeam('team-1');
    expect(players.map(player => player.id)).toEqual(['p1', 'p2']);
  });

  it('should return balanced probabilities for unknown teams', async () => {
    const { service } = setup({ teams: [], schedule: [], currentWeek: 1 });
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
              personal: { height: 190, weight: 84, age: 29, nationality: 'ENG' },
              physical: { speed: 50, strength: 80, endurance: 75 },
              mental: { flair: 40, vision: 70, determination: 80 },
              skills: { tackling: 20, shooting: 15, heading: 35, longPassing: 55, shortPassing: 62, goalkeeping: 88 },
              hidden: { luck: 50, injuryRate: 8 },
              overall: 78,
              careerStats: {
                matchesPlayed: 0,
                goals: 0,
                assists: 0,
                yellowCards: 0,
                redCards: 0,
                shots: 0,
                shotsOnTarget: 0,
                tackles: 0,
                interceptions: 0,
                passes: 0,
                saves: 0,
                cleanSheets: 0,
                minutesPlayed: 0
              }
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
              personal: { height: 191, weight: 83, age: 30, nationality: 'ENG' },
              physical: { speed: 48, strength: 81, endurance: 74 },
              mental: { flair: 39, vision: 69, determination: 82 },
              skills: { tackling: 18, shooting: 12, heading: 34, longPassing: 53, shortPassing: 61, goalkeeping: 87 },
              hidden: { luck: 52, injuryRate: 7 },
              overall: 77,
              careerStats: {
                matchesPlayed: 0,
                goals: 0,
                assists: 0,
                yellowCards: 0,
                redCards: 0,
                shots: 0,
                shotsOnTarget: 0,
                tackles: 0,
                interceptions: 0,
                passes: 0,
                saves: 0,
                cleanSheets: 0,
                minutesPlayed: 0
              }
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
      currentWeek: 1
    };

    const { service, persistenceSpy } = setup(storedLeague as { teams: []; schedule: []; currentWeek: number });
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
        homeTeam: { possession: 50, shots: 1, corners: 0, fouls: 0, style: 'Balanced', effectiveness: 50 },
        awayTeam: { possession: 50, shots: 0, corners: 0, fouls: 0, style: 'Balanced', effectiveness: 40 },
        tacticalBattle: 'Even'
      },
      playerPerformances: {
        homeTeam: { mvp: { playerId: 'p1', playerName: 'Player One', position: 'GK', rating: 7, goals: 0, assists: 0, shots: 0, passes: 0, tackles: 0, saves: 0, fouls: 0, yellowCards: 0, redCards: 0 }, topPerformers: [], strugglers: [], averageRating: 7 },
        awayTeam: { mvp: { playerId: 'p2', playerName: 'Player Two', position: 'GK', rating: 6, goals: 0, assists: 0, shots: 0, passes: 0, tackles: 0, saves: 0, fouls: 0, yellowCards: 0, redCards: 0 }, topPerformers: [], strugglers: [], averageRating: 6 }
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
      ])
    );
    expect(persistenceSpy.saveTeam).not.toHaveBeenCalled();
    expect(persistenceSpy.saveMatch).not.toHaveBeenCalled();
  });
});
