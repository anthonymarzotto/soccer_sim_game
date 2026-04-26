import { ChangeDetectionStrategy, Component, inject, isDevMode } from '@angular/core';
import { GameService } from '../../services/game.service';

@Component({
  selector: 'app-season-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './season-controls.html'
})
export class SeasonControlsComponent {
  gameService = inject(GameService);
  isReadOnlyMode = this.gameService.isMutatingWritesBlockedBySchemaMismatch;
  isDevMode = isDevMode();

  simulateCurrentWeek(): void {
    this.gameService.simulateCurrentWeek();
  }

  simulateWholeSeason(): void {
    this.gameService.simulateWholeSeason();
  }

  startNewSeason(): void {
    this.gameService.startNewSeason();
  }
}
