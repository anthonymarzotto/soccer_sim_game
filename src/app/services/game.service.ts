import { Injectable, signal, computed, inject } from '@angular/core';
import { League, Match, Team, Player } from '../models/types';
import { GeneratorService } from './generator.service';

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

    // Deep clone teams and schedule to avoid mutating state directly
    const clonedTeams = l.teams.map(t => ({
      ...t,
      players: t.players.map(p => ({ ...p })),
      stats: { ...t.stats, last5: [...t.stats.last5] }
    }));
    const clonedSchedule = l.schedule.map(m => ({ ...m }));

    const updatedTeams = this.dressBestPlayers(clonedTeams);

    const matches = clonedSchedule.filter(m => m.week === l.currentWeek);

    matches.forEach(match => {
      if (match.played) return;

      const homeTeam = updatedTeams.find(t => t.id === match.homeTeamId);
      const awayTeam = updatedTeams.find(t => t.id === match.awayTeamId);

      if (!homeTeam || !awayTeam) return;

      // Simple simulation logic based on overall ratings
      const homeOverall = this.calculateTeamOverall(homeTeam);
      const awayOverall = this.calculateTeamOverall(awayTeam);

      // Home advantage
      const homeAdvantage = 5;
      
      const homeChance = homeOverall + homeAdvantage;
      const awayChance = awayOverall;
      
      const totalChance = homeChance + awayChance;
      
      // Generate goals
      let homeGoals = 0;
      let awayGoals = 0;

      for(let i=0; i<5; i++) {
        const rand = Math.random() * totalChance;
        if (rand < homeChance * 0.4) homeGoals++;
        else if (rand > totalChance - (awayChance * 0.4)) awayGoals++;
      }

      match.homeScore = homeGoals;
      match.awayScore = awayGoals;
      match.played = true;

      // Update stats
      homeTeam.stats.played++;
      awayTeam.stats.played++;
      homeTeam.stats.goalsFor += homeGoals;
      homeTeam.stats.goalsAgainst += awayGoals;
      awayTeam.stats.goalsFor += awayGoals;
      awayTeam.stats.goalsAgainst += homeGoals;

      if (homeGoals > awayGoals) {
        homeTeam.stats.won++;
        homeTeam.stats.points += 3;
        awayTeam.stats.lost++;
        this.updateLast5(homeTeam, 'W');
        this.updateLast5(awayTeam, 'L');
      } else if (homeGoals < awayGoals) {
        awayTeam.stats.won++;
        awayTeam.stats.points += 3;
        homeTeam.stats.lost++;
        this.updateLast5(homeTeam, 'L');
        this.updateLast5(awayTeam, 'W');
      } else {
        homeTeam.stats.drawn++;
        homeTeam.stats.points += 1;
        awayTeam.stats.drawn++;
        awayTeam.stats.points += 1;
        this.updateLast5(homeTeam, 'D');
        this.updateLast5(awayTeam, 'D');
      }
    });

    this.leagueState.set({
      ...l,
      teams: updatedTeams,
      schedule: clonedSchedule,
      currentWeek: l.currentWeek + 1
    });
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
}
