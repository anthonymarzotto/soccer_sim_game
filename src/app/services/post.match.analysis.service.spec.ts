import { TestBed } from '@angular/core/testing';
import { MatchState, PlayByPlayEvent } from '../models/simulation.types';
import { Player, Team } from '../models/types';
import { EventImportance, EventType, MatchPhase, Position, Role } from '../models/enums';
import { createEmptyPlayerCareerStats } from '../models/player-career-stats';
import { CommentaryService } from './commentary.service';
import { PostMatchAnalysisService, SeasonMatchContext } from './post.match.analysis.service';
import { StatisticsService, TeamSeasonStatistics } from './statistics.service';
import { vi } from 'vitest';

describe('PostMatchAnalysisService', () => {
  let service: PostMatchAnalysisService;

  const mockTeamStats: TeamSeasonStatistics = {
    teamId: 'team_a',
    teamName: 'Team A',
    matchesPlayed: 10,
    wins: 4,
    draws: 3,
    losses: 3,
    goalsFor: 14,
    goalsAgainst: 12,
    shotsPerGame: 12,
    possessionPerGame: 50,
    cornersPerGame: 5,
    foulsPerGame: 10,
    cardsPerGame: {
      yellow: 2,
      red: 0.2
    }
  };

  beforeEach(() => {
    const statisticsServiceMock: Partial<StatisticsService> = {
      generateTeamStatistics: () => mockTeamStats,
      generateMatchStatistics: () => ({
        possession: { home: 50, away: 50 },
        shots: { home: 4, away: 2 },
        shotsOnTarget: { home: 2, away: 1 },
        corners: { home: 3, away: 1 },
        fouls: { home: 8, away: 10 },
        cards: {
          home: { yellow: 1, red: 0 },
          away: { yellow: 2, red: 0 }
        },
        passes: { home: 320, away: 281 },
        tackles: { home: 14, away: 16 },
        saves: { home: 1, away: 2 }
      }),
      generatePlayerStatistics: () => []
    };

    TestBed.configureTestingModule({
      providers: [
        PostMatchAnalysisService,
        { provide: StatisticsService, useValue: statisticsServiceMock },
        CommentaryService
      ]
    });

    service = TestBed.inject(PostMatchAnalysisService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should compute recent form from the last 5 matches with matching contexts', () => {
    const team = createMockTeam('team_a');
    const matchStates: MatchState[] = [
      createMatchState(0, 3),
      createMatchState(1, 0),
      createMatchState(1, 1),
      createMatchState(2, 0),
      createMatchState(3, 0),
      createMatchState(2, 2)
    ];

    const contexts: SeasonMatchContext[] = [
      { homeTeamId: 'team_a', awayTeamId: 'team_x' },
      { homeTeamId: 'team_a', awayTeamId: 'team_y' },
      { homeTeamId: 'team_z', awayTeamId: 'team_a' },
      { homeTeamId: 'team_q', awayTeamId: 'team_a' },
      { homeTeamId: 'team_a', awayTeamId: 'team_w' },
      { homeTeamId: 'team_r', awayTeamId: 'team_a' }
    ];

    const report = service.generateSeasonReport(team, matchStates, contexts);

    expect(report.recentForm.matches).toBe(5);
    expect(report.recentForm.wins).toBe(2);
    expect(report.recentForm.draws).toBe(2);
    expect(report.recentForm.losses).toBe(1);
    expect(report.recentForm.points).toBe(8);
    expect(report.recentForm.goalsScored).toBe(7);
    expect(report.recentForm.goalsConceded).toBe(5);
    expect(report.recentForm.goalDifference).toBe(2);
    expect(report.recentForm.form).toEqual(['W', 'D', 'L', 'W', 'D']);
  });

  it('should throw when contexts are shorter than analyzed matches', () => {
    const team = createMockTeam('team_a');
    const matchStates: MatchState[] = [
      createMatchState(1, 0),
      createMatchState(2, 1),
      createMatchState(1, 1),
      createMatchState(0, 1),
      createMatchState(3, 2)
    ];

    const contexts: SeasonMatchContext[] = [
      { homeTeamId: 'team_a', awayTeamId: 'team_x' },
      { homeTeamId: 'team_x', awayTeamId: 'team_a' },
      { homeTeamId: 'team_a', awayTeamId: 'team_y' }
    ];

    expect(() => service.generateSeasonReport(team, matchStates, contexts)).toThrowError(
      /requires matchContexts for each analyzed match state/i
    );
  });

  it('should throw when team is missing from provided match context', () => {
    const team = createMockTeam('team_a');
    const matchStates: MatchState[] = [
      createMatchState(1, 0),
      createMatchState(2, 1),
      createMatchState(1, 1)
    ];

    const contexts: SeasonMatchContext[] = [
      { homeTeamId: 'team_a', awayTeamId: 'team_x' },
      { homeTeamId: 'team_y', awayTeamId: 'team_z' },
      { homeTeamId: 'team_q', awayTeamId: 'team_a' }
    ];

    expect(() => service.generateSeasonReport(team, matchStates, contexts)).toThrowError(
      /is not present in the match context for recent match index/i
    );
  });

  it('should surface notable saves and close-range misses in key moments', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const homeTeam = createMockTeam('team_a', [
      createMockPlayer('home-striker', 'Home Striker', 'team_a', Position.FORWARD),
      createMockPlayer('home-keeper', 'Home Keeper', 'team_a', Position.GOALKEEPER)
    ]);
    const awayTeam = createMockTeam('team_b', [
      createMockPlayer('away-striker', 'Away Striker', 'team_b', Position.FORWARD),
      createMockPlayer('away-keeper', 'Away Keeper', 'team_b', Position.GOALKEEPER)
    ]);

    const report = service.generateMatchReport(
      createMatchState(1, 0, [
        createEvent('goal-1', EventType.GOAL, ['home-striker'], 12, { x: 49, y: 14 }, true),
        createEvent('save-1', EventType.SAVE, ['home-striker', 'away-keeper'], 37, { x: 22, y: 16 }, true),
        createEvent('miss-1', EventType.MISS, ['away-striker'], 64, { x: 74, y: 18 }, false, true),
        createEvent('miss-2', EventType.MISS, ['away-striker'], 70, { x: 52, y: 50 }, false)
      ]),
      homeTeam,
      awayTeam,
      2026
    );

    expect(report.keyMoments.map(moment => moment.type)).toEqual([
      EventType.GOAL,
      EventType.SAVE,
      EventType.MISS
    ]);
    expect(report.keyMoments[1]).toMatchObject({
      type: EventType.SAVE,
      importance: EventImportance.MEDIUM,
      icon: '🧤'
    });
    expect(report.keyMoments[1].description).toContain('Away Keeper');
    expect(report.keyMoments[1].description).toContain('left channel inside the box');
    expect(report.keyMoments[2].description).toContain('right channel inside the box');
  });

  it('should include substitutions in expanded key moments with player names', () => {
    const homeTeam = createMockTeam('team_a', [
      createMockPlayer('home-mid1', 'Home Mid 1', 'team_a', Position.MIDFIELDER),
      createMockPlayer('home-mid2', 'Home Mid 2', 'team_a', Position.MIDFIELDER)
    ]);
    const awayTeam = createMockTeam('team_b', [
      createMockPlayer('away-mid1', 'Away Mid 1', 'team_b', Position.MIDFIELDER)
    ]);

    const report = service.generateMatchReport(
      createMatchState(0, 0, [
        createEvent('sub-1', EventType.SUBSTITUTION, ['home-mid1', 'home-mid2'], 67, { x: 50, y: 50 }, true)
      ]),
      homeTeam,
      awayTeam,
      2026
    );

    expect(report.keyMoments.length).toBe(1);
    expect(report.keyMoments[0].type).toBe(EventType.SUBSTITUTION);
    expect(report.keyMoments[0].importance).toBe(EventImportance.LOW);
    expect(report.keyMoments[0].description).toContain('Home Mid 1 off, Home Mid 2 on.');
    expect(report.keyMoments[0].description).toContain("(67')");
  });

  function createMockTeam(id: string, players: Player[] = []): Team {
    return {
      id,
      name: 'Team A',
      players,
      playerIds: players.map(player => player.id),
      selectedFormationId: 'formation_4_4_2',
      formationAssignments: {},
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
      seasonSnapshots: [{
        seasonYear: 2026,
        playerIds: players.map(player => player.id),
        stats: {
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          points: 0,
          last5: []
        }
      }]
    };
  }

  function createMockPlayer(id: string, name: string, teamId: string, position: Position): Player {
    return {
      id,
      name,
      teamId,
      position,
      role: Role.STARTER,
      personal: { height: 180, weight: 75, age: 25, nationality: 'ENG' },
      physical: { speed: 70, strength: 70, endurance: 70 },
      mental: { flair: 70, vision: 70, determination: 70 },
      skills: {
        tackling: 70,
        shooting: 70,
        heading: 70,
        longPassing: 70,
        shortPassing: 70,
        goalkeeping: 70
      },
      hidden: { luck: 50, injuryRate: 5 },
      overall: 70,
      careerStats: [createEmptyPlayerCareerStats(2026, teamId)]
    };
  }

  function createMatchState(homeScore: number, awayScore: number, events: PlayByPlayEvent[] = []): MatchState {
    return {
      ballPossession: {
        teamId: 'team_a',
        playerWithBall: 'p1',
        location: { x: 50, y: 50 },
        phase: MatchPhase.BUILD_UP,
        passes: 0,
        timeElapsed: 0
      },
      events,
      fatigueTimeline: [],
      currentMinute: 90,
      homeScore,
      awayScore,
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
    };
  }

  function createEvent(
    id: string,
    type: EventType,
    playerIds: string[],
    time: number,
    location: { x: number; y: number },
    success: boolean,
    includeReplayMetadata = false
  ): PlayByPlayEvent {
    const actorPlayerId = playerIds[0] ?? '';
    return {
      id,
      type,
      description: '',
      playerIds,
      location,
      time,
      success,
      additionalData: includeReplayMetadata
        ? {
          variantBReplay: {
            actorPlayerId,
            actionType: type,
            durationMs: 1400,
            keyframes: [{ timestampMs: 0, ballLocation: location }]
          }
        }
        : undefined
    };
  }
});
