import { Injectable, inject } from "@angular/core";
import { Match, Team, Player, StatKey } from "../models/types";
import {
  MatchState,
  SimulationConfig,
  TacticalSetup,
  PlayerFatigue,
  Coordinates,
  VariantBReplayMetadata,
  VariantBTuningConfig,
  TeamFormation,
  PlayByPlayEventAdditionalData,
  VariantBMatchShapeSnapshot,
  MinuteFatigueSnapshot,
  PlayerFatigueSnapshot,
  calculateFatigueModifier,
  scaleOverallWithFatigue,
  CardReason,
  PassCandidateDecision,
  PassScoreBreakdown,
  ScrambleCandidateDecision,
  TackleCandidateDecision,
} from "../models/simulation.types";
import { FieldService } from "./field.service";
import { RngService } from "./rng.service";
import {
  EventType,
  FieldZone,
  InjuryRollKind,
  MatchPhase,
  PlayingStyle,
  Position as PositionEnum,
  getPositionGroup,
  Role,
  TeamSide,
} from "../models/enums";
import { resolveTeamPlayers } from "../models/team-players";
import { getCurrentPlayerSeasonAttributes, isPlayerEligible } from "../models/season-history";
import {
  InjuryDefinition,
  pickInjuryDefinition,
  rollInjuryDurationWeeks,
} from "../data/injuries";

const PASSIVE_INTERCEPTION_CHANCE = 0.50; // 50% of interceptions become loose-ball scramble
const PASSIVE_TACKLE_CHANCE = 0.65;        // 65% of tackles from carries become loose-ball scramble

interface ResolvedRosters {
  /** On-field starters only — all gameplay methods use these exclusively. */
  homePlayers: Player[];
  /** On-field starters only — all gameplay methods use these exclusively. */
  awayPlayers: Player[];
  /** Bench players — accessed only by substitution logic. */
  homeBench: Player[];
  /** Bench players — accessed only by substitution logic. */
  awayBench: Player[];
}

type TeamSubstitutionUsage = Record<TeamSide, number>;

interface ActiveShapeSlot {
  slotId: string;
  playerId: string | null;
  coordinates: Coordinates;
  zone: FieldZone;
  role: string;
  preferredPosition: PositionEnum;
  runProgress: number;
  markingTargetPlayerId: string | null;
}

interface MatchShapeState {
  home: ActiveShapeSlot[];
  away: ActiveShapeSlot[];
}

interface MatchAction {
  type: EventType;
  player: Player;
  passIntent?: PassIntent;
  actionWeights?: { pass: number; carry: number; shot: number; foul: number };
}

const PASS_INTENT = {
  RECYCLE: "RECYCLE",
  PROGRESSION: "PROGRESSION",
  THROUGH_BALL: "THROUGH_BALL",
  CROSS: "CROSS",
} as const;
type PassIntent = (typeof PASS_INTENT)[keyof typeof PASS_INTENT];

const PASS_FAILURE_MODE = {
  TACKLED: "TACKLED",
  LANE_CUT_OUT: "LANE_CUT_OUT",
  OVERHIT: "OVERHIT",
} as const;
type PassFailureMode =
  (typeof PASS_FAILURE_MODE)[keyof typeof PASS_FAILURE_MODE];

const LATE_GAME_SCORELINE = {
  LEADING: "LEADING",
  TRAILING: "TRAILING",
  LEVEL: "LEVEL",
} as const;
type LateGameScoreLine =
  (typeof LATE_GAME_SCORELINE)[keyof typeof LATE_GAME_SCORELINE];

// --- Injury tuning -------------------------------------------------------
// Calibration target: ~19 injuries / team / 30 matches with ~2.74 games
// missed per injury (~52 games missed / team / season).
// See plans/player-injuries.md for derivation.
const INJURY_CONTACT_BASE_CHANCE = 0.002;
const INJURY_NON_CONTACT_BASE_CHANCE = 0.00033;
const INJURY_FOUL_VICTIM_MODIFIER = 1.5;
const INJURY_FOUL_OFFENDER_MODIFIER = 1.5;
const INJURY_TACKLE_MODIFIER = 1.25;
// `injuryRate` is a season attribute centered around 50; use it as a linear
// scaling factor against the base chance above.
const INJURY_REFERENCE_RATE = 50;

const DEFAULT_VARIANT_B_TUNING: VariantBTuningConfig = {
  baseTickMin: 1,
  baseTickMax: 3,
  midfieldTickMin: 2,
  midfieldTickMax: 5,
  attackTickMin: 1,
  attackTickMax: 3,
  lateCloseBoostTicks: 1,

  movementStepBase: 2.4,
  movementStepRandom: 3.0,
  lateUrgencyMultiplier: 1.2,

  passWeightBase: 0.63,
  carryWeightBase: 0.12,
  shotWeightBase: 0.16,
  foulWeightBase: 0.03,
  outOfWindowShotMultiplier: 0.25,

  onTargetBase: 0.28,
  onTargetSkillScale: 0.0012,
  onTargetWidePenalty: 0.06,
  onTargetFatiguePenalty: 0.04,
  onTargetMin: 0.15,
  onTargetMax: 0.82,

  goalChanceBase: 0.19,
  goalChanceSkillVsKeeperScale: 0.0008,
  goalChanceWidePenalty: 0.035,
  goalChanceMin: 0.10,
  goalChanceMax: 0.52,

  homeAdvantageGoalBonus: 0.04,
  cardChanceBase: 0.40,
  directRedChance: 0.01,
  secondYellowChanceMultiplier: 0.25,
  penaltyFoulRateMultiplier: 0.20,
  saveToCornerChance: 0.45,
  missToCornerChance: 0.30,
  cornerGoalChanceBase: 0.035,
  cornerGoalChanceMax: 0.10,
  indirectFkGoalChanceBase: 0.035,
  indirectFkGoalChanceMax: 0.10,
  skillCompressionFactor: 0.60,
};

@Injectable({
  providedIn: "root",
})
export class MatchSimulationVariantBService {
  private fieldService = inject(FieldService);
  private rng = inject(RngService);
  private readonly maxSubstitutionsPerTeam = 5;
  private readonly goalkeeperStaminaDrainMultiplier = 0.95;

  private activeTuning: VariantBTuningConfig = DEFAULT_VARIANT_B_TUNING;
  private activeMatchShape: MatchShapeState | null = null;
  private pendingTacticalSubstitutions: TeamSubstitutionUsage = {
    home: 0,
    away: 0,
  };
  private injuredPlayerIds = new Set<string>();
  private pendingInjuryReplacements: Record<TeamSide, { playerId: string; position: PositionEnum }[]> = {
    home: [],
    away: [],
  };
  private lastSimulationForfeit: TeamSide | null = null;
  private currentSeasonYear = new Date().getFullYear();
  private activeRosters: ResolvedRosters | null = null;
  private lastPassDecisions: PassCandidateDecision[] | null = null;

  didLastSimulationEndByForfeit(): boolean {
    return this.lastSimulationForfeit !== null;
  }

  private getPlayerStat(player: Player, statKey: StatKey): number {
    const attrs = getCurrentPlayerSeasonAttributes(player, this.currentSeasonYear);
    const rawVal = ((attrs as unknown as Record<string, unknown>)[statKey] as { value: number } | undefined)?.value ?? 70;
    if (statKey === 'endurance' || statKey === 'injuryRate' || statKey === 'overall') {
      return rawVal;
    }
    const factor = this.activeTuning.skillCompressionFactor ?? 1.0;
    return 70 + (rawVal - 70) * factor;
  }

  simulateMatch(
    match: Match,
    homeTeam: Team,
    awayTeam: Team,
    config: SimulationConfig,
  ): MatchState {
    this.currentSeasonYear = match.seasonYear ?? new Date().getFullYear();
    this.rng.beginSimulation(config.seed);
    this.activeTuning = {
      ...DEFAULT_VARIANT_B_TUNING,
      ...(config.variantBTuning ?? {}),
    };

    // Simulate against isolated copies so in-match mutations never leak into canonical league state.
    const simulatedHomeTeam = structuredClone(homeTeam);
    const simulatedAwayTeam = structuredClone(awayTeam);

    const rosters = this.buildResolvedRosters(simulatedHomeTeam, simulatedAwayTeam);
    this.activeRosters = rosters;

    const tactics = this.calculateTeamTactics(
      simulatedHomeTeam,
      simulatedAwayTeam,
    );
    const fatigue = this.initializeFatigue(rosters);

    let currentState = this.initializeMatchState(
      match,
      simulatedHomeTeam,
      rosters.homePlayers,
    );
    this.recordFatigueSnapshot(currentState, 0, fatigue);
    const substitutionsUsed: TeamSubstitutionUsage = { home: 0, away: 0 };
    this.activeMatchShape = this.initializeMatchShape(
      simulatedHomeTeam,
      simulatedAwayTeam,
    );
    this.pendingTacticalSubstitutions = { home: 0, away: 0 };
    this.injuredPlayerIds = new Set();
    this.pendingInjuryReplacements = { home: [], away: [] };
    this.lastSimulationForfeit = null;

    // Variant B increases dynamism with adaptive ticks per minute.
    for (let minute = 1; minute <= 95; minute++) {
      const preMinuteForfeit = this.checkForfeitCondition();
      if (preMinuteForfeit) {
        currentState = this.applyForfeitScoreline(
          currentState,
          preMinuteForfeit,
          minute,
          simulatedHomeTeam.id,
          simulatedAwayTeam.id,
        );
        break;
      }

      const ticks = this.determineTicksForMinute(currentState, minute, simulatedHomeTeam.id);
      let forfeited = false;

      for (let tick = 0; tick < ticks; tick++) {
        currentState = this.simulateVariantBTick(
          currentState,
          tactics,
          fatigue,
          simulatedHomeTeam,
          simulatedAwayTeam,
          minute,
          config,
          rosters,
        );

        if (this.lastSimulationForfeit) {
          currentState = this.applyForfeitScoreline(
            currentState,
            this.lastSimulationForfeit,
            minute,
            simulatedHomeTeam.id,
            simulatedAwayTeam.id,
          );
          forfeited = true;
          break;
        }
      }

      if (forfeited) {
        break;
      }

      this.processMinuteSubstitutions(
        currentState,
        tactics,
        fatigue,
        simulatedHomeTeam,
        simulatedAwayTeam,
        minute,
        config,
        rosters,
        substitutionsUsed,
      );

      this.normalizeFatigueForTickCount(fatigue, ticks, rosters);
      this.recordFatigueSnapshot(currentState, minute, fatigue);
    }

    this.activeMatchShape = null;
    this.pendingTacticalSubstitutions = { home: 0, away: 0 };
    this.injuredPlayerIds = new Set();
    this.pendingInjuryReplacements = { home: [], away: [] };
    this.activeRosters = null;

    return currentState;
  }

  private simulateVariantBTick(
    state: MatchState,
    tactics: { home: TacticalSetup; away: TacticalSetup },
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    homeTeam: Team,
    awayTeam: Team,
    minute: number,
    config: SimulationConfig,
    rosters: ResolvedRosters,
  ): MatchState {
    const newState = { ...state };
    this.lastPassDecisions = null;
    newState.currentMinute = minute;

    this.updateFatigue(fatigue, minute, rosters);

    const currentTeam =
      newState.ballPossession.teamId === homeTeam.id
        ? TeamSide.HOME
        : TeamSide.AWAY;

    // Decrement counterAttackTicks if active
    if (newState.counterAttackTicks !== undefined && newState.counterAttackTicks > 0) {
      newState.counterAttackTicks--;
      if (newState.counterAttackTicks === 0) {
        newState.ballPossession.phase = this.getPhaseFromLocation(
          newState.ballPossession.location,
          currentTeam,
          newState,
        );
      }
    }

    const teamBeforeAction = newState.ballPossession.teamId;

    const teamPlayers =
      currentTeam === TeamSide.HOME ? rosters.homePlayers : rosters.awayPlayers;

    const carrier = this.getBallCarrier(
      newState.ballPossession.playerWithBall,
      teamPlayers,
    );
    const locationBeforeMove = { ...newState.ballPossession.location };
    this.applyCarrierMovement(newState, carrier, currentTeam, minute);
    const locationBeforeAction = { ...newState.ballPossession.location };

    this.updateDynamicPlayerPositions(newState, tactics, rosters, fatigue);

    const action = this.determineCarrierAction(
      newState,
      carrier,
      tactics,
      fatigue,
      currentTeam,
      minute,
    );
    const eventsBefore = newState.events.length;
    const eventCreated = this.executeVariantBAction(
      newState,
      action,
      tactics,
      fatigue,
      homeTeam,
      awayTeam,
      minute,
      config,
      rosters,
    );
    const locationAfterAction = { ...newState.ballPossession.location };

    const teamAfterAction = newState.ballPossession.teamId;
    if (teamBeforeAction !== teamAfterAction) {
      const newTeamSide = teamAfterAction === homeTeam.id ? TeamSide.HOME : TeamSide.AWAY;
      const ballLoc = newState.ballPossession.location;
      const attackingY = newTeamSide === TeamSide.HOME ? ballLoc.y : 100 - ballLoc.y;
      
      const hasTurnoverEvent = newState.events.length > eventsBefore &&
        (newState.events[newState.events.length - 1].type === EventType.TACKLE ||
         newState.events[newState.events.length - 1].type === EventType.INTERCEPTION);

      // If won deep via actual turnover, start counter-attack
      if (attackingY < 50 && hasTurnoverEvent) {
        newState.ballPossession.phase = MatchPhase.COUNTER_ATTACK;
        newState.counterAttackTicks = 2;
      }
    }

    if (eventCreated) {
      const replayActionType = this.resolveReplayActionType(
        newState,
        minute,
        action.type,
      );
      const replayActorPlayerId = this.resolveReplayActorPlayerId(
        newState,
        minute,
        carrier.id,
      );
      this.attachVariantBReplayMetadata(
        newState,
        minute,
        this.createReplayMetadata(
          replayActorPlayerId,
          replayActionType,
          locationBeforeMove,
          locationBeforeAction,
          locationAfterAction,
        ),
      );
    }

    if (config.debugTickTracing) {
      const coverage = this.getDefendingShapeContextForLocation(locationBeforeAction, currentTeam);

      const eventDetails = eventsBefore < newState.events.length ? newState.events[newState.events.length - 1] : null;

      newState.tickTraces = newState.tickTraces || [];
      newState.tickTraces.push({
        minute,
        tickIndex: newState.tickTraces.length,
        ballPossession: { ...newState.ballPossession },
        actionWeights: action.actionWeights || { pass: 0, carry: 0, shot: 0, foul: 0 },
        channels: {
          wideChannel: coverage?.wideChannel ?? false,
          channelSlots: coverage?.channelSlots.length ?? 0,
          centralSlots: coverage?.centralSlots.length ?? 0
        },
        eventCreated: eventDetails,
        matchShapeSnapshot: this.createFormationSnapshot() ?? null,
        passDecisions: this.lastPassDecisions ?? undefined
      });
    }

    this.updatePossessionStats(newState, rosters.homePlayers);
    return newState;
  }

  private initializeMatchState(
    _match: Match,
    homeTeam: Team,
    homePlayers: Player[],
  ): MatchState {
    return {
      ballPossession: {
        teamId: homeTeam.id,
        playerWithBall: this.getRandomPlayerId(
          homePlayers.filter((p) => p.position !== PositionEnum.GK),
        ),
        location: { x: 50, y: 50 },
        phase: MatchPhase.BUILD_UP,
        passes: 0,
        timeElapsed: 0,
      },
      events: [],
      fatigueTimeline: [],
      counterAttackTicks: 0,
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
      awayRedCards: 0,
      homeFreeKicks: 0,
      awayFreeKicks: 0,
      homePenalties: 0,
      awayPenalties: 0,
      homePenaltyGoals: 0,
      awayPenaltyGoals: 0,
      homeSetPieceGoals: 0,
      awaySetPieceGoals: 0,
    };
  }

  private calculateTeamTactics(
    homeTeam: Team,
    awayTeam: Team,
  ): { home: TacticalSetup; away: TacticalSetup } {
    const homeTactics = this.fieldService.calculateTeamTactics(
      homeTeam,
      this.currentSeasonYear,
    );
    const awayTactics = this.fieldService.calculateTeamTactics(
      awayTeam,
      this.currentSeasonYear,
    );

    // Mirror away team's formation coordinates so they align with the y=100 (defending) end of the pitch.
    awayTactics.formation.positions = awayTactics.formation.positions.map((pos) => ({
      ...pos,
      coordinates: {
        x: 100 - pos.coordinates.x,
        y: 100 - pos.coordinates.y,
      },
    }));

    return {
      home: homeTactics,
      away: awayTactics,
    };
  }

  private initializeFatigue(
    rosters: ResolvedRosters,
  ): { home: PlayerFatigue[]; away: PlayerFatigue[] } {
    const createFatigue = (players: Player[]): PlayerFatigue[] => {
      return players.map((player) => ({
        playerId: player.id,
        fatigueLevel: player.fatigue ?? 0,
        performanceModifier: calculateFatigueModifier(player.fatigue ?? 0),
      }));
    };

    return {
      home: createFatigue([...rosters.homePlayers, ...rosters.homeBench]),
      away: createFatigue([...rosters.awayPlayers, ...rosters.awayBench]),
    };
  }

  private recordFatigueSnapshot(
    state: MatchState,
    minute: number,
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
  ): void {
    const players: PlayerFatigueSnapshot[] = [];
    const append = (entries: PlayerFatigue[]) => {
      entries.forEach((entry) => {
        players.push({
          playerId: entry.playerId,
          fatigue: Math.round(this.clamp(entry.fatigueLevel, 0, 100)),
        });
      });
    };

    append(fatigue.home);
    append(fatigue.away);

    const timelineEntry: MinuteFatigueSnapshot = {
      minute,
      players,
    };
    const existingIndex = state.fatigueTimeline.findIndex(
      (entry) => entry.minute === minute,
    );
    if (existingIndex >= 0) {
      state.fatigueTimeline[existingIndex] = timelineEntry;
      return;
    }

    state.fatigueTimeline.push(timelineEntry);
  }

  private determineTicksForMinute(
    state: MatchState,
    minute: number,
    homeTeamId: string,
  ): number {
    const isHomePossession = state.ballPossession.teamId === homeTeamId;
    const relativeY = isHomePossession
      ? state.ballPossession.location.y
      : 100 - state.ballPossession.location.y;

    const zone = this.fieldService.getZoneFromY(relativeY);
    const scoreDelta = Math.abs(state.homeScore - state.awayScore);
    const lateGame = minute >= 75;

    let minTicks = this.activeTuning.baseTickMin;
    let maxTicks = this.activeTuning.baseTickMax;

    if (zone === FieldZone.MIDFIELD) {
      minTicks = this.activeTuning.midfieldTickMin;
      maxTicks = this.activeTuning.midfieldTickMax;
    }

    if (zone === FieldZone.ATTACK) {
      minTicks = this.activeTuning.attackTickMin;
      maxTicks = this.activeTuning.attackTickMax;
    }

    if (lateGame && scoreDelta <= 1) {
      minTicks += this.activeTuning.lateCloseBoostTicks;
      maxTicks += this.activeTuning.lateCloseBoostTicks;
    }

    const span = maxTicks - minTicks + 1;
    const randomOffset = Math.floor(this.rng.random() * span);
    return minTicks + randomOffset;
  }

  private getBallCarrier(playerId: string, teamPlayers: Player[]): Player {
    // teamPlayers contains only on-field starters, so any match is valid.
    return teamPlayers.find((player) => player.id === playerId)
      ?? teamPlayers[0];
  }

  private applyCarrierMovement(
    state: MatchState,
    carrier: Player,
    currentTeam: TeamSide,
    minute: number,
  ): void {
    const attackingBias = currentTeam === TeamSide.HOME ? 1 : -1;
    const urgency = minute >= 75 ? this.activeTuning.lateUrgencyMultiplier : 1;
    let roleBias = 1.0;
    switch (carrier.position) {
      case PositionEnum.ST:
        roleBias = 1.25;
        break;
      case PositionEnum.WNG:
        roleBias = 1.2;
        break;
      case PositionEnum.CAM:
        roleBias = 1.1;
        break;
      case PositionEnum.CM:
        roleBias = 1.0;
        break;
      case PositionEnum.CDM:
        roleBias = 0.9;
        break;
      case PositionEnum.FB:
        roleBias = 0.95;
        break;
      case PositionEnum.CB:
        roleBias = 0.75;
        break;
      case PositionEnum.GK:
        roleBias = 0.5;
        break;
    }

    const yStep =
      (this.activeTuning.movementStepBase +
        this.rng.random() * this.activeTuning.movementStepRandom) *
      urgency *
      roleBias;
    const xStep = (this.rng.random() - 0.5) * 5;

    state.ballPossession.location = {
      x: this.clamp(state.ballPossession.location.x + xStep, 0, 100),
      y: this.clamp(
        state.ballPossession.location.y + yStep * attackingBias,
        0,
        100,
      ),
    };
  }

