import { TestBed } from '@angular/core/testing';
import { ElementRef } from '@angular/core';
import { convertToParamMap, provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { WatchGameComponent } from './watch-game';
import { EventImportance, EventType, TeamSide } from '../../models/enums';
import { GameService } from '../../services/game.service';
import { CommentaryService } from '../../services/commentary.service';
import { FieldService } from '../../services/field.service';
import { TeamColorsService } from '../../services/team-colors.service';
import { vi } from 'vitest';

describe('WatchGameComponent', () => {
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
            getPalette: () => ({ solidHex: '#0ea5e9' })
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
});
