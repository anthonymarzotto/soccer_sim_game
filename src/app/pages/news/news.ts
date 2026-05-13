import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { SeasonTransitionEvent } from '../../models/types';

interface TeamNewsGroup {
  teamId: string;
  teamName: string;
  events: SeasonTransitionEvent[];
}

@Component({
  selector: 'app-news',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgClass],
  templateUrl: './news.html',
})
export class NewsComponent {
  private gameService = inject(GameService);

  log = this.gameService.unreadSeasonTransitionLog;

  filterTeamId = signal<string>('');

  /** All teams with events in the log, excluding dismissed teams, sorted alphabetically. */
  teamGroups = computed<TeamNewsGroup[]>(() => {
    const log = this.log();
    if (!log) return [];

    const dismissed = new Set(log.dismissedTeamIds);
    const byTeam = new Map<string, SeasonTransitionEvent[]>();
    for (const event of log.events) {
      if (dismissed.has(event.teamId)) continue;
      const list = byTeam.get(event.teamId) ?? [];
      list.push(event);
      byTeam.set(event.teamId, list);
    }

    const league = this.gameService.league();
    const teamNameById = new Map((league?.teams ?? []).map(t => [t.id, t.name]));

    return [...byTeam.entries()]
      .map(([teamId, events]) => ({
        teamId,
        teamName: teamNameById.get(teamId) ?? teamId,
        events,
      }))
      .sort((a, b) => a.teamName.localeCompare(b.teamName));
  });

  /** Filtered down to a single team when filterTeamId is set, else all groups. */
  visibleGroups = computed<TeamNewsGroup[]>(() => {
    const filter = this.filterTeamId();
    if (!filter) return this.teamGroups();
    return this.teamGroups().filter(g => g.teamId === filter);
  });

  setFilter(teamId: string) {
    this.filterTeamId.set(teamId);
  }

  dismiss() {
    this.gameService.markSeasonTransitionLogRead();
  }
}