  private determineCarrierAction(
    state: MatchState,
    carrier: Player,
    tactics: { home: TacticalSetup; away: TacticalSetup },
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    currentTeam: TeamSide,
    minute: number,
  ): MatchAction {
    const location = state.ballPossession.location;
    const relativeY = currentTeam === TeamSide.HOME ? location.y : 100 - location.y;
    const zone = this.fieldService.getZoneFromY(relativeY);
    const shootingWindow = this.isInShootingWindow(currentTeam, location.y);
    const teamTactics = tactics[currentTeam];
    const teamFatigue = fatigue[currentTeam].find(
      (entry) => entry.playerId === carrier.id,
    );
    const chainQuality = this.calculatePossessionChainQuality(
      state,
      currentTeam,
    );
    const scorelineState = this.getLateGameScorelineState(
      state,
      currentTeam,
      minute,
    );

    let passWeight = this.activeTuning.passWeightBase;
    let carryWeight = this.activeTuning.carryWeightBase;
    let shotWeight = this.activeTuning.shotWeightBase;
    let foulWeight = this.activeTuning.foulWeightBase;

    if (zone === FieldZone.DEFENSE) {
      passWeight += 0.14;
      carryWeight += 0.08;
      shotWeight -= 0.12;
    } else if (zone === FieldZone.MIDFIELD) {
      passWeight += 0.04;
      carryWeight += 0.06;
      shotWeight -= 0.03;
    } else {
      carryWeight -= 0.04;
      shotWeight += 0.15;
      passWeight -= 0.05;
    }

    if (teamTactics.playingStyle === PlayingStyle.COUNTER_ATTACK) {
      shotWeight += 0.06;
      passWeight -= 0.01;
    }

    switch (carrier.position) {
      case PositionEnum.GK:
        passWeight += 0.08;
        carryWeight += 0.04;
        shotWeight = 0;
        break;
      case PositionEnum.CB:
        passWeight += 0.08;
        carryWeight += 0.02;
        shotWeight -= 0.08;
        break;
      case PositionEnum.FB:
        passWeight += 0.04;
        carryWeight += 0.06;
        shotWeight -= 0.08;
        break;
      case PositionEnum.CDM:
        passWeight += 0.05;
        carryWeight += 0.01;
        shotWeight -= 0.03;
        break;
      case PositionEnum.CM:
        passWeight += 0.03;
        carryWeight += 0.01;
        shotWeight += 0.00;
        break;
      case PositionEnum.CAM:
        passWeight += 0.02;
        carryWeight += 0.01;
        shotWeight += 0.03;
        break;
      case PositionEnum.WNG:
        passWeight -= 0.03;
        carryWeight += 0.06;
        shotWeight += 0.05;
        break;
      case PositionEnum.ST:
        passWeight -= 0.05;
        carryWeight -= 0.01;
        shotWeight += 0.12;
        break;
    }

    if (carrier.position !== PositionEnum.GK) {
      // Recover shot volume lost by removing goalies from pass actions and scoring.
      shotWeight += 0.018;
      passWeight -= 0.006;
    }

    if (teamFatigue && teamFatigue.fatigueLevel > 70) {
      passWeight += 0.06;
      carryWeight -= 0.02;
      shotWeight -= 0.05;
      foulWeight += 0.03;
    }

    if (minute >= 80 && Math.abs(state.homeScore - state.awayScore) <= 1) {
      shotWeight += 0.04;
      passWeight -= 0.01;
    }

    if (scorelineState === LATE_GAME_SCORELINE.TRAILING) {
      shotWeight += 0.04;
      carryWeight += 0.03;
      passWeight -= 0.01;
      foulWeight += 0.01;
    } else if (scorelineState === LATE_GAME_SCORELINE.LEADING) {
      passWeight += 0.05;
      carryWeight -= 0.01;
      shotWeight -= 0.05;
    }

    shotWeight += chainQuality * 0.03;
    passWeight -= chainQuality * 0.01;

    const pressure = this.calculateDefensivePressure(state, currentTeam, tactics);
    shotWeight *= (1 - pressure * 0.60);

    if (!shootingWindow) {
      shotWeight *= this.activeTuning.outOfWindowShotMultiplier;
      passWeight += 0.05;
      carryWeight += 0.03;
    }

    const inPenaltyArea = relativeY >= 90 && Math.abs(location.x - 50) <= 20;
    if (inPenaltyArea) {
      foulWeight *= this.activeTuning.penaltyFoulRateMultiplier;
    }

    // Option A: Increase shot urgency for forwards inside the opponent's box
    const inOpponentBox = relativeY >= 86 && Math.abs(location.x - 50) <= 22;
    if (inOpponentBox && (carrier.position === PositionEnum.ST || carrier.position === PositionEnum.WNG || carrier.position === PositionEnum.CAM)) {
      shotWeight += 0.08;
      passWeight -= 0.04;
      carryWeight -= 0.02;
    }

    // Option B: Reduce CB/GK carry probability in their defensive zone
    if (zone === FieldZone.DEFENSE && (carrier.position === PositionEnum.CB || carrier.position === PositionEnum.GK)) {
      carryWeight = 0.08;
    }

    passWeight = Math.max(0.2, passWeight);
    carryWeight = Math.max(0.04, carryWeight);
    shotWeight =
      carrier.position === PositionEnum.GK
        ? 0
        : Math.max(0.005, shotWeight);
    foulWeight = Math.max(0.01, foulWeight);

    const totalWeight = passWeight + carryWeight + shotWeight + foulWeight;
    const roll = this.rng.random() * totalWeight;

    const actionWeights = {
      pass: passWeight,
      carry: carryWeight,
      shot: shotWeight,
      foul: foulWeight
    };

    if (roll < carryWeight) {
      return { type: EventType.CARRY, player: carrier, actionWeights };
    }

    if (roll < carryWeight + passWeight) {
      return {
        type: EventType.PASS,
        player: carrier,
        passIntent: this.selectPassIntent(
          state,
          carrier,
          currentTeam,
          tactics,
          minute,
          teamFatigue,
        ),
        actionWeights,
      };
    }

    if (roll < carryWeight + passWeight + shotWeight) {
      return { type: EventType.SHOT, player: carrier, actionWeights };
    }

    if (roll < carryWeight + passWeight + shotWeight + foulWeight) {
      return { type: EventType.FOUL, player: carrier, actionWeights };
    }

    return { type: EventType.CARRY, player: carrier, actionWeights };
  }

  private executeVariantBAction(
    state: MatchState,
    action: MatchAction,
    tactics: { home: TacticalSetup; away: TacticalSetup },
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    homeTeam: Team,
    awayTeam: Team,
    minute: number,
    config: SimulationConfig,
    rosters: ResolvedRosters,
  ): boolean {
    if (action.type === EventType.CARRY) {
      return this.handleCarry(
        state,
        action,
        tactics,
        fatigue,
        homeTeam,
        awayTeam,
        minute,
        config,
        rosters,
      );
    }

    if (action.type === EventType.PASS) {
      this.handlePass(
        state,
        action,
        homeTeam,
        awayTeam,
        tactics,
        fatigue,
        minute,
        config,
        rosters.homePlayers,
        rosters.awayPlayers,
      );
      return true;
    }

    if (action.type === EventType.SHOT) {
      this.executeVariantBShot(
        state,
        action,
        tactics,
        fatigue,
        homeTeam,
        awayTeam,
        minute,
        config,
        rosters,
      );
      return true;
    }

    if (action.type === EventType.FOUL) {
      this.handleFoul(
        state,
        action,
        tactics,
        homeTeam,
        awayTeam,
        minute,
        config,
        rosters.homePlayers,
        rosters.awayPlayers,
      );
      return true;
    }

    return false;
  }

  private handleCarry(
    state: MatchState,
    action: MatchAction,
    tactics: { home: TacticalSetup; away: TacticalSetup },
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    homeTeam: Team,
    awayTeam: Team,
    minute: number,
    config: SimulationConfig,
    rosters: ResolvedRosters,
  ): boolean {
    const currentTeam =
      state.ballPossession.teamId === homeTeam.id
        ? TeamSide.HOME
        : TeamSide.AWAY;
    const teamFatigue = fatigue[currentTeam].find(
      (entry) => entry.playerId === action.player.id,
    );
    const pressure = this.calculateDefensivePressure(
      state,
      currentTeam,
      tactics,
    );
    const successChance = this.calculateCarrySuccessChance(
      state,
      action.player,
      currentTeam,
      teamFatigue,
      pressure,
    );

    if (this.rng.random() >= successChance) {
      const attackingY =
        currentTeam === TeamSide.HOME
          ? state.ballPossession.location.y
          : 100 - state.ballPossession.location.y;
      const passiveChance = attackingY <= 35 ? 0.85 : PASSIVE_TACKLE_CHANCE;
      const isPassiveTackle = this.rng.random() < passiveChance;
      let turnoverWinnerId: string;
      let winnerTeamSide: TeamSide;

      const attackingPlayers = currentTeam === TeamSide.HOME ? rosters.homePlayers : rosters.awayPlayers;
      const defendingPlayers = currentTeam === TeamSide.HOME ? rosters.awayPlayers : rosters.homePlayers;

      if (isPassiveTackle) {
        const scramble = this.resolveLooseBallScramble(
          state.ballPossession.location,
          currentTeam,
          defendingPlayers,
          attackingPlayers,
          10.0, // defenderBias of 10.0 for carry scrambles
        );
        turnoverWinnerId = scramble.winner.id;
        winnerTeamSide = scramble.winnerTeam;

        const isRecovery = scramble.winnerTeam === currentTeam;
        this.createEvent(
          state,
          EventType.CARRY,
          [action.player.id, scramble.winner.id],
          { ...state.ballPossession.location },
          minute,
          false,
          config,
          {
            carryResult: isRecovery ? "SCRAMBLE_RECOVERED" : "SCRAMBLE_LOST",
            recoveredByTeam: scramble.winnerTeam === TeamSide.HOME ? 'Home' : 'Away',
            scrambleWinnerId: scramble.winner.id,
            scrambleWinnerName: scramble.winner.name,
            scrambleDecisions: scramble.decisions,
          },
        );
      } else {
        turnoverWinnerId = this.createTurnoverEvent(
          state,
          EventType.TACKLE,
          { ...state.ballPossession.location },
          currentTeam,
          defendingPlayers,
          action.player.id,
          minute,
          true,
          config,
          { carryResult: "DISPOSSESSED" },
        );
        winnerTeamSide = currentTeam === TeamSide.HOME ? TeamSide.AWAY : TeamSide.HOME;
      }

      state.ballPossession.teamId =
        winnerTeamSide === TeamSide.HOME ? homeTeam.id : awayTeam.id;
      state.ballPossession.playerWithBall = turnoverWinnerId;
      state.ballPossession.passes = 0;

      const newPossessionTeam = winnerTeamSide;
      state.ballPossession.phase = this.getPhaseFromLocation(
        state.ballPossession.location,
        newPossessionTeam,
        state,
      );

      if (!isPassiveTackle) {
        const winnerTeamPlayers =
          currentTeam === TeamSide.HOME
            ? rosters.awayPlayers
            : rosters.homePlayers;
        const winnerKey: TeamSide =
          currentTeam === TeamSide.HOME ? TeamSide.AWAY : TeamSide.HOME;
        const loserPlayers =
          currentTeam === TeamSide.HOME
            ? rosters.homePlayers
            : rosters.awayPlayers;
        this.tryRollInjury(
          action.player,
          currentTeam,
          InjuryRollKind.CONTACT,
          INJURY_TACKLE_MODIFIER,
          state,
          minute,
          config,
          loserPlayers,
          tactics,
        );
        const winnerPlayer = winnerTeamPlayers.find(
          (player) => player.id === turnoverWinnerId,
        );
        if (winnerPlayer) {
          this.tryRollInjury(
            winnerPlayer,
            winnerKey,
            InjuryRollKind.CONTACT,
            INJURY_TACKLE_MODIFIER,
            state,
            minute,
            config,
            winnerTeamPlayers,
            tactics,
          );
        }
      }
      return true;
    }

    this.applyQuietProgression(
      state,
      action.player,
      homeTeam,
      awayTeam,
      rosters,
      pressure,
    );
    // Non-contact carry injuries on the successful carrier.
    const carrierTeamPlayers =
      currentTeam === TeamSide.HOME ? rosters.homePlayers : rosters.awayPlayers;
    this.tryRollInjury(
      action.player,
      currentTeam,
      InjuryRollKind.NON_CONTACT,
      1,
      state,
      minute,
      config,
      carrierTeamPlayers,
      tactics,
    );
    return false;
  }

  private calculateCarrySuccessChance(
    state: MatchState,
    carrier: Player,
    currentTeam: TeamSide,
    carrierFatigue: PlayerFatigue | undefined,
    pressure: number,
  ): number {
    let successChance = 0.72;

    switch (carrier.position) {
      case PositionEnum.GK:
        successChance -= 0.15;
        break;
      case PositionEnum.CB:
        successChance -= 0.07;
        break;
      case PositionEnum.FB:
        successChance += 0.02;
        break;
      case PositionEnum.CDM:
        successChance += 0.01;
        break;
      case PositionEnum.CM:
        successChance += 0.025;
        break;
      case PositionEnum.CAM:
        successChance += 0.055;
        break;
      case PositionEnum.WNG:
        successChance += 0.065;
        break;
      case PositionEnum.ST:
        successChance += 0.03;
        break;
    }

    successChance += (this.getPlayerStat(carrier, 'speed') - 70) * 0.002;
    successChance += (this.getPlayerStat(carrier, 'flair') - 70) * 0.0015;

    const attackingY =
      currentTeam === TeamSide.HOME
        ? state.ballPossession.location.y
        : 100 - state.ballPossession.location.y;

    if (attackingY < 55) {
      successChance += 0.04;
    } else if (attackingY > 55) {
      successChance -= (attackingY - 55) * 0.0025;
    }

    successChance -= pressure * 0.40;
    successChance += this.calculateCarryShapeModifier(state, currentTeam);

    if (carrierFatigue && carrierFatigue.fatigueLevel > 70) {
      const fatiguePenaltyScale = (carrierFatigue.fatigueLevel - 70) / 30;
      successChance -= this.clamp(fatiguePenaltyScale, 0, 1) * 0.12;
    }

    return this.clamp(successChance, 0.3, 0.86);
  }

  private normalizeFatigueForTickCount(
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    ticks: number,
    rosters: ResolvedRosters,
  ): void {
    if (ticks <= 1) {
      return;
    }

    const excessTicks = ticks - 1;

    const homeById = new Map(
      rosters.homePlayers.map((player) => [player.id, player]),
    );
    const awayById = new Map(
      rosters.awayPlayers.map((player) => [player.id, player]),
    );

    const normalize = (
      entries: PlayerFatigue[],
      playersById: Map<string, Player>,
    ) => {
      for (const entry of entries) {
        const player = playersById.get(entry.playerId);
        if (!player || player.role !== Role.STARTER) {
          continue;
        }

        const attrs = getCurrentPlayerSeasonAttributes(player, this.currentSeasonYear);
        const endurance = attrs.endurance.value;
        const fatiguePerTick = 0.5 * (1 - (endurance - 50) * 0.005); // Match the accrual rate exactly

        entry.fatigueLevel = Math.max(
          0,
          entry.fatigueLevel - fatiguePerTick * excessTicks,
        );
        entry.performanceModifier = calculateFatigueModifier(entry.fatigueLevel);
      }
    };

    normalize(fatigue.home, homeById);
    normalize(fatigue.away, awayById);
  }

  private handlePass(
    state: MatchState,
    action: MatchAction,
    homeTeam: Team,
    awayTeam: Team,
    tactics: { home: TacticalSetup; away: TacticalSetup },
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    minute: number,
    config: SimulationConfig,
    homePlayers: Player[],
    awayPlayers: Player[],
  ): void {
    const passer = action.player;
    const currentTeam =
      state.ballPossession.teamId === tactics.home.teamId
        ? TeamSide.HOME
        : TeamSide.AWAY;
    const teamPlayers =
      currentTeam === TeamSide.HOME ? homePlayers : awayPlayers;
    const opponentPlayers =
      currentTeam === TeamSide.HOME ? awayPlayers : homePlayers;
    const teamTactics = tactics[currentTeam];
    const teamFatigue = fatigue[currentTeam];
    const passIntent =
      action.passIntent ??
      this.selectPassIntent(
        state,
        passer,
        currentTeam,
        tactics,
        minute,
        teamFatigue.find((entry) => entry.playerId === passer.id),
      );
    const pressure = this.calculateDefensivePressure(
      state,
      currentTeam,
      tactics,
    );

    const targetPlayer = this.findPassTarget(
      passer,
      teamPlayers,
      teamTactics,
      state.ballPossession.location,
      currentTeam,
      passIntent,
    );

    if (!targetPlayer) {
      const turnoverWinnerId = this.createTurnoverEvent(
        state,
        EventType.TACKLE,
        state.ballPossession.location,
        currentTeam,
        opponentPlayers,
        passer.id,
        minute,
        false,
        config,
      );
      state.ballPossession.teamId =
        currentTeam === TeamSide.HOME ? awayTeam.id : homeTeam.id;
      state.ballPossession.playerWithBall = turnoverWinnerId;
      state.ballPossession.passes = 0;
      const newPossessionTeam =
        state.ballPossession.teamId === homeTeam.id
          ? TeamSide.HOME
          : TeamSide.AWAY;
      state.ballPossession.phase = this.getPhaseFromLocation(
        state.ballPossession.location,
        newPossessionTeam,
      );

      // Tackle injuries on both passer (loser) and turnover winner.
      const winnerKey: TeamSide =
        currentTeam === TeamSide.HOME ? TeamSide.AWAY : TeamSide.HOME;
      this.tryRollInjury(
        passer,
        currentTeam,
        InjuryRollKind.CONTACT,
        INJURY_TACKLE_MODIFIER,
        state,
        minute,
        config,
        teamPlayers,
        tactics,
      );
      const winner = opponentPlayers.find(
        (player) => player.id === turnoverWinnerId,
      );
      if (winner) {
        this.tryRollInjury(
          winner,
          winnerKey,
          InjuryRollKind.CONTACT,
          INJURY_TACKLE_MODIFIER,
          state,
          minute,
          config,
          opponentPlayers,
          tactics,
        );
      }
      return;
    }

    const targetPosition = this.getCurrentPositionForPlayer(
      targetPlayer,
      currentTeam,
      teamTactics.formation,
    );
    const passDistance = this.fieldService.getDistance(
      state.ballPossession.location,
      targetPosition,
    );
    const progression =
      currentTeam === TeamSide.HOME
        ? targetPosition.y - state.ballPossession.location.y
        : state.ballPossession.location.y - targetPosition.y;

    const isOffside = this.isPlayerOffside(targetPlayer.id, currentTeam, state.ballPossession.location);
    const basePassSuccess = this.calculatePassSuccess(
      passer,
      targetPlayer,
      teamTactics,
      teamFatigue,
      state.ballPossession.location,
      currentTeam,
      passIntent,
      pressure,
    );

    const offsideCalled = isOffside && basePassSuccess;
    const passSuccess = basePassSuccess && !offsideCalled;

    if (passSuccess) {
      state.ballPossession.playerWithBall = targetPlayer.id;
      state.ballPossession.passes++;
      state.ballPossession.location = this.calculateNewBallPosition(
        state.ballPossession.location,
        targetPosition,
      );
      state.ballPossession.phase = this.getPhaseFromLocation(
        state.ballPossession.location,
        currentTeam,
        state,
      );
      this.createEvent(
        state,
        EventType.PASS,
        [passer.id, targetPlayer.id],
        state.ballPossession.location,
        minute,
        true,
        config,
        { passIntent },
      );
      // Non-contact injury roll on the passer.
      this.tryRollInjury(
        passer,
        currentTeam,
        InjuryRollKind.NON_CONTACT,
        1,
        state,
        minute,
        config,
        teamPlayers,
        tactics,
      );
      return;
    }

    const failureMode = offsideCalled
      ? PASS_FAILURE_MODE.LANE_CUT_OUT
      : this.determinePassFailureMode(
          state.ballPossession.location,
          currentTeam,
          passIntent,
          pressure,
          passDistance,
          progression,
        );

    let failureLocation = state.ballPossession.location;
    let predeterminedWinnerId: string | undefined;

    if (offsideCalled || failureMode === PASS_FAILURE_MODE.OVERHIT) {
      failureLocation = targetPosition;
    } else if (failureMode === PASS_FAILURE_MODE.LANE_CUT_OUT) {
      const interception = this.getPassInterceptionLocation(
        state.ballPossession.location,
        targetPosition,
        currentTeam,
        opponentPlayers,
      );
      failureLocation = interception.location;
      predeterminedWinnerId = interception.interceptorId;
    }

    const attackingY =
      currentTeam === TeamSide.HOME
        ? state.ballPossession.location.y
        : 100 - state.ballPossession.location.y;

    let passiveChance = PASSIVE_INTERCEPTION_CHANCE;
    if (attackingY <= 35) {
      passiveChance = 0.93;
    } else if (failureMode === PASS_FAILURE_MODE.TACKLED) {
      passiveChance = PASSIVE_TACKLE_CHANCE;
    }

    const isPassiveInterception =
      !offsideCalled && this.rng.random() < passiveChance;

    let turnoverWinnerId: string;
    let winnerTeamSide: TeamSide;

    if (isPassiveInterception) {
      const scramble = this.resolveLooseBallScramble(
        failureLocation,
        currentTeam,
        opponentPlayers,
        teamPlayers,
        25.0, // defenderBias of 25.0 for pass failures
      );
      turnoverWinnerId = scramble.winner.id;
      winnerTeamSide = scramble.winnerTeam;

      this.createEvent(
        state,
        EventType.PASS,
        [passer.id, scramble.winner.id],
        { ...failureLocation },
        minute,
        false,
        config,
        {
          passFailure: failureMode,
          passIntent,
          recoveredByTeam: scramble.winnerTeam === TeamSide.HOME ? 'Home' : 'Away',
          scrambleWinnerId: scramble.winner.id,
          scrambleWinnerName: scramble.winner.name,
          scrambleDecisions: scramble.decisions,
        },
      );
    } else {
      turnoverWinnerId = this.createPassFailureEvent(
        state,
        failureMode,
        failureLocation,
        currentTeam,
        opponentPlayers,
        passer.id,
        passIntent,
        minute,
        config,
        offsideCalled,
        targetPlayer.id,
        predeterminedWinnerId,
      );
      winnerTeamSide = currentTeam === TeamSide.HOME ? TeamSide.AWAY : TeamSide.HOME;
    }

    state.ballPossession.teamId =
      winnerTeamSide === TeamSide.HOME ? homeTeam.id : awayTeam.id;
    state.ballPossession.playerWithBall = turnoverWinnerId;
    state.ballPossession.passes = 0;

    if (offsideCalled) {
      state.ballPossession.location = { ...targetPosition };
      state.ballPossession.phase = this.getPhaseFromLocation(
        targetPosition,
        currentTeam === TeamSide.HOME ? TeamSide.AWAY : TeamSide.HOME,
        state,
      );
      return;
    }

    // TACKLED is contact (both passer and winner); intercept paths are non-contact (winner only).
    const winnerKey: TeamSide = winnerTeamSide;
    const winner = (winnerKey === currentTeam ? teamPlayers : opponentPlayers).find(
      (player) => player.id === turnoverWinnerId,
    );
    if (!isPassiveInterception) {
      if (failureMode === PASS_FAILURE_MODE.TACKLED) {
        this.tryRollInjury(
          passer,
          currentTeam,
          InjuryRollKind.CONTACT,
          INJURY_TACKLE_MODIFIER,
          state,
          minute,
          config,
          teamPlayers,
          tactics,
        );
        if (winner) {
          this.tryRollInjury(
            winner,
            winnerKey,
            InjuryRollKind.CONTACT,
            INJURY_TACKLE_MODIFIER,
            state,
            minute,
            config,
            opponentPlayers,
            tactics,
          );
        }
      } else if (winner) {
        this.tryRollInjury(
          winner,
          winnerKey,
          InjuryRollKind.NON_CONTACT,
          1,
          state,
          minute,
          config,
          opponentPlayers,
          tactics,
        );
      }
    } else if (winner && winnerKey !== currentTeam) {
      this.tryRollInjury(
        winner,
        winnerKey,
        InjuryRollKind.NON_CONTACT,
        1,
        state,
        minute,
        config,
        opponentPlayers,
        tactics,
      );
    }
  }

  private determinePassFailureMode(
    currentLocation: Coordinates,
    currentTeam: TeamSide,
    passIntent: PassIntent,
    pressure: number,
    passDistance: number,
    progression: number,
  ): PassFailureMode {
    const context = this.getDefendingShapeContextForLocation(
      currentLocation,
      currentTeam,
    );
    const uncoveredChannel = context?.channelSlots.length === 0;
    const denseCentralCoverage =
      !context?.wideChannel &&
      (context?.centralSlots.length ?? 0) >= 2 &&
      (context?.zoneCoverage ?? 0) >= 0.75;

    const attackingY =
      currentTeam === TeamSide.HOME
        ? currentLocation.y
        : 100 - currentLocation.y;

    if (pressure >= 0.6 && passDistance <= 24 && !uncoveredChannel) {
      if (attackingY <= 35) {
        return PASS_FAILURE_MODE.LANE_CUT_OUT;
      }
      return PASS_FAILURE_MODE.TACKLED;
    }

    if (
      (passIntent === PASS_INTENT.THROUGH_BALL ||
        passIntent === PASS_INTENT.CROSS) &&
      passDistance >= 30
    ) {
      if (passIntent === PASS_INTENT.THROUGH_BALL && denseCentralCoverage) {
        return PASS_FAILURE_MODE.LANE_CUT_OUT;
      }

      if (uncoveredChannel) {
        return PASS_FAILURE_MODE.OVERHIT;
      }

      return PASS_FAILURE_MODE.OVERHIT;
    }

    if (
      passIntent === PASS_INTENT.THROUGH_BALL &&
      denseCentralCoverage &&
      progression >= 8
    ) {
      return PASS_FAILURE_MODE.LANE_CUT_OUT;
    }

    if (
      uncoveredChannel &&
      passDistance >= 26 &&
      passIntent !== PASS_INTENT.RECYCLE
    ) {
      return PASS_FAILURE_MODE.OVERHIT;
    }

    if (progression >= 10 || passDistance >= 24) {
      return PASS_FAILURE_MODE.LANE_CUT_OUT;
    }

    if (pressure >= 0.45 && attackingY > 35) {
      return PASS_FAILURE_MODE.TACKLED;
    }
    return PASS_FAILURE_MODE.LANE_CUT_OUT;
  }

