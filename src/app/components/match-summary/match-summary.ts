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
    const team = this.gameService.getTeam(id);
    if (!team) return 0;
    return this.gameService.calculateTeamOverall(team);
  }

  getProbabilities(homeId: string, awayId: string) {
    const homeTeam = this.gameService.getTeam(homeId);
    const awayTeam = this.gameService.getTeam(awayId);
    if (!homeTeam || !awayTeam) return { home: 0, draw: 0, away: 0 };

    const homeOverall = this.gameService.calculateTeamOverall(homeTeam);
    const awayOverall = this.gameService.calculateTeamOverall(awayTeam);

    const homeAdvantage = 5;
    const homeChance = homeOverall + homeAdvantage;
    const awayChance = awayOverall;
    const totalChance = homeChance + awayChance;

    const homeWinProb = Math.round((homeChance / totalChance) * 100);
    const awayWinProb = Math.round((awayChance / totalChance) * 100);
    
    const diff = Math.abs(homeChance - awayChance);
    const drawProb = Math.max(5, 30 - diff);
    
    const adjustedHome = Math.round(homeWinProb * (100 - drawProb) / 100);
    const adjustedAway = Math.round(awayWinProb * (100 - drawProb) / 100);
    const finalDraw = 100 - adjustedHome - adjustedAway;

    return { home: adjustedHome, draw: finalDraw, away: adjustedAway };
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