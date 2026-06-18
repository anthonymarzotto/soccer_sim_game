import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameService } from '../../services/game.service';

export interface BaseNewsItem {
  id: string;
  category: 'retirement' | 'transfer' | 'contract' | 'finance';
  seasonYear: number;
  week: number;
  headline: string;
  detail: string;
  isUserTeam: boolean;
}

export interface RetirementNewsItem extends BaseNewsItem {
  category: 'retirement';
  teamId: string;
  playerIds: string[];
}

export interface TransferNewsItem extends BaseNewsItem {
  category: 'transfer';
  playerId: string;
  playerName: string;
  buyerTeamId: string;
  buyerTeamName: string;
  sellerTeamId: string;
  sellerTeamName: string;
  fee: number;
}

export interface ContractNewsItem extends BaseNewsItem {
  category: 'contract';
  teamId: string;
  playerIds: string[];
}

export interface FinanceNewsItem extends BaseNewsItem {
  category: 'finance';
  teamId: string;
  playerIds: string[];
}

export type NewsItem = RetirementNewsItem | TransferNewsItem | ContractNewsItem | FinanceNewsItem;
export type NewsCategoryFilter = 'all' | NewsItem['category'];

@Component({
  selector: 'app-news',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, FormsModule],
  templateUrl: './news.html',
})
export class NewsComponent {
  private gameService = inject(GameService);

  fullTransitionLog = this.gameService.seasonTransitionLog;

  filterTeamId = signal<string>('');
  filterCategory = signal<NewsCategoryFilter>('all');

  constructor() {
    const userTeamId = this.gameService.league()?.userTeamId;
    if (userTeamId) {
      this.filterTeamId.set(userTeamId);
    }
  }

  /** All teams in the league, sorted alphabetically for the filter. */
  teams = computed(() => {
    const league = this.gameService.league();
    if (!league) return [];
    return [...league.teams].sort((a, b) => a.name.localeCompare(b.name));
  });

  /** All news items (completed transfers, retirements, contracts, finances) sorted chronologically, newest first. */
  allNewsItems = computed<NewsItem[]>(() => {
    const league = this.gameService.league();
    if (!league) return [];

    const items: NewsItem[] = [];
    const userTeamId = league.userTeamId;

    // 1. Gather retirement and contract events from season transition log
    const log = this.fullTransitionLog();
    if (log) {
      const transitionYear = log.seasonYear + 1;
      for (const event of log.events) {
        if (event.category === 'finance') {
          // Finance events are loaded directly from team financeHistory for all-season history
          continue;
        }
        const mappedCategory = event.category === 'contract' ? 'contract' : 'retirement';
        items.push({
          id: `${mappedCategory}-${event.playerIds.join('-')}-${event.teamId}`,
          category: mappedCategory,
          seasonYear: transitionYear,
          week: 0,
          headline: event.headline,
          detail: event.detail,
          isUserTeam: event.isUserTeam,
          teamId: event.teamId,
          playerIds: event.playerIds
        } as NewsItem);
      }
    }

    // 2. Gather completed transfers from player transfer history
    const teamNameById = new Map(league.teams.map(t => [t.id, t.name]));

    for (const team of league.teams) {
      for (const player of team.players) {
        if (player.transferHistory) {
          for (const transfer of player.transferHistory) {
            const isUser = userTeamId ? (transfer.buyerTeamId === userTeamId || transfer.sellerTeamId === userTeamId) : false;
            const buyerName = teamNameById.get(transfer.buyerTeamId) ?? transfer.buyerTeamId;
            const sellerName = teamNameById.get(transfer.sellerTeamId) ?? transfer.sellerTeamId;
            const agentFee = transfer.fee - Math.round(transfer.fee * 0.9);

            items.push({
              id: `transfer-${player.id}-${transfer.seasonYear}-${transfer.week}`,
              category: 'transfer',
              seasonYear: transfer.seasonYear,
              week: transfer.week,
              headline: `${player.name} Transfer`,
              detail: `${player.name} has completed a transfer from ${sellerName} to ${buyerName} for $${transfer.fee.toLocaleString()} ($${agentFee.toLocaleString()} paid to agent).`,
              isUserTeam: isUser,
              playerId: player.id,
              playerName: player.name,
              buyerTeamId: transfer.buyerTeamId,
              buyerTeamName: buyerName,
              sellerTeamId: transfer.sellerTeamId,
              sellerTeamName: sellerName,
              fee: transfer.fee
            });
          }
        }
      }
    }

    // 3. Gather finance events from team financeHistory
    for (const team of league.teams) {
      if (team.finances?.financeHistory) {
        for (const tx of team.finances.financeHistory) {
          const isUser = userTeamId === team.id;
          if (tx.category === 'prize_money') {
            const rankResult = this.gameService.getLeagueStandingsRankForSeason
              ? this.gameService.getLeagueStandingsRankForSeason(team.id, tx.seasonYear)
              : null;
            const rank = rankResult?.rank;
            items.push({
              id: `finance-prize-${team.id}-${tx.seasonYear}-${tx.week}`,
              category: 'finance',
              seasonYear: tx.seasonYear + 1, // Awarded at transition to next season
              week: 0,
              headline: `Season Prize Money: ${team.name}`,
              detail: `${team.name} has been awarded $${tx.amount.toLocaleString()} in prize money for finishing in Rank ${rank ?? 'N/A'} this season.`,
              isUserTeam: isUser,
              teamId: team.id,
              playerIds: []
            });
          } else if (tx.category === 'luxury_tax') {
            items.push({
              id: `finance-tax-${team.id}-${tx.seasonYear}-${tx.week}`,
              category: 'finance',
              seasonYear: tx.seasonYear,
              week: tx.week,
              headline: `Luxury Tax Penalty: ${team.name}`,
              detail: `${team.name} has been fined $${Math.abs(tx.amount).toLocaleString()} for exceeding their wage cap.`,
              isUserTeam: isUser,
              teamId: team.id,
              playerIds: []
            });
          }
        }
      }
    }

    // 4. Sort chronologically: newest season first, then newest week first
    return items.sort((a, b) => {
      if (b.seasonYear !== a.seasonYear) {
        return b.seasonYear - a.seasonYear;
      }
      if (b.week !== a.week) {
        return b.week - a.week;
      }
      return a.headline.localeCompare(b.headline);
    });
  });

  /** Filtered news items based on filterTeamId() and filterCategory() */
  visibleItems = computed<NewsItem[]>(() => {
    const teamFilter = this.filterTeamId();
    const categoryFilter = this.filterCategory();
    const all = this.allNewsItems();

    return all.filter(item => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) {
        return false;
      }

      if (!teamFilter) {
        return true;
      }

      if (item.category === 'retirement' || item.category === 'contract' || item.category === 'finance') {
        return item.teamId === teamFilter;
      } else {
        return item.buyerTeamId === teamFilter || item.sellerTeamId === teamFilter;
      }
    });
  });

  setFilter(teamId: string) {
    this.filterTeamId.set(teamId);
  }

  setCategoryFilter(category: NewsCategoryFilter) {
    this.filterCategory.set(category);
  }
}
