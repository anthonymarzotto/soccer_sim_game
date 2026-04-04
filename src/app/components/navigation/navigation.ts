import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { GameService } from '../../services/game.service';
import { SettingsService } from '../../services/settings.service';
import { APP_TITLE, APP_VERSION } from '../../constants';

function resolveSchemaVersion(value: string | (() => string)): string {
  return typeof value === 'function' ? value() : value;
}

@Component({
  selector: 'app-navigation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
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

  appTitle = APP_TITLE;
  hasLeague = this.gameService.hasLeague;
  displayedVersion = computed(() => `${APP_VERSION}.${resolveSchemaVersion(this.settingsService.currentDataSchemaVersion)}`);
  hasSettingsVersionMismatch = this.settingsService.hasPersistedSettingsVersionMismatch;

  userTeamId = computed(() => {
    const league = this.gameService.league();
    return league?.userTeamId;
  });
}