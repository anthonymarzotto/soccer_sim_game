import { TestBed } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { convertToParamMap, provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { WatchGameComponent } from './watch-game';
import { EventImportance, EventType, TeamSide, MatchPhase } from '../../models/enums';
import { GameService } from '../../services/game.service';
import { CommentaryService } from '../../services/commentary.service';
import { FieldService } from '../../services/field.service';
import { TeamColorsService } from '../../services/team-colors.service';
import { MatchState } from '../../models/simulation.types';
import { Player } from '../../models/types';
import { vi } from 'vitest';

describe('WatchGameComponent', () => {
  const createMatchState = (fatigueTimeline: MatchState['fatigueTimeline']): MatchState => ({
    ballPossession: {
      teamId: 'home',
      playerWithBall: 'player-1',
      location: { x: 50, y: 50 },
      phase: MatchPhase.BUILD_UP,
      passes: 0,
      timeElapsed: 0
    },
    events: [],
    fatigueTimeline,
    currentMinute: 0,
    homeScore: 0,
    awayScore: 0,
    homeShots: 0,
    awayShots: 0,
    homeShotsOnTarget: 0,
    awayShotsOnTarget: 0,
    homePossession: 50,
    awayPossession: 50,
    homeCorners: 0,
    awayCorners: 0,
    homeFouls: 0,
    awayFouls: 0,
    homeYellowCards: 0,
    awayYellowCards: 0,
    homeRedCards: 0,
    awayRedCards: 0
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WatchGameComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({})
            }
          }
        },
        {
          provide: GameService,
          useValue: {
            league: () => null,
            endSingleMatchSimulationSession: () => undefined,
            getPlayersForTeam: () => [],
            getPlayer: () => null,
            getTeam: () => null,
            isSimulatingMatchWeek: () => false,
            beginSingleMatchSimulationSession: () => undefined,
            getFormationValidationErrors: () => [],
            simulateMatchWithDetails: () => null
          }
        },
        {
          provide: CommentaryService,
          useValue: {
            generateStartingXICommentary: () => [],
            generateEventCommentary: () => 'Event',
            generateHalfTimeCommentary: () => 'Half Time',
            generateFullTimeCommentary: () => 'Full Time'
          }
        },
        {
          provide: FieldService,
          useValue: {
            assignPlayersToFormation: () => ({ positions: [] })
          }
        },
        {
          provide: TeamColorsService,
          useValue: {
            getTeamColors: () => ({ main: '#0ea5e9', accent: '#f43f5e' })
          }
        }
      ]
    });
  });

  it('updates currentCommentaryItem as replay advances across consecutive non-halftime items', () => {
    const fixture = TestBed.createComponent(WatchGameComponent);
    const component = fixture.componentInstance;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scheduleSpy = vi.spyOn(component as any, 'scheduleNextCommentary').mockImplementation(() => undefined);

    component['allCommentary'] = [
      {
        id: 'event-1',
        minute: 12,
        text: "12': A low pass splits the lines.",
        type: EventType.PASS,
        importance: EventImportance.LOW,
        location: null,
        teamSide: null,
        playerIds: [],
        isNew: false
      },
      {
        id: 'event-2',
        minute: 14,
        text: "14': A diagonal switch opens the wing.",
        type: EventType.PASS,
        importance: EventImportance.LOW,
        location: null,
        teamSide: null,
        playerIds: [],
        isNew: false
      }
    ];
    component['commentaryIndex'] = 0;
    component['halfTimeIndex'] = -1;

    component['addNextCommentary']();
    expect(component.currentCommentaryItem()?.id).toBe('event-1');

    component['addNextCommentary']();
    expect(component.currentCommentaryItem()?.id).toBe('event-2');
    expect(component['commentaryIndex']).toBe(2);

    scheduleSpy.mockRestore();
  });

  it('clears currentCommentaryItem and enters halftime when hitting halftime index', () => {
    const fixture = TestBed.createComponent(WatchGameComponent);
    const component = fixture.componentInstance;

    component.currentCommentaryItem.set({
      id: 'old',
      minute: 5,
      text: "5': Previous line",
      type: EventType.PASS,
      importance: EventImportance.LOW,
      location: null,
      teamSide: TeamSide.HOME,
      playerIds: ['p1'],
      isNew: false
    });

    component['allCommentary'] = [
      {
        id: 'halftime',
        minute: 45,
        text: 'Half Time',
        type: EventType.PASS,
        importance: EventImportance.MEDIUM,
        location: null,
        teamSide: null,
        playerIds: [],
        isNew: false
      }
    ];
    component['commentaryIndex'] = 0;
    component['halfTimeIndex'] = 0;

    component['addNextCommentary']();

    expect(component.currentCommentaryItem()).toBeNull();
    expect(component.isHalfTime()).toBe(true);
  });

  it('toggles commentary expanded state and resets auto-follow to true when expanding', () => {
    const fixture = TestBed.createComponent(WatchGameComponent);
    const component = fixture.componentInstance;

    component.isCommentaryExpanded.set(false);
    component.commentaryAutoFollow.set(false);

    component.toggleCommentaryExpanded();

    expect(component.isCommentaryExpanded()).toBe(true);
    expect(component.commentaryAutoFollow()).toBe(true);

    component.toggleCommentaryExpanded();

    expect(component.isCommentaryExpanded()).toBe(false);
  });

  it('invokes scroll-to-latest when expanding and does not invoke when collapsing', () => {
    const fixture = TestBed.createComponent(WatchGameComponent);
    const component = fixture.componentInstance;

    component.isCommentaryExpanded.set(false);

    // When expanding, scrollCommentaryLogToLatest should be called
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scrollSpy = vi.spyOn(component as any, 'scrollCommentaryLogToLatest').mockImplementation(() => undefined);

    component.toggleCommentaryExpanded();

    expect(scrollSpy).toHaveBeenCalledOnce();
    expect(component.isCommentaryExpanded()).toBe(true);

    scrollSpy.mockClear();

    // When collapsing, scrollCommentaryLogToLatest should NOT be called
    component.toggleCommentaryExpanded();

    expect(scrollSpy).not.toHaveBeenCalled();
    expect(component.isCommentaryExpanded()).toBe(false);

    scrollSpy.mockRestore();
  });

  it('updates auto-follow based on log scroll position', () => {
    const fixture = TestBed.createComponent(WatchGameComponent);
    const component = fixture.componentInstance;

    const nearTop = { scrollTop: 4 } as HTMLElement;
    component.onCommentaryLogScroll(nearTop);
    expect(component.commentaryAutoFollow()).toBe(true);

    const awayFromTop = { scrollTop: 32 } as HTMLElement;
    component.onCommentaryLogScroll(awayFromTop);
    expect(component.commentaryAutoFollow()).toBe(false);
  });

  it('sets commentaryAutoFollow to true when scrollTop is at or near top edge (threshold <= 8)', () => {
    const fixture = TestBed.createComponent(WatchGameComponent);
    const component = fixture.componentInstance;

    // scrollTop at 0 should enable auto-follow
    component.onCommentaryLogScroll({ scrollTop: 0 } as HTMLElement);
    expect(component.commentaryAutoFollow()).toBe(true);

    // scrollTop at 4 (middle of threshold) should enable auto-follow
    component.onCommentaryLogScroll({ scrollTop: 4 } as HTMLElement);
    expect(component.commentaryAutoFollow()).toBe(true);

    // scrollTop at 8 (boundary, inclusive) should enable auto-follow
    component.onCommentaryLogScroll({ scrollTop: 8 } as HTMLElement);
    expect(component.commentaryAutoFollow()).toBe(true);
  });

  it('sets commentaryAutoFollow to false when scrollTop exceeds threshold (> 8)', () => {
    const fixture = TestBed.createComponent(WatchGameComponent);
    const component = fixture.componentInstance;

    // scrollTop at 9 (just over threshold) should disable auto-follow
    component.onCommentaryLogScroll({ scrollTop: 9 } as HTMLElement);
    expect(component.commentaryAutoFollow()).toBe(false);

    // scrollTop at 100 (far from top) should disable auto-follow
    component.onCommentaryLogScroll({ scrollTop: 100 } as HTMLElement);
    expect(component.commentaryAutoFollow()).toBe(false);
  });

  it('scrolls commentary log to newest at halftime when expanded and auto-follow is enabled', async () => {
    const fixture = TestBed.createComponent(WatchGameComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.isCommentaryExpanded.set(true);
    component.commentaryAutoFollow.set(true);

    component['allCommentary'] = [
      {
        id: 'halftime',
        minute: 45,
        text: 'Half Time',
        type: EventType.PASS,
        importance: EventImportance.MEDIUM,
        location: null,
        teamSide: null,
        playerIds: [],
        isNew: false
      }
    ];
    component['commentaryIndex'] = 0;
    component['halfTimeIndex'] = 0;

    const mockLogElement = { scrollTop: 64 } as HTMLElement;
    component.commentaryLog = new ElementRef(mockLogElement);

    component['addNextCommentary']();

    // Wait for the setTimeout in scrollCommentaryLogToLatest to execute
    await new Promise((resolve) => setTimeout(resolve, 25));

    // Verify that scrollTop was set to 0
    expect(mockLogElement.scrollTop).toBe(0);
  });

  it('keeps playback paused and updates pausedSpeed when speed changes while paused', () => {
    const fixture = TestBed.createComponent(WatchGameComponent);
    const component = fixture.componentInstance;

    component.commentaryPlaybackSpeed.set(0);
    component['pausedSpeed'] = 1.4;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rescheduleSpy = vi.spyOn(component as any, 'rescheduleCommentaryDelayAfterSpeedChange').mockImplementation(() => undefined);

    component.setCommentaryPlaybackSpeed(2.2);

    expect(component.commentaryPlaybackSpeed()).toBe(0);
    expect(component['pausedSpeed']).toBe(2.2);
    expect(rescheduleSpy).toHaveBeenCalledOnce();
    expect(rescheduleSpy).toHaveBeenCalledWith(1.4, 2.2);

    rescheduleSpy.mockRestore();
  });

  it('rescales paused remaining delay without scheduling a timer when paused speed changes', () => {
    const fixture = TestBed.createComponent(WatchGameComponent);
    const component = fixture.componentInstance;

    component.commentaryPlaybackSpeed.set(0);
    component['pausedSpeed'] = 1;
    component['pausedCommentaryBaseDelayMs'] = 1000;
    component['pausedCommentaryDelayMs'] = 700;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scheduleSpy = vi.spyOn(component as any, 'scheduleNextCommentary').mockImplementation(() => undefined);

    component.setCommentaryPlaybackSpeed(2);

    expect(component.commentaryPlaybackSpeed()).toBe(0);
    expect(component['pausedSpeed']).toBe(2);
    expect(component['pausedCommentaryDelayMs']).toBe(200);
    expect(component['commentaryTimer']).toBeNull();
    expect(scheduleSpy).not.toHaveBeenCalled();

    scheduleSpy.mockRestore();
  });

  it('preserves selected playback speed when continuing after halftime', () => {
    const fixture = TestBed.createComponent(WatchGameComponent);
    const component = fixture.componentInstance;

    component.isHalfTime.set(true);
    component.commentaryPlaybackSpeed.set(2.6);
    component['pausedSpeed'] = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const startFeedSpy = vi.spyOn(component as any, 'startCommentaryFeed').mockImplementation(() => undefined);

    component.continueAfterHalfTime();

    expect(component.isHalfTime()).toBe(false);
    expect(component.commentaryPlaybackSpeed()).toBe(2.6);
    expect(startFeedSpy).toHaveBeenCalledOnce();
    expect(startFeedSpy).toHaveBeenCalledWith(false);

    startFeedSpy.mockRestore();
  });

  it('returns latest tracked fatigue snapshot at or before current minute', () => {
    const fixture = TestBed.createComponent(WatchGameComponent);
    const component = fixture.componentInstance;

    component.matchState.set(createMatchState([
      {
        minute: 10,
        players: [{ playerId: 'player-1', stamina: 91 }]
      },
      {
        minute: 20,
        players: [{ playerId: 'player-1', stamina: 84 }]
      },
      {
        minute: 30,
        players: [{ playerId: 'player-1', stamina: 77 }]
      }
    ]));
    component.currentMinute.set(27);

    const fatigue = component['getTrackedFatigue']('player-1');

    expect(fatigue).toBe(84);
  });

  it('floors current minute when reading tracked fatigue snapshots', () => {
    const fixture = TestBed.createComponent(WatchGameComponent);
    const component = fixture.componentInstance;

    component.matchState.set(createMatchState([
      {
        minute: 45,
        players: [{ playerId: 'player-1', stamina: 70 }]
      },
      {
        minute: 46,
        players: [{ playerId: 'player-1', stamina: 64 }]
      }
    ]));
    component.currentMinute.set(45.9);

    const fatigue = component['getTrackedFatigue']('player-1');

    expect(fatigue).toBe(70);
  });

  it('keeps scanning older snapshots when latest eligible minute lacks player entry', () => {
    const fixture = TestBed.createComponent(WatchGameComponent);
    const component = fixture.componentInstance;

    component.matchState.set(createMatchState([
      {
        minute: 40,
        players: [{ playerId: 'player-1', stamina: 73 }]
      },
      {
        minute: 50,
        players: [{ playerId: 'other-player', stamina: 68 }]
      }
    ]));
    component.currentMinute.set(50);

    const fatigue = component['getTrackedFatigue']('player-1');

    expect(fatigue).toBe(73);
  });

  it('uses dot fatigue fallback formula when timeline has no player snapshot', () => {
    const fixture = TestBed.createComponent(WatchGameComponent);
    const component = fixture.componentInstance;

    component.matchState.set(createMatchState([]));
    component.currentMinute.set(30);
    vi.spyOn(component.gameService, 'getPlayer').mockReturnValue({ position: 'MID' } as unknown as Player);

    const fatigue = component.getDotFatigue({
      id: 'home-slot-1',
      slotId: 'slot-1',
      slotLabel: 'CM',
      tacticOrder: 1,
      teamSide: TeamSide.HOME,
      playerId: 'player-1',
      label: 'P1',
      fullName: 'Player One',
      x: 50,
      y: 50,
      minuteEntered: 10,
      goalMinutes: [],
      yellowCardMinutes: [],
      redCards: 0
    });

    expect(fatigue).toBe(90);
  });
});
