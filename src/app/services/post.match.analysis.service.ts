import { Injectable, inject } from '@angular/core';
import { MatchState, PlayByPlayEvent } from '../models/simulation.types';
import { Team, MatchEvent, MatchStatistics, TacticalAnalysis, PlayerAnalysis, Player, PlayerStatistics } from '../models/types';
import { resolveTeamPlayers } from '../models/team-players';
import { StatisticsService, TeamSeasonStatistics } from './statistics.service';
import { CommentaryService } from './commentary.service';
import { EventType, PlayingStyle, EventImportance, TeamSide } from '../models/enums';

@Injectable({
  providedIn: 'root'
})
export class PostMatchAnalysisService {
  private statisticsService = inject(StatisticsService);
  private commentaryService = inject(CommentaryService);

  generateMatchReport(matchState: MatchState, homeTeam: Team, awayTeam: Team, seasonYear: number): MatchReport {
    const matchStats = this.statisticsService.generateMatchStatistics(matchState, homeTeam, awayTeam);
    const homePlayers = resolveTeamPlayers(homeTeam);
    const awayPlayers = resolveTeamPlayers(awayTeam);
    const homePlayerStats = this.statisticsService.generatePlayerStatistics(matchState, homeTeam, homePlayers, seasonYear);
    const awayPlayerStats = this.statisticsService.generatePlayerStatistics(matchState, awayTeam, awayPlayers, seasonYear);
    
    const keyMoments = this.extractKeyMoments(matchState.events, homeTeam, awayTeam, homePlayers, awayPlayers);
    const tacticalAnalysis = this.analyzeTactics(matchState, homeTeam, awayTeam);
    const playerPerformances = this.analyzePlayerPerformances(homePlayerStats, awayPlayerStats);
    const matchSummary = this.generateMatchSummary(matchState, homeTeam, awayTeam, matchStats);

    return {
      matchId: matchState.events[0]?.id || 'unknown',
      finalScore: `${matchState.homeScore}-${matchState.awayScore}`,
      matchStats,
      keyMoments,
      tacticalAnalysis,
      playerPerformances,
      matchSummary,
      homePlayerStats,
      awayPlayerStats
    };
  }

  generateSeasonReport(team: Team, matchStates: MatchState[], matchContexts: SeasonMatchContext[]): SeasonReport {
    const teamStats = this.statisticsService.generateTeamStatistics(team, matchStates);
    const recentForm = this.analyzeRecentForm(matchStates, team.id, matchContexts);
    const strengths = this.identifyStrengths(teamStats, recentForm);
    const weaknesses = this.identifyWeaknesses(teamStats, recentForm);
    const improvementAreas = this.suggestImprovements(teamStats, recentForm);

    return {
      teamId: team.id,
      teamName: team.name,
      seasonStats: teamStats,
      recentForm,
      strengths,
      weaknesses,
      improvementAreas,
      recommendations: this.generateRecommendations(teamStats, strengths, weaknesses)
    };
  }

