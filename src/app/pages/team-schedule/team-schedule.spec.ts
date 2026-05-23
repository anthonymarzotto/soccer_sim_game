import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { TeamScheduleComponent } from './team-schedule';
import { GameService } from '../../services/game.service';
import { Match, Team } from '../../models/types';

import { SettingsService } from '../../services/settings.service';

describe('TeamScheduleComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  const mockTeam = {
    id: 't-1',
    name: 'Rovers',
    stats: {
      played: 10,
      won: 6,
      drawn: 2,
      lost: 2,
      goalsFor: 18,
      goalsAgainst: 10,
      points: 20
    },
    seasonSnapshots: [
      {
        seasonYear: 2031,
        stats: {
          played: 22,
          won: 12,
          drawn: 5,
          lost: 5,
          goalsFor: 35,
          goalsAgainst: 20,
          points: 41
        }
      }
    ]
  } as unknown as Team;

  const mockMatches: Match[] = [
    {
      id: 'm-1',
      seasonYear: 2032,
      week: 1,
      homeTeamId: 't-1',
      awayTeamId: 't-2',
      homeScore: 2,
      awayScore: 1,
      played: true
    },
    {
      id: 'm-2',
      seasonYear: 2032,
      week: 2,
      homeTeamId: 't-3',
      awayTeamId: 't-1',
      homeScore: 2,
      awayScore: 1, // loss for t-1
      played: true
    },
    {
      id: 'm-3',
      seasonYear: 2032,
      week: 3,
      homeTeamId: 't-1',
      awayTeamId: 't-4',
      played: false
    }
  ];

  function createGameServiceStub() {
    return {
      league: signal({
        currentSeasonYear: 2032,
        currentWeek: 3,
        userTeamId: 't-1',
        teams: [mockTeam, { id: 't-2', name: 'Athletic' } as Team],
        schedule: mockMatches
      }).asReadonly(),
      getTeam: vi.fn().mockImplementation((id) => id === 't-1' ? mockTeam : { id, name: 'Opponent ' + id }),
      getPlayer: vi.fn().mockImplementation((id) => ({ id, name: 'Player ' + id, teamId: 't-1' })),
      isSeasonComplete: vi.fn().mockReturnValue(false),
      getTeamSnapshotForSeason: vi.fn().mockImplementation((team, yr) => {
        if (yr === 2031) {
          return { stats: team.seasonSnapshots[0].stats };
        }
        return { stats: team.stats };
      }),
      getTeamAverageOverallForSeason: vi.fn().mockReturnValue(78),
      getLeagueStandingsRankForSeason: vi.fn().mockReturnValue({ rank: 2, totalTeams: 12 }),
      getTeamOverall: vi.fn().mockReturnValue(75),
      getMatchProbabilities: vi.fn().mockReturnValue({ homeWin: 0.4, draw: 0.3, awayWin: 0.3 })
    } as unknown as Pick<
      GameService,
      | 'league'
      | 'getTeam'
      | 'getPlayer'
      | 'isSeasonComplete'
      | 'getTeamSnapshotForSeason'
      | 'getTeamAverageOverallForSeason'
      | 'getLeagueStandingsRankForSeason'
      | 'getTeamOverall'
      | 'getMatchProbabilities'
    >;
  }

  function setup(teamIdParam: string | null = 't-1') {
    const gameServiceStub = createGameServiceStub();
    const routerMock = {
      navigate: vi.fn()
    };
    const settingsServiceStub = {
      badgeStyle: signal('shield').asReadonly()
    };

    TestBed.configureTestingModule({
      imports: [TeamScheduleComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap(teamIdParam ? { id: teamIdParam } : {}))
          }
        },
        { provide: Router, useValue: routerMock },
        { provide: GameService, useValue: gameServiceStub },
        { provide: SettingsService, useValue: settingsServiceStub }
      ]
    });

    const fixture = TestBed.createComponent(TeamScheduleComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    return { fixture, component, gameServiceStub, routerMock };
  }

  it('correctly loads team from route parameters and retrieves details', () => {
    const { component, gameServiceStub } = setup('t-1');
    expect(component.teamId()).toBe('t-1');
    expect(gameServiceStub.getTeam).toHaveBeenCalledWith('t-1');
    expect(component.team()).toEqual(mockTeam);
  });

  it('correctly computes available seasons in the history', () => {
    const { component } = setup('t-1');
    // seasons from snapshots (2031) + current season (2032)
    expect(component.seasons()).toEqual([2031, 2032]);
  });

  it('defaults selectedSeason to the current active season', () => {
    const { component } = setup('t-1');
    expect(component.selectedSeason()).toBe(2032);
    expect(component.isCurrentSeason()).toBe(true);
  });

  it('allows overriding selected season using setSeason', () => {
    const { component } = setup('t-1');
    component.setSeason(2031);
    expect(component.selectedSeason()).toBe(2031);
    expect(component.isCurrentSeason()).toBe(false);
  });

  it('splits matches into completed vs pending when viewing active/uncompleted season', () => {
    const { component } = setup('t-1');
    expect(component.isSeasonComplete()).toBe(false);

    const pending = component.pendingMatches();
    const completed = component.completedMatches();

    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe('m-3');

    expect(completed.length).toBe(2);
    expect(completed[0].id).toBe('m-1');
    expect(completed[1].id).toBe('m-2');
  });

  it('returns all matches as completed when viewing a past/completed season', () => {
    const { component } = setup('t-1');
    component.setSeason(2031);

    expect(component.isSeasonComplete()).toBe(true);
    expect(component.pendingMatches().length).toBe(0);
  });

  it('navigates to the selected team details schedule upon team change dropdown selection', () => {
    const { component, routerMock } = setup('t-1');
    component.onTeamChange('t-2');
    expect(routerMock.navigate).toHaveBeenCalledWith(['/team', 't-2', 'schedule']);
  });

  describe('getMatchOutcome', () => {
    it('returns W/L/D and Upcoming outcome correctly', () => {
      const { component } = setup('t-1');

      // Win match: Rovers (t-1) 2 vs Athletic (t-2) 1
      const winMatch = mockMatches[0];
      const winOutcome = component.getMatchOutcome(winMatch);
      expect(winOutcome.result).toBe('W');
      expect(winOutcome.label).toBe('Win');
      expect(winOutcome.textClass).toContain('text-emerald-400');

      // Loss match: Rovers (t-1) 1 vs United (t-3) 2
      const lossMatch = mockMatches[1];
      const lossOutcome = component.getMatchOutcome(lossMatch);
      expect(lossOutcome.result).toBe('L');
      expect(lossOutcome.label).toBe('Loss');
      expect(lossOutcome.textClass).toContain('text-red-400');

      // Draw match mock: t-1 home score 1, away score 1
      const drawMatch: Match = {
        id: 'm-draw',
        seasonYear: 2032,
        week: 4,
        homeTeamId: 't-1',
        awayTeamId: 't-2',
        homeScore: 1,
        awayScore: 1,
        played: true
      };
      const drawOutcome = component.getMatchOutcome(drawMatch);
      expect(drawOutcome.result).toBe('D');
      expect(drawOutcome.label).toBe('Draw');
      expect(drawOutcome.textClass).toContain('text-amber-400');

      // Upcoming match on current week (week 3 is currentWeek)
      const upcomingCurrentWeek = mockMatches[2];
      const currentWeekOutcome = component.getMatchOutcome(upcomingCurrentWeek);
      expect(currentWeekOutcome.result).toBe('Upcoming');
      expect(currentWeekOutcome.label).toBe('Current Week');
      expect(currentWeekOutcome.textClass).toContain('text-indigo-400');
    });
  });
});
