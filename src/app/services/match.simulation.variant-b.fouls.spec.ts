import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { MatchSimulationVariantBService } from './match.simulation.variant-b.service';
import { FieldService } from './field.service';
import { FormationLibraryService } from './formation-library.service';
import { CommentaryService } from './commentary.service';
import { MatchState, SimulationConfig } from '../models/simulation.types';
import { CommentaryStyle, EventType, MatchPhase, Position as PositionEnum, Role } from '../models/enums';
import { Player, Team } from '../models/types';
import { createEmptyPlayerCareerStats } from '../models/player-career-stats';

interface VariantBInternals {
  rng: { random: () => number };
  handleFoul: (
    state: MatchState,
    action: { type: EventType.FOUL; player: Player },
    tactics: { home: ReturnType<FieldService['calculateTeamTactics']>; away: ReturnType<FieldService['calculateTeamTactics']> },
    homeTeam: Team,
    awayTeam: Team,
    minute: number,
    config: SimulationConfig,
    homePlayers: Player[],
    awayPlayers: Player[]
  ) => void;
}

describe('Match Simulation Variant B Fouls', () => {
  let simulationB: MatchSimulationVariantBService;
  let fieldService: FieldService;
  let homeTeam: Team;
  let awayTeam: Team;
  let homePlayers: Player[];
  let awayPlayers: Player[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MatchSimulationVariantBService,
        FieldService,
        FormationLibraryService,
        CommentaryService
      ]
    });

    simulationB = TestBed.inject(MatchSimulationVariantBService);
    fieldService = TestBed.inject(FieldService);
    homePlayers = create442Players('home');
    awayPlayers = create442Players('away');
    homeTeam = createTeam('home', homePlayers);
    awayTeam = createTeam('away', awayPlayers);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should record a defending-player foul and keep possession with the fouled side', () => {
    const state = createMatchState(homeTeam.id, homePlayers[9].id);
    const config = createSimulationConfig();
    const tactics = {
      home: fieldService.calculateTeamTactics(homeTeam, homePlayers),
      away: fieldService.calculateTeamTactics(awayTeam, awayPlayers)
    };
    const internals = simulationB as unknown as VariantBInternals;

    vi.spyOn(internals.rng, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.2);

    internals.handleFoul(
      state,
      { type: EventType.FOUL, player: homePlayers[9] },
      tactics,
      homeTeam,
      awayTeam,
      18,
      config,
      homePlayers,
      awayPlayers
    );

    expect(state.homeFouls).toBe(0);
    expect(state.awayFouls).toBe(1);
    expect(state.ballPossession.teamId).toBe(homeTeam.id);
    expect(state.ballPossession.playerWithBall).toBe(homePlayers[9].id);
    expect(state.ballPossession.passes).toBe(0);

    expect(state.events.map(event => event.type)).toEqual([EventType.FOUL]);
    expect(state.events[0].playerIds).toEqual([awayPlayers[1].id, homePlayers[9].id]);
  });

  it('should send a player off after a second yellow and remove them from the starter pool', () => {
    const state = createMatchState(homeTeam.id, homePlayers[10].id);
    const config = createSimulationConfig();
    const tactics = {
      home: fieldService.calculateTeamTactics(homeTeam, homePlayers),
      away: fieldService.calculateTeamTactics(awayTeam, awayPlayers)
    };
    const internals = simulationB as unknown as VariantBInternals;
    state.awayYellowCards = 1;
    state.events.push({
      id: 'prior-yellow',
      type: EventType.YELLOW_CARD,
      description: '',
      playerIds: [awayPlayers[1].id, homePlayers[10].id],
      location: { x: 50, y: 60 },
      time: 12,
      success: false
    });

    vi.spyOn(internals.rng, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.95)
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.1);

    internals.handleFoul(
      state,
      { type: EventType.FOUL, player: homePlayers[10] },
      tactics,
      homeTeam,
      awayTeam,
      44,
      config,
      homePlayers,
      awayPlayers
    );

    expect(state.awayFouls).toBe(1);
    expect(state.awayYellowCards).toBe(2);
    expect(state.awayRedCards).toBe(1);
    expect(awayPlayers[1].role).toBe(Role.DISMISSED);
    expect(state.ballPossession.teamId).toBe(homeTeam.id);
    expect(state.ballPossession.playerWithBall).toBe(homePlayers[10].id);

    expect(state.events.slice(1).map(event => event.type)).toEqual([
      EventType.FOUL,
      EventType.YELLOW_CARD,
      EventType.RED_CARD
    ]);
    expect(state.events[1].playerIds).toEqual([awayPlayers[1].id, homePlayers[10].id]);
    expect(state.events[2].playerIds).toEqual([awayPlayers[1].id, homePlayers[10].id]);
    expect(state.events[3].playerIds).toEqual([awayPlayers[1].id, homePlayers[10].id]);
  });
});

