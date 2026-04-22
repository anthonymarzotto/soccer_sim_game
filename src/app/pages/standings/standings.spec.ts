import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { StandingsComponent } from './standings';
import { GameService } from '../../services/game.service';
import { Team, League } from '../../models/types';
import { createEmptyTeamStats } from '../../models/season-history';

describe('StandingsComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('delegates season snapshot lookup to GameService for the current season year', () => {
    const expectedStats = {
      ...createEmptyTeamStats(),
      played: 12,
      won: 7,
      points: 22
    };

    const gameServiceStub = {
      league: signal<League | null>({ currentSeasonYear: 2032 } as League).asReadonly(),
      getTeamSnapshotForSeason: vi.fn().mockReturnValue({
        seasonYear: 2032,
        playerIds: [],
        stats: expectedStats
      })
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
    const team = { id: 't-1', name: 'Rovers', playerIds: [] } as unknown as Team;

    const stats = component.getTeamStats(team);

    expect(gameServiceStub.getTeamSnapshotForSeason).toHaveBeenCalledWith(team, 2032);
    expect(stats).toEqual(expectedStats);
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
});
