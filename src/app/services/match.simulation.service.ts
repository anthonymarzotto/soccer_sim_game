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
import { FieldService } from './field.service';
import { CommentaryService } from './commentary.service';
import { EventType, CommentaryStyle, PlayingStyle, MatchPhase, Role } from '../models/enums';

interface MatchAction {
  type: EventType;
  player: Player;
  goalkeeper?: Player;
}

@Injectable({
  providedIn: 'root'
})
export class MatchSimulationService {
  private fieldService = inject(FieldService);
  private commentaryService = inject(CommentaryService);

  private readonly DEFAULT_CONFIG: SimulationConfig = {
    enablePlayByPlay: true,
    enableSpatialTracking: true,
    enableTactics: true,
    enableFatigue: true,
    commentaryStyle: CommentaryStyle.DETAILED
  };

  simulateMatch(match: Match, homeTeam: Team, awayTeam: Team, config: SimulationConfig = this.DEFAULT_CONFIG): MatchState {
    const initialState = this.initializeMatchState(match, homeTeam);
    const tactics = this.calculateTeamTactics(homeTeam, awayTeam);
    const fatigue = this.initializeFatigue(homeTeam, awayTeam);

    let currentState = initialState;

    // Simulate 90 minutes + stoppage time
    for (let minute = 1; minute <= 95; minute++) {
      currentState = this.simulateMinute(currentState, tactics, fatigue, homeTeam, awayTeam, minute, config);
    }

    return currentState;
  }

  private initializeMatchState(_match: Match, homeTeam: Team): MatchState {
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

  private initializeFatigue(homeTeam: Team, _awayTeam: Team): { home: PlayerFatigue[]; away: PlayerFatigue[] } {
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
      away: createFatigue(_awayTeam)
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
    const action = this.determineAction(state, tactics, fatigue, homeTeam, awayTeam);
    
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
    awayTeam: Team
  ): MatchAction {
    const currentTeam = state.ballPossession.teamId === tactics.home.teamId ? 'home' : 'away';
    const teamTactics = tactics[currentTeam];
    const teamFatigue = fatigue[currentTeam];

    // Get player with ball
    const player = this.getPlayerById(state.ballPossession.playerWithBall, currentTeam === 'home' ? homeTeam : awayTeam);
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

    const random = Math.random();

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
    action: MatchAction, 
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

    // Increment shot counter for the current team
    if (currentTeam === 'home') {
      state.homeShots++;
    } else {
      state.awayShots++;
    }

    // Find goalkeeper
    const goalkeeper = opponentTeam.players.find(p => p.role === Role.GOALKEEPER);
    
    // Calculate shot success
    const shotSuccess = this.calculateShotSuccess(shooter, goalkeeper, teamTactics, teamFatigue, state.ballPossession.location);
    
    if (shotSuccess.goal) {
      // Increment shots on target since it resulted in a goal
      if (currentTeam === 'home') {
        state.homeShotsOnTarget++;
      } else {
        state.awayShotsOnTarget++;
      }
      this.handleGoal(state, { type: EventType.GOAL, player: shooter, goalkeeper: goalkeeper }, homeTeam, awayTeam, minute, config);
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
    action: MatchAction, 
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
        this.handleFoul(state, { type: EventType.FOUL, player: tackler }, homeTeam, awayTeam, minute, config);
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
    config: SimulationConfig
  ) {
    const _shooter = action.player;
    const currentTeam = state.ballPossession.teamId === tactics.home.teamId ? 'home' : 'away';
    
    // Corner kick logic
    const cornerSuccess = Math.random() * 100 < 40; // 40% chance of dangerous corner
    
    if (cornerSuccess) {
      // Header attempt
      const headerPlayer = this.findHeaderPlayer(currentTeam === 'home' ? homeTeam : awayTeam);
      
      const headerSuccess = Math.random() * 100 < headerPlayer.skills.heading;
      
      if (headerSuccess) {
        this.handleGoal(state, { type: EventType.GOAL, player: headerPlayer }, homeTeam, awayTeam, minute, config);
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
    _config: SimulationConfig
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

    // Adjust for distance from goal (getDistance now returns metres).
    // 0.5 coefficient: penalty spot (~11m) → -5.5; centre circle (~52m) → -26.
    const distance = this.fieldService.getDistance(location, { x: 50, y: 100 });
    shotPower -= (distance * 0.5);

    // Bonus for shooting from inside the penalty area.
    if (this.fieldService.isInPenaltyArea(location)) {
      shotPower += 15;
    }

    const onTarget = Math.random() * 100 < shotPower;
    
    if (!onTarget) return { goal: false, onTarget: false };
    
    // Calculate if goal
    let saveChance = goalkeeper ? goalkeeper.skills.goalkeeping : 50;
    const goalkeeperFatigue = fatigue.find(f => f.playerId === goalkeeper?.id);
    if (goalkeeperFatigue) saveChance *= goalkeeperFatigue.performanceModifier;
    
    const goal = Math.random() * 100 > saveChance;
    
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

  private updatePossessionStats(state: MatchState, homeTeam: Team, _awayTeam: Team) {
    // Calculate possession based on time spent in possession
    // This is a simplified calculation - in a real simulation, you'd track actual possession time
    const totalEvents = state.events.length;
    if (totalEvents > 0) {
      const homeEvents = state.events.filter(e => 
        e.playerIds.some(playerId => {
          // Check if player belongs to home team
          const player = this.findPlayerById(playerId, homeTeam);
          return player !== null;
        })
      );
      
      const homeEventRatio = homeEvents.length / totalEvents;
      state.homePossession = Math.round(homeEventRatio * 100);
      state.awayPossession = 100 - state.homePossession;
    }
  }

  private findPlayerById(playerId: string, team: Team): Player | null {
    const player = team.players.find(p => p.id === playerId);
    return player || null;
  }

  private findPassTarget(passer: Player, team: Team, tactics: TacticalSetup, currentLocation: Coordinates): Player | null {
    // Find players in similar or attacking zone
    const zone = this.fieldService.getZoneFromY(currentLocation.y);
    const _targetZone = zone === FieldZone.DEFENSE ? FieldZone.MIDFIELD : zone === FieldZone.MIDFIELD ? FieldZone.ATTACK : FieldZone.ATTACK;
    
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

  private isCorner(location: Coordinates, _team: 'home' | 'away', _minute?: number): boolean {
    // Ball must be within ~8.4m of the goal line (y > 92) and within ~5.4m of a touchline (x < 8 || x > 92).
    // Old y > 90 threshold was 10.5m from goal — too deep into the pitch.
    return location.y > 92 && (location.x < 8 || location.x > 92);
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