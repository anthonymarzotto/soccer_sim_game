import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule, DecimalPipe, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameService } from '../../services/game.service';
import { Player, Team } from '../../models/types';
import { Position } from '../../models/enums';
import { calculateMarketValue, calculatePlayerWageCost } from '../../models/player-progression';
import { getCurrentPlayerSeasonAttributes } from '../../models/season-history';
import { computeAge, seasonAnchorDate } from '../../models/player-age';
import { TeamBadgeComponent } from '../../components/team-badge/team-badge';

type SortColumn = 'name' | 'team' | 'position' | 'overall' | 'age' | 'value' | 'wage';
type SortableValue = string | number;

interface TransferRow {
  player: Player;
  team: Team;
  overall: number;
  age: number;
  value: number;
  wage: number;
}

@Component({
  selector: 'app-transfer-market',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, FormsModule, TeamBadgeComponent, DecimalPipe, CurrencyPipe],
  templateUrl: './transfer-market.html',
})
export class TransferMarketComponent {
  gameService = inject(GameService);

  protected readonly Math = Math;
  Position = Position;
  protected readonly calculateMarketValue = calculateMarketValue;
  protected readonly calculatePlayerWageCost = calculatePlayerWageCost;
  transferWindowPhase = this.gameService.transferWindowPhase;
  weeksRemainingInWindow = this.gameService.weeksRemainingInWindow;

  // Filter and sort state
  selectedTeam = signal<string>('');
  selectedPosition = signal<string>('');
  searchQuery = signal<string>('');
  sortColumn = signal<SortColumn>('overall');
  sortDirection = signal<'asc' | 'desc'>('desc');
  pageIndex = signal<number>(0);
  pageSize = signal<number>(20);

  // Modal Offer State
  showOfferModal = signal(false);
  selectedPlayerForOffer = signal<Player | null>(null);
  selectedPlayerValue = signal<number>(0);
  offerBidAmount = signal<number>(0);
  offerError = signal<string>('');
  offerSuccess = signal<string>('');

  currentSeasonYear = computed(() => this.gameService.league()?.currentSeasonYear ?? new Date().getFullYear());
  userTeamId = computed(() => this.gameService.league()?.userTeamId ?? null);

  userTeam = computed(() => {
    const uid = this.userTeamId();
    return uid ? this.gameService.getTeam(uid) : null;
  });

  userBudget = computed(() => this.userTeam()?.finances.transferBudget ?? 0);
  userWageHeadroom = computed(() => {
    const t = this.userTeam();
    return t ? t.finances.wagePointsCap - t.finances.wagePointsUsed : 0;
  });

  targetPlayerWage = computed(() => {
    const p = this.selectedPlayerForOffer();
    return p ? calculatePlayerWageCost(p, this.currentSeasonYear()) : 0;
  });

  incomingOffers = computed(() => {
    const l = this.gameService.league();
    const uid = this.userTeamId();
    if (!l || !uid) return [];
    return (l.transferOffers ?? []).filter(o => o.sellerTeamId === uid && o.status === 'pending');
  });

  availableTeams = computed(() => {
    const league = this.gameService.league();
    if (!league) return [];
    return league.teams.map(t => ({ id: t.id, name: t.name })).sort((a, b) => a.name.localeCompare(b.name));
  });

  availablePositions = computed(() => {
    return [Position.GOALKEEPER, Position.DEFENDER, Position.MIDFIELDER, Position.FORWARD];
  });

  allListedPlayers = computed<TransferRow[]>(() => {
    const league = this.gameService.league();
    if (!league) return [];

    const listings = league.transferListings ?? [];
    const year = this.currentSeasonYear();
    const rows: TransferRow[] = [];

    for (const playerId of listings) {
      const player = this.gameService.getPlayer(playerId);
      if (!player) continue;

      const team = this.gameService.getTeam(player.teamId);
      if (!team) continue;

      const attrs = getCurrentPlayerSeasonAttributes(player, year);
      const overall = attrs?.overall?.value ?? 50;
      const age = computeAge(player.personal.birthday, seasonAnchorDate(year));
      const value = calculateMarketValue(player, year);
      const wage = calculatePlayerWageCost(player, year);

      rows.push({
        player,
        team,
        overall,
        age,
        value,
        wage,
      });
    }

    return rows;
  });

