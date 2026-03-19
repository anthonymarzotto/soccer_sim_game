import { Injectable } from '@angular/core';
import { MatchState, PlayByPlayEvent } from '../models/simulation.types';
import { Team, Player, MatchEvent } from '../models/types';
import { StatisticsService, PlayerStatistics, TeamSeasonStatistics } from './statistics.service';
import { CommentaryService } from './commentary.service';
import { EventType, PlayingStyle, EventImportance } from '../models/enums';

@Injectable({
  providedIn: 'root'
})
export class PostMatchAnalysisService {
  private statisticsService = new StatisticsService();
  private commentaryService = new CommentaryService();

  generateMatchReport(matchState: MatchState, homeTeam: Team, awayTeam: Team): MatchReport {
    const matchStats = this.statisticsService.generateMatchStatistics(matchState, homeTeam, awayTeam);
    const homePlayerStats = this.statisticsService.generatePlayerStatistics(matchState, homeTeam);
    const awayPlayerStats = this.statisticsService.generatePlayerStatistics(matchState, awayTeam);
    
    const keyMoments = this.extractKeyMoments(matchState.events);
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

  generateSeasonReport(team: Team, matchStates: MatchState[]): SeasonReport {
    const teamStats = this.statisticsService.generateTeamStatistics(team, matchStates);
    const recentForm = this.analyzeRecentForm(matchStates, team.id);
    const strengths = this.identifyStrengths(teamStats, matchStates);
    const weaknesses = this.identifyWeaknesses(teamStats, matchStates);
    const improvementAreas = this.suggestImprovements(teamStats, matchStates);

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

  private extractKeyMoments(events: PlayByPlayEvent[]): any[] {
    const keyMoments: any[] = [];

    events.forEach(event => {
      if (event.type === EventType.GOAL) {
        keyMoments.push({
          id: event.id,
          time: event.time,
          type: EventType.GOAL,
          description: `Goal scored at ${event.time}'`,
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
          description: `Red card at ${event.time}'`,
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
          description: `Penalty awarded at ${event.time}'`,
          playerIds: event.playerIds,
          location: event.location,
          icon: '🎯',
          importance: EventImportance.HIGH
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
      }
    });

    return keyMoments.sort((a, b) => a.time - b.time);
  }

  private analyzeTactics(matchState: MatchState, homeTeam: Team, awayTeam: Team): TacticalAnalysis {
    const homeEvents = matchState.events.filter(e => this.isHomeTeamEvent(e, homeTeam));
    const awayEvents = matchState.events.filter(e => this.isAwayTeamEvent(e, awayTeam));

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

  private generateMatchSummary(matchState: MatchState, homeTeam: Team, awayTeam: Team, matchStats: any): string {
    const summary = [
      `Final Score: ${homeTeam.name} ${matchState.homeScore} - ${matchState.awayScore} ${awayTeam.name}`,
      `Possession: Home ${matchState.homePossession}% - ${matchState.awayPossession}% Away`,
      `Shots: Home ${matchState.homeShots} - ${matchState.awayShots} Away`,
      `Corners: Home ${matchState.homeCorners} - ${matchState.awayCorners} Away`,
      `Fouls: Home ${matchState.homeFouls} - ${matchState.awayFouls} Away`
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

  private analyzeRecentForm(matchStates: MatchState[], teamId: string): RecentForm {
    const recentMatches = matchStates.slice(-5);
    const results: ('W' | 'D' | 'L')[] = [];

    recentMatches.forEach(match => {
      const result = this.getMatchResult(match, teamId);
      results.push(result);
    });

    const points = results.reduce((sum, result) => {
      if (result === 'W') return sum + 3;
      if (result === 'D') return sum + 1;
      return sum;
    }, 0);

    const goalsScored = recentMatches.reduce((sum, match) => {
      const isHome = match.ballPossession.teamId === teamId;
      return sum + (isHome ? match.homeScore : match.awayScore);
    }, 0);

    const goalsConceded = recentMatches.reduce((sum, match) => {
      const isHome = match.ballPossession.teamId === teamId;
      return sum + (isHome ? match.awayScore : match.homeScore);
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

  private identifyStrengths(teamStats: TeamSeasonStatistics, matchStates: MatchState[]): string[] {
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

    return strengths;
  }

  private identifyWeaknesses(teamStats: TeamSeasonStatistics, matchStates: MatchState[]): string[] {
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

    return weaknesses;
  }

  private suggestImprovements(teamStats: TeamSeasonStatistics, matchStates: MatchState[]): string[] {
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

    return improvements;
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

  private isHomeTeamEvent(event: PlayByPlayEvent, homeTeam: Team): boolean {
    // This would need to be enhanced to properly determine team affiliation
    return true; // Placeholder
  }

  private isAwayTeamEvent(event: PlayByPlayEvent, awayTeam: Team): boolean {
    // This would need to be enhanced to properly determine team affiliation
    return true; // Placeholder
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

export interface MatchReport {
  matchId: string;
  finalScore: string;
  matchStats: any;
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

export interface TacticalAnalysis {
  homeTeam: {
    possession: number;
    shots: number;
    corners: number;
    fouls: number;
    style: string;
    effectiveness: number;
  };
  awayTeam: {
    possession: number;
    shots: number;
    corners: number;
    fouls: number;
    style: string;
    effectiveness: number;
  };
  tacticalBattle: string;
}

export interface PlayerAnalysis {
  homeTeam: {
    mvp: PlayerStatistics;
    topPerformers: PlayerStatistics[];
    strugglers: PlayerStatistics[];
    averageRating: number;
  };
  awayTeam: {
    mvp: PlayerStatistics;
    topPerformers: PlayerStatistics[];
    strugglers: PlayerStatistics[];
    averageRating: number;
  };
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