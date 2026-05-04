import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { StandingsComponent } from './standings';
import { GameService } from '../../services/game.service';
import { Team, League, RecentMatchResult } from '../../models/types';
import { createEmptyTeamStats } from '../../models/season-history';
import { MatchResult } from '../../models/enums';

describe('StandingsComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  function createGameServiceStub(statsOverrides: { last5?: RecentMatchResult[] } = {}) {
    const expectedStats = {
      ...createEmptyTeamStats(),
      played: 12,
      won: 7,
      points: 22,
      last5: statsOverrides.last5 ?? []
    };

    return {
      league: signal<League | null>({ currentSeasonYear: 2032 } as League).asReadonly(),
      standings: signal<Team[]>([{ id: 't-1', name: 'Rovers', playerIds: [] } as unknown as Team]).asReadonly(),
      getTeamSnapshotForSeason: vi.fn().mockReturnValue({
        seasonYear: 2032,
        playerIds: [],
        stats: expectedStats
      }),
      calculateTeamOverall: vi.fn().mockReturnValue(75)
    } as unknown as Pick<GameService, 'league' | 'standings' | 'getTeamSnapshotForSeason' | 'calculateTeamOverall'>;
  }

  it('delegates season snapshot lookup to GameService for the current season year', () => {
    const gameServiceStub = createGameServiceStub();

    TestBed.configureTestingModule({
      imports: [StandingsComponent],
      providers: [
        provideRouter([]),
        { provide: GameService, useValue: gameServiceStub }
      ]
    });

    const fixture = TestBed.createComponent(StandingsComponent);
    const component = fixture.componentInstance;
    const team = { id: 't-1', name: 'Rovers', playerIds: [] } as unknown as Team;

    const stats = component.getTeamStats(team);

    expect(gameServiceStub.getTeamSnapshotForSeason).toHaveBeenCalledWith(team, 2032);
    expect(stats).toEqual(gameServiceStub.getTeamSnapshotForSeason(team, 2032).stats);
  });

  it('returns empty stats when league is unavailable', () => {
    const gameServiceStub = {
      league: signal<League | null>(null).asReadonly(),
      getTeamSnapshotForSeason: vi.fn()
    } as Pick<GameService, 'league' | 'getTeamSnapshotForSeason'>;

    TestBed.configureTestingModule({
      imports: [StandingsComponent],
      providers: [
        provideRouter([]),
        { provide: GameService, useValue: gameServiceStub }
      ]
    });

    const fixture = TestBed.createComponent(StandingsComponent);
    const component = fixture.componentInstance;
    const team = { id: 't-2', name: 'United', playerIds: [] } as unknown as Team;

    const stats = component.getTeamStats(team);

    expect(gameServiceStub.getTeamSnapshotForSeason).not.toHaveBeenCalled();
    expect(stats).toEqual(createEmptyTeamStats());
  });

  it('renders W/L/D badges with result text and tooltip attributes', () => {
    const last5: RecentMatchResult[] = [
      { result: MatchResult.WIN, opponentName: 'Arsenal', goalsFor: 2, goalsAgainst: 1, isHome: true },
      { result: MatchResult.DRAW, opponentName: 'Chelsea', goalsFor: 0, goalsAgainst: 0, isHome: false },
      { result: MatchResult.LOSS, opponentName: 'Liverpool', goalsFor: 1, goalsAgainst: 3, isHome: false }
    ];

    const gameServiceStub = createGameServiceStub({ last5 });

    TestBed.configureTestingModule({
      imports: [StandingsComponent],
      providers: [
        provideRouter([]),
        { provide: GameService, useValue: gameServiceStub }
      ]
    });

    const fixture = TestBed.createComponent(StandingsComponent);
    fixture.detectChanges();

    const badges = fixture.nativeElement.querySelectorAll('td:nth-child(12) span.w-5');
    expect(badges.length).toBe(3);

    expect(badges[0].textContent.trim()).toBe('W');
    expect(badges[0].getAttribute('title')).toBe('vs Arsenal — 2 - 1');
    expect(badges[0].classList.contains('bg-emerald-500')).toBe(true);

    expect(badges[1].textContent.trim()).toBe('D');
    expect(badges[1].getAttribute('title')).toBe('@ Chelsea — 0 - 0');
    expect(badges[1].classList.contains('bg-zinc-600')).toBe(true);

    expect(badges[2].textContent.trim()).toBe('L');
    expect(badges[2].getAttribute('title')).toBe('@ Liverpool — 1 - 3');
    expect(badges[2].classList.contains('bg-red-500')).toBe(true);
  });

  it('shows a dash when there are no recent results', () => {
    const gameServiceStub = createGameServiceStub({ last5: [] });

    TestBed.configureTestingModule({
      imports: [StandingsComponent],
      providers: [
        provideRouter([]),
        { provide: GameService, useValue: gameServiceStub }
      ]
    });

    const fixture = TestBed.createComponent(StandingsComponent);
    fixture.detectChanges();

    const dash = fixture.nativeElement.querySelector('td:nth-child(12) span.text-zinc-600');
    expect(dash).not.toBeNull();
    expect(dash.textContent.trim()).toBe('-');
  });
});
