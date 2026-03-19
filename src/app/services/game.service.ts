import { Injectable, signal, computed, inject } from '@angular/core';
import { League, Match, Team, Player, Role } from '../models/types';
import { GeneratorService } from './generator.service';
import { MatchSimulationService } from './match.simulation.service';
import { CommentaryService } from './commentary.service';
import { StatisticsService } from './statistics.service';
import { PostMatchAnalysisService } from './post.match.analysis.service';
import { SimulationConfig } from '../models/simulation.types';
import { MatchResult, CommentaryStyle, Position, EventImportance, EventType } from '../models/enums';

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
        commentaryStyle: CommentaryStyle.DETAILED
      });

      // The match result is already updated in the league state by simulateMatchWithDetails
      console.log(`Match ${match.id}: ${homeTeam.name} ${result.matchState.homeScore} - ${result.matchState.awayScore} ${awayTeam.name}`);
      console.log('Key Events:', result.matchState.events.length);
      console.log('Commentary Sample:', result.commentary.slice(0, 3));
    });

    // Advance to next week
    this.leagueState.update(league => league ? { ...league, currentWeek: league.currentWeek + 1 } : null);
  }

  private updateLast5(team: Team, result: MatchResult) {
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

  updatePlayerRole(playerId: string, newRole: Role) {
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

      const players = team.players.map(p => ({ ...p, role: Role.NOT_DRESSED }));

      const gks = players.filter(p => p.position === Position.GOALKEEPER).sort((a, b) => b.overall - a.overall);
      const defs = players.filter(p => p.position === Position.DEFENDER).sort((a, b) => b.overall - a.overall);
      const mids = players.filter(p => p.position === Position.MIDFIELDER).sort((a, b) => b.overall - a.overall);
      const fwds = players.filter(p => p.position === Position.FORWARD).sort((a, b) => b.overall - a.overall);

      if (gks.length > 0) gks[0].role = Role.GOALKEEPER;
      for (let i = 0; i < Math.min(4, defs.length); i++) defs[i].role = Role.DEFENSE;
      for (let i = 0; i < Math.min(4, mids.length); i++) mids[i].role = Role.MIDFIELD;
      for (let i = 0; i < Math.min(2, fwds.length); i++) fwds[i].role = Role.ATTACK;

      if (gks.length > 1) gks[1].role = Role.BENCH;
      for (let i = 4; i < Math.min(7, defs.length); i++) defs[i].role = Role.BENCH;
      for (let i = 4; i < Math.min(8, mids.length); i++) mids[i].role = Role.BENCH;
      for (let i = 2; i < Math.min(4, fwds.length); i++) fwds[i].role = Role.BENCH;

      return { ...team, players };
    });
  }

  public calculateTeamOverall(team: Team): number {
    const starters = team.players.filter(p => p.role !== Role.BENCH && p.role !== Role.NOT_DRESSED);
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
    
    // Extract key events from match state
    const keyEvents = this.extractKeyEvents(matchState.events);
    
    // Update league state with results
    this.updateLeagueWithMatchResult(match, matchState, homeTeam, awayTeam, keyEvents, matchStats, matchReport);
    
    return {
      matchState,
      matchStats,
      matchReport,
      keyEvents,
      commentary: this.generateMatchCommentary(matchState, homeTeam, awayTeam, config?.commentaryStyle === CommentaryStyle.STATS_ONLY ? CommentaryStyle.DETAILED : (config?.commentaryStyle || CommentaryStyle.DETAILED))
    };
  }

  private updateLeagueWithMatchResult(match: Match, matchState: any, homeTeam: Team, awayTeam: Team, keyEvents: any[], matchStats: any, matchReport: any) {
    const l = this.leagueState();
    if (!l) return;

    // Update match in schedule
    const updatedSchedule = l.schedule.map(m => 
      m.id === match.id 
        ? { 
            ...m, 
            homeScore: matchState.homeScore, 
            awayScore: matchState.awayScore, 
            played: true,
            keyEvents,
            matchStats,
            matchReport
          }
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

    // Update player career stats
    this.updatePlayerCareerStats(matchState.events, homeTeam, awayTeam, matchState.homeScore, matchState.awayScore);

    this.leagueState.set({
      ...l,
      teams: updatedTeams,
      schedule: updatedSchedule
    });
  }

  private updatePlayerCareerStats(events: any[], homeTeam: Team, awayTeam: Team, homeScore: number, awayScore: number) {
    const l = this.leagueState();
    if (!l) return;

    // Create a map of all players for quick lookup
    const allPlayers = new Map<string, Player>();
    [...homeTeam.players, ...awayTeam.players].forEach(player => {
      allPlayers.set(player.id, player);
    });

    // Update player stats based on events
    events.forEach(event => {
      event.playerIds.forEach((playerId: string) => {
        const player = allPlayers.get(playerId);
        if (!player) return;

        // Update career stats based on event type
        switch (event.type) {
          case 'GOAL':
            player.careerStats.goals++;
            break;
          case 'ASSIST':
            player.careerStats.assists++;
            break;
          case 'SHOT':
            player.careerStats.shots++;
            if (event.success) {
              player.careerStats.shotsOnTarget++;
            }
            break;
          case 'TACKLE':
            player.careerStats.tackles++;
            break;
          case 'INTERCEPTION':
            player.careerStats.interceptions++;
            break;
          case 'PASS':
            player.careerStats.passes++;
            break;
          case 'SAVE':
            player.careerStats.saves++;
            break;
          case 'YELLOW_CARD':
            player.careerStats.yellowCards++;
            break;
          case 'RED_CARD':
            player.careerStats.redCards++;
            break;
        }
      });
    });

    // Update minutes played for all players who participated
    const allTeamPlayers = [...homeTeam.players, ...awayTeam.players];
    allTeamPlayers.forEach(player => {
      if (player.role !== Role.NOT_DRESSED) {
        player.careerStats.minutesPlayed += 90; // Full match
      }
    });

    // Update matches played for all players who participated
    allTeamPlayers.forEach(player => {
      if (player.role !== Role.NOT_DRESSED) {
        player.careerStats.matchesPlayed++;
      }
    });

    // Update clean sheets for goalkeepers
    const homeGoalkeeper = homeTeam.players.find(p => p.position === Position.GOALKEEPER && p.role === Role.GOALKEEPER);
    const awayGoalkeeper = awayTeam.players.find(p => p.position === Position.GOALKEEPER && p.role === Role.GOALKEEPER);

    if (homeGoalkeeper && homeScore === 0) {
      homeGoalkeeper.careerStats.cleanSheets++;
    }
    if (awayGoalkeeper && awayScore === 0) {
      awayGoalkeeper.careerStats.cleanSheets++;
    }
  }

  private extractKeyEvents(events: any[]): any[] {
    const keyEvents: any[] = [];

    events.forEach(event => {
      let importance: EventImportance = EventImportance.LOW;
      let icon = '';
      let description = event.description;

      switch (event.type) {
        case EventType.GOAL:
          importance = EventImportance.HIGH;
          icon = '⚽';
          description = `Goal by ${event.playerIds.join(', ')} at ${event.time}'`;
          break;
        case EventType.RED_CARD:
          importance = EventImportance.HIGH;
          icon = '🟥';
          description = `Red card for ${event.playerIds.join(', ')} at ${event.time}'`;
          break;
        case EventType.YELLOW_CARD:
          importance = EventImportance.MEDIUM;
          icon = '🟨';
          description = `Yellow card for ${event.playerIds.join(', ')} at ${event.time}'`;
          break;
        case EventType.PENALTY:
          importance = EventImportance.HIGH;
          icon = '🎯';
          description = `Penalty awarded at ${event.time}'`;
          break;
        case EventType.CORNER:
          if (event.success) {
            importance = EventImportance.MEDIUM;
            icon = '📐';
            description = `Dangerous corner at ${event.time}'`;
          }
          break;
        case EventType.SUBSTITUTION:
          importance = EventImportance.MEDIUM;
          icon = '🔄';
          description = `Substitution at ${event.time}'`;
          break;
      }

      if (importance !== EventImportance.LOW || event.type === EventType.GOAL || event.type === EventType.RED_CARD) {
        keyEvents.push({
          id: event.id,
          type: event.type,
          description,
          playerIds: event.playerIds,
          time: event.time,
          location: event.location,
          icon,
          importance
        });
      }
    });

    return keyEvents.sort((a, b) => a.time - b.time);
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

  private getResult(homeScore: number, awayScore: number, isHome: boolean): MatchResult {
    if (isHome) {
      if (homeScore > awayScore) return MatchResult.WIN;
      if (homeScore === awayScore) return MatchResult.DRAW;
      return MatchResult.LOSS;
    } else {
      if (awayScore > homeScore) return MatchResult.WIN;
      if (awayScore === homeScore) return MatchResult.DRAW;
      return MatchResult.LOSS;
    }
  }

  private updateLast5Array(last5: MatchResult[], result: MatchResult): MatchResult[] {
    const newLast5 = [result, ...last5];
    if (newLast5.length > 5) {
      newLast5.pop();
    }
    return newLast5;
  }

  private generateMatchCommentary(matchState: any, homeTeam: Team, awayTeam: Team, style: CommentaryStyle | undefined): string[] {
    const commentary: string[] = [];
    
    // Starting XI
    commentary.push(...this.commentaryService.generateStartingXICommentary(homeTeam, awayTeam));
    
    // Key events
    matchState.events.forEach((event: any) => {
      const eventCommentary = this.commentaryService.generateEventCommentary(event, homeTeam, awayTeam, style || CommentaryStyle.DETAILED);
      commentary.push(`${event.time}': ${eventCommentary}`);
    });
    
    // Half-time
    commentary.push(this.commentaryService.generateHalfTimeCommentary(matchState.homeScore, matchState.awayScore, matchState.events));
    
    // Full-time
    commentary.push(this.commentaryService.generateFullTimeCommentary(matchState.homeScore, matchState.awayScore, matchState.events));
    
    return commentary;
  }

  getTeamForm(teamId: string): MatchResult[] {
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
