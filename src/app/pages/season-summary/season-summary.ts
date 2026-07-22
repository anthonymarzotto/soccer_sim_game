import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { FormationLibraryService } from '../../services/formation-library.service';
import { Player, Team, Match, Position } from '../../models/types';
import { calculateAverageMatchRating, scaleMatchRating } from '../../models/player-career-stats';
import { InjuryRecord, getInjuryDefinition } from '../../data/injuries';
import { getPositionGroup } from '../../models/enums';
 
@Component({
  selector: 'app-season-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './season-summary.html',
})
export class SeasonSummaryComponent {
  private gameService = inject(GameService);
  private formationLibrary = inject(FormationLibraryService);

  getPositionGroup = getPositionGroup;

  // Filters
  selectedTeamId = signal<string>('');
  selectedSeasonYear = signal<number>(0);

  constructor() {
    const league = this.gameService.league();
    if (league) {
      this.selectedSeasonYear.set(league.currentSeasonYear);
      if (league.userTeamId) {
        this.selectedTeamId.set(league.userTeamId);
      } else {
        this.selectedTeamId.set('all');
      }
    } else {
      this.selectedTeamId.set('all');
    }
  }

  // Data sources
  teams = computed(() => {
    const league = this.gameService.league();
    if (!league) return [];
    return [...league.teams].sort((a, b) => a.name.localeCompare(b.name));
  });

  availableSeasons = computed(() => {
    const league = this.gameService.league();
    if (!league) return [new Date().getFullYear()];
    const seasons = new Set<number>();
    league.teams.forEach(team => {
      team.players.forEach(p => p.careerStats.forEach(s => seasons.add(s.seasonYear)));
    });
    seasons.add(league.currentSeasonYear);
    return Array.from(seasons).sort((a, b) => b - a);
  });

  private playersForSeasonAndTeam = computed(() => {
    const league = this.gameService.league();
    if (!league) return [];
    const teamId = this.selectedTeamId();
    const season = this.selectedSeasonYear();

    const allPlayers: { player: Player, team: Team }[] = [];
    if (teamId === 'all') {
      league.teams.forEach(team => {
        team.players.forEach(player => allPlayers.push({ player, team }));
      });
    } else {
      const team = league.teams.find(t => t.id === teamId);
      if (team) {
        team.players.forEach(player => allPlayers.push({ player, team }));
      }
    }

    // Filter to players who were actually playing this season (have season attributes for this year)
    // Or if it's the current season, they are on the team
    return allPlayers.filter(p => {
      if (season === league.currentSeasonYear) return true;
      return p.player.careerStats.some(s => s.seasonYear === season) ||
             p.player.seasonAttributes.some(s => s.seasonYear === season) ||
             p.player.transferHistory?.some(t => t.seasonYear === season);
    });
  });

  private playedMatchesForSeasonAndTeam = computed(() => {
    const league = this.gameService.league();
    if (!league) return [];
    const teamId = this.selectedTeamId();
    const season = this.selectedSeasonYear();

    return league.schedule.filter(m =>
      m.played &&
      m.seasonYear === season &&
      (teamId === 'all' || m.homeTeamId === teamId || m.awayTeamId === teamId)
    );
  });

  // Derived stats
  topAvgScorePlayers = computed(() => {
    const season = this.selectedSeasonYear();
    const players = this.playersForSeasonAndTeam()
      .map(p => {
        const stats = p.player.careerStats.find(s => s.seasonYear === season);
        if (!stats || stats.matchesPlayed <= 0) return null;
        const avgScore = calculateAverageMatchRating(stats);
        if (avgScore === null) return null;
        const rawAvg = stats.totalMatchRating / stats.matchesPlayed;
        return { player: p.player, team: p.team, score: avgScore, rawAvg };
      })
      .filter((p): p is { player: Player; team: Team; score: number; rawAvg: number } => p !== null);

    return players.sort((a, b) => b.rawAvg - a.rawAvg).slice(0, 5);
  });

  bottomAvgScorePlayers = computed(() => {
    const season = this.selectedSeasonYear();
    const players = this.playersForSeasonAndTeam()
      .map(p => {
        const stats = p.player.careerStats.find(s => s.seasonYear === season);
        if (!stats || stats.matchesPlayed <= 0) return null;
        const avgScore = calculateAverageMatchRating(stats);
        if (avgScore === null) return null;
        const rawAvg = stats.totalMatchRating / stats.matchesPlayed;
        return { player: p.player, team: p.team, score: avgScore, rawAvg };
      })
      .filter((p): p is { player: Player; team: Team; score: number; rawAvg: number } => p !== null);

    return players.sort((a, b) => a.rawAvg - b.rawAvg).slice(0, 5);
  });

