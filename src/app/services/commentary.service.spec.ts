import { TestBed } from '@angular/core/testing';
import { CommentaryService } from './commentary.service';
import { CommentaryStyle, EventType, Position as PositionEnum, Role } from '../models/enums';
import { PlayByPlayEvent } from '../models/simulation.types';
import { Player, Team } from '../models/types';

describe('CommentaryService', () => {
  let service: CommentaryService;
  let homeTeam: Team;
  let awayTeam: Team;
  let homePlayers: Player[];
  let awayPlayers: Player[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CommentaryService]
    });

    service = TestBed.inject(CommentaryService);

    homePlayers = [
      createPlayer('home-mid', 'team-home', 'Home Mid', PositionEnum.MIDFIELDER),
      createPlayer('home-fwd', 'team-home', 'Home Fwd', PositionEnum.FORWARD)
    ];

    awayPlayers = [
      createPlayer('away-mid', 'team-away', 'Away Mid', PositionEnum.MIDFIELDER),
      createPlayer('away-def', 'team-away', 'Away Def', PositionEnum.DEFENDER)
    ];

    homeTeam = createTeam('team-home', 'Home FC', homePlayers);
    awayTeam = createTeam('team-away', 'Away FC', awayPlayers);
  });

  it('uses pass intent specific commentary for a through ball in detailed mode', () => {
    const event = createEvent(EventType.PASS, ['home-mid', 'home-fwd'], true, {
      passIntent: 'THROUGH_BALL'
    });

    const commentary = service.generateEventCommentary(
      event,
      homeTeam,
      awayTeam,
      CommentaryStyle.DETAILED,
      { homePlayers, awayPlayers }
    );

    expect(commentary).toContain('Home Mid');
    expect(commentary).toContain('through ball');
    expect(commentary).toContain('Home Fwd');
  });

  it('uses pass intent specific commentary for a recycle pass in detailed mode', () => {
    const event = createEvent(EventType.PASS, ['home-mid', 'home-fwd'], true, {
      passIntent: 'RECYCLE'
    });

    const commentary = service.generateEventCommentary(
      event,
      homeTeam,
      awayTeam,
      CommentaryStyle.DETAILED,
      { homePlayers, awayPlayers }
    );

    expect(commentary).toContain('Home Mid');
    expect(commentary).toContain('recycles possession');
    expect(commentary).toContain('Home Fwd');
  });

  it('describes tackled pass failures without misattributing a defensive actor', () => {
    const event = createEvent(EventType.TACKLE, ['home-mid'], false, {
      passFailure: 'TACKLED',
      passIntent: 'PROGRESSION'
    });

    const commentary = service.generateEventCommentary(
      event,
      homeTeam,
      awayTeam,
      CommentaryStyle.DETAILED,
      { homePlayers, awayPlayers }
    );

    expect(commentary).toContain('Home Mid');
    expect(commentary).toContain('progressive pass');
    expect(commentary).toContain('Possession turns over');
  });

  it('describes overhit pass failures for interception events', () => {
    const event = createEvent(EventType.INTERCEPTION, ['home-mid'], false, {
      passFailure: 'OVERHIT',
      passIntent: 'CROSS'
    });

    const commentary = service.generateEventCommentary(
      event,
      homeTeam,
      awayTeam,
      CommentaryStyle.DETAILED,
      { homePlayers, awayPlayers }
    );

    expect(commentary).toContain('Home Mid');
    expect(commentary).toContain('overhits');
    expect(commentary).toContain('cross');
  });
});

function createEvent(
  type: EventType,
  playerIds: string[],
  success: boolean,
  additionalData?: Record<string, unknown>
): PlayByPlayEvent {
  return {
    id: `${type}-event`,
    type,
    description: '',
    playerIds,
    location: { x: 50, y: 50 },
    time: 10,
    success,
    additionalData
  };
}

function createTeam(id: string, name: string, players: Player[]): Team {
  return {
    id,
    name,
    players,
    playerIds: players.map(player => player.id),
    selectedFormationId: 'test-formation',
    formationAssignments: {
      slot_1: players[0].id,
      slot_2: players[1].id
    },
    stats: {
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
      last5: []
    }
  };
}

function createPlayer(id: string, teamId: string, name: string, position: PositionEnum): Player {
  const overall = 75;

  return {
    id,
    name,
    teamId,
    position,
    role: Role.STARTER,
    personal: { height: 180, weight: 75, age: 25, nationality: 'ENG' },
    physical: { speed: overall, strength: overall, endurance: overall },
    mental: { flair: overall, vision: overall, determination: overall },
    skills: {
      tackling: overall,
      shooting: overall,
      heading: overall,
      longPassing: overall,
      shortPassing: overall,
      goalkeeping: overall
    },
    hidden: { luck: 50, injuryRate: 5 },
    overall,
    careerStats: {
      matchesPlayed: 0,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      shots: 0,
      shotsOnTarget: 0,
      tackles: 0,
      interceptions: 0,
      passes: 0,
      saves: 0,
      cleanSheets: 0,
      minutesPlayed: 0
    }
  };
}
