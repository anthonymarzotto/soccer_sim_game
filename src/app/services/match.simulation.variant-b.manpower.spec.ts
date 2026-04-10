import { TestBed } from '@angular/core/testing';
import { MatchSimulationVariantBService } from './match.simulation.variant-b.service';
import { FieldService } from './field.service';
import { FormationLibraryService } from './formation-library.service';
import { CommentaryService } from './commentary.service';
import { MatchPhase, Position as PositionEnum, Role, TeamSide } from '../models/enums';
import { MatchState, TeamFormation } from '../models/simulation.types';
import { Player, Team } from '../models/types';
import { createEmptyPlayerCareerStats } from '../models/player-career-stats';

interface ActiveShapeSlot {
  slotId: string;
  playerId: string | null;
}

interface MatchShapeState {
  home: ActiveShapeSlot[];
  away: ActiveShapeSlot[];
}

interface VariantBManpowerInternals {
  activeMatchShape: MatchShapeState | null;
  initializeMatchShape: (homeTeam: Team, awayTeam: Team) => MatchShapeState;
  rebalanceShapeAfterDismissal: (
    teamKey: TeamSide,
    teamPlayers: Player[],
    dismissedPlayerId: string,
    tactics: { home: { formation: TeamFormation }; away: { formation: TeamFormation } }
  ) => void;
  buildTeamFormationFromShape: (shape: ActiveShapeSlot[], originalFormation: TeamFormation) => TeamFormation;
  checkForfeitCondition: () => TeamSide | null;
  calculateDefensivePressure: (
    state: MatchState,
    currentTeam: TeamSide,
    tactics: { home: ReturnType<FieldService['calculateTeamTactics']>; away: ReturnType<FieldService['calculateTeamTactics']> }
  ) => number;
  calculateCarrySuccessChance: (
    state: MatchState,
    carrier: Player,
    currentTeam: TeamSide,
    carrierFatigue: undefined,
    pressure: number
  ) => number;
  calculateShotShapeModifier: (
    state: MatchState,
    currentTeam: TeamSide
  ) => { onTargetBonus: number; goalChanceBonus: number };
  calculatePassShapeModifier: (
    currentLocation: { x: number; y: number },
    currentTeam: TeamSide,
    passIntent: 'RECYCLE' | 'PROGRESSION' | 'THROUGH_BALL' | 'CROSS'
  ) => number;
  determinePassFailureMode: (
    currentLocation: { x: number; y: number },
    currentTeam: TeamSide,
    passIntent: 'RECYCLE' | 'PROGRESSION' | 'THROUGH_BALL' | 'CROSS',
    pressure: number,
    passDistance: number,
    progression: number
  ) => 'TACKLED' | 'LANE_CUT_OUT' | 'OVERHIT';
}

