import { Component, inject } from '@angular/core';
import { GameService } from '../../services/game.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-test-key-events',
  imports: [RouterLink],
  templateUrl: './test-key-events.html',
})
export class TestKeyEventsComponent {
  gameService = inject(GameService);

  recentMatches() {
    const league = this.gameService.league();
    if (!league) return [];
    
    // Get matches from the current week and previous weeks
    return league.schedule
      .filter(m => m.week <= (league.currentWeek || 1) && m.played)
      .sort((a, b) => b.week - a.week)
      .slice(0, 5); // Show last 5 played matches
  }

  generateLeague() {
    this.gameService.generateNewLeague();
  }

  simulateWeek() {
    this.gameService.simulateCurrentWeek();
  }

  getEventCount(keyEvents: any[], eventType: string): number {
    return keyEvents.filter(event => event.type === eventType).length;
  }
}