  filteredAndSortedPlayers = computed(() => {
    const rows = this.allListedPlayers();
    const teamFilter = this.selectedTeam();
    const positionFilter = this.selectedPosition();
    const query = this.searchQuery().toLowerCase();

    // 1. Filter
    const filtered = rows.filter(row => {
      if (teamFilter && row.player.teamId !== teamFilter) return false;
      if (positionFilter && row.player.position !== positionFilter) return false;
      if (query && !row.player.name.toLowerCase().includes(query)) return false;
      return true;
    });

    // 2. Sort
    const col = this.sortColumn();
    const dir = this.sortDirection() === 'asc' ? 1 : -1;

    filtered.sort((a, b) => {
      let aVal: SortableValue;
      let bVal: SortableValue;

      if (col === 'name') {
        aVal = a.player.name;
        bVal = b.player.name;
      } else if (col === 'team') {
        aVal = a.team.name;
        bVal = b.team.name;
      } else if (col === 'position') {
        aVal = a.player.position;
        bVal = b.player.position;
      } else {
        aVal = a[col];
        bVal = b[col];
      }

      if (typeof aVal === 'string') {
        return aVal.localeCompare(String(bVal)) * dir;
      }

      return (aVal - Number(bVal)) * dir;
    });

    return filtered;
  });

  paginatedPlayers = computed(() => {
    const all = this.filteredAndSortedPlayers();
    const size = this.pageSize();
    const index = this.pageIndex();
    const start = index * size;
    const end = start + size;
    return all.slice(start, end);
  });

  totalPages = computed(() => {
    const all = this.filteredAndSortedPlayers();
    const size = this.pageSize();
    return Math.ceil(all.length / size);
  });

  totalPlayers = computed(() => this.filteredAndSortedPlayers().length);

  isUserTeamPlayer(player: Player): boolean {
    return player.teamId === this.userTeamId();
  }

  isSorted(column: SortColumn): boolean {
    return this.sortColumn() === column;
  }

  getSortIndicator(column: SortColumn): string {
    if (!this.isSorted(column)) return '';
    return this.sortDirection() === 'asc' ? '▲' : '▼';
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

  makeTransferOffer(player: Player, value: number) {
    if (this.transferWindowPhase() === 'closed') return;
    this.selectedPlayerForOffer.set(player);
    this.selectedPlayerValue.set(value);
    this.offerBidAmount.set(Math.round(value * 1.15));
    this.offerError.set('');
    this.offerSuccess.set('');
    this.showOfferModal.set(true);
  }

  closeOfferModal() {
    this.showOfferModal.set(false);
    this.selectedPlayerForOffer.set(null);
    this.offerError.set('');
    this.offerSuccess.set('');
  }

  submitOffer() {
    const player = this.selectedPlayerForOffer();
    if (!player) return;
    const bid = this.offerBidAmount();
    if (bid <= 0) {
      this.offerError.set('Please enter a valid offer amount.');
      return;
    }
    const res = this.gameService.submitTransferOffer(player.id, bid);
    if (res.success) {
      this.offerSuccess.set(res.message);
      this.offerError.set('');
      setTimeout(() => {
        this.closeOfferModal();
      }, 1500);
    } else {
      this.offerError.set(res.message);
      this.offerSuccess.set('');
    }
  }

  acceptOffer(offerId: string) {
    this.gameService.acceptOffer(offerId);
  }

  rejectOffer(offerId: string) {
    this.gameService.rejectOffer(offerId);
  }

  removePlayerFromTransferList(playerId: string) {
    this.gameService.removePlayerFromTransferList(playerId);
  }
}
