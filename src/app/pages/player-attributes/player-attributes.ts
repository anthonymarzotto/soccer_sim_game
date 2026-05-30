import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GameService } from '../../services/game.service';
import { Player, PlayerSeasonAttributes } from '../../models/types';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Position } from '../../models/enums';
import { computeAge, seasonAnchorDate } from '../../models/player-age';
import { getCurrentPlayerSeasonAttributes } from '../../models/season-history';
import { calculateMarketValue, calculatePlayerWageCost } from '../../models/player-progression';
import { TeamBadgeComponent } from '../../components/team-badge/team-badge';

type AttributeKey = 
  | 'speed' | 'strength' | 'endurance' | 'fitness'
  | 'flair' | 'vision' | 'determination'
  | 'tackling' | 'shooting' | 'heading' | 'longPassing' | 'shortPassing'
  | 'handling' | 'reflexes' | 'commandOfArea';

type SortColumn = 'name' | 'team' | 'position' | 'overall' | 'age' | 'marketValue' | 'wageCost' | AttributeKey;
type SortableValue = string | number;

interface PlayerAttributesRow {
  player: Player;
  seasonYear: number;
  overall: number;
  age: number;
  marketValue: number;
  wageCost: number;
  attributes: PlayerSeasonAttributes;
}

@Component({
  selector: 'app-player-attributes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, FormsModule, TeamBadgeComponent],
  templateUrl: './player-attributes.html',
  styleUrls: ['./player-attributes.css']
})
export class PlayerAttributesComponent {
  private gameService = inject(GameService);

  // Expose Position enum for template
  Position = Position;

  currentSeasonYear = computed(() => this.gameService.league()?.currentSeasonYear ?? new Date().getFullYear());

  // Filter and sort state
  selectedYear = signal<number>(0);
  selectedTeam = signal<string>('');
  selectedPosition = signal<string>('');
  searchQuery = signal<string>('');
  sortColumn = signal<SortColumn | ''>('overall');
  sortDirection = signal<'asc' | 'desc'>('desc');
  pageIndex = signal<number>(0);
  pageSize = signal<number>(25);

  // Get all available teams
  availableTeams = computed(() => {
    const league = this.gameService.league();
    if (!league) return [];
    return league.teams.map(t => ({ id: t.id, name: t.name })).sort((a, b) => a.name.localeCompare(b.name));
  });

  // Get all available seasons from player seasonAttributes
  availableSeasons = computed(() => {
    const league = this.gameService.league();
    if (!league) return [this.currentSeasonYear()];
    
    const seasons = new Set<number>();
    league.teams.forEach(team => {
      team.players.forEach(player => {
        player.seasonAttributes.forEach(s => {
          seasons.add(s.seasonYear);
        });
      });
    });
    
    return Array.from(seasons).sort((a, b) => b - a);
  });

  // Get all available positions
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

    const rows: PlayerAttributesRow[] = [];

    league.teams.forEach(team => {
      team.players.forEach(player => {
        // Apply team filter
        if (teamFilter && team.id !== teamFilter) return;

        // Apply position filter
        if (positionFilter && player.position !== positionFilter) return;

        // Apply search query
        if (query && !player.name.toLowerCase().includes(query)) return;

        // Get attributes for the selected year
        let attributes: PlayerSeasonAttributes;
        try {
          attributes = getCurrentPlayerSeasonAttributes(player, effectiveYear);
        } catch {
          return;
        }

        const birthday = player.personal.birthday instanceof Date ? player.personal.birthday : new Date(player.personal.birthday);
        const age = computeAge(birthday, seasonAnchorDate(effectiveYear));
        const overall = attributes.overall.value;
        const marketValue = calculateMarketValue(player, effectiveYear);
        const wageCost = calculatePlayerWageCost(player, effectiveYear);

        rows.push({
          player,
          seasonYear: effectiveYear,
          overall,
          age,
          marketValue,
          wageCost,
          attributes
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
          aVal = this.getTeamName(a.player.teamId);
          bVal = this.getTeamName(b.player.teamId);
        } else if (column === 'position') {
          aVal = a.player.position;
          bVal = b.player.position;
        } else if (column === 'overall') {
          aVal = a.overall;
          bVal = b.overall;
        } else if (column === 'age') {
          aVal = a.age;
          bVal = b.age;
        } else if (column === 'marketValue') {
          aVal = a.marketValue;
          bVal = b.marketValue;
        } else if (column === 'wageCost') {
          aVal = a.wageCost;
          bVal = b.wageCost;
        } else {
          aVal = a.attributes[column as AttributeKey]?.value ?? 0;
          bVal = b.attributes[column as AttributeKey]?.value ?? 0;
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
    return Math.ceil(all.length / size) || 1;
  });

  // Total number of players
  totalPlayers = computed(() => this.filteredAndSortedPlayers().length);

  userTeamId = computed(() => this.gameService.league()?.userTeamId ?? null);

  // Columns to display
  columns: { key: SortColumn; label: string; sortable: boolean }[] = [
    { key: 'team', label: 'Team', sortable: true },
    { key: 'name', label: 'Player', sortable: true },
    { key: 'position', label: 'Pos', sortable: true },
    { key: 'overall', label: 'OVR', sortable: true },
    { key: 'age', label: 'Age', sortable: true },
    { key: 'marketValue', label: 'Market Value', sortable: true },
    { key: 'wageCost', label: 'Wage', sortable: true },
    // Physical
    { key: 'speed', label: 'SPD', sortable: true },
    { key: 'strength', label: 'STR', sortable: true },
    { key: 'endurance', label: 'END', sortable: true },
    { key: 'fitness', label: 'FIT', sortable: true },
    // Mental
    { key: 'flair', label: 'FLR', sortable: true },
    { key: 'vision', label: 'VIS', sortable: true },
    { key: 'determination', label: 'DET', sortable: true },
    // Skill
    { key: 'tackling', label: 'TCK', sortable: true },
    { key: 'shooting', label: 'SHT', sortable: true },
    { key: 'heading', label: 'HDG', sortable: true },
    { key: 'longPassing', label: 'LPS', sortable: true },
    { key: 'shortPassing', label: 'SPS', sortable: true },
    // Goalkeeping
    { key: 'handling', label: 'HND', sortable: true },
    { key: 'reflexes', label: 'RFL', sortable: true },
    { key: 'commandOfArea', label: 'COA', sortable: true }
  ];

  getTeamName(teamId: string): string {
    const team = this.gameService.getTeam(teamId);
    return team?.name ?? teamId;
  }

  toggleSort(column: SortColumn) {
    if (this.sortColumn() === column) {
      this.sortDirection.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
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

  isUserTeamPlayer(row: PlayerAttributesRow): boolean {
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