  private extractKeyMoments(
    events: PlayByPlayEvent[],
    homeTeam: Team,
    awayTeam: Team,
    homePlayers: Player[],
    awayPlayers: Player[]
  ): MatchEvent[] {
    const keyMoments: MatchEvent[] = [];

    events.forEach(event => {
      if (event.type === EventType.GOAL) {
        keyMoments.push({
          id: event.id,
          time: event.time,
          type: EventType.GOAL,
          description: this.describeGoalMoment(event, homePlayers, awayPlayers),
          playerIds: event.playerIds,
          location: event.location,
          icon: '⚽',
          importance: EventImportance.HIGH
        });
      } else if (event.type === EventType.RED_CARD) {
        keyMoments.push({
          id: event.id,
          time: event.time,
          type: EventType.RED_CARD,
          description: this.describeCardMoment(event, homePlayers, awayPlayers),
          playerIds: event.playerIds,
          location: event.location,
          icon: '🟥',
          importance: EventImportance.HIGH
        });
      } else if (event.type === EventType.PENALTY) {
        keyMoments.push({
          id: event.id,
          time: event.time,
          type: EventType.PENALTY,
          description: this.describePenaltyMoment(event),
          playerIds: event.playerIds,
          location: event.location,
          icon: '🎯',
          importance: EventImportance.HIGH
        });
      } else if (event.type === EventType.SAVE && this.isNotableChance(event)) {
        keyMoments.push({
          id: event.id,
          time: event.time,
          type: EventType.SAVE,
          description: this.describeSaveMoment(event, homeTeam, awayTeam, homePlayers, awayPlayers),
          playerIds: event.playerIds,
          location: event.location,
          icon: '🧤',
          importance: EventImportance.MEDIUM
        });
      } else if ((event.type === EventType.MISS || event.type === EventType.SHOT) && this.isNotableChance(event)) {
        keyMoments.push({
          id: event.id,
          time: event.time,
          type: event.type,
          description: this.describeShotMoment(event, homeTeam, awayTeam, homePlayers, awayPlayers),
          playerIds: event.playerIds,
          location: event.location,
          icon: '🎯',
          importance: EventImportance.MEDIUM
        });
      } else if (event.type === EventType.CORNER && event.success) {
        keyMoments.push({
          id: event.id,
          time: event.time,
          type: EventType.CORNER,
          description: `Dangerous corner at ${event.time}'`,
          playerIds: event.playerIds,
          location: event.location,
          icon: '📐',
          importance: EventImportance.MEDIUM
        });
      } else if (event.type === EventType.SUBSTITUTION) {
        keyMoments.push({
          id: event.id,
          time: event.time,
          type: EventType.SUBSTITUTION,
          description: `${this.commentaryService.generateEventCommentary(
            event,
            homeTeam,
            awayTeam,
            undefined,
            { homePlayers, awayPlayers }
          )} (${event.time}')`,
          playerIds: event.playerIds,
          location: event.location,
          icon: '🔄',
          importance: EventImportance.LOW
        });
      }
    });

    return keyMoments.sort((a, b) => a.time - b.time);
  }

  private isNotableChance(event: PlayByPlayEvent): boolean {
    if (event.type === EventType.SAVE) {
      return true;
    }

    if (event.type === EventType.SHOT && event.success) {
      return true;
    }

    return this.isProminentChanceLocation(event.location) || this.hasVariantBReplay(event);
  }

  private isProminentChanceLocation(location?: { x: number; y: number }): boolean {
    if (!location) {
      return false;
    }

    const goalDistance = Math.min(location.y, 100 - location.y);
    return goalDistance <= 32;
  }

  private hasVariantBReplay(event: PlayByPlayEvent): boolean {
    return typeof event.additionalData === 'object' && event.additionalData !== null && 'variantBReplay' in event.additionalData;
  }

  private describeGoalMoment(event: PlayByPlayEvent, homePlayers: Player[], awayPlayers: Player[]): string {
    const scorerName = this.findPlayerName(event.playerIds[0], homePlayers, awayPlayers);
    return `${scorerName} scored at ${event.time}'${this.buildChanceLocationSuffix(event)}.`;
  }

  private describeSaveMoment(
    event: PlayByPlayEvent,
    homeTeam: Team,
    awayTeam: Team,
    homePlayers: Player[],
    awayPlayers: Player[]
  ): string {
    return `${this.commentaryService.generateEventCommentary(
      event,
      homeTeam,
      awayTeam,
      undefined,
      { homePlayers, awayPlayers }
    )} (${event.time}')`;
  }

  private describeShotMoment(
    event: PlayByPlayEvent,
    homeTeam: Team,
    awayTeam: Team,
    homePlayers: Player[],
    awayPlayers: Player[]
  ): string {
    return `${this.commentaryService.generateEventCommentary(
      event,
      homeTeam,
      awayTeam,
      undefined,
      { homePlayers, awayPlayers }
    )} (${event.time}')`;
  }

  private describeCardMoment(event: PlayByPlayEvent, homePlayers: Player[], awayPlayers: Player[]): string {
    const playerName = this.findPlayerName(event.playerIds[0], homePlayers, awayPlayers);
    return `${playerName} was sent off at ${event.time}'.`;
  }

  private describePenaltyMoment(event: PlayByPlayEvent): string {
    return `Penalty awarded at ${event.time}'${this.buildChanceLocationSuffix(event)}.`;
  }

  private buildChanceLocationSuffix(event: PlayByPlayEvent): string {
    const locationDescription = this.commentaryService.describeChanceLocation(event.location);
    return locationDescription ? ` from ${locationDescription}` : '';
  }

