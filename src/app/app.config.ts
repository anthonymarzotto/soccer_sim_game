import {
  APP_INITIALIZER,
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {provideRouter} from '@angular/router';

import {routes} from './app.routes';
import { GameService } from './services/game.service';
import { ScheduleStateService } from './services/schedule-state.service';
import { SettingsService } from './services/settings.service';

function initializeApp(gameService: GameService, settingsService: SettingsService, scheduleStateService: ScheduleStateService) {
  return async () => {
    await Promise.all([
      gameService.ensureHydrated(),
      settingsService.ensureHydrated()
    ]);

    await scheduleStateService.ensureHydrated();
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeApp,
      deps: [GameService, SettingsService, ScheduleStateService],
      multi: true
    }
  ],
};
