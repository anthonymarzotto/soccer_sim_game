import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { MatchSimulationVariantBService } from './match.simulation.variant-b.service';
import { FieldService } from './field.service';
import { FormationLibraryService } from './formation-library.service';
import { CommentaryService } from './commentary.service';
import { MatchState, PlayerFatigue, SimulationConfig } from '../models/simulation.types';
import { CommentaryStyle, EventType, MatchPhase, Position as PositionEnum, Role, TeamSide } from '../models/enums';
import { Player, Team } from '../models/types';
import { createEmptyPlayerCareerStats } from '../models/player-career-stats';

type TeamSubstitutionUsage = Record<TeamSide, number>;

interface VariantBSubstitutionInternals {
  rng: { random: () => number };
  tryTeamSubstitution: (
    teamKey: TeamSide,
    state: MatchState,
    tactics: { home: ReturnType<FieldService['calculateTeamTactics']>; away: ReturnType<FieldService['calculateTeamTactics']> },
    homeTeam: Team,
    awayTeam: Team,
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    minute: number,
    config: SimulationConfig,
    rosters: { homePlayers: Player[]; awayPlayers: Player[] },
    substitutionsUsed: TeamSubstitutionUsage
  ) => void;
}

describe('Match Simulation Variant B Substitutions', () => {
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
    homePlayers = create442PlayersWithBench('home');
    awayPlayers = create442PlayersWithBench('away');
    homeTeam = createTeam('home', homePlayers);
    awayTeam = createTeam('away', awayPlayers);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should perform a role-safe substitution and replace the ball carrier when needed', () => {
    const internals = simulationB as unknown as VariantBSubstitutionInternals;
    const config = createSimulationConfig();
    const state = createMatchState(homeTeam.id, 'home-mid1');
    const fatigue = createFatigueState(homePlayers, awayPlayers, 45);
    const tactics = {
      home: fieldService.calculateTeamTactics(homeTeam, homePlayers),
      away: fieldService.calculateTeamTactics(awayTeam, awayPlayers)
    };
    const substitutionsUsed: TeamSubstitutionUsage = { [TeamSide.HOME]: 0, [TeamSide.AWAY]: 0 };

    setFatigue(fatigue.home, 'home-mid1', 88);
    setFatigue(fatigue.home, 'home-mid2', 82);
    setFatigue(fatigue.home, 'home-mid3', 80);

    vi.spyOn(internals.rng, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0);

    internals.tryTeamSubstitution(
      TeamSide.HOME,
      state,
      tactics,
      homeTeam,
      awayTeam,
      fatigue,
      82,
      config,
      { homePlayers, awayPlayers },
      substitutionsUsed
    );

    const homeMid1 = homePlayers.find(player => player.id === 'home-mid1');
    const homeBenchMid = homePlayers.find(player => player.id === 'home-midb1');

    expect(substitutionsUsed.home).toBe(1);
    expect(homeMid1?.role).toBe(Role.SUBSTITUTED_OUT);
    expect(homeBenchMid?.role).toBe(Role.STARTER);
    expect(state.ballPossession.playerWithBall).toBe('home-midb1');

    expect(state.events.map(event => event.type)).toEqual([EventType.SUBSTITUTION]);
    expect(state.events[0].playerIds).toEqual(['home-mid1', 'home-midb1']);
  });

  it('should not reintroduce dismissed players and should honor substitution limits', () => {
    const internals = simulationB as unknown as VariantBSubstitutionInternals;
    const config = createSimulationConfig();
    const state = createMatchState(homeTeam.id, 'home-mid2');
    const fatigue = createFatigueState(homePlayers, awayPlayers, 45);
    const tactics = {
      home: fieldService.calculateTeamTactics(homeTeam, homePlayers),
      away: fieldService.calculateTeamTactics(awayTeam, awayPlayers)
    };
    const substitutionsUsed: TeamSubstitutionUsage = { [TeamSide.HOME]: 0, [TeamSide.AWAY]: 0 };

    // Dismiss the only bench mid so only the bench def is available as fallback.
    const dismissedBenchMid = homePlayers.find(player => player.id === 'home-midb1');
    if (dismissedBenchMid) {
      dismissedBenchMid.role = Role.DISMISSED;
    }

    setFatigue(fatigue.home, 'home-mid2', 90);
    setFatigue(fatigue.home, 'home-mid3', 85);
    setFatigue(fatigue.home, 'home-mid4', 84);

    vi.spyOn(internals.rng, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0);

    internals.tryTeamSubstitution(
      TeamSide.HOME,
      state,
      tactics,
      homeTeam,
      awayTeam,
      fatigue,
      83,
      config,
      { homePlayers, awayPlayers },
      substitutionsUsed
    );

    // No same-position bench player available (midb1 is dismissed), falls back to best bench player.
    expect(state.events.length).toBe(1);
    expect(state.events[0].playerIds[1]).toBe('home-defb1');

    const cappedUsage: TeamSubstitutionUsage = { [TeamSide.HOME]: 5, [TeamSide.AWAY]: 0 };
    vi.spyOn(internals.rng, 'random').mockReturnValue(0);

    internals.tryTeamSubstitution(
      TeamSide.HOME,
      state,
      tactics,
      homeTeam,
      awayTeam,
      fatigue,
      86,
      config,
      { homePlayers, awayPlayers },
      cappedUsage
    );

    expect(state.events.length).toBe(1);
    expect(cappedUsage.home).toBe(5);
  });

  it('should not allow a subbed-off player to come back on later', () => {
    const internals = simulationB as unknown as VariantBSubstitutionInternals;
    const config = createSimulationConfig();
    const state = createMatchState(homeTeam.id, 'home-mid1');
    const fatigue = createFatigueState(homePlayers, awayPlayers, 45);
    const tactics = {
      home: fieldService.calculateTeamTactics(homeTeam, homePlayers),
      away: fieldService.calculateTeamTactics(awayTeam, awayPlayers)
    };
    const substitutionsUsed: TeamSubstitutionUsage = { [TeamSide.HOME]: 0, [TeamSide.AWAY]: 0 };

    setFatigue(fatigue.home, 'home-mid1', 91);
    setFatigue(fatigue.home, 'home-mid2', 86);
    setFatigue(fatigue.home, 'home-mid3', 84);

    vi.spyOn(internals.rng, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0);

    internals.tryTeamSubstitution(
      TeamSide.HOME,
      state,
      tactics,
      homeTeam,
      awayTeam,
      fatigue,
      80,
      config,
      { homePlayers, awayPlayers },
      substitutionsUsed
    );

    // Force a second substitution cycle where the previous subbed-off player would be best by quality
    // if re-entry were allowed.
    const subbedOffMid = homePlayers.find(player => player.id === 'home-mid1');
    const incomingMid = homePlayers.find(player => player.id === 'home-midb1');
    expect(subbedOffMid?.role).toBe(Role.SUBSTITUTED_OUT);
    expect(incomingMid?.role).toBe(Role.STARTER);

    setFatigue(fatigue.home, 'home-mid2', 93);

    internals.tryTeamSubstitution(
      TeamSide.HOME,
      state,
      tactics,
      homeTeam,
      awayTeam,
      fatigue,
      84,
      config,
      { homePlayers, awayPlayers },
      substitutionsUsed
    );

    expect(state.events.length).toBe(2);
    expect(state.events[1].type).toBe(EventType.SUBSTITUTION);
    expect(state.events[1].playerIds[1]).not.toBe('home-mid1');
    expect(homePlayers.find(player => player.id === 'home-mid1')?.role).toBe(Role.SUBSTITUTED_OUT);
  });
});

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

