import { Injectable, signal, computed, inject } from '@angular/core';
import { League, Match, Team, Player } from '../models/types';
import { GeneratorService } from './generator.service';
import { MatchSimulationService } from './match.simulation.service';
import { CommentaryService } from './commentary.service';
import { StatisticsService } from './statistics.service';
import { PostMatchAnalysisService } from './post.match.analysis.service';
import { SimulationConfig } from '../models/simulation.types';

@Injectable({
  providedIn: 'root'
})
export class GameService {
  private leagueState = signal<League | null>(null);

  public league = this.leagueState.asReadonly();
  
  public hasLeague = computed(() => this.leagueState() !== null);
  
  public standings = computed(() => {
    const l = this.leagueState();
    if (!l) return [];
    return [...l.teams].sort((a, b) => {
      if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points;
      const gdA = a.stats.goalsFor - a.stats.goalsAgainst;
      const gdB = b.stats.goalsFor - b.stats.goalsAgainst;
      if (gdB !== gdA) return gdB - gdA;
      return b.stats.goalsFor - a.stats.goalsFor;
    });
  });

  public currentWeekMatches = computed(() => {
    const l = this.leagueState();
    if (!l) return [];
    return l.schedule.filter(m => m.week === l.currentWeek);
  });

  private generator = inject(GeneratorService);

  generateNewLeague() {
    const { teams, schedule } = this.generator.generateLeague();
    this.leagueState.set({
      teams,
      schedule,
      currentWeek: 1
    });
  }

  getTeam(id: string): Team | undefined {
    return this.leagueState()?.teams.find(t => t.id === id);
  }

  getPlayer(id: string): Player | undefined {
    const l = this.leagueState();
    if (!l) return undefined;
    for (const team of l.teams) {
      const player = team.players.find(p => p.id === id);
      if (player) return player;
    }
    return undefined;
  }

  getMatchesForWeek(week: number): Match[] {
    return this.leagueState()?.schedule.filter(m => m.week === week) || [];
  }

  simulateCurrentWeek() {
    const l = this.leagueState();
    if (!l) return;

    const matches = l.schedule.filter(m => m.week === l.currentWeek);

    matches.forEach(match => {
      if (match.played) return;

      const homeTeam = l.teams.find(t => t.id === match.homeTeamId);
      const awayTeam = l.teams.find(t => t.id === match.awayTeamId);

      if (!homeTeam || !awayTeam) return;

      // Use enhanced simulation with full features enabled
      const result = this.simulateMatchWithDetails(match, homeTeam, awayTeam, {
        enablePlayByPlay: true,
        enableSpatialTracking: true,
        enableTactics: true,
        enableFatigue: true,
        commentaryStyle: 'DETAILED'
      });

      // The match result is already updated in the league state by simulateMatchWithDetails
      console.log(`Match ${match.id}: ${homeTeam.name} ${result.matchState.homeScore} - ${result.matchState.awayScore} ${awayTeam.name}`);
      console.log('Key Events:', result.matchState.events.length);
      console.log('Commentary Sample:', result.commentary.slice(0, 3));
    });

    // Advance to next week
    this.leagueState.update(league => league ? { ...league, currentWeek: league.currentWeek + 1 } : null);
  }

  private updateLast5(team: Team, result: 'W' | 'D' | 'L') {
    team.stats.last5.unshift(result);
    if (team.stats.last5.length > 5) {
      team.stats.last5.pop();
    }
  }

  setUserTeam(teamId: string) {
    const l = this.leagueState();
    if (l) {
      this.leagueState.set({ ...l, userTeamId: teamId });
    }
  }

  updatePlayerRole(playerId: string, newRole: import('../models/types').Role) {
    const l = this.leagueState();
    if (!l) return;

    const updatedTeams = l.teams.map(team => {
      const playerIndex = team.players.findIndex(p => p.id === playerId);
      if (playerIndex !== -1) {
        const updatedPlayers = [...team.players];
        updatedPlayers[playerIndex] = { ...updatedPlayers[playerIndex], role: newRole };
        return { ...team, players: updatedPlayers };
      }
      return team;
    });

    this.leagueState.set({ ...l, teams: updatedTeams });
  }

