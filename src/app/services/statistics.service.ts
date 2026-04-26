import { Injectable } from '@angular/core';
import { MatchState, PlayByPlayEvent } from '../models/simulation.types';
import { MatchStatistics, Team, Player, PlayerStatistics } from '../models/types';
import { EventType, Position } from '../models/enums';
import { resolveTeamPlayers } from '../models/team-players';


@Injectable({
  providedIn: 'root'
})
export class StatisticsService {
  private static readonly MAX_SUCCESSFUL_PASS_BONUS = 6;
  private static readonly SUCCESSFUL_TACKLE_BONUS = 1;
  
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

  generatePlayerStatistics(matchState: MatchState, team: Team, players: Player[]): PlayerStatistics[] {
    const playerStats: PlayerStatistics[] = [];
    const teamPlayers = resolveTeamPlayers(team, players);
    const starterIds = new Set(Object.values(team.formationAssignments));
    const teamPlayerIds = new Set(teamPlayers.map(player => player.id));
    const assistsByPlayer = this.calculateAssistsByPlayer(matchState.events, teamPlayerIds);

    teamPlayers.forEach(player => {
      const isStarter = starterIds.has(player.id);
      const playerEvents = matchState.events.filter(e => e.playerIds.includes(player.id));
      const primaryPlayerEvents = playerEvents.filter(e => e.playerIds[0] === player.id);
      const passEvents = playerEvents.filter(e => e.type === EventType.PASS && e.playerIds[0] === player.id);
      const tackleEvents = primaryPlayerEvents.filter(e => e.type === EventType.TACKLE);
      const interceptionEvents = primaryPlayerEvents.filter(e => e.type === EventType.INTERCEPTION);
      const minutesPlayed = this.calculateMinutesPlayed(
        player.id,
        matchState.events,
        matchState.currentMinute,
        isStarter
      );
      const hasEnteredMatch = this.hasEnteredMatch(player.id, matchState.events, isStarter);

      const stats: PlayerStatistics = {
        playerId: player.id,
        playerName: player.name,
        position: player.position,
        minutesPlayed,
        passes: passEvents.length,
        passesSuccessful: passEvents.filter(e => e.success).length,
        shots: playerEvents.filter(e => e.type === EventType.SHOT).length,
        shotsOnTarget: playerEvents.filter(e => e.type === EventType.SHOT && e.success).length,
        goals: playerEvents.filter(e => e.type === EventType.GOAL).length,
        assists: assistsByPlayer.get(player.id) ?? 0,
        tackles: player.position === Position.GOALKEEPER ? 0 : tackleEvents.length,
        tacklesSuccessful: player.position === Position.GOALKEEPER ? 0 : tackleEvents.filter(e => e.success).length,
        interceptions: interceptionEvents.length,
        fouls: primaryPlayerEvents.filter(e => e.type === EventType.FOUL).length,
        foulsSuffered: playerEvents.filter(e => e.type === EventType.FOUL && e.playerIds[1] === player.id).length,
        yellowCards: primaryPlayerEvents.filter(e => e.type === EventType.YELLOW_CARD).length,
        redCards: primaryPlayerEvents.filter(e => e.type === EventType.RED_CARD).length,
        saves: playerEvents.filter(e => e.type === EventType.SAVE && e.playerIds[1] === player.id).length,
        rating: !hasEnteredMatch
          ? 0
          : this.calculatePlayerRating(player, playerEvents, primaryPlayerEvents, assistsByPlayer.get(player.id) ?? 0)
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

  private calculateAssistsByPlayer(allEvents: PlayByPlayEvent[], teamPlayerIds: Set<string>): Map<string, number> {
    const assistsByPlayer = new Map<string, number>();

    allEvents.forEach((event, index) => {
      if (event.type !== EventType.GOAL) {
        return;
      }

      const scorerId = event.playerIds[0];
      if (!scorerId || !teamPlayerIds.has(scorerId)) {
        return;
      }

      for (let i = index - 1; i >= 0; i--) {
        const priorEvent = allEvents[i];
        if (priorEvent.type !== EventType.PASS || !priorEvent.success) {
          continue;
        }

        const passerId = priorEvent.playerIds[0];
        const receiverId = priorEvent.playerIds[1];
        if (!passerId || !receiverId) {
          continue;
        }

        if (receiverId === scorerId && passerId !== scorerId && teamPlayerIds.has(passerId)) {
          assistsByPlayer.set(passerId, (assistsByPlayer.get(passerId) ?? 0) + 1);
        }

        // The last successful pass to the scorer is the only eligible assist event.
        break;
      }
    });

    return assistsByPlayer;
  }

  private calculatePlayerRating(player: Player, events: PlayByPlayEvent[], primaryPlayerEvents: PlayByPlayEvent[], assists: number): number {
    let rating = 50; // fixed base — event-driven, no ability anchor

    // Positive contributions
    const goals = events.filter(e => e.type === EventType.GOAL).length;
    const successfulPasses = events.filter(e => e.type === EventType.PASS && e.success && e.playerIds[0] === player.id).length;
    const tackles = player.position === Position.GOALKEEPER ? 0 : primaryPlayerEvents.filter(e => e.type === EventType.TACKLE && e.success).length;
    const saves = player.position === Position.GOALKEEPER
      ? events.filter(e => e.type === EventType.SAVE && e.playerIds[1] === player.id).length
      : 0;
    const interceptions = primaryPlayerEvents.filter(e => e.type === EventType.INTERCEPTION).length;
    const shotsOnTarget = events.filter(e => e.type === EventType.SHOT && e.success && e.playerIds[0] === player.id).length;
    const corners = events.filter(e => e.type === EventType.CORNER && e.playerIds[0] === player.id).length;
    const freeKicks = events.filter(e => e.type === EventType.FREE_KICK && e.playerIds[0] === player.id).length;
    const penalties = events.filter(e => e.type === EventType.PENALTY && e.playerIds[0] === player.id).length;
    const successfulPassBonus = this.getSuccessfulPassBonus(successfulPasses);
    const successfulTackleBonus = this.getSuccessfulTackleBonus(tackles);

    // Negative contributions
    const misses = primaryPlayerEvents.filter(e => e.type === EventType.MISS).length;
    const fouls = primaryPlayerEvents.filter(e => e.type === EventType.FOUL).length;
    const yellowCards = primaryPlayerEvents.filter(e => e.type === EventType.YELLOW_CARD).length;
    const redCards = primaryPlayerEvents.filter(e => e.type === EventType.RED_CARD).length;

    // Victim contributions
    const foulsSuffered = events.filter(e => e.type === EventType.FOUL && e.playerIds[1] === player.id).length;

    rating += (goals * 10) + (assists * 5) + successfulPassBonus + successfulTackleBonus;
    rating += (saves * 4) + (interceptions * 2) + (shotsOnTarget * 1) + (corners * 0.5) + (freeKicks * 0.5) + (penalties * 3);
    rating += (foulsSuffered * 0.5);
    rating -= (misses * 1) + (fouls * 2) + (yellowCards * 5) + (redCards * 15);

    return Math.max(1, Math.min(100, Math.round(rating)));
  }

  getSuccessfulPassBonus(successfulPasses: number): number {
    if (successfulPasses <= 0) {
      return 0;
    }

    // Keep passing meaningful while preventing high-tempo possessions from saturating ratings too early.
    const linearComponent = successfulPasses * 0.03;
    const volumeComponent = Math.log10(successfulPasses + 1) * 1.6;
    return Math.min(StatisticsService.MAX_SUCCESSFUL_PASS_BONUS, linearComponent + volumeComponent);
  }

  getSuccessfulTackleBonus(successfulTackles: number): number {
    if (successfulTackles <= 0) {
      return 0;
    }

    return successfulTackles * StatisticsService.SUCCESSFUL_TACKLE_BONUS;
  }

  private hasEnteredMatch(
    playerId: string,
    allEvents: PlayByPlayEvent[],
    isStarter: boolean
  ): boolean {
    if (isStarter) {
      return true;
    }

    return allEvents.some(
      e => e.type === EventType.SUBSTITUTION && e.playerIds[1] === playerId
    );
  }

  private calculateMinutesPlayed(
    playerId: string,
    allEvents: PlayByPlayEvent[],
    matchCurrentMinute: number,
    isStarter: boolean
  ): number {
    // Starter substituted off
    const subOffEvent = allEvents.find(
      e => e.type === EventType.SUBSTITUTION && e.playerIds[0] === playerId
    );
    if (subOffEvent) {
      return subOffEvent.time;
    }

    // Player came on as substitute
    const subOnEvent = allEvents.find(
      e => e.type === EventType.SUBSTITUTION && e.playerIds[1] === playerId
    );
    if (subOnEvent) {
      const redCardAfterSub = allEvents.find(
        e => e.type === EventType.RED_CARD && e.playerIds[0] === playerId && e.time > subOnEvent.time
      );
      if (redCardAfterSub) {
        return redCardAfterSub.time - subOnEvent.time;
      }
      return matchCurrentMinute - subOnEvent.time;
    }

    if (isStarter) {
      // Starter who played until sent off or end of match
      const redCardEvent = allEvents.find(
        e => e.type === EventType.RED_CARD && e.playerIds[0] === playerId
      );
      if (redCardEvent) {
        return redCardEvent.time;
      }
      return matchCurrentMinute;
    }

    // Bench player who never entered
    return 0;
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