function createMatchState(teamId: string, playerId: string): MatchState {
  return {
    ballPossession: {
      teamId,
      playerWithBall: playerId,
      location: { x: 50, y: 62 },
      phase: MatchPhase.BUILD_UP,
      passes: 2,
      timeElapsed: 0
    },
    events: [],
    currentMinute: 0,
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

function createFatigueState(home: Player[], away: Player[], baseFatigue: number): { home: PlayerFatigue[]; away: PlayerFatigue[] } {
  const toFatigue = (players: Player[]): PlayerFatigue[] => players.map(player => ({
    playerId: player.id,
    currentStamina: 100 - baseFatigue,
    fatigueLevel: baseFatigue,
    performanceModifier: 0.8
  }));

  return {
    home: toFatigue(home),
    away: toFatigue(away)
  };
}

function setFatigue(entries: PlayerFatigue[], playerId: string, fatigueLevel: number): void {
  const entry = entries.find(item => item.playerId === playerId);
  if (entry) {
    entry.fatigueLevel = fatigueLevel;
  }
}

function create442PlayersWithBench(prefix: string): Player[] {
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
    createPlayer(`${prefix}-fwd2`, prefix, PositionEnum.FORWARD, Role.STARTER, 81),
    createPlayer(`${prefix}-midb1`, prefix, PositionEnum.MIDFIELDER, Role.BENCH, 76),
    createPlayer(`${prefix}-defb1`, prefix, PositionEnum.DEFENDER, Role.BENCH, 73),
    createPlayer(`${prefix}-midr1`, prefix, PositionEnum.MIDFIELDER, Role.RESERVE, 75)
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
