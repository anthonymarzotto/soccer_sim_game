import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { GameService } from '../../services/game.service';
import { SettingsService } from '../../services/settings.service';
import { LocalhostService } from '../../services/localhost.service';
import { APP_TITLE, APP_VERSION } from '../../constants';
import { SeasonControlsComponent } from '../season-controls/season-controls';

function resolveSchemaVersion(value: string | (() => string)): string {
  return typeof value === 'function' ? value() : value;
}

@Component({
  selector: 'app-navigation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, SeasonControlsComponent],
  templateUrl: './navigation.html',
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class NavigationComponent {
  private gameService = inject(GameService);
  private settingsService = inject(SettingsService);
  private localhostService = inject(LocalhostService);

  appTitle = APP_TITLE;
  hasLeague = this.gameService.hasLeague;
  isLocalhost = computed(() => this.localhostService.isLocalhost());
  displayedVersion = computed(() => `${APP_VERSION}.${resolveSchemaVersion(this.settingsService.currentDataSchemaVersion)}`);
  hasSettingsVersionMismatch = this.settingsService.hasPersistedSettingsVersionMismatch;
  isDebugMenuOpen = signal(false);

  userTeamId = computed(() => {
    const league = this.gameService.league();
    return league?.userTeamId;
  });

  unreadSeasonTransitionLog = this.gameService.unreadSeasonTransitionLog;
  toggleDebugMenu() {
    this.isDebugMenuOpen.update(v => !v);
  }
}