  // Function to get player match stats
  bestMatchScores = computed(() => {
    return this.getPlayerMatchScores(true);
  });

  worstMatchScores = computed(() => {
    return this.getPlayerMatchScores(false);
  });

  private getPlayerMatchScores(isBest: boolean) {
    const matches = this.playedMatchesForSeasonAndTeam();
    const teamId = this.selectedTeamId();
    const scores: { player: { id: string, name: string, position: Position }, opponentName: string, isHome: boolean, rating: number, match: Match }[] = [];

    const league = this.gameService.league();
    if (!league) return [];

    for (const match of matches) {
      if (!match.matchReport) continue;

      const homeTeam = league.teams.find(t => t.id === match.homeTeamId);
      const awayTeam = league.teams.find(t => t.id === match.awayTeamId);

      if (teamId === 'all' || match.homeTeamId === teamId) {
        if (homeTeam && awayTeam) {
          for (const stat of match.matchReport.homePlayerStats) {
            if (stat.minutesPlayed && stat.minutesPlayed > 0) {
              scores.push({
                player: { id: stat.playerId, name: stat.playerName, position: stat.position },
                opponentName: awayTeam.name,
                isHome: true,
                rating: scaleMatchRating(stat.rating),
                match
              });
            }
          }
        }
      }

      if (teamId === 'all' || match.awayTeamId === teamId) {
        if (homeTeam && awayTeam) {
          for (const stat of match.matchReport.awayPlayerStats) {
            if (stat.minutesPlayed && stat.minutesPlayed > 0) {
              scores.push({
                player: { id: stat.playerId, name: stat.playerName, position: stat.position },
                opponentName: homeTeam.name,
                isHome: false,
                rating: scaleMatchRating(stat.rating),
                match
              });
            }
          }
        }
      }
    }

    if (isBest) {
      return scores.sort((a, b) => b.rating - a.rating).slice(0, 5);
    } else {
      return scores.sort((a, b) => a.rating - b.rating).slice(0, 5);
    }
  }

  statLeaders = computed(() => {
    const season = this.selectedSeasonYear();
    interface PlayerWithStats { player: Player; team: Team; stats: NonNullable<Player['careerStats'][0]> }
    const players: PlayerWithStats[] = this.playersForSeasonAndTeam()
      .map(p => {
        const stats = p.player.careerStats.find(s => s.seasonYear === season);
        return { player: p.player, team: p.team, stats };
      })
      .filter((p): p is PlayerWithStats => p.stats !== undefined);

    const getTop = (key: keyof PlayerWithStats['stats'], count = 3, excludeGk = false) => {
      return [...players]
        .filter(p => {
          const val = p.stats[key];
          if (excludeGk && p.player.position === Position.GK) {
            return false;
          }
          return typeof val === 'number' && val > 0;
        })
        .sort((a, b) => ((b.stats[key] as number) || 0) - ((a.stats[key] as number) || 0))
        .slice(0, count)
        .map(p => ({ name: p.player.name, team: p.team.name, val: p.stats[key] as number, id: p.player.id, position: p.player.position }));
    };

    return {
      goals: getTop('goals'),
      assists: getTop('assists'),
      tackles: getTop('tackles'),
      interceptions: getTop('interceptions'),
      clutchActions: getTop('clutchActions', 3, true)
    };
  });

  contractsEnding = computed(() => {
    const season = this.selectedSeasonYear();
    // Contracts ending at the end of this season
    const players = this.playersForSeasonAndTeam()
      .filter(p => p.player.contract?.expiresAfterSeason === season)
      .map(p => ({
        player: p.player,
        team: p.team,
        wage: p.player.contract.agreedWageCost
      }))
      .sort((a, b) => b.wage - a.wage); // Sort by highest wage

    return players;
  });

