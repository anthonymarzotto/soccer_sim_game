import { ChangeDetectionStrategy, Component, computed, inject, signal, effect } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { SettingsService, ICON_BADGE_STYLES, BadgeStyle } from '../../services/settings.service';
import { ScheduleStateService } from '../../services/schedule-state.service';
import { EventImportance } from '../../models/enums';
import { TeamBadgeComponent } from '../../components/team-badge/team-badge';

const ICON_BADGE_STYLE_SET = new Set<BadgeStyle>(ICON_BADGE_STYLES);

@Component({
  selector: 'app-schedule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TeamBadgeComponent],
  templateUrl: './schedule.html',
})
export class ScheduleComponent {
  gameService = inject(GameService);
  settingsService = inject(SettingsService);
  scheduleStateService = inject(ScheduleStateService);

  // Expose enum values for template access
  EventImportance = EventImportance;

  selectedWeek = signal<number>(this.gameService.league()?.currentWeek || 1);

  constructor() {
    // Initialize service with current week
    this.scheduleStateService.selectedWeek.set(this.selectedWeek());
    
    // Sync selectedWeek with scheduleStateService whenever it changes
    effect(() => {
      const week = this.selectedWeek();
      this.scheduleStateService.selectedWeek.set(week);
    });
  }

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

  getPlayerTeamId(playerId: string): string {
    const player = this.gameService.getPlayer(playerId);
    return player?.teamId || '';
  }

  simulateMatch(matchId: string) {
    const l = this.gameService.league();
    if (!l) return;

    const match = l.schedule.find(m => m.id === matchId);
    if (!match || match.played) return;

    const homeTeam = l.teams.find(t => t.id === match.homeTeamId);
    const awayTeam = l.teams.find(t => t.id === match.awayTeamId);

    if (!homeTeam || !awayTeam) return;

    this.gameService.simulateMatchWithDetails(match, homeTeam, awayTeam);
    
    // Check if all matches for the current week are played, and advance week if so
    const currentWeekMatches = this.gameService.getMatchesForWeek(l.currentWeek);
    const allCurrentWeekPlayed = currentWeekMatches.every(m => m.played);
    if (allCurrentWeekPlayed && l.currentWeek < this.maxWeeks()) {
      this.gameService.advanceWeek();
    }
    
    this.selectedWeek.set(this.gameService.league()?.currentWeek || 1);
  }

  isIconBadgeStyle(): boolean {
    return ICON_BADGE_STYLE_SET.has(this.settingsService.badgeStyle());
  }

}
