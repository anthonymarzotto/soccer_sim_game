import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SettingsService, BadgeStyle } from '../../services/settings.service';
import { GameService } from '../../services/game.service';
import { TeamBadgeComponent } from '../../components/team-badge/team-badge';
import { FormationEditorComponent } from '../../components/formation-editor/formation-editor';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TeamBadgeComponent, TitleCasePipe, FormationEditorComponent],
  templateUrl: './settings.html',
})
export class SettingsComponent {
  settingsService = inject(SettingsService);
  gameService = inject(GameService);

  badgeStyles = this.settingsService.getBadgeStyles();
  selectedStyle = this.settingsService.badgeStyle;

  // Get user's team or default to first team
  previewTeamId = computed(() => {
    const league = this.gameService.league();
    if (league?.userTeamId) {
      return league.userTeamId;
    }
    return league?.teams[0]?.id || '0';
  });

  previewTeamName = computed(() => {
    const teamId = this.previewTeamId();
    return this.gameService.getTeam(teamId)?.name || 'Team';
  });

  setBadgeStyle(style: string): void {
    this.settingsService.setBadgeStyle(style as BadgeStyle);
  }
}