import { ChangeDetectionStrategy, Component, inject, signal, computed, HostListener, ElementRef } from '@angular/core';
import { GameService } from '../../services/game.service';
import { WINTER_WINDOW_START } from '../../services/transfer.service';

@Component({
  selector: 'app-season-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './season-controls.html'
})
export class SeasonControlsComponent {
  gameService = inject(GameService);
  private elementRef = inject(ElementRef);

  isReadOnlyMode = this.gameService.isMutatingWritesBlockedBySchemaMismatch;
  isDropdownOpen = signal(false);

  isWinterWindowOptionDisabled = computed(() => {
    const league = this.gameService.league();
    if (!league) return true;
    return league.currentWeek >= WINTER_WINDOW_START;
  });

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.isDropdownOpen.update(open => !open);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isDropdownOpen.set(false);
    }
  }

  simulateCurrentWeek(): void {
    this.gameService.simulateCurrentWeek();
  }

  simulateWeeks(weeksCount: number): void {
    this.isDropdownOpen.set(false);
    this.gameService.simulateWeeks(weeksCount);
  }

  simulateToWinterWindow(): void {
    this.isDropdownOpen.set(false);
    this.gameService.simulateToWinterTransferWindow();
  }

  simulateWholeSeason(): void {
    this.isDropdownOpen.set(false);
    this.gameService.simulateWholeSeason();
  }

  startNewSeason(): void {
    this.gameService.startNewSeason();
  }
}
