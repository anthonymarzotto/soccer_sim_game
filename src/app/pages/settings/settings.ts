import { AfterRenderRef, ChangeDetectionStrategy, Component, ElementRef, HostListener, ViewChild, afterNextRender, computed, inject, signal, PLATFORM_ID } from '@angular/core';
import { TitleCasePipe, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { SettingsService, BadgeStyle, BADGE_STYLES } from '../../services/settings.service';
import { GameService } from '../../services/game.service';
import { ScheduleStateService } from '../../services/schedule-state.service';
import { TeamBadgeComponent } from '../../components/team-badge/team-badge';
import { FormationEditorComponent } from '../../components/formation-editor/formation-editor';
import { AppDbService } from '../../services/app-db.service';

function resolveSchemaVersion(value: string | (() => string)): string {
  return typeof value === 'function' ? value() : value;
}

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TeamBadgeComponent, TitleCasePipe, FormationEditorComponent],
  templateUrl: './settings.html',
})
export class SettingsComponent {
  settingsService = inject(SettingsService);
  gameService = inject(GameService);
  private scheduleStateService = inject(ScheduleStateService);
  private router = inject(Router);
  private appDb = inject(AppDbService);
  private platformId = inject(PLATFORM_ID);

  badgeStyles = BADGE_STYLES;
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

  private downloadJson(data: unknown, fileName: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async exportFullData(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const [teams, players, matches, leagueMetadata, appState] = await Promise.all([
        this.appDb.getAllFromTable('teams'),
        this.appDb.getAllFromTable('players'),
        this.appDb.getAllFromTable('matches'),
        this.appDb.getAllFromTable('leagueMetadata'),
        this.appDb.getAllFromTable('appState'),
      ]);

      const exportData = {
        teams,
        players,
        matches,
        leagueMetadata,
        appState
      };

      this.downloadJson(exportData, `soccer-sim-full-export-${Date.now()}.json`);
    } catch (error) {
      console.error('Failed to export full data:', error);
    }
  }

  async exportPlayersData(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const players = await this.appDb.getAllFromTable('players');
      const exportData = { players };
      this.downloadJson(exportData, `soccer-sim-players-export-${Date.now()}.json`);
    } catch (error) {
      console.error('Failed to export players data:', error);
    }
  }

  async exportTeamsData(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const teams = await this.appDb.getAllFromTable('teams');
      const exportData = { teams };
      this.downloadJson(exportData, `soccer-sim-teams-export-${Date.now()}.json`);
    } catch (error) {
      console.error('Failed to export teams data:', error);
    }
  }
}