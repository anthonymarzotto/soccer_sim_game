import { Injectable, inject } from '@angular/core';
import { Match, Team, Player } from '../models/types';
import {
  MatchState,
  SimulationConfig,
  TacticalSetup,
  PlayerFatigue,
  Coordinates,
  VariantBReplayMetadata,
  VariantBTuningConfig
} from '../models/simulation.types';
import { FieldService } from './field.service';
import { RngService } from './rng.service';
import { EventType, FieldZone, MatchPhase, PlayingStyle, Position as PositionEnum, Role } from '../models/enums';
import { resolveTeamPlayers } from '../models/team-players';

interface ResolvedRosters {
  homePlayers: Player[];
  awayPlayers: Player[];
}

interface TeamSubstitutionUsage {
  home: number;
  away: number;
}

interface MatchAction {
  type: EventType | 'CARRY';
  player: Player;
  passIntent?: PassIntent;
}

type PassIntent = 'RECYCLE' | 'PROGRESSION' | 'THROUGH_BALL' | 'CROSS';
type PassFailureMode = 'TACKLED' | 'LANE_CUT_OUT' | 'OVERHIT';
type LateGameScorelineState = 'LEADING' | 'TRAILING' | 'LEVEL';

const DEFAULT_VARIANT_B_TUNING: VariantBTuningConfig = {
  baseTickMin: 1,
  baseTickMax: 3,
  midfieldTickMin: 2,
  midfieldTickMax: 5,
  attackTickMin: 2,
  attackTickMax: 4,
  lateCloseBoostTicks: 1,

  movementStepBase: 2.4,
  movementStepRandom: 3.0,
  lateUrgencyMultiplier: 1.2,

  passWeightBase: 0.57,
  carryWeightBase: 0.12,
  shotWeightBase: 0.24,
  foulWeightBase: 0.03,
  outOfWindowShotMultiplier: 0.27,

  onTargetBase: 0.31,
  onTargetSkillScale: 0.0045,
  onTargetWidePenalty: 0.06,
  onTargetFatiguePenalty: 0.04,
  onTargetMin: 0.15,
  onTargetMax: 0.82,

  goalChanceBase: 0.21,
  goalChanceSkillVsKeeperScale: 0.0033,
  goalChanceWidePenalty: 0.035,
  goalChanceMin: 0.1,
  goalChanceMax: 0.50,

  homeAdvantageGoalBonus: 0.04
};

@Injectable({
  providedIn: 'root'
})
export class MatchSimulationVariantBService {
  private fieldService = inject(FieldService);
  private rng = inject(RngService);
  private readonly maxSubstitutionsPerTeam = 5;

  private activeTuning: VariantBTuningConfig = DEFAULT_VARIANT_B_TUNING;

  simulateMatch(match: Match, homeTeam: Team, awayTeam: Team, config: SimulationConfig): MatchState {
    this.rng.beginSimulation(config.seed);
    this.activeTuning = {
      ...DEFAULT_VARIANT_B_TUNING,
      ...(config.variantBTuning ?? {})
    };

    // Simulate against isolated copies so in-match mutations never leak into canonical league state.
    const simulatedHomeTeam = structuredClone(homeTeam);
    const simulatedAwayTeam = structuredClone(awayTeam);

    const rosters: ResolvedRosters = {
      homePlayers: resolveTeamPlayers(simulatedHomeTeam),
      awayPlayers: resolveTeamPlayers(simulatedAwayTeam)
    };

    const tactics = this.calculateTeamTactics(
      simulatedHomeTeam,
      simulatedAwayTeam,
      rosters.homePlayers,
      rosters.awayPlayers
    );
    const fatigue = this.initializeFatigue(
      simulatedHomeTeam,
      simulatedAwayTeam,
      rosters.homePlayers,
      rosters.awayPlayers
    );

    let currentState = this.initializeMatchState(match, simulatedHomeTeam, rosters.homePlayers);
    const substitutionsUsed: TeamSubstitutionUsage = { home: 0, away: 0 };

    // Variant B increases dynamism with adaptive ticks per minute.
    for (let minute = 1; minute <= 95; minute++) {
      const ticks = this.determineTicksForMinute(currentState, minute);

      for (let tick = 0; tick < ticks; tick++) {
        currentState = this.simulateVariantBTick(
          currentState,
          tactics,
          fatigue,
          simulatedHomeTeam,
          simulatedAwayTeam,
          minute,
          config,
          rosters
        );
      }

      this.processMinuteSubstitutions(
        currentState,
        fatigue,
        simulatedHomeTeam,
        simulatedAwayTeam,
        minute,
        config,
        rosters,
        substitutionsUsed
      );

      this.normalizeFatigueForTickCount(fatigue, ticks);
    }

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
    rosters: ResolvedRosters
  ): MatchState {
    const newState = { ...state };
    newState.currentMinute = minute;

    this.updateFatigue(fatigue, minute);

    const currentTeam = newState.ballPossession.teamId === homeTeam.id ? 'home' : 'away';
    const teamPlayers = currentTeam === 'home' ? rosters.homePlayers : rosters.awayPlayers;

    const carrier = this.getBallCarrier(newState.ballPossession.playerWithBall, teamPlayers);
    const locationBeforeMove = { ...newState.ballPossession.location };
    this.applyCarrierMovement(newState, carrier, currentTeam, minute);
    const locationBeforeAction = { ...newState.ballPossession.location };

    const action = this.determineCarrierAction(newState, carrier, tactics, fatigue, currentTeam, minute);
    const eventCreated = this.executeVariantBAction(
      newState,
      action,
      tactics,
      fatigue,
      homeTeam,
      awayTeam,
      minute,
      config,
      rosters
    );
    const locationAfterAction = { ...newState.ballPossession.location };

    if (eventCreated) {
      const replayActionType = this.resolveReplayActionType(newState, minute, action.type);
      this.attachVariantBReplayMetadata(
        newState,
        minute,
        this.createReplayMetadata(carrier.id, replayActionType, locationBeforeMove, locationBeforeAction, locationAfterAction)
      );
    }

    this.updatePossessionStats(newState, rosters.homePlayers);
    return newState;
  }

