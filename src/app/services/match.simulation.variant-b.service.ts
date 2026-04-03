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

  goalChanceBase: 0.21,
  goalChanceSkillVsKeeperScale: 0.0033,
  goalChanceWidePenalty: 0.035,
  goalChanceMin: 0.1,
  goalChanceMax: 0.50
};

@Injectable({
  providedIn: 'root'
})
export class MatchSimulationVariantBService {
  private fieldService = inject(FieldService);
  private rng = inject(RngService);

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
      this.attachVariantBReplayMetadata(
        newState,
        minute,
        this.createReplayMetadata(carrier.id, action.type === 'CARRY' ? EventType.PASS : action.type, locationBeforeMove, locationBeforeAction, locationAfterAction)
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

    this.handlePass(
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

    const targetPlayer = this.findPassTarget(passer, teamPlayers, teamTactics, state.ballPossession.location);

    if (!targetPlayer) {
      this.createEvent(state, EventType.TACKLE, [passer.id], state.ballPossession.location, minute, false, config);
      state.ballPossession.teamId = currentTeam === 'home' ? awayTeam.id : homeTeam.id;
      state.ballPossession.playerWithBall = this.getRandomPlayerId(opponentPlayers);
      return;
    }

    const passSuccess = this.calculatePassSuccess(passer, targetPlayer, teamTactics, teamFatigue);

    if (passSuccess) {
      state.ballPossession.playerWithBall = targetPlayer.id;
      state.ballPossession.passes++;
      const targetPos = this.fieldService.getStartingPositionForPlayer(targetPlayer, teamTactics.formation);
      state.ballPossession.location = this.calculateNewBallPosition(state.ballPossession.location, targetPos);
      this.createEvent(state, EventType.PASS, [passer.id, targetPlayer.id], state.ballPossession.location, minute, true, config);
      return;
    }

    this.createEvent(state, EventType.INTERCEPTION, [passer.id], state.ballPossession.location, minute, false, config);
    state.ballPossession.teamId = currentTeam === 'home' ? awayTeam.id : homeTeam.id;
    state.ballPossession.playerWithBall = this.getRandomPlayerId(opponentPlayers);
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
    const currentTeam = state.ballPossession.teamId === homeTeam.id ? 'home' : 'away';

    if (currentTeam === 'home') {
      state.homeFouls++;
    } else {
      state.awayFouls++;
    }

    const cardChance = this.rng.random();
    if (cardChance > 0.9) {
      const cardType = this.rng.random() > 0.5 ? EventType.RED_CARD : EventType.YELLOW_CARD;
      this.createEvent(state, cardType, [action.player.id], state.ballPossession.location, minute, false, config);

      if (cardType === EventType.RED_CARD) {
        if (currentTeam === 'home') {
          state.homeRedCards++;
        } else {
          state.awayRedCards++;
        }
      } else if (currentTeam === 'home') {
        state.homeYellowCards++;
      } else {
        state.awayYellowCards++;
      }
    }

    state.ballPossession.teamId = currentTeam === 'home' ? awayTeam.id : homeTeam.id;
    state.ballPossession.playerWithBall = this.getRandomPlayerId(
      state.ballPossession.teamId === homeTeam.id ? homePlayers : awayPlayers
    );
  }

  private calculatePassSuccess(
    passer: Player,
    target: Player,
    tactics: TacticalSetup,
    fatigue: PlayerFatigue[]
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

    return this.rng.random() * 100 < baseChance;
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
    _config: SimulationConfig
  ): void {
    state.events.push({
      id: this.createRandomId(),
      type,
      description: '',
      playerIds,
      location,
      time,
      success
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

  private findPlayerById(playerId: string, players: Player[]): Player | null {
    return players.find(player => player.id === playerId) ?? null;
  }

  private findPassTarget(
    passer: Player,
    teamPlayers: Player[],
    tactics: TacticalSetup,
    currentLocation: Coordinates
  ): Player | null {
    const potentialTargets = teamPlayers.filter(player => player.id !== passer.id && player.role === Role.STARTER);

    if (potentialTargets.length === 0) {
      return null;
    }

    potentialTargets.sort((left, right) => {
      const leftDistance = this.fieldService.getDistance(
        currentLocation,
        this.fieldService.getStartingPositionForPlayer(left, tactics.formation)
      );
      const rightDistance = this.fieldService.getDistance(
        currentLocation,
        this.fieldService.getStartingPositionForPlayer(right, tactics.formation)
      );
      return leftDistance - rightDistance;
    });

    return potentialTargets[0];
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
