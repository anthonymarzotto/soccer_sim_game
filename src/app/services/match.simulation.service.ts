import { Injectable } from '@angular/core';
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
import { FieldService } from './field.service';
import { CommentaryService } from './commentary.service';
import { EventType, CommentaryStyle, PlayingStyle, Mentality, MatchPhase, Role } from '../models/enums';

@Injectable({
  providedIn: 'root'
})
export class MatchSimulationService {
  private fieldService: FieldService;
  private commentaryService: CommentaryService;

  constructor() {
    this.fieldService = new FieldService();
    this.commentaryService = new CommentaryService();
  }

  private readonly DEFAULT_CONFIG: SimulationConfig = {
    enablePlayByPlay: true,
    enableSpatialTracking: true,
    enableTactics: true,
    enableFatigue: true,
    commentaryStyle: CommentaryStyle.DETAILED
  };

  simulateMatch(match: Match, homeTeam: Team, awayTeam: Team, config: SimulationConfig = this.DEFAULT_CONFIG): MatchState {
    const initialState = this.initializeMatchState(match, homeTeam, awayTeam);
    const tactics = this.calculateTeamTactics(homeTeam, awayTeam);
    const fatigue = this.initializeFatigue(homeTeam, awayTeam);

    let currentState = initialState;

    // Simulate 90 minutes + stoppage time
    for (let minute = 1; minute <= 95; minute++) {
      currentState = this.simulateMinute(currentState, tactics, fatigue, homeTeam, awayTeam, minute, config);
      
      // Check if game should end early (e.g., too many goals difference)
      if (this.shouldEndEarly(currentState)) break;
    }

    return currentState;
  }

