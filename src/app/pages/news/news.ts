import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { GameService } from '../../services/game.service';

export interface BaseNewsItem {
  id: string;
  category: 'retirement' | 'transfer';
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

export type NewsItem = RetirementNewsItem | TransferNewsItem;

@Component({
  selector: 'app-news',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass],
  templateUrl: './news.html',
})
export class NewsComponent {
  private gameService = inject(GameService);

  log = this.gameService.unreadSeasonTransitionLog;
  fullTransitionLog = this.gameService.seasonTransitionLog;

  filterTeamId = signal<string>('');

  /** All teams in the league, sorted alphabetically for the filter. */
  teams = computed(() => {
    const league = this.gameService.league();
    if (!league) return [];
    return [...league.teams].sort((a, b) => a.name.localeCompare(b.name));
  });

  /** All news items (completed transfers and retirements) sorted chronologically, newest first. */
  allNewsItems = computed<NewsItem[]>(() => {
    const league = this.gameService.league();
    if (!league) return [];

    const items: NewsItem[] = [];
    const userTeamId = league.userTeamId;

    // 1. Gather retirement events from season transition log
    const log = this.fullTransitionLog();
    if (log) {
      const transitionYear = log.seasonYear + 1;
      const dismissed = new Set(log.dismissedTeamIds);
      for (const event of log.events) {
        if (dismissed.has(event.teamId)) continue;
        items.push({
          id: `retirement-${event.playerIds[0]}-${event.teamId}`,
          category: 'retirement',
          seasonYear: transitionYear,
          week: 0,
          headline: event.headline,
          detail: event.detail,
          isUserTeam: event.isUserTeam,
          teamId: event.teamId,
          playerIds: event.playerIds
        });
      }
    }

    // 2. Gather completed transfers from player history for the current season
    const currentSeasonYear = league.currentSeasonYear;
    const teamNameById = new Map(league.teams.map(t => [t.id, t.name]));

    for (const team of league.teams) {
      for (const player of team.players) {
        if (player.transferHistory) {
          for (const transfer of player.transferHistory) {
            // Filter to only show the current season's transfers
            if (transfer.seasonYear === currentSeasonYear) {
              const isUser = userTeamId ? (transfer.buyerTeamId === userTeamId || transfer.sellerTeamId === userTeamId) : false;
              const buyerName = teamNameById.get(transfer.buyerTeamId) ?? transfer.buyerTeamId;
              const sellerName = teamNameById.get(transfer.sellerTeamId) ?? transfer.sellerTeamId;

              items.push({
                id: `transfer-${player.id}-${transfer.seasonYear}-${transfer.week}`,
                category: 'transfer',
                seasonYear: transfer.seasonYear,
                week: transfer.week,
                headline: `${player.name} Transfer`,
                detail: `${player.name} has completed a transfer from ${sellerName} to ${buyerName} for $${transfer.fee.toLocaleString()}.`,
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
    }

    // 3. Sort chronologically: newest season first, then newest week first
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

  /** Filtered news items based on filterTeamId() */
  visibleItems = computed<NewsItem[]>(() => {
    const filter = this.filterTeamId();
    const all = this.allNewsItems();
    if (!filter) return all;

    return all.filter(item => {
      if (item.category === 'retirement') {
        return item.teamId === filter;
      } else {
        return item.buyerTeamId === filter || item.sellerTeamId === filter;
      }
    });
  });

  setFilter(teamId: string) {
    this.filterTeamId.set(teamId);
  }

  dismiss() {
    this.gameService.markSeasonTransitionLogRead();
  }
}
