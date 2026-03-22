import { ChangeDetectionStrategy, Component, inject, signal, OnInit, OnDestroy, effect } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { CommentaryService } from '../../services/commentary.service';
import { MatchSummaryComponent } from '../../components/match-summary/match-summary';
import { Match, MatchEvent, MatchStatistics } from '../../models/types';
import { EventType, EventImportance, CommentaryStyle } from '../../models/enums';
import { PlayByPlayEvent, MatchState } from '../../models/simulation.types';

interface CommentaryItem {
  id: string;
  minute: number;
  text: string;
  type: EventType;
  importance: EventImportance;
  isNew: boolean;
}

@Component({
  selector: 'app-watch-game',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatchSummaryComponent],
  templateUrl: './watch-game.html',
})
export class WatchGameComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  gameService = inject(GameService);
  commentaryService = inject(CommentaryService);

  // Match data
  matchId = signal<string>('');
  match = signal<Match | null>(null);
  homeTeam = signal<any>(null);
  awayTeam = signal<any>(null);

  // Simulation state
  isSimulating = signal<boolean>(false);
  isFinished = signal<boolean>(false);
  isHalfTime = signal<boolean>(false);
  currentMinute = signal<number>(0);
  homeScore = signal<number>(0);
  awayScore = signal<number>(0);
  commentary = signal<CommentaryItem[]>([]);
  
  // Match state from simulation
  matchState = signal<MatchState | null>(null);
  matchStats = signal<MatchStatistics | null>(null);
  keyEvents = signal<MatchEvent[]>([]);

  // Display state - only show stats after commentary completes
  showStats = signal<boolean>(false);
  
  // Animation interval
  private commentaryInterval: ReturnType<typeof setInterval> | null = null;
  private allCommentary: CommentaryItem[] = [];
  private commentaryIndex = 0;
  private halfTimeIndex = -1;

  constructor() {
    // Effect to load match data when matchId changes
    effect(() => {
      const id = this.matchId();
      if (id) {
        this.loadMatchData(id);
      }
    });
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.matchId.set(id);
    }
  }

  ngOnDestroy() {
    this.stopCommentaryFeed();
  }

  private loadMatchData(id: string) {
    const l = this.gameService.league();
    if (!l) return;

    const match = l.schedule.find(m => m.id === id);
    if (!match) return;

    this.match.set(match);
    this.homeTeam.set(this.gameService.getTeam(match.homeTeamId));
    this.awayTeam.set(this.gameService.getTeam(match.awayTeamId));

    // If match already played, show results immediately
    if (match.played) {
      this.isFinished.set(true);
      this.showStats.set(true);
      this.homeScore.set(match.homeScore ?? 0);
      this.awayScore.set(match.awayScore ?? 0);
      this.keyEvents.set(match.keyEvents ?? []);
      this.matchStats.set(match.matchStats ?? null);
    }
  }

  startSimulation() {
    const match = this.match();
    const home = this.homeTeam();
    const away = this.awayTeam();

    if (!match || !home || !away || match.played) return;

    this.isSimulating.set(true);
    this.commentary.set([]);

    // Simulate the entire match instantly
    const result = this.gameService.simulateMatchWithDetails(match, home, away, {
      enablePlayByPlay: true,
      enableSpatialTracking: true,
      enableTactics: true,
      enableFatigue: true,
      commentaryStyle: CommentaryStyle.DETAILED
    });

    // Store the match state
    this.matchState.set(result.matchState);
    this.matchStats.set(result.matchStats);
    this.keyEvents.set(result.keyEvents);

    // Generate commentary items from the match
    this.generateCommentaryFromMatch(result.matchState, home, away);

    // Start displaying commentary one at a time
    this.startCommentaryFeed();
  }

  private generateCommentaryFromMatch(matchState: MatchState, homeTeam: any, awayTeam: any) {
    this.allCommentary = [];

    // Add starting commentary
    const startingCommentary = this.commentaryService.generateStartingXICommentary(homeTeam, awayTeam);
    startingCommentary.forEach((text, index) => {
      this.allCommentary.push({
        id: `start-${index}`,
        minute: 0,
        text,
        type: EventType.PASS, // Generic type for non-event commentary
        importance: EventImportance.LOW,
        isNew: false
      });
    });

    // Add event commentary
    matchState.events.forEach(event => {
      const text = this.commentaryService.generateEventCommentary(event, homeTeam, awayTeam, CommentaryStyle.DETAILED);
      
      // Determine importance based on event type
      let importance = EventImportance.LOW;
      if (event.type === EventType.GOAL || event.type === EventType.RED_CARD) {
        importance = EventImportance.HIGH;
      } else if (event.type === EventType.YELLOW_CARD || event.type === EventType.SAVE || 
                 event.type === EventType.SHOT || event.type === EventType.CORNER) {
        importance = EventImportance.MEDIUM;
      }

      this.allCommentary.push({
        id: event.id,
        minute: event.time,
        text: `${event.time}': ${text}`,
        type: event.type,
        importance,
        isNew: false
      });
    });

    // Add half-time commentary and remember its index
    const halfTimeEvents = matchState.events.filter(e => e.time <= 45);
    const halfTimeGoals = halfTimeEvents.filter(e => e.type === EventType.GOAL).length;
    if (halfTimeGoals > 0 || matchState.events.length > 0) {
      this.halfTimeIndex = this.allCommentary.length;
      this.allCommentary.push({
        id: 'halftime',
        minute: 45,
        text: this.commentaryService.generateHalfTimeCommentary(matchState.homeScore, matchState.awayScore, halfTimeEvents),
        type: EventType.PASS,
        importance: EventImportance.MEDIUM,
        isNew: false
      });
    }

    // Add full-time commentary
    this.allCommentary.push({
      id: 'fulltime',
      minute: 90,
      text: this.commentaryService.generateFullTimeCommentary(matchState.homeScore, matchState.awayScore, matchState.events),
      type: EventType.PASS,
      importance: EventImportance.HIGH,
      isNew: false
    });
  }

  private startCommentaryFeed(resetIndex: boolean = true) {
    if (resetIndex) {
      this.commentaryIndex = 0;
      // Add first comment immediately
      this.addNextCommentary();
    }

    // Then add one every second
    this.commentaryInterval = setInterval(() => {
      this.addNextCommentary();
    }, 1000);
  }

  private addNextCommentary() {
    if (this.commentaryIndex >= this.allCommentary.length) {
      this.finishMatch();
      return;
    }

    // Check if we've reached half-time - pause here
    if (this.commentaryIndex === this.halfTimeIndex) {
      const item = this.allCommentary[this.commentaryIndex];
      item.isNew = true;
      this.currentMinute.set(item.minute);
      this.commentary.update(items => [item, ...items]);
      
      setTimeout(() => {
        this.commentary.update(items => 
          items.map(i => i.id === item.id ? { ...i, isNew: false } : i)
        );
      }, 500);
      
      this.commentaryIndex++;
      this.stopCommentaryFeed();
      this.isHalfTime.set(true);
      return;
    }

    const item = this.allCommentary[this.commentaryIndex];
    item.isNew = true;

    // Update current minute and score based on the commentary
    this.currentMinute.set(item.minute);
    
    // Update score if this is a goal event
    if (item.type === EventType.GOAL) {
      const matchState = this.matchState();
      if (matchState) {
        // Count goals up to this point
        const goalsUpToNow = this.allCommentary
          .slice(0, this.commentaryIndex + 1)
          .filter(c => c.type === EventType.GOAL);
        
        // Determine which team scored based on match state events
        let homeGoals = 0;
        let awayGoals = 0;
        
        matchState.events
          .filter(e => e.type === EventType.GOAL && e.time <= item.minute)
          .forEach(event => {
            // Check if player is from home or away team
            const playerId = event.playerIds[0];
            const homeTeam = this.homeTeam();
            if (homeTeam && homeTeam.players.some((p: any) => p.id === playerId)) {
              homeGoals++;
            } else {
              awayGoals++;
            }
          });

        this.homeScore.set(homeGoals);
        this.awayScore.set(awayGoals);
      }
    }

    // Add to commentary list (newest at top)
    this.commentary.update(items => [item, ...items]);

    // Remove isNew flag after animation
    setTimeout(() => {
      this.commentary.update(items => 
        items.map(i => i.id === item.id ? { ...i, isNew: false } : i)
      );
    }, 500);

    this.commentaryIndex++;
  }

  continueAfterHalfTime() {
    this.isHalfTime.set(false);
    // Continue from where we left off (don't reset index)
    this.startCommentaryFeed(false);
  }

  private stopCommentaryFeed() {
    if (this.commentaryInterval) {
      clearInterval(this.commentaryInterval);
      this.commentaryInterval = null;
    }
  }

  private finishMatch() {
    this.stopCommentaryFeed();
    this.isSimulating.set(false);
    this.isFinished.set(true);
    this.showStats.set(true);

    // Update final scores from match state
    const matchState = this.matchState();
    if (matchState) {
      this.homeScore.set(matchState.homeScore);
      this.awayScore.set(matchState.awayScore);
    }
  }

  getEventIcon(type: EventType): string {
    switch (type) {
      case EventType.GOAL: return '⚽';
      case EventType.YELLOW_CARD: return '🟨';
      case EventType.RED_CARD: return '🟥';
      case EventType.SHOT: return '🎯';
      case EventType.SAVE: return '🧤';
      case EventType.CORNER: return '📐';
      case EventType.FOUL: return '⚠️';
      default: return '';
    }
  }
}