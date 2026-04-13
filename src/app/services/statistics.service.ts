import { Injectable } from '@angular/core';
import { MatchState, PlayByPlayEvent } from '../models/simulation.types';
import { MatchStatistics, Team, Player, PlayerStatistics } from '../models/types';
import { EventType, Position } from '../models/enums';
import { resolveTeamPlayers } from '../models/team-players';

@Injectable({
  providedIn: 'root'
})
export class StatisticsService {
  
  generateMatchStatistics(matchState: MatchState, homeTeam: Team, awayTeam: Team): MatchStatistics {
    const homeEvents = matchState.events.filter(e => this.isHomeTeamEvent(e, homeTeam));
    const awayEvents = matchState.events.filter(e => this.isAwayTeamEvent(e, awayTeam));

    return {
      possession: {
        home: matchState.homePossession,
        away: matchState.awayPossession
      },
      shots: {
        home: matchState.homeShots,
        away: matchState.awayShots
      },
      shotsOnTarget: {
        home: matchState.homeShotsOnTarget,
        away: matchState.awayShotsOnTarget
      },
      corners: {
        home: matchState.homeCorners,
        away: matchState.awayCorners
      },
      fouls: {
        home: matchState.homeFouls,
        away: matchState.awayFouls
      },
      cards: {
        home: {
          yellow: matchState.homeYellowCards,
          red: matchState.homeRedCards
        },
        away: {
          yellow: matchState.awayYellowCards,
          red: matchState.awayRedCards
        }
      },
      passes: {
        home: this.calculatePasses(homeEvents),
        away: this.calculatePasses(awayEvents)
      },
      tackles: {
        home: this.calculateTackles(homeEvents),
        away: this.calculateTackles(awayEvents)
      },
      saves: {
        home: this.calculateSaves(homeEvents),
        away: this.calculateSaves(awayEvents)
      }
    };
  }

  generatePlayerStatistics(matchState: MatchState, team: Team, players?: Player[]): PlayerStatistics[] {
    const playerStats: PlayerStatistics[] = [];
    const teamPlayers = resolveTeamPlayers(team, players);

    teamPlayers.forEach(player => {
      const playerEvents = matchState.events.filter(e => e.playerIds.includes(player.id));
      const primaryPlayerEvents = playerEvents.filter(e => e.playerIds[0] === player.id);
      const passEvents = playerEvents.filter(e => e.type === EventType.PASS && e.playerIds[0] === player.id);
      
      const stats: PlayerStatistics = {
        playerId: player.id,
        playerName: player.name,
        position: player.position,
        minutesPlayed: matchState.currentMinute,
        passes: passEvents.length,
        passesSuccessful: passEvents.filter(e => e.success).length,
        shots: playerEvents.filter(e => e.type === EventType.SHOT).length,
        shotsOnTarget: playerEvents.filter(e => e.type === EventType.SHOT && e.success).length,
        goals: playerEvents.filter(e => e.type === EventType.GOAL).length,
        assists: this.calculateAssists(playerEvents, matchState.events),
        tackles: player.position === Position.GOALKEEPER ? 0 : playerEvents.filter(e => e.type === EventType.TACKLE).length,
        tacklesSuccessful: player.position === Position.GOALKEEPER ? 0 : playerEvents.filter(e => e.type === EventType.TACKLE && e.success).length,
        interceptions: playerEvents.filter(e => e.type === EventType.INTERCEPTION).length,
        fouls: primaryPlayerEvents.filter(e => e.type === EventType.FOUL).length,
        foulsSuffered: playerEvents.filter(e => e.type === EventType.FOUL && e.playerIds[1] === player.id).length,
        yellowCards: primaryPlayerEvents.filter(e => e.type === EventType.YELLOW_CARD).length,
        redCards: primaryPlayerEvents.filter(e => e.type === EventType.RED_CARD).length,
        saves: playerEvents.filter(e => e.type === EventType.SAVE && e.playerIds[1] === player.id).length,
        rating: this.calculatePlayerRating(player, playerEvents, primaryPlayerEvents)
      };

      playerStats.push(stats);
    });

    return playerStats.sort((a, b) => b.rating - a.rating);
  }

  generateTeamStatistics(team: Team, matchStates: MatchState[]): TeamSeasonStatistics {
    const homeMatches = matchStates.filter(ms => ms.ballPossession.teamId === team.id);
    const awayMatches = matchStates.filter(ms => ms.ballPossession.teamId !== team.id);

    const allMatches = [...homeMatches, ...awayMatches];

    return {
      teamId: team.id,
      teamName: team.name,
      matchesPlayed: allMatches.length,
      wins: allMatches.filter(ms => this.getMatchResult(ms, team.id) === 'W').length,
      draws: allMatches.filter(ms => this.getMatchResult(ms, team.id) === 'D').length,
      losses: allMatches.filter(ms => this.getMatchResult(ms, team.id) === 'L').length,
      goalsFor: allMatches.reduce((sum, ms) => sum + (ms.ballPossession.teamId === team.id ? ms.homeScore : ms.awayScore), 0),
      goalsAgainst: allMatches.reduce((sum, ms) => sum + (ms.ballPossession.teamId === team.id ? ms.awayScore : ms.homeScore), 0),
      shotsPerGame: allMatches.reduce((sum, ms) => sum + ms.homeShots + ms.awayShots, 0) / allMatches.length,
      possessionPerGame: allMatches.reduce((sum, ms) => sum + ms.homePossession, 0) / allMatches.length,
      cornersPerGame: allMatches.reduce((sum, ms) => sum + ms.homeCorners + ms.awayCorners, 0) / allMatches.length,
      foulsPerGame: allMatches.reduce((sum, ms) => sum + ms.homeFouls + ms.awayFouls, 0) / allMatches.length,
      cardsPerGame: {
        yellow: allMatches.reduce((sum, ms) => sum + ms.homeYellowCards + ms.awayYellowCards, 0) / allMatches.length,
        red: allMatches.reduce((sum, ms) => sum + ms.homeRedCards + ms.awayRedCards, 0) / allMatches.length
      }
    };
  }