  private dressBestPlayers(teams: Team[]): Team[] {
    const userTeamId = this.leagueState()?.userTeamId;
    
    return teams.map(team => {
      if (team.id === userTeamId) return team; // Skip optimizing the user's team

      const players = team.players.map(p => ({ ...p, role: 'Not Dressed' as import('../models/types').Role }));

      const gks = players.filter(p => p.position === 'GK').sort((a, b) => b.overall - a.overall);
      const defs = players.filter(p => p.position === 'DEF').sort((a, b) => b.overall - a.overall);
      const mids = players.filter(p => p.position === 'MID').sort((a, b) => b.overall - a.overall);
      const fwds = players.filter(p => p.position === 'FWD').sort((a, b) => b.overall - a.overall);

      if (gks.length > 0) gks[0].role = 'Goalkeeper';
      for (let i = 0; i < Math.min(4, defs.length); i++) defs[i].role = 'Defense';
      for (let i = 0; i < Math.min(4, mids.length); i++) mids[i].role = 'Midfield';
      for (let i = 0; i < Math.min(2, fwds.length); i++) fwds[i].role = 'Attack';

      if (gks.length > 1) gks[1].role = 'Bench';
      for (let i = 4; i < Math.min(7, defs.length); i++) defs[i].role = 'Bench';
      for (let i = 4; i < Math.min(8, mids.length); i++) mids[i].role = 'Bench';
      for (let i = 2; i < Math.min(4, fwds.length); i++) fwds[i].role = 'Bench';

      return { ...team, players };
    });
  }

  public calculateTeamOverall(team: Team): number {
    const starters = team.players.filter(p => p.role !== 'Bench' && p.role !== 'Not Dressed');
    if (starters.length === 0) return 50;
    const sum = starters.reduce((acc, p) => acc + p.overall, 0);
    return Math.round(sum / starters.length);
  }

  // Enhanced simulation methods
  private matchSimulationService = inject(MatchSimulationService);
  private commentaryService = inject(CommentaryService);
  private statisticsService = inject(StatisticsService);
  private postMatchAnalysisService = inject(PostMatchAnalysisService);

  simulateMatchWithDetails(match: Match, homeTeam: Team, awayTeam: Team, config?: SimulationConfig) {
    // Use the enhanced simulation service
    const matchState = this.matchSimulationService.simulateMatch(match, homeTeam, awayTeam, config);
    
    // Generate statistics
    const matchStats = this.statisticsService.generateMatchStatistics(matchState, homeTeam, awayTeam);
    
    // Generate post-match analysis
    const matchReport = this.postMatchAnalysisService.generateMatchReport(matchState, homeTeam, awayTeam);
    
    // Update league state with results
    this.updateLeagueWithMatchResult(match, matchState, homeTeam, awayTeam);
    
    return {
      matchState,
      matchStats,
      matchReport,
      commentary: this.generateMatchCommentary(matchState, homeTeam, awayTeam, config?.commentaryStyle === 'STATS_ONLY' ? 'DETAILED' : config?.commentaryStyle || 'DETAILED')
    };
  }

  private updateLeagueWithMatchResult(match: Match, matchState: any, homeTeam: Team, awayTeam: Team) {
    const l = this.leagueState();
    if (!l) return;

    // Update match in schedule
    const updatedSchedule = l.schedule.map(m => 
      m.id === match.id 
        ? { ...m, homeScore: matchState.homeScore, awayScore: matchState.awayScore, played: true }
        : m
    );

    // Update team stats
    const updatedTeams = l.teams.map(team => {
      if (team.id === homeTeam.id) {
        return {
          ...team,
          stats: {
            ...team.stats,
            played: team.stats.played + 1,
            goalsFor: team.stats.goalsFor + matchState.homeScore,
            goalsAgainst: team.stats.goalsAgainst + matchState.awayScore,
            won: team.stats.won + (matchState.homeScore > matchState.awayScore ? 1 : 0),
            drawn: team.stats.drawn + (matchState.homeScore === matchState.awayScore ? 1 : 0),
            lost: team.stats.lost + (matchState.homeScore < matchState.awayScore ? 1 : 0),
            points: team.stats.points + this.getPoints(matchState.homeScore, matchState.awayScore, true),
            last5: this.updateLast5Array(team.stats.last5, this.getResult(matchState.homeScore, matchState.awayScore, true))
          }
        };
      } else if (team.id === awayTeam.id) {
        return {
          ...team,
          stats: {
            ...team.stats,
            played: team.stats.played + 1,
            goalsFor: team.stats.goalsFor + matchState.awayScore,
            goalsAgainst: team.stats.goalsAgainst + matchState.homeScore,
            won: team.stats.won + (matchState.awayScore > matchState.homeScore ? 1 : 0),
            drawn: team.stats.drawn + (matchState.awayScore === matchState.homeScore ? 1 : 0),
            lost: team.stats.lost + (matchState.awayScore < matchState.homeScore ? 1 : 0),
            points: team.stats.points + this.getPoints(matchState.homeScore, matchState.awayScore, false),
            last5: this.updateLast5Array(team.stats.last5, this.getResult(matchState.homeScore, matchState.awayScore, false))
          }
        };
      }
      return team;
    });

    this.leagueState.set({
      ...l,
      teams: updatedTeams,
      schedule: updatedSchedule
    });
  }