describe('Match Simulation Variant B Manpower Shape', () => {
  let simulationB: MatchSimulationVariantBService;
  let fieldService: FieldService;
  let homePlayers: Player[];
  let awayPlayers: Player[];
  let homeTeam: Team;
  let awayTeam: Team;

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

  it('should initialize an 11-slot active shape from the selected formation', () => {
    const internals = simulationB as unknown as VariantBManpowerInternals;

    const shape = internals.initializeMatchShape(homeTeam, awayTeam);

    expect(shape.home).toHaveLength(11);
    expect(shape.away).toHaveLength(11);
    expect(shape.home.filter(slot => slot.playerId !== null)).toHaveLength(11);
    expect(shape.home.find(slot => slot.slotId === 'gk_1')?.playerId).toBe('home-gk1');
  });

  it('should preserve the central spine when rebalancing after a dismissal', () => {
    const internals = simulationB as unknown as VariantBManpowerInternals;
    const tactics = {
      home: fieldService.calculateTeamTactics(homeTeam, homePlayers),
      away: fieldService.calculateTeamTactics(awayTeam, awayPlayers)
    };

    internals.activeMatchShape = internals.initializeMatchShape(homeTeam, awayTeam);
    homePlayers.find(player => player.id === 'home-def4')!.role = Role.DISMISSED;

    internals.rebalanceShapeAfterDismissal(TeamSide.HOME, homePlayers, 'home-def4', tactics);

    const homeShape = internals.activeMatchShape?.home ?? [];
    expect(homeShape.filter(slot => slot.playerId !== null)).toHaveLength(10);
    expect(homeShape.find(slot => slot.slotId === 'gk_1')?.playerId).not.toBeNull();
    expect(homeShape.find(slot => slot.slotId === 'def_lc')?.playerId).not.toBeNull();
    expect(homeShape.find(slot => slot.slotId === 'def_rc')?.playerId).not.toBeNull();
    expect(homeShape.find(slot => slot.slotId === 'mid_lc')?.playerId).not.toBeNull();
    expect(homeShape.find(slot => slot.slotId === 'mid_rc')?.playerId).not.toBeNull();
  });

  it('should rebuild a TeamFormation from the active shape for pass-target coordinate lookup', () => {
    const internals = simulationB as unknown as VariantBManpowerInternals;
    const originalFormation = fieldService.assignPlayersToFormation(homeTeam);
    expect(originalFormation).not.toBeNull();

    const rebuilt = internals.buildTeamFormationFromShape(
      [
        { slotId: 'gk_1', playerId: 'home-gk1' },
        { slotId: 'def_l', playerId: 'home-def1' },
        { slotId: 'def_lc', playerId: 'home-def2' },
        { slotId: 'def_rc', playerId: 'home-def3' },
        { slotId: 'def_r', playerId: 'home-def4' },
        { slotId: 'mid_l', playerId: 'home-mid1' },
        { slotId: 'mid_lc', playerId: 'home-mid2' },
        { slotId: 'mid_rc', playerId: 'home-mid3' },
        { slotId: 'mid_r', playerId: 'home-mid4' },
        { slotId: 'att_l', playerId: 'home-fwd1' },
        { slotId: 'att_r', playerId: null }
      ],
      originalFormation as TeamFormation
    );

    expect(rebuilt.positions.find(position => position.slotId === 'att_r')?.playerId).toBe('');
  });

  it('should detect a forfeit when a team has fewer than seven staffed slots', () => {
    const internals = simulationB as unknown as VariantBManpowerInternals;
    const shape = internals.initializeMatchShape(homeTeam, awayTeam);

    internals.activeMatchShape = {
      ...shape,
      home: shape.home.map((slot, index) => ({
        ...slot,
        playerId: index < 6 ? slot.playerId : null
      }))
    };

    expect(internals.checkForfeitCondition()).toBe(TeamSide.HOME);
  });

  it('should reduce defensive pressure when the relevant defensive band is understaffed', () => {
    const internals = simulationB as unknown as VariantBManpowerInternals;
    const tactics = {
      home: fieldService.calculateTeamTactics(homeTeam, homePlayers),
      away: fieldService.calculateTeamTactics(awayTeam, awayPlayers)
    };
    tactics.home = { ...tactics.home, pressingIntensity: 42 };
    const state = createMatchState(awayTeam.id, 'away-fwd1', { x: 50, y: 24 });

    internals.activeMatchShape = internals.initializeMatchShape(homeTeam, awayTeam);
    const baselinePressure = internals.calculateDefensivePressure(state, TeamSide.AWAY, tactics);

    internals.activeMatchShape = {
      ...(internals.activeMatchShape as MatchShapeState),
      home: (internals.activeMatchShape as MatchShapeState).home.map(slot => {
        if (slot.slotId === 'def_l' || slot.slotId === 'def_r') {
          return { ...slot, playerId: null };
        }

        return slot;
      })
    };

    const reducedPressure = internals.calculateDefensivePressure(state, TeamSide.AWAY, tactics);

    expect(reducedPressure).toBeLessThan(baselinePressure);
  });

  it('should reduce defensive pressure when the ball-side wide channel is unstaffed', () => {
    const internals = simulationB as unknown as VariantBManpowerInternals;
    const tactics = {
      home: fieldService.calculateTeamTactics(homeTeam, homePlayers),
      away: fieldService.calculateTeamTactics(awayTeam, awayPlayers)
    };
    tactics.home = { ...tactics.home, pressingIntensity: 42 };
    const state = createMatchState(awayTeam.id, 'away-fwd1', { x: 18, y: 27 });

    internals.activeMatchShape = internals.initializeMatchShape(homeTeam, awayTeam);
    const baselinePressure = internals.calculateDefensivePressure(state, TeamSide.AWAY, tactics);

    internals.activeMatchShape = {
      ...(internals.activeMatchShape as MatchShapeState),
      home: (internals.activeMatchShape as MatchShapeState).home.map(slot => {
        if (slot.slotId === 'def_l') {
          return { ...slot, playerId: null };
        }

        return slot;
      })
    };

    const reducedPressure = internals.calculateDefensivePressure(state, TeamSide.AWAY, tactics);

    expect(reducedPressure).toBeLessThan(baselinePressure);
  });

  it('should increase carry success when central defensive coverage is depleted', () => {
    const internals = simulationB as unknown as VariantBManpowerInternals;
    const state = createMatchState(homeTeam.id, 'home-mid2', { x: 50, y: 76 });
    const carrier = homePlayers.find(player => player.id === 'home-mid2') as Player;

    internals.activeMatchShape = internals.initializeMatchShape(homeTeam, awayTeam);
    const baselineChance = internals.calculateCarrySuccessChance(state, carrier, TeamSide.HOME, undefined, 0.35);

    internals.activeMatchShape = {
      ...(internals.activeMatchShape as MatchShapeState),
      away: (internals.activeMatchShape as MatchShapeState).away.map(slot => {
        if (slot.slotId === 'def_lc' || slot.slotId === 'def_rc') {
          return { ...slot, playerId: null };
        }

        return slot;
      })
    };

    const improvedChance = internals.calculateCarrySuccessChance(state, carrier, TeamSide.HOME, undefined, 0.35);

    expect(improvedChance).toBeGreaterThan(baselineChance);
  });

  it('should improve shot shape bonuses when the defending channel is uncovered', () => {
    const internals = simulationB as unknown as VariantBManpowerInternals;
    const state = createMatchState(homeTeam.id, 'home-fwd1', { x: 18, y: 86 });

    internals.activeMatchShape = internals.initializeMatchShape(homeTeam, awayTeam);
    const baselineModifier = internals.calculateShotShapeModifier(state, TeamSide.HOME);

    internals.activeMatchShape = {
      ...(internals.activeMatchShape as MatchShapeState),
      away: (internals.activeMatchShape as MatchShapeState).away.map(slot => {
        if (slot.slotId === 'def_l') {
          return { ...slot, playerId: null };
        }

        return slot;
      })
    };

    const improvedModifier = internals.calculateShotShapeModifier(state, TeamSide.HOME);

    expect(improvedModifier.onTargetBonus).toBeGreaterThan(baselineModifier.onTargetBonus);
    expect(improvedModifier.goalChanceBonus).toBeGreaterThan(baselineModifier.goalChanceBonus);
  });

  it('should increase through-ball pass modifier when central defensive coverage is depleted', () => {
    const internals = simulationB as unknown as VariantBManpowerInternals;
    const ballLocation = { x: 50, y: 76 };

    internals.activeMatchShape = internals.initializeMatchShape(homeTeam, awayTeam);
    const baselineModifier = internals.calculatePassShapeModifier(ballLocation, TeamSide.HOME, 'THROUGH_BALL');

    internals.activeMatchShape = {
      ...(internals.activeMatchShape as MatchShapeState),
      away: (internals.activeMatchShape as MatchShapeState).away.map(slot => {
        if (slot.slotId === 'def_lc' || slot.slotId === 'def_rc') {
          return { ...slot, playerId: null };
        }

        return slot;
      })
    };

    const depletedModifier = internals.calculatePassShapeModifier(ballLocation, TeamSide.HOME, 'THROUGH_BALL');

    expect(depletedModifier).toBeGreaterThan(baselineModifier);
  });

  it('should increase progression pass modifier when the ball-side wide channel is uncovered', () => {
    const internals = simulationB as unknown as VariantBManpowerInternals;
    const wideBallLocation = { x: 18, y: 76 };

    internals.activeMatchShape = internals.initializeMatchShape(homeTeam, awayTeam);
    const baselineModifier = internals.calculatePassShapeModifier(wideBallLocation, TeamSide.HOME, 'PROGRESSION');

    internals.activeMatchShape = {
      ...(internals.activeMatchShape as MatchShapeState),
      away: (internals.activeMatchShape as MatchShapeState).away.map(slot => {
        if (slot.slotId === 'def_l') {
          return { ...slot, playerId: null };
        }

        return slot;
      })
    };

    const depletedModifier = internals.calculatePassShapeModifier(wideBallLocation, TeamSide.HOME, 'PROGRESSION');

    expect(depletedModifier).toBeGreaterThan(baselineModifier);
  });

  it('should prefer lane-cut-out failures for central through balls into dense coverage', () => {
    const internals = simulationB as unknown as VariantBManpowerInternals;
    const centralBallLocation = { x: 50, y: 76 };

    internals.activeMatchShape = internals.initializeMatchShape(homeTeam, awayTeam);

    const failureMode = internals.determinePassFailureMode(
      centralBallLocation,
      TeamSide.HOME,
      'THROUGH_BALL',
      0.42,
      31,
      12
    );

    expect(failureMode).toBe('LANE_CUT_OUT');
  });

  it('should prefer overhit failures for long wide passes into an uncovered channel', () => {
    const internals = simulationB as unknown as VariantBManpowerInternals;
    const wideBallLocation = { x: 18, y: 76 };

    internals.activeMatchShape = internals.initializeMatchShape(homeTeam, awayTeam);
    internals.activeMatchShape = {
      ...(internals.activeMatchShape as MatchShapeState),
      away: (internals.activeMatchShape as MatchShapeState).away.map(slot => {
        if (slot.slotId === 'def_l') {
          return { ...slot, playerId: null };
        }

        return slot;
      })
    };

    const failureMode = internals.determinePassFailureMode(
      wideBallLocation,
      TeamSide.HOME,
      'CROSS',
      0.38,
      32,
      10
    );

    expect(failureMode).toBe('OVERHIT');
  });
});

function createMatchState(teamId: string, playerId: string, location: { x: number; y: number }): MatchState {
  return {
    ballPossession: {
      teamId,
      playerWithBall: playerId,
      location,
      phase: MatchPhase.ATTACKING,
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