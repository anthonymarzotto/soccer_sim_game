import { ChangeDetectionStrategy, Component, inject, signal, OnInit, OnDestroy, effect, ElementRef, ViewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { GameService } from '../../services/game.service';
import { CommentaryService } from '../../services/commentary.service';
import { FieldService } from '../../services/field.service';
import { TeamColorsService } from '../../services/team-colors.service';
import { MatchSummaryComponent } from '../../components/match-summary/match-summary';
import { Match, MatchEvent, MatchStatistics, Team, Player } from '../../models/types';
import { EventType, EventImportance, CommentaryStyle, TeamSide, Role } from '../../models/enums';
import { PlayByPlayEvent, MatchState, Coordinates, PlayByPlayEventAdditionalData, VariantBMatchShapeSnapshot, VariantBShapeSlotSnapshot, MinuteFatigueSnapshot } from '../../models/simulation.types';

interface CommentaryItem {
  id: string;
  minute: number;
  text: string;
  type: EventType;
  importance: EventImportance;
  location: Coordinates | null;
  teamSide: TeamSide | null;
  playerIds: string[];
  additionalData?: PlayByPlayEventAdditionalData;
  isNew: boolean;
}

interface FormationDot {
  id: string;
  slotId: string;
  slotLabel: string;
  tacticOrder: number;
  teamSide: TeamSide;
  playerId: string;
  label: string;
  fullName: string;
  x: number;
  y: number;
  minuteEntered: number;
  goalMinutes: number[];
  yellowCardMinutes: number[];
  redCards: number;
}

interface PitchPoint {
  left: number;
  top: number;
}

interface TeamLineupEntry {
  playerId: string;
  slotLabel: string | null;
  tacticOrder: number;
  role: string;
  name: string;
  onField: boolean;
  fatigue: number;
  playerStatus: Role;
}

@Component({
  selector: 'app-watch-game',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatchSummaryComponent, DecimalPipe],
  templateUrl: './watch-game.html',
})
export class WatchGameComponent implements OnInit, OnDestroy {
  @ViewChild('commentaryLog') commentaryLog?: ElementRef<HTMLElement>;
  private static readonly FIRST_HALF_END_MINUTE = 45;
  private static readonly DEFAULT_COMMENTARY_DELAY_MS = 1000;
  private static readonly HIGH_IMPORTANCE_DELAY_MS = 1800;
  private static readonly RESUME_DELAY_MS = 900;
  private static readonly MIN_COMMENTARY_DELAY_MS = 120;
  private static readonly MIN_SPEED = 0.1;
  private static readonly MAX_SPEED = 5;
  private static readonly NEW_COMMENTARY_ANIMATION_MS = 500;

  private readonly HIGH_FATIGUE_THRESHOLD = 75;
  private readonly MEDIUM_FATIGUE_THRESHOLD = 50;
  private readonly HIGH_FATIGUE_BAR_COLOR = '#22c55e';
  private readonly MEDIUM_FATIGUE_BAR_COLOR = '#f59e0b';
  private readonly LOW_FATIGUE_BAR_COLOR = '#dc2626';


  private route = inject(ActivatedRoute);
  gameService = inject(GameService);
  commentaryService = inject(CommentaryService);
  fieldService = inject(FieldService);
  teamColorsService = inject(TeamColorsService);
  TeamSide = TeamSide;
  Role = Role;

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
  homeFormationDots = signal<FormationDot[]>([]);
  awayFormationDots = signal<FormationDot[]>([]);
  activeEventLocation = signal<Coordinates | null>(null);
  activeEventTeamSide = signal<TeamSide | null>(null);
  activeEventPlayerIds = signal<string[]>([]);
  activeEventInitiatorPlayerId = signal<string | null>(null);
  homeTeamColor = signal<string>('#0ea5e9');
  awayTeamColor = signal<string>('#f43f5e');
  
  // Match state from simulation
  matchState = signal<MatchState | null>(null);
  matchStats = signal<MatchStatistics | null>(null);
  keyEvents = signal<MatchEvent[]>([]);

  // Display state - only show stats after commentary completes
  showStats = signal<boolean>(false);
  validationError = signal<string | null>(null);
  commentaryPlaybackSpeed = signal<number>(1);
  currentCommentaryItem = signal<CommentaryItem | null>(null);
  isCommentaryExpanded = signal<boolean>(false);
  commentaryAutoFollow = signal<boolean>(true);
  private pausedSpeed: number | null = null;
  
  // Replay scheduling
  private commentaryTimer: ReturnType<typeof setTimeout> | null = null;
  private commentaryTimerStartedAt: number | null = null;
  private commentaryTimerDelayMs: number | null = null;
  private commentaryTimerBaseDelayMs: number | null = null;
  private pausedCommentaryDelayMs: number | null = null;
  private pausedCommentaryBaseDelayMs: number | null = null;
  private allCommentary: CommentaryItem[] = [];
  private commentaryIndex = 0;
  private halfTimeIndex = -1;
  private finalKeyEvents: MatchEvent[] = [];
  private finalMatchStats: MatchStatistics | null = null;
  private playerTeamLookup = new Map<string, TeamSide>();
  private finalFormationSnapshotKey = '';
  private homeRemovedPlayers = signal<Map<string, { status: Role; fatigue: number }>>(new Map());
  private awayRemovedPlayers = signal<Map<string, { status: Role; fatigue: number }>>(new Map());

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

