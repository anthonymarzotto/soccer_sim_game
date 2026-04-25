import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GameService } from '../../services/game.service';
import { Player, PlayerCareerStats } from '../../models/types';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Position } from '../../models/enums';
import { calculateAverageMatchRating, formatAverageMatchRating } from '../../models/player-career-stats';
import { TeamBadgeComponent } from '../../components/team-badge/team-badge';

type NumericPlayerCareerStatColumn = Exclude<{
  [K in keyof PlayerCareerStats]: PlayerCareerStats[K] extends number ? K : never;
}[keyof PlayerCareerStats], 'seasonYear' | 'totalMatchRating'>;

type SortColumn = 'name' | 'team' | 'position' | NumericPlayerCareerStatColumn | 'averageRating' | 'starsFirst' | 'starsSecond' | 'starsThird';
type SortableValue = string | number;

interface PlayerStatsRow {
  player: Player;
  seasonYear: number;
  stats: PlayerCareerStats;
}

@Component({
  selector: 'app-player-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, FormsModule, TeamBadgeComponent],
  templateUrl: './player-stats.html',
  styleUrls: ['./player-stats.css']
})
export class PlayerStatsComponent {
  private gameService = inject(GameService);

  // Expose Position enum for template
  Position = Position;

  currentSeasonYear = computed(() => this.gameService.league()?.currentSeasonYear ?? new Date().getFullYear());

  // Filter and sort state
  selectedYear = signal<number>(0);
  selectedTeam = signal<string>('');
  selectedPosition = signal<string>('');
  searchQuery = signal<string>('');
  sortColumn = signal<SortColumn | ''>('');
  sortDirection = signal<'asc' | 'desc'>('desc');
  pageIndex = signal<number>(0);
  pageSize = signal<number>(25);

  // Get all available teams
  availableTeams = computed(() => {
    const league = this.gameService.league();
    if (!league) return [];
    return league.teams.map(t => ({ id: t.id, name: t.name })).sort((a, b) => a.name.localeCompare(b.name));
  });

  // Get all available seasons
  availableSeasons = computed(() => {
    const league = this.gameService.league();
    if (!league) return [this.currentSeasonYear()];
    
    const seasons = new Set<number>();
    league.teams.forEach(team => {
      team.players.forEach(player => {
        player.careerStats.forEach(stats => {
          seasons.add(stats.seasonYear);
        });
      });
    });
    
    return Array.from(seasons).sort((a, b) => b - a);
  });

  // Get all available positions from current players
  availablePositions = computed(() => {
    const league = this.gameService.league();
    if (!league) return [];
    
    const positions = new Set<string>();
    league.teams.forEach(team => {
      team.players.forEach(player => {
        positions.add(player.position);
      });
    });
    
    return Array.from(positions).sort();
  });

  // Get filtered and sorted players
  filteredAndSortedPlayers = computed(() => {
    const league = this.gameService.league();
    if (!league) return [];

    const year = this.selectedYear();
    const effectiveYear = year || this.currentSeasonYear();
    const teamFilter = this.selectedTeam();
    const positionFilter = this.selectedPosition();
    const query = this.searchQuery().toLowerCase();

    // Collect all players with their stats for the selected year
    const rows: PlayerStatsRow[] = [];

    league.teams.forEach(team => {
      team.players.forEach(player => {
        // Apply team filter
        if (teamFilter && team.id !== teamFilter) return;

        // Apply position filter
        if (positionFilter && player.position !== positionFilter) return;

        // Apply search query
        if (query && !player.name.toLowerCase().includes(query)) return;

        // Get stats for the selected year
        const stats = player.careerStats.find(s => s.seasonYear === effectiveYear);
        if (!stats) return;

        rows.push({
          player,
          seasonYear: effectiveYear,
          stats
        });
      });
    });

    // Apply sorting
    const column = this.sortColumn();
    if (column) {
      const direction = this.sortDirection() === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        let aVal: SortableValue;
        let bVal: SortableValue;

        if (column === 'name') {
          aVal = a.player.name;
          bVal = b.player.name;
        } else if (column === 'team') {
          aVal = a.player.teamId;
          bVal = b.player.teamId;
        } else if (column === 'position') {
          aVal = a.player.position;
          bVal = b.player.position;
        } else if (column === 'averageRating') {
          aVal = calculateAverageMatchRating(a.stats) ?? 0;
          bVal = calculateAverageMatchRating(b.stats) ?? 0;
        } else if (column === 'starsFirst') {
          aVal = a.stats.starNominations.first;
          bVal = b.stats.starNominations.first;
        } else if (column === 'starsSecond') {
          aVal = a.stats.starNominations.second;
          bVal = b.stats.starNominations.second;
        } else if (column === 'starsThird') {
          aVal = a.stats.starNominations.third;
          bVal = b.stats.starNominations.third;
        } else {
          aVal = a.stats[column];
          bVal = b.stats[column];
        }

        if (typeof aVal === 'string') {
          return aVal.localeCompare(String(bVal)) * direction;
        }

        return (aVal - Number(bVal)) * direction;
      });
    }