  private initializeMatchState(_match: Match, homeTeam: Team, homePlayers: Player[]): MatchState {
    return {
      ballPossession: {
        teamId: homeTeam.id,
        playerWithBall: this.getRandomPlayerId(homePlayers),
        location: { x: 50, y: 50 },
        phase: MatchPhase.BUILD_UP,
        passes: 0,
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

  private calculateTeamTactics(
    homeTeam: Team,
    awayTeam: Team,
    homePlayers: Player[],
    awayPlayers: Player[]
  ): { home: TacticalSetup; away: TacticalSetup } {
    return {
      home: this.fieldService.calculateTeamTactics(homeTeam, homePlayers),
      away: this.fieldService.calculateTeamTactics(awayTeam, awayPlayers)
    };
  }

  private initializeFatigue(
    _homeTeam: Team,
    _awayTeam: Team,
    homePlayers: Player[],
    awayPlayers: Player[]
  ): { home: PlayerFatigue[]; away: PlayerFatigue[] } {
    const createFatigue = (players: Player[]): PlayerFatigue[] => {
      return players.map(player => ({
        playerId: player.id,
        currentStamina: 100,
        fatigueLevel: 0,
        performanceModifier: 1
      }));
    };

    return {
      home: createFatigue(homePlayers),
      away: createFatigue(awayPlayers)
    };
  }

  private determineTicksForMinute(state: MatchState, minute: number): number {
    const zone = this.fieldService.getZoneFromY(state.ballPossession.location.y);
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
    const carrier = teamPlayers.find(player => player.id === playerId);
    if (carrier) {
      return carrier;
    }

    const starters = teamPlayers.filter(player => player.role === Role.STARTER);
    return starters[0] ?? teamPlayers[0];
  }

  private applyCarrierMovement(
    state: MatchState,
    carrier: Player,
    currentTeam: 'home' | 'away',
    minute: number
  ): void {
    const attackingBias = currentTeam === 'home' ? 1 : -1;
    const urgency = minute >= 75 ? this.activeTuning.lateUrgencyMultiplier : 1;
    const roleBias =
      carrier.position === PositionEnum.FORWARD
        ? 1.2
        : carrier.position === PositionEnum.MIDFIELDER
          ? 1
          : 0.8;

    const yStep = (this.activeTuning.movementStepBase + (this.rng.random() * this.activeTuning.movementStepRandom)) * urgency * roleBias;
    const xStep = (this.rng.random() - 0.5) * 5;

    state.ballPossession.location = {
      x: this.clamp(state.ballPossession.location.x + xStep, 0, 100),
      y: this.clamp(state.ballPossession.location.y + (yStep * attackingBias), 0, 100)
    };
  }

  private determineCarrierAction(
    state: MatchState,
    carrier: Player,
    tactics: { home: TacticalSetup; away: TacticalSetup },
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    currentTeam: 'home' | 'away',
    minute: number
  ): MatchAction {
    const location = state.ballPossession.location;
    const zone = this.fieldService.getZoneFromY(location.y);
    const shootingWindow = this.isInShootingWindow(currentTeam, location.y);
    const teamTactics = tactics[currentTeam];
    const teamFatigue = fatigue[currentTeam].find(entry => entry.playerId === carrier.id);
    const chainQuality = this.calculatePossessionChainQuality(state, currentTeam);
    const scorelineState = this.getLateGameScorelineState(state, currentTeam, minute);

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
      shotWeight += 0.18;
      passWeight -= 0.08;
    }

    if (teamTactics.playingStyle === PlayingStyle.COUNTER_ATTACK) {
      shotWeight += 0.06;
      passWeight -= 0.01;
    }

    if (carrier.position === PositionEnum.FORWARD) {
      carryWeight -= 0.02;
      shotWeight += 0.05;
      passWeight -= 0.01;
    }

    if (carrier.position === PositionEnum.DEFENDER) {
      carryWeight += 0.05;
      passWeight += 0.08;
      shotWeight -= 0.08;
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

    if (scorelineState === 'TRAILING') {
      shotWeight += 0.07;
      carryWeight += 0.03;
      passWeight -= 0.02;
      foulWeight += 0.01;
    } else if (scorelineState === 'LEADING') {
      passWeight += 0.05;
      carryWeight -= 0.01;
      shotWeight -= 0.05;
    }

    shotWeight += chainQuality * 0.03;
    passWeight -= chainQuality * 0.01;

    if (!shootingWindow) {
      shotWeight *= this.activeTuning.outOfWindowShotMultiplier;
      passWeight += 0.05;
      carryWeight += 0.03;
    }

    passWeight = Math.max(0.2, passWeight);
    carryWeight = Math.max(0.04, carryWeight);
    shotWeight = Math.max(0.005, shotWeight);
    foulWeight = Math.max(0.01, foulWeight);

    const totalWeight = passWeight + carryWeight + shotWeight + foulWeight;
    const roll = this.rng.random() * totalWeight;

    if (roll < carryWeight) {
      return { type: 'CARRY', player: carrier };
    }

    if (roll < carryWeight + passWeight) {
      return {
        type: EventType.PASS,
        player: carrier,
        passIntent: this.selectPassIntent(state, carrier, currentTeam, teamTactics, minute, teamFatigue)
      };
    }

    if (roll < carryWeight + passWeight + shotWeight) {
      return { type: EventType.SHOT, player: carrier };
    }

    if (roll < carryWeight + passWeight + shotWeight + foulWeight) {
      return { type: EventType.FOUL, player: carrier };
    }

    return { type: 'CARRY', player: carrier };
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
    rosters: ResolvedRosters
  ): boolean {
    if (action.type === 'CARRY') {
      return this.handleCarry(
        state,
        action,
        tactics,
        fatigue,
        homeTeam,
        awayTeam,
        minute,
        config,
        rosters
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
        rosters.awayPlayers
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
        rosters
      );
      return true;
    }

    if (action.type === EventType.FOUL) {
      this.handleFoul(
        state,
        action,
        homeTeam,
        awayTeam,
        minute,
        config,
        rosters.homePlayers,
        rosters.awayPlayers
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
    rosters: ResolvedRosters
  ): boolean {
    const currentTeam = state.ballPossession.teamId === homeTeam.id ? 'home' : 'away';
    const teamFatigue = fatigue[currentTeam].find(entry => entry.playerId === action.player.id);
    const pressure = this.calculateDefensivePressure(state, currentTeam, tactics);
    const successChance = this.calculateCarrySuccessChance(state, action.player, currentTeam, teamFatigue, pressure);

    if (this.rng.random() >= successChance) {
      this.createEvent(
        state,
        EventType.TACKLE,
        [action.player.id],
        { ...state.ballPossession.location },
        minute,
        false,
        config,
        { carryResult: 'DISPOSSESSED' }
      );

      state.ballPossession.teamId = currentTeam === 'home' ? awayTeam.id : homeTeam.id;
      const newCarrierPool = state.ballPossession.teamId === homeTeam.id ? rosters.homePlayers : rosters.awayPlayers;
      state.ballPossession.playerWithBall = this.getRandomPlayerId(newCarrierPool);
      state.ballPossession.passes = 0;

      const newPossessionTeam = state.ballPossession.teamId === homeTeam.id ? 'home' : 'away';
      state.ballPossession.phase = this.getPhaseFromLocation(state.ballPossession.location, newPossessionTeam);
      return true;
    }

    this.applyQuietProgression(state, action.player, homeTeam, awayTeam, rosters, pressure);
    return false;
  }

  private calculateCarrySuccessChance(
    state: MatchState,
    carrier: Player,
    currentTeam: 'home' | 'away',
    carrierFatigue: PlayerFatigue | undefined,
    pressure: number
  ): number {
    let successChance = 0.72;

    if (carrier.position === PositionEnum.FORWARD) {
      successChance += 0.04;
    } else if (carrier.position === PositionEnum.MIDFIELDER) {
      successChance += 0.015;
    } else if (carrier.position === PositionEnum.DEFENDER) {
      successChance -= 0.05;
    }

    successChance += (carrier.physical.speed - 70) * 0.002;
    successChance += (carrier.mental.flair - 70) * 0.0015;

    const attackingY = currentTeam === 'home'
      ? state.ballPossession.location.y
      : 100 - state.ballPossession.location.y;

    if (attackingY < 55) {
      successChance += 0.04;
    } else if (attackingY > 78) {
      successChance -= 0.03;
    }

    successChance -= pressure * 0.23;

    if (carrierFatigue && carrierFatigue.fatigueLevel > 70) {
      const fatiguePenaltyScale = (carrierFatigue.fatigueLevel - 70) / 30;
      successChance -= this.clamp(fatiguePenaltyScale, 0, 1) * 0.12;
    }

    return this.clamp(successChance, 0.3, 0.86);
  }

  private normalizeFatigueForTickCount(
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    ticks: number
  ): void {
    if (ticks <= 1) {
      return;
    }

    const excessTicks = ticks - 1;
    const fatiguePerTick = 0.5;
    const staminaPerTick = 0.3;

    const normalize = (entries: PlayerFatigue[]) => {
      for (const entry of entries) {
        entry.fatigueLevel = Math.max(0, entry.fatigueLevel - (fatiguePerTick * excessTicks));
        entry.currentStamina = Math.min(100, entry.currentStamina + (staminaPerTick * excessTicks));
        entry.performanceModifier = Math.max(0.5, 1.0 - (entry.fatigueLevel / 200));
      }
    };

    normalize(fatigue.home);
    normalize(fatigue.away);
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
    awayPlayers: Player[]
  ): void {
    const passer = action.player;
    const currentTeam = state.ballPossession.teamId === tactics.home.teamId ? 'home' : 'away';
    const teamPlayers = currentTeam === 'home' ? homePlayers : awayPlayers;
    const opponentPlayers = currentTeam === 'home' ? awayPlayers : homePlayers;
    const teamTactics = tactics[currentTeam];
    const teamFatigue = fatigue[currentTeam];
    const passIntent = action.passIntent
      ?? this.selectPassIntent(state, passer, currentTeam, teamTactics, minute, teamFatigue.find(entry => entry.playerId === passer.id));
    const pressure = this.calculateDefensivePressure(state, currentTeam, tactics);

    const targetPlayer = this.findPassTarget(passer, teamPlayers, teamTactics, state.ballPossession.location, currentTeam, passIntent);

    if (!targetPlayer) {
      this.createEvent(state, EventType.TACKLE, [passer.id], state.ballPossession.location, minute, false, config);
      state.ballPossession.teamId = currentTeam === 'home' ? awayTeam.id : homeTeam.id;
      state.ballPossession.playerWithBall = this.getRandomPlayerId(opponentPlayers);
      return;
    }

    const targetPosition = this.fieldService.getStartingPositionForPlayer(targetPlayer, teamTactics.formation);
    const passDistance = this.fieldService.getDistance(state.ballPossession.location, targetPosition);
    const progression = currentTeam === 'home'
      ? targetPosition.y - state.ballPossession.location.y
      : state.ballPossession.location.y - targetPosition.y;

    const passSuccess = this.calculatePassSuccess(
      passer,
      targetPlayer,
      teamTactics,
      teamFatigue,
      state.ballPossession.location,
      currentTeam,
      passIntent,
      pressure
    );

    if (passSuccess) {
      state.ballPossession.playerWithBall = targetPlayer.id;
      state.ballPossession.passes++;
      state.ballPossession.location = this.calculateNewBallPosition(state.ballPossession.location, targetPosition);
      this.createEvent(
        state,
        EventType.PASS,
        [passer.id, targetPlayer.id],
        state.ballPossession.location,
        minute,
        true,
        config,
        { passIntent }
      );
      return;
    }

    const failureMode = this.determinePassFailureMode(passIntent, pressure, passDistance, progression);
    this.createPassFailureEvent(state, failureMode, passer.id, passIntent, minute, config);
    state.ballPossession.teamId = currentTeam === 'home' ? awayTeam.id : homeTeam.id;
    state.ballPossession.playerWithBall = this.getRandomPlayerId(opponentPlayers);
    state.ballPossession.passes = 0;
  }

  private determinePassFailureMode(
    passIntent: PassIntent,
    pressure: number,
    passDistance: number,
    progression: number
  ): PassFailureMode {
    if (pressure >= 0.6 && passDistance <= 24) {
      return 'TACKLED';
    }

    if ((passIntent === 'THROUGH_BALL' || passIntent === 'CROSS') && passDistance >= 30) {
      return 'OVERHIT';
    }

    if (progression >= 10 || passDistance >= 24) {
      return 'LANE_CUT_OUT';
    }

    return 'TACKLED';
  }

  private createPassFailureEvent(
    state: MatchState,
    mode: PassFailureMode,
    passerId: string,
    passIntent: PassIntent,
    minute: number,
    config: SimulationConfig
  ): void {
    if (mode === 'TACKLED') {
      this.createEvent(
        state,
        EventType.TACKLE,
        [passerId],
        state.ballPossession.location,
        minute,
        false,
        config,
        { passFailure: mode, passIntent }
      );
      return;
    }

    this.createEvent(
      state,
      EventType.INTERCEPTION,
      [passerId],
      state.ballPossession.location,
      minute,
      false,
      config,
      { passFailure: mode, passIntent }
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
    awayPlayers: Player[]
  ): void {
    const currentTeam = state.ballPossession.teamId === homeTeam.id ? 'home' : 'away';

    if (currentTeam === 'home') {
      state.homeScore++;
    } else {
      state.awayScore++;
    }

    this.createEvent(state, EventType.GOAL, [action.player.id], state.ballPossession.location, minute, true, config);
    state.ballPossession.teamId = currentTeam === 'home' ? awayTeam.id : homeTeam.id;
    state.ballPossession.playerWithBall = this.getRandomPlayerId(
      state.ballPossession.teamId === homeTeam.id ? homePlayers : awayPlayers
    );
    state.ballPossession.location = { x: 50, y: 50 };
    state.ballPossession.passes = 0;
  }

  private handleFoul(
    state: MatchState,
    action: MatchAction,
    homeTeam: Team,
    awayTeam: Team,
    minute: number,
    config: SimulationConfig,
    homePlayers: Player[],
    awayPlayers: Player[]
  ): void {
    const attackingTeam = state.ballPossession.teamId === homeTeam.id ? 'home' : 'away';
    const defendingTeam = attackingTeam === 'home' ? 'away' : 'home';
    const defendingPlayers = defendingTeam === 'home' ? homePlayers : awayPlayers;
    const victim = action.player;
    const offender = this.selectFoulOffender(defendingPlayers);

    if (defendingTeam === 'home') {
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
      config
    );

    let offenderSentOff = false;
    if (this.rng.random() > 0.9) {
      const directRed = this.rng.random() > 0.5;

      if (directRed) {
        this.createEvent(
          state,
          EventType.RED_CARD,
          [offender.id, victim.id],
          { ...state.ballPossession.location },
          minute,
          false,
          config,
          { cardReason: 'DIRECT_RED' }
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
          config
        );
        this.incrementCardCount(state, defendingTeam, EventType.YELLOW_CARD);

        if (this.countPlayerEvents(state, offender.id, EventType.YELLOW_CARD) >= 2) {
          this.createEvent(
            state,
            EventType.RED_CARD,
            [offender.id, victim.id],
            { ...state.ballPossession.location },
            minute,
            false,
            config,
            { cardReason: 'SECOND_YELLOW' }
          );
          this.incrementCardCount(state, defendingTeam, EventType.RED_CARD);
          offenderSentOff = true;
        }
      }
    }

    if (offenderSentOff) {
      this.dismissPlayer(offender.id, defendingPlayers);
    }

    state.ballPossession.teamId = attackingTeam === 'home' ? homeTeam.id : awayTeam.id;
    state.ballPossession.playerWithBall = victim.id;
    state.ballPossession.location = this.getFoulRestartLocation(attackingTeam, state.ballPossession.location);
    state.ballPossession.passes = 0;
  }

  private getFoulRestartLocation(attackingTeam: 'home' | 'away', currentLocation: Coordinates): Coordinates {
    const attackingY = attackingTeam === 'home' ? currentLocation.y : 100 - currentLocation.y;
    let restartAttackingY = attackingY;
    let restartX = currentLocation.x;

    // Keep advanced fouls dangerous, while deeper fouls reset play further from goal.
    if (attackingY >= 78) {
      restartAttackingY = this.clamp(attackingY + 1, 0, 90);
      restartX = this.clamp(currentLocation.x + ((50 - currentLocation.x) * 0.2), 0, 100);
    } else if (attackingY >= 60) {
      restartAttackingY = this.clamp(attackingY - 2, 0, 100);
      restartX = this.clamp(currentLocation.x + ((50 - currentLocation.x) * 0.2), 0, 100);
    } else {
      restartAttackingY = this.clamp(attackingY - 8, 0, 100);
    }

    return attackingTeam === 'home'
      ? { x: restartX, y: restartAttackingY }
      : { x: restartX, y: 100 - restartAttackingY };
  }

  private selectFoulOffender(teamPlayers: Player[]): Player {
    const starters = teamPlayers.filter(player => player.role === Role.STARTER);
    const activePlayers = starters.length > 0 ? starters : teamPlayers;
    const preferredPlayers = activePlayers.filter(
      player => player.position === PositionEnum.DEFENDER || player.position === PositionEnum.MIDFIELDER
    );
    const outfieldPlayers = activePlayers.filter(player => player.position !== PositionEnum.GOALKEEPER);
    const candidatePool = preferredPlayers.length > 0 ? preferredPlayers : outfieldPlayers.length > 0 ? outfieldPlayers : activePlayers;

    return candidatePool[Math.floor(this.rng.random() * candidatePool.length)] ?? teamPlayers[0];
  }

  private incrementCardCount(state: MatchState, team: 'home' | 'away', cardType: EventType.YELLOW_CARD | EventType.RED_CARD): void {
    if (cardType === EventType.YELLOW_CARD) {
      if (team === 'home') {
        state.homeYellowCards++;
      } else {
        state.awayYellowCards++;
      }
      return;
    }

    if (team === 'home') {
      state.homeRedCards++;
    } else {
      state.awayRedCards++;
    }
  }

  private countPlayerEvents(state: MatchState, playerId: string, eventType: EventType): number {
    return state.events.filter(event => event.type === eventType && event.playerIds[0] === playerId).length;
  }

  private dismissPlayer(playerId: string, teamPlayers: Player[]): void {
    const dismissedPlayer = teamPlayers.find(player => player.id === playerId);
    if (dismissedPlayer) {
      dismissedPlayer.role = Role.DISMISSED;
    }
  }

  private calculatePassSuccess(
    passer: Player,
    target: Player,
    tactics: TacticalSetup,
    fatigue: PlayerFatigue[],
    currentLocation: Coordinates,
    currentTeam: 'home' | 'away',
    passIntent: PassIntent,
    pressure: number
  ): boolean {
    const passerFatigue = fatigue.find(entry => entry.playerId === passer.id);
    const targetFatigue = fatigue.find(entry => entry.playerId === target.id);

    let baseChance = (passer.skills.shortPassing + passer.skills.longPassing) / 2;

    if (passerFatigue) {
      baseChance *= passerFatigue.performanceModifier;
    }

    if (targetFatigue) {
      baseChance *= targetFatigue.performanceModifier;
    }

    if (tactics.playingStyle === PlayingStyle.POSSESSION) {
      baseChance += 10;
    }

    if (passIntent === 'RECYCLE') {
      baseChance += 1;
    } else if (passIntent === 'PROGRESSION') {
      baseChance -= 1;
    } else if (passIntent === 'THROUGH_BALL') {
      baseChance -= 6;
    } else if (passIntent === 'CROSS') {
      baseChance -= 5;
    }

    baseChance -= pressure * 4;

    baseChance = this.clamp(baseChance, 20, 95);

    return this.rng.random() * 100 < baseChance;
  }

  private calculatePossessionChainQuality(state: MatchState, currentTeam: 'home' | 'away'): number {
    const passes = state.ballPossession.passes;
    const y = state.ballPossession.location.y;
    const attackingY = currentTeam === 'home' ? y : 100 - y;

    const sequenceSignal = this.clamp(passes / 6, 0, 1);
    const depthSignal = this.clamp((attackingY - 35) / 40, 0, 1);
    const finalThirdSignal = attackingY >= 67 ? 1 : 0;

    const score = (sequenceSignal * 0.45) + (depthSignal * 0.35) + (finalThirdSignal * 0.2);
    return this.clamp(score, 0, 1);
  }

  private selectPassIntent(
    state: MatchState,
    passer: Player,
    currentTeam: 'home' | 'away',
    teamTactics: TacticalSetup,
    minute: number,
    passerFatigue?: PlayerFatigue
  ): PassIntent {
    const y = state.ballPossession.location.y;
    const x = state.ballPossession.location.x;
    const attackingY = currentTeam === 'home' ? y : 100 - y;
    const wideChannel = Math.abs(x - 50) >= 18;
    const scorelineState = this.getLateGameScorelineState(state, currentTeam, minute);

    if ((passer.position === PositionEnum.DEFENDER || (passerFatigue?.fatigueLevel ?? 0) > 75) && attackingY < 78) {
      return 'RECYCLE';
    }

    if (attackingY >= 82 && wideChannel && (passer.position === PositionEnum.MIDFIELDER || passer.position === PositionEnum.FORWARD)) {
      return 'CROSS';
    }

    if (attackingY >= 78 && !wideChannel && (passer.position === PositionEnum.MIDFIELDER || passer.position === PositionEnum.FORWARD)) {
      return 'THROUGH_BALL';
    }

    if (teamTactics.playingStyle === PlayingStyle.POSSESSION && attackingY < 60) {
      return 'RECYCLE';
    }

    if (scorelineState === 'LEADING' && attackingY < 82) {
      return 'RECYCLE';
    }

    if (scorelineState === 'TRAILING' && attackingY >= 70) {
      return wideChannel ? 'CROSS' : 'THROUGH_BALL';
    }

    if (attackingY < 67) {
      return 'RECYCLE';
    }

    return 'PROGRESSION';
  }

  private calculateDefensivePressure(
    state: MatchState,
    currentTeam: 'home' | 'away',
    tactics: { home: TacticalSetup; away: TacticalSetup }
  ): number {
    const defendingTeam = currentTeam === 'home' ? 'away' : 'home';
    const defendingTactics = tactics[defendingTeam];
    const zone = this.fieldService.getZoneFromY(state.ballPossession.location.y);
    const attackingZone = currentTeam === 'home'
      ? zone === FieldZone.ATTACK
      : zone === FieldZone.DEFENSE;
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

    return this.clamp(pressure, 0.1, 0.75);
  }

  private getLateGameScorelineState(
    state: MatchState,
    currentTeam: 'home' | 'away',
    minute: number
  ): LateGameScorelineState {
    if (minute < 80) {
      return 'LEVEL';
    }

    const teamScore = currentTeam === 'home' ? state.homeScore : state.awayScore;
    const opponentScore = currentTeam === 'home' ? state.awayScore : state.homeScore;

    if (teamScore > opponentScore) {
      return 'LEADING';
    }

    if (teamScore < opponentScore) {
      return 'TRAILING';
    }

    return 'LEVEL';
  }

  private processMinuteSubstitutions(
    state: MatchState,
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    homeTeam: Team,
    awayTeam: Team,
    minute: number,
    config: SimulationConfig,
    rosters: ResolvedRosters,
    substitutionsUsed: TeamSubstitutionUsage
  ): void {
    this.tryTeamSubstitution('home', state, homeTeam, awayTeam, fatigue, minute, config, rosters, substitutionsUsed);
    this.tryTeamSubstitution('away', state, homeTeam, awayTeam, fatigue, minute, config, rosters, substitutionsUsed);
  }

  private tryTeamSubstitution(
    teamKey: 'home' | 'away',
    state: MatchState,
    homeTeam: Team,
    awayTeam: Team,
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    minute: number,
    config: SimulationConfig,
    rosters: ResolvedRosters,
    substitutionsUsed: TeamSubstitutionUsage
  ): void {
    if (substitutionsUsed[teamKey] >= this.maxSubstitutionsPerTeam) {
      return;
    }

    if (minute < 58 || minute > 88) {
      return;
    }

    const teamPlayers = teamKey === 'home' ? rosters.homePlayers : rosters.awayPlayers;
    const teamFatigue = fatigue[teamKey];
    const triggerChance = this.calculateSubstitutionTriggerChance(teamPlayers, teamFatigue, minute);
    if (this.rng.random() >= triggerChance) {
      return;
    }

    const outgoingPlayer = this.selectSubstitutionOutgoingPlayer(teamPlayers, teamFatigue);
    if (!outgoingPlayer) {
      return;
    }

    const incomingPlayer = this.selectSubstitutionIncomingPlayer(teamPlayers, outgoingPlayer.position);
    if (!incomingPlayer) {
      return;
    }

    outgoingPlayer.role = Role.SUBSTITUTED_OUT;
    incomingPlayer.role = Role.STARTER;
    substitutionsUsed[teamKey] += 1;

    const teamId = teamKey === 'home' ? homeTeam.id : awayTeam.id;
    if (state.ballPossession.teamId === teamId && state.ballPossession.playerWithBall === outgoingPlayer.id) {
      state.ballPossession.playerWithBall = incomingPlayer.id;
    }

    this.createEvent(
      state,
      EventType.SUBSTITUTION,
      [outgoingPlayer.id, incomingPlayer.id],
      { ...state.ballPossession.location },
      minute,
      true,
      config
    );
  }

  private calculateSubstitutionTriggerChance(
    teamPlayers: Player[],
    teamFatigue: PlayerFatigue[],
    minute: number
  ): number {
    let baseChance = minute >= 82 ? 0.38 : minute >= 72 ? 0.24 : 0.14;
    const fatigueByPlayer = new Map(teamFatigue.map(entry => [entry.playerId, entry.fatigueLevel]));
    const fatiguedStarters = teamPlayers.filter(
      player => player.role === Role.STARTER && player.position !== PositionEnum.GOALKEEPER && (fatigueByPlayer.get(player.id) ?? 0) >= 62
    ).length;

    baseChance += this.clamp((fatiguedStarters - 1) * 0.06, 0, 0.24);
    return this.clamp(baseChance, 0.08, 0.72);
  }

  private selectSubstitutionOutgoingPlayer(teamPlayers: Player[], teamFatigue: PlayerFatigue[]): Player | null {
    const fatigueByPlayer = new Map(teamFatigue.map(entry => [entry.playerId, entry.fatigueLevel]));
    const starterOutfield = teamPlayers.filter(
      player => player.role === Role.STARTER && player.position !== PositionEnum.GOALKEEPER
    );

    if (starterOutfield.length === 0) {
      return null;
    }

    const sortedByFatigue = [...starterOutfield].sort(
      (left, right) => (fatigueByPlayer.get(right.id) ?? 0) - (fatigueByPlayer.get(left.id) ?? 0)
    );

    const topCandidates = sortedByFatigue.slice(0, Math.min(3, sortedByFatigue.length));
    return topCandidates[Math.floor(this.rng.random() * topCandidates.length)] ?? sortedByFatigue[0] ?? null;
  }

  private selectSubstitutionIncomingPlayer(teamPlayers: Player[], outgoingPosition: PositionEnum): Player | null {
    const benchPlayers = teamPlayers.filter(player => player.role === Role.BENCH);

    if (benchPlayers.length === 0) {
      return null;
    }

    const samePositionPool = benchPlayers.filter(player => player.position === outgoingPosition);
    const candidatePool = samePositionPool.length > 0 ? samePositionPool : benchPlayers;

    const sortedByQuality = [...candidatePool].sort((left, right) => {
      if (right.overall === left.overall) {
        return right.physical.endurance - left.physical.endurance;
      }

      return right.overall - left.overall;
    });

    return sortedByQuality[0] ?? null;
  }

  private updateFatigue(fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] }, _minute: number): void {
    Object.values(fatigue).forEach(teamFatigue => {
      teamFatigue.forEach(entry => {
        entry.fatigueLevel = Math.min(100, entry.fatigueLevel + 0.5);
        entry.currentStamina = Math.max(0, entry.currentStamina - 0.3);
        entry.performanceModifier = Math.max(0.5, 1 - (entry.fatigueLevel / 200));
      });
    });
  }

  private updatePossessionStats(state: MatchState, homePlayers: Player[]): void {
    const totalEvents = state.events.length;
    if (totalEvents <= 0) {
      return;
    }

    const homeEvents = state.events.filter(event => {
      return event.playerIds.some(playerId => this.findPlayerById(playerId, homePlayers) !== null);
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
    _config: SimulationConfig,
    additionalData?: Record<string, unknown>
  ): void {
    state.events.push({
      id: this.createRandomId(),
      type,
      description: '',
      playerIds,
      location,
      time,
      success,
      additionalData
    });
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private isInShootingWindow(currentTeam: 'home' | 'away', y: number): boolean {
    return currentTeam === 'home' ? y >= 70 : y <= 30;
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
    rosters: ResolvedRosters
  ): void {
    const shooter = action.player;
    const isHomeInPossession = state.ballPossession.teamId === homeTeam.id;
    const attackingY = isHomeInPossession ? state.ballPossession.location.y : 100 - state.ballPossession.location.y;
    const lateralDistance = Math.abs(state.ballPossession.location.x - 50);
    const opponentPlayers = isHomeInPossession ? rosters.awayPlayers : rosters.homePlayers;
    const goalkeeper = opponentPlayers.find(player => player.position === PositionEnum.GOALKEEPER);
    const fatigueBucket = isHomeInPossession ? fatigue.home : fatigue.away;
    const shooterFatigue = fatigueBucket.find(entry => entry.playerId === shooter.id);
    const currentTeam: 'home' | 'away' = isHomeInPossession ? 'home' : 'away';
    const pressure = this.calculateDefensivePressure(state, currentTeam, tactics);
    const chainQuality = this.calculatePossessionChainQuality(state, currentTeam);

    if (isHomeInPossession) {
      state.homeShots++;
    } else {
      state.awayShots++;
    }

    let onTargetChance = this.activeTuning.onTargetBase + ((shooter.skills.shooting - 70) * this.activeTuning.onTargetSkillScale);
    if (attackingY >= 85) {
      onTargetChance += 0.28;
    } else if (attackingY >= 75) {
      onTargetChance += 0.18;
    } else if (attackingY >= 65) {
      onTargetChance += 0.09;
    } else {
      onTargetChance -= 0.02;
    }

    onTargetChance -= (lateralDistance / 50) * this.activeTuning.onTargetWidePenalty;
    if (shooterFatigue && shooterFatigue.fatigueLevel > 75) {
      onTargetChance -= this.activeTuning.onTargetFatiguePenalty;
    }
    onTargetChance -= pressure * 0.02;
    onTargetChance += chainQuality * 0.02;

    onTargetChance = this.clampChance(onTargetChance, this.activeTuning.onTargetMin, this.activeTuning.onTargetMax);
    const onTarget = this.rng.random() < onTargetChance;

    if (!onTarget) {
      this.createEvent(
        state,
        EventType.MISS,
        [shooter.id],
        { ...state.ballPossession.location },
        minute,
        false,
        config
      );
      return;
    }

    if (isHomeInPossession) {
      state.homeShotsOnTarget++;
    } else {
      state.awayShotsOnTarget++;
    }

    const keeperSkill = goalkeeper?.skills.goalkeeping ?? 70;
    let goalChance = this.activeTuning.goalChanceBase + ((shooter.skills.shooting - keeperSkill) * this.activeTuning.goalChanceSkillVsKeeperScale);

    if (attackingY >= 85) {
      goalChance += 0.2;
    } else if (attackingY >= 75) {
      goalChance += 0.12;
    } else {
      goalChance += 0.02;
    }

    goalChance -= (lateralDistance / 50) * this.activeTuning.goalChanceWidePenalty;
    goalChance -= pressure * 0.015;
    goalChance += chainQuality * 0.015;
    if (isHomeInPossession) {
      goalChance += this.activeTuning.homeAdvantageGoalBonus;
    }
    goalChance = this.clampChance(goalChance, this.activeTuning.goalChanceMin, this.activeTuning.goalChanceMax);

    if (this.rng.random() < goalChance) {
      this.handleGoal(
        state,
        { type: EventType.GOAL, player: shooter },
        homeTeam,
        awayTeam,
        minute,
        config,
        rosters.homePlayers,
        rosters.awayPlayers
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
      config
    );

    state.ballPossession.teamId = isHomeInPossession ? awayTeam.id : homeTeam.id;
    const newOwnerPool = state.ballPossession.teamId === homeTeam.id ? rosters.homePlayers : rosters.awayPlayers;
    const starters = newOwnerPool.filter(player => player.role === Role.STARTER);
    const newOwner = starters[Math.floor(this.rng.random() * Math.max(starters.length, 1))] ?? newOwnerPool[0];
    state.ballPossession.playerWithBall = newOwner.id;
    state.ballPossession.passes = 0;
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
    pressure: number
  ): void {
    const currentTeam = state.ballPossession.teamId === homeTeam.id ? 'home' : 'away';
    const currentPlayers = currentTeam === 'home' ? rosters.homePlayers : rosters.awayPlayers;
    const attackDirection = currentTeam === 'home' ? 1 : -1;
    const carryAdvance = this.calculateCarryAdvanceDistance(carrier, pressure);

    state.ballPossession.location = {
      x: this.clamp(state.ballPossession.location.x + ((this.rng.random() - 0.5) * 2.5), 0, 100),
      y: this.clamp(state.ballPossession.location.y + (carryAdvance * attackDirection), 0, 100)
    };

    const sameRolePlayers = currentPlayers.filter(
      player => player.id !== carrier.id && player.role === Role.STARTER && player.position === carrier.position
    );
    const fallbackPlayers = currentPlayers.filter(player => player.id !== carrier.id && player.role === Role.STARTER);
    const candidatePool = sameRolePlayers.length > 0 ? sameRolePlayers : fallbackPlayers;

    if (candidatePool.length > 0 && this.rng.random() < 0.35) {
      const nextCarrier = candidatePool[Math.floor(this.rng.random() * candidatePool.length)];
      state.ballPossession.playerWithBall = nextCarrier.id;
    }

    state.ballPossession.passes += 1;
    state.ballPossession.phase = this.getPhaseFromLocation(state.ballPossession.location, currentTeam);
  }

  private calculateCarryAdvanceDistance(carrier: Player, pressure: number): number {
    const baseAdvance = 1.0 + (this.rng.random() * 2.0);
    const roleMultiplier =
      carrier.position === PositionEnum.FORWARD
        ? 1.15
        : carrier.position === PositionEnum.MIDFIELDER
          ? 1
          : 0.85;
    const pressureMultiplier = this.clamp(1 - (pressure * 0.65), 0.35, 1);

    return baseAdvance * roleMultiplier * pressureMultiplier;
  }

  private getPhaseFromLocation(location: Coordinates, currentTeam: 'home' | 'away'): MatchPhase {
    const attackingY = currentTeam === 'home' ? location.y : 100 - location.y;
    return attackingY >= 67 ? MatchPhase.ATTACKING : MatchPhase.BUILD_UP;
  }

  private resolveReplayActionType(
    state: MatchState,
    minute: number,
    actionType: MatchAction['type']
  ): EventType {
    if (actionType !== 'CARRY') {
      return actionType;
    }

    const latestEventIndex = this.findLatestEventIndexForMinute(state, minute);
    if (latestEventIndex >= 0) {
      return state.events[latestEventIndex].type;
    }

    return EventType.PASS;
  }

  private createReplayMetadata(
    actorPlayerId: string,
    actionType: EventType,
    beforeMove: Coordinates,
    beforeAction: Coordinates,
    afterAction: Coordinates
  ): VariantBReplayMetadata {
    return {
      actorPlayerId,
      actionType,
      durationMs: 1400,
      keyframes: [
        { timestampMs: 0, ballLocation: beforeMove },
        { timestampMs: 400, ballLocation: beforeAction },
        { timestampMs: 1400, ballLocation: afterAction }
      ]
    };
  }

  private attachVariantBReplayMetadata(state: MatchState, minute: number, metadata: VariantBReplayMetadata): void {
    const eventIndex = this.findLatestEventIndexForMinute(state, minute);
    if (eventIndex < 0) {
      return;
    }

    const event = state.events[eventIndex];
    event.additionalData = {
      ...(event.additionalData ?? {}),
      variantBReplay: metadata
    };
  }

  private findLatestEventIndexForMinute(state: MatchState, minute: number): number {
    for (let index = state.events.length - 1; index >= 0; index--) {
      if (state.events[index].time === minute) {
        return index;
      }
    }

    return -1;
  }

  private findPlayerById(playerId: string, players: Player[]): Player | null {
    return players.find(player => player.id === playerId) ?? null;
  }

  private findPassTarget(
    passer: Player,
    teamPlayers: Player[],
    tactics: TacticalSetup,
    currentLocation: Coordinates,
    currentTeam: 'home' | 'away',
    passIntent: PassIntent
  ): Player | null {
    const potentialTargets = teamPlayers.filter(player => player.id !== passer.id && player.role === Role.STARTER);

    if (potentialTargets.length === 0) {
      return null;
    }

    const scoredTargets = potentialTargets
      .map(target => {
        const targetPosition = this.fieldService.getStartingPositionForPlayer(target, tactics.formation);
        const distance = this.fieldService.getDistance(currentLocation, targetPosition);
        const progression = currentTeam === 'home'
          ? targetPosition.y - currentLocation.y
          : currentLocation.y - targetPosition.y;
        const lateralDistance = Math.abs(targetPosition.x - currentLocation.x);
        const centrality = 50 - Math.abs(targetPosition.x - 50);

        let score = 0;

        if (passIntent === 'RECYCLE') {
          score += (34 - Math.min(distance, 34)) * 2.2;
          score -= Math.max(0, progression - 6) * 1.2;
          score -= Math.max(0, -progression) * 0.3;
          score -= Math.max(0, lateralDistance - 24) * 0.3;
          if (target.position === PositionEnum.DEFENDER || target.position === PositionEnum.MIDFIELDER) {
            score += 7;
          }
        } else if (passIntent === 'PROGRESSION') {
          score += Math.max(0, progression) * 1.7;
          score -= Math.max(0, distance - 26) * 0.7;
          score -= Math.max(0, -progression) * 2.5;
          if (target.position === PositionEnum.MIDFIELDER) {
            score += 4;
          }
          if (target.position === PositionEnum.FORWARD) {
            score += 3;
          }
        } else if (passIntent === 'THROUGH_BALL') {
          score += Math.max(0, progression) * 2.2;
          score -= Math.max(0, 14 - progression) * 1.5;
          score -= Math.max(0, distance - 32) * 0.8;
          if (target.position === PositionEnum.FORWARD) {
            score += 10;
          }
        } else {
          score += Math.max(0, progression) * 1.3;
          score += centrality * 0.35;
          score -= Math.max(0, distance - 30) * 0.6;
          if (target.position === PositionEnum.FORWARD) {
            score += 8;
          }
        }

        if (tactics.playingStyle === PlayingStyle.POSSESSION && passIntent !== 'THROUGH_BALL') {
          score += (34 - Math.min(distance, 34)) * 0.2;
        }

        if (tactics.playingStyle === PlayingStyle.COUNTER_ATTACK && passIntent !== 'RECYCLE') {
          score += Math.max(0, progression) * 0.35;
        }

        return { target, score, distance };
      })
      .sort((left, right) => {
        if (right.score === left.score) {
          return left.distance - right.distance;
        }

        return right.score - left.score;
      });

    if (scoredTargets.length === 0) {
      return null;
    }

    const topCandidates = scoredTargets.slice(0, Math.min(2, scoredTargets.length));

    if (topCandidates.length === 1) {
      return topCandidates[0].target;
    }

    const weakestTopScore = topCandidates[topCandidates.length - 1].score;
    const weightedCandidates = topCandidates.map((candidate, index) => {
      const normalizedScore = candidate.score - weakestTopScore;
      const scoreWeight = Math.max(0.1, normalizedScore + 1);
      const rankWeight = index === 0 ? 1.6 : 0.35;

      return {
        target: candidate.target,
        weight: scoreWeight * rankWeight
      };
    });

    return this.pickWeightedTarget(weightedCandidates) ?? topCandidates[0].target;
  }

  private pickWeightedTarget(candidates: { target: Player; weight: number }[]): Player | null {
    const totalWeight = candidates.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
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

  private calculateNewBallPosition(current: Coordinates, target: Coordinates): Coordinates {
    return {
      x: (current.x + target.x) / 2,
      y: (current.y + target.y) / 2
    };
  }

  private getRandomPlayerId(teamPlayers: Player[]): string {
    const starters = teamPlayers.filter(player => player.role === Role.STARTER);
    const selectablePlayers = starters.length > 0 ? starters : teamPlayers;
    return selectablePlayers[Math.floor(this.rng.random() * selectablePlayers.length)].id;
  }

  private createRandomId(): string {
    return this.rng.random().toString(36).substring(2, 9);
  }

}