    if (this.isSimulating()) {
      this.gameService.endSingleMatchSimulationSession();
    }
  }

  private loadMatchData(id: string) {
    const l = this.gameService.league();
    if (!l) return;

    const match = l.schedule.find(m => m.id === id);
    if (!match) return;

    this.match.set(match);
    const home = this.gameService.getTeam(match.homeTeamId) ?? null;
    const away = this.gameService.getTeam(match.awayTeamId) ?? null;
    this.homeTeam.set(home);
    this.awayTeam.set(away);

    const playedFormationKey = `${match.id}:${match.keyEvents?.length ?? 0}`;
    if (home && away) {
      if (match.played && !this.isSimulating()) {
        if (this.finalFormationSnapshotKey !== playedFormationKey) {
          this.buildFormationDots(home, away);
          this.applyFinalFormationFromEvents(match, home, away);
          this.finalFormationSnapshotKey = playedFormationKey;
        }
      } else {
        this.buildFormationDots(home, away);
        this.clearFinalFormationSnapshotKey();
      }
    } else {
      this.homeFormationDots.set([]);
      this.awayFormationDots.set([]);
      this.clearFinalFormationSnapshotKey();
    }
    this.clearActiveEventState();

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

    if (!match) {
      this.validationError.set('Match data is not available yet.');
      return;
    }

    if (!home || !away) {
      this.validationError.set('Team data is not available yet.');
      return;
    }

    if (match.played) {
      this.validationError.set('This match has already been played.');
      return;
    }

    if (this.gameService.isSimulatingMatchWeek()) {
      this.validationError.set('Cannot start match simulation while a match week is being simulated.');
      return;
    }
    const userTeamId = this.gameService.league()?.userTeamId;
    const userTeam = home.id === userTeamId ? home : away.id === userTeamId ? away : null;
    if (userTeam) {
      const errors = this.gameService.getFormationValidationErrors(userTeam);
      if (errors.length > 0) {
        this.validationError.set(errors[0]);
        return;
      }
    }

    this.validationError.set(null);
    this.gameService.beginSingleMatchSimulationSession();

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
    this.playerTeamLookup.clear();
    this.keyEvents.set([]);
    this.matchStats.set(null);
    this.commentary.set([]);
    this.commentaryAutoFollow.set(true);
    this.commentaryPlaybackSpeed.set(1);
    this.pausedSpeed = null;
    this.pausedCommentaryDelayMs = null;
    this.pausedCommentaryBaseDelayMs = null;
    this.clearActiveEventState();
    this.clearFinalFormationSnapshotKey();

    this.buildPlayerTeamLookup(home.id, away.id);
    this.buildFormationDots(home, away);

    // Keep summary visible while replay state streams in.
    this.displayMatch.set({
      ...match,
      played: false,
      homeScore: 0,
      awayScore: 0,
      keyEvents: [],
      matchStats: undefined
    });
    let handoffSessionToReplay = false;

    try {
      // Simulate the entire match instantly
      const result = this.gameService.simulateMatchWithDetails(match, home, away, {
        enablePlayByPlay: true,
        enableSpatialTracking: true,
        enableTactics: true,
        enableFatigue: true,
        commentaryStyle: CommentaryStyle.DETAILED
      }, { bypassSingleMatchSimulationLock: true });

      if (!result) {
        this.isSimulating.set(false);
        return;
      }

      // Store the match state (stats will be set after commentary completes)
      this.matchState.set(result.matchState);
      this.finalKeyEvents = result.keyEvents;
      this.finalMatchStats = result.matchStats;
      this.keyEvents.set(result.keyEvents);

      // Generate commentary items from the match
      this.generateCommentaryFromMatch(result.matchState, home, away);

      // Start displaying commentary one at a time
      this.startCommentaryFeed();
      handoffSessionToReplay = true;
    } catch (error) {
      this.stopCommentaryFeed();
      this.isSimulating.set(false);
      this.isHalfTime.set(false);
      this.validationError.set('Match simulation failed. Please try again.');
      console.error('Watch game simulation failed', error);
    } finally {
      if (!handoffSessionToReplay) {
        this.gameService.endSingleMatchSimulationSession();
      }
    }
  }

  private generateCommentaryFromMatch(matchState: MatchState, homeTeam: Team, awayTeam: Team) {
    this.allCommentary = [];
    const homePlayers = this.gameService.getPlayersForTeam(homeTeam.id);
    const awayPlayers = this.gameService.getPlayersForTeam(awayTeam.id);

    // Add starting commentary
    const startingCommentary = this.commentaryService.generateStartingXICommentary(homeTeam, awayTeam, {
      homePlayers,
      awayPlayers
    });
    startingCommentary.forEach((text, index) => {
      this.allCommentary.push({
        id: `start-${index}`,
        minute: 0,
        text,
        type: EventType.PASS, // Generic type for non-event commentary
        importance: EventImportance.LOW,
        location: null,
        teamSide: null,
        playerIds: [],
        isNew: false
      });
    });

    // Separate first-half and second-half events
    const firstHalfEvents = matchState.events.filter(e => e.time <= WatchGameComponent.FIRST_HALF_END_MINUTE);
    const secondHalfEvents = matchState.events.filter(e => e.time > WatchGameComponent.FIRST_HALF_END_MINUTE);

    // Helper function to add event commentary
    const addEventCommentary = (event: typeof matchState.events[0]) => {
      const text = this.commentaryService.generateEventCommentary(
        event,
        homeTeam,
        awayTeam,
        CommentaryStyle.DETAILED,
        {
          homePlayers,
          awayPlayers
        }
      );
      
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
        location: { ...event.location },
        teamSide: this.getEventTeamSide(event, homeTeam, awayTeam),
        playerIds: [...event.playerIds],
        additionalData: event.additionalData,
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
        if (scoringTeam === TeamSide.HOME) {
          halfTimeHomeScore++;
        } else if (scoringTeam === TeamSide.AWAY) {
          halfTimeAwayScore++;
        }
      });

    // Add half-time commentary at the correct chronological position
    const halfTimeGoals = firstHalfEvents.filter(e => e.type === EventType.GOAL).length;
    if (halfTimeGoals > 0 || matchState.events.length > 0) {
      this.allCommentary.push({
        id: 'halftime',
        minute: WatchGameComponent.FIRST_HALF_END_MINUTE,
        text: this.commentaryService.generateHalfTimeCommentary(halfTimeHomeScore, halfTimeAwayScore, firstHalfEvents),
        type: EventType.PASS,
        importance: EventImportance.MEDIUM,
        location: null,
        teamSide: null,
        playerIds: [],
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
      location: null,
      teamSide: null,
      playerIds: [],
      isNew: false
    });
    this.halfTimeIndex = this.allCommentary.findIndex(item => item.id === 'halftime');
  }

  private startCommentaryFeed(resetIndex = true) {
    if (this.commentaryTimer) {
      return;
    }

    if (resetIndex) {
      this.commentaryIndex = 0;
    }

    this.scheduleNextCommentary(
      resetIndex ? 0 : this.scaleCommentaryDelay(WatchGameComponent.RESUME_DELAY_MS),
      resetIndex ? 0 : WatchGameComponent.RESUME_DELAY_MS
    );
  }

  private scheduleNextCommentary(delayMs: number, baseDelayMs: number = delayMs) {
    if (this.commentaryTimer) {
      return;
    }

    this.commentaryTimerStartedAt = Date.now();
    this.commentaryTimerDelayMs = Math.max(0, Math.round(delayMs));
    this.commentaryTimerBaseDelayMs = Math.max(0, Math.round(baseDelayMs));
    this.commentaryTimer = setTimeout(() => {
      this.clearCommentaryTimerState();
      this.addNextCommentary();
    }, this.commentaryTimerDelayMs);
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
      this.clearActiveEventState();
      this.commentary.update(items => [item, ...items]);
      this.scrollCommentaryLogToLatest();
      
      setTimeout(() => {
        this.commentary.update(items => 
          items.map(i => i.id === item.id ? { ...i, isNew: false } : i)
        );
      }, WatchGameComponent.NEW_COMMENTARY_ANIMATION_MS);
      
      this.commentaryIndex++;
      this.stopCommentaryFeed();
      this.commentaryPlaybackSpeed.set(this.pausedSpeed ?? 1);
      this.pausedSpeed = null;
      this.pausedCommentaryDelayMs = null;
      this.pausedCommentaryBaseDelayMs = null;
      this.isHalfTime.set(true);
      return;
    }

    const item = this.allCommentary[this.commentaryIndex];
    item.isNew = true;

    // Update current minute and score based on the commentary
    this.currentMinute.set(item.minute);
    this.activeEventLocation.set(item.location ? { ...item.location } : null);
    this.activeEventTeamSide.set(item.teamSide ?? null);
    this.activeEventPlayerIds.set([...item.playerIds]);
    this.activeEventInitiatorPlayerId.set(item.playerIds[0] ?? null);
    this.currentCommentaryItem.set(item);
    this.applyCommentaryPitchState(item);

    this.updateDisplayMatchAtMinute(item.minute);

    // Add to commentary list (newest at top)
    this.commentary.update(items => [item, ...items]);
    this.scrollCommentaryLogToLatest();

    // Remove isNew flag after animation
    setTimeout(() => {
      this.commentary.update(items => 
        items.map(i => i.id === item.id ? { ...i, isNew: false } : i)
      );
    }, WatchGameComponent.NEW_COMMENTARY_ANIMATION_MS);

    this.commentaryIndex++;
    const baseDelay = this.getBaseCommentaryDelay(item);
    this.scheduleNextCommentary(this.scaleCommentaryDelay(baseDelay), baseDelay);
  }

  continueAfterHalfTime() {
    this.isHalfTime.set(false);
    this.commentaryPlaybackSpeed.set(this.pausedSpeed ?? 1);
    this.pausedSpeed = null;
    this.pausedCommentaryDelayMs = null;
    this.pausedCommentaryBaseDelayMs = null;
    // Continue from where we left off (don't reset index)
    this.startCommentaryFeed(false);
  }

  setCommentaryPlaybackSpeed(speed: number) {
    const clampedSpeed = Math.max(
      WatchGameComponent.MIN_SPEED,
      Math.min(speed, WatchGameComponent.MAX_SPEED)
    );

    const previousSpeed = this.commentaryPlaybackSpeed();
    if (Math.abs(previousSpeed - clampedSpeed) < 0.01) {
      return;
    }

    this.commentaryPlaybackSpeed.set(clampedSpeed);
    this.rescheduleCommentaryDelayAfterSpeedChange(previousSpeed, clampedSpeed);
  }

  toggleCommentaryPlayback() {
    if (this.isFinished() || this.isHalfTime() || !this.isSimulating()) {
      return;
    }

    if (this.commentaryPlaybackSpeed() === 0) {
      this.resumeCommentaryPlayback();
      return;
    }

    this.pauseCommentaryPlayback();
  }

  canToggleCommentaryPlayback(): boolean {
    return this.isSimulating() && !this.isFinished() && !this.isHalfTime();
  }

  toggleCommentaryExpanded() {
    this.isCommentaryExpanded.update((expanded) => {
      const nextExpanded = !expanded;
      if (nextExpanded) {
        this.commentaryAutoFollow.set(true);
        this.scrollCommentaryLogToLatest();
      }
      return nextExpanded;
    });
  }

  onCommentaryLogScroll(container: HTMLElement) {
    // Newest commentary is rendered at the top. Near-top means "follow live".
    this.commentaryAutoFollow.set(container.scrollTop <= 8);
  }

  private scrollCommentaryLogToLatest() {
    if (!this.isCommentaryExpanded() || !this.commentaryAutoFollow()) {
      return;
    }

    setTimeout(() => {
      if (this.commentaryLog) {
        this.commentaryLog.nativeElement.scrollTop = 0;
      }
    }, 0);
  }

  private stopCommentaryFeed() {
    if (this.commentaryTimer) {
      clearTimeout(this.commentaryTimer);
    }

    this.clearCommentaryTimerState();
  }

  private getBaseCommentaryDelay(item: CommentaryItem): number {
    if (item.importance === EventImportance.HIGH || item.importance === EventImportance.MEDIUM) {
      return WatchGameComponent.HIGH_IMPORTANCE_DELAY_MS;
    }

    return WatchGameComponent.DEFAULT_COMMENTARY_DELAY_MS;
  }

  private scaleCommentaryDelay(baseDelayMs: number): number {
    const speed = Math.max(this.commentaryPlaybackSpeed(), 0.1);
    const scaledDelay = Math.round(baseDelayMs / speed);
    return Math.max(WatchGameComponent.MIN_COMMENTARY_DELAY_MS, scaledDelay);
  }

  private pauseCommentaryPlayback() {
    if (this.commentaryPlaybackSpeed() === 0) {
      return;
    }

    this.pausedSpeed = this.commentaryPlaybackSpeed();
    this.commentaryPlaybackSpeed.set(0);

    if (!this.commentaryTimer || this.commentaryTimerDelayMs === null || this.commentaryTimerStartedAt === null) {
      return;
    }

    const elapsedMs = Math.max(0, Date.now() - this.commentaryTimerStartedAt);
    const remainingMs = Math.max(0, this.commentaryTimerDelayMs - elapsedMs);
    this.pausedCommentaryDelayMs = remainingMs;
    this.pausedCommentaryBaseDelayMs = this.commentaryTimerBaseDelayMs;
    clearTimeout(this.commentaryTimer);
    this.clearCommentaryTimerState();
  }

  private resumeCommentaryPlayback() {
    if (this.commentaryPlaybackSpeed() > 0) {
      return;
    }

    this.commentaryPlaybackSpeed.set(this.pausedSpeed ?? 1);
    this.pausedSpeed = null;

    if (this.commentaryTimer || this.isHalfTime() || this.isFinished()) {
      return;
    }

    const delayMs = this.pausedCommentaryDelayMs ?? this.scaleCommentaryDelay(WatchGameComponent.RESUME_DELAY_MS);
    const baseDelayMs = this.pausedCommentaryBaseDelayMs ?? WatchGameComponent.RESUME_DELAY_MS;
    this.pausedCommentaryDelayMs = null;
    this.pausedCommentaryBaseDelayMs = null;
    this.scheduleNextCommentary(delayMs, baseDelayMs);
  }

  private rescheduleCommentaryDelayAfterSpeedChange(previousSpeed: number, nextSpeed: number) {
    if (this.commentaryPlaybackSpeed() === 0) {
      if (this.pausedCommentaryBaseDelayMs === null || this.pausedCommentaryDelayMs === null) {
        return;
      }

      const previousTotalDelay = Math.max(
        WatchGameComponent.MIN_COMMENTARY_DELAY_MS,
        Math.round(this.pausedCommentaryBaseDelayMs / Math.max(previousSpeed, 0.1))
      );
      const elapsedBeforePause = Math.max(0, previousTotalDelay - this.pausedCommentaryDelayMs);
      const nextTotalDelay = this.scaleCommentaryDelay(this.pausedCommentaryBaseDelayMs);
      this.pausedCommentaryDelayMs = Math.max(0, nextTotalDelay - elapsedBeforePause);
      return;
    }

    if (!this.commentaryTimer || this.commentaryTimerStartedAt === null || this.commentaryTimerBaseDelayMs === null) {
      return;
    }

    const elapsedMs = Math.max(0, Date.now() - this.commentaryTimerStartedAt);
    const nextTotalDelay = Math.max(
      WatchGameComponent.MIN_COMMENTARY_DELAY_MS,
      Math.round(this.commentaryTimerBaseDelayMs / Math.max(nextSpeed, 0.1))
    );
    const remainingMs = Math.max(0, nextTotalDelay - elapsedMs);
    const baseDelayMs = this.commentaryTimerBaseDelayMs;
    clearTimeout(this.commentaryTimer);
    this.clearCommentaryTimerState();
    this.scheduleNextCommentary(remainingMs, baseDelayMs);
  }

  private clearCommentaryTimerState() {
    this.commentaryTimer = null;
    this.commentaryTimerStartedAt = null;
    this.commentaryTimerDelayMs = null;
    this.commentaryTimerBaseDelayMs = null;
  }

  private finishMatch() {
    this.stopCommentaryFeed();
    this.gameService.endSingleMatchSimulationSession();
    this.isSimulating.set(false);
    this.isFinished.set(true);
    this.commentaryPlaybackSpeed.set(1);
    this.pausedSpeed = null;
    this.pausedCommentaryDelayMs = null;
    this.pausedCommentaryBaseDelayMs = null;
    this.showStats.set(true);
    this.clearActiveEventState();

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

      // Keep the final on-pitch shape stable after completion without replaying key events repeatedly.
      this.finalFormationSnapshotKey = `${match.id}:${this.finalKeyEvents.length}`;
    }
  }

  private buildPlayerTeamLookup(homeTeamId: string, awayTeamId: string) {
    this.playerTeamLookup.clear();

    this.gameService.getPlayersForTeam(homeTeamId).forEach((player) => {
      this.playerTeamLookup.set(player.id, TeamSide.HOME);
    });

    this.gameService.getPlayersForTeam(awayTeamId).forEach((player) => {
      this.playerTeamLookup.set(player.id, TeamSide.AWAY);
    });
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
        if (scoringTeam === TeamSide.HOME) {
          homeGoals++;
        } else if (scoringTeam === TeamSide.AWAY) {
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

  private getScoringTeam(event: PlayByPlayEvent, homeTeam: Team, awayTeam: Team): TeamSide | null {
    const scorerId = event.playerIds[0];
    if (!scorerId) {
      return null;
    }

    const cachedTeam = this.playerTeamLookup.get(scorerId);
    if (cachedTeam) {
      return cachedTeam;
    }

    const scorer = this.gameService.getPlayer(scorerId);
    if (!scorer) {
      return null;
    }

    if (scorer.teamId === homeTeam.id) {
      this.playerTeamLookup.set(scorerId, TeamSide.HOME);
      return TeamSide.HOME;
    }

    if (scorer.teamId === awayTeam.id) {
      this.playerTeamLookup.set(scorerId, TeamSide.AWAY);
      return TeamSide.AWAY;
    }

    return null;
  }

  private getEventTeamSide(event: Pick<PlayByPlayEvent, 'playerIds'>, homeTeam: Team, awayTeam: Team): TeamSide | null {
    const actorId = event.playerIds[0];
    return this.getTeamSideForPlayerId(actorId, homeTeam, awayTeam);
  }

  private getTeamSideForPlayerId(actorId: string | undefined, homeTeam: Team, awayTeam: Team): TeamSide | null {
    if (!actorId) {
      return null;
    }

    const cachedTeam = this.playerTeamLookup.get(actorId);
    if (cachedTeam) {
      return cachedTeam;
    }

    const actor = this.gameService.getPlayer(actorId);
    if (!actor) {
      return null;
    }

    if (actor.teamId === homeTeam.id) {
      this.playerTeamLookup.set(actorId, TeamSide.HOME);
      return TeamSide.HOME;
    }

    if (actor.teamId === awayTeam.id) {
      this.playerTeamLookup.set(actorId, TeamSide.AWAY);
      return TeamSide.AWAY;
    }

    return null;
  }

  private applyFinalFormationFromEvents(match: Match, homeTeam: Team, awayTeam: Team): void {
    const formationRelevantTypes = new Set<EventType>([
      EventType.SUBSTITUTION,
      EventType.GOAL,
      EventType.YELLOW_CARD,
      EventType.RED_CARD
    ]);
    const events = [...(match.keyEvents ?? [])]
      .filter((event) => formationRelevantTypes.has(event.type))
      .sort((left, right) => left.time - right.time);

    for (const event of events) {
      if (!event.playerIds?.length) {
        continue;
      }

      const teamSide = this.getTeamSideForPlayerId(event.playerIds[0], homeTeam, awayTeam);
      if (!teamSide) {
        continue;
      }

      this.applyCommentaryPitchState({
        id: event.id,
        minute: event.time,
        text: '',
        type: event.type,
        importance: event.importance,
        location: event.location ?? null,
        teamSide,
        playerIds: [...event.playerIds],
        additionalData: event.additionalData,
        isNew: false
      });
    }
  }

  private buildFormationDots(homeTeam: Team, awayTeam: Team) {
    this.homeTeamColor.set(this.getTeamColor(homeTeam));
    this.awayTeamColor.set(this.getTeamColor(awayTeam));
    this.homeFormationDots.set(this.buildDotsForTeam(homeTeam, TeamSide.HOME, false));
    this.awayFormationDots.set(this.buildDotsForTeam(awayTeam, TeamSide.AWAY, true));
    this.homeRemovedPlayers.set(new Map());
    this.awayRemovedPlayers.set(new Map());
  }

  getPitchPoint(coords: Coordinates, teamSide?: TeamSide): PitchPoint {
    const left = 100 - coords.x;
    let top: number;

    if (teamSide === TeamSide.AWAY) {
      top = 50 + coords.y / 2;
    } else {
      top = coords.y / 2;
    }

    return { left, top };
  }

  private buildDotsForTeam(team: Team, teamSide: TeamSide, mirrorYAxis: boolean): FormationDot[] {
    const formation = this.fieldService.assignPlayersToFormation(team);
    if (!formation) {
      return [];
    }

    const playersById = new Map(this.gameService.getPlayersForTeam(team.id).map((player) => [player.id, player]));

    return formation.positions
      .map((position, index) => {
        const player = playersById.get(position.playerId);
        const label = player?.name ?? position.role;
        const y = mirrorYAxis ? 100 - position.coordinates.y : position.coordinates.y;

        return {
          id: `${team.id}-${position.slotId}`,
          slotId: position.slotId,
          slotLabel: position.role,
          tacticOrder: index,
          teamSide,
          playerId: position.playerId,
          label: this.toInitials(label),
          fullName: label,
          x: position.coordinates.x,
          y,
          minuteEntered: 0,
          goalMinutes: [],
          yellowCardMinutes: [],
          redCards: 0,
        };
      })
      .sort((left, right) => left.y - right.y);
  }

  isDotInvolved(dot: FormationDot): boolean {
    return this.activeEventPlayerIds().includes(dot.playerId);
  }

  isDotInitiator(dot: FormationDot): boolean {
    const initiatorId = this.activeEventInitiatorPlayerId();
    return !!initiatorId && dot.playerId === initiatorId;
  }

  isDotSupportingParticipant(dot: FormationDot): boolean {
    return this.isDotInvolved(dot) && !this.isDotInitiator(dot);
  }

  getDotFatigue(dot: FormationDot): number {
    const trackedFatigue = this.getTrackedFatigue(dot.playerId);
    if (trackedFatigue !== null) {
      return trackedFatigue;
    }

    const player = this.gameService.getPlayer(dot.playerId);
    if (!player) {
      return 100;
    }

    // Fallback for legacy states without fatigue snapshots.
    const minutesOnPitch = Math.max(0, this.currentMinute() - dot.minuteEntered);
    const fallbackRatePerMinute = player.position === 'GK' ? 0.003 : 0.5;
    const fatigueLoad = this.clampNumber(Math.round(minutesOnPitch * fallbackRatePerMinute), 0, 100);
    return this.clampNumber(100 - fatigueLoad, 0, 100);
  }

  private getTrackedFatigue(playerId: string): number | null {
    const timeline = this.matchState()?.fatigueTimeline;
    if (!timeline) {
      return null;
    }

    const currentMinute = Math.max(0, Math.floor(this.currentMinute()));
    const relevantSnapshots = timeline
      .filter((snapshot) => snapshot.minute <= currentMinute)
      .sort((left, right) => right.minute - left.minute);

    for (const snapshot of relevantSnapshots) {
      const playerSnapshot = this.findPlayerFatigueSnapshot(snapshot, playerId);
      if (playerSnapshot !== null) {
        return playerSnapshot;
      }
    }

    return null;
  }

  private findPlayerFatigueSnapshot(snapshot: MinuteFatigueSnapshot, playerId: string): number | null {
    const playerEntry = snapshot.players.find((entry) => entry.playerId === playerId);
    if (!playerEntry) {
      return null;
    }

    return this.clampNumber(Math.round(playerEntry.stamina), 0, 100);
  }

  getRedCardBadge(dot: FormationDot): string | null {
    if (dot.redCards <= 0) {
      return null;
    }

    return dot.redCards > 1 ? `R${dot.redCards}` : 'R';
  }

  getGoalBadgeTitle(minute: number): string {
    if (typeof minute === 'number' && Number.isFinite(minute)) {
      return `${minute}'`;
    }

    return 'Goal scored';
  }

  getYellowCardBadgeTitle(minute: number): string {
    if (typeof minute === 'number' && Number.isFinite(minute)) {
      return `${minute}'`;
    }

    return 'Yellow card issued';
  }

  getSubstitutedOnBadgeTitle(minute: number): string {
    if (typeof minute === 'number' && Number.isFinite(minute) && minute > 0) {
      return `${minute}'`;
    }

    return 'Substituted on';
  }

  getTeamLineup(side: TeamSide): TeamLineupEntry[] {
    const team = side === TeamSide.HOME ? this.homeTeam() : this.awayTeam();
    if (!team) {
      return [];
    }

    const onFieldDots = side === TeamSide.HOME ? this.homeFormationDots() : this.awayFormationDots();
    const onFieldByPlayerId = new Map(onFieldDots.map((dot) => [dot.playerId, dot]));
    const removedPlayers = side === TeamSide.HOME ? this.homeRemovedPlayers() : this.awayRemovedPlayers();

    return this.gameService
      .getPlayersForTeam(team.id)
      .filter((player) => player.role !== Role.RESERVE)
      .map((player: Player) => {
        const dot = onFieldByPlayerId.get(player.id);
        const removed = removedPlayers.get(player.id);
        let playerStatus: Role;
        let fatigue: number;

        if (dot) {
          playerStatus = Role.STARTER;
          fatigue = this.getDotFatigue(dot);
        } else if (removed) {
          playerStatus = removed.status;
          fatigue = removed.fatigue;
        } else {
          playerStatus = Role.BENCH;
          fatigue = 100;
        }

        return {
          playerId: player.id,
          slotLabel: dot?.slotLabel ?? null,
          tacticOrder: dot?.tacticOrder ?? 999,
          role: player.position,
          name: player.name,
          onField: !!dot,
          fatigue,
          playerStatus,
        };
      })
      .sort((left, right) => {
        if (left.onField !== right.onField) {
          return left.onField ? -1 : 1;
        }

        if (left.onField && right.onField) {
          const tacticOrderDiff = left.tacticOrder - right.tacticOrder;
          if (tacticOrderDiff !== 0) {
            return tacticOrderDiff;
          }
        }

        const roleOrderDiff = this.getRoleSortOrder(left.role) - this.getRoleSortOrder(right.role);
        if (roleOrderDiff !== 0) {
          return roleOrderDiff;
        }

        return left.name.localeCompare(right.name);
      });
  }

  getOnFieldLineup(side: TeamSide): TeamLineupEntry[] {
    return this.getTeamLineup(side).filter((entry) => entry.onField);
  }

  getBenchLineup(side: TeamSide): TeamLineupEntry[] {
    return this.getTeamLineup(side).filter((entry) => !entry.onField);
  }

  getLineupBarColor(fatigue: number): string {
    if (fatigue >= this.HIGH_FATIGUE_THRESHOLD) {
      return this.HIGH_FATIGUE_BAR_COLOR;
    }

    if (fatigue >= this.MEDIUM_FATIGUE_THRESHOLD) {
      return this.MEDIUM_FATIGUE_BAR_COLOR;
    }

    return this.LOW_FATIGUE_BAR_COLOR;
  }

  getSlotLabelInitials(label: string | null): string {
    if (!label) {
      return '';
    }

    const words = label.match(/[A-Za-z]+/g) ?? [];
    return words
      .map((word) => word[0])
      .join('')
      .toUpperCase();
  }

  private getTeamColor(team: Team): string {
    return this.teamColorsService.getPalette(team.name).solidHex;
  }

  private clearFinalFormationSnapshotKey() {
    this.finalFormationSnapshotKey = '';
  }

  private clearActiveEventState() {
    this.activeEventLocation.set(null);
    this.activeEventTeamSide.set(null);
    this.activeEventPlayerIds.set([]);
    this.activeEventInitiatorPlayerId.set(null);
    this.currentCommentaryItem.set(null);
  }

  private applyCommentaryPitchState(item: CommentaryItem) {
    if (item.type === EventType.SUBSTITUTION && item.playerIds.length >= 2 && item.teamSide) {
      const snapshot = this.getFormationSnapshot(item);
      if (snapshot) {
        this.applyFormationSnapshot(snapshot, item.teamSide, item.minute);
        return;
      }

      console.error('Missing formation snapshot for substitution event', item.id);
      return;
    }

    const primaryPlayerId = item.playerIds[0];
    if (!primaryPlayerId || !item.teamSide) {
      return;
    }

    switch (item.type) {
      case EventType.GOAL:
        this.recordGoalForDot(item.teamSide, primaryPlayerId, item.minute);
        break;
      case EventType.YELLOW_CARD:
        this.recordYellowCardForDot(item.teamSide, primaryPlayerId, item.minute);
        break;
      case EventType.RED_CARD:
        this.incrementDotCounter(item.teamSide, primaryPlayerId, 'redCards');
        this.dismissPlayerFromPitch(item.teamSide, primaryPlayerId);
        break;
    }
  }

  private dismissPlayerFromPitch(teamSide: TeamSide, playerId: string) {
    const currentDots = teamSide === TeamSide.HOME ? this.homeFormationDots() : this.awayFormationDots();
    const dot = currentDots.find((d) => d.playerId === playerId);
    if (!dot) {
      return;
    }

    const fatigue = this.getDotFatigue(dot);
    const removedSignal = teamSide === TeamSide.HOME ? this.homeRemovedPlayers : this.awayRemovedPlayers;
    removedSignal.update((m) => new Map([...m, [playerId, { status: Role.DISMISSED, fatigue }]]));

    const targetSignal = teamSide === TeamSide.HOME ? this.homeFormationDots : this.awayFormationDots;
    targetSignal.update((dots) => dots.filter((d) => d.playerId !== playerId));
  }

  private incrementDotCounter(teamSide: TeamSide, playerId: string, field: 'redCards') {
    this.updateDotsForTeam(teamSide, (dot) => {
      if (dot.playerId !== playerId) {
        return dot;
      }

      return {
        ...dot,
        [field]: dot[field] + 1
      };
    });
  }

  private recordGoalForDot(teamSide: TeamSide, playerId: string, minute: number) {
    this.updateDotsForTeam(teamSide, (dot) => {
      if (dot.playerId !== playerId) {
        return dot;
      }

      return {
        ...dot,
        goalMinutes: [...dot.goalMinutes, minute],
      };
    });
  }

  private recordYellowCardForDot(teamSide: TeamSide, playerId: string, minute: number) {
    this.updateDotsForTeam(teamSide, (dot) => {
      if (dot.playerId !== playerId) {
        return dot;
      }

      return {
        ...dot,
        yellowCardMinutes: [...dot.yellowCardMinutes, minute],
      };
    });
  }

  private getFormationSnapshot(item: CommentaryItem): VariantBMatchShapeSnapshot | null {
    return item.additionalData?.formationSnapshot ?? null;
  }

  private applyFormationSnapshot(snapshot: VariantBMatchShapeSnapshot, teamSide: TeamSide, minute: number) {
    const team = teamSide === TeamSide.HOME ? this.homeTeam() : this.awayTeam();
    if (!team) {
      return;
    }

    const mirrorYAxis = teamSide === TeamSide.AWAY;
    const templateDots = this.buildDotsForTeam(team, teamSide, mirrorYAxis);
    const templateBySlotId = new Map(templateDots.map((dot) => [dot.slotId, dot]));
    const previousDots = teamSide === TeamSide.HOME ? this.homeFormationDots() : this.awayFormationDots();
    const previousByPlayerId = new Map(previousDots.map((dot) => [dot.playerId, dot]));
    const removedSignal = teamSide === TeamSide.HOME ? this.homeRemovedPlayers : this.awayRemovedPlayers;

    const slots = teamSide === TeamSide.HOME ? snapshot.home : snapshot.away;

    const nextDots: FormationDot[] = [];
    slots.forEach((slot: VariantBShapeSlotSnapshot) => {
      if (!slot.playerId) {
        return;
      }

      const templateDot = templateBySlotId.get(slot.slotId);
      if (!templateDot) {
        return;
      }

      const player = this.gameService.getPlayer(slot.playerId);
      const previousDot = previousByPlayerId.get(slot.playerId);
      const fullName = player?.name ?? templateDot.fullName;

      nextDots.push({
        ...templateDot,
        x: slot.coordinates.x,
        y: mirrorYAxis ? 100 - slot.coordinates.y : slot.coordinates.y,
        slotLabel: slot.role,
        playerId: slot.playerId,
        label: this.toInitials(fullName),
        fullName,
        minuteEntered: previousDot?.minuteEntered ?? minute,
        goalMinutes: previousDot?.goalMinutes ?? [],
        yellowCardMinutes: previousDot?.yellowCardMinutes ?? [],
        redCards: previousDot?.redCards ?? 0,
      });
    });

    const activePlayerIds = new Set(nextDots.map((dot) => dot.playerId));
    removedSignal.update((removed) => {
      const nextRemoved = new Map(removed);

      previousDots.forEach((dot) => {
        if (activePlayerIds.has(dot.playerId)) {
          return;
        }

        const existing = nextRemoved.get(dot.playerId);
        if (existing?.status === Role.DISMISSED) {
          return;
        }

        nextRemoved.set(dot.playerId, {
          status: Role.SUBSTITUTED_OUT,
          fatigue: this.getDotFatigue(dot)
        });
      });

      activePlayerIds.forEach((playerId) => {
        if (nextRemoved.has(playerId)) {
          nextRemoved.delete(playerId);
        }
      });
      return nextRemoved;
    });

    const targetSignal = teamSide === TeamSide.HOME ? this.homeFormationDots : this.awayFormationDots;
    targetSignal.set(nextDots.sort((left, right) => left.y - right.y));
  }

  private updateDotsForTeam(teamSide: TeamSide, updater: (dot: FormationDot) => FormationDot) {
    const targetSignal = teamSide === TeamSide.HOME ? this.homeFormationDots : this.awayFormationDots;
    targetSignal.update((dots) => dots.map(updater));
  }

  private toInitials(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) {
      return '?';
    }

    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  private clampNumber(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private getRoleSortOrder(role: string): number {
    switch (role) {
      case 'GK':
        return 0;
      case 'DEF':
        return 1;
      case 'MID':
        return 2;
      case 'FWD':
        return 3;
      default:
        return 99;
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