  private createPassFailureEvent(
    state: MatchState,
    mode: PassFailureMode,
    currentLocation: Coordinates,
    currentTeam: TeamSide,
    opponentPlayers: Player[],
    passerId: string,
    passIntent: PassIntent,
    minute: number,
    config: SimulationConfig,
    isOffside?: boolean,
    targetPlayerId?: string,
    predeterminedWinnerId?: string,
  ): string {
    const additionalData = {
      passFailure: mode,
      passIntent,
      isOffside,
      offsidePlayerId: isOffside ? targetPlayerId : undefined,
      targetPlayerId,
    };

    if (mode === PASS_FAILURE_MODE.TACKLED) {
      return this.createTurnoverEvent(
        state,
        EventType.TACKLE,
        currentLocation,
        currentTeam,
        opponentPlayers,
        passerId,
        minute,
        true,
        config,
        additionalData,
        predeterminedWinnerId,
      );
    }

    return this.createTurnoverEvent(
      state,
      EventType.INTERCEPTION,
      currentLocation,
      currentTeam,
      opponentPlayers,
      passerId,
      minute,
      false,
      config,
      additionalData,
      predeterminedWinnerId,
    );
  }

  private handleGoal(
    state: MatchState,
    action: MatchAction,
    homeTeam: Team,
    awayTeam: Team,
    minute: number,
    config: SimulationConfig,
    homePlayers: Player[],
    awayPlayers: Player[],
    tactics: { home: TacticalSetup; away: TacticalSetup },
    additionalData?: PlayByPlayEventAdditionalData,
  ): void {
    const currentTeam =
      state.ballPossession.teamId === homeTeam.id
        ? TeamSide.HOME
        : TeamSide.AWAY;

    if (currentTeam === TeamSide.HOME) {
      state.homeScore++;
    } else {
      state.awayScore++;
    }

    this.createEvent(
      state,
      EventType.GOAL,
      [action.player.id],
      state.ballPossession.location,
      minute,
      true,
      config,
      additionalData,
    );
    state.ballPossession.teamId =
      currentTeam === TeamSide.HOME ? awayTeam.id : homeTeam.id;
    state.ballPossession.playerWithBall = this.getRandomPlayerId(
      (state.ballPossession.teamId === homeTeam.id ? homePlayers : awayPlayers)
        .filter((p) => p.position !== PositionEnum.GK),
    );
    state.ballPossession.location = { x: 50, y: 50 };
    state.ballPossession.passes = 0;

    // Non-contact injury roll on the scorer (resolved against their own team's roster).
    const scorerTeamPlayers =
      currentTeam === TeamSide.HOME ? homePlayers : awayPlayers;
    this.tryRollInjury(
      action.player,
      currentTeam,
      InjuryRollKind.NON_CONTACT,
      1,
      state,
      minute,
      config,
      scorerTeamPlayers,
      tactics,
    );
  }

  private handleFoul(
    state: MatchState,
    action: MatchAction,
    tactics: { home: TacticalSetup; away: TacticalSetup },
    homeTeam: Team,
    awayTeam: Team,
    minute: number,
    config: SimulationConfig,
    homePlayers: Player[],
    awayPlayers: Player[],
  ): void {
    const attackingTeam =
      state.ballPossession.teamId === homeTeam.id
        ? TeamSide.HOME
        : TeamSide.AWAY;
    const defendingTeam =
      attackingTeam === TeamSide.HOME ? TeamSide.AWAY : TeamSide.HOME;
    const defendingPlayers =
      defendingTeam === TeamSide.HOME ? homePlayers : awayPlayers;
    const victim = action.player;
    const offender = this.selectFoulOffender(defendingPlayers);

    if (defendingTeam === TeamSide.HOME) {
      state.homeFouls++;
    } else {
      state.awayFouls++;
    }

    this.createEvent(
      state,
      EventType.FOUL,
      [offender.id, victim.id],
      { ...state.ballPossession.location },
      minute,
      false,
      config,
    );

    let offenderSentOff = false;
    const alreadyHasYellow = this.countPlayerEvents(state, offender.id, EventType.YELLOW_CARD) >= 1;
    const cardThreshold = alreadyHasYellow
      ? this.activeTuning.cardChanceBase * this.activeTuning.secondYellowChanceMultiplier
      : this.activeTuning.cardChanceBase;

    if (this.rng.random() < cardThreshold) {
      const directRed = this.rng.random() < this.activeTuning.directRedChance;

      if (directRed) {
        const relativeY = attackingTeam === TeamSide.HOME
          ? state.ballPossession.location.y
          : 100 - state.ballPossession.location.y;

        const redRoll = this.rng.random();
        let cardReason: CardReason = 'DOGSO';
        if (redRoll < 0.001) {
          cardReason = 'SPITTING';
        } else if (relativeY >= 80) {
          cardReason = this.rng.random() < 0.85 ? 'DOGSO' : 'SERIOUS_FOUL';
        } else if (relativeY >= 67) {
          cardReason = this.rng.random() < 0.50 ? 'DOGSO' : 'SERIOUS_FOUL';
        } else {
          cardReason = this.rng.random() < 0.10 ? 'DOGSO' : 'SERIOUS_FOUL';
        }

        this.createEvent(
          state,
          EventType.RED_CARD,
          [offender.id, victim.id],
          { ...state.ballPossession.location },
          minute,
          false,
          config,
          { cardReason },
        );
        this.incrementCardCount(state, defendingTeam, EventType.RED_CARD);
        offenderSentOff = true;
      } else {
        this.createEvent(
          state,
          EventType.YELLOW_CARD,
          [offender.id, victim.id],
          { ...state.ballPossession.location },
          minute,
          false,
          config,
        );
        this.incrementCardCount(state, defendingTeam, EventType.YELLOW_CARD);

        if (
          this.countPlayerEvents(state, offender.id, EventType.YELLOW_CARD) >= 2
        ) {
          this.createEvent(
            state,
            EventType.RED_CARD,
            [offender.id, victim.id],
            { ...state.ballPossession.location },
            minute,
            false,
            config,
            { cardReason: "SECOND_YELLOW" },
          );
          this.incrementCardCount(state, defendingTeam, EventType.RED_CARD);
          offenderSentOff = true;
        }
      }
    }

    if (offenderSentOff) {
      this.dismissPlayer(defendingTeam, offender.id, defendingPlayers, tactics);
    }

    // Foul injuries: roll on both offender and victim with a 1.5x contact modifier.
    // tryRollInjury is a no-op if the offender was just sent off (role !== STARTER).
    const attackingPlayers =
      attackingTeam === TeamSide.HOME ? homePlayers : awayPlayers;
    this.tryRollInjury(
      offender,
      defendingTeam,
      InjuryRollKind.CONTACT,
      INJURY_FOUL_OFFENDER_MODIFIER,
      state,
      minute,
      config,
      defendingPlayers,
      tactics,
    );
    this.tryRollInjury(
      victim,
      attackingTeam,
      InjuryRollKind.CONTACT,
      INJURY_FOUL_VICTIM_MODIFIER,
      state,
      minute,
      config,
      attackingPlayers,
      tactics,
    );

    // Determine restart kind
    const relativeY = attackingTeam === TeamSide.HOME ? state.ballPossession.location.y : 100 - state.ballPossession.location.y;
    const inPenaltyArea = relativeY >= 90 && Math.abs(state.ballPossession.location.x - 50) <= 20;

    if (inPenaltyArea) {
      this.executeVariantBPenalty(state, attackingTeam, defendingTeam, homeTeam, awayTeam, minute, config, { homePlayers, awayPlayers, homeBench: [], awayBench: [] }, tactics);
      return;
    }

    if (relativeY >= 75) {
      this.executeVariantBFreeKick(state, attackingTeam, defendingTeam, homeTeam, awayTeam, minute, config, { homePlayers, awayPlayers, homeBench: [], awayBench: [] }, tactics);
      return;
    }

    // Default quick restart:
    state.ballPossession.teamId =
      attackingTeam === TeamSide.HOME ? homeTeam.id : awayTeam.id;
    state.ballPossession.playerWithBall = victim.id;
    state.ballPossession.location = this.getFoulRestartLocation(
      attackingTeam,
      state.ballPossession.location,
    );
    state.ballPossession.passes = 0;
  }

  private getFoulRestartLocation(
    attackingTeam: TeamSide,
    currentLocation: Coordinates,
  ): Coordinates {
    const attackingY =
      attackingTeam === TeamSide.HOME
        ? currentLocation.y
        : 100 - currentLocation.y;
    let restartAttackingY = attackingY;
    let restartX = currentLocation.x;

    // Keep advanced fouls dangerous, while deeper fouls reset play further from goal.
    if (attackingY >= 78) {
      restartAttackingY = this.clamp(attackingY + 1, 0, 90);
      restartX = this.clamp(
        currentLocation.x + (50 - currentLocation.x) * 0.2,
        0,
        100,
      );
    } else if (attackingY >= 60) {
      restartAttackingY = this.clamp(attackingY - 2, 0, 100);
      restartX = this.clamp(
        currentLocation.x + (50 - currentLocation.x) * 0.2,
        0,
        100,
      );
    } else {
      restartAttackingY = this.clamp(attackingY - 8, 0, 100);
    }

    return attackingTeam === TeamSide.HOME
      ? { x: restartX, y: restartAttackingY }
      : { x: restartX, y: 100 - restartAttackingY };
  }

  private selectFoulOffender(teamPlayers: Player[]): Player {
    const starters = teamPlayers.filter(
      (player) => player.role === Role.STARTER,
    );
    const activePlayers = starters.length > 0 ? starters : teamPlayers;
    const outfieldPlayers = activePlayers.filter(
      (player) => player.position !== PositionEnum.GK,
    );
    const candidates = outfieldPlayers.length > 0 ? outfieldPlayers : activePlayers;

    let totalWeight = 0;
    const playerWeights = candidates.map(player => {
      let weight = 1.0;
      switch (player.position) {
        case PositionEnum.CB:
          weight = 3.0;
          break;
        case PositionEnum.FB:
          weight = 2.5;
          break;
        case PositionEnum.CDM:
          weight = 3.5;
          break;
        case PositionEnum.CM:
          weight = 2.0;
          break;
        case PositionEnum.CAM:
          weight = 1.0;
          break;
        case PositionEnum.WNG:
          weight = 0.8;
          break;
        case PositionEnum.ST:
          weight = 0.8;
          break;
        case PositionEnum.GK:
          weight = 0.1;
          break;
      }
      totalWeight += weight;
      return { player, weight };
    });

    const roll = this.rng.random() * totalWeight;
    let sum = 0;
    for (const entry of playerWeights) {
      sum += entry.weight;
      if (roll <= sum) {
        return entry.player;
      }
    }
    return candidates[0] ?? teamPlayers[0];
  }

  private incrementCardCount(
    state: MatchState,
    team: TeamSide,
    cardType: EventType.YELLOW_CARD | EventType.RED_CARD,
  ): void {
    if (cardType === EventType.YELLOW_CARD) {
      if (team === TeamSide.HOME) {
        state.homeYellowCards++;
      } else {
        state.awayYellowCards++;
      }
      return;
    }

    if (team === TeamSide.HOME) {
      state.homeRedCards++;
    } else {
      state.awayRedCards++;
    }
  }

  private countPlayerEvents(
    state: MatchState,
    playerId: string,
    eventType: EventType,
  ): number {
    return state.events.filter(
      (event) => event.type === eventType && event.playerIds[0] === playerId,
    ).length;
  }

  private dismissPlayer(
    teamKey: TeamSide,
    playerId: string,
    teamPlayers: Player[],
    tactics: { home: TacticalSetup; away: TacticalSetup },
  ): void {
    const dismissedPlayer = teamPlayers.find(
      (player) => player.id === playerId,
    );
    if (dismissedPlayer) {
      // Remove from the on-field array so no gameplay method can reach this player.
      if (this.activeRosters) {
        this.removeFromPitch(this.activeRosters, teamKey, playerId, Role.DISMISSED);
      } else {
        dismissedPlayer.role = Role.DISMISSED;
      }
      this.rebalanceShapeAfterDismissal(
        teamKey,
        teamPlayers,
        playerId,
        tactics,
      );
      this.pendingTacticalSubstitutions[teamKey] = 1;

      const forfeitingTeam = this.checkForfeitCondition();
      if (forfeitingTeam) {
        this.lastSimulationForfeit = forfeitingTeam;
      }
    }
  }

  // Returns true if the player sustained an injury this roll. Callers may use
  // this to short-circuit follow-up logic (e.g. avoid double-rolling on the
  // same player within a single tick).
  private tryRollInjury(
    player: Player,
    teamKey: TeamSide,
    kind: InjuryRollKind,
    modifier: number,
    state: MatchState,
    minute: number,
    config: SimulationConfig,
    teamPlayers: Player[],
    tactics: { home: TacticalSetup; away: TacticalSetup },
  ): boolean {
    if (config.disableInjuries) {
      return false;
    }
    if (this.injuredPlayerIds.has(player.id)) {
      return false;
    }
    if (player.role !== Role.STARTER) {
      return false;
    }

    const attrs = getCurrentPlayerSeasonAttributes(
      player,
      this.currentSeasonYear,
    );
    const rate = Math.max(attrs.injuryRate?.value ?? INJURY_REFERENCE_RATE, 1);
    const baseChance =
      kind === InjuryRollKind.CONTACT
        ? INJURY_CONTACT_BASE_CHANCE
        : INJURY_NON_CONTACT_BASE_CHANCE;
    const finalChance = baseChance * (rate / INJURY_REFERENCE_RATE) * modifier;

    if (this.rng.random() >= finalChance) {
      return false;
    }

    const definition: InjuryDefinition = pickInjuryDefinition(
      this.rng.random(),
    );
    const totalWeeks = rollInjuryDurationWeeks(definition, this.rng.random());

    this.injuredPlayerIds.add(player.id);
    this.createEvent(
      state,
      EventType.INJURY,
      [player.id],
      { ...state.ballPossession.location },
      minute,
      true,
      config,
      {
        injury: {
          definitionId: definition.id,
          totalWeeks,
          weeksRemaining: totalWeeks,
        },
      },
    );

    this.handleInjuryWithdrawal(
      teamKey,
      player.id,
      teamPlayers,
      tactics,
      state,
    );
    this.pendingInjuryReplacements[teamKey].push({
      playerId: player.id,
      position: player.position,
    });
    return true;
  }

  private handleInjuryWithdrawal(
    teamKey: TeamSide,
    playerId: string,
    teamPlayers: Player[],
    tactics: { home: TacticalSetup; away: TacticalSetup },
    state: MatchState,
  ): void {
    const injured = teamPlayers.find((player) => player.id === playerId);
    if (!injured) {
      return;
    }
    // Remove from the on-field array so no gameplay method can reach this player.
    if (this.activeRosters) {
      this.removeFromPitch(this.activeRosters, teamKey, playerId, Role.SUBSTITUTED_OUT);
    } else {
      injured.role = Role.SUBSTITUTED_OUT;
    }
    // For injury withdrawals, do NOT rebalance the entire shape here.
    // Instead, just clear the injured player's slot and let the replacement logic
    // rebalance once when the sub comes on. This avoids cascading position changes
    // that disrupt non-4-4-2 formations and create visual noise.
    if (this.activeMatchShape) {
      const currentShape = this.activeMatchShape[teamKey];
      this.activeMatchShape = {
        ...this.activeMatchShape,
        [teamKey]: currentShape.map((slot) => ({
          ...slot,
          playerId: slot.playerId === playerId ? null : slot.playerId,
        })),
      };
    }

    if (state.ballPossession.playerWithBall === playerId) {
      // After removal, teamPlayers (the on-field array) contains only remaining starters.
      const remainingStarter = teamPlayers[0];
      if (remainingStarter) {
        state.ballPossession.playerWithBall = remainingStarter.id;
      }
    }

    const forfeitingTeam = this.checkForfeitCondition();
    if (forfeitingTeam) {
      this.lastSimulationForfeit = forfeitingTeam;
    }
  }

  private tryPendingInjuryReplacement(
    teamKey: TeamSide,
    state: MatchState,
    tactics: { home: TacticalSetup; away: TacticalSetup },
    homeTeam: Team,
    awayTeam: Team,
    minute: number,
    config: SimulationConfig,
    rosters: ResolvedRosters,
    substitutionsUsed: TeamSubstitutionUsage,
  ): boolean {
    const pendingInjuries = [...this.pendingInjuryReplacements[teamKey]];
    if (pendingInjuries.length === 0) {
      return false;
    }
    this.pendingInjuryReplacements[teamKey] = [];

    const teamBench =
      teamKey === TeamSide.HOME ? rosters.homeBench : rosters.awayBench;
    const teamOnField =
      teamKey === TeamSide.HOME ? rosters.homePlayers : rosters.awayPlayers;
    let processedReplacement = false;

    for (const injury of pendingInjuries) {
      if (
        substitutionsUsed[teamKey] >= this.maxSubstitutionsPerTeam ||
        !this.activeMatchShape
      ) {
        break;
      }

      // Position was captured when the injury occurred (player already removed from onField).
      const incomingPosition = injury.position;
      const incoming = this.selectSubstitutionIncomingPlayer(
        teamBench,
        incomingPosition,
      );
      if (!incoming) {
        continue;
      }

      // Atomically move from bench to on-field.
      this.transferToPitch(rosters, teamKey, incoming.id);
      substitutionsUsed[teamKey] += 1;

      const currentShape = this.activeMatchShape[teamKey];
      // teamOnField now contains only active starters (including the new arrival).
      const rebalancedShape = this.rebalanceShapeForPlayers(
        currentShape,
        teamOnField,
      );
      this.activeMatchShape = {
        ...this.activeMatchShape,
        [teamKey]: rebalancedShape,
      };
      this.rebuildFormationFromShape(teamKey, tactics);

      const teamId = teamKey === TeamSide.HOME ? homeTeam.id : awayTeam.id;
      if (
        state.ballPossession.teamId === teamId &&
        state.ballPossession.playerWithBall === injury.playerId
      ) {
        state.ballPossession.playerWithBall = incoming.id;
      }

      this.createEvent(
        state,
        EventType.SUBSTITUTION,
        [injury.playerId, incoming.id],
        { ...state.ballPossession.location },
        minute,
        true,
        config,
        {
          formationSnapshot: this.createFormationSnapshot(),
        },
      );
      processedReplacement = true;
    }

    return processedReplacement;
  }

  private calculatePassSuccess(
    passer: Player,
    target: Player,
    tactics: TacticalSetup,
    fatigue: PlayerFatigue[],
    currentLocation: Coordinates,
    currentTeam: TeamSide,
    passIntent: PassIntent,
    pressure: number,
  ): boolean {
    const passerFatigue = fatigue.find((entry) => entry.playerId === passer.id);
    const targetFatigue = fatigue.find((entry) => entry.playerId === target.id);

    let baseChance =
      (this.getPlayerStat(passer, 'shortPassing') + this.getPlayerStat(passer, 'longPassing')) / 2 + 16.0;

    if (passerFatigue) {
      baseChance *= passerFatigue.performanceModifier;
    }

    if (targetFatigue) {
      baseChance *= targetFatigue.performanceModifier;
    }

    if (tactics.playingStyle === PlayingStyle.POSSESSION) {
      baseChance += 10;
    }

    if (passIntent === PASS_INTENT.RECYCLE) {
      baseChance += 1.5;
    } else if (passIntent === PASS_INTENT.PROGRESSION) {
      baseChance -= 0.5;
    } else if (passIntent === PASS_INTENT.THROUGH_BALL) {
      baseChance -= 5.5;
    } else if (passIntent === PASS_INTENT.CROSS) {
      baseChance -= 4.5;
    }

    if (target.position === PositionEnum.FB && (passer.position === PositionEnum.CB || passer.position === PositionEnum.GK)) {
      baseChance += 12.0;
    }

    baseChance -= pressure * 22;

    const attackingY = currentTeam === TeamSide.HOME ? currentLocation.y : 100 - currentLocation.y;
    if (attackingY > 50) {
      baseChance -= (attackingY - 50) * 0.15;
    } else if (attackingY <= 35) {
      baseChance += 5.0;
    }



    baseChance += this.calculatePassShapeModifier(
      currentLocation,
      currentTeam,
      passIntent,
    );

    baseChance = this.clamp(baseChance, 20, 95);

    return this.rng.random() * 100 < baseChance;
  }

  private calculatePassShapeModifier(
    currentLocation: Coordinates,
    currentTeam: TeamSide,
    passIntent: PassIntent,
  ): number {
    const context = this.getDefendingShapeContextForLocation(
      currentLocation,
      currentTeam,
    );
    if (!context) {
      return 0;
    }

    // Keep this modifier modest so pressure remains the primary control signal for pass resistance.
    let modifier = (1 - context.zoneCoverage) * 2;

    if (context.channelSlots.length === 0) {
      modifier += passIntent === PASS_INTENT.RECYCLE ? 0.4 : 1.4;
    } else if (context.channelSlots.length >= 2) {
      modifier -= passIntent === PASS_INTENT.RECYCLE ? 0.15 : 0.6;
    }

    if (!context.wideChannel && context.centralSlots.length === 0) {
      modifier += passIntent === PASS_INTENT.THROUGH_BALL ? 1.2 : 0.55;
    }

    return modifier;
  }

  private calculatePossessionChainQuality(
    state: MatchState,
    currentTeam: TeamSide,
  ): number {
    const passes = state.ballPossession.passes;
    const y = state.ballPossession.location.y;
    const attackingY = currentTeam === TeamSide.HOME ? y : 100 - y;

    const sequenceSignal = this.clamp(passes / 6, 0, 1);
    const depthSignal = this.clamp((attackingY - 35) / 40, 0, 1);
    const finalThirdSignal = attackingY >= 67 ? 1 : 0;

    const score =
      sequenceSignal * 0.45 + depthSignal * 0.35 + finalThirdSignal * 0.2;
    return this.clamp(score, 0, 1);
  }

