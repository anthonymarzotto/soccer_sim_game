/* eslint-disable @typescript-eslint/no-explicit-any */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SeasonSummaryComponent } from './season-summary';
import { signal } from '@angular/core';
import { GameService } from '../../services/game.service';
import { provideRouter } from '@angular/router';
import { League, Player, Team } from '../../models/types';
import { createEmptyPlayerCareerStats } from '../../models/player-career-stats';

describe('SeasonSummaryComponent', () => {
  let component: SeasonSummaryComponent;
  let fixture: ComponentFixture<SeasonSummaryComponent>;
  let gameServiceStub: Partial<GameService>;

  const mockPlayer1: Player = {
    id: 'p1',
    name: 'Player One',
    position: 'ST',
    seasonAttributes: [{ seasonYear: 2024, overall: { value: 90 } }] as any,
    careerStats: [
      {
        ...createEmptyPlayerCareerStats(2024, 't1'),
        matchesPlayed: 10,
        totalMatchRating: 800 // raw avg 80 -> scaled 9.1
      }
    ]
  } as any;

  const mockPlayer2: Player = {
    id: 'p2',
    name: 'Player Two',
    position: 'CM',
    seasonAttributes: [{ seasonYear: 2024, overall: { value: 70 } }] as any,
    careerStats: [
      {
        ...createEmptyPlayerCareerStats(2024, 't1'),
        matchesPlayed: 10,
        totalMatchRating: 500 // raw avg 50 -> scaled 5.0
      }
    ]
  } as any;

  const mockPlayer3: Player = {
    id: 'p3',
    name: 'Player Three',
    position: 'CB',
    seasonAttributes: [{ seasonYear: 2024, overall: { value: 95 } }] as any,
    careerStats: [
      {
        ...createEmptyPlayerCareerStats(2024, 't1'),
        matchesPlayed: 10,
        totalMatchRating: 300 // raw avg 30 -> scaled 2.3
      }
    ]
  } as any;

  const mockTeam: Team = {
    id: 't1',
    name: 'Team Alpha',
    players: [mockPlayer1, mockPlayer2, mockPlayer3]
  } as any;

  const mockTeam2: Team = {
    id: 't2',
    name: 'Team Beta',
    players: []
  } as any;

  const mockLeague: League = {
    currentSeasonYear: 2024,
    userTeamId: 't1',
    teams: [mockTeam, mockTeam2],
    schedule: [],
    currentWeek: 1,
    transferListings: [],
    transferOffers: []
  };

  beforeEach(async () => {
    gameServiceStub = {
      league: signal<League>(mockLeague),
    };

    await TestBed.configureTestingModule({
      imports: [SeasonSummaryComponent],
      providers: [
        { provide: GameService, useValue: gameServiceStub },
        provideRouter([])
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SeasonSummaryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute top and bottom players by average game score', () => {
    const top = component.topAvgScorePlayers();
    const bottom = component.bottomAvgScorePlayers();

    expect(top.length).toBe(3);
    // Player 1 has raw avg 80 (highest), Player 3 has raw avg 30 (lowest)
    expect(top[0].player.id).toBe('p1');
    expect(top[0].score).toBeGreaterThan(top[1].score);

    expect(bottom[0].player.id).toBe('p3');
    expect(bottom[0].score).toBeLessThan(bottom[1].score);
  });

  it('should filter out games where player had 0 minutesPlayed and set correct opponentName and isHome', () => {
    (gameServiceStub.league as any).set({
      ...mockLeague,
      schedule: [
        {
          id: 'm1',
          seasonYear: 2024,
          week: 1,
          homeTeamId: 't1',
          awayTeamId: 't2',
          played: true,
          matchReport: {
            homePlayerStats: [
              { playerId: 'p1', playerName: 'Player One', rating: 90, minutesPlayed: 90 },
              { playerId: 'p2', playerName: 'Player Two', rating: 20, minutesPlayed: 0 } // Did not play
            ],
            awayPlayerStats: []
          }
        } as any,
        {
          id: 'm2',
          seasonYear: 2024,
          week: 2,
          homeTeamId: 't2',
          awayTeamId: 't1',
          played: true,
          matchReport: {
            homePlayerStats: [],
            awayPlayerStats: [
              { playerId: 'p1', playerName: 'Player One', rating: 15, minutesPlayed: 90 }
            ]
          }
        } as any
      ]
    });

    const worst = component.worstMatchScores();
    const best = component.bestMatchScores();

    expect(best[0].player.id).toBe('p1');
    expect(best[0].opponentName).toBe('Team Beta');
    expect(best[0].isHome).toBe(true);

    expect(worst[0].player.id).toBe('p1');
    expect(worst[0].opponentName).toBe('Team Beta');
    expect(worst[0].isHome).toBe(false);
  });

  it('should return formation shortCode for mostUsedFormations', () => {
    (gameServiceStub.league as any).set({
      ...mockLeague,
      schedule: [
        {
          id: 'm1',
          seasonYear: 2024,
          week: 1,
          homeTeamId: 't1',
          awayTeamId: 't2',
          played: true,
          homeScore: 2,
          awayScore: 1,
          homeLineup: { selectedFormationId: 'formation_4_4_2' },
          matchReport: { homePlayerStats: [], awayPlayerStats: [] }
        } as any
      ]
    });

    const formations = component.mostUsedFormations();
    expect(formations.length).toBe(1);
    expect(formations[0].name).toBe('4-4-2');
    expect(formations[0].points).toBe(3);
    expect(formations[0].goalsFor).toBe(2);
    expect(formations[0].goalsAgainst).toBe(1);
    expect(formations[0].goalDiff).toBe(1);
  });
});