function createMatchState(teamId: string, playerId: string): MatchState {
  return {
    ballPossession: {
      teamId,
      playerWithBall: playerId,
      location: { x: 50, y: 70 },
      phase: MatchPhase.ATTACKING,
      passes: 3,
      timeElapsed: 0
    },
    events: [],
    currentMinute: 1,
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
  };
}

function createSimulationConfig(): SimulationConfig {
  return {
    enablePlayByPlay: true,
    enableSpatialTracking: true,
    enableTactics: true,
    enableFatigue: true,
    commentaryStyle: CommentaryStyle.DETAILED,
    simulationVariant: 'B'
  };
}

function create442Players(prefix: string): Player[] {
  return [
    createPlayer(`${prefix}-gk1`, prefix, PositionEnum.GOALKEEPER, Role.STARTER, 85),
    createPlayer(`${prefix}-def1`, prefix, PositionEnum.DEFENDER, Role.STARTER, 74),
    createPlayer(`${prefix}-def2`, prefix, PositionEnum.DEFENDER, Role.STARTER, 75),
    createPlayer(`${prefix}-def3`, prefix, PositionEnum.DEFENDER, Role.STARTER, 76),
    createPlayer(`${prefix}-def4`, prefix, PositionEnum.DEFENDER, Role.STARTER, 74),
    createPlayer(`${prefix}-mid1`, prefix, PositionEnum.MIDFIELDER, Role.STARTER, 77),
    createPlayer(`${prefix}-mid2`, prefix, PositionEnum.MIDFIELDER, Role.STARTER, 79),
    createPlayer(`${prefix}-mid3`, prefix, PositionEnum.MIDFIELDER, Role.STARTER, 78),
    createPlayer(`${prefix}-mid4`, prefix, PositionEnum.MIDFIELDER, Role.STARTER, 77),
    createPlayer(`${prefix}-fwd1`, prefix, PositionEnum.FORWARD, Role.STARTER, 80),
    createPlayer(`${prefix}-fwd2`, prefix, PositionEnum.FORWARD, Role.STARTER, 81)
  ];
}

function createTeam(idPrefix: string, players: Player[]): Team {
  const [gk1, def1, def2, def3, def4, mid1, mid2, mid3, mid4, fwd1, fwd2] = players;

  return {
    id: `team-${idPrefix}`,
    name: `Team ${idPrefix.toUpperCase()}`,
    players,
    playerIds: players.map(player => player.id),
    selectedFormationId: 'formation_4_4_2',
    formationAssignments: {
      gk_1: gk1.id,
      def_l: def1.id,
      def_lc: def2.id,
      def_rc: def3.id,
      def_r: def4.id,
      mid_l: mid1.id,
      mid_lc: mid2.id,
      mid_rc: mid3.id,
      mid_r: mid4.id,
      att_l: fwd1.id,
      att_r: fwd2.id
    },
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

function createPlayer(
  id: string,
  teamId: string,
  position: PositionEnum,
  role: Role,
  overall: number
): Player {
  return {
    id,
    name: id,
    teamId: `team-${teamId}`,
    position,
    role,
    personal: { height: 182, weight: 78, age: 26, nationality: 'ENG' },
    physical: { speed: overall, strength: overall, endurance: overall },
    mental: { flair: overall, vision: overall, determination: overall },
    skills: {
      tackling: overall,
      shooting: overall,
      heading: overall,
      longPassing: overall,
      shortPassing: overall,
      goalkeeping: overall
    },
    hidden: { luck: 50, injuryRate: 5 },
    overall,
    careerStats: createEmptyPlayerCareerStats()
  };
}