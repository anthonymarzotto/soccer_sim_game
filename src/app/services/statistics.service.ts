import { Injectable } from '@angular/core';
import { MatchState, PlayByPlayEvent } from '../models/simulation.types';
import { MatchStatistics, Team, Player, PlayerStatistics } from '../models/types';
import { EventType, Position } from '../models/enums';
import { resolveTeamPlayers } from '../models/team-players';


export interface PlayerRatingBreakdownItem {
  label: string;
  count: number;
  points: number;
}

export interface PlayerRatingBreakdown {
  positiveItems: PlayerRatingBreakdownItem[];
  negativeItems: PlayerRatingBreakdownItem[];
  positiveTotal: number;
  negativeTotal: number;
}

@Injectable({
  providedIn: 'root'
})
export class StatisticsService {
  // Positional expectations per 90 minutes
  private static readonly EXPECTED_RATES = {
    [Position.GK]: {
      goals: 0,
      assists: 0,
      saves: 4.3,
      tacklesSuccessful: 0,
      interceptions: 0.16,
      shotsOnTarget: 0,
      misses: 0,
      fouls: 0,
      passesSuccessful: 5.3,
      passingTurnovers: 3.2
    },
    [Position.CB]: {
      goals: 0.05,
      assists: 0.02,
      saves: 0,
      tacklesSuccessful: 1.3,
      interceptions: 0.9,
      shotsOnTarget: 0.2,
      misses: 0.2,
      fouls: 0.7,
      passesSuccessful: 6.8,
      passingTurnovers: 2.9
    },
    [Position.FB]: {
      goals: 0.04,
      assists: 0.01,
      saves: 0,
      tacklesSuccessful: 0.4,
      interceptions: 0.25,
      shotsOnTarget: 0.2,
      misses: 0.2,
      fouls: 0.5,
      passesSuccessful: 3.3,
      passingTurnovers: 1.8
    },
    [Position.CDM]: {
      goals: 0.15,
      assists: 0.10,
      saves: 0,
      tacklesSuccessful: 1.5,
      interceptions: 0.8,
      shotsOnTarget: 0.2,
      misses: 0.2,
      fouls: 1.0,
      passesSuccessful: 6.4,
      passingTurnovers: 1.3
    },
    [Position.CM]: {
      goals: 0.1,
      assists: 0.12,
      saves: 0,
      tacklesSuccessful: 2.4,
      interceptions: 0.4,
      shotsOnTarget: 0.8,
      misses: 0.6,
      fouls: 0.4,
      passesSuccessful: 8.5,
      passingTurnovers: 2.3
    },
    [Position.CAM]: {
      goals: 0.0,
      assists: 0.12,
      saves: 0,
      tacklesSuccessful: 1.6,
      interceptions: 1.2,
      shotsOnTarget: 0.8,
      misses: 0.6,
      fouls: 0.4,
      passesSuccessful: 8.3,
      passingTurnovers: 2.5
    },
    [Position.WNG]: {
      goals: 0.1,
      assists: 0.05,
      saves: 0,
      tacklesSuccessful: 0.5,
      interceptions: 0.1,
      shotsOnTarget: 0.8,
      misses: 0.6,
      fouls: 0.15,
      passesSuccessful: 2.3,
      passingTurnovers: 1.2
    },
    [Position.ST]: {
      goals: 0.4,
      assists: 0.1,
      saves: 0,
      tacklesSuccessful: 0.2,
      interceptions: 0.1,
      shotsOnTarget: 1.5,
      misses: 1.0,
      fouls: 0.2,
      passesSuccessful: 3.3,
      passingTurnovers: 2.1
    }
  } as const;
  
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
      },
      xg: {
        home: matchState.events.filter(e => e.additionalData?.xg !== undefined && homeTeam.playerIds.includes(e.playerIds[0])).reduce((sum, e) => sum + (e.additionalData?.xg ?? 0), 0),
        away: matchState.events.filter(e => e.additionalData?.xg !== undefined && awayTeam.playerIds.includes(e.playerIds[0])).reduce((sum, e) => sum + (e.additionalData?.xg ?? 0), 0)
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
        shots: primaryPlayerEvents.filter(e => e.type === EventType.GOAL || e.type === EventType.SAVE || e.type === EventType.MISS).length,
        shotsOnTarget: primaryPlayerEvents.filter(e => e.type === EventType.GOAL || e.type === EventType.SAVE).length,
        misses: primaryPlayerEvents.filter(e => e.type === EventType.MISS).length,
        goals: playerEvents.filter(e => e.type === EventType.GOAL).length,
        assists: assistsByPlayer.get(player.id) ?? 0,
        offsides: matchState.events.filter(e => e.additionalData?.isOffside === true && e.additionalData?.offsidePlayerId === player.id).length,
        tackles: player.position === Position.GK ? 0 : tackleEvents.length,
        tacklesSuccessful: player.position === Position.GK ? 0 : tackleEvents.filter(e => e.success).length,
        interceptions: interceptionEvents.length,
        fouls: primaryPlayerEvents.filter(e => e.type === EventType.FOUL).length,
        foulsSuffered: playerEvents.filter(e => e.type === EventType.FOUL && e.playerIds[1] === player.id).length,
        yellowCards: primaryPlayerEvents.filter(e => e.type === EventType.YELLOW_CARD).length,
        redCards: primaryPlayerEvents.filter(e => e.type === EventType.RED_CARD).length,
        saves: playerEvents.filter(e => e.type === EventType.SAVE && e.playerIds[1] === player.id).length,
        cornersTaken: matchState.events.filter(e => e.type === EventType.CORNER && e.playerIds[0] === player.id).length,
        cornersWon: matchState.events.filter(e => e.additionalData?.isCorner && e.additionalData?.aerialWinner === player.id).length,
        freeKicksTaken: matchState.events.filter(e => e.type === EventType.FREE_KICK && e.playerIds[0] === player.id).length,
        freeKickGoals: matchState.events.filter(e => e.type === EventType.GOAL && e.additionalData?.isFreeKick && e.playerIds[0] === player.id).length,
        penaltiesTaken: matchState.events.filter(e => e.type === EventType.PENALTY && e.playerIds[0] === player.id).length,
        penaltiesScored: matchState.events.filter(e => e.type === EventType.GOAL && e.additionalData?.isPenalty && e.playerIds[0] === player.id).length,
        penaltiesFaced: matchState.events.filter(e => e.type === EventType.PENALTY && e.playerIds[1] === player.id).length,
        penaltiesSaved: matchState.events.filter(e => e.type === EventType.SAVE && e.additionalData?.isPenalty && e.playerIds[1] === player.id).length,
        aerialDuelsWon: matchState.events.filter(e => e.additionalData?.aerialWinner === player.id).length,
        aerialDuelsLost: matchState.events.filter(e => e.additionalData?.aerialLoser === player.id).length,
        cornerGoals: matchState.events.filter(e => e.type === EventType.GOAL && e.additionalData?.isCorner && e.playerIds[0] === player.id).length,
        indirectFreeKickGoals: matchState.events.filter(e => e.type === EventType.GOAL && e.additionalData?.isFreeKick && !e.additionalData?.freeKickDirect && e.playerIds[0] === player.id).length,
        expectedGoals: primaryPlayerEvents.filter(e => e.additionalData?.xg !== undefined).reduce((sum, e) => sum + (e.additionalData?.xg ?? 0), 0),
        rating: 0
      };

      if (!hasEnteredMatch) {
        stats.rating = 0;
        stats.clutchActionsCount = 0;
        stats.clutchRatingBonus = 0;
        stats.goalsConceded = 0;
        stats.passingTurnovers = 0;
        stats.expectedGoals = 0;
      } else {
        const ratingResult = this.calculatePlayerRating(
          player,
          stats,
          matchState,
          teamPlayerIds,
          isStarter
        );
        stats.rating = ratingResult.rating;
        stats.clutchActionsCount = ratingResult.clutchCount;
        stats.clutchRatingBonus = ratingResult.clutchBonus;
        stats.goalsConceded = ratingResult.goalsConceded;
        stats.passingTurnovers = ratingResult.passingTurnovers;
      }

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

      const isCornerGoal = event.additionalData?.isCorner === true;
      const isIndirectFreeKickGoal = event.additionalData?.isFreeKick === true && event.additionalData?.freeKickDirect === false;

      if (isCornerGoal || isIndirectFreeKickGoal) {
        const targetType = isCornerGoal ? EventType.CORNER : EventType.FREE_KICK;
        for (let i = index - 1; i >= 0; i--) {
          const priorEvent = allEvents[i];
          if (priorEvent.type === targetType && priorEvent.time === event.time) {
            const takerId = priorEvent.playerIds[0];
            if (takerId && takerId !== scorerId && teamPlayerIds.has(takerId)) {
              assistsByPlayer.set(takerId, (assistsByPlayer.get(takerId) ?? 0) + 1);
            }
            break;
          }
        }
        return;
      }

      for (let i = index - 1; i >= 0; i--) {
        const priorEvent = allEvents[i];
        if (event.time - priorEvent.time > 3) {
          break;
        }

        const isGameplayEvent = [
          EventType.PASS,
          EventType.TACKLE,
          EventType.INTERCEPTION,
          EventType.SAVE,
          EventType.MISS,
          EventType.GOAL,
          EventType.FOUL
        ].includes(priorEvent.type);

        if (isGameplayEvent) {
          if (priorEvent.type === EventType.PASS && priorEvent.success) {
            const passerId = priorEvent.playerIds[0];
            const receiverId = priorEvent.playerIds[1];
            if (passerId && receiverId && receiverId === scorerId && passerId !== scorerId && teamPlayerIds.has(passerId)) {
              assistsByPlayer.set(passerId, (assistsByPlayer.get(passerId) ?? 0) + 1);
            }
          }
          break;
        }
      }
    });

    return assistsByPlayer;
  }


  private calculateClutchAndDefenseInfo(
    player: Player,
    stats: PlayerStatistics,
    events: PlayByPlayEvent[],
    currentMinute: number,
    isStarter: boolean,
    teamPlayerIds: Set<string>
  ): {
    goalsConceded: number;
    passingTurnovers: number;
    clutchCount: number;
    clutchBonus: number;
  } {
    let enteredMin = isStarter ? 0 : -1;
    let exitedMin = -1;

    events.forEach(e => {
      if (e.type === EventType.SUBSTITUTION) {
        if (e.playerIds[0] === player.id) {
          exitedMin = e.time;
        } else if (e.playerIds[1] === player.id) {
          enteredMin = e.time;
        }
      }
    });

    const startMin = enteredMin !== -1 ? enteredMin : (isStarter ? 0 : 999);
    const endMin = exitedMin !== -1 ? exitedMin : currentMinute;

    let goalsConceded = 0;
    let passingTurnovers = 0;
    let clutchCount = 0;
    let clutchBonus = 0;

    let ourScore = 0;
    let oppScore = 0;

    for (const e of events) {

      if (e.type === EventType.GOAL) {
        const scorerId = e.playerIds[0];
        if (teamPlayerIds.has(scorerId)) {
          ourScore++;
        } else {
          oppScore++;
          if (e.time >= startMin && e.time <= endMin) {
            goalsConceded++;
          }
        }
      }

      if (
        e.type === EventType.PASS &&
        !e.success &&
        e.playerIds[0] === player.id &&
        e.time >= startMin &&
        e.time <= endMin
      ) {
        if (e.additionalData?.passFailure === 'RECOVERY' || e.additionalData?.passFailure === 'OVERHIT') {
          passingTurnovers++;
        }
      }

      const isActor = e.playerIds[0] === player.id;
      const isGKRecipient = e.playerIds[1] === player.id;

      if (e.time >= startMin && e.time <= endMin) {
        if (e.type === EventType.GOAL && isActor) {
          const ourScoreBefore = ourScore - 1;
          const oppScoreBefore = oppScore;

          const isLate = e.time >= 75 || e.additionalData?.isPenalty === true;

          if (ourScoreBefore === oppScoreBefore) {
            if (isLate) {
              clutchCount++;
              clutchBonus += 8;
            } else {
              clutchBonus += 3;
            }
          } else if (ourScoreBefore === oppScoreBefore - 1) {
            if (isLate) {
              clutchCount++;
              clutchBonus += 6;
            } else {
              clutchBonus += 2;
            }
          } else if (ourScoreBefore >= oppScoreBefore + 3 || ourScoreBefore <= oppScoreBefore - 3) {
            clutchBonus -= 4;
          }
        }

        if (e.type === EventType.SAVE && isGKRecipient && player.position === Position.GK) {
          if (e.additionalData?.isPenalty) {
            clutchCount++;
            clutchBonus += 5;
          } else if (ourScore === oppScore || ourScore === oppScore + 1) {
            if (e.time >= 75) {
              clutchCount++;
              clutchBonus += 4;
            } else {
              clutchBonus += 1;
            }
          }
        }

        if ((e.type === EventType.TACKLE || e.type === EventType.INTERCEPTION) && isActor && player.position !== Position.GK) {
          const isLateClose = e.time >= 75 && (ourScore === oppScore || ourScore === oppScore + 1);
          const isBoxIntervention = e.location.y <= 18 || e.location.y >= 82;

          if (isLateClose) {
            if (isBoxIntervention) {
              clutchCount++;
              clutchBonus += 3.5;
            } else {
              clutchBonus += 2.0;
            }
          }
        }
      }
    }

    return {
      goalsConceded,
      passingTurnovers,
      clutchCount,
      clutchBonus
    };
  }

  private calculatePlayerRating(
    player: Player,
    stats: PlayerStatistics,
    matchState: MatchState,
    teamPlayerIds: Set<string>,
    isStarter: boolean
  ): { rating: number; clutchCount: number; clutchBonus: number; goalsConceded: number; passingTurnovers: number } {
    const pos = player.position;
    const rates = StatisticsService.EXPECTED_RATES[pos];
    
    let weights;
    let group: 'GK' | 'DEF' | 'MID' | 'FWD';
    if (pos === Position.GK) {
      weights = { goal: 10, assist: 5, save: 3.0, tackle: 0, interception: 2, pass: 0.3, turnover: 1.0, conceded: 3.0 };
      group = 'GK';
    } else if (pos === Position.CB || pos === Position.FB) {
      weights = { goal: 8, assist: 6, save: 0, tackle: 2.5, interception: 3.5, pass: 0.4, turnover: 1.0, conceded: 2.0 };
      group = 'DEF';
    } else if (pos === Position.ST) {
      weights = { goal: 8.5, assist: 6, save: 0, tackle: 0.5, interception: 1.0, pass: 0.3, turnover: 1.0, conceded: 0 };
      group = 'FWD';
    } else {
      weights = { goal: 9, assist: 7, save: 0, tackle: 2.5, interception: 3.5, pass: 0.5, turnover: 1.0, conceded: 0 };
      group = 'MID';
    }

    const timeRatio = stats.minutesPlayed / 90;
    const expected = (rate: number) => rate * timeRatio;

    let rating = 60;

    const context = this.calculateClutchAndDefenseInfo(
      player,
      stats,
      matchState.events,
      matchState.currentMinute,
      isStarter,
      teamPlayerIds
    );

    if (weights.goal > 0) {
      const expGoals = expected(rates.goals);
      rating += weights.goal * (stats.goals - expGoals);
    }

    if (weights.assist > 0) {
      const expAssists = expected(rates.assists);
      rating += weights.assist * (stats.assists - expAssists);
    }

    if (weights.save > 0) {
      const expSaves = expected(rates.saves);
      rating += weights.save * (stats.saves - expSaves);
    }

    if (weights.tackle > 0) {
      const expTackles = expected(rates.tacklesSuccessful);
      rating += weights.tackle * (stats.tacklesSuccessful - expTackles);
    }

    if (weights.interception > 0) {
      const expInterceptions = expected(rates.interceptions);
      rating += weights.interception * (stats.interceptions - expInterceptions);
    }

    if (rates.shotsOnTarget > 0) {
      const expSOT = expected(rates.shotsOnTarget);
      rating += (group === 'FWD' ? 2.0 : 1.0) * (stats.shotsOnTarget - expSOT);
    }

    if (rates.misses > 0) {
      const expMisses = expected(rates.misses);
      rating -= (group === 'FWD' ? 2.0 : 1.0) * (stats.misses - expMisses);
    }

    if (rates.fouls > 0) {
      const expFouls = expected(rates.fouls);
      rating -= 2.0 * (stats.fouls - expFouls);
    }

    const expPasses = expected(rates.passesSuccessful);
    const passDev = stats.passesSuccessful - expPasses;
    if (passDev > 0) {
      rating += Math.min(15, weights.pass * passDev);
    } else {
      rating += weights.pass * passDev;
    }

    const expTurnovers = expected(rates.passingTurnovers);
    rating -= weights.turnover * (context.passingTurnovers - expTurnovers);

    if (weights.conceded > 0) {
      rating -= weights.conceded * context.goalsConceded;
    }

    rating += context.clutchBonus;

    rating -= stats.yellowCards * 5;
    rating -= stats.redCards * 15;

    if (stats.aerialDuelsWon !== undefined) {
      rating += (stats.aerialDuelsWon * 0.5);
    }
    if (stats.aerialDuelsLost !== undefined) {
      rating -= (stats.aerialDuelsLost * 0.5);
    }

    return {
      rating: Math.max(1, Math.min(100, Math.round(rating))),
      clutchCount: context.clutchCount,
      clutchBonus: context.clutchBonus,
      goalsConceded: context.goalsConceded,
      passingTurnovers: context.passingTurnovers
    };
  }

  computeRatingBreakdown(stats: PlayerStatistics): PlayerRatingBreakdown {
    const pos = stats.position;
    const rates = StatisticsService.EXPECTED_RATES[pos];
    
    let weights;
    let group: 'GK' | 'DEF' | 'MID' | 'FWD';
    if (pos === Position.GK) {
      weights = { goal: 10, assist: 5, save: 3.0, tackle: 0, interception: 2, pass: 0.3, turnover: 1.0, conceded: 3.0 };
      group = 'GK';
    } else if (pos === Position.CB || pos === Position.FB) {
      weights = { goal: 8, assist: 6, save: 0, tackle: 2.5, interception: 3.5, pass: 0.4, turnover: 1.0, conceded: 2.0 };
      group = 'DEF';
    } else if (pos === Position.ST) {
      weights = { goal: 8.5, assist: 6, save: 0, tackle: 0.5, interception: 1.0, pass: 0.3, turnover: 1.0, conceded: 0 };
      group = 'FWD';
    } else {
      weights = { goal: 9, assist: 7, save: 0, tackle: 2.5, interception: 3.5, pass: 0.5, turnover: 1.0, conceded: 0 };
      group = 'MID';
    }

    const timeRatio = stats.minutesPlayed / 90;
    const expected = (rate: number) => rate * timeRatio;

    const positiveItems: PlayerRatingBreakdownItem[] = [];
    const negativeItems: PlayerRatingBreakdownItem[] = [];

    if (weights.goal > 0) {
      const expGoals = expected(rates.goals);
      const points = weights.goal * (stats.goals - expGoals);
      positiveItems.push({ label: 'Goals (vs Expectation)', count: stats.goals, points: Math.round(points * 10) / 10 });
    }

    if (weights.assist > 0) {
      const expAssists = expected(rates.assists);
      const points = weights.assist * (stats.assists - expAssists);
      positiveItems.push({ label: 'Assists (vs Expectation)', count: stats.assists, points: Math.round(points * 10) / 10 });
    }

    const expPasses = expected(rates.passesSuccessful);
    let passPoints = weights.pass * (stats.passesSuccessful - expPasses);
    if (passPoints > 15) {
      passPoints = 15;
    }
    positiveItems.push({ label: 'Passing (vs Expectation)', count: stats.passesSuccessful, points: Math.round(passPoints * 10) / 10 });

    if (weights.tackle > 0) {
      const expTackles = expected(rates.tacklesSuccessful);
      const points = weights.tackle * (stats.tacklesSuccessful - expTackles);
      positiveItems.push({ label: 'Tackles (vs Expectation)', count: stats.tacklesSuccessful, points: Math.round(points * 10) / 10 });
    }

    if (weights.save > 0) {
      const expSaves = expected(rates.saves);
      const points = weights.save * (stats.saves - expSaves);
      positiveItems.push({ label: 'Saves (vs Expectation)', count: stats.saves, points: Math.round(points * 10) / 10 });
    }

    if (weights.interception > 0) {
      const expInter = expected(rates.interceptions);
      const points = weights.interception * (stats.interceptions - expInter);
      positiveItems.push({ label: 'Interceptions (vs Expectation)', count: stats.interceptions, points: Math.round(points * 10) / 10 });
    }

    if (rates.shotsOnTarget > 0) {
      const expSot = expected(rates.shotsOnTarget);
      const points = (group === 'FWD' ? 2.0 : 1.0) * (stats.shotsOnTarget - expSot);
      positiveItems.push({ label: 'Shots On Target', count: stats.shotsOnTarget, points: Math.round(points * 10) / 10 });
    }

    if (stats.clutchRatingBonus || stats.clutchActionsCount) {
      positiveItems.push({
        label: 'Clutch Actions',
        count: stats.clutchActionsCount ?? 0,
        points: Math.round((stats.clutchRatingBonus ?? 0) * 10) / 10
      });
    }

    if (rates.misses > 0) {
      const expMisses = expected(rates.misses);
      const points = (group === 'FWD' ? 2.0 : 1.0) * (stats.misses - expMisses);
      negativeItems.push({ label: 'Missed Chances', count: stats.misses, points: Math.round(points * 10) / 10 });
    }

    if (rates.fouls > 0) {
      const expFouls = expected(rates.fouls);
      const points = 2.0 * (stats.fouls - expFouls);
      negativeItems.push({ label: 'Fouls Committed', count: stats.fouls, points: Math.round(points * 10) / 10 });
    }

    if (stats.yellowCards > 0) {
      negativeItems.push({ label: 'Yellow Cards', count: stats.yellowCards, points: stats.yellowCards * 5 });
    }

    if (stats.redCards > 0) {
      negativeItems.push({ label: 'Red Cards', count: stats.redCards, points: stats.redCards * 15 });
    }

    if (weights.conceded > 0 && stats.goalsConceded) {
      const gcPenalty = weights.conceded * stats.goalsConceded;
      negativeItems.push({ label: 'Goals Conceded', count: stats.goalsConceded, points: Math.round(gcPenalty * 10) / 10 });
    }

    if (stats.passingTurnovers) {
      const expTurnovers = expected(rates.passingTurnovers);
      const turnoversPenalty = weights.turnover * (stats.passingTurnovers - expTurnovers);
      negativeItems.push({ label: 'Passing Turnovers', count: stats.passingTurnovers, points: Math.round(turnoversPenalty * 10) / 10 });
    }

    return {
      positiveItems,
      negativeItems,
      positiveTotal: positiveItems.reduce((sum, item) => sum + item.points, 0),
      negativeTotal: negativeItems.reduce((sum, item) => sum + item.points, 0)
    };
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
      const exitAfterSub = allEvents.find(
        e => (e.type === EventType.RED_CARD || e.type === EventType.INJURY)
          && e.playerIds[0] === playerId
          && e.time > subOnEvent.time
      );
      if (exitAfterSub) {
        return exitAfterSub.time - subOnEvent.time;
      }
      return matchCurrentMinute - subOnEvent.time;
    }

    if (isStarter) {
      // Starter who played until sent off, injured, or end of match.
      const exitEvent = allEvents.find(
        e => (e.type === EventType.RED_CARD || e.type === EventType.INJURY) && e.playerIds[0] === playerId
      );
      if (exitEvent) {
        return exitEvent.time;
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