    return rows;
  });

  // Get paginated results
  paginatedPlayers = computed(() => {
    const all = this.filteredAndSortedPlayers();
    const size = this.pageSize();
    const index = this.pageIndex();
    const start = index * size;
    const end = start + size;
    return all.slice(start, end);
  });

  // Calculate total pages
  totalPages = computed(() => {
    const all = this.filteredAndSortedPlayers();
    const size = this.pageSize();
    return Math.ceil(all.length / size);
  });

  // Total number of players
  totalPlayers = computed(() => this.filteredAndSortedPlayers().length);

  userTeamId = computed(() => this.gameService.league()?.userTeamId ?? null);

  // Columns to display
  columns: { key: SortColumn; label: string; sortable: boolean }[] = [
    { key: 'team', label: 'Team', sortable: true },
    { key: 'name', label: 'Player', sortable: true },
    { key: 'position', label: 'Position', sortable: true },
    { key: 'matchesPlayed', label: 'MP', sortable: true },
    { key: 'goals', label: 'Goals', sortable: true },
    { key: 'assists', label: 'Assists', sortable: true },
    { key: 'shots', label: 'Shots', sortable: true },
    { key: 'shotsOnTarget', label: 'SoT', sortable: true },
    { key: 'passes', label: 'Passes', sortable: true },
    { key: 'tackles', label: 'Tackles', sortable: true },
    { key: 'interceptions', label: 'Interceptions', sortable: true },
    { key: 'saves', label: 'Saves', sortable: true },
    { key: 'cleanSheets', label: 'CS', sortable: true },
    { key: 'minutesPlayed', label: 'Minutes', sortable: true },
    { key: 'yellowCards', label: 'Yellow', sortable: true },
    { key: 'redCards', label: 'Red', sortable: true },
    { key: 'fouls', label: 'Fouls', sortable: true },
    { key: 'foulsSuffered', label: 'Fouls Suf', sortable: true },
    { key: 'averageRating', label: 'Avg Rating', sortable: true },
    { key: 'starsFirst', label: '🥇', sortable: true },
    { key: 'starsSecond', label: '🥈', sortable: true },
    { key: 'starsThird', label: '🥉', sortable: true }
  ];

  getTeamName(teamId: string): string {
    const team = this.gameService.getTeam(teamId);
    return team?.name ?? teamId;
  }

  toggleSort(column: SortColumn) {
    if (this.sortColumn() === column) {
      // Toggle direction if same column
      this.sortDirection.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to descending (for numeric stats)
      this.sortColumn.set(column);
      this.sortDirection.set('desc');
    }
  }

  setPageSize(size: number) {
    this.pageSize.set(size);
    this.pageIndex.set(0);
  }

  onPageSizeChange(value: string) {
    const size = parseInt(value, 10);
    if (!Number.isNaN(size)) {
      this.setPageSize(size);
    }
  }

  nextPage() {
    const total = this.totalPages();
    if (this.pageIndex() < total - 1) {
      this.pageIndex.update(i => i + 1);
    }
  }

  previousPage() {
    if (this.pageIndex() > 0) {
      this.pageIndex.update(i => i - 1);
    }
  }

  goToPage(page: number) {
    if (page >= 0 && page < this.totalPages()) {
      this.pageIndex.set(page);
    }
  }

  getColumnValue(row: PlayerStatsRow, column: SortColumn): string | number {
    if (column === 'name') return row.player.name;
    if (column === 'team') return this.getTeamName(row.player.teamId);
    if (column === 'position') return row.player.position;
    if (column === 'averageRating') {
      return formatAverageMatchRating(row.stats);
    }
    if (column === 'starsFirst') return row.stats.starNominations.first;
    if (column === 'starsSecond') return row.stats.starNominations.second;
    if (column === 'starsThird') return row.stats.starNominations.third;
    return row.stats[column];
  }

  isUserTeamPlayer(row: PlayerStatsRow): boolean {
    return row.player.teamId === this.userTeamId();
  }

  isSorted(column: SortColumn): boolean {
    return this.sortColumn() === column;
  }

  getSortIndicator(column: SortColumn): string {
    if (!this.isSorted(column)) return '';
    return this.sortDirection() === 'asc' ? '▲' : '▼';
  }
}
