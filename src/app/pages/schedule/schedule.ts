import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { ScheduleStateService } from '../../services/schedule-state.service';
import { MatchSummaryComponent } from '../../components/match-summary/match-summary';

@Component({
  selector: 'app-schedule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatchSummaryComponent],
  templateUrl: './schedule.html',
})
export class ScheduleComponent {
  gameService = inject(GameService);
  scheduleStateService = inject(ScheduleStateService);

  selectedWeek = this.scheduleStateService.selectedWeek;

  maxWeeks = computed(() => {
    const l = this.gameService.league();
    if (!l) return 1;
    return (l.teams.length - 1) * 2;
  });

  matches = computed(() => {
    return this.gameService.getMatchesForWeek(this.selectedWeek());
  });

  prevWeek() {
    if (this.selectedWeek() > 1) {
      this.selectedWeek.update(w => w - 1);
    }
  }

  nextWeek() {
    if (this.selectedWeek() < this.maxWeeks()) {
      this.selectedWeek.update(w => w + 1);
    }
  }

  simulateCurrentWeek() {
    if (this.gameService.isAnySimulationInProgress()) {
      return;
    }

    const currentWeek = this.gameService.league()?.currentWeek;
    if (currentWeek && currentWeek <= this.maxWeeks()) {
      this.gameService.simulateCurrentWeek();
      this.selectedWeek.set(currentWeek);
    }
  }


  simulateMatch(matchId: string) {
    if (this.gameService.isAnySimulationInProgress()) {
      return;
    }

    const l = this.gameService.league();
    if (!l) return;

    const match = l.schedule.find(m => m.id === matchId);
    if (!match || match.played) return;

    const homeTeam = l.teams.find(t => t.id === match.homeTeamId);
    const awayTeam = l.teams.find(t => t.id === match.awayTeamId);

    if (!homeTeam || !awayTeam) return;

    const result = this.gameService.simulateMatchWithDetails(match, homeTeam, awayTeam, { skipCommentary: true });
    if (!result) {
      return;
    }
    
    // Check if all matches for the current week are played, and advance week if so
    const currentWeekMatches = this.gameService.getMatchesForWeek(l.currentWeek);
    const allCurrentWeekPlayed = currentWeekMatches.every(m => m.played);
    if (allCurrentWeekPlayed && l.currentWeek < this.maxWeeks()) {
      this.gameService.advanceWeek();
    }
    
    this.selectedWeek.set(this.gameService.league()?.currentWeek || 1);
  }

}
