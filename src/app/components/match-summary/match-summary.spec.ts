import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatchSummaryComponent } from './match-summary';
import { GameService } from '../../services/game.service';
import { SettingsService } from '../../services/settings.service';
import { Match, MatchEvent } from '../../models/types';
import { EventImportance, EventType } from '../../models/enums';

describe('MatchSummaryComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MatchSummaryComponent],
      providers: [
        provideRouter([]),
        {
          provide: GameService,
          useValue: {
            getTeam: (id: string) => ({ id, name: id === 'home' ? 'Home FC' : 'Away FC' }),
            getTeamOverall: () => 75,
            getMatchProbabilities: () => ({ home: 40, draw: 30, away: 30 }),
            getPlayer: (id: string) => ({ id, name: id, teamId: id.startsWith('home-') ? 'home' : 'away' })
          }
        },
        {
          provide: SettingsService,
          useValue: {
            badgeStyle: () => 'text'
          }
        }
      ]
    });
  });

  it('shows only base key events by default and appends expanded moments when toggled', () => {
    const fixture = TestBed.createComponent(MatchSummaryComponent);
    const component = fixture.componentInstance;

    fixture.componentRef.setInput('match', createMatch({
      keyEvents: [
        createMoment('k1', EventType.GOAL, 12, EventImportance.HIGH),
        createMoment('k2', EventType.RED_CARD, 24, EventImportance.HIGH)
      ],
      expandedMoments: [
        createMoment('k1', EventType.GOAL, 12, EventImportance.HIGH),
        createMoment('x1', EventType.SUBSTITUTION, 67, EventImportance.LOW)
      ]
    }));
    fixture.componentRef.setInput('isLive', false);
    fixture.componentRef.setInput('showEvents', true);

    expect(component.visibleMoments().map(item => item.event.id)).toEqual(['k1', 'k2']);

    component.toggleExpandedMoments();
    expect(component.visibleMoments().map(item => item.event.id)).toEqual(['k1', 'k2', 'x1']);
  });

  it('de-duplicates expanded moments already present in base key events', () => {
    const fixture = TestBed.createComponent(MatchSummaryComponent);
    const component = fixture.componentInstance;

    fixture.componentRef.setInput('match', createMatch({
      keyEvents: [createMoment('k1', EventType.GOAL, 20, EventImportance.HIGH)],
      expandedMoments: [
        createMoment('k1', EventType.GOAL, 20, EventImportance.HIGH),
        createMoment('x2', EventType.SAVE, 21, EventImportance.MEDIUM)
      ]
    }));
    fixture.componentRef.setInput('isLive', false);

    component.toggleExpandedMoments();

    expect(component.visibleMoments().map(item => item.event.id)).toEqual(['k1', 'x2']);
  });

  it('filters both base and expanded moments by current minute in live mode', () => {
    const fixture = TestBed.createComponent(MatchSummaryComponent);
    const component = fixture.componentInstance;

    fixture.componentRef.setInput('match', createMatch({
      keyEvents: [
        createMoment('k-early', EventType.GOAL, 10, EventImportance.HIGH),
        createMoment('k-late', EventType.GOAL, 80, EventImportance.HIGH)
      ],
      expandedMoments: [
        createMoment('x-early', EventType.SUBSTITUTION, 30, EventImportance.LOW),
        createMoment('x-late', EventType.SUBSTITUTION, 75, EventImportance.LOW)
      ]
    }));
    fixture.componentRef.setInput('isLive', true);
    fixture.componentRef.setInput('currentMinute', 60);

    component.toggleExpandedMoments();

    expect(component.visibleMoments().map(item => item.event.id)).toEqual(['k-early', 'x-early']);
  });
});

function createMatch(input: { keyEvents: MatchEvent[]; expandedMoments: MatchEvent[] }): Match {
  return {
    id: 'm1',
    week: 1,
    homeTeamId: 'home',
    awayTeamId: 'away',
    homeScore: 1,
    awayScore: 0,
    played: true,
    keyEvents: input.keyEvents,
    matchReport: {
      matchId: 'm1',
      finalScore: '1-0',
      keyMoments: input.expandedMoments,
      tacticalAnalysis: {
        homeTeam: { possession: 50, shots: 5, corners: 2, fouls: 8, style: 'POSSESSION', effectiveness: 50 },
        awayTeam: { possession: 50, shots: 4, corners: 3, fouls: 9, style: 'COUNTER_ATTACK', effectiveness: 50 },
        tacticalBattle: 'Even'
      },
      playerPerformances: {
        homeTeam: {
          mvp: createPlayerStats('home-p1'),
          topPerformers: [],
          strugglers: [],
          averageRating: 7
        },
        awayTeam: {
          mvp: createPlayerStats('away-p1'),
          topPerformers: [],
          strugglers: [],
          averageRating: 6.8
        }
      },
      matchSummary: 'Summary'
    }
  };
}

function createMoment(id: string, type: EventType, time: number, importance: EventImportance): MatchEvent {
  return {
    id,
    type,
    time,
    description: `${type} at ${time}`,
    playerIds: ['home-p1'],
    icon: '•',
    importance,
    location: { x: 50, y: 50 }
  };
}

function createPlayerStats(playerId: string) {
  return {
    playerId,
    playerName: playerId,
    position: 'MID',
    rating: 7,
    goals: 0,
    assists: 0,
    shots: 0,
    passes: 0,
    tackles: 0,
    saves: 0,
    fouls: 0,
    yellowCards: 0,
    redCards: 0
  };
}
