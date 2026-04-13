import { AfterRenderRef, ChangeDetectionStrategy, Component, ElementRef, HostListener, ViewChild, afterNextRender, computed, inject, signal } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { SettingsService, BadgeStyle } from '../../services/settings.service';
import { GameService } from '../../services/game.service';
import { ScheduleStateService } from '../../services/schedule-state.service';
import { TeamBadgeComponent } from '../../components/team-badge/team-badge';
import { FormationEditorComponent } from '../../components/formation-editor/formation-editor';

function resolveSchemaVersion(value: string | (() => string)): string {
  return typeof value === 'function' ? value() : value;
}

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
  currentDataSchemaVersion = computed(() => resolveSchemaVersion(this.settingsService.currentDataSchemaVersion));
  hasSettingsVersionMismatch = this.settingsService.hasPersistedSettingsVersionMismatch;
  @ViewChild('cancelResetBtn') cancelResetBtn?: ElementRef<HTMLButtonElement>;

  showResetConfirmation = signal(false);
  isResetting = signal(false);
  private _focusAfterRender: AfterRenderRef | null = null;

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

  private isBadgeStyle(value: string): value is BadgeStyle {
    return this.badgeStyles.includes(value as BadgeStyle);
  }

  onBadgeStyleChange(value: string): void {
    if (!this.isBadgeStyle(value)) {
      return;
    }

    this.setBadgeStyle(value);
  }

  setBadgeStyle(style: BadgeStyle): void {
    this.settingsService.setBadgeStyle(style);
  }

  openResetConfirmation(): void {
    this.showResetConfirmation.set(true);
    this._focusAfterRender?.destroy();
    this._focusAfterRender = afterNextRender(() => {
      this.cancelResetBtn?.nativeElement.focus();
    });
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