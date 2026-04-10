import { LeagueAssemblyService } from './league-assembly.service';
import { EventImportance, EventType, MatchResult, Position, Role } from '../models/enums';
import { League } from '../models/types';

describe('LeagueAssemblyService', () => {
  const service = new LeagueAssemblyService();

  const leagueFixture: League = {
    currentWeek: 3,
    userTeamId: 'team-1',
    teams: [
      {
        id: 'team-1',
        name: 'Home FC',
        players: [
          {
            id: 'player-1',
            name: 'Goal Keeper',
            teamId: 'team-1',
            position: Position.GOALKEEPER,
            role: Role.STARTER,
            personal: { height: 190, weight: 85, age: 27, nationality: 'ENG' },
            physical: { speed: 60, strength: 82, endurance: 77 },
            mental: { flair: 55, vision: 68, determination: 80 },
            skills: { tackling: 22, shooting: 20, heading: 30, longPassing: 55, shortPassing: 62, goalkeeping: 85 },
            hidden: { luck: 60, injuryRate: 10 },
            overall: 79,
            careerStats: {
              matchesPlayed: 10,
              goals: 0,
              assists: 0,
              yellowCards: 1,
              redCards: 0,
              shots: 0,
              shotsOnTarget: 0,
              tackles: 2,
              interceptions: 3,
              passes: 140,
              saves: 38,
              cleanSheets: 4,
              minutesPlayed: 0,
              fouls: 0,
              foulsSuffered: 0
              }
          }
        ],
        playerIds: ['player-1'],
        stats: {
          played: 2,
          won: 1,
          drawn: 1,
          lost: 0,
          goalsFor: 3,
          goalsAgainst: 1,
          points: 4,
          last5: [MatchResult.DRAW, MatchResult.WIN]
        },
        selectedFormationId: 'formation_4_4_2',
        formationAssignments: {
          gk_1: 'player-1'
        }
      }
    ],
    schedule: [
      {
        id: 'match-1',
        week: 2,
        homeTeamId: 'team-1',
        awayTeamId: 'team-2',
        homeScore: 1,
        awayScore: 0,
        played: true,
        keyEvents: [
          {
            id: 'event-1',
            time: 45,
            type: EventType.GOAL,
            description: 'Goal',
            playerIds: ['player-1'],
            importance: EventImportance.HIGH
          }
        ]
      }
    ]
  };

  it('should flatten league into normalized snapshot', () => {
    const snapshot = service.flattenLeague(leagueFixture);

    expect(snapshot.teams).toHaveLength(1);
    expect(snapshot.players).toHaveLength(1);
    expect(snapshot.schedule).toHaveLength(1);
    expect(snapshot.metadata?.currentWeek).toBe(3);
    expect(snapshot.metadata?.userTeamId).toBe('team-1');
    expect(snapshot.teams[0].playerIds).toEqual(['player-1']);
  });

  it('should assemble normalized snapshot back to league shape', () => {
    const snapshot = service.flattenLeague(leagueFixture);
    const assembled = service.assembleLeague(snapshot);

    expect(assembled).not.toBeNull();
    expect(assembled?.currentWeek).toBe(leagueFixture.currentWeek);
    expect(assembled?.userTeamId).toBe(leagueFixture.userTeamId);
    expect(assembled?.teams[0].players[0].id).toBe('player-1');
    expect(assembled?.teams[0].playerIds).toEqual(['player-1']);
    expect(assembled?.schedule[0].id).toBe('match-1');
  });

  it('should return null when snapshot is fully empty', () => {
    const assembled = service.assembleLeague({
      teams: [],
      players: [],
      schedule: [],
      metadata: null
    });

    expect(assembled).toBeNull();
  });
});