  private findPlayerName(playerId: string | undefined, homePlayers: Player[], awayPlayers: Player[]): string {
    if (!playerId) {
      return 'Player';
    }

    return homePlayers.find(player => player.id === playerId)?.name ||
      awayPlayers.find(player => player.id === playerId)?.name ||
      'Player';
  }

  private analyzeTactics(matchState: MatchState, _homeTeam: Team, _awayTeam: Team): TacticalAnalysis {
    const homePossession = matchState.homePossession;
    const awayPossession = matchState.awayPossession;

    const homeShots = matchState.homeShots;
    const awayShots = matchState.awayShots;

    const homeCorners = matchState.homeCorners;
    const awayCorners = matchState.awayCorners;

    const homeFouls = matchState.homeFouls;
    const awayFouls = matchState.awayFouls;

    return {
      homeTeam: {
        possession: homePossession,
        shots: homeShots,
        corners: homeCorners,
        fouls: homeFouls,
        style: this.determinePlayingStyle(homePossession, homeShots, homeCorners, homeFouls),
        effectiveness: this.calculateTacticalEffectiveness(homePossession, homeShots, homeCorners, matchState.homeScore)
      },
      awayTeam: {
        possession: awayPossession,
        shots: awayShots,
        corners: awayCorners,
        fouls: awayFouls,
        style: this.determinePlayingStyle(awayPossession, awayShots, awayCorners, awayFouls),
        effectiveness: this.calculateTacticalEffectiveness(awayPossession, awayShots, awayCorners, matchState.awayScore)
      },
      tacticalBattle: this.analyzeTacticalBattle(homePossession, awayPossession, homeShots, awayShots)
    };
  }

  private analyzePlayerPerformances(homeStats: PlayerStatistics[], awayStats: PlayerStatistics[]): PlayerAnalysis {
    const homeTopPerformers = homeStats.slice(0, 3);
    const awayTopPerformers = awayStats.slice(0, 3);

    const homeMVP = homeStats[0];
    const awayMVP = awayStats[0];

    const homeStrugglers = homeStats.slice(-3);
    const awayStrugglers = awayStats.slice(-3);

    return {
      homeTeam: {
        mvp: homeMVP,
        topPerformers: homeTopPerformers,
        strugglers: homeStrugglers,
        averageRating: this.calculateAverageRating(homeStats)
      },
      awayTeam: {
        mvp: awayMVP,
        topPerformers: awayTopPerformers,
        strugglers: awayStrugglers,
        averageRating: this.calculateAverageRating(awayStats)
      }
    };
  }

  private generateMatchSummary(matchState: MatchState, homeTeam: Team, awayTeam: Team, matchStats: MatchStatistics): string {
    const summary = [
      `Final Score: ${homeTeam.name} ${matchState.homeScore} - ${matchState.awayScore} ${awayTeam.name}`,
      `Possession: Home ${matchState.homePossession}% - ${matchState.awayPossession}% Away`,
      `Shots: Home ${matchState.homeShots} - ${matchState.awayShots} Away`,
      `Corners: Home ${matchState.homeCorners} - ${matchState.awayCorners} Away`,
      `Fouls: Home ${matchState.homeFouls} - ${matchState.awayFouls} Away`,
      `Passes: Home ${matchStats.passes.home} - ${matchStats.passes.away} Away`
    ];

    const goals = matchState.events.filter(e => e.type === EventType.GOAL);
    if (goals.length > 0) {
      summary.push('Goals:');
      goals.forEach(goal => {
        summary.push(`  ${goal.time}': ${goal.playerIds.join(', ')}`);
      });
    }

    const cards = matchState.events.filter(e => e.type === EventType.YELLOW_CARD || e.type === EventType.RED_CARD);
    if (cards.length > 0) {
      summary.push('Cards:');
      cards.forEach(card => {
        summary.push(`  ${card.time}': ${card.playerIds.join(', ')} - ${card.type}`);
      });
    }

    return summary.join('\n');
  }

