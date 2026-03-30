import { TestBed } from '@angular/core/testing';
import { MatchState } from '../models/simulation.types';
import { Team } from '../models/types';
import { MatchPhase } from '../models/enums';
import { CommentaryService } from './commentary.service';
import { PostMatchAnalysisService, SeasonMatchContext } from './post.match.analysis.service';
import { StatisticsService, TeamSeasonStatistics } from './statistics.service';

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
      generateTeamStatistics: () => mockTeamStats
    };

    TestBed.configureTestingModule({
      providers: [
        PostMatchAnalysisService,
        { provide: StatisticsService, useValue: statisticsServiceMock },
        { provide: CommentaryService, useValue: {} }
      ]
    });

    service = TestBed.inject(PostMatchAnalysisService);
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
      /is not present in provided match context/i
    );
  });

  function createMockTeam(id: string): Team {
    return {
      id,
      name: 'Team A',
      players: [],
      playerIds: [],
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
      }
    };
  }

  function createMatchState(homeScore: number, awayScore: number): MatchState {
    return {
      ballPossession: {
        teamId: 'team_a',
        playerWithBall: 'p1',
        location: { x: 50, y: 50 },
        phase: MatchPhase.BUILD_UP,
        passes: 0,
        timeElapsed: 0
      },
      events: [],
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
});
