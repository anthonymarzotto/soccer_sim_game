import { MatchResult, Position, Role } from './enums';
import { Player, Team } from './types';
import { getTeamPlayerInvariantIssues, normalizeTeamRoster, resolveTeamPlayers } from './team-players';
import { createEmptyPlayerCareerStats } from './player-career-stats';
import { createTestPlayer } from '../testing/test-player-fixtures';

describe('team-players', () => {
  function createPlayer(id: string, teamId = 'team-1'): Player {
    const player = createTestPlayer({
      id,
      teamId,
      position: Position.MIDFIELDER,
      role: Role.STARTER,
      age: 24,
      seasonYear: 2026,
      stats: {
        speed: 70, strength: 65, endurance: 72,
        flair: 68, vision: 71, determination: 74,
        tackling: 55, shooting: 60, heading: 52,
        longPassing: 67, shortPassing: 72,
        luck: 50, injuryRate: 8, overall: 70
      }
    });
    player.careerStats = [createEmptyPlayerCareerStats(2026, teamId)];
    return player;
  }

  function createTeam(players: Player[], playerIds = players.map(player => player.id)): Team {
    return {
      id: 'team-1',
      name: 'Test Team',
      players,
      playerIds,
      stats: {
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
        last5: [MatchResult.DRAW]
      },
      selectedFormationId: 'formation_4_4_2',
      formationAssignments: {},
      seasonSnapshots: [{
        seasonYear: 2026,
        playerIds: [...playerIds],
        stats: {
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          points: 0,
          last5: [MatchResult.DRAW]
        }
      }]
    };
  }

  it('should resolve players in playerIds order', () => {
    const p1 = createPlayer('p1');
    const p2 = createPlayer('p2');
    const team = createTeam([p2, p1], ['p1', 'p2']);

    expect(resolveTeamPlayers(team).map(player => player.id)).toEqual(['p1', 'p2']);
  });

  it('should report invariant issues when playerIds and players diverge', () => {
    const p1 = createPlayer('p1');
    const p2 = createPlayer('p2');
    const team = createTeam([p1, p2, p2], ['p1', 'p3', 'p3']);

    expect(getTeamPlayerInvariantIssues(team)).toEqual([
      'duplicate playerIds: p3',
      'duplicate players: p2',
      'missing players for ids: p3, p3',
      'players missing from playerIds: p2, p2'
    ]);
  });

  it('should normalize divergent teams into canonical playerIds order', () => {
    const p1 = createPlayer('p1');
    const p2 = createPlayer('p2');
    const team = createTeam([p2, p1, p2], ['p1', 'p3', 'p3']);

    const normalizedTeam = normalizeTeamRoster(team);

    expect(normalizedTeam.playerIds).toEqual(['p1', 'p2']);
    expect(normalizedTeam.players.map(player => player.id)).toEqual(['p1', 'p2']);
  });

  it('should fail fast when resolving a divergent team in tests', () => {
    const p1 = createPlayer('p1');
    const p2 = createPlayer('p2');
    const team = createTeam([p1, p2], ['p1', 'missing-player']);

    expect(() => resolveTeamPlayers(team)).toThrowError(
      'Team playerIds mismatch for Test Team (team-1): missing players for ids: missing-player; players missing from playerIds: p2'
    );
  });

  it('should report a missing latest season snapshot as an invariant issue', () => {
    const p1 = createPlayer('p1');
    const team = createTeam([p1]);
    delete team.seasonSnapshots;

    expect(getTeamPlayerInvariantIssues(team)).toEqual(['missing latest season snapshot']);
  });
});