  private analyzeRecentForm(matchStates: MatchState[], teamId: string, matchContexts: SeasonMatchContext[]): RecentForm {
    const recentMatches = matchStates.slice(-5);
    if (matchContexts.length < recentMatches.length) {
      throw new Error(
        `analyzeRecentForm requires matchContexts for each analyzed match state. ` +
        `Expected at least ${recentMatches.length}, received ${matchContexts.length}. ` +
        `Please provide a SeasonMatchContext entry for each match in matchStates when calling analyzeRecentForm.`
      );
    }

    const recentContexts = matchContexts.slice(-recentMatches.length);
    const results: ('W' | 'D' | 'L')[] = [];
    let goalsScored = 0;
    let goalsConceded = 0;

    recentMatches.forEach((match, index) => {
      const side = this.resolveTeamSide(teamId, recentContexts[index]);
      if (!side) {
        const originalIndex = matchStates.length - recentMatches.length + index;
        throw new Error(
          `Team ${teamId} is not present in the match context for recent match index ${index} ` +
          `out of ${recentMatches.length} recent matches (overall matchStates index ${originalIndex}).`
        );
      }

      const result = this.getMatchResult(match, side);
      results.push(result);

      goalsScored += side === TeamSide.HOME ? match.homeScore : match.awayScore;
      goalsConceded += side === TeamSide.HOME ? match.awayScore : match.homeScore;
    });

    const points = results.reduce((sum, result) => {
      if (result === 'W') return sum + 3;
      if (result === 'D') return sum + 1;
      return sum;
    }, 0);

    return {
      matches: results.length,
      wins: results.filter(r => r === 'W').length,
      draws: results.filter(r => r === 'D').length,
      losses: results.filter(r => r === 'L').length,
      points,
      goalsScored,
      goalsConceded,
      goalDifference: goalsScored - goalsConceded,
      form: results
    };
  }

  private identifyStrengths(teamStats: TeamSeasonStatistics, recentForm: RecentForm): string[] {
    const strengths: string[] = [];

    if (teamStats.shotsPerGame > 15) {
      strengths.push('Strong attacking play with high shot volume');
    }

    if (teamStats.possessionPerGame > 55) {
      strengths.push('Dominant possession-based style');
    }

    if (teamStats.cornersPerGame > 6) {
      strengths.push('Effective wide play and crossing');
    }

    if (teamStats.cardsPerGame.yellow < 2) {
      strengths.push('Disciplined defensive approach');
    }

    if (teamStats.wins / teamStats.matchesPlayed > 0.5) {
      strengths.push('Consistent winning record');
    }

    if (recentForm.matches >= 3 && recentForm.wins >= 2) {
      strengths.push('Good recent form');
    }

    return strengths;
  }

  private identifyWeaknesses(teamStats: TeamSeasonStatistics, recentForm: RecentForm): string[] {
    const weaknesses: string[] = [];

    if (teamStats.goalsAgainst / teamStats.matchesPlayed > 1.5) {
      weaknesses.push('Defensive vulnerabilities');
    }

    if (teamStats.shotsPerGame < 10) {
      weaknesses.push('Lack of attacking threat');
    }

    if (teamStats.possessionPerGame < 45) {
      weaknesses.push('Struggles to control games');
    }

    if (teamStats.cardsPerGame.yellow > 3) {
      weaknesses.push('Indisciplined play');
    }

    if (teamStats.losses / teamStats.matchesPlayed > 0.4) {
      weaknesses.push('Inconsistent results');
    }

    if (recentForm.matches >= 3 && recentForm.losses >= 2) {
      weaknesses.push('Poor recent form');
    }

    return weaknesses;
  }

  private suggestImprovements(teamStats: TeamSeasonStatistics, recentForm: RecentForm): string[] {
    const improvements: string[] = [];

    if (teamStats.goalsAgainst / teamStats.matchesPlayed > 1.5) {
      improvements.push('Focus on defensive organization and positioning');
    }

    if (teamStats.shotsPerGame < 10) {
      improvements.push('Work on attacking movements and final ball');
    }

    if (teamStats.possessionPerGame < 45) {
      improvements.push('Improve ball retention and build-up play');
    }

    if (teamStats.cardsPerGame.yellow > 3) {
      improvements.push('Address discipline issues in training');
    }

    if (teamStats.wins / teamStats.matchesPlayed < 0.3) {
      improvements.push('Review tactical approach and team selection');
    }

    if (recentForm.matches >= 3 && recentForm.wins + recentForm.draws >= 2) {
      improvements.push('Build on recent positive performances');
    }

    return improvements;
  }

