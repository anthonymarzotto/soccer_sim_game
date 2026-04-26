import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { SettingsService, ICON_BADGE_STYLES, BadgeStyle } from '../../services/settings.service';
import { TeamBadgeComponent } from '../team-badge/team-badge';
import { Match, MatchEvent } from '../../models/types';
import { EventImportance } from '../../models/enums';
import { rankThreeStars, MatchStarEntry } from '../../models/match-stars';

const ICON_BADGE_STYLE_SET = new Set<BadgeStyle>(ICON_BADGE_STYLES);

@Component({
  selector: 'app-match-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TeamBadgeComponent],
  templateUrl: './match-summary.html',
})
export class MatchSummaryComponent {
  gameService = inject(GameService);
  settingsService = inject(SettingsService);

  // Inputs
  match = input.required<Match>();
  showProbabilities = input<boolean>(false);
  showStats = input<boolean>(false);
  showEvents = input<boolean>(false);
  isLive = input<boolean>(false);
  currentMinute = input<number>(0);
  liveHomeScore = input<number>(0);
  liveAwayScore = input<number>(0);

  // Expose enum for template
  EventImportance = EventImportance;
  showExpandedMoments = signal(false);

  matchStars = computed((): MatchStarEntry[] => {
    const report = this.match().matchReport;
    if (!report?.homePlayerStats?.length && !report?.awayPlayerStats?.length) return [];
    const homeScore = this.match().homeScore ?? 0;
    const awayScore = this.match().awayScore ?? 0;
    const winningTeamId = homeScore > awayScore
      ? this.match().homeTeamId
      : awayScore > homeScore
        ? this.match().awayTeamId
        : null;
    return rankThreeStars(
      report.homePlayerStats ?? [],
      report.awayPlayerStats ?? [],
      winningTeamId,
      this.match().homeTeamId,
      this.match().awayTeamId
    );
  });

  formatRating(rating: number): string {
    return (rating / 10).toFixed(1);
  }

  private baseKeyEvents = computed(() => {
    const events = this.match().keyEvents ?? [];
    if (!this.isLive()) {
      return events;
    }

    const minute = this.currentMinute();
    return events.filter(event => event.time <= minute);
  });

  expandedKeyMoments = computed(() => {
    const allMoments = this.match().matchReport?.keyMoments ?? [];

    if (!this.isLive()) {
      return allMoments;
    }

    const minute = this.currentMinute();
    return allMoments.filter(moment => moment.time <= minute);
  });

  additionalExpandedMoments = computed(() => {
    const baseIds = new Set(this.baseKeyEvents().map(event => event.id));
    return this.expandedKeyMoments().filter(moment => !baseIds.has(moment.id));
  });

  hasAnyMoments = computed(() => this.baseKeyEvents().length > 0 || this.additionalExpandedMoments().length > 0);

  hasAdditionalMoments = computed(() => this.additionalExpandedMoments().length > 0);

  visibleMoments = computed((): { event: MatchEvent; isExpanded: boolean }[] => {
    const base = this.baseKeyEvents().map(event => ({ event, isExpanded: false }));
    if (!this.showExpandedMoments()) {
      return base;
    }

    const expanded = this.additionalExpandedMoments().map(event => ({ event, isExpanded: true }));
    return [...base, ...expanded]
      .map((entry, index) => ({ entry, index }))
      .sort((left, right) => {
        const timeDelta = left.entry.event.time - right.entry.event.time;
        return timeDelta !== 0 ? timeDelta : left.index - right.index;
      })
      .map(item => item.entry);
  });

  toggleExpandedMoments(): void {
    this.showExpandedMoments.update(current => !current);
  }

  getTeamName(id: string): string {
    return this.gameService.getTeam(id)?.name || 'Unknown';
  }

  getTeamOverall(id: string): number {
    return this.gameService.getTeamOverall(id);
  }

  getProbabilities(homeId: string, awayId: string) {
    return this.gameService.getMatchProbabilities(homeId, awayId);
  }

  getPlayerLinks(playerIds: string[]): { name: string; playerId: string }[] {
    return playerIds.map(id => {
      const player = this.gameService.getPlayer(id);
      return {
        name: player ? player.name : 'Unknown Player',
        playerId: id
      };
    });
  }

  getPlayerTeamId(playerId: string): string {
    const player = this.gameService.getPlayer(playerId);
    return player?.teamId || '';
  }

  isIconBadgeStyle(): boolean {
    return ICON_BADGE_STYLE_SET.has(this.settingsService.badgeStyle());
  }

  // Computed values for live display
  displayHomeScore = computed(() => {
    return this.isLive() ? this.liveHomeScore() : (this.match().homeScore ?? 0);
  });

  displayAwayScore = computed(() => {
    return this.isLive() ? this.liveAwayScore() : (this.match().awayScore ?? 0);
  });
}