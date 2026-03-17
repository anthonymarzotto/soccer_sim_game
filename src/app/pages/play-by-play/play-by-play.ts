import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { GameService } from '../../services/game.service';
import { Match, KeyEvent } from '../../models/types';
import { EventImportance } from '../../models/enums';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-play-by-play',
  templateUrl: './play-by-play.html',
  styleUrls: ['./play-by-play.css'],
  imports: [CommonModule, RouterLink],
  host: { 'class': 'play-by-play-page' }
})
export class PlayByPlayComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private gameService = inject(GameService);

  match: Match | null = null;
  homeTeamName = '';
  awayTeamName = '';
  events: KeyEvent[] = [];
  currentEventIndex = 0;
  isPlaying = false;
  timer: any;
  progressPercentage = 0;
  isSimulating = false;

  // Expose enum for template
  EventImportance = EventImportance;

  private subscriptions: Subscription[] = [];

  ngOnInit() {
    this.loadMatch();
  }

  ngOnDestroy() {
    this.stopTimer();
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private loadMatch() {
    const matchId = this.route.snapshot.paramMap.get('matchId');
    if (!matchId) {
      this.router.navigate(['/schedule']);
      return;
    }

    // Get current league state
    const league = this.gameService.league();
    if (!league) {
      this.router.navigate(['/schedule']);
      return;
    }

    // Find the match
    this.match = league.schedule.find(m => m.id === matchId) || null;
    
    if (!this.match) {
      this.router.navigate(['/schedule']);
      return;
    }

    // Get team names
    const homeTeam = this.gameService.getTeam(this.match.homeTeamId);
    const awayTeam = this.gameService.getTeam(this.match.awayTeamId);
    
    this.homeTeamName = homeTeam?.name || 'Home Team';
    this.awayTeamName = awayTeam?.name || 'Away Team';

    // If match not played, simulate it first
    if (!this.match.played) {
      this.simulateMatch();
    } else {
      // Load existing events
      this.events = this.match.keyEvents || [];
      this.startPlayByPlay();
    }
  }

  private simulateMatch() {
    this.isSimulating = true;
    
    const homeTeam = this.gameService.getTeam(this.match!.homeTeamId);
    const awayTeam = this.gameService.getTeam(this.match!.awayTeamId);
    
    if (!homeTeam || !awayTeam) {
      this.isSimulating = false;
      return;
    }

    // Simulate the match
    const result = this.gameService.simulateMatchWithDetails(
      this.match!,
      homeTeam,
      awayTeam,
      {
        enablePlayByPlay: true,
        enableSpatialTracking: true,
        enableTactics: true,
        enableFatigue: true,
        commentaryStyle: 'DETAILED' as any
      }
    );

    // Update match with results
    this.match!.homeScore = result.matchState.homeScore;
    this.match!.awayScore = result.matchState.awayScore;
    this.match!.played = true;
    this.match!.keyEvents = result.keyEvents;
    this.match!.matchStats = result.matchStats;
    this.match!.matchReport = result.matchReport;

    // Convert PlayByPlayEvent to KeyEvent format and add importance
    this.events = this.convertEventsToKeyEvents(result.matchState.events || []);
    this.isSimulating = false;
    
    // Start play-by-play
    this.startPlayByPlay();
  }

  startPlayByPlay() {
    if (this.events.length === 0) return;

    this.isPlaying = true;
    this.currentEventIndex = 0;
    this.progressPercentage = 0;

    this.timer = setInterval(() => {
      if (this.currentEventIndex < this.events.length - 1) {
        this.currentEventIndex++;
        this.progressPercentage = (this.currentEventIndex / (this.events.length - 1)) * 100;
      } else {
        this.stopTimer();
        this.isPlaying = false;
        this.progressPercentage = 100;
      }
    }, 1000); // 1 second per event
  }

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  skipToEnd() {
    this.stopTimer();
    this.currentEventIndex = this.events.length - 1;
    this.progressPercentage = 100;
    this.isPlaying = false;
  }

  resetPlayByPlay() {
    this.stopTimer();
    this.currentEventIndex = 0;
    this.progressPercentage = 0;
    this.isPlaying = false;
  }

  getDisplayedEvents(): KeyEvent[] {
    return this.events.slice(0, this.currentEventIndex + 1);
  }

  getRemainingEvents(): KeyEvent[] {
    return this.events.slice(this.currentEventIndex + 1);
  }

  getEventClass(event: KeyEvent): string {
    switch (event.importance) {
      case EventImportance.HIGH:
        return 'event-high';
      case EventImportance.MEDIUM:
        return 'event-medium';
      default:
        return 'event-low';
    }
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
    let formattedDescription = description;
    
    playerIds.forEach(playerId => {
      const player = this.gameService.getPlayer(playerId);
      const playerName = player ? player.name : 'Unknown Player';
      formattedDescription = formattedDescription.replace(playerId, playerName);
    });
    
    return formattedDescription;
  }

  goBackToSchedule() {
    this.router.navigate(['/schedule']);
  }

  getFinalScore(): string {
    if (!this.match) return '0 - 0';
    return `${this.match.homeScore || 0} - ${this.match.awayScore || 0}`;
  }

  getMatchStats() {
    return this.match?.matchStats || null;
  }

  getStatValue(statPath: string): any {
    const stats = this.getMatchStats();
    if (!stats) return 0;
    
    // Simple path navigation for nested properties
    const parts = statPath.split('.');
    let current: any = stats;
    
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return 0;
      }
    }
    
    return current || 0;
  }

  getImportanceClass(importance: EventImportance): string {
    switch (importance) {
      case EventImportance.HIGH:
        return 'bg-red-500/20 text-red-300';
      case EventImportance.MEDIUM:
        return 'bg-yellow-500/20 text-yellow-300';
      default:
        return 'bg-zinc-700 text-zinc-300';
    }
  }

  getImportanceLabel(importance: EventImportance): string {
    switch (importance) {
      case EventImportance.HIGH:
        return 'Important';
      case EventImportance.MEDIUM:
        return 'Key';
      default:
        return 'Regular';
    }
  }

  trackEvent(index: number, event: KeyEvent): string {
    return event.id;
  }

  private convertEventsToKeyEvents(playByPlayEvents: any[]): KeyEvent[] {
    return playByPlayEvents.map(event => {
      // Determine importance based on event type
      let importance: EventImportance = EventImportance.LOW;
      let icon = '';
      let description = event.description || this.generateEventDescription(event);

      switch (event.type) {
        case 'GOAL':
          importance = EventImportance.HIGH;
          icon = '⚽';
          description = `Goal at ${event.time}'`;
          break;
        case 'RED_CARD':
          importance = EventImportance.HIGH;
          icon = '🟥';
          description = `Red card at ${event.time}'`;
          break;
        case 'YELLOW_CARD':
          importance = EventImportance.MEDIUM;
          icon = '🟨';
          description = `Yellow card at ${event.time}'`;
          break;
        case 'PENALTY':
          importance = EventImportance.HIGH;
          icon = '🎯';
          description = `Penalty awarded at ${event.time}'`;
          break;
        case 'CORNER':
          importance = EventImportance.MEDIUM;
          icon = '📐';
          description = `Corner kick at ${event.time}'`;
          break;
        case 'SUBSTITUTION':
          importance = EventImportance.MEDIUM;
          icon = '🔄';
          description = `Substitution at ${event.time}'`;
          break;
        case 'SHOT':
          importance = event.success ? EventImportance.MEDIUM : EventImportance.LOW;
          icon = '🎯';
          description = `Shot ${event.success ? 'on target' : 'off target'} at ${event.time}'`;
          break;
        case 'SAVE':
          importance = EventImportance.MEDIUM;
          icon = '🧤';
          description = `Save at ${event.time}'`;
          break;
        case 'PASS':
          importance = EventImportance.LOW;
          icon = '🔗';
          description = `Pass at ${event.time}'`;
          break;
        case 'TACKLE':
          importance = event.success ? EventImportance.MEDIUM : EventImportance.LOW;
          icon = '⚔️';
          description = `Tackle ${event.success ? 'successful' : 'unsuccessful'} at ${event.time}'`;
          break;
        case 'INTERCEPTION':
          importance = EventImportance.MEDIUM;
          icon = '✋';
          description = `Interception at ${event.time}'`;
          break;
        case 'FOUL':
          importance = EventImportance.MEDIUM;
          icon = '⚠️';
          description = `Foul at ${event.time}'`;
          break;
        default:
          importance = EventImportance.LOW;
          icon = '⚽';
          description = `${event.type} at ${event.time}'`;
      }

      return {
        id: event.id,
        type: event.type,
        description,
        playerIds: event.playerIds || [],
        time: event.time,
        icon,
        importance
      };
    });
  }

  private generateEventDescription(event: any): string {
    // Generate a basic description if none exists
    const time = event.time || '0';
    const type = event.type || 'Event';
    const players = event.playerIds && event.playerIds.length > 0 
      ? ` by ${event.playerIds.join(', ')}` 
      : '';
    
    return `${type}${players} at ${time}'`;
  }
}