  generateHeatMapData(matchState: MatchState, teamId: string): HeatMapData {
    const teamEvents = matchState.events.filter(e => 
      e.playerIds.some(_pid => {
        // This would need to be enhanced to check which team the player belongs to
        return true; // Placeholder
      })
    );

    const heatMap: number[][] = Array(10).fill(0).map(() => Array(10).fill(0));

    teamEvents.forEach(event => {
      const gridX = Math.floor(event.location.x / 10);
      const gridY = Math.floor(event.location.y / 10);
      
      if (gridX >= 0 && gridX < 10 && gridY >= 0 && gridY < 10) {
        heatMap[gridY][gridX]++;
      }
    });

    return {
      teamId,
      heatMap,
      totalEvents: teamEvents.length
    };
  }

  generatePassingNetwork(matchState: MatchState, teamId: string): PassingNetwork {
    const teamPasses = matchState.events.filter(e => e.type === EventType.PASS && e.success);
    
    const nodes: NetworkNode[] = [];
    const links: NetworkLink[] = [];

    // Create nodes for players who participated in passes
    const playerIds = new Set<string>();
    teamPasses.forEach(pass => {
      playerIds.add(pass.playerIds[0]);
      playerIds.add(pass.playerIds[1]);
    });

    playerIds.forEach(playerId => {
      nodes.push({
        id: playerId,
        name: playerId, // Would need to map to actual player name
        value: teamPasses.filter(p => p.playerIds[0] === playerId).length
      });
    });

    // Create links for successful passes
    teamPasses.forEach(pass => {
      links.push({
        source: pass.playerIds[0],
        target: pass.playerIds[1],
        value: 1
      });
    });

    return {
      teamId,
      nodes,
      links
    };
  }

  private isHomeTeamEvent(_event: PlayByPlayEvent, _homeTeam: Team): boolean {
    // This would need to be enhanced to properly determine team affiliation
    return true; // Placeholder
  }

  private isAwayTeamEvent(_event: PlayByPlayEvent, _awayTeam: Team): boolean {
    // This would need to be enhanced to properly determine team affiliation
    return true; // Placeholder
  }

  private calculatePasses(events: PlayByPlayEvent[]): number {
    return events.filter(e => e.type === EventType.PASS).length;
  }

  private calculateTackles(events: PlayByPlayEvent[]): number {
    return events.filter(e => e.type === EventType.TACKLE).length;
  }

  private calculateSaves(events: PlayByPlayEvent[]): number {
    return events.filter(e => e.type === EventType.SAVE).length;
  }

  private calculateAssists(playerEvents: PlayByPlayEvent[], allEvents: PlayByPlayEvent[]): number {
    let assists = 0;
    
    playerEvents.forEach(event => {
      if (event.type === EventType.PASS && event.success) {
        // Check if next goal was assisted by this pass
        const goalEvent = allEvents.find(e => 
          e.time > event.time && 
          e.type === EventType.GOAL && 
          e.playerIds[0] !== event.playerIds[0]
        );
        
        if (goalEvent) assists++;
      }
    });

    return assists;
  }

  private calculatePlayerRating(player: Player, events: PlayByPlayEvent[], primaryPlayerEvents: PlayByPlayEvent[]): number {
    let rating = player.overall;

    // Positive contributions
    const goals = events.filter(e => e.type === EventType.GOAL).length;
    const assists = this.calculateAssists(events, events);
    const successfulPasses = events.filter(e => e.type === EventType.PASS && e.success && e.playerIds[0] === player.id).length;
    const tackles = player.position === Position.GOALKEEPER ? 0 : events.filter(e => e.type === EventType.TACKLE && e.success).length;

    // Negative contributions
    const fouls = primaryPlayerEvents.filter(e => e.type === EventType.FOUL).length;
    const yellowCards = primaryPlayerEvents.filter(e => e.type === EventType.YELLOW_CARD).length;
    const redCards = primaryPlayerEvents.filter(e => e.type === EventType.RED_CARD).length;

    // Rating calculation
    rating += (goals * 10) + (assists * 5) + (successfulPasses * 0.1) + (tackles * 2);
    rating -= (fouls * 2) + (yellowCards * 5) + (redCards * 15);

    return Math.max(1, Math.min(100, Math.round(rating)));
  }

  private getMatchResult(matchState: MatchState, teamId: string): 'W' | 'D' | 'L' {
    const isHomeTeam = matchState.ballPossession.teamId === teamId;
    const teamScore = isHomeTeam ? matchState.homeScore : matchState.awayScore;
    const opponentScore = isHomeTeam ? matchState.awayScore : matchState.homeScore;

    if (teamScore > opponentScore) return 'W';
    if (teamScore < opponentScore) return 'L';
    return 'D';
  }
}

export interface TeamSeasonStatistics {
  teamId: string;
  teamName: string;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  shotsPerGame: number;
  possessionPerGame: number;
  cornersPerGame: number;
  foulsPerGame: number;
  cardsPerGame: {
    yellow: number;
    red: number;
  };
}

export interface HeatMapData {
  teamId: string;
  heatMap: number[][];
  totalEvents: number;
}

export interface PassingNetwork {
  teamId: string;
  nodes: NetworkNode[];
  links: NetworkLink[];
}

export interface NetworkNode {
  id: string;
  name: string;
  value: number;
}

export interface NetworkLink {
  source: string;
  target: string;
  value: number;
}