  private getPoints(homeScore: number, awayScore: number, isHome: boolean): number {
    if (isHome) {
      if (homeScore > awayScore) return 3;
      if (homeScore === awayScore) return 1;
    } else {
      if (awayScore > homeScore) return 3;
      if (awayScore === homeScore) return 1;
    }
    return 0;
  }

  private getResult(homeScore: number, awayScore: number, isHome: boolean): 'W' | 'D' | 'L' {
    if (isHome) {
      if (homeScore > awayScore) return 'W';
      if (homeScore === awayScore) return 'D';
      return 'L';
    } else {
      if (awayScore > homeScore) return 'W';
      if (awayScore === homeScore) return 'D';
      return 'L';
    }
  }

  private updateLast5Array(last5: ('W' | 'D' | 'L')[], result: 'W' | 'D' | 'L'): ('W' | 'D' | 'L')[] {
    const newLast5 = [result, ...last5];
    if (newLast5.length > 5) {
      newLast5.pop();
    }
    return newLast5;
  }

  private generateMatchCommentary(matchState: any, homeTeam: Team, awayTeam: Team, style: 'DETAILED' | 'BRIEF'): string[] {
    const commentary: string[] = [];
    
    // Starting XI
    commentary.push(...this.commentaryService.generateStartingXICommentary(homeTeam, awayTeam));
    
    // Key events
    matchState.events.forEach((event: any) => {
      const eventCommentary = this.commentaryService.generateEventCommentary(event, homeTeam, awayTeam, style);
      commentary.push(`${event.time}': ${eventCommentary}`);
    });
    
    // Half-time
    commentary.push(this.commentaryService.generateHalfTimeCommentary(matchState.homeScore, matchState.awayScore, matchState.events));
    
    // Full-time
    commentary.push(this.commentaryService.generateFullTimeCommentary(matchState.homeScore, matchState.awayScore, matchState.events));
    
    return commentary;
  }

  getTeamForm(teamId: string): ('W' | 'D' | 'L')[] {
    const l = this.leagueState();
    if (!l) return [];
    
    const team = l.teams.find(t => t.id === teamId);
    return team?.stats.last5 || [];
  }

  getTeamStatistics(teamId: string) {
    const l = this.leagueState();
    if (!l) return null;
    
    const team = l.teams.find(t => t.id === teamId);
    if (!team) return null;
    
    // Get all matches involving this team
    const teamMatches = l.schedule.filter(m => m.homeTeamId === teamId || m.awayTeamId === teamId);
    
    // Calculate advanced statistics
    const totalMatches = teamMatches.length;
    const wins = teamMatches.filter(m => 
      (m.homeTeamId === teamId && m.homeScore! > m.awayScore!) ||
      (m.awayTeamId === teamId && m.awayScore! > m.homeScore!)
    ).length;
    
    const draws = teamMatches.filter(m => m.homeScore === m.awayScore).length;
    const losses = totalMatches - wins - draws;
    
    const goalsFor = teamMatches.reduce((sum, m) => 
      sum + (m.homeTeamId === teamId ? m.homeScore! : m.awayScore!), 0
    );
    
    const goalsAgainst = teamMatches.reduce((sum, m) => 
      sum + (m.homeTeamId === teamId ? m.awayScore! : m.homeScore!), 0
    );
    
    return {
      team,
      matchesPlayed: totalMatches,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor - goalsAgainst,
      points: wins * 3 + draws,
      winRate: totalMatches > 0 ? (wins / totalMatches) * 100 : 0
    };
  }
}
