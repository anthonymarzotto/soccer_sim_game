import { Injectable, inject } from '@angular/core';
import { Match, Team, Player, Position } from '../models/types';
import { 
  MatchState, 
  PlayByPlayEvent, 
  Coordinates, 
  FieldZone, 
  TacticalSetup, 
  PlayerFatigue, 
  SimulationConfig 
} from '../models/simulation.types';
import { resolveTeamPlayers } from '../models/team-players';
import { FieldService } from './field.service';
import { FormationLibraryService } from './formation-library.service';
import { CommentaryService } from './commentary.service';
import { RngService } from './rng.service';
import { EventType, CommentaryStyle, PlayingStyle, MatchPhase, Role, Position as PositionEnum } from '../models/enums';

interface MatchAction {
  type: EventType;
  player: Player;
  goalkeeper?: Player;
}

interface ResolvedRosters {
  homePlayers: Player[];
  awayPlayers: Player[];
}

export const MATCH_SIMULATION_DEFAULT_CONFIG: SimulationConfig = {
  enablePlayByPlay: true,
  enableSpatialTracking: true,
  enableTactics: true,
  enableFatigue: true,
  commentaryStyle: CommentaryStyle.DETAILED,
  simulationVariant: 'A'
};

@Injectable({
  providedIn: 'root'
})
export class MatchSimulationService {
  private fieldService = inject(FieldService);
  private formationLibrary = inject(FormationLibraryService);
  private commentaryService = inject(CommentaryService);
  private rng = inject(RngService);
  private currentSimulationRosterResolveCount = 0;
  private lastSimulationRosterResolveCount = 0;

  private readonly DEFAULT_CONFIG: SimulationConfig = MATCH_SIMULATION_DEFAULT_CONFIG;

  private resolvePlayers(team: Team): Player[] {
    this.currentSimulationRosterResolveCount++;
    return resolveTeamPlayers(team);
  }

  private getLastSimulationRosterResolveCount(): number {
    return this.lastSimulationRosterResolveCount;
  }

