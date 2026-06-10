import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { NewsComponent } from './news';
import { GameService } from '../../services/game.service';
import { League, SeasonTransitionLog, Team } from '../../models/types';

describe('NewsComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  function createGameServiceStub(overrides: {
    log?: SeasonTransitionLog | null,
    teams?: Partial<Team>[],
    userTeamId?: string,
    currentSeasonYear?: number
  } = {}) {
    const defaultLog: SeasonTransitionLog = {
      seasonYear: 2026,
      events: [
        {
          category: 'retirement',
          headline: 'John Smith Retires',
          detail: 'John Smith has announced retirement.',
          teamId: 't-1',
          playerIds: ['p-1'],
          isUserTeam: false
        },
        {
          category: 'retirement',
          headline: 'Bob Jones Retires',
          detail: 'Bob Jones has announced retirement.',
          teamId: 't-2',
          playerIds: ['p-2'],
          isUserTeam: true
        }
      ],
      isRead: false,
      dismissedTeamIds: []
    };

    const mockLeague = {
      currentSeasonYear: overrides.currentSeasonYear ?? 2027,
      userTeamId: overrides.userTeamId ?? 't-2',
      teams: overrides.teams ?? [
        {
          id: 't-1',
          name: 'Arsenal',
          players: [
            {
              id: 'p-3',
              name: 'Alice Cooper',
              transferHistory: [
                {
                  sellerTeamId: 't-2',
                  buyerTeamId: 't-1',
                  fee: 5000000,
                  seasonYear: overrides.currentSeasonYear ?? 2027,
                  week: 2
                }
              ]
            }
          ]
        },
        {
          id: 't-2',
          name: 'Chelsea',
          players: [
            {
              id: 'p-4',
              name: 'David Beckham',
              transferHistory: []
            }
          ]
        }
      ]
    };

    const logSignal = signal<SeasonTransitionLog | null>(overrides.log !== undefined ? overrides.log : defaultLog);
    const unreadLogSignal = signal<SeasonTransitionLog | null>(
      overrides.log !== undefined 
        ? (overrides.log && !overrides.log.isRead ? overrides.log : null)
        : defaultLog
    );

    return {
      league: signal<League | null>(mockLeague as unknown as League).asReadonly(),
      seasonTransitionLog: logSignal.asReadonly(),
      unreadSeasonTransitionLog: unreadLogSignal.asReadonly(),
      markSeasonTransitionLogRead: vi.fn(),
      dismissTeamTransitionEvents: vi.fn()
    } as unknown as Pick<
      GameService,
      'league' | 'seasonTransitionLog' | 'unreadSeasonTransitionLog' | 'markSeasonTransitionLogRead' | 'dismissTeamTransitionEvents'
    >;
  }

  it('correctly maps and sorts retirement events and current season transfers chronologically (newest first)', () => {
    const gameServiceStub = createGameServiceStub();

    TestBed.configureTestingModule({
      imports: [NewsComponent],
      providers: [
        provideRouter([]),
        { provide: GameService, useValue: gameServiceStub }
      ]
    });

    const fixture = TestBed.createComponent(NewsComponent);
    const component = fixture.componentInstance;

    // Trigger signals
    const items = component.allNewsItems();

    // Alice Cooper transfer: Season 2027, Week 2
    // Retirements: Transition into Season 2027 (Pre-season, week 0)
    expect(items.length).toBe(3);

    // Newest first: Season 2027 W2, then Season 2027 W0 (retirements)
    expect(items[0].category).toBe('transfer');
    expect(items[0].seasonYear).toBe(2027);
    expect(items[0].week).toBe(2);

    expect(items[1].category).toBe('retirement');
    expect(items[1].seasonYear).toBe(2027);
    expect(items[1].week).toBe(0);

    expect(items[2].category).toBe('retirement');
    expect(items[2].seasonYear).toBe(2027);
    expect(items[2].week).toBe(0);
  });

  it('filters news items by team ID correctly (matching buyer, seller, or retiree team)', () => {
    const gameServiceStub = createGameServiceStub();

    TestBed.configureTestingModule({
      imports: [NewsComponent],
      providers: [
        provideRouter([]),
        { provide: GameService, useValue: gameServiceStub }
      ]
    });

    const fixture = TestBed.createComponent(NewsComponent);
    const component = fixture.componentInstance;

    // Filter by Arsenal (t-1)
    component.setFilter('t-1');
    let visible = component.visibleItems();
    // Arsenal is buyer in Alice Cooper transfer (t-1). John Smith is retiree at Arsenal (t-1).
    // Total should be 2.
    expect(visible.length).toBe(2);
    expect(visible.map(v => v.id)).toContain('transfer-p-3-2027-2');
    expect(visible.map(v => v.id)).toContain('retirement-p-1-t-1');

    // Filter by Chelsea (t-2)
    component.setFilter('t-2');
    visible = component.visibleItems();
    // Chelsea is seller in Alice Cooper transfer (t-2). Bob Jones is retiree at Chelsea (t-2).
    // Total should be 2.
    expect(visible.length).toBe(2);
    expect(visible.map(v => v.id)).toContain('transfer-p-3-2027-2');
    expect(visible.map(v => v.id)).toContain('retirement-p-2-t-2');
  });

  it('dismisses all unread transition events when Mark All Read is clicked', () => {
    const gameServiceStub = createGameServiceStub();

    TestBed.configureTestingModule({
      imports: [NewsComponent],
      providers: [
        provideRouter([]),
        { provide: GameService, useValue: gameServiceStub }
      ]
    });

    const fixture = TestBed.createComponent(NewsComponent);
    const component = fixture.componentInstance;

    component.dismiss();
    expect(gameServiceStub.markSeasonTransitionLogRead).toHaveBeenCalled();
  });
});