  private selectPassIntent(
    state: MatchState,
    passer: Player,
    currentTeam: TeamSide,
    tactics: { home: TacticalSetup; away: TacticalSetup },
    minute: number,
    passerFatigue?: PlayerFatigue,
  ): PassIntent {
    const teamTactics = tactics[currentTeam];
    const y = state.ballPossession.location.y;
    const x = state.ballPossession.location.x;
    const attackingY = currentTeam === TeamSide.HOME ? y : 100 - y;
    const wideChannel = Math.abs(x - 50) >= 18;
    const scorelineState = this.getLateGameScorelineState(
      state,
      currentTeam,
      minute,
    );

    const passerGroup = getPositionGroup(passer.position);
    const isFatigued = (passerFatigue?.fatigueLevel ?? 0) > 75;

    if (scorelineState === LATE_GAME_SCORELINE.LEADING && attackingY < 82) {
      return PASS_INTENT.RECYCLE;
    }

    const pressure = this.calculateDefensivePressure(state, currentTeam, tactics);

    if (passer.position === PositionEnum.GK && attackingY < 78) {
      if (pressure > 0.65 && this.rng.random() < 0.30) {
        return PASS_INTENT.PROGRESSION;
      }
      return PASS_INTENT.RECYCLE;
    }

    if (passer.position === PositionEnum.CB && attackingY < 78) {
      if (isFatigued) {
        return PASS_INTENT.RECYCLE;
      }
      if (state.ballPossession.phase === MatchPhase.COUNTER_ATTACK) {
        return PASS_INTENT.PROGRESSION;
      }
      
      const vision = this.getPlayerStat(passer, 'vision') || 50;
      const passing = this.getPlayerStat(passer, 'shortPassing') || 50;
      const statModifier = (((vision + passing) / 2) - 50) / 250;

      let styleModifier = 0;
      if (teamTactics.playingStyle === PlayingStyle.COUNTER_ATTACK) styleModifier = 0.25;
      else if (teamTactics.playingStyle === PlayingStyle.PRESSING) styleModifier = 0.10;
      else if (teamTactics.playingStyle === PlayingStyle.POSSESSION) styleModifier = -0.15;
      else if (teamTactics.playingStyle === PlayingStyle.DEFENSIVE) styleModifier = 0.05;

      const progressionChance = this.clamp(0.06 + pressure * 0.22 + styleModifier + statModifier, 0.05, 0.58);
      
      if (this.rng.random() < progressionChance) {
        return PASS_INTENT.PROGRESSION;
      }
      return PASS_INTENT.RECYCLE;
    }

    if (isFatigued && attackingY < 78) {
      return PASS_INTENT.RECYCLE;
    }

    const canCross =
      passerGroup === 'MID' ||
      passerGroup === 'FWD' ||
      passer.position === PositionEnum.FB;

    if (attackingY >= 82 && wideChannel && canCross) {
      return PASS_INTENT.CROSS;
    }

    if (
      attackingY >= 78 &&
      !wideChannel &&
      (passerGroup === 'MID' ||
        passerGroup === 'FWD')
    ) {
      return PASS_INTENT.THROUGH_BALL;
    }

    if (
      teamTactics.playingStyle === PlayingStyle.POSSESSION &&
      attackingY < 60
    ) {
      return PASS_INTENT.RECYCLE;
    }



    if (scorelineState === LATE_GAME_SCORELINE.TRAILING && attackingY >= 79) {
      return wideChannel ? PASS_INTENT.CROSS : PASS_INTENT.THROUGH_BALL;
    }

    const recycleLimit = scorelineState === LATE_GAME_SCORELINE.TRAILING ? 68 : 63;
    if (attackingY < recycleLimit) {
      return PASS_INTENT.RECYCLE;
    }

    return PASS_INTENT.PROGRESSION;
  }

  private calculateDefensivePressure(
    state: MatchState,
    currentTeam: TeamSide,
    tactics: { home: TacticalSetup; away: TacticalSetup },
  ): number {
    const defendingTeam =
      currentTeam === TeamSide.HOME ? TeamSide.AWAY : TeamSide.HOME;
    const defendingTactics = tactics[defendingTeam];
    const relativeY = currentTeam === TeamSide.HOME
      ? state.ballPossession.location.y
      : 100 - state.ballPossession.location.y;
    const zone = this.fieldService.getZoneFromY(relativeY);
    const attackingZone = zone === FieldZone.ATTACK;
    const midfieldZone = zone === FieldZone.MIDFIELD;

    let pressure = defendingTactics.pressingIntensity / 100;

    if (attackingZone) {
      pressure += 0.12;
    } else if (midfieldZone) {
      pressure += 0.05;
    } else {
      pressure -= 0.05;
    }

    if (state.ballPossession.phase === MatchPhase.ATTACKING) {
      pressure += 0.04;
    }

    pressure += this.calculateShapePressureModifier(state, currentTeam);

    // Scale pressure based on defending players' defensive attributes
    const players = defendingTeam === TeamSide.HOME
      ? this.activeRosters?.homePlayers
      : this.activeRosters?.awayPlayers;

    if (players && players.length > 0) {
      let totalWeight = 0;
      let totalSkill = 0;
      for (const player of players) {
        let weight = 0;
        switch (player.position) {
          case PositionEnum.CB:
            weight = 1.5;
            break;
          case PositionEnum.FB:
            weight = 1.4;
            break;
          case PositionEnum.CDM:
            weight = 1.2;
            break;
          case PositionEnum.CM:
            weight = 1.0;
            break;
          case PositionEnum.CAM:
            weight = 0.9;
            break;
          case PositionEnum.WNG:
            weight = 0.8;
            break;
          case PositionEnum.ST:
            weight = 0.7;
            break;
          case PositionEnum.GK:
            weight = 0.0;
            break;
          default:
            weight = 1.0;
            break;
        }

        if (weight > 0) {
          const playerSkill = (this.getPlayerStat(player, 'tackling') + this.getPlayerStat(player, 'speed')) / 2;
          totalSkill += playerSkill * weight;
          totalWeight += weight;
        }
      }

      if (totalWeight > 0) {
        const defendingSkill = totalSkill / totalWeight;
        pressure += (defendingSkill - 70) * 0.007;
      }
    }

    return this.clamp(pressure, 0.1, 0.80);
  }

  private getLateGameScorelineState(
    state: MatchState,
    currentTeam: TeamSide,
    minute: number,
  ): LateGameScoreLine {
    if (minute < 80) {
      return LATE_GAME_SCORELINE.LEVEL;
    }

    const teamScore =
      currentTeam === TeamSide.HOME ? state.homeScore : state.awayScore;
    const opponentScore =
      currentTeam === TeamSide.HOME ? state.awayScore : state.homeScore;

    if (teamScore > opponentScore) {
      return LATE_GAME_SCORELINE.LEADING;
    }

    if (teamScore < opponentScore) {
      return LATE_GAME_SCORELINE.TRAILING;
    }

    return LATE_GAME_SCORELINE.LEVEL;
  }

  private processMinuteSubstitutions(
    state: MatchState,
    tactics: { home: TacticalSetup; away: TacticalSetup },
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    homeTeam: Team,
    awayTeam: Team,
    minute: number,
    config: SimulationConfig,
    rosters: ResolvedRosters,
    substitutionsUsed: TeamSubstitutionUsage,
  ): void {
    const homeHasPendingInjuryReplacement =
      this.pendingInjuryReplacements[TeamSide.HOME].length > 0;
    const awayHasPendingInjuryReplacement =
      this.pendingInjuryReplacements[TeamSide.AWAY].length > 0;

    const homeUsedTacticalSub = homeHasPendingInjuryReplacement
      ? false
      : this.tryPendingTacticalSubstitution(
        TeamSide.HOME,
        state,
        tactics,
        homeTeam,
        awayTeam,
        fatigue,
        minute,
        config,
        rosters,
        substitutionsUsed,
      );
    const awayUsedTacticalSub = awayHasPendingInjuryReplacement
      ? false
      : this.tryPendingTacticalSubstitution(
        TeamSide.AWAY,
        state,
        tactics,
        homeTeam,
        awayTeam,
        fatigue,
        minute,
        config,
        rosters,
        substitutionsUsed,
      );

    if (!homeHasPendingInjuryReplacement && !homeUsedTacticalSub) {
      this.tryTeamSubstitution(
        TeamSide.HOME,
        state,
        tactics,
        homeTeam,
        awayTeam,
        fatigue,
        minute,
        config,
        rosters,
        substitutionsUsed,
      );
    }
    if (!awayHasPendingInjuryReplacement && !awayUsedTacticalSub) {
      this.tryTeamSubstitution(
        TeamSide.AWAY,
        state,
        tactics,
        homeTeam,
        awayTeam,
        fatigue,
        minute,
        config,
        rosters,
        substitutionsUsed,
      );
    }

    this.tryPendingInjuryReplacement(
      TeamSide.HOME,
      state,
      tactics,
      homeTeam,
      awayTeam,
      minute,
      config,
      rosters,
      substitutionsUsed,
    );
    this.tryPendingInjuryReplacement(
      TeamSide.AWAY,
      state,
      tactics,
      homeTeam,
      awayTeam,
      minute,
      config,
      rosters,
      substitutionsUsed,
    );
  }

  private tryPendingTacticalSubstitution(
    teamKey: TeamSide,
    state: MatchState,
    tactics: { home: TacticalSetup; away: TacticalSetup },
    homeTeam: Team,
    awayTeam: Team,
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    minute: number,
    config: SimulationConfig,
    rosters: ResolvedRosters,
    substitutionsUsed: TeamSubstitutionUsage,
  ): boolean {
    if (this.pendingTacticalSubstitutions[teamKey] === 0) {
      return false;
    }

    this.pendingTacticalSubstitutions[teamKey] = 0;

    if (
      substitutionsUsed[teamKey] >= this.maxSubstitutionsPerTeam ||
      !this.activeMatchShape
    ) {
      return false;
    }

    const teamOnField =
      teamKey === TeamSide.HOME ? rosters.homePlayers : rosters.awayPlayers;
    const teamBench =
      teamKey === TeamSide.HOME ? rosters.homeBench : rosters.awayBench;
    const currentShape = this.activeMatchShape[teamKey];
    const teamOnFieldPlayersById = new Map(
      teamOnField.map((player) => [player.id, player]),
    );

    const currentQuality = this.calculateShapeQuality(
      currentShape,
      teamOnField,
      teamOnFieldPlayersById,
    );
    // teamOnField is starters-only; filter out goalkeepers for outgoing candidates.
    const starterOutfield = teamOnField.filter(
      (player) => player.position !== PositionEnum.GK,
    );

    let bestCandidate: {
      incoming: Player;
      outgoing: Player;
      quality: number;
      shape: ActiveShapeSlot[];
    } | null = null;

    for (const incoming of teamBench) {
      for (const outgoing of starterOutfield) {
        const simulatedActivePlayers = teamOnField.filter(
          (player) => player.id !== outgoing.id,
        );
        simulatedActivePlayers.push({ ...incoming, role: Role.STARTER });

        const candidateShape = this.rebalanceShapeForPlayers(
          currentShape,
          simulatedActivePlayers,
        );
        const candidateQuality = this.calculateShapeQuality(
          candidateShape,
          teamOnField,
          teamOnFieldPlayersById,
        );

        if (!bestCandidate || candidateQuality > bestCandidate.quality) {
          bestCandidate = {
            incoming,
            outgoing,
            quality: candidateQuality,
            shape: candidateShape,
          };
        }
      }
    }

    if (!bestCandidate || bestCandidate.quality <= currentQuality) {
      return false;
    }

    // Atomically swap: remove outgoing from on-field, move incoming from bench to on-field.
    this.removeFromPitch(rosters, teamKey, bestCandidate.outgoing.id, Role.SUBSTITUTED_OUT);
    this.transferToPitch(rosters, teamKey, bestCandidate.incoming.id);
    substitutionsUsed[teamKey] += 1;
    this.activeMatchShape = {
      ...this.activeMatchShape,
      [teamKey]: bestCandidate.shape,
    };
    this.rebuildFormationFromShape(teamKey, tactics);

    const teamId = teamKey === TeamSide.HOME ? homeTeam.id : awayTeam.id;
    if (
      state.ballPossession.teamId === teamId &&
      state.ballPossession.playerWithBall === bestCandidate.outgoing.id
    ) {
      state.ballPossession.playerWithBall = bestCandidate.incoming.id;
    }

    this.createEvent(
      state,
      EventType.SUBSTITUTION,
      [bestCandidate.outgoing.id, bestCandidate.incoming.id],
      { ...state.ballPossession.location },
      minute,
      true,
      config,
      {
        formationSnapshot: this.createFormationSnapshot(),
      },
    );

    return true;
  }

  private tryTeamSubstitution(
    teamKey: TeamSide,
    state: MatchState,
    tactics: { home: TacticalSetup; away: TacticalSetup },
    homeTeam: Team,
    awayTeam: Team,
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    minute: number,
    config: SimulationConfig,
    rosters: ResolvedRosters,
    substitutionsUsed: TeamSubstitutionUsage,
  ): void {
    if (substitutionsUsed[teamKey] >= this.maxSubstitutionsPerTeam) {
      return;
    }

    if (minute < 58 || minute > 88) {
      return;
    }

    const teamOnField =
      teamKey === TeamSide.HOME ? rosters.homePlayers : rosters.awayPlayers;
    const teamBench =
      teamKey === TeamSide.HOME ? rosters.homeBench : rosters.awayBench;
    const teamFatigue = fatigue[teamKey];
    const triggerChance = this.calculateSubstitutionTriggerChance(
      teamOnField,
      teamFatigue,
      minute,
    );
    if (this.rng.random() >= triggerChance) {
      return;
    }

    const outgoingPlayer = this.selectSubstitutionOutgoingPlayer(
      teamOnField,
      teamFatigue,
    );
    if (!outgoingPlayer) {
      return;
    }

    const incomingPlayer = this.selectSubstitutionIncomingPlayer(
      teamBench,
      outgoingPlayer.position,
    );
    if (!incomingPlayer) {
      return;
    }

    this.removeFromPitch(rosters, teamKey, outgoingPlayer.id, Role.SUBSTITUTED_OUT);
    this.transferToPitch(rosters, teamKey, incomingPlayer.id);
    substitutionsUsed[teamKey] += 1;
    this.applyShapeSubstitution(
      teamKey,
      outgoingPlayer.id,
      incomingPlayer.id,
      tactics,
    );

    const teamId = teamKey === TeamSide.HOME ? homeTeam.id : awayTeam.id;
    if (
      state.ballPossession.teamId === teamId &&
      state.ballPossession.playerWithBall === outgoingPlayer.id
    ) {
      state.ballPossession.playerWithBall = incomingPlayer.id;
    }

    this.createEvent(
      state,
      EventType.SUBSTITUTION,
      [outgoingPlayer.id, incomingPlayer.id],
      { ...state.ballPossession.location },
      minute,
      true,
      config,
      {
        formationSnapshot: this.createFormationSnapshot(),
      },
    );
  }

  private calculateSubstitutionTriggerChance(
    teamPlayers: Player[],
    teamFatigue: PlayerFatigue[],
    minute: number,
  ): number {
    let baseChance = minute >= 82 ? 0.38 : minute >= 72 ? 0.24 : 0.14;
    const fatigueByPlayer = new Map(
      teamFatigue.map((entry) => [entry.playerId, entry.fatigueLevel]),
    );
    // teamPlayers is the on-field array (starters only).
    const fatiguedStarters = teamPlayers.filter(
      (player) =>
        player.position !== PositionEnum.GK &&
        (fatigueByPlayer.get(player.id) ?? 0) >= 62,
    ).length;

    baseChance += this.clamp((fatiguedStarters - 1) * 0.06, 0, 0.24);
    return this.clamp(baseChance, 0.08, 0.72);
  }

  private selectSubstitutionOutgoingPlayer(
    teamPlayers: Player[],
    teamFatigue: PlayerFatigue[],
  ): Player | null {
    const fatigueByPlayer = new Map(
      teamFatigue.map((entry) => [entry.playerId, entry.fatigueLevel]),
    );
    // teamPlayers is the on-field array (starters only).
    const starterOutfield = teamPlayers.filter(
      (player) => player.position !== PositionEnum.GK,
    );

    if (starterOutfield.length === 0) {
      return null;
    }

    const sortedByFatigue = [...starterOutfield].sort(
      (left, right) =>
        (fatigueByPlayer.get(right.id) ?? 0) -
        (fatigueByPlayer.get(left.id) ?? 0),
    );

    const topCandidates = sortedByFatigue.slice(
      0,
      Math.min(3, sortedByFatigue.length),
    );
    return (
      topCandidates[Math.floor(this.rng.random() * topCandidates.length)] ??
      sortedByFatigue[0] ??
      null
    );
  }

  private selectSubstitutionIncomingPlayer(
    benchPlayers: Player[],
    outgoingPosition: PositionEnum,
  ): Player | null {
    const eligible = benchPlayers.filter(
      (player) => isPlayerEligible(player),
    );

    if (eligible.length === 0) {
      return null;
    }

    const samePositionPool = eligible.filter(
      (player) => player.position === outgoingPosition,
    );
    const sameGroupPool = samePositionPool.length > 0 ? samePositionPool : eligible.filter(
      (player) => getPositionGroup(player.position) === getPositionGroup(outgoingPosition),
    );
    const candidatePool =
      sameGroupPool.length > 0 ? sameGroupPool : eligible;

    const sortedByQuality = [...candidatePool].sort((left, right) => {
      const leftAttrs = getCurrentPlayerSeasonAttributes(
        left,
        this.currentSeasonYear,
      );
      const rightAttrs = getCurrentPlayerSeasonAttributes(
        right,
        this.currentSeasonYear,
      );
      const leftFatigue = left.fatigue ?? 0;
      const rightFatigue = right.fatigue ?? 0;
      const leftModifier = calculateFatigueModifier(leftFatigue);
      const rightModifier = calculateFatigueModifier(rightFatigue);

      const leftOverall = scaleOverallWithFatigue(leftAttrs.overall.value, leftModifier);
      const rightOverall = scaleOverallWithFatigue(rightAttrs.overall.value, rightModifier);

      if (rightOverall === leftOverall) {
        return rightAttrs.endurance.value - leftAttrs.endurance.value;
      }

      return rightOverall - leftOverall;
    });

    return sortedByQuality[0] ?? null;
  }

  private updateFatigue(
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    _minute: number,
    rosters: ResolvedRosters,
  ): void {
    const homeById = new Map(
      rosters.homePlayers.map((player) => [player.id, player]),
    );
    const awayById = new Map(
      rosters.awayPlayers.map((player) => [player.id, player]),
    );

    const applyFatigue = (
      teamFatigue: PlayerFatigue[],
      playersById: Map<string, Player>,
    ) => {
      teamFatigue.forEach((entry) => {
        const player = playersById.get(entry.playerId);
        if (!player || player.role !== Role.STARTER) {
          return;
        }

        const attrs = getCurrentPlayerSeasonAttributes(player, this.currentSeasonYear);
        const endurance = attrs.endurance.value;
        const baseFatigueAccrual = 0.5;
        let fatigueAccrual = baseFatigueAccrual * (1 - (endurance - 50) * 0.005);
        if (player.position === PositionEnum.GK) {
          fatigueAccrual *= this.goalkeeperStaminaDrainMultiplier;
        }

        entry.fatigueLevel = Math.min(100, entry.fatigueLevel + fatigueAccrual);
        entry.performanceModifier = calculateFatigueModifier(entry.fatigueLevel);
      });
    };

    applyFatigue(fatigue.home, homeById);
    applyFatigue(fatigue.away, awayById);
  }

  private updatePossessionStats(
    state: MatchState,
    homePlayers: Player[],
  ): void {
    const totalEvents = state.events.length;
    if (totalEvents <= 0) {
      return;
    }

    const homeEvents = state.events.filter((event) => {
      return event.playerIds.some(
        (playerId) => this.findPlayerById(playerId, homePlayers) !== null,
      );
    });

    const homeEventRatio = homeEvents.length / totalEvents;
    state.homePossession = Math.round(homeEventRatio * 100);
    state.awayPossession = 100 - state.homePossession;
  }

