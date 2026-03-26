import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { SettingsService, BadgeStyle } from '../../services/settings.service';
import { GameService } from '../../services/game.service';
import { ScheduleStateService } from '../../services/schedule-state.service';
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
  private scheduleStateService = inject(ScheduleStateService);
  private router = inject(Router);

  badgeStyles = this.settingsService.getBadgeStyles();
  selectedStyle = this.settingsService.badgeStyle;
  showResetConfirmation = signal(false);
  isResetting = signal(false);

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

  openResetConfirmation(): void {
    this.showResetConfirmation.set(true);
  }

  cancelResetConfirmation(): void {
    this.showResetConfirmation.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (!this.showResetConfirmation() || this.isResetting()) {
      return;
    }

    this.cancelResetConfirmation();
  }

  async resetSimulationData(): Promise<void> {
    this.isResetting.set(true);

    try {
      await this.settingsService.resetToDefaultsAndClearPersisted();
      await this.gameService.clearLeague();
      await this.scheduleStateService.clearPersistedWeek();
      this.showResetConfirmation.set(false);
      await this.router.navigate(['/']);
    } finally {
      this.isResetting.set(false);
    }
  }
}