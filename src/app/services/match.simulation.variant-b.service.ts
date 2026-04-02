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
import { MatchSimulationService } from './match.simulation.service';
import { FieldService } from './field.service';
import { RngService } from './rng.service';
import { EventType, FieldZone, MatchPhase, PlayingStyle, Position as PositionEnum, Role } from '../models/enums';
import { resolveTeamPlayers } from '../models/team-players';

interface ResolvedRosters {
  homePlayers: Player[];
  awayPlayers: Player[];
}

interface MatchSimulationBridge {
  initializeMatchState(match: Match, homeTeam: Team, homePlayers: Player[]): MatchState;
  calculateTeamTactics(
    homeTeam: Team,
    awayTeam: Team,
    homePlayers: Player[],
    awayPlayers: Player[]
  ): { home: TacticalSetup; away: TacticalSetup };
  initializeFatigue(
    homeTeam: Team,
    awayTeam: Team,
    homePlayers: Player[],
    awayPlayers: Player[]
  ): { home: PlayerFatigue[]; away: PlayerFatigue[] };
  simulateMinute(
    state: MatchState,
    tactics: { home: TacticalSetup; away: TacticalSetup },
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    homeTeam: Team,
    awayTeam: Team,
    minute: number,
    config: SimulationConfig,
    rosters: ResolvedRosters
  ): MatchState;
  handlePass(
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
  ): void;
  handleShot(
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
  ): void;
  handleFoul(
    state: MatchState,
    action: MatchAction,
    homeTeam: Team,
    awayTeam: Team,
    minute: number,
    config: SimulationConfig,
    homePlayers: Player[],
    awayPlayers: Player[]
  ): void;
  handleGoal(
    state: MatchState,
    action: MatchAction,
    homeTeam: Team,
    awayTeam: Team,
    minute: number,
    config: SimulationConfig,
    homePlayers: Player[],
    awayPlayers: Player[]
  ): void;
  handleCorner(
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
  ): void;
  updateFatigue(fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] }, minute: number): void;
  updatePossessionStats(state: MatchState, homeTeam: Team, homePlayers: Player[], awayTeam: Team): void;
  createEvent(
    state: MatchState,
    type: EventType,
    playerIds: string[],
    location: Coordinates,
    time: number,
    success: boolean,
    config: SimulationConfig
  ): void;
}

interface MatchAction {
  type: EventType | 'CARRY';
  player: Player;
}

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
  shotWeightBase: 0.24,
  foulWeightBase: 0.03,
  outOfWindowShotMultiplier: 0.27,

  onTargetBase: 0.31,
  onTargetSkillScale: 0.0045,
  onTargetWidePenalty: 0.06,
  onTargetFatiguePenalty: 0.04,
  onTargetMin: 0.15,
  onTargetMax: 0.82,

  goalChanceBase: 0.23,
  goalChanceSkillVsKeeperScale: 0.0033,
  goalChanceWidePenalty: 0.035,
  goalChanceMin: 0.1,
  goalChanceMax: 0.54
};

@Injectable({
  providedIn: 'root'
})
export class MatchSimulationVariantBService {
  private baselineSimulation = inject(MatchSimulationService);
  private fieldService = inject(FieldService);
  private rng = inject(RngService);

  private readonly bridge = this.baselineSimulation as unknown as MatchSimulationBridge;
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

    const tactics = this.bridge.calculateTeamTactics(
      simulatedHomeTeam,
      simulatedAwayTeam,
      rosters.homePlayers,
      rosters.awayPlayers
    );
    const fatigue = this.bridge.initializeFatigue(
      simulatedHomeTeam,
      simulatedAwayTeam,
      rosters.homePlayers,
      rosters.awayPlayers
    );

    let currentState = this.bridge.initializeMatchState(match, simulatedHomeTeam, rosters.homePlayers);

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

    this.bridge.updateFatigue(fatigue, minute);

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
      this.attachVariantBReplayMetadata(
        newState,
        minute,
        this.createReplayMetadata(carrier.id, action.type === 'CARRY' ? EventType.PASS : action.type, locationBeforeMove, locationBeforeAction, locationAfterAction)
      );
    }

    this.bridge.updatePossessionStats(newState, homeTeam, rosters.homePlayers, awayTeam);
    return newState;
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

    let passWeight = this.activeTuning.passWeightBase;
    let carryWeight = 0.12;
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
      return { type: EventType.PASS, player: carrier };
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
      this.applyQuietProgression(state, action.player, homeTeam, awayTeam, rosters);
      return false;
    }

    if (action.type === EventType.PASS) {
      this.bridge.handlePass(
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
      this.bridge.handleFoul(
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

    this.bridge.handlePass(
      state,
      { type: EventType.PASS, player: action.player },
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

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private isInShootingWindow(currentTeam: 'home' | 'away', y: number): boolean {
    return currentTeam === 'home' ? y >= 70 : y <= 30;
  }

  private executeVariantBShot(
    state: MatchState,
    action: MatchAction,
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

    onTargetChance = this.clampChance(onTargetChance, this.activeTuning.onTargetMin, this.activeTuning.onTargetMax);
    const onTarget = this.rng.random() < onTargetChance;

    if (!onTarget) {
      this.bridge.createEvent(
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
    goalChance = this.clampChance(goalChance, this.activeTuning.goalChanceMin, this.activeTuning.goalChanceMax);

    if (this.rng.random() < goalChance) {
      this.bridge.handleGoal(
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

    this.bridge.createEvent(
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
    rosters: ResolvedRosters
  ): void {
    const currentPlayers = state.ballPossession.teamId === homeTeam.id ? rosters.homePlayers : rosters.awayPlayers;
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
    state.ballPossession.phase =
      state.ballPossession.location.y > 66 || state.ballPossession.location.y < 34
        ? MatchPhase.ATTACKING
        : MatchPhase.BUILD_UP;
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

}