  private initializeMatchState(match: Match, homeTeam: Team, awayTeam: Team): MatchState {
    const initialPossession: MatchState['ballPossession'] = {
      teamId: homeTeam.id,
      playerWithBall: this.getRandomPlayerId(homeTeam),
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

  private calculateTeamTactics(homeTeam: Team, awayTeam: Team): { home: TacticalSetup; away: TacticalSetup } {
    const optimalHomeFormation = this.fieldService.getOptimalFormation(homeTeam);
    const optimalAwayFormation = this.fieldService.getOptimalFormation(awayTeam);

    return {
      home: this.fieldService.calculateTeamTactics(homeTeam, optimalHomeFormation),
      away: this.fieldService.calculateTeamTactics(awayTeam, optimalAwayFormation)
    };
  }

  private initializeFatigue(homeTeam: Team, awayTeam: Team): { home: PlayerFatigue[]; away: PlayerFatigue[] } {
    const createFatigue = (team: Team): PlayerFatigue[] => {
      return team.players.map(player => ({
        playerId: player.id,
        currentStamina: 100,
        fatigueLevel: 0,
        performanceModifier: 1.0
      }));
    };

    return {
      home: createFatigue(homeTeam),
      away: createFatigue(awayTeam)
    };
  }

  private simulateMinute(
    state: MatchState, 
    tactics: { home: TacticalSetup; away: TacticalSetup },
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    homeTeam: Team, 
    awayTeam: Team, 
    minute: number, 
    config: SimulationConfig
  ): MatchState {
    const newState = { ...state };
    newState.currentMinute = minute;

    // Update fatigue
    this.updateFatigue(fatigue, minute);

    // Determine action based on current possession and tactics
    const action = this.determineAction(state, tactics, fatigue, homeTeam, awayTeam, minute);
    
    switch (action.type) {
      case EventType.PASS:
        this.handlePass(newState, action, homeTeam, awayTeam, tactics, fatigue, minute, config);
        break;
      case EventType.SHOT:
        this.handleShot(newState, action, homeTeam, awayTeam, tactics, fatigue, minute, config);
        break;
      case EventType.TACKLE:
        this.handleTackle(newState, action, homeTeam, awayTeam, tactics, fatigue, minute, config);
        break;
      case EventType.GOAL:
        this.handleGoal(newState, action, homeTeam, awayTeam, minute, config);
        break;
      case EventType.CORNER:
        this.handleCorner(newState, action, homeTeam, awayTeam, tactics, fatigue, minute, config);
        break;
      case EventType.FOUL:
        this.handleFoul(newState, action, homeTeam, awayTeam, minute, config);
        break;
    }

    // Update possession statistics
    this.updatePossessionStats(newState, homeTeam, awayTeam);

    return newState;
  }

  private determineAction(
    state: MatchState, 
    tactics: { home: TacticalSetup; away: TacticalSetup },
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    homeTeam: Team,
    awayTeam: Team,
    minute: number
  ): any {
    const currentTeam = state.ballPossession.teamId === tactics.home.teamId ? 'home' : 'away';
    const teamTactics = tactics[currentTeam];
    const teamFatigue = fatigue[currentTeam];

    // Get player with ball
    const player = this.getPlayerById(state.ballPossession.playerWithBall, currentTeam === 'home' ? homeTeam : awayTeam);
    const playerFatigue = teamFatigue.find(f => f.playerId === player.id);

    // Calculate action probabilities based on position, tactics, and fatigue
    const zone = this.fieldService.getZoneFromY(state.ballPossession.location.y);
    const basePassChance = 0.6;
    const baseShotChance = 0.1;
    const baseTackleChance = 0.2;
    const baseFoulChance = 0.05;

    // Adjust based on zone
    let passChance = basePassChance;
    let shotChance = baseShotChance;
    let tackleChance = baseTackleChance;
    let foulChance = baseFoulChance;

    if (zone === FieldZone.ATTACK) {
      shotChance *= 2;
      passChance *= 0.8;
    } else if (zone === FieldZone.DEFENSE) {
      passChance *= 1.2;
      shotChance *= 0.1;
    }

    // Adjust based on tactics
    if (teamTactics.playingStyle === PlayingStyle.POSSESSION) {
      passChance *= 1.3;
      shotChance *= 0.7;
    } else if (teamTactics.playingStyle === PlayingStyle.COUNTER_ATTACK) {
      shotChance *= 1.5;
      passChance *= 0.8;
    }

    // Adjust based on fatigue
    if (playerFatigue && playerFatigue.fatigueLevel > 70) {
      passChance *= 0.8;
      shotChance *= 0.6;
      tackleChance *= 1.2;
    }

    const random = Math.random();

    if (random < foulChance) return { type: EventType.FOUL, player: player };
    if (random < foulChance + tackleChance) return { type: EventType.TACKLE, player: player };
    if (random < foulChance + tackleChance + shotChance) return { type: EventType.SHOT, player: player };
    
    return { type: EventType.PASS, player: player };
  }

  private handlePass(
    state: MatchState, 
    action: any, 
    homeTeam: Team, 
    awayTeam: Team, 
    tactics: { home: TacticalSetup; away: TacticalSetup },
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    minute: number, 
    config: SimulationConfig
  ) {
    const passer = action.player;
    const currentTeam = state.ballPossession.teamId === tactics.home.teamId ? 'home' : 'away';
    const team = currentTeam === 'home' ? homeTeam : awayTeam;
    const teamTactics = tactics[currentTeam];
    const teamFatigue = fatigue[currentTeam];

    // Find target player based on tactics and position
    const targetPlayer = this.findPassTarget(passer, team, teamTactics, state.ballPossession.location);
    
    if (!targetPlayer) {
      // Turnover
      this.createEvent(state, EventType.TACKLE, [passer.id], state.ballPossession.location, minute, false, config);
      state.ballPossession.teamId = currentTeam === 'home' ? awayTeam.id : homeTeam.id;
      state.ballPossession.playerWithBall = this.getRandomPlayerId(state.ballPossession.teamId === homeTeam.id ? homeTeam : awayTeam);
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
      state.ballPossession.playerWithBall = this.getRandomPlayerId(state.ballPossession.teamId === homeTeam.id ? homeTeam : awayTeam);
    }
  }

  private handleShot(
    state: MatchState, 
    action: any, 
    homeTeam: Team, 
    awayTeam: Team, 
    tactics: { home: TacticalSetup; away: TacticalSetup },
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    minute: number, 
    config: SimulationConfig
  ) {
    const shooter = action.player;
    const currentTeam = state.ballPossession.teamId === tactics.home.teamId ? 'home' : 'away';
    const opponentTeam = currentTeam === 'home' ? awayTeam : homeTeam;
    const teamTactics = tactics[currentTeam];
    const teamFatigue = fatigue[currentTeam];

    // Find goalkeeper
    const goalkeeper = opponentTeam.players.find(p => p.role === Role.GOALKEEPER);
    
    // Calculate shot success
    const shotSuccess = this.calculateShotSuccess(shooter, goalkeeper, teamTactics, teamFatigue, state.ballPossession.location);
    
    if (shotSuccess.goal) {
      this.handleGoal(state, { player: shooter, goalkeeper: goalkeeper }, homeTeam, awayTeam, minute, config);
    } else {
      // Shot on/off target
      const onTarget = shotSuccess.onTarget;
      const eventType = onTarget ? EventType.SAVE : EventType.MISS;
      
      this.createEvent(state, eventType, [shooter.id, goalkeeper?.id].filter(Boolean), state.ballPossession.location, minute, onTarget, config);
      
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
    action: any, 
    homeTeam: Team, 
    awayTeam: Team, 
    minute: number, 
    config: SimulationConfig
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
    state.ballPossession.playerWithBall = this.getRandomPlayerId(state.ballPossession.teamId === homeTeam.id ? homeTeam : awayTeam);
    state.ballPossession.location = { x: 50, y: 50 };
    state.ballPossession.passes = 0;
  }

  private handleTackle(
    state: MatchState, 
    action: any, 
    homeTeam: Team, 
    awayTeam: Team, 
    tactics: { home: TacticalSetup; away: TacticalSetup },
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    minute: number, 
    config: SimulationConfig
  ) {
    const tackler = action.player;
    const currentTeam = state.ballPossession.teamId === tactics.home.teamId ? 'home' : 'away';
    const opponentTeam = currentTeam === 'home' ? awayTeam : homeTeam;
    
    // Simple tackle success calculation
    const tacklerStats = this.getPlayerStats(tackler, opponentTeam);
    const ballCarrierStats = this.getPlayerStats(this.getPlayerById(state.ballPossession.playerWithBall, currentTeam === 'home' ? homeTeam : awayTeam), currentTeam === 'home' ? homeTeam : awayTeam);
    
    const tackleSuccess = Math.random() * 100 < (tacklerStats.skills.tackling + tacklerStats.physical.strength) / 2;
    
    if (tackleSuccess) {
      // Successful tackle
      this.createEvent(state, EventType.TACKLE, [tackler.id, state.ballPossession.playerWithBall], state.ballPossession.location, minute, true, config);
      state.ballPossession.teamId = opponentTeam.id;
      state.ballPossession.playerWithBall = this.getRandomPlayerId(opponentTeam);
    } else {
      // Failed tackle - possible foul
      const foulChance = 0.3;
      if (Math.random() < foulChance) {
        this.handleFoul(state, { player: tackler }, homeTeam, awayTeam, minute, config);
      }
    }
  }

  private handleCorner(
    state: MatchState, 
    action: any, 
    homeTeam: Team, 
    awayTeam: Team, 
    tactics: { home: TacticalSetup; away: TacticalSetup },
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    minute: number, 
    config: SimulationConfig
  ) {
    const shooter = action.player;
    const currentTeam = state.ballPossession.teamId === tactics.home.teamId ? 'home' : 'away';
    
    // Corner kick logic
    const cornerSuccess = Math.random() * 100 < 40; // 40% chance of dangerous corner
    
    if (cornerSuccess) {
      // Header attempt
      const headerPlayer = this.findHeaderPlayer(currentTeam === 'home' ? homeTeam : awayTeam);
      const goalkeeper = currentTeam === 'home' ? awayTeam : homeTeam;
      
      const headerSuccess = Math.random() * 100 < headerPlayer.skills.heading;
      
      if (headerSuccess) {
        this.handleGoal(state, { player: headerPlayer }, homeTeam, awayTeam, minute, config);
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
    action: any, 
    homeTeam: Team, 
    awayTeam: Team, 
    minute: number, 
    config: SimulationConfig
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
    const cardChance = Math.random();
    if (cardChance > 0.9) {
      // Red card
      const cardType = Math.random() > 0.5 ? EventType.RED_CARD : EventType.YELLOW_CARD;
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
    state.ballPossession.playerWithBall = this.getRandomPlayerId(state.ballPossession.teamId === homeTeam.id ? homeTeam : awayTeam);
  }

  private getPlayerStats(player: Player, team: Team): Player {
    return team.players.find(p => p.id === player.id) || player;
  }

  private findHeaderPlayer(team: Team): Player {
    const headers = team.players.filter(p => p.position === Position.DEFENDER || p.position === Position.MIDFIELDER);
    return headers.length > 0 ? headers[0] : team.players[0];
  }

  private createEvent(
    state: MatchState, 
    type: PlayByPlayEvent['type'], 
    playerIds: string[], 
    location: Coordinates, 
    time: number, 
    success: boolean, 
    config: SimulationConfig
  ) {
    const event: PlayByPlayEvent = {
      id: Math.random().toString(36).substring(2, 9),
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
    
    return Math.random() * 100 < baseChance;
  }

  private calculateShotSuccess(shooter: Player, goalkeeper: Player | undefined, tactics: TacticalSetup, fatigue: PlayerFatigue[], location: Coordinates): { goal: boolean; onTarget: boolean } {
    const shooterFatigue = fatigue.find(f => f.playerId === shooter.id);
    let shotPower = shooter.skills.shooting;
    
    if (shooterFatigue) shotPower *= shooterFatigue.performanceModifier;
    
    // Adjust for distance from goal
    const distance = this.fieldService.getDistance(location, { x: 50, y: 100 });
    shotPower -= (distance * 0.5);
    
    const onTarget = Math.random() * 100 < shotPower;
    
    if (!onTarget) return { goal: false, onTarget: false };
    
    // Calculate if goal
    let saveChance = goalkeeper ? goalkeeper.skills.goalkeeping : 50;
    const goalkeeperFatigue = fatigue.find(f => f.playerId === goalkeeper?.id);
    if (goalkeeperFatigue) saveChance *= goalkeeperFatigue.performanceModifier;
    
    const goal = Math.random() * 100 > saveChance;
    
    return { goal, onTarget: true };
  }

  private updateFatigue(fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] }, minute: number) {
    Object.values(fatigue).forEach(teamFatigue => {
      teamFatigue.forEach(f => {
        f.fatigueLevel = Math.min(100, f.fatigueLevel + 0.5);
        f.currentStamina = Math.max(0, f.currentStamina - 0.3);
        f.performanceModifier = Math.max(0.5, 1.0 - (f.fatigueLevel / 200));
      });
    });
  }

  private updatePossessionStats(state: MatchState, homeTeam: Team, awayTeam: Team) {
    // Simple possession calculation based on passes
    const totalPasses = state.homeShots + state.awayShots + state.homeCorners + state.awayCorners;
    if (totalPasses > 0) {
      state.homePossession = Math.round((state.homeShots / totalPasses) * 100);
      state.awayPossession = 100 - state.homePossession;
    }
  }

  private shouldEndEarly(state: MatchState): boolean {
    // End early if score difference is too large (optional)
    const scoreDiff = Math.abs(state.homeScore - state.awayScore);
    return scoreDiff >= 5 && state.currentMinute > 80;
  }

  private findPassTarget(passer: Player, team: Team, tactics: TacticalSetup, currentLocation: Coordinates): Player | null {
    // Find players in similar or attacking zone
    const zone = this.fieldService.getZoneFromY(currentLocation.y);
    const targetZone = zone === FieldZone.DEFENSE ? FieldZone.MIDFIELD : zone === FieldZone.MIDFIELD ? FieldZone.ATTACK : FieldZone.ATTACK;
    
    const potentialTargets = team.players.filter(p => 
      p.id !== passer.id && 
      p.role !== Role.NOT_DRESSED &&
      p.role !== Role.BENCH
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

  private isCorner(location: Coordinates, team: 'home' | 'away'): boolean {
    // Simple corner detection - ball goes out near goal
    return location.y > 90 && (location.x < 10 || location.x > 90);
  }

  private getRandomPlayerId(team: Team): string {
    const players = team.players.filter(p => p.role !== Role.NOT_DRESSED && p.role !== Role.BENCH);
    return players[Math.floor(Math.random() * players.length)].id;
  }

  private getPlayerById(playerId: string, team: Team): Player {
    const player = team.players.find(p => p.id === playerId);
    if (!player) {
      throw new Error(`Player with ID ${playerId} not found in team ${team.name}`);
    }
    return player;
  }
}