  simulateMatch(match: Match, homeTeam: Team, awayTeam: Team, config: SimulationConfig = this.DEFAULT_CONFIG): MatchState {
    this.rng.beginSimulation(config.seed);

    // Simulate against isolated copies so in-match mutations never leak into canonical league state.
    const simulatedHomeTeam = structuredClone(homeTeam);
    const simulatedAwayTeam = structuredClone(awayTeam);

    this.currentSimulationRosterResolveCount = 0;
    const rosters: ResolvedRosters = {
      homePlayers: this.resolvePlayers(simulatedHomeTeam),
      awayPlayers: this.resolvePlayers(simulatedAwayTeam)
    };
    const initialState = this.initializeMatchState(match, simulatedHomeTeam, rosters.homePlayers);
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

    let currentState = initialState;

    // Simulate 90 minutes + stoppage time
    for (let minute = 1; minute <= 95; minute++) {
      currentState = this.simulateMinute(
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

    this.lastSimulationRosterResolveCount = this.currentSimulationRosterResolveCount;

    return currentState;
  }

  private initializeMatchState(_match: Match, homeTeam: Team, homePlayers: Player[]): MatchState {
    const initialPossession: MatchState['ballPossession'] = {
      teamId: homeTeam.id,
      playerWithBall: this.getRandomPlayerId(homeTeam, homePlayers),
      location: { x: 50, y: 50 },
      phase: MatchPhase.BUILD_UP,
      passes: 0,
      timeElapsed: 0
    };

    return {
      ballPossession: initialPossession,
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
    homePlayers: Player[] = this.resolvePlayers(homeTeam),
    awayPlayers: Player[] = this.resolvePlayers(awayTeam)
  ): { home: TacticalSetup; away: TacticalSetup } {

    return {
      home: this.fieldService.calculateTeamTactics(homeTeam, homePlayers),
      away: this.fieldService.calculateTeamTactics(awayTeam, awayPlayers)
    };
  }

  private initializeFatigue(
    homeTeam: Team,
    _awayTeam: Team,
    homePlayers: Player[] = this.resolvePlayers(homeTeam),
    awayPlayers: Player[] = this.resolvePlayers(_awayTeam)
  ): { home: PlayerFatigue[]; away: PlayerFatigue[] } {
    const createFatigue = (players: Player[]): PlayerFatigue[] => {
      return players.map(player => ({
        playerId: player.id,
        currentStamina: 100,
        fatigueLevel: 0,
        performanceModifier: 1.0
      }));
    };

    return {
      home: createFatigue(homePlayers),
      away: createFatigue(awayPlayers)
    };
  }

  private simulateMinute(
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

    // Update fatigue
    this.updateFatigue(fatigue, minute);

    // Determine action based on current possession and tactics
    const action = this.determineAction(state, tactics, fatigue, homeTeam, awayTeam, rosters);
    
    switch (action.type) {
      case EventType.PASS:
        this.handlePass(newState, action, homeTeam, awayTeam, tactics, fatigue, minute, config, rosters.homePlayers, rosters.awayPlayers);
        break;
      case EventType.SHOT:
        this.handleShot(newState, action, homeTeam, awayTeam, tactics, fatigue, minute, config, rosters.homePlayers, rosters.awayPlayers);
        break;
      case EventType.TACKLE:
        this.handleTackle(newState, action, homeTeam, awayTeam, tactics, fatigue, minute, config, rosters.homePlayers, rosters.awayPlayers);
        break;
      case EventType.GOAL:
        this.handleGoal(newState, action, homeTeam, awayTeam, minute, config, rosters.homePlayers, rosters.awayPlayers);
        break;
      case EventType.CORNER:
        this.handleCorner(newState, action, homeTeam, awayTeam, tactics, fatigue, minute, config, rosters.homePlayers, rosters.awayPlayers);
        break;
      case EventType.FOUL:
        this.handleFoul(newState, action, homeTeam, awayTeam, minute, config, rosters.homePlayers, rosters.awayPlayers);
        break;
    }

    // Update possession statistics
    this.updatePossessionStats(newState, homeTeam, rosters.homePlayers, awayTeam);

    return newState;
  }

  private determineAction(
    state: MatchState, 
    tactics: { home: TacticalSetup; away: TacticalSetup },
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    homeTeam: Team,
    awayTeam: Team,
    rosters: ResolvedRosters
  ): MatchAction {
    const currentTeam = state.ballPossession.teamId === tactics.home.teamId ? 'home' : 'away';
    const teamTactics = tactics[currentTeam];
    const teamFatigue = fatigue[currentTeam];

    // Get player with ball
    const currentTeamData = currentTeam === 'home'
      ? { team: homeTeam, players: rosters.homePlayers }
      : { team: awayTeam, players: rosters.awayPlayers };
    const player = this.getPlayerById(state.ballPossession.playerWithBall, currentTeamData.team, currentTeamData.players);
    const playerFatigue = teamFatigue.find(f => f.playerId === player.id);

    // Calculate action probabilities based on position, tactics, and fatigue
    const zone = this.fieldService.getZoneFromY(state.ballPossession.location.y);
    const baseShotChance = 0.1;
    const baseTackleChance = 0.2;
    const baseFoulChance = 0.05;

    // Adjust based on zone
    let shotChance = baseShotChance;
    let tackleChance = baseTackleChance;
    const foulChance = baseFoulChance;

    if (zone === FieldZone.ATTACK) {
      shotChance *= 2;
    } else if (zone === FieldZone.DEFENSE) {
      shotChance *= 0.1;
    }

    // Adjust based on tactics
    if (teamTactics.playingStyle === PlayingStyle.COUNTER_ATTACK) {
      shotChance *= 1.5;
    }

    // Adjust based on fatigue
    if (playerFatigue && playerFatigue.fatigueLevel > 70) {
      shotChance *= 0.6;
      tackleChance *= 1.2;
    }

    const random = this.rng.random();

    if (random < foulChance) return { type: EventType.FOUL, player: player };
    if (random < foulChance + tackleChance) return { type: EventType.TACKLE, player: player };
    if (random < foulChance + tackleChance + shotChance) return { type: EventType.SHOT, player: player };
    
    return { type: EventType.PASS, player: player };
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
    homePlayers: Player[] = this.resolvePlayers(homeTeam),
    awayPlayers: Player[] = this.resolvePlayers(awayTeam)
  ) {
    const passer = action.player;
    const currentTeam = state.ballPossession.teamId === tactics.home.teamId ? 'home' : 'away';
    const teamPlayers = currentTeam === 'home' ? homePlayers : awayPlayers;
    const opponentPlayers = currentTeam === 'home' ? awayPlayers : homePlayers;
    const teamTactics = tactics[currentTeam];
    const teamFatigue = fatigue[currentTeam];

    // Find target player based on tactics and position
    const targetPlayer = this.findPassTarget(passer, teamPlayers, teamTactics, state.ballPossession.location);
    
    if (!targetPlayer) {
      // Turnover
      this.createEvent(state, EventType.TACKLE, [passer.id], state.ballPossession.location, minute, false, config);
      state.ballPossession.teamId = currentTeam === 'home' ? awayTeam.id : homeTeam.id;
      state.ballPossession.playerWithBall = this.getRandomPlayerId(
        state.ballPossession.teamId === homeTeam.id ? homeTeam : awayTeam,
        opponentPlayers
      );
      return;
    }

    // Calculate pass success
    const passSuccess = this.calculatePassSuccess(passer, targetPlayer, teamTactics, teamFatigue);
    
    if (passSuccess) {
      state.ballPossession.playerWithBall = targetPlayer.id;
      state.ballPossession.passes++;
      
      // Move ball position towards target
      const targetPos = this.fieldService.getStartingPositionForPlayer(targetPlayer, teamTactics.formation);
      state.ballPossession.location = this.calculateNewBallPosition(state.ballPossession.location, targetPos);
      
      this.createEvent(state, EventType.PASS, [passer.id, targetPlayer.id], state.ballPossession.location, minute, true, config);
    } else {
      // Interception
      this.createEvent(state, EventType.INTERCEPTION, [passer.id], state.ballPossession.location, minute, false, config);
      state.ballPossession.teamId = currentTeam === 'home' ? awayTeam.id : homeTeam.id;
      state.ballPossession.playerWithBall = this.getRandomPlayerId(
        state.ballPossession.teamId === homeTeam.id ? homeTeam : awayTeam,
        opponentPlayers
      );
    }
  }

  private handleShot(
    state: MatchState, 
    action: MatchAction, 
    homeTeam: Team, 
    awayTeam: Team, 
    tactics: { home: TacticalSetup; away: TacticalSetup },
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    minute: number, 
    config: SimulationConfig,
    homePlayers: Player[] = this.resolvePlayers(homeTeam),
    awayPlayers: Player[] = this.resolvePlayers(awayTeam)
  ) {
    const shooter = action.player;
    const currentTeam = state.ballPossession.teamId === tactics.home.teamId ? 'home' : 'away';
    const opponentTeam = currentTeam === 'home' ? awayTeam : homeTeam;
    const opponentPlayers = currentTeam === 'home' ? awayPlayers : homePlayers;
    const teamTactics = tactics[currentTeam];
    const teamFatigue = fatigue[currentTeam];

    // Increment shot counter for the current team
    if (currentTeam === 'home') {
      state.homeShots++;
    } else {
      state.awayShots++;
    }

    // Find goalkeeper using schema-driven method
    const goalkeeper = this.getGoalkeeperForTeam(opponentTeam, opponentPlayers);
    
    // Calculate shot success
    const shotSuccess = this.calculateShotSuccess(shooter, goalkeeper, teamTactics, teamFatigue, state.ballPossession.location);
    
    if (shotSuccess.goal) {
      // Increment shots on target since it resulted in a goal
      if (currentTeam === 'home') {
        state.homeShotsOnTarget++;
      } else {
        state.awayShotsOnTarget++;
      }
      this.handleGoal(
        state,
        { type: EventType.GOAL, player: shooter, goalkeeper: goalkeeper },
        homeTeam,
        awayTeam,
        minute,
        config,
        homePlayers,
        awayPlayers
      );
    } else {
      // Shot on/off target
      const onTarget = shotSuccess.onTarget;
      
      // Increment shots on target if the shot was on target
      if (onTarget) {
        if (currentTeam === 'home') {
          state.homeShotsOnTarget++;
        } else {
          state.awayShotsOnTarget++;
        }
      }
      
      const eventType = onTarget ? EventType.SAVE : EventType.MISS;
      
      this.createEvent(state, eventType, [shooter.id, ...(goalkeeper?.id ? [goalkeeper.id] : [])], state.ballPossession.location, minute, onTarget, config);
      
      if (!onTarget) {
        // Corner or goal kick
        if (this.isCorner(state.ballPossession.location, currentTeam)) {
          this.createEvent(state, EventType.CORNER, [shooter.id], state.ballPossession.location, minute, false, config);
        }
      }
    }
  }

  private handleGoal(
    state: MatchState, 
    action: MatchAction, 
    homeTeam: Team, 
    awayTeam: Team, 
    minute: number, 
    config: SimulationConfig,
    homePlayers: Player[] = this.resolvePlayers(homeTeam),
    awayPlayers: Player[] = this.resolvePlayers(awayTeam)
  ) {
    const shooter = action.player;
    const currentTeam = state.ballPossession.teamId === homeTeam.id ? 'home' : 'away';
    
    if (currentTeam === 'home') {
      state.homeScore++;
    } else {
      state.awayScore++;
    }

    this.createEvent(state, EventType.GOAL, [shooter.id], state.ballPossession.location, minute, true, config);
    
    // Reset possession for kickoff
    state.ballPossession.teamId = currentTeam === 'home' ? awayTeam.id : homeTeam.id;
    state.ballPossession.playerWithBall = this.getRandomPlayerId(
      state.ballPossession.teamId === homeTeam.id ? homeTeam : awayTeam,
      state.ballPossession.teamId === homeTeam.id ? homePlayers : awayPlayers
    );
    state.ballPossession.location = { x: 50, y: 50 };
    state.ballPossession.passes = 0;
  }

  private handleTackle(
    state: MatchState, 
    action: MatchAction, 
    homeTeam: Team, 
    awayTeam: Team, 
    tactics: { home: TacticalSetup; away: TacticalSetup },
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    minute: number, 
    config: SimulationConfig,
    homePlayers: Player[] = this.resolvePlayers(homeTeam),
    awayPlayers: Player[] = this.resolvePlayers(awayTeam)
  ) {
    const tackler = action.player;
    const currentTeam = state.ballPossession.teamId === tactics.home.teamId ? 'home' : 'away';
    const opponentTeam = currentTeam === 'home' ? awayTeam : homeTeam;
    const opponentPlayers = currentTeam === 'home' ? awayPlayers : homePlayers;
    
    // Simple tackle success calculation
    const tacklerStats = this.getPlayerStats(tackler, opponentTeam, opponentPlayers);
    
    const tackleSuccess = this.rng.random() * 100 < (tacklerStats.skills.tackling + tacklerStats.physical.strength) / 2;
    
    if (tackleSuccess) {
      // Successful tackle
      this.createEvent(state, EventType.TACKLE, [tackler.id, state.ballPossession.playerWithBall], state.ballPossession.location, minute, true, config);
      state.ballPossession.teamId = opponentTeam.id;
      state.ballPossession.playerWithBall = this.getRandomPlayerId(opponentTeam, opponentPlayers);
    } else {
      // Failed tackle - possible foul
      const foulChance = 0.3;
      if (this.rng.random() < foulChance) {
        this.handleFoul(state, { type: EventType.FOUL, player: tackler }, homeTeam, awayTeam, minute, config, homePlayers, awayPlayers);
      }
    }
  }

  private handleCorner(
    state: MatchState, 
    action: MatchAction, 
    homeTeam: Team, 
    awayTeam: Team, 
    tactics: { home: TacticalSetup; away: TacticalSetup },
    _fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    minute: number, 
    config: SimulationConfig,
    homePlayers: Player[] = this.resolvePlayers(homeTeam),
    awayPlayers: Player[] = this.resolvePlayers(awayTeam)
  ) {
    const _shooter = action.player;
    const currentTeam = state.ballPossession.teamId === tactics.home.teamId ? 'home' : 'away';
    
    // Corner kick logic
    const cornerSuccess = this.rng.random() * 100 < 40; // 40% chance of dangerous corner
    
    if (cornerSuccess) {
      // Header attempt
      const headerPlayer = this.findHeaderPlayer(currentTeam === 'home' ? homePlayers : awayPlayers);
      
      const headerSuccess = this.rng.random() * 100 < headerPlayer.skills.heading;
      
      if (headerSuccess) {
        this.handleGoal(state, { type: EventType.GOAL, player: headerPlayer }, homeTeam, awayTeam, minute, config, homePlayers, awayPlayers);
      } else {
        this.createEvent(state, EventType.MISS, [headerPlayer.id], { x: 50, y: 95 }, minute, false, config);
      }
    }
    
    // Update corner stats
    if (currentTeam === 'home') {
      state.homeCorners++;
    } else {
      state.awayCorners++;
    }
  }

  private handleFoul(
    state: MatchState, 
    action: MatchAction, 
    homeTeam: Team, 
    awayTeam: Team, 
    minute: number, 
    config: SimulationConfig,
    homePlayers: Player[] = this.resolvePlayers(homeTeam),
    awayPlayers: Player[] = this.resolvePlayers(awayTeam)
  ) {
    const fouler = action.player;
    const currentTeam = state.ballPossession.teamId === homeTeam.id ? 'home' : 'away';
    
    // Foul statistics
    if (currentTeam === 'home') {
      state.homeFouls++;
    } else {
      state.awayFouls++;
    }
    
    // Card probability
    const cardChance = this.rng.random();
    if (cardChance > 0.9) {
      // Red card
      const cardType = this.rng.random() > 0.5 ? EventType.RED_CARD : EventType.YELLOW_CARD;
      this.createEvent(state, cardType, [fouler.id], state.ballPossession.location, minute, false, config);
      
      if (cardType === EventType.RED_CARD) {
        if (currentTeam === 'home') {
          state.homeRedCards++;
        } else {
          state.awayRedCards++;
        }
      } else {
        if (currentTeam === 'home') {
          state.homeYellowCards++;
        } else {
          state.awayYellowCards++;
        }
      }
    }
    
    // Free kick to opponent
    state.ballPossession.teamId = currentTeam === 'home' ? awayTeam.id : homeTeam.id;
    state.ballPossession.playerWithBall = this.getRandomPlayerId(
      state.ballPossession.teamId === homeTeam.id ? homeTeam : awayTeam,
      state.ballPossession.teamId === homeTeam.id ? homePlayers : awayPlayers
    );
  }

  private getPlayerStats(player: Player, team: Team, teamPlayers: Player[] = this.resolvePlayers(team)): Player {
    return teamPlayers.find(p => p.id === player.id) || player;
  }

  private findHeaderPlayer(players: Player[]): Player {
    const headers = players.filter(p => p.position === Position.DEFENDER || p.position === Position.MIDFIELDER);
    return headers.length > 0 ? headers[0] : players[0];
  }

  private createEvent(
    state: MatchState, 
    type: PlayByPlayEvent['type'], 
    playerIds: string[], 
    location: Coordinates, 
    time: number, 
    success: boolean, 
    _config: SimulationConfig
  ) {
    const event: PlayByPlayEvent = {
      id: this.createRandomId(),
      type,
      description: '',
      playerIds,
      location,
      time,
      success
    };

    state.events.push(event);
  }

  private calculatePassSuccess(passer: Player, target: Player, tactics: TacticalSetup, fatigue: PlayerFatigue[]): boolean {
    const passerFatigue = fatigue.find(f => f.playerId === passer.id);
    const targetFatigue = fatigue.find(f => f.playerId === target.id);
    
    let baseChance = (passer.skills.shortPassing + passer.skills.longPassing) / 2;
    
    // Adjust for fatigue
    if (passerFatigue) baseChance *= passerFatigue.performanceModifier;
    if (targetFatigue) baseChance *= targetFatigue.performanceModifier;
    
    // Adjust for tactics
    if (tactics.playingStyle === PlayingStyle.POSSESSION) baseChance += 10;
    
    return this.rng.random() * 100 < baseChance;
  }

  private calculateShotSuccess(shooter: Player, goalkeeper: Player | undefined, tactics: TacticalSetup, fatigue: PlayerFatigue[], location: Coordinates): { goal: boolean; onTarget: boolean } {
    const shooterFatigue = fatigue.find(f => f.playerId === shooter.id);
    let shotPower = shooter.skills.shooting;
    
    if (shooterFatigue) shotPower *= shooterFatigue.performanceModifier;

    // Adjust for distance from goal (getDistance now returns metres).
    // 0.5 coefficient: penalty spot (~11m) → -5.5; centre circle (~52m) → -26.
    const distance = this.fieldService.getDistance(location, { x: 50, y: 100 });
    shotPower -= (distance * 0.5);

    // Bonus for shooting from inside the penalty area.
    if (this.fieldService.isInPenaltyArea(location)) {
      shotPower += 15;
    }

    const onTarget = this.rng.random() * 100 < shotPower;
    
    if (!onTarget) return { goal: false, onTarget: false };
    
    // Calculate if goal
    let saveChance = goalkeeper ? goalkeeper.skills.goalkeeping : 50;
    const goalkeeperFatigue = fatigue.find(f => f.playerId === goalkeeper?.id);
    if (goalkeeperFatigue) saveChance *= goalkeeperFatigue.performanceModifier;
    
    const goal = this.rng.random() * 100 > saveChance;
    
    return { goal, onTarget: true };
  }

  private updateFatigue(fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] }, _minute: number) {
    Object.values(fatigue).forEach(teamFatigue => {
      teamFatigue.forEach(f => {
        f.fatigueLevel = Math.min(100, f.fatigueLevel + 0.5);
        f.currentStamina = Math.max(0, f.currentStamina - 0.3);
        f.performanceModifier = Math.max(0.5, 1.0 - (f.fatigueLevel / 200));
      });
    });
  }

  private updatePossessionStats(state: MatchState, homeTeam: Team, homePlayers: Player[], _awayTeam: Team) {
    // Calculate possession based on time spent in possession
    // This is a simplified calculation - in a real simulation, you'd track actual possession time
    const totalEvents = state.events.length;
    if (totalEvents > 0) {
      const homeEvents = state.events.filter(e => 
        e.playerIds.some(playerId => {
          // Check if player belongs to home team
          const player = this.findPlayerById(playerId, homePlayers);
          return player !== null;
        })
      );
      
      const homeEventRatio = homeEvents.length / totalEvents;
      state.homePossession = Math.round(homeEventRatio * 100);
      state.awayPossession = 100 - state.homePossession;
    }
  }

  private findPlayerById(playerId: string, players: Player[]): Player | null {
    const player = players.find(p => p.id === playerId);
    return player || null;
  }

  private findPassTarget(passer: Player, teamPlayers: Player[], tactics: TacticalSetup, currentLocation: Coordinates): Player | null {
    // Find players in similar or attacking zone
    const zone = this.fieldService.getZoneFromY(currentLocation.y);
    const _targetZone = zone === FieldZone.DEFENSE ? FieldZone.MIDFIELD : zone === FieldZone.MIDFIELD ? FieldZone.ATTACK : FieldZone.ATTACK;
    
    const potentialTargets = teamPlayers.filter(p => 
      p.id !== passer.id && 
      p.role === Role.STARTER
    );

    if (potentialTargets.length === 0) return null;

    // Sort by distance and role appropriateness
    potentialTargets.sort((a, b) => {
      const aDist = this.fieldService.getDistance(currentLocation, this.fieldService.getStartingPositionForPlayer(a, tactics.formation));
      const bDist = this.fieldService.getDistance(currentLocation, this.fieldService.getStartingPositionForPlayer(b, tactics.formation));
      return aDist - bDist;
    });

    return potentialTargets[0];
  }

  private calculateNewBallPosition(current: Coordinates, target: Coordinates): Coordinates {
    return {
      x: (current.x + target.x) / 2,
      y: (current.y + target.y) / 2
    };
  }

  private isCorner(location: Coordinates, _team: 'home' | 'away', _minute?: number): boolean {
    // Ball must be within ~8.4m of the goal line (y > 92) and within ~5.4m of a touchline (x < 8 || x > 92).
    // Old y > 90 threshold was 10.5m from goal — too deep into the pitch.
    return location.y > 92 && (location.x < 8 || location.x > 92);
  }

  private getRandomPlayerId(team: Team, teamPlayers: Player[] = this.resolvePlayers(team)): string {
    const players = teamPlayers.filter(p => p.role === Role.STARTER);
    return players[Math.floor(this.rng.random() * players.length)].id;
  }

  private createRandomId(): string {
    return this.rng.random().toString(36).substring(2, 9);
  }

  private getPlayerById(playerId: string, team: Team, teamPlayers: Player[] = this.resolvePlayers(team)): Player {
    const player = teamPlayers.find(p => p.id === playerId);
    if (!player) {
      throw new Error(`Player with ID ${playerId} not found in team ${team.name}`);
    }
    return player;
  }

  /**
   * Get the goalkeeper for a team based on their selected formation schema.
   * Returns undefined if no goalkeeper is found or formation schema is invalid.
   */
  private getGoalkeeperForTeam(team: Team, teamPlayers: Player[] = this.resolvePlayers(team)): Player | undefined {
    // Get the formation schema for this team
    const schema = this.formationLibrary.getFormationById(team.selectedFormationId);
    if (!schema) {
      // Formation not found; fallback to first goalkeeper
      return teamPlayers.find(p => p.position === PositionEnum.GOALKEEPER && p.role === Role.STARTER);
    }

    // Find the goalkeeper slot in the formation (preferredPosition is GOALKEEPER)
    const goalkeeperSlot = schema.slots.find(s => s.preferredPosition === PositionEnum.GOALKEEPER);
    if (!goalkeeperSlot) {
      // No goalkeeper slot defined; fallback to search
      return teamPlayers.find(p => p.position === PositionEnum.GOALKEEPER && p.role === Role.STARTER);
    }

    // Get the player assigned to the goalkeeper slot
    const goalkeeperPlayerId = team.formationAssignments[goalkeeperSlot.slotId];
    if (!goalkeeperPlayerId) {
      return undefined;
    }

    return teamPlayers.find(p => p.id === goalkeeperPlayerId);
  }
}