  longestInjuries = computed(() => {
    const season = this.selectedSeasonYear();
    const injuries: { player: Player, team: Team, record: InjuryRecord, name: string }[] = [];

    this.playersForSeasonAndTeam().forEach(p => {
      if (p.player.injuries) {
        p.player.injuries.forEach(inj => {
          if (inj.sustainedInSeason === season) {
            const def = getInjuryDefinition(inj.definitionId);
            injuries.push({
              player: p.player,
              team: p.team,
              record: inj,
              name: def?.name ?? 'Injury'
            });
          }
        });
      }
    });

    return injuries.sort((a, b) => b.record.totalWeeks - a.record.totalWeeks).slice(0, 5);
  });

  longestSuspensions = computed(() => {
    const season = this.selectedSeasonYear();
    const suspensions: { player: Player, team: Team, games: number, reason: string }[] = [];

    this.playersForSeasonAndTeam().forEach(p => {
      if (p.player.suspensions) {
        p.player.suspensions.forEach(susp => {
          if (susp.sustainedInSeason === season) {
            suspensions.push({
              player: p.player,
              team: p.team,
              games: susp.totalGames,
              reason: susp.reason
            });
          }
        });
      }
    });

    return suspensions.sort((a, b) => b.games - a.games).slice(0, 5);
  });

  formatSuspensionReason(reason: string): string {
    switch (reason) {
      case 'SECOND_YELLOW': return 'Second Yellow';
      case 'DOGSO': return 'DOGSO';
      case 'SERIOUS_FOUL': return 'Serious Foul';
      case 'SPITTING': return 'Spitting';
      case '5_YELLOWS': return '5 Yellows';
      case '10_YELLOWS': return '10 Yellows';
      case '15_YELLOWS': return '15 Yellows';
      case '20_YELLOWS': return '20 Yellows';
      default: return reason;
    }
  }

