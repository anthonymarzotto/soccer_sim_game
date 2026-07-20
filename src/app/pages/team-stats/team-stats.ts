import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GameService } from '../../services/game.service';
import { TeamBadgeComponent } from '../../components/team-badge/team-badge';
import { Team } from '../../models/types';

type SortColumn = 'name' | 'played' | 'won' | 'drawn' | 'lost' | 'goalsFor' | 'goalsAgainst' | 'goalDifference' | 'points' | 'shots' | 'shotsOnTarget' | 'passes' | 'passesSuccessful' | 'passCompletionRate' | 'tackles' | 'interceptions' | 'saves' | 'cleanSheets' | 'fouls' | 'yellowCards' | 'redCards' | 'averageRating' | 'clutchActions';
type SortableValue = string | number;

interface TeamStatsRow {
  team: Team;
  seasonYear: number;

  // Base stats
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;

  // Aggregated player stats
  shots: number;
  shotsOnTarget: number;
  passes: number;
  passesSuccessful: number;
  tackles: number;
  interceptions: number;
  saves: number;
  cleanSheets: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  clutchActions: number;

  // Averages
  totalMatchRating: number;
  totalMatchRatingCount: number;
}

@Component({
  selector: 'app-team-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, FormsModule, TeamBadgeComponent],
  templateUrl: './team-stats.html',
  styleUrls: ['./team-stats.css']
})
export class TeamStatsComponent {
  public gameService = inject(GameService);

  currentSeasonYear = computed(() => this.gameService.league()?.currentSeasonYear ?? new Date().getFullYear());

  // Filter and sort state
  selectedYear = signal<number>(0);
  sortColumn = signal<SortColumn | ''>('points');
  sortDirection = signal<'asc' | 'desc'>('desc');

  availableSeasons = computed(() => {
    const league = this.gameService.league();
    if (!league) return [this.currentSeasonYear()];

    const seasons = new Set<number>();
    seasons.add(league.currentSeasonYear);

    league.teams.forEach(team => {
      team.seasonSnapshots?.forEach(stats => {
        seasons.add(stats.seasonYear);
      });
    });

    return Array.from(seasons).sort((a, b) => b - a);
  });

  // Get filtered and sorted teams
  filteredAndSortedTeams = computed(() => {
    const league = this.gameService.league();
    if (!league) return [];

    const year = this.selectedYear();
    const effectiveYear = year || this.currentSeasonYear();

    const rows: TeamStatsRow[] = [];

    league.teams.forEach(team => {
      const teamSnapshot = this.gameService.getTeamSnapshotForSeason(team, effectiveYear);
      const teamStats = teamSnapshot?.stats;

      if (!teamStats) return;

      const row: TeamStatsRow = {
        team,
        seasonYear: effectiveYear,

        played: teamStats.played || 0,
        won: teamStats.won || 0,
        drawn: teamStats.drawn || 0,
        lost: teamStats.lost || 0,
        goalsFor: teamStats.goalsFor || 0,
        goalsAgainst: teamStats.goalsAgainst || 0,
        goalDifference: (teamStats.goalsFor || 0) - (teamStats.goalsAgainst || 0),
        points: teamStats.points || 0,

        shots: 0,
        shotsOnTarget: 0,
        passes: 0,
        passesSuccessful: 0,
        tackles: 0,
        interceptions: 0,
        saves: 0,
        cleanSheets: 0,
        fouls: 0,
        yellowCards: 0,
        redCards: 0,
        clutchActions: 0,

        totalMatchRating: 0,
        totalMatchRatingCount: 0
      };

      // Aggregate player stats
      team.players.forEach(player => {
        const playerStats = player.careerStats.find(s => s.seasonYear === effectiveYear);
        if (playerStats) {
          row.shots += playerStats.shots || 0;
          row.shotsOnTarget += playerStats.shotsOnTarget || 0;
          row.passes += playerStats.passes || 0;
          row.passesSuccessful += playerStats.passesSuccessful || 0;
          row.tackles += playerStats.tackles || 0;
          row.interceptions += playerStats.interceptions || 0;
          row.saves += playerStats.saves || 0;
          row.cleanSheets += playerStats.cleanSheets || 0;
          row.fouls += playerStats.fouls || 0;
          row.yellowCards += playerStats.yellowCards || 0;
          row.redCards += playerStats.redCards || 0;
          row.clutchActions += playerStats.clutchActions || 0;

          if (playerStats.totalMatchRating > 0 && playerStats.matchesPlayed > 0) {
            row.totalMatchRating += playerStats.totalMatchRating;
            row.totalMatchRatingCount += playerStats.matchesPlayed;
          }
        }
      });

      rows.push(row);
    });

    // Apply sorting
    const column = this.sortColumn();
    if (column) {
      const direction = this.sortDirection() === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        let aVal: SortableValue;
        let bVal: SortableValue;

        if (column === 'name') {
          aVal = a.team.name;
          bVal = b.team.name;
        } else if (column === 'averageRating') {
          aVal = this.calculateAverageRating(a);
          bVal = this.calculateAverageRating(b);
        } else if (column === 'passCompletionRate') {
          const aRate = a.passes > 0 ? a.passesSuccessful / a.passes : 0;
          const bRate = b.passes > 0 ? b.passesSuccessful / b.passes : 0;
          aVal = aRate;
          bVal = bRate;
        } else {
          aVal = a[column as keyof TeamStatsRow] as number;
          bVal = b[column as keyof TeamStatsRow] as number;
        }

        if (typeof aVal === 'string') {
          return aVal.localeCompare(String(bVal)) * direction;
        }

        return (aVal - Number(bVal)) * direction;
      });
    }

