import { ChangeDetectionStrategy, Component, inject, signal, OnInit, OnDestroy, effect } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { CommentaryService } from '../../services/commentary.service';
import { MatchSummaryComponent } from '../../components/match-summary/match-summary';
import { Match, MatchEvent, MatchStatistics, Team } from '../../models/types';
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
  private static readonly FIRST_HALF_END_MINUTE = 45;
  private static readonly FEED_INTERVAL_MS = 1000;
  private static readonly NEW_COMMENTARY_ANIMATION_MS = 500;

  private route = inject(ActivatedRoute);
  gameService = inject(GameService);
  commentaryService = inject(CommentaryService);

  // Match data
  matchId = signal<string>('');
  match = signal<Match | null>(null);
  displayMatch = signal<Match | null>(null);
  homeTeam = signal<Team | null>(null);
  awayTeam = signal<Team | null>(null);

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
  private finalKeyEvents: MatchEvent[] = [];
  private finalMatchStats: MatchStatistics | null = null;

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
    this.homeTeam.set(this.gameService.getTeam(match.homeTeamId) ?? null);
    this.awayTeam.set(this.gameService.getTeam(match.awayTeamId) ?? null);

    // If match already played, show results immediately unless a live replay is in progress.
    if (match.played) {
      if (this.isSimulating()) {
        return;
      }

      this.isFinished.set(true);
      this.showStats.set(true);
      this.homeScore.set(match.homeScore ?? 0);
      this.awayScore.set(match.awayScore ?? 0);
      this.keyEvents.set(match.keyEvents ?? []);
      this.matchStats.set(match.matchStats ?? null);
      this.displayMatch.set(match); // Show full match with stats/events
    } else {
      // For unplayed matches, show match without keyEvents/matchStats
      this.displayMatch.set({
        ...match,
        keyEvents: undefined,
        matchStats: undefined
      });
    }
  }

  startSimulation() {
    const match = this.match();
    const home = this.homeTeam();
    const away = this.awayTeam();

    if (!match || !home || !away || match.played) return;

    // Reset UI state to guarantee stats remain hidden until finishMatch().
    this.stopCommentaryFeed();
    this.isSimulating.set(true);
    this.isFinished.set(false);
    this.isHalfTime.set(false);
    this.showStats.set(false);
    this.currentMinute.set(0);
    this.homeScore.set(0);
    this.awayScore.set(0);
    this.halfTimeIndex = -1;
    this.finalKeyEvents = [];
    this.finalMatchStats = null;
    this.keyEvents.set([]);
    this.matchStats.set(null);
    this.commentary.set([]);

    // Keep summary visible while replay state streams in.
    this.displayMatch.set({
      ...match,
      played: false,
      homeScore: 0,
      awayScore: 0,
      keyEvents: [],
      matchStats: undefined
    });

    // Simulate the entire match instantly
    const result = this.gameService.simulateMatchWithDetails(match, home, away, {
      enablePlayByPlay: true,
      enableSpatialTracking: true,
      enableTactics: true,
      enableFatigue: true,
      commentaryStyle: CommentaryStyle.DETAILED
    });

    // Store the match state (stats will be set after commentary completes)
    this.matchState.set(result.matchState);
    this.finalKeyEvents = result.keyEvents;
    this.finalMatchStats = result.matchStats;
    this.keyEvents.set(result.keyEvents);

    // Generate commentary items from the match
    this.generateCommentaryFromMatch(result.matchState, home, away);

    // Start displaying commentary one at a time
    this.startCommentaryFeed();
  }

  private generateCommentaryFromMatch(matchState: MatchState, homeTeam: Team, awayTeam: Team) {
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

    // Separate first-half and second-half events
    const firstHalfEvents = matchState.events.filter(e => e.time <= WatchGameComponent.FIRST_HALF_END_MINUTE);
    const secondHalfEvents = matchState.events.filter(e => e.time > WatchGameComponent.FIRST_HALF_END_MINUTE);

    // Helper function to add event commentary
    const addEventCommentary = (event: typeof matchState.events[0]) => {
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
    };

    // Add first-half event commentary
    firstHalfEvents.forEach(addEventCommentary);

    let halfTimeHomeScore = 0;
    let halfTimeAwayScore = 0;
    firstHalfEvents
      .filter((event) => event.type === EventType.GOAL)
      .forEach((event) => {
        const scoringTeam = this.getScoringTeam(event, homeTeam, awayTeam);
        if (scoringTeam === 'home') {
          halfTimeHomeScore++;
        } else if (scoringTeam === 'away') {
          halfTimeAwayScore++;
        }
      });

    // Add half-time commentary at the correct chronological position
    const halfTimeGoals = firstHalfEvents.filter(e => e.type === EventType.GOAL).length;
    if (halfTimeGoals > 0 || matchState.events.length > 0) {
      this.halfTimeIndex = this.allCommentary.length;
      this.allCommentary.push({
        id: 'halftime',
        minute: WatchGameComponent.FIRST_HALF_END_MINUTE,
        text: this.commentaryService.generateHalfTimeCommentary(halfTimeHomeScore, halfTimeAwayScore, firstHalfEvents),
        type: EventType.PASS,
        importance: EventImportance.MEDIUM,
        isNew: false
      });
    }

    // Add second-half event commentary
    secondHalfEvents.forEach(addEventCommentary);

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
    if (this.commentaryInterval) {
      return;
    }

    if (resetIndex) {
      this.commentaryIndex = 0;
      // Add first comment immediately
      this.addNextCommentary();
    }

    // Then add one every second
    this.commentaryInterval = setInterval(() => {
      this.addNextCommentary();
    }, WatchGameComponent.FEED_INTERVAL_MS);
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
      }, WatchGameComponent.NEW_COMMENTARY_ANIMATION_MS);
      
      this.commentaryIndex++;
      this.stopCommentaryFeed();
      this.isHalfTime.set(true);
      return;
    }

    const item = this.allCommentary[this.commentaryIndex];
    item.isNew = true;

    // Update current minute and score based on the commentary
    this.currentMinute.set(item.minute);

    this.updateDisplayMatchAtMinute(item.minute);

    // Add to commentary list (newest at top)
    this.commentary.update(items => [item, ...items]);

    // Remove isNew flag after animation
    setTimeout(() => {
      this.commentary.update(items => 
        items.map(i => i.id === item.id ? { ...i, isNew: false } : i)
      );
    }, WatchGameComponent.NEW_COMMENTARY_ANIMATION_MS);

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

    const match = this.match();
    const matchState = this.matchState();
    if (match && matchState) {
      this.homeScore.set(matchState.homeScore);
      this.awayScore.set(matchState.awayScore);
      this.matchStats.set(this.finalMatchStats);
      this.keyEvents.set(this.finalKeyEvents);

      this.displayMatch.set({
        ...match,
        homeScore: matchState.homeScore,
        awayScore: matchState.awayScore,
        played: true,
        keyEvents: this.finalKeyEvents,
        matchStats: this.finalMatchStats ?? undefined
      });
    }
  }

  private updateDisplayMatchAtMinute(minute: number) {
    const match = this.match();
    const matchState = this.matchState();
    const homeTeam = this.homeTeam();
    const awayTeam = this.awayTeam();

    if (!match || !matchState || !homeTeam || !awayTeam) {
      return;
    }

    let homeGoals = 0;
    let awayGoals = 0;

    matchState.events
      .filter((event) => event.type === EventType.GOAL && event.time <= minute)
      .forEach((event) => {
        const scoringTeam = this.getScoringTeam(event, homeTeam, awayTeam);
        if (scoringTeam === 'home') {
          homeGoals++;
        } else if (scoringTeam === 'away') {
          awayGoals++;
        }
      });

    this.homeScore.set(homeGoals);
    this.awayScore.set(awayGoals);

    this.displayMatch.set({
      ...match,
      played: false,
      homeScore: homeGoals,
      awayScore: awayGoals,
      keyEvents: this.finalKeyEvents.filter((event) => event.time <= minute),
      matchStats: undefined
    });
  }

  private getScoringTeam(event: PlayByPlayEvent, homeTeam: Team, awayTeam: Team): 'home' | 'away' | null {
    const scorerId = event.playerIds[0];
    if (!scorerId) {
      return null;
    }

    if (homeTeam.players.some((player) => player.id === scorerId)) {
      return 'home';
    }

    if (awayTeam.players.some((player) => player.id === scorerId)) {
      return 'away';
    }

    return null;
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