  private createEvent(
    state: MatchState,
    type: EventType,
    playerIds: string[],
    location: Coordinates,
    time: number,
    success: boolean,
    config: SimulationConfig,
    additionalData?: PlayByPlayEventAdditionalData,
  ): void {
    const finalData: PlayByPlayEventAdditionalData = { ...additionalData };
    if (config.enableSpatialTracking) {
      finalData.formationSnapshot = this.createFormationSnapshot();
      if (state.ballPossession?.playerWithBall) {
        finalData.playerWithBall = state.ballPossession.playerWithBall;
      }
    }

    state.events.push({
      id: this.createRandomId(),
      type,
      description: "",
      playerIds,
      location,
      time,
      success,
      additionalData: Object.keys(finalData).length > 0 ? finalData : undefined,
    });
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private isInShootingWindow(currentTeam: TeamSide, y: number): boolean {
    return currentTeam === TeamSide.HOME ? y >= 70 : y <= 30;
  }

  private executeVariantBShot(
    state: MatchState,
    action: MatchAction,
    tactics: { home: TacticalSetup; away: TacticalSetup },
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    homeTeam: Team,
    awayTeam: Team,
    minute: number,
    config: SimulationConfig,
    rosters: ResolvedRosters,
  ): void {
    const shooter = action.player;
    const isHomeInPossession = state.ballPossession.teamId === homeTeam.id;
    const attackingY = isHomeInPossession
      ? state.ballPossession.location.y
      : 100 - state.ballPossession.location.y;
    const lateralDistance = Math.abs(state.ballPossession.location.x - 50);
    const opponentPlayers = isHomeInPossession
      ? rosters.awayPlayers
      : rosters.homePlayers;
    const onFieldOpponentPlayers = opponentPlayers.filter(
      (player) => player.role === Role.STARTER,
    );
    const goalkeeper = onFieldOpponentPlayers.find(
      (player) => player.position === PositionEnum.GK,
    );
    const fatigueBucket = isHomeInPossession ? fatigue.home : fatigue.away;
    const shooterFatigue = fatigueBucket.find(
      (entry) => entry.playerId === shooter.id,
    );
    const currentTeam: TeamSide = isHomeInPossession
      ? TeamSide.HOME
      : TeamSide.AWAY;
    const pressure = this.calculateDefensivePressure(
      state,
      currentTeam,
      tactics,
    );
    const chainQuality = this.calculatePossessionChainQuality(
      state,
      currentTeam,
    );
    const shotShapeModifier = this.calculateShotShapeModifier(
      state,
      currentTeam,
    );

    if (isHomeInPossession) {
      state.homeShots++;
    } else {
      state.awayShots++;
    }

    let onTargetChance =
      this.activeTuning.onTargetBase +
      (this.getPlayerStat(shooter, 'shooting') - 70) * this.activeTuning.onTargetSkillScale;
    if (attackingY >= 85) {
      onTargetChance += 0.28;
    } else if (attackingY >= 75) {
      onTargetChance += 0.18;
    } else if (attackingY >= 65) {
      onTargetChance += 0.09;
    } else {
      onTargetChance -= 0.02;
    }

    onTargetChance -=
      (lateralDistance / 50) * this.activeTuning.onTargetWidePenalty;
    if (shooterFatigue && shooterFatigue.fatigueLevel > 75) {
      onTargetChance -= this.activeTuning.onTargetFatiguePenalty;
    }
    onTargetChance -= pressure * 0.15;
    onTargetChance += chainQuality * 0.02;
    onTargetChance += shotShapeModifier.onTargetBonus;

    onTargetChance = this.clampChance(
      onTargetChance,
      this.activeTuning.onTargetMin,
      this.activeTuning.onTargetMax,
    );
    const onTarget = this.rng.random() < onTargetChance;

    if (!onTarget) {
      this.createEvent(
        state,
        EventType.MISS,
        [shooter.id],
        { ...state.ballPossession.location },
        minute,
        false,
        config,
      );
      // Non-contact injury roll on the shooter.
      const shooterTeamPlayers = isHomeInPossession
        ? rosters.homePlayers
        : rosters.awayPlayers;
      this.tryRollInjury(
        shooter,
        currentTeam,
        InjuryRollKind.NON_CONTACT,
        1,
        state,
        minute,
        config,
        shooterTeamPlayers,
        tactics,
      );

      // Chance that a miss is deflected for a corner
      if (this.rng.random() < this.activeTuning.missToCornerChance) {
        const defendingTeamSide = currentTeam === TeamSide.HOME ? TeamSide.AWAY : TeamSide.HOME;
        this.executeVariantBCorner(state, currentTeam, defendingTeamSide, homeTeam, awayTeam, minute, config, rosters, tactics);
      } else {
        // Goal kick: turn over possession to defending GK
        const gk = onFieldOpponentPlayers.find(p => p.position === PositionEnum.GK) ?? onFieldOpponentPlayers[0];
        state.ballPossession.teamId = currentTeam === TeamSide.HOME ? awayTeam.id : homeTeam.id;
        state.ballPossession.playerWithBall = gk.id;
        state.ballPossession.location = currentTeam === TeamSide.HOME ? { x: 50, y: 85 } : { x: 50, y: 15 };
        state.ballPossession.passes = 0;
      }
      return;
    }

    if (isHomeInPossession) {
      state.homeShotsOnTarget++;
    } else {
      state.awayShotsOnTarget++;
    }

    const keeperSkill = goalkeeper
      ? (this.getPlayerStat(goalkeeper, 'handling') + this.getPlayerStat(goalkeeper, 'reflexes')) / 2
      : 70;
    let goalChance =
      this.activeTuning.goalChanceBase +
      (this.getPlayerStat(shooter, 'shooting') - keeperSkill) *
      this.activeTuning.goalChanceSkillVsKeeperScale;

    if (attackingY >= 85) {
      goalChance += 0.2;
    } else if (attackingY >= 75) {
      goalChance += 0.12;
    } else {
      goalChance += 0.02;
    }

    goalChance -=
      (lateralDistance / 50) * this.activeTuning.goalChanceWidePenalty;
    goalChance -= pressure * 0.05;
    goalChance += chainQuality * 0.015;
    goalChance += shotShapeModifier.goalChanceBonus;
    if (isHomeInPossession) {
      goalChance += this.activeTuning.homeAdvantageGoalBonus;
    }
    goalChance = this.clampChance(
      goalChance,
      this.activeTuning.goalChanceMin,
      this.activeTuning.goalChanceMax,
    );

    if (this.rng.random() < goalChance) {
      this.handleGoal(
        state,
        { type: EventType.GOAL, player: shooter },
        homeTeam,
        awayTeam,
        minute,
        config,
        rosters.homePlayers,
        rosters.awayPlayers,
        tactics,
      );
      return;
    }

    this.createEvent(
      state,
      EventType.SAVE,
      goalkeeper ? [shooter.id, goalkeeper.id] : [shooter.id],
      { ...state.ballPossession.location },
      minute,
      true,
      config,
    );

    // Contact injury roll on the goalkeeper (point-blank save physical contact).
    if (goalkeeper) {
      const keeperTeamKey: TeamSide = isHomeInPossession
        ? TeamSide.AWAY
        : TeamSide.HOME;
      const keeperTeamPlayers =
        keeperTeamKey === TeamSide.HOME
          ? rosters.homePlayers
          : rosters.awayPlayers;
      this.tryRollInjury(
        goalkeeper,
        keeperTeamKey,
        InjuryRollKind.CONTACT,
        1,
        state,
        minute,
        config,
        keeperTeamPlayers,
        tactics,
      );
    }

    // Chance that a save is deflected for a corner
    if (this.rng.random() < this.activeTuning.saveToCornerChance) {
      const defendingTeamSide = currentTeam === TeamSide.HOME ? TeamSide.AWAY : TeamSide.HOME;
      this.executeVariantBCorner(state, currentTeam, defendingTeamSide, homeTeam, awayTeam, minute, config, rosters, tactics);
    } else {
      state.ballPossession.teamId = isHomeInPossession
        ? awayTeam.id
        : homeTeam.id;
      const newOwnerPool =
        state.ballPossession.teamId === homeTeam.id
          ? rosters.homePlayers
          : rosters.awayPlayers;
      const starters = newOwnerPool.filter(
        (player) => player.role === Role.STARTER,
      );
      const selectablePlayers = starters.length > 0 ? starters : newOwnerPool;
      const newOwner =
        selectablePlayers[
        Math.floor(this.rng.random() * Math.max(selectablePlayers.length, 1))
        ] ?? newOwnerPool[0];
      state.ballPossession.playerWithBall = newOwner.id;
      state.ballPossession.passes = 0;
    }
  }

  private executeVariantBCorner(
    state: MatchState,
    attackingTeamSide: TeamSide,
    defendingTeamSide: TeamSide,
    homeTeam: Team,
    awayTeam: Team,
    minute: number,
    config: SimulationConfig,
    rosters: ResolvedRosters,
    tactics: { home: TacticalSetup; away: TacticalSetup },
  ): void {
    state.counterAttackTicks = 0;
    const attackers = attackingTeamSide === TeamSide.HOME ? rosters.homePlayers : rosters.awayPlayers;
    const defenders = defendingTeamSide === TeamSide.HOME ? rosters.homePlayers : rosters.awayPlayers;

    const onFieldAttackers = attackers.filter(p => p.role === Role.STARTER && p.position !== PositionEnum.GK);
    const onFieldDefenders = defenders.filter(p => p.role === Role.STARTER);

    if (attackingTeamSide === TeamSide.HOME) {
      state.homeCorners = (state.homeCorners ?? 0) + 1;
    } else {
      state.awayCorners = (state.awayCorners ?? 0) + 1;
    }

    const taker = [...onFieldAttackers].sort((a, b) => {
      return (this.getPlayerStat(b, 'longPassing') + this.getPlayerStat(b, 'flair')) - (this.getPlayerStat(a, 'longPassing') + this.getPlayerStat(a, 'flair'));
    })[0] ?? onFieldAttackers[0] ?? attackers[0];

    if (this.activeMatchShape) {
      const cornerCoords = attackingTeamSide === TeamSide.HOME ? { x: 95, y: 98 } : { x: 5, y: 2 };
      const takerSlot = this.activeMatchShape[attackingTeamSide].find(s => s.playerId === taker.id);
      if (takerSlot) {
        takerSlot.coordinates = { ...cornerCoords };
      }
    }

    this.createEvent(
      state,
      EventType.CORNER,
      [taker.id],
      attackingTeamSide === TeamSide.HOME ? { x: 95, y: 98 } : { x: 5, y: 2 },
      minute,
      true,
      config
    );

    const getAttackingAerialWeight = (p: Player) => {
      let posBonus = 0;
      switch (p.position) {
        case PositionEnum.ST: posBonus = 25; break;
        case PositionEnum.CB: posBonus = 20; break;
        case PositionEnum.CM: case PositionEnum.CAM: case PositionEnum.CDM: posBonus = 10; break;
        default: posBonus = 0;
      }
      return this.getPlayerStat(p, 'heading') + this.getPlayerStat(p, 'strength') + posBonus;
    };

    const sortedAttackingTargets = [...onFieldAttackers].sort((a, b) => getAttackingAerialWeight(b) - getAttackingAerialWeight(a));
    const attackingTarget = sortedAttackingTargets[Math.floor(this.rng.random() * Math.min(3, sortedAttackingTargets.length))] ?? onFieldAttackers[0] ?? attackers[0];

    const getDefendingAerialWeight = (p: Player) => {
      let posBonus = 0;
      switch (p.position) {
        case PositionEnum.GK: posBonus = 35; break;
        case PositionEnum.CB: posBonus = 25; break;
        case PositionEnum.CDM: posBonus = 15; break;
        case PositionEnum.FB: posBonus = 10; break;
        default: posBonus = 0;
      }
      return this.getPlayerStat(p, 'heading') + this.getPlayerStat(p, 'strength') + posBonus;
    };

    const sortedDefenders = [...onFieldDefenders].sort((a, b) => getDefendingAerialWeight(b) - getDefendingAerialWeight(a));
    const defenderMarker = sortedDefenders[Math.floor(this.rng.random() * Math.min(3, sortedDefenders.length))] ?? onFieldDefenders[0] ?? defenders[0];

    const deliveryScore = (this.getPlayerStat(taker, 'longPassing') + this.getPlayerStat(taker, 'flair')) / 2 + this.rng.random() * 20;

    const attackerScore = this.getPlayerStat(attackingTarget, 'heading') + this.getPlayerStat(attackingTarget, 'strength') + deliveryScore * 0.15 + this.rng.random() * 30;
    const defenderScore = this.getPlayerStat(defenderMarker, 'heading') + this.getPlayerStat(defenderMarker, 'strength') + this.rng.random() * 30;

    const attackerWins = attackerScore > defenderScore;

    if (attackerWins) {
      const additionalData = {
        isCorner: true,
        aerialWinner: attackingTarget.id,
        aerialLoser: defenderMarker.id
      };

      const gk = onFieldDefenders.find(p => p.position === PositionEnum.GK) ?? onFieldDefenders[0] ?? defenders[0];
      const keeperSkill = (this.getPlayerStat(gk, 'reflexes') + this.getPlayerStat(gk, 'handling')) / 2;

      let goalChance = this.activeTuning.cornerGoalChanceBase + (this.getPlayerStat(attackingTarget, 'heading') - keeperSkill) * 0.002;
      goalChance = this.clampChance(goalChance, 0.02, this.activeTuning.cornerGoalChanceMax);

      if (attackingTeamSide === TeamSide.HOME) {
        state.homeShots++;
      } else {
        state.awayShots++;
      }

      if (this.rng.random() < goalChance) {
        if (attackingTeamSide === TeamSide.HOME) {
          state.homeShotsOnTarget++;
          state.homeSetPieceGoals = (state.homeSetPieceGoals ?? 0) + 1;
        } else {
          state.awayShotsOnTarget++;
          state.awaySetPieceGoals = (state.awaySetPieceGoals ?? 0) + 1;
        }

        this.handleGoal(
          state,
          { type: EventType.GOAL, player: attackingTarget },
          homeTeam,
          awayTeam,
          minute,
          config,
          rosters.homePlayers,
          rosters.awayPlayers,
          tactics,
          additionalData,
        );
      } else {
        const isSaved = this.rng.random() < 0.60;
        if (isSaved) {
          if (attackingTeamSide === TeamSide.HOME) {
            state.homeShotsOnTarget++;
          } else {
            state.awayShotsOnTarget++;
          }

          this.createEvent(
            state,
            EventType.SAVE,
            [attackingTarget.id, gk.id],
            attackingTeamSide === TeamSide.HOME ? { x: 50, y: 95 } : { x: 50, y: 5 },
            minute,
            true,
            config,
            additionalData
          );

          if (this.rng.random() < 0.25) {
            this.executeVariantBCorner(state, attackingTeamSide, defendingTeamSide, homeTeam, awayTeam, minute, config, rosters, tactics);
          } else {
            state.ballPossession.teamId = defendingTeamSide === TeamSide.HOME ? homeTeam.id : awayTeam.id;
            state.ballPossession.playerWithBall = gk.id;
            state.ballPossession.location = defendingTeamSide === TeamSide.HOME ? { x: 50, y: 15 } : { x: 50, y: 85 };
            state.ballPossession.passes = 0;
          }
        } else {
          this.createEvent(
            state,
            EventType.MISS,
            [attackingTarget.id],
            attackingTeamSide === TeamSide.HOME ? { x: 50, y: 95 } : { x: 50, y: 5 },
            minute,
            false,
            config,
            additionalData
          );

          state.ballPossession.teamId = defendingTeamSide === TeamSide.HOME ? homeTeam.id : awayTeam.id;
          state.ballPossession.playerWithBall = gk.id;
          state.ballPossession.location = defendingTeamSide === TeamSide.HOME ? { x: 50, y: 15 } : { x: 50, y: 85 };
          state.ballPossession.passes = 0;
        }
      }
    } else {
      const additionalData = {
        isCorner: true,
        aerialWinner: defenderMarker.id,
        aerialLoser: attackingTarget.id
      };

      this.createEvent(
        state,
        EventType.INTERCEPTION,
        [defenderMarker.id, taker.id],
        attackingTeamSide === TeamSide.HOME ? { x: 50, y: 90 } : { x: 50, y: 10 },
        minute,
        true,
        config,
        additionalData
      );

      state.ballPossession.teamId = defendingTeamSide === TeamSide.HOME ? homeTeam.id : awayTeam.id;
      state.ballPossession.playerWithBall = defenderMarker.id;
      state.ballPossession.location = defendingTeamSide === TeamSide.HOME
        ? { x: 30 + this.rng.random() * 40, y: 20 }
        : { x: 30 + this.rng.random() * 40, y: 80 };
      state.ballPossession.passes = 0;
    }
  }

  private executeVariantBFreeKick(
    state: MatchState,
    attackingTeamSide: TeamSide,
    defendingTeamSide: TeamSide,
    homeTeam: Team,
    awayTeam: Team,
    minute: number,
    config: SimulationConfig,
    rosters: ResolvedRosters,
    tactics: { home: TacticalSetup; away: TacticalSetup },
  ): void {
    state.counterAttackTicks = 0;
    const attackers = attackingTeamSide === TeamSide.HOME ? rosters.homePlayers : rosters.awayPlayers;
    const defenders = defendingTeamSide === TeamSide.HOME ? rosters.homePlayers : rosters.awayPlayers;

    const onFieldAttackers = attackers.filter(p => p.role === Role.STARTER && p.position !== PositionEnum.GK);
    const onFieldDefenders = defenders.filter(p => p.role === Role.STARTER);

    if (attackingTeamSide === TeamSide.HOME) {
      state.homeFreeKicks = (state.homeFreeKicks ?? 0) + 1;
    } else {
      state.awayFreeKicks = (state.awayFreeKicks ?? 0) + 1;
    }

    const taker = [...onFieldAttackers].sort((a, b) => {
      return (this.getPlayerStat(b, 'shooting') + this.getPlayerStat(b, 'longPassing') + this.getPlayerStat(b, 'flair')) - 
             (this.getPlayerStat(a, 'shooting') + this.getPlayerStat(a, 'longPassing') + this.getPlayerStat(a, 'flair'));
    })[0] ?? onFieldAttackers[0] ?? attackers[0];

    this.createEvent(
      state,
      EventType.FREE_KICK,
      [taker.id],
      { ...state.ballPossession.location },
      minute,
      true,
      config
    );

    const relativeY = attackingTeamSide === TeamSide.HOME ? state.ballPossession.location.y : 100 - state.ballPossession.location.y;
    const directShot = relativeY >= 85 ? this.rng.random() < 0.70 : this.rng.random() < 0.30;

    const additionalData = {
      isFreeKick: true,
      freeKickDirect: directShot
    };

    if (directShot) {
      const gk = onFieldDefenders.find(p => p.position === PositionEnum.GK) ?? onFieldDefenders[0] ?? defenders[0];
      const keeperSkill = (this.getPlayerStat(gk, 'reflexes') + this.getPlayerStat(gk, 'handling')) / 2;

      if (attackingTeamSide === TeamSide.HOME) {
        state.homeShots++;
      } else {
        state.awayShots++;
      }

      const shotOnTargetChance = 0.30 + (this.getPlayerStat(taker, 'shooting') - keeperSkill) * 0.002;
      const onTarget = this.rng.random() < this.clampChance(shotOnTargetChance, 0.10, 0.50);

      if (!onTarget) {
        this.createEvent(
          state,
          EventType.MISS,
          [taker.id],
          attackingTeamSide === TeamSide.HOME ? { x: 50, y: 95 } : { x: 50, y: 5 },
          minute,
          false,
          config,
          additionalData
        );

        state.ballPossession.teamId = defendingTeamSide === TeamSide.HOME ? homeTeam.id : awayTeam.id;
        state.ballPossession.playerWithBall = gk.id;
        state.ballPossession.location = defendingTeamSide === TeamSide.HOME ? { x: 50, y: 15 } : { x: 50, y: 85 };
        state.ballPossession.passes = 0;
      } else {
        if (attackingTeamSide === TeamSide.HOME) {
          state.homeShotsOnTarget++;
        } else {
          state.awayShotsOnTarget++;
        }

        let goalChance = 0.12 + (this.getPlayerStat(taker, 'shooting') - keeperSkill) * 0.002;
        goalChance = this.clampChance(goalChance, 0.03, 0.30);

        if (this.rng.random() < goalChance) {
          if (attackingTeamSide === TeamSide.HOME) {
            state.homeSetPieceGoals = (state.homeSetPieceGoals ?? 0) + 1;
            state.homeFreeKickGoals = (state.homeFreeKickGoals ?? 0) + 1;
          } else {
            state.awaySetPieceGoals = (state.awaySetPieceGoals ?? 0) + 1;
            state.awayFreeKickGoals = (state.awayFreeKickGoals ?? 0) + 1;
          }

          this.handleGoal(
            state,
            { type: EventType.GOAL, player: taker },
            homeTeam,
            awayTeam,
            minute,
            config,
            rosters.homePlayers,
            rosters.awayPlayers,
            tactics,
            additionalData,
          );
        } else {
          this.createEvent(
            state,
            EventType.SAVE,
            [taker.id, gk.id],
            attackingTeamSide === TeamSide.HOME ? { x: 50, y: 95 } : { x: 50, y: 5 },
            minute,
            true,
            config,
            additionalData
          );

          state.ballPossession.teamId = defendingTeamSide === TeamSide.HOME ? homeTeam.id : awayTeam.id;
          state.ballPossession.playerWithBall = gk.id;
          state.ballPossession.location = defendingTeamSide === TeamSide.HOME ? { x: 50, y: 15 } : { x: 50, y: 85 };
          state.ballPossession.passes = 0;
        }
      }
    } else {
      const getAttackingAerialWeight = (p: Player) => {
        let posBonus = 0;
        switch (p.position) {
          case PositionEnum.ST: posBonus = 25; break;
          case PositionEnum.CB: posBonus = 20; break;
          case PositionEnum.CM: case PositionEnum.CAM: case PositionEnum.CDM: posBonus = 10; break;
          default: posBonus = 0;
        }
        return this.getPlayerStat(p, 'heading') + this.getPlayerStat(p, 'strength') + posBonus;
      };

      const sortedAttackingTargets = [...onFieldAttackers].sort((a, b) => getAttackingAerialWeight(b) - getAttackingAerialWeight(a));
      const attackingTarget = sortedAttackingTargets[Math.floor(this.rng.random() * Math.min(3, sortedAttackingTargets.length))] ?? onFieldAttackers[0] ?? attackers[0];

      const getDefendingAerialWeight = (p: Player) => {
        let posBonus = 0;
        switch (p.position) {
          case PositionEnum.GK: posBonus = 35; break;
          case PositionEnum.CB: posBonus = 25; break;
          case PositionEnum.CDM: posBonus = 15; break;
          case PositionEnum.FB: posBonus = 10; break;
          default: posBonus = 0;
        }
        return this.getPlayerStat(p, 'heading') + this.getPlayerStat(p, 'strength') + posBonus;
      };

      const sortedDefenders = [...onFieldDefenders].sort((a, b) => getDefendingAerialWeight(b) - getDefendingAerialWeight(a));
      const defenderMarker = sortedDefenders[Math.floor(this.rng.random() * Math.min(3, sortedDefenders.length))] ?? onFieldDefenders[0] ?? defenders[0];

      const deliveryScore = (this.getPlayerStat(taker, 'longPassing') + this.getPlayerStat(taker, 'flair')) / 2 + this.rng.random() * 20;

      const attackerScore = this.getPlayerStat(attackingTarget, 'heading') + this.getPlayerStat(attackingTarget, 'strength') + deliveryScore * 0.15 + this.rng.random() * 30;
      const defenderScore = this.getPlayerStat(defenderMarker, 'heading') + this.getPlayerStat(defenderMarker, 'strength') + this.rng.random() * 30;

      const attackerWins = attackerScore > defenderScore;

      const aerialData = {
        isFreeKick: true,
        freeKickDirect: false,
        aerialWinner: attackerWins ? attackingTarget.id : defenderMarker.id,
        aerialLoser: attackerWins ? defenderMarker.id : attackingTarget.id
      };

      if (attackerWins) {
        const gk = onFieldDefenders.find(p => p.position === PositionEnum.GK) ?? onFieldDefenders[0] ?? defenders[0];
        const keeperSkill = (this.getPlayerStat(gk, 'reflexes') + this.getPlayerStat(gk, 'handling')) / 2;

        if (attackingTeamSide === TeamSide.HOME) {
          state.homeShots++;
        } else {
          state.awayShots++;
        }

        let goalChance = this.activeTuning.indirectFkGoalChanceBase + (this.getPlayerStat(attackingTarget, 'heading') - keeperSkill) * 0.003;
        goalChance = this.clampChance(goalChance, 0.03, this.activeTuning.indirectFkGoalChanceMax);

        if (this.rng.random() < goalChance) {
          if (attackingTeamSide === TeamSide.HOME) {
            state.homeShotsOnTarget++;
            state.homeSetPieceGoals = (state.homeSetPieceGoals ?? 0) + 1;
          } else {
            state.awayShotsOnTarget++;
            state.awaySetPieceGoals = (state.awaySetPieceGoals ?? 0) + 1;
          }

          this.handleGoal(
            state,
            { type: EventType.GOAL, player: attackingTarget },
            homeTeam,
            awayTeam,
            minute,
            config,
            rosters.homePlayers,
            rosters.awayPlayers,
            tactics,
            aerialData,
          );
        } else {
          const isSaved = this.rng.random() < 0.60;
          if (isSaved) {
            if (attackingTeamSide === TeamSide.HOME) {
              state.homeShotsOnTarget++;
            } else {
              state.awayShotsOnTarget++;
            }

            this.createEvent(
              state,
              EventType.SAVE,
              [attackingTarget.id, gk.id],
              attackingTeamSide === TeamSide.HOME ? { x: 50, y: 95 } : { x: 50, y: 5 },
              minute,
              true,
              config,
              aerialData
            );
          } else {
            this.createEvent(
              state,
              EventType.MISS,
              [attackingTarget.id],
              attackingTeamSide === TeamSide.HOME ? { x: 50, y: 95 } : { x: 50, y: 5 },
              minute,
              false,
              config,
              aerialData
            );
          }

          state.ballPossession.teamId = defendingTeamSide === TeamSide.HOME ? homeTeam.id : awayTeam.id;
          state.ballPossession.playerWithBall = gk.id;
          state.ballPossession.location = defendingTeamSide === TeamSide.HOME ? { x: 50, y: 15 } : { x: 50, y: 85 };
          state.ballPossession.passes = 0;
        }
      } else {
        this.createEvent(
          state,
          EventType.INTERCEPTION,
          [defenderMarker.id, taker.id],
          attackingTeamSide === TeamSide.HOME ? { x: 50, y: 90 } : { x: 50, y: 10 },
          minute,
          true,
          config,
          aerialData
        );

        state.ballPossession.teamId = defendingTeamSide === TeamSide.HOME ? homeTeam.id : awayTeam.id;
        state.ballPossession.playerWithBall = defenderMarker.id;
        state.ballPossession.location = defendingTeamSide === TeamSide.HOME
          ? { x: 30 + this.rng.random() * 40, y: 20 }
          : { x: 30 + this.rng.random() * 40, y: 80 };
        state.ballPossession.passes = 0;
      }
    }
  }

  private executeVariantBPenalty(
    state: MatchState,
    attackingTeamSide: TeamSide,
    defendingTeamSide: TeamSide,
    homeTeam: Team,
    awayTeam: Team,
    minute: number,
    config: SimulationConfig,
    rosters: ResolvedRosters,
    tactics: { home: TacticalSetup; away: TacticalSetup },
  ): void {
    state.counterAttackTicks = 0;
    const attackers = attackingTeamSide === TeamSide.HOME ? rosters.homePlayers : rosters.awayPlayers;
    const defenders = defendingTeamSide === TeamSide.HOME ? rosters.homePlayers : rosters.awayPlayers;

    const onFieldAttackers = attackers.filter(p => p.role === Role.STARTER && p.position !== PositionEnum.GK);
    const onFieldDefenders = defenders.filter(p => p.role === Role.STARTER);

    const shooter = [...onFieldAttackers].sort((a, b) => {
      return (this.getPlayerStat(b, 'composure') + this.getPlayerStat(b, 'shooting')) - 
             (this.getPlayerStat(a, 'composure') + this.getPlayerStat(a, 'shooting'));
    })[0] ?? onFieldAttackers[0] ?? attackers[0];

    const goalkeeper = onFieldDefenders.find(p => p.position === PositionEnum.GK) ?? onFieldDefenders[0] ?? defenders[0];

    this.createEvent(
      state,
      EventType.PENALTY,
      [shooter.id, goalkeeper.id],
      attackingTeamSide === TeamSide.HOME ? { x: 50, y: 88 } : { x: 50, y: 12 },
      minute,
      true,
      config
    );

    if (attackingTeamSide === TeamSide.HOME) {
      state.homePenalties = (state.homePenalties ?? 0) + 1;
    } else {
      state.awayPenalties = (state.awayPenalties ?? 0) + 1;
    }

    const shooterScore = (this.getPlayerStat(shooter, 'shooting') + this.getPlayerStat(shooter, 'composure')) / 2;
    const gkScore = this.getPlayerStat(goalkeeper, 'reflexes');

    let penaltySuccessChance = 0.75 + (shooterScore - gkScore) * 0.002;
    penaltySuccessChance = this.clampChance(penaltySuccessChance, 0.55, 0.88);

    const goalScored = this.rng.random() < penaltySuccessChance;
    const additionalData = { isPenalty: true };

    if (goalScored) {
      if (attackingTeamSide === TeamSide.HOME) {
        state.homePenaltyGoals = (state.homePenaltyGoals ?? 0) + 1;
        state.homeSetPieceGoals = (state.homeSetPieceGoals ?? 0) + 1;
      } else {
        state.awayPenaltyGoals = (state.awayPenaltyGoals ?? 0) + 1;
        state.awaySetPieceGoals = (state.awaySetPieceGoals ?? 0) + 1;
      }

      this.handleGoal(
        state,
        { type: EventType.GOAL, player: shooter },
        homeTeam,
        awayTeam,
        minute,
        config,
        rosters.homePlayers,
        rosters.awayPlayers,
        tactics,
        additionalData,
      );
    } else {
      const isSaved = this.rng.random() < 0.70;
      if (isSaved) {
        this.createEvent(
          state,
          EventType.SAVE,
          [shooter.id, goalkeeper.id],
          attackingTeamSide === TeamSide.HOME ? { x: 50, y: 95 } : { x: 50, y: 5 },
          minute,
          true,
          config,
          additionalData
        );
      } else {
        this.createEvent(
          state,
          EventType.MISS,
          [shooter.id],
          attackingTeamSide === TeamSide.HOME ? { x: 50, y: 95 } : { x: 50, y: 5 },
          minute,
          false,
          config,
          additionalData
        );
      }

      state.ballPossession.teamId = defendingTeamSide === TeamSide.HOME ? homeTeam.id : awayTeam.id;
      state.ballPossession.playerWithBall = goalkeeper.id;
      state.ballPossession.location = defendingTeamSide === TeamSide.HOME ? { x: 50, y: 15 } : { x: 50, y: 85 };
      state.ballPossession.passes = 0;
    }
  }

  private clampChance(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private applyQuietProgression(
    state: MatchState,
    carrier: Player,
    homeTeam: Team,
    awayTeam: Team,
    rosters: ResolvedRosters,
    pressure: number,
  ): void {
    const currentTeam =
      state.ballPossession.teamId === homeTeam.id
        ? TeamSide.HOME
        : TeamSide.AWAY;
    const currentPlayers =
      currentTeam === TeamSide.HOME ? rosters.homePlayers : rosters.awayPlayers;
    const attackDirection = currentTeam === TeamSide.HOME ? 1 : -1;
    const carryAdvance = this.calculateCarryAdvanceDistance(carrier, pressure);

    state.ballPossession.location = {
      x: this.clamp(
        state.ballPossession.location.x + (this.rng.random() - 0.5) * 2.5,
        0,
        100,
      ),
      y: this.clamp(
        state.ballPossession.location.y + carryAdvance * attackDirection,
        0,
        100,
      ),
    };

    const sameRolePlayers = currentPlayers.filter(
      (player) =>
        player.id !== carrier.id &&
        player.role === Role.STARTER &&
        player.position === carrier.position,
    );
    const fallbackPlayers = currentPlayers.filter(
      (player) =>
        player.id !== carrier.id &&
        player.role === Role.STARTER &&
        player.position !== PositionEnum.GK,
    );
    const candidatePool =
      sameRolePlayers.length > 0 ? sameRolePlayers : fallbackPlayers;

    if (candidatePool.length > 0 && this.rng.random() < 0.35) {
      const nextCarrier =
        candidatePool[Math.floor(this.rng.random() * candidatePool.length)];
      state.ballPossession.playerWithBall = nextCarrier.id;
    }

    state.ballPossession.passes += 1;
    state.ballPossession.phase = this.getPhaseFromLocation(
      state.ballPossession.location,
      currentTeam,
      state,
    );
  }

  private calculateCarryAdvanceDistance(
    carrier: Player,
    pressure: number,
  ): number {
    const baseAdvance = 1.0 + this.rng.random() * 2.0;
    let roleMultiplier = 1.0;
    switch (carrier.position) {
      case PositionEnum.GK:
        roleMultiplier = 0.4;
        break;
      case PositionEnum.CB:
        roleMultiplier = 0.7;
        break;
      case PositionEnum.FB:
        roleMultiplier = 1.1;
        break;
      case PositionEnum.CDM:
        roleMultiplier = 0.9;
        break;
      case PositionEnum.CM:
        roleMultiplier = 1.0;
        break;
      case PositionEnum.CAM:
        roleMultiplier = 1.1;
        break;
      case PositionEnum.WNG:
        roleMultiplier = 1.25;
        break;
      case PositionEnum.ST:
        roleMultiplier = 1.15;
        break;
    }
    const pressureMultiplier = this.clamp(1 - pressure * 0.65, 0.35, 1);

    return baseAdvance * roleMultiplier * pressureMultiplier;
  }

  private getPhaseFromLocation(
    location: Coordinates,
    currentTeam: TeamSide,
    state?: MatchState,
  ): MatchPhase {
    if (state?.counterAttackTicks && state.counterAttackTicks > 0) {
      return MatchPhase.COUNTER_ATTACK;
    }
    const attackingY =
      currentTeam === TeamSide.HOME ? location.y : 100 - location.y;
    return attackingY >= 67 ? MatchPhase.ATTACKING : MatchPhase.BUILD_UP;
  }

  private resolveReplayActionType(
    state: MatchState,
    minute: number,
    actionType: MatchAction["type"],
  ): EventType {
    if (actionType !== EventType.CARRY) {
      return actionType;
    }

    const latestEventIndex = this.findLatestEventIndexForMinute(state, minute);
    if (latestEventIndex >= 0) {
      return state.events[latestEventIndex].type;
    }

    return EventType.PASS;
  }

  private resolveReplayActorPlayerId(
    state: MatchState,
    minute: number,
    fallbackPlayerId: string,
  ): string {
    const latestEventIndex = this.findLatestEventIndexForMinute(state, minute);
    if (latestEventIndex >= 0) {
      return state.events[latestEventIndex].playerIds[0] ?? fallbackPlayerId;
    }

    return fallbackPlayerId;
  }

  private createReplayMetadata(
    actorPlayerId: string,
    actionType: EventType,
    beforeMove: Coordinates,
    beforeAction: Coordinates,
    afterAction: Coordinates,
  ): VariantBReplayMetadata {
    return {
      actorPlayerId,
      actionType,
      durationMs: 1400,
      keyframes: [
        { timestampMs: 0, ballLocation: beforeMove },
        { timestampMs: 400, ballLocation: beforeAction },
        { timestampMs: 1400, ballLocation: afterAction },
      ],
    };
  }

  private attachVariantBReplayMetadata(
    state: MatchState,
    minute: number,
    metadata: VariantBReplayMetadata,
  ): void {
    const eventIndex = this.findLatestEventIndexForMinute(state, minute);
    if (eventIndex < 0) {
      return;
    }

    const event = state.events[eventIndex];
    event.additionalData = {
      ...(event.additionalData ?? {}),
      variantBReplay: metadata,
    };
  }

  private findLatestEventIndexForMinute(
    state: MatchState,
    minute: number,
  ): number {
    for (let index = state.events.length - 1; index >= 0; index--) {
      if (state.events[index].time === minute) {
        return index;
      }
    }

    return -1;
  }

  private findPlayerById(playerId: string, players: Player[]): Player | null {
    return players.find((player) => player.id === playerId) ?? null;
  }

  private resolveLooseBallScramble(
    location: Coordinates,
    currentTeam: TeamSide,
    opponentPlayers: Player[],
    teamPlayers: Player[],
    defenderBias: number,
  ): { winner: Player; winnerTeam: TeamSide; decisions: ScrambleCandidateDecision[] } {
    const homeTeamSide = TeamSide.HOME;
    const awayTeamSide = TeamSide.AWAY;

    if (!this.activeMatchShape) {
      const homeTeamSide = currentTeam;
      const awayTeamSide = currentTeam === TeamSide.HOME ? TeamSide.AWAY : TeamSide.HOME;
      const att = teamPlayers.filter(p => p.position !== PositionEnum.GK);
      const def = opponentPlayers.filter(p => p.position !== PositionEnum.GK);
      const randAtt = att[Math.floor(this.rng.random() * att.length)] ?? teamPlayers[0];
      const randDef = def[Math.floor(this.rng.random() * def.length)] ?? opponentPlayers[0];
      
      const isDefendingWinner = this.rng.random() * 100 < (defenderBias > 15 ? 80 : 60);
      if (isDefendingWinner) {
        return { winner: randDef, winnerTeam: awayTeamSide, decisions: [] };
      } else {
        return { winner: randAtt, winnerTeam: homeTeamSide, decisions: [] };
      }
    }

    const candidates: { player: Player; teamSide: TeamSide; score: number; distance: number }[] = [];

    const checkSlots = [
      ...this.activeMatchShape.home.map(s => ({ ...s, teamSide: homeTeamSide })),
      ...this.activeMatchShape.away.map(s => ({ ...s, teamSide: awayTeamSide }))
    ];

    for (const slot of checkSlots) {
      if (!slot.playerId) continue;

      const playerList = slot.teamSide === currentTeam ? teamPlayers : opponentPlayers;
      const player = this.findPlayerById(slot.playerId, playerList);
      if (!player || player.position === PositionEnum.GK) continue;

      const dx = slot.coordinates.x - location.x;
      const dy = slot.coordinates.y - location.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const proximityScore = Math.max(0, 30 - distance) * 2.0;
      const attributesScore =
        this.getPlayerStat(player, 'speed') * 0.4 +
        this.getPlayerStat(player, 'determination') * 0.3 +
        this.getPlayerStat(player, 'strength') * 0.3;

      const bias = slot.teamSide !== currentTeam ? defenderBias : 0;
      const score = proximityScore + attributesScore + bias;

      candidates.push({ player, teamSide: slot.teamSide, score, distance });
    }

    if (candidates.length === 0) {
      return { winner: teamPlayers[0], winnerTeam: currentTeam, decisions: [] };
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    const T = 12.0;
    const maxScore = candidates[0].score;
    const weights = candidates.map(c => Math.exp((c.score - maxScore) / T));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    let roll = this.rng.random() * totalWeight;
    let winnerIndex = 0;
    for (let i = 0; i < candidates.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        winnerIndex = i;
        break;
      }
    }

    const decisions = candidates.map((c, i) => ({
      playerId: c.player.id,
      playerName: c.player.name,
      teamSide: c.teamSide === TeamSide.HOME ? 'Home' as const : 'Away' as const,
      distance: c.distance,
      score: c.score,
      probability: totalWeight > 0 ? weights[i] / totalWeight : 0,
    }));

    const winner = candidates[winnerIndex];
    return { winner: winner.player, winnerTeam: winner.teamSide, decisions };
  }

  private createTurnoverEvent(
    state: MatchState,
    eventType: EventType.TACKLE | EventType.INTERCEPTION,
    currentLocation: Coordinates,
    currentTeam: TeamSide,
    opponentPlayers: Player[],
    losingPlayerId: string,
    minute: number,
    success: boolean,
    config: SimulationConfig,
    additionalData?: PlayByPlayEventAdditionalData,
    predeterminedWinnerId?: string,
  ): string {
    const defendingTeamSide =
      currentTeam === TeamSide.HOME ? TeamSide.AWAY : TeamSide.HOME;
    const isGKAllowed =
      (defendingTeamSide === TeamSide.HOME && currentLocation.y <= 18) ||
      (defendingTeamSide === TeamSide.AWAY && currentLocation.y >= 82);

    const eligibleOpponentPlayers = isGKAllowed
      ? opponentPlayers
      : opponentPlayers.filter((p) => p.position !== PositionEnum.GK);

    const result = this.selectTurnoverWinner(
      eventType,
      currentLocation,
      currentTeam,
      eligibleOpponentPlayers,
    );

    const turnoverWinnerId = predeterminedWinnerId ?? result.winner?.id ?? this.getRandomPlayerId(eligibleOpponentPlayers);

    const mergedAdditionalData: PlayByPlayEventAdditionalData = {
      ...additionalData,
    };

    if (eventType === EventType.TACKLE) {
      mergedAdditionalData.tackleDecisions = result.decisions;
    } else if (eventType === EventType.INTERCEPTION) {
      mergedAdditionalData.interceptionDecisions = result.decisions;
    }

    this.createEvent(
      state,
      eventType,
      [turnoverWinnerId, losingPlayerId],
      { ...currentLocation },
      minute,
      success,
      config,
      mergedAdditionalData,
    );

    return turnoverWinnerId;
  }

  private selectTurnoverWinner(
    eventType: EventType.TACKLE | EventType.INTERCEPTION,
    currentLocation: Coordinates,
    currentTeam: TeamSide,
    opponentPlayers: Player[],
  ): { winner: Player | null; decisions: TackleCandidateDecision[] } {
    const seenPlayerIds = new Set<string>();
    const context = this.getDefendingShapeContextForLocation(
      currentLocation,
      currentTeam,
    );
    const defendingTeam =
      currentTeam === TeamSide.HOME ? TeamSide.AWAY : TeamSide.HOME;

    const allDecisions: TackleCandidateDecision[] = [];

    const getRankedCandidatesForSlots = (slots: ActiveShapeSlot[]) => {
      return slots
        .filter(
          (slot): slot is ActiveShapeSlot & { playerId: string } =>
            typeof slot.playerId === "string" &&
            !seenPlayerIds.has(slot.playerId),
        )
        .map((slot) => {
          seenPlayerIds.add(slot.playerId);
          const player = this.findPlayerById(slot.playerId, opponentPlayers);
          if (!player) return null;

          const distance = this.fieldService.getDistance(
            currentLocation,
            slot.coordinates,
          );
          const score = this.scoreTurnoverWinnerCandidate(player, eventType, distance);
          return { player, distance, score };
        })
        .filter((c): c is { player: Player; distance: number; score: number } => c !== null)
        .sort((left, right) => {
          const scoreDelta = right.score - left.score;
          if (scoreDelta !== 0) return scoreDelta;
          const distanceDelta = left.distance - right.distance;
          if (distanceDelta !== 0) return distanceDelta;
          return left.player.id.localeCompare(right.player.id);
        });
    };

    let winner: Player | null = null;

    const channelCand = getRankedCandidatesForSlots(context?.channelSlots ?? []);
    channelCand.forEach(c => allDecisions.push({ playerId: c.player.id, playerName: c.player.name, distance: c.distance, score: c.score }));
    if (channelCand.length > 0 && !winner) winner = channelCand[0].player;

    const centralCand = getRankedCandidatesForSlots(context?.centralSlots ?? []);
    centralCand.forEach(c => allDecisions.push({ playerId: c.player.id, playerName: c.player.name, distance: c.distance, score: c.score }));
    if (centralCand.length > 0 && !winner) winner = centralCand[0].player;

    const staffedCand = getRankedCandidatesForSlots(context?.staffedZoneSlots ?? []);
    staffedCand.forEach(c => allDecisions.push({ playerId: c.player.id, playerName: c.player.name, distance: c.distance, score: c.score }));
    if (staffedCand.length > 0 && !winner) winner = staffedCand[0].player;

    const fallbackCand = getRankedCandidatesForSlots(this.activeMatchShape?.[defendingTeam] ?? []);
    fallbackCand.forEach(c => allDecisions.push({ playerId: c.player.id, playerName: c.player.name, distance: c.distance, score: c.score }));
    if (fallbackCand.length > 0 && !winner) winner = fallbackCand[0].player;

    // Sort all decisions by score descending
    allDecisions.sort((a, b) => b.score - a.score);

    return { winner, decisions: allDecisions };
  }

  private scoreTurnoverWinnerCandidate(
    player: Player,
    eventType: EventType.TACKLE | EventType.INTERCEPTION,
    distance: number,
  ): number {
    const proximityMultiplier = eventType === EventType.INTERCEPTION ? 5.0 : 2.5;
    const proximityScore = Math.max(0, 30 - distance) * proximityMultiplier;

    if (eventType === EventType.TACKLE) {
      let positionalModifier = 0;
      if (player.position === PositionEnum.ST) {
        positionalModifier = -10;
      }
      return (
        proximityScore +
        this.getPlayerStat(player, 'tackling') +
        this.getPlayerStat(player, 'strength') * 0.5 +
        this.getPlayerStat(player, 'determination') * 0.35 +
        this.getPlayerStat(player, 'speed') * 0.2 +
        positionalModifier
      );
    }

    let positionalModifier = 0;
    if (player.position === PositionEnum.ST) {
      positionalModifier = -25;
    } else if (player.position === PositionEnum.CB || player.position === PositionEnum.CDM) {
      positionalModifier = 5;
    }

    return (
      proximityScore +
      this.getPlayerStat(player, 'vision') +
      this.getPlayerStat(player, 'tackling') * 0.5 +
      this.getPlayerStat(player, 'determination') * 0.35 +
      this.getPlayerStat(player, 'speed') * 0.2 +
      positionalModifier
    );
  }

  private getDistanceToLineSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    
    const ab2 = abx * abx + aby * aby;
    if (ab2 === 0) return Math.sqrt(apx * apx + apy * apy);
    
    let t = (apx * abx + apy * aby) / ab2;
    if (t < 0.0 || t > 1.0) {
       return 999.0;
    }
    t = Math.max(0, Math.min(1, t)); // clamp to line segment
    
    const closestX = ax + t * abx;
    const closestY = ay + t * aby;
    const dx = px - closestX;
    const dy = py - closestY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private getPassInterceptionLocation(
    start: Coordinates,
    target: Coordinates,
    currentTeam: TeamSide,
    opponentPlayers: Player[],
  ): { location: Coordinates; interceptorId: string } {
    const defaultLocation = {
      x: start.x + 0.6 * (target.x - start.x),
      y: start.y + 0.6 * (target.y - start.y),
    };

    if (!this.activeMatchShape) {
      const outfielders = opponentPlayers.filter((p) => p.position !== PositionEnum.GK);
      return {
        location: defaultLocation,
        interceptorId: this.getRandomPlayerId(outfielders.length > 0 ? outfielders : opponentPlayers),
      };
    }

    const defendingTeam = currentTeam === TeamSide.HOME ? TeamSide.AWAY : TeamSide.HOME;
    const defenders = this.activeMatchShape[defendingTeam].filter(s => s.playerId !== null);

    let bestScore = -Infinity;
    let bestT = 0.6; // Default fallback to midpoint
    let bestPlayerId: string | null = null;

    const ax = start.x;
    const ay = start.y;
    const bx = target.x;
    const by = target.y;

    const abx = bx - ax;
    const aby = by - ay;
    const ab2 = abx * abx + aby * aby;

    if (ab2 === 0) {
      const outfielders = opponentPlayers.filter((p) => p.position !== PositionEnum.GK);
      return {
        location: { ...start },
        interceptorId: this.getRandomPlayerId(outfielders.length > 0 ? outfielders : opponentPlayers),
      };
    }

    for (const def of defenders) {
      const player = this.findPlayerById(def.playerId!, opponentPlayers);
      if (!player || player.position === PositionEnum.GK) continue;

      const px = def.coordinates.x;
      const py = def.coordinates.y;

      const apx = px - ax;
      const apy = py - ay;

      const t = (apx * abx + apy * aby) / ab2;

      // Only evaluate defenders whose projection is along the pass path
      if (t >= 0.0 && t <= 1.0) {
        const closestX = ax + t * abx;
        const closestY = ay + t * aby;
        const dx = px - closestX;
        const dy = py - closestY;
        const distToPath = Math.sqrt(dx * dx + dy * dy);

        const proximityScore = Math.max(0, 30 - distToPath) * 5.0;
        let positionalModifier = 0;
        if (player.position === PositionEnum.ST) {
          positionalModifier = -25;
        } else if (player.position === PositionEnum.CB || player.position === PositionEnum.CDM) {
          positionalModifier = 5;
        }

        const attributesScore =
          this.getPlayerStat(player, 'vision') +
          this.getPlayerStat(player, 'tackling') * 0.5 +
          this.getPlayerStat(player, 'determination') * 0.35 +
          this.getPlayerStat(player, 'speed') * 0.2 +
          positionalModifier;

        const score = proximityScore + attributesScore;

        if (score > bestScore) {
          bestScore = score;
          bestT = t;
          bestPlayerId = player.id;
        }
      }
    }

    // Clamp t to prevent the failure location from being exactly at the feet of the passer or target
    const clampedT = Math.max(0.2, Math.min(0.9, bestT));
    const location = {
      x: start.x + clampedT * (target.x - start.x),
      y: start.y + clampedT * (target.y - start.y),
    };

    const outfielders = opponentPlayers.filter((p) => p.position !== PositionEnum.GK);
    const interceptorId =
      bestPlayerId ||
      this.getRandomPlayerId(outfielders.length > 0 ? outfielders : opponentPlayers);

    return { location, interceptorId };
  }

  private scorePassTarget(
    target: Player,
    passer: Player,
    tactics: TacticalSetup,
    currentLocation: Coordinates,
    currentTeam: TeamSide,
    passIntent: PassIntent,
    isTargetOffside: boolean,
  ): { target: Player; score: number; distance: number; breakdown: PassScoreBreakdown } {
    const targetPosition = this.getCurrentPositionForPlayer(
      target,
      currentTeam,
      tactics.formation,
    );
    const distance = this.fieldService.getDistance(
      currentLocation,
      targetPosition,
    );
    const progression =
      currentTeam === TeamSide.HOME
        ? targetPosition.y - currentLocation.y
        : currentLocation.y - targetPosition.y;
    const lateralDistance = Math.abs(targetPosition.x - currentLocation.x);
    const centrality = 50 - Math.abs(targetPosition.x - 50);

    let score = 0;
    const targetGroup = getPositionGroup(target.position);

    if (passIntent === PASS_INTENT.RECYCLE) {
      score += (34 - Math.min(distance, 34)) * 2.2;
      score -= Math.max(0, progression - 6) * 1.2;
      score -= Math.max(0, -progression) * 0.3;
      score -= Math.max(0, lateralDistance - 24) * 0.3;
      if (targetGroup === 'DEF' || targetGroup === 'MID') {
        score += 7;
        if (target.position === PositionEnum.CDM || target.position === PositionEnum.CB) {
          score += 1.0;
        }
        if (target.position === PositionEnum.CAM) {
          score -= 3.0;
        }
      }
    } else if (passIntent === PASS_INTENT.PROGRESSION) {
      score += Math.max(0, progression) * 1.7;
      score -= Math.max(0, distance - 26) * 0.7;
      score -= Math.max(0, -progression) * 2.5;
      if (targetGroup === 'MID') {
        score += 4;
        if (target.position === PositionEnum.CAM) {
          score += 1.0;
        }
      }
      if (targetGroup === 'FWD') {
        score += 3;
        if (target.position === PositionEnum.WNG) {
          score += 1.0;
        }
      }
      if (target.position === PositionEnum.FB && progression > 0) {
        score += 3.0;
        const attackingY = currentTeam === TeamSide.HOME ? currentLocation.y : 100 - currentLocation.y;
        if (attackingY < 45) {
          score += 5.0; // FB build-up outlet boost
          const distancePenalty = Math.max(0, distance - 26) * 0.7;
          score += distancePenalty * 0.55; // Offset distance penalty
        }
      }
    } else if (passIntent === PASS_INTENT.THROUGH_BALL) {
      score += Math.max(0, progression) * 2.2;
      score -= Math.max(0, 14 - progression) * 1.5;
      score -= Math.max(0, distance - 32) * 0.8;
      if (targetGroup === 'FWD') {
        score += 10;
        if (target.position === PositionEnum.ST) {
          score += 1.5;
        }
      } else if (target.position === PositionEnum.CAM) {
        score += 3.0;
      }
    } else {
      score += Math.max(0, progression) * 1.3;
      score += centrality * 0.35;
      score -= Math.max(0, distance - 30) * 0.6;
      if (targetGroup === 'FWD') {
        score += 8;
        if (target.position === PositionEnum.ST) {
          score += 2.0;
        } else {
          score -= 1.0;
        }
      } else if (target.position === PositionEnum.CAM) {
        score += 4.0;
      }
    }

    const base = score;
    let style = 0;
    let flank = 0;
    let block = 0;
    let offside = 0;

    if (
      tactics.playingStyle === PlayingStyle.POSSESSION &&
      passIntent !== PASS_INTENT.THROUGH_BALL
    ) {
      style += (34 - Math.min(distance, 34)) * 0.2;
    }

    if (
      tactics.playingStyle === PlayingStyle.COUNTER_ATTACK &&
      passIntent !== PASS_INTENT.RECYCLE
    ) {
      style += Math.max(0, progression) * 0.35;
    }

    if (target.position === PositionEnum.GK) {
      const keeperRecycleAllowed = this.isGoalkeeperRecycleTargetAllowed(
        passer,
        currentLocation,
        currentTeam,
        passIntent,
      );
      style += keeperRecycleAllowed ? 2 : -6;
    }
    score += style;

    // Spread play and flank progression boosts for wide players
    const passerIsCentral = Math.abs(currentLocation.x - 50) <= 20;
    const targetIsWide = Math.abs(targetPosition.x - 50) >= 20;
    
    if (targetIsWide && (target.position === PositionEnum.WNG || target.position === PositionEnum.FB)) {
      if (passerIsCentral) {
        flank += 6.5;
        const baseDistanceLimit = passIntent === PASS_INTENT.THROUGH_BALL ? 32 : 26;
        const distCoeff = passIntent === PASS_INTENT.THROUGH_BALL ? 0.8 : 0.7;
        const distPenalty = Math.max(0, distance - baseDistanceLimit) * distCoeff;
        flank += distPenalty * 0.45;
      } else {
        // Passer is wide. If target is wide on the same side:
        const sameFlank = (currentLocation.x - 50) * (targetPosition.x - 50) > 0;
        if (sameFlank && target.position === PositionEnum.WNG) {
          flank += 5.0;
        }
      }
    }
    score += flank;

    // Apply passing-lane blocking penalty for defenders in line of sight
    const defendingTeam = currentTeam === TeamSide.HOME ? TeamSide.AWAY : TeamSide.HOME;
    if (this.activeMatchShape && this.activeMatchShape[defendingTeam]) {
      const defenders = this.activeMatchShape[defendingTeam].filter(s => s.playerId !== null);
      for (const def of defenders) {
        const distToPath = this.getDistanceToLineSegment(
          def.coordinates.x,
          def.coordinates.y,
          currentLocation.x,
          currentLocation.y,
          targetPosition.x,
          targetPosition.y
        );
        if (distToPath < 4.5) {
          const proximityPenalty = (4.5 - distToPath) * 3.5;
          block -= proximityPenalty;
          score -= proximityPenalty;
        }
      }
    }
    // Apply offside awareness penalty (better passer vision/passing reduces chance of selecting offside target)
    if (isTargetOffside) {
      const vision = this.getPlayerStat(passer, 'vision');
      const offsidePenalty = vision <= 40
        ? 0
        : Math.pow(vision - 40, 2) * 0.08 + 10.0;
      offside -= offsidePenalty;
      score -= offsidePenalty;
    }

    return {
      target,
      score,
      distance,
      breakdown: { base, style, flank, block, offside }
    };
  }

  private findPassTarget(
    passer: Player,
    teamPlayers: Player[],
    tactics: TacticalSetup,
    currentLocation: Coordinates,
    currentTeam: TeamSide,
    passIntent: PassIntent,
  ): Player | null {
    const potentialTargets = teamPlayers.filter(
      (player) => player.id !== passer.id && player.role === Role.STARTER,
    );

    if (potentialTargets.length === 0) {
      return null;
    }

    // Pre-calculate offside player IDs once to make lookup O(1) inside target scoring loop
    const offsidePlayerIds = new Set<string>();
    if (this.activeMatchShape) {
      const defendingTeam = currentTeam === TeamSide.HOME ? TeamSide.AWAY : TeamSide.HOME;
      const defenders = this.activeMatchShape[defendingTeam].filter(s => s.playerId !== null);
      if (defenders.length >= 2) {
        const defenderAttY = defenders.map(s =>
          currentTeam === TeamSide.HOME ? s.coordinates.y : 100 - s.coordinates.y
        );
        defenderAttY.sort((a, b) => b - a);
        const offsideLine = defenderAttY[1];
        const ballAttY = currentTeam === TeamSide.HOME ? currentLocation.y : 100 - currentLocation.y;
        const offsideThresholdY = Math.max(50, ballAttY, offsideLine);

        const attackers = this.activeMatchShape[currentTeam];
        for (const slot of attackers) {
          if (slot.playerId && slot.preferredPosition !== PositionEnum.GK) {
            const attackerAttY = currentTeam === TeamSide.HOME ? slot.coordinates.y : 100 - slot.coordinates.y;
            if (attackerAttY > offsideThresholdY) {
              offsidePlayerIds.add(slot.playerId);
            }
          }
        }
      }
    }

    const scoredTargets = potentialTargets
      .map((target) =>
        this.scorePassTarget(
          target,
          passer,
          tactics,
          currentLocation,
          currentTeam,
          passIntent,
          offsidePlayerIds.has(target.id),
        ),
      )
      .sort((left, right) => {
        if (right.score === left.score) {
          return left.distance - right.distance;
        }

        return right.score - left.score;
      });

    if (scoredTargets.length === 0) {
      return null;
    }

    const topCandidates = scoredTargets.slice(
      0,
      Math.min(5, scoredTargets.length),
    );

    // Save details about all candidates' pass decisions for the debug trace
    const playerRoles = new Map<string, string>();
    if (tactics.formation && tactics.formation.positions) {
      for (const pos of tactics.formation.positions) {
        playerRoles.set(pos.playerId, pos.role);
      }
    }

    const decisions: PassCandidateDecision[] = [];
    const probabilities = new Map<string, number>();

    let pickedTarget: Player;
    let weightedCandidates: { target: Player; weight: number }[] = [];

    if (topCandidates.length === 1) {
      probabilities.set(topCandidates[0].target.id, 1.0);
      pickedTarget = topCandidates[0].target;
    } else {
      // Temperature T controls selection randomness (lower = more deterministic, higher = more random/varied).
      const T = 12.0;
      
      // Subtract maxScore to avoid floating-point overflow with Math.exp
      const maxScore = topCandidates[0].score;
      
      weightedCandidates = topCandidates.map((candidate) => {
        const weight = Math.exp((candidate.score - maxScore) / T);
        return {
          target: candidate.target,
          weight,
        };
      });

      const totalWeight = weightedCandidates.reduce(
        (sum, entry) => sum + entry.weight,
        0,
      );

      if (totalWeight > 0) {
        for (const candidate of weightedCandidates) {
          probabilities.set(candidate.target.id, candidate.weight / totalWeight);
        }
      } else {
        probabilities.set(topCandidates[0].target.id, 1.0);
      }

      pickedTarget = this.pickWeightedTarget(weightedCandidates) ?? topCandidates[0].target;
    }

    for (const scored of scoredTargets) {
      const target = scored.target;
      const isOffside = offsidePlayerIds.has(target.id);
      const role = playerRoles.get(target.id) ?? target.position;
      decisions.push({
        playerId: target.id,
        playerName: target.name,
        role,
        score: scored.score,
        distance: scored.distance,
        probability: probabilities.get(target.id) ?? 0,
        isTargetOffside: isOffside,
        breakdown: scored.breakdown
      });
    }

    this.lastPassDecisions = decisions;

    return pickedTarget;
  }

  private isGoalkeeperRecycleTargetAllowed(
    passer: Player,
    currentLocation: Coordinates,
    currentTeam: TeamSide,
    passIntent: PassIntent,
  ): boolean {
    if (passIntent !== PASS_INTENT.RECYCLE) {
      return false;
    }

    const passerGroup = getPositionGroup(passer.position);
    if (
      passerGroup !== 'DEF' &&
      passerGroup !== 'MID'
    ) {
      return false;
    }

    const attackingY =
      currentTeam === TeamSide.HOME
        ? currentLocation.y
        : 100 - currentLocation.y;

    // Build-from-back recycle only; never use keeper as a forward outlet.
    return attackingY <= 58;
  }

  private pickWeightedTarget(
    candidates: { target: Player; weight: number }[],
  ): Player | null {
    const totalWeight = candidates.reduce(
      (sum, entry) => sum + Math.max(0, entry.weight),
      0,
    );
    if (totalWeight <= 0) {
      return candidates[0]?.target ?? null;
    }

    let roll = this.rng.random() * totalWeight;

    for (const entry of candidates) {
      roll -= Math.max(0, entry.weight);
      if (roll <= 0) {
        return entry.target;
      }
    }

    return candidates[candidates.length - 1]?.target ?? null;
  }

  private calculateNewBallPosition(
    current: Coordinates,
    target: Coordinates,
  ): Coordinates {
    return {
      x: (current.x + target.x) / 2,
      y: (current.y + target.y) / 2,
    };
  }

  /**
   * Builds the structurally separated rosters from team data.
   * On-field arrays contain only starters (derived from formationAssignments).
   * Bench arrays contain only bench players. Reserves are excluded entirely.
   */
  private buildResolvedRosters(
    homeTeam: Team,
    awayTeam: Team,
  ): ResolvedRosters {
    const buildSide = (team: Team) => {
      const allPlayers = resolveTeamPlayers(team);
      const starterIds = new Set(
        Object.values(team.formationAssignments).filter(
          (id): id is string => id.length > 0,
        ),
      );
      const onField: Player[] = [];
      const bench: Player[] = [];
      for (const player of allPlayers) {
        if (starterIds.has(player.id)) {
          onField.push(
            player.role === Role.STARTER
              ? player
              : { ...player, role: Role.STARTER },
          );
        } else if (player.role === Role.BENCH) {
          bench.push(player);
        }
        // Reserves are excluded — never used during simulation.
      }
      return { onField, bench };
    };

    const home = buildSide(homeTeam);
    const away = buildSide(awayTeam);
    return {
      homePlayers: home.onField,
      awayPlayers: away.onField,
      homeBench: home.bench,
      awayBench: away.bench,
    };
  }

  /**
   * Atomically moves a player from bench to on-field during a substitution.
   * Returns the incoming player, or null if not found on the bench.
   */
  private transferToPitch(
    rosters: ResolvedRosters,
    teamKey: TeamSide,
    incomingId: string,
  ): Player | null {
    const bench =
      teamKey === TeamSide.HOME ? rosters.homeBench : rosters.awayBench;
    const onField =
      teamKey === TeamSide.HOME ? rosters.homePlayers : rosters.awayPlayers;
    const idx = bench.findIndex((player) => player.id === incomingId);
    if (idx < 0) {
      return null;
    }
    const [incoming] = bench.splice(idx, 1);
    incoming.role = Role.STARTER;
    onField.push(incoming);
    return incoming;
  }

  /**
   * Removes a player from the on-field array (injury, dismissal, or substitution out).
   */
  private removeFromPitch(
    rosters: ResolvedRosters,
    teamKey: TeamSide,
    playerId: string,
    newRole: Role,
  ): void {
    const onField =
      teamKey === TeamSide.HOME ? rosters.homePlayers : rosters.awayPlayers;
    const idx = onField.findIndex((player) => player.id === playerId);
    if (idx >= 0) {
      onField[idx].role = newRole;
      onField.splice(idx, 1);
    }
  }

  private getRandomPlayerId(teamPlayers: Player[]): string {
    // teamPlayers contains only on-field starters.
    if (teamPlayers.length === 0) {
      return '';
    }
    return teamPlayers[
      Math.floor(this.rng.random() * teamPlayers.length)
    ].id;
  }

  private createRandomId(): string {
    return this.rng.random().toString(36).substring(2, 9);
  }

  private getCurrentPositionForPlayer(
    player: Player,
    teamSide: TeamSide,
    tacticsFormation: TeamFormation,
  ): Coordinates {
    if (this.activeMatchShape) {
      const slot = this.activeMatchShape[teamSide].find((s) => s.playerId === player.id);
      if (slot) {
        return { ...slot.coordinates };
      }
    }
    return this.fieldService.getStartingPositionForPlayer(player, tacticsFormation);
  }

  private isPlayerOffside(
    playerId: string,
    attackingTeam: TeamSide,
    ballLocation: Coordinates,
  ): boolean {
    if (!this.activeMatchShape) return false;

    const defendingTeam = attackingTeam === TeamSide.HOME ? TeamSide.AWAY : TeamSide.HOME;
    const defenders = this.activeMatchShape[defendingTeam].filter(s => s.playerId !== null);

    if (defenders.length < 2) return false;

    // Get defenders' Y coordinates from attacker's perspective (opponent goal is at 100)
    const defenderAttY = defenders.map(s =>
      attackingTeam === TeamSide.HOME ? s.coordinates.y : 100 - s.coordinates.y
    );

    // Sort descending (highest attY is closest to defender's own goal line)
    defenderAttY.sort((a, b) => b - a);

    // The offside line is the second-last defender (index 1)
    const offsideLine = defenderAttY[1];

    const attackerSlot = this.activeMatchShape[attackingTeam].find(s => s.playerId === playerId);
    if (!attackerSlot) return false;

    const attackerAttY = attackingTeam === TeamSide.HOME
      ? attackerSlot.coordinates.y
      : 100 - attackerSlot.coordinates.y;

    const ballAttY = attackingTeam === TeamSide.HOME
      ? ballLocation.y
      : 100 - ballLocation.y;

    // A player is offside if they are in the opponent's half (Y > 50),
    // ahead of the ball (Y > ballAttY), and ahead of the second-last defender (Y > offsideLine).
    return attackerAttY > 50 && attackerAttY > ballAttY && attackerAttY > offsideLine;
  }

  private updateDynamicPlayerPositions(
    state: MatchState,
    tactics: { home: TacticalSetup; away: TacticalSetup },
    rosters: ResolvedRosters,
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
  ): void {
    if (!this.activeMatchShape) return;

    const ball = state.ballPossession.location;
    const possessionTeamId = state.ballPossession.teamId;

    const sides = [TeamSide.HOME, TeamSide.AWAY];

    for (const side of sides) {
      const isHome = side === TeamSide.HOME;
      const teamTactics = isHome ? tactics.home : tactics.away;
      const inPossession = teamTactics.teamId === possessionTeamId;
      const attackingBias = isHome ? 1 : -1;
      const ownGoalY = isHome ? 0 : 100;

      // Attacking Y perspective (how far forward the ball is from this team's perspective)
      const ballAttY = isHome ? ball.y : 100 - ball.y;
      const ballX = ball.x;

      const slots = this.activeMatchShape[side];
      const formationPositions = teamTactics.formation.positions;
      const playerList = isHome ? rosters.homePlayers : rosters.awayPlayers;

      // 1. Update run progress first (Option B runs)
      for (const slot of slots) {
        if (!slot.playerId) {
          slot.runProgress = 0;
          slot.markingTargetPlayerId = null;
          continue;
        }

        const player = playerList.find(p => p.id === slot.playerId);
        if (!player) continue;

        if (inPossession) {
          slot.markingTargetPlayerId = null; // Can't mark if team is in possession
          
          const targetGroup = getPositionGroup(slot.preferredPosition);
          const isEligibleForRun = targetGroup === 'MID' || targetGroup === 'FWD' || slot.preferredPosition === PositionEnum.FB;

          if (isEligibleForRun && ballAttY >= 40) {
            if (slot.runProgress > 0) {
              // Continue run
              slot.runProgress = Math.min(100, slot.runProgress + 20);
              // Apply small extra fatigue drain for running
              const playerFatigue = fatigue[side].find(f => f.playerId === slot.playerId);
              if (playerFatigue) {
                playerFatigue.fatigueLevel = Math.min(100, playerFatigue.fatigueLevel + 0.04);
              }
            } else {
              // Probability to start a run
              let baseProb = 0.05;
              if (slot.preferredPosition === PositionEnum.WNG) baseProb = 0.12;
              if (slot.preferredPosition === PositionEnum.CAM) baseProb = 0.08;
              if (slot.preferredPosition === PositionEnum.FB) baseProb = 0.06;

              if (state.ballPossession.phase === MatchPhase.COUNTER_ATTACK) {
                baseProb += 0.08;
              }

              const attrSpeed = this.getPlayerStat(player, 'speed') || 70;
              const speedModifier = (attrSpeed - 50) / 100;
              const runRoll = this.rng.random();

              if (runRoll < baseProb + speedModifier * 0.05) {
                slot.runProgress = 20;
              }
            }
          } else {
            // Decay run if ball is too deep
            slot.runProgress = Math.max(0, slot.runProgress - 30);
          }
        } else {
          // Defending: runs reset to 0
          slot.runProgress = 0;
        }
      }

      // 2. Compute dynamic coordinates (Option A Block Shifts + Option B Offsets)
      const dropMidPlayerIds = new Set<string>();
      if (inPossession && ballAttY < 55) {
        const midSlots = slots.filter(slot => slot.playerId && getPositionGroup(slot.preferredPosition) === 'MID');
        const positionOrder: Record<PositionEnum, number> = {
          [PositionEnum.CDM]: 0,
          [PositionEnum.CM]: 1,
          [PositionEnum.CAM]: 2,
          [PositionEnum.GK]: 9,
          [PositionEnum.CB]: 9,
          [PositionEnum.FB]: 9,
          [PositionEnum.WNG]: 9,
          [PositionEnum.ST]: 9
        };
        const sortedMidSlots = [...midSlots].sort((a, b) => {
          const orderA = positionOrder[a.preferredPosition] ?? 99;
          const orderB = positionOrder[b.preferredPosition] ?? 99;
          return orderA - orderB;
        });
        const midsToDropCount = Math.max(1, Math.floor(sortedMidSlots.length / 2));
        for (let i = 0; i < Math.min(midsToDropCount, sortedMidSlots.length); i++) {
          if (sortedMidSlots[i].playerId) {
            dropMidPlayerIds.add(sortedMidSlots[i].playerId!);
          }
        }
      }

      for (const slot of slots) {
        const basePos = formationPositions.find(p => p.slotId === slot.slotId);
        if (!basePos) continue;

        const baseCoords = basePos.coordinates;
        const baseGroup = getPositionGroup(slot.preferredPosition);

        let newX = baseCoords.x;
        let newY = baseCoords.y;

        if (inPossession) {
          // Attacking: entire block slides forward based on ball Y progression
          const progressionRatio = ballAttY / 100;

          if (slot.preferredPosition === PositionEnum.GK) {
            // Goalkeeper Y starts from ownGoalY (which is always absolute own goal)
            newY = ownGoalY + attackingBias * (5 + ballAttY * 0.10);
            newY = this.clamp(newY, isHome ? 2 : 83, isHome ? 17 : 98);
          } else {
            let pushFactor = 0;
            if (baseGroup === 'DEF') {
              pushFactor = 15; // defenders push up
            } else if (baseGroup === 'MID') {
              pushFactor = 18; // midfielders push up
            } else if (baseGroup === 'FWD') {
              pushFactor = 12; // forwards push up
            }

            const blockShiftY = progressionRatio * pushFactor * attackingBias;
            newY += blockShiftY;

            // Midfielders dropping deep to support build-up
            if (slot.playerId && dropMidPlayerIds.has(slot.playerId)) {
              const dropDistance = 22 * (1 - ballAttY / 55);
              newY -= dropDistance * attackingBias;
            }

            // Dynamic Build-up Spacing (Split CBs and wide FBs during BUILD_UP)
            if (state.ballPossession.phase === MatchPhase.BUILD_UP && ballAttY < 40) {
              const buildUpProgress = ballAttY / 40;
              const spreadFactor = 1 - buildUpProgress;

              if (slot.preferredPosition === PositionEnum.CB) {
                if (basePos.coordinates.x < 50) {
                  newX -= 8 * spreadFactor * attackingBias;
                } else {
                  newX += 8 * spreadFactor * attackingBias;
                }
              } else if (slot.preferredPosition === PositionEnum.FB) {
                if (basePos.coordinates.x < 50) {
                  if (isHome) {
                    newX = Math.max(5, newX - 6 * spreadFactor);
                  } else {
                    newX = Math.min(95, newX + 6 * spreadFactor);
                  }
                } else {
                  if (isHome) {
                    newX = Math.min(95, newX + 6 * spreadFactor);
                  } else {
                    newX = Math.max(5, newX - 6 * spreadFactor);
                  }
                }
                newY += 4 * attackingBias * spreadFactor;
              }
            }

            // Wing overlap & opposite fullback tuck-in
            const isWideFlank = Math.abs(ballX - 50) >= 18;
            if (isWideFlank) {
              const ballOnLeft = ballX < 50;
              const slotOnLeft = basePos.coordinates.x < 50;
              
              if (slot.preferredPosition === PositionEnum.FB || slot.preferredPosition === PositionEnum.WNG) {
                if (ballOnLeft === (isHome ? slotOnLeft : !slotOnLeft)) {
                  // Ball side FB/WNG pushes high
                  newY += 10 * attackingBias;
                } else if (slot.preferredPosition === PositionEnum.FB) {
                  // Opposite FB tucks inside to cover center
                  newX = 50 + (baseCoords.x - 50) * 0.7;
                }
              }
            }

            // Option B Individual Attacking Run Offset
            if (slot.runProgress > 0) {
              const runOffset = (slot.runProgress / 100) * 10 * attackingBias;
              newY += runOffset;
            }
          }
        } else {
          // Defending: block compacts laterally and drops back relative to the ball
          if (slot.preferredPosition !== PositionEnum.GK) {
            // Lateral compaction (X-axis) - reduced during counter attack
            const compactionFactor = state.ballPossession.phase === MatchPhase.COUNTER_ATTACK ? 0.94 : 0.90;
            newX = 50 + (baseCoords.x - 50) * compactionFactor;

            // Y-axis drop back/compression
            const defensiveLineDrop = (100 - ballAttY) * 0.10 * attackingBias;
            newY -= defensiveLineDrop;

            // Option B Defensive Run Tracking (Defenders track opponent runs)
            const opponentSide = isHome ? TeamSide.AWAY : TeamSide.HOME;
            const activeOpponentRuns = this.activeMatchShape[opponentSide].filter(s => s.playerId && s.runProgress > 30);
            
            let closestOpponent: ActiveShapeSlot | null = null;
            let minDistance = Number.MAX_VALUE;

            for (const oppSlot of activeOpponentRuns) {
              const dist = this.fieldService.getDistance(baseCoords, oppSlot.coordinates);
              if (dist < minDistance && dist < 22) { // must be within marking radius
                minDistance = dist;
                closestOpponent = oppSlot;
              }
            }

            if (closestOpponent) {
              // Drag defender towards runner by 40% of the distance
              newX = newX + (closestOpponent.coordinates.x - newX) * 0.40;
              newY = newY + (closestOpponent.coordinates.y - newY) * 0.40;
              slot.markingTargetPlayerId = closestOpponent.playerId;
            } else {
              slot.markingTargetPlayerId = null;
            }
          }
        }

        // Apply dynamic space-seeking repulsion for attackers & positional marking for defenders (in absolute coordinates)
        let targetX = newX;
        let targetY = newY;

        if (slot.preferredPosition !== PositionEnum.GK) {
          const opponentSide = isHome ? TeamSide.AWAY : TeamSide.HOME;
          if (inPossession) {
            // Attacking: Repulse away from closest defender within 8 yards to find space
            const defenders = this.activeMatchShape[opponentSide].filter(s => s.playerId !== null);
            let closestDef: ActiveShapeSlot | null = null;
            let minDistance = 999;
            for (const def of defenders) {
              const dist = this.fieldService.getDistance({ x: targetX, y: targetY }, def.coordinates);
              if (dist < minDistance) {
                minDistance = dist;
                closestDef = def;
              }
            }
            if (closestDef && minDistance < 8.0) {
              const repulseFactor = (8.0 - minDistance) * 0.35;
              const dx = targetX - closestDef.coordinates.x;
              const dy = targetY - closestDef.coordinates.y;
              const len = Math.sqrt(dx * dx + dy * dy) || 1;
              targetX += (dx / len) * repulseFactor;
              targetY += (dy / len) * repulseFactor;
            }
          } else {
            // Defending: Attract towards closest attacker within 12 yards to mark them
            const attackers = this.activeMatchShape[opponentSide].filter(s => s.playerId !== null && s.preferredPosition !== PositionEnum.GK);
            let closestAtt: ActiveShapeSlot | null = null;
            let minDistance = 999;
            for (const att of attackers) {
              const dist = this.fieldService.getDistance({ x: targetX, y: targetY }, att.coordinates);
              if (dist < minDistance) {
                minDistance = dist;
                closestAtt = att;
              }
            }
            if (closestAtt && minDistance < 12.0) {
              const attractFactor = (12.0 - minDistance) * 0.22;
              const dx = closestAtt.coordinates.x - targetX;
              const dy = closestAtt.coordinates.y - targetY;
              const len = Math.sqrt(dx * dx + dy * dy) || 1;
              targetX += (dx / len) * attractFactor;
              targetY += (dy / len) * attractFactor;
            }
          }
        }

        const lastEvent = state.events[state.events.length - 1];
        const isFreeKickOrOffside = lastEvent && (
          lastEvent.type === EventType.FOUL ||
          (lastEvent.additionalData && lastEvent.additionalData.isOffside === true)
        );

        // Pull offside attackers back onside on a new possession (passes === 0) only for free kicks and offsides
        if (inPossession && state.ballPossession.passes === 0 && isFreeKickOrOffside && slot.preferredPosition !== PositionEnum.GK) {
          const defendingTeam = isHome ? TeamSide.AWAY : TeamSide.HOME;
          const defenders = this.activeMatchShape[defendingTeam].filter(s => s.playerId !== null);
          if (defenders.length >= 2) {
            const defenderAttY = defenders.map(s =>
              isHome ? s.coordinates.y : 100 - s.coordinates.y
            );
            defenderAttY.sort((a, b) => b - a);
            const offsideLine = defenderAttY[1];
            const ballAttY = isHome ? ball.y : 100 - ball.y;
            const limitAttY = Math.max(offsideLine, ballAttY);
            const attackerAttY = isHome ? targetY : 100 - targetY;
            if (attackerAttY > 50 && attackerAttY > limitAttY) {
              const adjustedAttY = limitAttY - 0.5;
              targetY = isHome ? adjustedAttY : 100 - adjustedAttY;
            }
          }
        }

        // Dynamic Offside Pullback: keep attackers onside during open play unless they are actively making a run
        if (inPossession && slot.preferredPosition !== PositionEnum.GK && slot.runProgress === 0) {
          const defendingTeam = isHome ? TeamSide.AWAY : TeamSide.HOME;
          const defenders = this.activeMatchShape[defendingTeam].filter(s => s.playerId !== null);
          if (defenders.length >= 2) {
            const defenderAttY = defenders.map(s =>
              isHome ? s.coordinates.y : 100 - s.coordinates.y
            );
            defenderAttY.sort((a, b) => b - a);
            const offsideLine = defenderAttY[1];
            const ballAttY = isHome ? ball.y : 100 - ball.y;
            const limitAttY = Math.max(50, ballAttY, offsideLine) - 1.2;
            const attackerAttY = isHome ? targetY : 100 - targetY;
            if (attackerAttY > limitAttY) {
              targetY = isHome ? limitAttY : 100 - limitAttY;
            }
          }
        }

        // Clamp positions to field boundaries in absolute space
        targetX = this.clamp(targetX, 2, 98);
        targetY = this.clamp(targetY, isHome ? 2 : 0, isHome ? 100 : 98);

        // Smoothly interpolate coordinate shifts to model movement lag / transition time
        const prevX = slot.coordinates.x;
        const prevY = slot.coordinates.y;

        const isKickoff = ball.x === 50 && ball.y === 50 && state.ballPossession.passes === 0;
        const isNewPossession = inPossession && state.ballPossession.passes === 0 && isFreeKickOrOffside;
        if (isKickoff || (prevX === 0 && prevY === 0) || isNewPossession) {
          slot.coordinates.x = targetX;
          slot.coordinates.y = targetY;
        } else {
          // Attacking transition is faster, defensive transition is smoother
          const interpRate = inPossession ? 0.70 : 0.30;
          slot.coordinates.x = prevX + (targetX - prevX) * interpRate;
          slot.coordinates.y = prevY + (targetY - prevY) * interpRate;
        }
        
        // Update slot zone based on current Y
        const relativeY = isHome ? slot.coordinates.y : 100 - slot.coordinates.y;
        slot.zone = this.fieldService.getZoneFromY(relativeY);
      }
    }
  }

  private initializeMatchShape(
    homeTeam: Team,
    awayTeam: Team,
  ): MatchShapeState {
    return {
      home: this.buildShapeSlots(homeTeam, false),
      away: this.buildShapeSlots(awayTeam, true),
    };
  }

  private buildShapeSlots(team: Team, isAway: boolean): ActiveShapeSlot[] {
    // Match-time shape starts from the saved formation assignments, then diverges in-memory after dismissals and tactical rebalances.
    return this.fieldService.getFormationSlots(team).map((slot) => {
      const coordinates = isAway
        ? { x: 100 - slot.coordinates.x, y: 100 - slot.coordinates.y }
        : { ...slot.coordinates };
      return {
        slotId: slot.slotId,
        playerId: team.formationAssignments[slot.slotId] || null,
        coordinates,
        zone: slot.zone,
        role: slot.label,
        preferredPosition: slot.position,
        runProgress: 0,
        markingTargetPlayerId: null,
      };
    });
  }

  private checkForfeitCondition(): TeamSide | null {
    if (!this.activeMatchShape) {
      return null;
    }

    if (this.getOnFieldPlayerCount(this.activeMatchShape.home) < 7) {
      return TeamSide.HOME;
    }

    if (this.getOnFieldPlayerCount(this.activeMatchShape.away) < 7) {
      return TeamSide.AWAY;
    }

    return null;
  }

  private getOnFieldPlayerCount(shape: ActiveShapeSlot[]): number {
    return shape.filter((slot) => slot.playerId !== null).length;
  }

  private calculateShapePressureModifier(
    state: MatchState,
    currentTeam: TeamSide,
  ): number {
    const context = this.getDefendingShapeContext(state, currentTeam);
    if (!context || context.zoneSlots.length === 0) {
      return 0;
    }

    let modifier = 0;

    // Undermanned defensive lines should press less effectively in the active band.
    modifier -= (1 - context.zoneCoverage) * 0.16;

    if (context.channelSlots.length === 0) {
      modifier -= context.wideChannel ? 0.06 : 0.05;
    } else if (context.channelSlots.length >= 2) {
      modifier += 0.015;
    }

    return modifier;
  }

  private calculateCarryShapeModifier(
    state: MatchState,
    currentTeam: TeamSide,
  ): number {
    const context = this.getDefendingShapeContext(state, currentTeam);
    if (!context) {
      return 0;
    }

    let modifier = (1 - context.zoneCoverage) * 0.06;

    if (context.channelSlots.length === 0) {
      modifier += context.wideChannel ? 0.025 : 0.03;
    }

    if (context.centralSlots.length === 0 && !context.wideChannel) {
      modifier += 0.025;
    }

    return modifier;
  }

  private calculateShotShapeModifier(
    state: MatchState,
    currentTeam: TeamSide,
  ): { onTargetBonus: number; goalChanceBonus: number } {
    const context = this.getDefendingShapeContext(state, currentTeam);
    if (!context) {
      return { onTargetBonus: 0, goalChanceBonus: 0 };
    }

    const zoneGap = 1 - context.zoneCoverage;
    let onTargetBonus = zoneGap * 0.035;
    let goalChanceBonus = zoneGap * 0.04;

    if (context.channelSlots.length === 0) {
      onTargetBonus += context.wideChannel ? 0.02 : 0.015;
      goalChanceBonus += context.wideChannel ? 0.015 : 0.02;
    }

    if (!context.wideChannel && context.centralSlots.length === 0) {
      goalChanceBonus += 0.025;
    }

    return { onTargetBonus, goalChanceBonus };
  }

  private getDefendingShapeContext(
    state: MatchState,
    currentTeam: TeamSide,
  ): {
    zoneSlots: ActiveShapeSlot[];
    staffedZoneSlots: ActiveShapeSlot[];
    zoneCoverage: number;
    wideChannel: boolean;
    channelSlots: ActiveShapeSlot[];
    centralSlots: ActiveShapeSlot[];
  } | null {
    if (!this.activeMatchShape) {
      return null;
    }

    return this.getDefendingShapeContextForLocation(
      state.ballPossession.location,
      currentTeam,
    );
  }

  private getDefendingShapeContextForLocation(
    location: Coordinates,
    currentTeam: TeamSide,
  ): {
    zoneSlots: ActiveShapeSlot[];
    staffedZoneSlots: ActiveShapeSlot[];
    zoneCoverage: number;
    wideChannel: boolean;
    channelSlots: ActiveShapeSlot[];
    centralSlots: ActiveShapeSlot[];
  } | null {
    if (!this.activeMatchShape) {
      return null;
    }

    // Evaluate coverage from the defending side's perspective so depleted lines and empty channels soften resistance naturally.
    const defendingTeam =
      currentTeam === TeamSide.HOME ? TeamSide.AWAY : TeamSide.HOME;
    const defendingShape = this.activeMatchShape[defendingTeam];
    const relativeY = currentTeam === TeamSide.HOME ? location.y : 100 - location.y;
    const zone = this.fieldService.getZoneFromY(relativeY);
    const defendingZone = this.resolveDefendingShapeZone(zone);
    const zoneSlots = defendingShape.filter(
      (slot) => slot.zone === defendingZone,
    );
    const staffedZoneSlots = zoneSlots.filter((slot) => slot.playerId !== null);

    if (zoneSlots.length === 0) {
      return null;
    }

    const wideChannel = Math.abs(location.x - 50) >= 18;
    const channelSlots = staffedZoneSlots.filter((slot) =>
      this.isSlotRelevantToBallChannel(slot, location.x, wideChannel),
    );
    const centralSlots = staffedZoneSlots.filter(
      (slot) => Math.abs(slot.coordinates.x - 50) <= 16,
    );

    return {
      zoneSlots,
      staffedZoneSlots,
      zoneCoverage: staffedZoneSlots.length / zoneSlots.length,
      wideChannel,
      channelSlots,
      centralSlots,
    };
  }

  private resolveDefendingShapeZone(
    zone: FieldZone,
  ): FieldZone {
    if (zone === FieldZone.DEFENSE) {
      return FieldZone.ATTACK;
    }

    if (zone === FieldZone.ATTACK) {
      return FieldZone.DEFENSE;
    }

    return FieldZone.MIDFIELD;
  }

  private isSlotRelevantToBallChannel(
    slot: ActiveShapeSlot,
    ballX: number,
    wideChannel: boolean,
  ): boolean {
    const slotOffset = Math.abs(slot.coordinates.x - 50);

    if (!wideChannel) {
      return slotOffset <= 18;
    }

    if (ballX < 50) {
      return slot.coordinates.x <= 42;
    }

    return slot.coordinates.x >= 58;
  }

  private applyForfeitScoreline(
    state: MatchState,
    forfeitingTeam: TeamSide,
    minute: number,
    homeTeamId: string,
    awayTeamId: string,
  ): MatchState {
    const homeForfeits = forfeitingTeam === TeamSide.HOME;

    return {
      ...state,
      currentMinute: minute,
      events: [],
      homeScore: homeForfeits ? 0 : 1,
      awayScore: homeForfeits ? 1 : 0,
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
      awayRedCards: 0,
      ballPossession: {
        teamId: homeForfeits ? awayTeamId : homeTeamId,
        playerWithBall: "",
        location: { x: 50, y: 50 },
        phase: MatchPhase.BUILD_UP,
        passes: 0,
        timeElapsed: 0,
      },
    };
  }

  private rebalanceShapeAfterDismissal(
    teamKey: TeamSide,
    teamPlayers: Player[],
    dismissedPlayerId: string,
    tactics: { home: TacticalSetup; away: TacticalSetup },
  ): void {
    if (!this.activeMatchShape) {
      return;
    }

    const currentShape = this.activeMatchShape[teamKey].map((slot) => ({
      ...slot,
      playerId: slot.playerId === dismissedPlayerId ? null : slot.playerId,
    }));
    const activePlayers = teamPlayers.filter(
      (player) =>
        player.role === Role.STARTER && player.id !== dismissedPlayerId,
    );
    const rebalancedShape = this.rebalanceShapeForPlayers(
      currentShape,
      activePlayers,
    );

    this.activeMatchShape = {
      ...this.activeMatchShape,
      [teamKey]: rebalancedShape,
    };
    this.rebuildFormationFromShape(teamKey, tactics);
  }

  private rebalanceShapeForPlayers(
    shape: ActiveShapeSlot[],
    activePlayers: Player[],
  ): ActiveShapeSlot[] {
    const clearedShape = shape.map((slot) => ({ ...slot, playerId: null }));
    // Staff the highest-priority slots first so the team preserves its spine before wide or advanced roles.
    const slotsToStaff = [...clearedShape]
      .sort(
        (left, right) =>
          this.getShapeSlotPriority(right) - this.getShapeSlotPriority(left),
      )
      .slice(0, Math.min(activePlayers.length, clearedShape.length));
    const assignments = this.assignPlayersToShapeSlots(
      activePlayers,
      slotsToStaff,
      shape,
    );

    return clearedShape.map((slot) => ({
      ...slot,
      playerId: assignments.get(slot.slotId) ?? null,
    }));
  }

  private assignPlayersToShapeSlots(
    activePlayers: Player[],
    slotsToStaff: ActiveShapeSlot[],
    previousShape: ActiveShapeSlot[],
  ): Map<string, string> {
    const assignments = new Map<string, string>();
    const remainingPlayers = [...activePlayers];
    const previousSlotsByPlayer = new Map(
      previousShape
        .filter((slot) => slot.playerId !== null)
        .map((slot) => [slot.playerId as string, slot]),
    );

    // Favor minimal disruption: keep players near their old slots and in compatible roles when rebuilding a reduced shape.
    for (const slot of slotsToStaff.sort(
      (left, right) =>
        this.getShapeSlotPriority(right) - this.getShapeSlotPriority(left),
    )) {
      let bestIndex = -1;
      let bestScore = Number.NEGATIVE_INFINITY;

      remainingPlayers.forEach((player, index) => {
        const score = this.getPlayerSlotFitScore(
          player,
          slot,
          previousSlotsByPlayer.get(player.id),
        );
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      });

      if (bestIndex >= 0) {
        const [selectedPlayer] = remainingPlayers.splice(bestIndex, 1);
        assignments.set(slot.slotId, selectedPlayer.id);
      }
    }

    return assignments;
  }

  private getPlayerSlotFitScore(
    player: Player,
    slot: ActiveShapeSlot,
    previousSlot?: ActiveShapeSlot,
  ): number {
    const seasonAttrs = getCurrentPlayerSeasonAttributes(
      player,
      this.currentSeasonYear,
    );
    let score = this.getPositionCompatibilityScore(
      player.position,
      slot.preferredPosition,
    );
    score += this.getShapeSlotPriority(slot) * 0.08;
    score += seasonAttrs.overall.value * 0.2;

    if (previousSlot?.slotId === slot.slotId) {
      score += 30;
    }

    if (previousSlot?.zone === slot.zone) {
      score += 12;
    }

    if (previousSlot) {
      score -=
        this.fieldService.getDistance(
          previousSlot.coordinates,
          slot.coordinates,
        ) * 0.4;
    }

    return score;
  }

  private getPositionCompatibilityScore(
    playerPosition: PositionEnum,
    slotPosition: PositionEnum,
  ): number {
    if (playerPosition === slotPosition) {
      return 140;
    }

    const playerGroup = getPositionGroup(playerPosition);
    const slotGroup = getPositionGroup(slotPosition);

    if (playerGroup === slotGroup) {
      return 120; // High compatibility for same group (e.g. CB at FB, or CM at CAM)
    }

    if (playerGroup === 'GK' || slotGroup === 'GK') {
      return -1000;
    }

    if (playerGroup === 'DEF' && slotGroup === 'MID') {
      return 72;
    }

    if (playerGroup === 'MID' && slotGroup === 'DEF') {
      return 68;
    }

    if (playerGroup === 'MID' && slotGroup === 'FWD') {
      return 62;
    }

    if (playerGroup === 'FWD' && slotGroup === 'MID') {
      return 58;
    }

    if (playerGroup === 'DEF' && slotGroup === 'FWD') {
      return 20;
    }

    if (playerGroup === 'FWD' && slotGroup === 'DEF') {
      return 10;
    }

    return 0;
  }

  private getShapeSlotPriority(slot: ActiveShapeSlot): number {
    const centrality = 50 - Math.abs(slot.coordinates.x - 50);

    if (slot.preferredPosition === PositionEnum.GK) {
      return 1000;
    }

    if (getPositionGroup(slot.preferredPosition) === 'DEF') {
      return 330 + centrality * 2 + (slot.zone === FieldZone.DEFENSE ? 40 : 0);
    }

    if (getPositionGroup(slot.preferredPosition) === 'MID') {
      return 230 + centrality + (slot.zone === FieldZone.MIDFIELD ? 25 : 0);
    }

    return 140 + centrality * 0.6 + (slot.zone === FieldZone.ATTACK ? 10 : 0);
  }

  private rebuildFormationFromShape(
    teamKey: TeamSide,
    tactics: { home: TacticalSetup; away: TacticalSetup },
  ): void {
    if (!this.activeMatchShape) {
      return;
    }

    tactics[teamKey] = {
      ...tactics[teamKey],
      formation: this.buildTeamFormationFromShape(
        this.activeMatchShape[teamKey],
        tactics[teamKey].formation,
      ),
    };
  }

  private buildTeamFormationFromShape(
    shape: ActiveShapeSlot[],
    originalFormation: TeamFormation,
  ): TeamFormation {
    return {
      name: originalFormation.name,
      positions: originalFormation.positions.map((position) => {
        const shapeSlot = shape.find((slot) => slot.slotId === position.slotId);
        return {
          ...position,
          playerId: shapeSlot?.playerId ?? "",
          coordinates: shapeSlot
            ? { ...shapeSlot.coordinates }
            : { ...position.coordinates },
          zone: shapeSlot?.zone ?? position.zone,
          role: shapeSlot?.role ?? position.role,
        };
      }),
    };
  }

  private createFormationSnapshot(): VariantBMatchShapeSnapshot | undefined {
    if (!this.activeMatchShape) {
      return undefined;
    }

    return {
      home: this.activeMatchShape.home.map((slot) => ({
        slotId: slot.slotId,
        playerId: slot.playerId,
        coordinates: { ...slot.coordinates },
        zone: slot.zone,
        role: slot.role,
        runProgress: slot.runProgress,
      })),
      away: this.activeMatchShape.away.map((slot) => ({
        slotId: slot.slotId,
        playerId: slot.playerId,
        coordinates: { ...slot.coordinates },
        zone: slot.zone,
        role: slot.role,
        runProgress: slot.runProgress,
      })),
    };
  }

  private applyShapeSubstitution(
    teamKey: TeamSide,
    outgoingPlayerId: string,
    incomingPlayerId: string,
    tactics: { home: TacticalSetup; away: TacticalSetup },
  ): void {
    if (!this.activeMatchShape) {
      return;
    }

    const updatedShape = this.activeMatchShape[teamKey].map((slot) => {
      if (slot.playerId === outgoingPlayerId) {
        return { ...slot, playerId: incomingPlayerId };
      }

      return slot;
    });

    this.activeMatchShape = {
      ...this.activeMatchShape,
      [teamKey]: updatedShape,
    };
    this.rebuildFormationFromShape(teamKey, tactics);
  }

  private calculateShapeQuality(
    shape: ActiveShapeSlot[],
    teamPlayers: Player[],
    playersMap?: Map<string, Player>,
  ): number {
    const playersById =
      playersMap ||
      new Map(teamPlayers.map((player) => [player.id, player]));

    return shape.reduce((total, slot) => {
      if (!slot.playerId) {
        return total;
      }

      const player = playersById.get(slot.playerId);
      if (!player) {
        return total;
      }

      return (
        total +
        this.getShapeSlotPriority(slot) +
        this.getPositionCompatibilityScore(
          player.position,
          slot.preferredPosition,
        )
      );
    }, 0);
  }
}