    return rows;
  });

  userTeamId = computed(() => this.gameService.league()?.userTeamId ?? null);

  // Columns to display
  columns: { key: SortColumn; label: string; tooltip: string; sortable: boolean; cls?: string }[] = [
    { key: 'name', label: 'Team', tooltip: 'Team Name', sortable: true, cls: 'text-left' },
    { key: 'played', label: 'MP', tooltip: 'Matches Played', sortable: true },
    { key: 'won', label: 'W', tooltip: 'Wins', sortable: true },
    { key: 'drawn', label: 'D', tooltip: 'Draws', sortable: true },
    { key: 'lost', label: 'L', tooltip: 'Losses', sortable: true },
    { key: 'goalsFor', label: 'GF', tooltip: 'Goals For', sortable: true },
    { key: 'goalsAgainst', label: 'GA', tooltip: 'Goals Against', sortable: true },
    { key: 'goalDifference', label: 'GD', tooltip: 'Goal Difference', sortable: true },
    { key: 'points', label: 'Pts', tooltip: 'Points', sortable: true, cls: 'text-accent font-bold text-base' },
    { key: 'shots', label: 'Shots', tooltip: 'Total Shots', sortable: true },
    { key: 'shotsOnTarget', label: 'SoT', tooltip: 'Shots on Target', sortable: true },
    { key: 'passes', label: 'P (Att)', tooltip: 'Total Passes Attempted', sortable: true },
    { key: 'passesSuccessful', label: 'P (Comp)', tooltip: 'Total Passes Completed', sortable: true },
    { key: 'passCompletionRate', label: 'P%', tooltip: 'Pass Completion Percentage', sortable: true },
    { key: 'tackles', label: 'Tackles', tooltip: 'Total Tackles', sortable: true },
    { key: 'interceptions', label: 'Ints', tooltip: 'Total Interceptions', sortable: true },
    { key: 'saves', label: 'Saves', tooltip: 'Total Saves', sortable: true },
    { key: 'cleanSheets', label: 'CS', tooltip: 'Total Clean Sheets (All Players)', sortable: true },
    { key: 'fouls', label: 'Fouls', tooltip: 'Total Fouls Committed', sortable: true },
    { key: 'yellowCards', label: 'Yel', tooltip: 'Yellow Cards', sortable: true, cls: 'text-warning' },
    { key: 'redCards', label: 'Red', tooltip: 'Red Cards', sortable: true, cls: 'text-danger' },
    { key: 'averageRating', label: 'Avg R', tooltip: 'Average Match Rating (Team-wide)', sortable: true, cls: 'text-warning' },
    { key: 'clutchActions', label: 'Clutch', tooltip: 'Total Clutch Actions (Goals/Saves/Blocks)', sortable: true }
  ];

  toggleSort(column: SortColumn) {
    if (this.sortColumn() === column) {
      // Toggle direction if same column
      this.sortDirection.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to descending (for numeric stats)
      this.sortColumn.set(column);
      this.sortDirection.set(column === 'name' ? 'asc' : 'desc');
    }
  }

  calculateAverageRating(row: TeamStatsRow): number {
    if (row.totalMatchRatingCount === 0) return 0;
    return row.totalMatchRating / row.totalMatchRatingCount;
  }

  getFormattedAverageRating(row: TeamStatsRow): string {
    if (row.totalMatchRatingCount === 0) return '0.00';
    // Format to 2 decimal places manually, formatAverageMatchRating takes player stats
    return (row.totalMatchRating / row.totalMatchRatingCount).toFixed(2);
  }

  getPassCompletionRate(row: TeamStatsRow): string {
    if (row.passes === 0) return '0%';
    const rate = Math.round((row.passesSuccessful / row.passes) * 100);
    return `${rate}%`;
  }

  isUserTeam(row: TeamStatsRow): boolean {
    return row.team.id === this.userTeamId();
  }

  isSorted(column: SortColumn): boolean {
    return this.sortColumn() === column;
  }

  getSortIndicator(column: SortColumn): string {
    if (!this.isSorted(column)) return '';
    return this.sortDirection() === 'asc' ? '▲' : '▼';
  }
}