  mostUsedFormations = computed(() => {
    const matches = this.playedMatchesForSeasonAndTeam();
    const teamId = this.selectedTeamId();

    interface FormationRecord {
      count: number;
      points: number;
      goalsFor: number;
      goalsAgainst: number;
    }
    const records = new Map<string, FormationRecord>();

    const addRecord = (formationId: string, gf: number, ga: number) => {
      let pts = 0;
      if (gf > ga) pts = 3;
      else if (gf === ga) pts = 1;

      const current = records.get(formationId) || { count: 0, points: 0, goalsFor: 0, goalsAgainst: 0 };
      records.set(formationId, {
        count: current.count + 1,
        points: current.points + pts,
        goalsFor: current.goalsFor + gf,
        goalsAgainst: current.goalsAgainst + ga
      });
    };

    for (const match of matches) {
      if (match.homeScore === undefined || match.awayScore === undefined) continue;

      if (teamId === 'all' || match.homeTeamId === teamId) {
        const f = match.homeLineup?.selectedFormationId;
        if (f) {
          addRecord(f, match.homeScore, match.awayScore);
        }
      }
      if (teamId === 'all' || match.awayTeamId === teamId) {
        const f = match.awayLineup?.selectedFormationId;
        if (f) {
          addRecord(f, match.awayScore, match.homeScore);
        }
      }
    }

    return Array.from(records.entries())
      .map(([id, rec]) => {
        const form = this.formationLibrary.getFormationById(id);
        return {
          name: form?.shortCode ?? form?.name ?? id,
          count: rec.count,
          points: rec.points,
          goalsFor: rec.goalsFor,
          goalsAgainst: rec.goalsAgainst,
          goalDiff: rec.goalsFor - rec.goalsAgainst
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  });

  biggestWinsLosses = computed(() => {
    const matches = this.playedMatchesForSeasonAndTeam();
    const teamId = this.selectedTeamId();
    const league = this.gameService.league();
    if (!league) return { wins: [], losses: [] };

    const results: { match: Match, team: string, opponent: string, diff: number, isWin: boolean, isHome: boolean }[] = [];

    for (const match of matches) {
      if (match.homeScore === undefined || match.awayScore === undefined) continue;

      const homeTeam = league.teams.find(t => t.id === match.homeTeamId);
      const awayTeam = league.teams.find(t => t.id === match.awayTeamId);
      if (!homeTeam || !awayTeam) continue;

      if (teamId === 'all') {
         if (match.homeScore > match.awayScore) {
           results.push({ match, team: homeTeam.name, opponent: awayTeam.name, diff: match.homeScore - match.awayScore, isWin: true, isHome: true });
         } else if (match.awayScore > match.homeScore) {
           results.push({ match, team: awayTeam.name, opponent: homeTeam.name, diff: match.awayScore - match.homeScore, isWin: true, isHome: false });
         }
      } else {
        if (match.homeTeamId === teamId) {
          const isWin = match.homeScore > match.awayScore;
          const isLoss = match.homeScore < match.awayScore;
          if (isWin || isLoss) {
            results.push({
              match,
              team: homeTeam.name,
              opponent: awayTeam.name,
              diff: Math.abs(match.homeScore - match.awayScore),
              isWin,
              isHome: true
            });
          }
        } else if (match.awayTeamId === teamId) {
          const isWin = match.awayScore > match.homeScore;
          const isLoss = match.awayScore < match.homeScore;
          if (isWin || isLoss) {
            results.push({
              match,
              team: awayTeam.name,
              opponent: homeTeam.name,
              diff: Math.abs(match.awayScore - match.homeScore),
              isWin,
              isHome: false
            });
          }
        }
      }
    }

    const wins = results.filter(r => r.isWin).sort((a, b) => {
      if (b.diff !== a.diff) return b.diff - a.diff;
      const aGoals = a.isHome ? a.match.homeScore! : a.match.awayScore!;
      const bGoals = b.isHome ? b.match.homeScore! : b.match.awayScore!;
      return bGoals - aGoals;
    }).slice(0, 3);

    // For losses, we want the biggest diff. But if 'all' is selected, a biggest loss is just the inverse of a biggest win,
    // so we skip losses if 'all' is selected to avoid redundancy, or we can just show them.
    const losses = teamId === 'all' ? [] : results.filter(r => !r.isWin).sort((a, b) => b.diff - a.diff).slice(0, 3);

    return { wins, losses };
  });

  streaks = computed(() => {
    const matches = this.playedMatchesForSeasonAndTeam();
    const teamId = this.selectedTeamId();
    const league = this.gameService.league();
    if (!league) return { win: 0, undefeated: 0, winless: 0, losing: 0 };

    if (teamId === 'all') {
      // Calculate max streaks for all teams
      let maxWin = 0, maxUndefeated = 0, maxWinless = 0, maxLosing = 0;
      for (const team of league.teams) {
        const tMatches = matches.filter(m => m.homeTeamId === team.id || m.awayTeamId === team.id).sort((a, b) => a.week - b.week);
        const s = this.calculateStreaksForMatches(tMatches, team.id);
        if (s.win > maxWin) maxWin = s.win;
        if (s.undefeated > maxUndefeated) maxUndefeated = s.undefeated;
        if (s.winless > maxWinless) maxWinless = s.winless;
        if (s.losing > maxLosing) maxLosing = s.losing;
      }
      return { win: maxWin, undefeated: maxUndefeated, winless: maxWinless, losing: maxLosing };
    } else {
      const tMatches = matches.sort((a, b) => a.week - b.week);
      return this.calculateStreaksForMatches(tMatches, teamId);
    }
  });

  private calculateStreaksForMatches(matches: Match[], teamId: string) {
    let currentWin = 0, maxWin = 0;
    let currentUndefeated = 0, maxUndefeated = 0;
    let currentWinless = 0, maxWinless = 0;
    let currentLosing = 0, maxLosing = 0;

    for (const match of matches) {
      if (match.homeScore === undefined || match.awayScore === undefined) continue;

      const isHome = match.homeTeamId === teamId;
      const isWin = isHome ? match.homeScore > match.awayScore : match.awayScore > match.homeScore;
      const isDraw = match.homeScore === match.awayScore;
      const isLoss = isHome ? match.homeScore < match.awayScore : match.awayScore < match.homeScore;

      if (isWin) {
        currentWin++; maxWin = Math.max(maxWin, currentWin);
        currentUndefeated++; maxUndefeated = Math.max(maxUndefeated, currentUndefeated);
        currentWinless = 0;
        currentLosing = 0;
      } else if (isDraw) {
        currentWin = 0;
        currentUndefeated++; maxUndefeated = Math.max(maxUndefeated, currentUndefeated);
        currentWinless++; maxWinless = Math.max(maxWinless, currentWinless);
        currentLosing = 0;
      } else if (isLoss) {
        currentWin = 0;
        currentUndefeated = 0;
        currentWinless++; maxWinless = Math.max(maxWinless, currentWinless);
        currentLosing++; maxLosing = Math.max(maxLosing, currentLosing);
      }
    }

    return { win: maxWin, undefeated: maxUndefeated, winless: maxWinless, losing: maxLosing };
  }
}
