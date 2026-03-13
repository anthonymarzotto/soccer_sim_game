import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { KeyEvent as MatchKeyEvent } from '../../models/types';
import { EventImportance } from '../../models/enums';

@Component({
  selector: 'app-schedule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './schedule.html',
})
export class ScheduleComponent {
  gameService = inject(GameService);

  // Expose enum values for template access
  EventImportance = EventImportance;

  selectedWeek = signal<number>(this.gameService.league()?.currentWeek || 1);

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
    const currentWeek = this.gameService.league()?.currentWeek;
    if (currentWeek && currentWeek <= this.maxWeeks()) {
      this.gameService.simulateCurrentWeek();
      this.selectedWeek.set(currentWeek);
    }
  }

  getTeamName(id: string): string {
    return this.gameService.getTeam(id)?.name || 'Unknown';
  }

  getTeamOverall(id: string): number {
    const team = this.gameService.getTeam(id);
    if (!team) return 0;
    return this.gameService.calculateTeamOverall(team);
  }

  getProbabilities(homeId: string, awayId: string) {
    const homeTeam = this.gameService.getTeam(homeId);
    const awayTeam = this.gameService.getTeam(awayId);
    if (!homeTeam || !awayTeam) return { home: 0, draw: 0, away: 0 };

    const homeOverall = this.gameService.calculateTeamOverall(homeTeam);
    const awayOverall = this.gameService.calculateTeamOverall(awayTeam);

    const homeAdvantage = 5;
    const homeChance = homeOverall + homeAdvantage;
    const awayChance = awayOverall;
    const totalChance = homeChance + awayChance;

    const homeWinProb = Math.round((homeChance / totalChance) * 100);
    const awayWinProb = Math.round((awayChance / totalChance) * 100);
    
    const diff = Math.abs(homeChance - awayChance);
    const drawProb = Math.max(5, 30 - diff);
    
    const adjustedHome = Math.round(homeWinProb * (100 - drawProb) / 100);
    const adjustedAway = Math.round(awayWinProb * (100 - drawProb) / 100);
    const finalDraw = 100 - adjustedHome - adjustedAway;

    return { home: adjustedHome, draw: finalDraw, away: adjustedAway };
  }

  getPlayerNames(playerIds: string[]): string[] {
    return playerIds.map(id => {
      const player = this.gameService.getPlayer(id);
      return player ? player.name : 'Unknown Player';
    });
  }

  getPlayerLinks(playerIds: string[]): { name: string; playerId: string }[] {
    return playerIds.map(id => {
      const player = this.gameService.getPlayer(id);
      return {
        name: player ? player.name : 'Unknown Player',
        playerId: id
      };
    });
  }

  formatEventDescription(description: string, playerIds: string[]): string {
    // Replace player IDs in the description with player names
    let formattedDescription = description;
    
    playerIds.forEach(playerId => {
      const player = this.gameService.getPlayer(playerId);
      const playerName = player ? player.name : 'Unknown Player';
      // Replace the player ID with the player name
      formattedDescription = formattedDescription.replace(playerId, playerName);
    });
    
    return formattedDescription;
  }

}
