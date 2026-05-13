import { LeagueAssemblyService } from './league-assembly.service';
import { EventImportance, EventType, MatchResult, Position, Role } from '../models/enums';
import { League, TeamSeasonSnapshot } from '../models/types';
import { createTestPersonal as mockPersonal, createTestSeasonAttributes as mockSeasonAttrs } from '../testing/test-player-fixtures';

describe('LeagueAssemblyService', () => {
  const service = new LeagueAssemblyService();

  const leagueFixture: League = {
    currentWeek: 3,
    currentSeasonYear: 2026,
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
            personal: mockPersonal({ height: 190, weight: 85, age: 27, nationality: 'ENG', seasonYear: 2026 }),
            seasonAttributes: [mockSeasonAttrs(2026, { speed: 60, strength: 82, endurance: 77, flair: 55, vision: 68, determination: 80, tackling: 22, shooting: 20, heading: 30, longPassing: 55, shortPassing: 62, luck: 60, injuryRate: 10, overall: 79 })],
            careerStats: [
              {
                seasonYear: 2026,
                teamId: 'team-1',
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
                minutesPlayed: 900,
                fouls: 0,
                foulsSuffered: 0,
                totalMatchRating: 0,
                starNominations: { first: 0, second: 0, third: 0 }
              }
            ],
            mood: 73,
            fatigue: 61,
            injuries: [],
            progression: { potential: 90, professionalism: 50, temperament: 50, juniorEndAge: 22, peakEndAge: 28, seniorEndAge: 32 }
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
          last5: [
            { result: MatchResult.DRAW, opponentName: 'Opponent A', goalsFor: 1, goalsAgainst: 1, isHome: true },
            { result: MatchResult.WIN, opponentName: 'Opponent B', goalsFor: 2, goalsAgainst: 0, isHome: false }
          ]
        },
        selectedFormationId: 'formation_4_4_2',
        formationAssignments: {
          gk_1: 'player-1'
        },
        seasonSnapshots: [{
          seasonYear: 2026,
          playerIds: ['player-1'],
          stats: {
            played: 2,
            won: 1,
            drawn: 1,
            lost: 0,
            goalsFor: 3,
            goalsAgainst: 1,
            points: 4,
            last5: [
              { result: MatchResult.DRAW, opponentName: 'Opponent A', goalsFor: 1, goalsAgainst: 1, isHome: true },
              { result: MatchResult.WIN, opponentName: 'Opponent B', goalsFor: 2, goalsAgainst: 0, isHome: false }
            ]
          }
        }]
      }
    ],
    schedule: [
      {
        id: 'match-1',
        seasonYear: 2026,
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
    expect(snapshot.teams[0].seasonSnapshots[0]?.playerIds).toEqual(['player-1']);
    expect(snapshot.players[0].mood).toBe(73);
    expect(snapshot.players[0].fatigue).toBe(61);
  });

  it('should assemble normalized snapshot back to league shape', () => {
    const snapshot = service.flattenLeague(leagueFixture);
    const assembled = service.assembleLeague(snapshot);

    expect(assembled).not.toBeNull();
    expect(assembled?.currentWeek).toBe(leagueFixture.currentWeek);
    expect(assembled?.userTeamId).toBe(leagueFixture.userTeamId);
    expect(assembled?.teams[0].players[0].id).toBe('player-1');
    expect(assembled?.teams[0].playerIds).toEqual(['player-1']);
    expect(assembled?.teams[0].seasonSnapshots?.[0]?.playerIds).toEqual(['player-1']);
    expect(assembled?.teams[0].players[0].mood).toBe(73);
    expect(assembled?.teams[0].players[0].fatigue).toBe(61);
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

  it('should throw when a team has no snapshot for the requested season year', () => {
    expect(() => service.toPersistedTeams(leagueFixture.teams, 2025)).toThrowError(
      /missing season snapshot for year 2025 on team "team-1"/
    );
  });

  it('should throw when a team is missing its current-season snapshot during assembly', () => {
    const snapshot = service.flattenLeague(leagueFixture);
    const corruptedSnapshot = {
      ...snapshot,
      teams: snapshot.teams.map(team => {
        const filtered: Record<number, TeamSeasonSnapshot> = {};
        for (const [key, val] of Object.entries(team.seasonSnapshots)) {
          if ((val as { seasonYear: number }).seasonYear !== 2026) {
            filtered[Number(key)] = val as TeamSeasonSnapshot;
          }
        }
        return {
          ...team,
          seasonSnapshots: filtered
        };
      })
    };

    expect(() => service.assembleLeague(corruptedSnapshot)).toThrowError(
      /assembleLeague: missing season-2026 snapshot for team "team-1"\. Persisted data is incompatible/
    );
  });

  it('should throw when a player is missing current-season seasonAttributes during flatten', () => {
    const corruptedLeague: League = {
      ...leagueFixture,
      teams: leagueFixture.teams.map(team => ({
        ...team,
        players: team.players.map(player => ({
          ...player,
          seasonAttributes: (player.seasonAttributes ?? []).filter(attrs => attrs.seasonYear !== 2026)
        }))
      }))
    };

    expect(() => service.flattenLeague(corruptedLeague)).toThrowError(
      /missing season-2026 seasonAttributes for player "player-1"/
    );
  });

  it('should throw when a player is missing current-season seasonAttributes during assembly', () => {
    const snapshot = service.flattenLeague(leagueFixture);
    const corruptedSnapshot = {
      ...snapshot,
      players: snapshot.players.map(player => ({
        ...player,
        seasonAttributes: player.seasonAttributes.filter(attrs => attrs.seasonYear !== 2026)
      }))
    };

    expect(() => service.assembleLeague(corruptedSnapshot)).toThrowError(
      /assembleLeague: missing season-2026 seasonAttributes for player "player-1".*Persisted data is incompatible/
    );
  });

  it('should throw during assembly when a player has a missing stat key in seasonAttributes', () => {
    const snapshot = service.flattenLeague(leagueFixture);
    const corruptedSnapshot = {
      ...snapshot,
      players: snapshot.players.map(player => ({
        ...player,
        seasonAttributes: player.seasonAttributes.map(attrs => {
          const { speed: _omit, ...rest } = attrs.values as Record<string, number>;
          return { ...attrs, values: rest as unknown as typeof attrs.values };
        })
      }))
    };

    expect(() => service.assembleLeague(corruptedSnapshot)).toThrowError(
      /invalid or out-of-range stat value in seasonAttributes for player "player-1".*Persisted data is incompatible/
    );
  });

  it('should throw during assembly when a player has an out-of-range stat value in seasonAttributes', () => {
    const snapshot = service.flattenLeague(leagueFixture);
    const corruptedSnapshot = {
      ...snapshot,
      players: snapshot.players.map(player => ({
        ...player,
        seasonAttributes: player.seasonAttributes.map(attrs => ({
          ...attrs,
          values: { ...(attrs.values as Record<string, number>), speed: 999 } as unknown as typeof attrs.values
        }))
      }))
    };

    expect(() => service.assembleLeague(corruptedSnapshot)).toThrowError(
      /invalid or out-of-range stat value in seasonAttributes for player "player-1".*Persisted data is incompatible/
    );
  });

  it('should throw during assembly when a player is missing mood or fatigue', () => {
    const snapshot = service.flattenLeague(leagueFixture);
    const corruptedSnapshot = {
      ...snapshot,
      players: snapshot.players.map(player => {
        const { mood: _omit, ...rest } = player;
        return rest as typeof player;
      })
    };

    expect(() => service.assembleLeague(corruptedSnapshot)).toThrowError(
      /assembleLeague: invalid mood\/fatigue for player "player-1".*Persisted data is incompatible/
    );
  });
});
