import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { SettingsService, ICON_BADGE_STYLES, BadgeStyle } from '../../services/settings.service';
import { TeamBadgeComponent } from '../team-badge/team-badge';
import { Match } from '../../models/types';
import { EventImportance } from '../../models/enums';

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