import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe, CurrencyPipe } from '@angular/common';
import { GameService } from '../../services/game.service';
import { calculateSquadTotalMarketValue } from '../../models/player-progression';

interface DecoratedTeam {
  id: string;
  name: string;
  tier: number;
  transferBudget: number;
  wagePointsCap: number;
  wagePointsUsed: number;
  utilization: number;
  squadValue: number;
  overall: number;
}

@Component({
  selector: 'app-league-finances',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DecimalPipe, CurrencyPipe],
  templateUrl: './league-finances.html',
})
export class LeagueFinancesComponent {
  gameService = inject(GameService);

  // Sorting state
  sortBy = signal<'name' | 'tier' | 'budget' | 'wageCap' | 'wageUsed' | 'utilization' | 'squadValue' | 'overall'>('tier');
  sortOrder = signal<'asc' | 'desc'>('asc');

  // Computed league metadata
  currentWeek = computed(() => this.gameService.league()?.currentWeek ?? 1);
  currentSeason = computed(() => this.gameService.league()?.currentSeasonYear ?? 2026);
  userTeamId = computed(() => this.gameService.league()?.userTeamId);

  // Enrich team records with derived overall and squad value metrics
  decoratedTeams = computed<DecoratedTeam[]>(() => {
    const teams = this.gameService.league()?.teams ?? [];
    const seasonYear = this.currentSeason();

    return teams.map(team => {
      const players = this.gameService.getPlayersForTeam(team.id);
      const squadValue = calculateSquadTotalMarketValue(players, seasonYear);
      const overall = this.gameService.calculateTeamOverall(team);
      const wagePointsCap = team.finances?.wagePointsCap ?? 1;
      const wagePointsUsed = team.finances?.wagePointsUsed ?? 0;
      const utilization = wagePointsCap > 0 ? (wagePointsUsed / wagePointsCap) * 100 : 0;

      return {
        id: team.id,
        name: team.name,
        tier: team.finances?.tier ?? 5,
        transferBudget: team.finances?.transferBudget ?? 0,
        wagePointsCap,
        wagePointsUsed,
        utilization,
        squadValue,
        overall
      };
    });
  });

  // Sort teams reactively based on the user's sort preference
  sortedTeams = computed<DecoratedTeam[]>(() => {
    const list = [...this.decoratedTeams()];
    const field = this.sortBy();
    const order = this.sortOrder();

    list.sort((a, b) => {
      let comparison = 0;
      if (field === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (field === 'tier') {
        comparison = a.tier - b.tier; // T1 first, T5 last
      } else if (field === 'budget') {
        comparison = a.transferBudget - b.transferBudget;
      } else if (field === 'wageCap') {
        comparison = a.wagePointsCap - b.wagePointsCap;
      } else if (field === 'wageUsed') {
        comparison = a.wagePointsUsed - b.wagePointsUsed;
      } else if (field === 'utilization') {
        comparison = a.utilization - b.utilization;
      } else if (field === 'squadValue') {
        comparison = a.squadValue - b.squadValue;
      } else if (field === 'overall') {
        comparison = a.overall - b.overall;
      }

      return order === 'asc' ? comparison : -comparison;
    });

    return list;
  });

  toggleSort(field: 'name' | 'tier' | 'budget' | 'wageCap' | 'wageUsed' | 'utilization' | 'squadValue' | 'overall') {
    if (this.sortBy() === field) {
      // Toggle order
      this.sortOrder.update(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      // Change field, default to desc for everything except name and tier
      this.sortBy.set(field);
      this.sortOrder.set((field === 'name' || field === 'tier') ? 'asc' : 'desc');
    }
  }

  getSortIcon(field: 'name' | 'tier' | 'budget' | 'wageCap' | 'wageUsed' | 'utilization' | 'squadValue' | 'overall'): string {
    if (this.sortBy() !== field) return 'unfold_more';
    return this.sortOrder() === 'asc' ? 'expand_less' : 'expand_more';
  }
}
