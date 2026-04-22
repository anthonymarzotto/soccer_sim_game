import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { GameService } from '../../services/game.service';
import { ScheduleStateService } from '../../services/schedule-state.service';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './home.html',
  styles: [`
    .custom-scrollbar::-webkit-scrollbar {
      width: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background-color: #3f3f46;
      border-radius: 20px;
    }
  `]
})
export class HomeComponent {
  gameService = inject(GameService);
  private router = inject(Router);
  private scheduleStateService = inject(ScheduleStateService);
  isReadOnlyMode = this.gameService.isMutatingWritesBlockedBySchemaMismatch;

  hasLeague = this.gameService.hasLeague;
  isRegenerateConfirmationOpen = signal(false);
  isRegenerating = signal(false);

  selectedTeam = computed(() => {
    const league = this.gameService.league();
    if (!league?.userTeamId) {
      return undefined;
    }

    return this.gameService.getTeam(league.userTeamId);
  });

  async generateLeague(): Promise<void> {
    if (this.isReadOnlyMode()) {
      return;
    }

    this.gameService.generateNewLeague();
    await this.scheduleStateService.resetToWeek(1);
  }

  selectTeam(teamId: string) {
    if (this.isReadOnlyMode()) {
      return;
    }

    this.gameService.setUserTeam(teamId);
    this.router.navigate(['/standings']);
  }

  continueLeague(): void {
    const selectedTeamId = this.gameService.league()?.userTeamId;
    if (selectedTeamId) {
      void this.router.navigate(['/team', selectedTeamId]);
      return;
    }

    void this.router.navigate(['/standings']);
  }

  openRegenerateConfirmation(): void {
    if (this.isReadOnlyMode()) {
      return;
    }

    this.isRegenerateConfirmationOpen.set(true);
  }

  cancelRegenerateConfirmation(): void {
    this.isRegenerateConfirmationOpen.set(false);
  }

  async confirmRegenerateLeague(): Promise<void> {
    if (this.isRegenerating() || this.isReadOnlyMode()) {
      return;
    }

    this.isRegenerating.set(true);
    try {
      await this.gameService.clearLeague();
      await this.scheduleStateService.clearPersistedWeek();
      this.gameService.generateNewLeague();
    } finally {
      this.isRegenerating.set(false);
      this.isRegenerateConfirmationOpen.set(false);
    }
  }
}