  private resolveTeamSide(teamId: string, matchContext?: SeasonMatchContext): TeamSide | null {
    if (!matchContext) {
      return null;
    }

    if (matchContext.homeTeamId === teamId) {
      return TeamSide.HOME;
    }

    if (matchContext.awayTeamId === teamId) {
      return TeamSide.AWAY;
    }

    return null;
  }

  private generateRecommendations(teamStats: TeamSeasonStatistics, strengths: string[], weaknesses: string[]): string[] {
    const recommendations: string[] = [];

    if (strengths.length > 0) {
      recommendations.push(`Build on strengths: ${strengths.join(', ')}`);
    }

    if (weaknesses.length > 0) {
      recommendations.push(`Address key weaknesses: ${weaknesses.join(', ')}`);
    }

    recommendations.push('Focus on consistency and minimizing individual errors');
    recommendations.push('Continue developing team cohesion and tactical understanding');

    return recommendations;
  }

  private determinePlayingStyle(possession: number, shots: number, corners: number, fouls: number): PlayingStyle {
    if (possession > 60 && shots > 15) return PlayingStyle.POSSESSION;
    if (possession < 40 && shots > 12) return PlayingStyle.COUNTER_ATTACK;
    if (corners > 8) return PlayingStyle.POSSESSION; // Wing play is part of possession
    if (fouls > 15) return PlayingStyle.PRESSING; // Physical play relates to pressing
    return PlayingStyle.DEFENSIVE; // Use DEFENSIVE as fallback instead of BALANCED
  }

  private calculateTacticalEffectiveness(possession: number, shots: number, corners: number, goals: number): number {
    const possessionWeight = possession * 0.3;
    const shotsWeight = shots * 2;
    const cornersWeight = corners * 1;
    const goalsWeight = goals * 10;

    return Math.round((possessionWeight + shotsWeight + cornersWeight + goalsWeight) / 4);
  }

  private analyzeTacticalBattle(homePossession: number, awayPossession: number, homeShots: number, awayShots: number): string {
    if (homePossession > awayPossession && homeShots > awayShots) {
      return 'Home team dominated both possession and chances';
    } else if (awayPossession > homePossession && awayShots > homeShots) {
      return 'Away team controlled the game and created more opportunities';
    } else if (homePossession > awayPossession && awayShots > homeShots) {
      return 'Home team had more possession but away team was more efficient';
    } else if (awayPossession > homePossession && homeShots > awayShots) {
      return 'Away team had more possession but home team was more dangerous';
    } else {
      return 'Evenly contested tactical battle';
    }
  }

  private calculateAverageRating(playerStats: PlayerStatistics[]): number {
    if (playerStats.length === 0) return 0;
    const totalRating = playerStats.reduce((sum, stat) => sum + stat.rating, 0);
    return Math.round(totalRating / playerStats.length);
  }

  private getMatchResult(matchState: MatchState, side: TeamSide): 'W' | 'D' | 'L' {
    const teamScore = side === TeamSide.HOME ? matchState.homeScore : matchState.awayScore;
    const opponentScore = side === TeamSide.HOME ? matchState.awayScore : matchState.homeScore;

    if (teamScore > opponentScore) return 'W';
    if (teamScore < opponentScore) return 'L';
    return 'D';
  }
}

export interface MatchReport {
  matchId: string;
  finalScore: string;
  matchStats: MatchStatistics;
  keyMoments: MatchEvent[];
  tacticalAnalysis: TacticalAnalysis;
  playerPerformances: PlayerAnalysis;
  matchSummary: string;
  homePlayerStats: PlayerStatistics[];
  awayPlayerStats: PlayerStatistics[];
}

export interface SeasonReport {
  teamId: string;
  teamName: string;
  seasonStats: TeamSeasonStatistics;
  recentForm: RecentForm;
  strengths: string[];
  weaknesses: string[];
  improvementAreas: string[];
  recommendations: string[];
}

export interface RecentForm {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  goalsScored: number;
  goalsConceded: number;
  goalDifference: number;
  form: ('W' | 'D' | 'L')[];
}

export interface SeasonMatchContext {
  homeTeamId: string;
  awayTeamId: string;
}