import { TestBed } from '@angular/core/testing';
import { StatisticsService } from './statistics.service';
import { EventType, MatchPhase, Position, Role } from '../models/enums';
import { PlayByPlayEvent, MatchState } from '../models/simulation.types';
import { Player, Team } from '../models/types';
import { createTestPlayer } from '../testing/test-player-fixtures';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeEvent(
  type: EventType,
  playerIds: string[],
  time: number,
  success = true
): PlayByPlayEvent {
  return {
    id: `evt-${type}-${time}-${playerIds.join('-')}`,
    type,
    description: '',
    playerIds,
    location: { x: 50, y: 50 },
    time,
    success
  };
}

function makeMatchState(events: PlayByPlayEvent[], currentMinute = 90): MatchState {
  return {
    ballPossession: {
      teamId: 'team-1',
      playerWithBall: '',
      location: { x: 50, y: 50 },
      phase: MatchPhase.BUILD_UP,
      passes: 0,
      timeElapsed: 0
    },
    events,
    fatigueTimeline: [],
    currentMinute,
    homeScore: 0,
    awayScore: 0,
    homeShots: 0,
    awayShots: 0,
    homeShotsOnTarget: 0,
    awayShotsOnTarget: 0,
    homePossession: 50,
    awayPossession: 50,
    homeCorners: 0,
    awayCorners: 0,
    homeFouls: 0,
    awayFouls: 0,
    homeYellowCards: 0,
    awayYellowCards: 0,
    homeRedCards: 0,
    awayRedCards: 0
  };
}

function makeTeam(starters: Player[], bench: Player[] = [], id = 'team-1'): Team {
  const allPlayers = [...starters, ...bench];
  const playerIds = allPlayers.map(p => p.id);
  const formationAssignments: Record<string, string> = {};
  starters.forEach((p, i) => { formationAssignments[`slot_${i}`] = p.id; });
  const stats = {
    played: 0, won: 0, drawn: 0, lost: 0,
    goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] as []
  };
  return {
    id,
    name: `Test Team ${id}`,
    players: allPlayers,
    playerIds,
    selectedFormationId: 'test',
    formationAssignments,
    stats,
    seasonSnapshots: [{ seasonYear: 2026, playerIds, stats }]
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StatisticsService', () => {
  let service: StatisticsService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [StatisticsService] });
    service = TestBed.inject(StatisticsService);
  });

  describe('generatePlayerStatistics — rating', () => {
    it('uses a fixed base of 50 for a starter at kickoff', () => {
      const player = createTestPlayer({ id: 'p1', position: Position.MIDFIELDER });
      const team = makeTeam([player]);
      const state = makeMatchState([], 0);

      const [stats] = service.generatePlayerStatistics(state, team, [player]);

      expect(stats.rating).toBe(50);
    });

    it('uses a fixed base of 50 for a starter with no events', () => {
      const player = createTestPlayer({ id: 'p1', position: Position.MIDFIELDER });
      const team = makeTeam([player]);
      const state = makeMatchState([]);

      const [stats] = service.generatePlayerStatistics(state, team, [player]);

      expect(stats.rating).toBe(50);
    });

    it('gives 0 rating to a bench player who never enters', () => {
      const starter = createTestPlayer({ id: 'starter', position: Position.MIDFIELDER });
      const bench = createTestPlayer({ id: 'bench', position: Position.FORWARD, role: Role.BENCH });
      const team = makeTeam([starter], [bench]);
      const state = makeMatchState([]);

      const results = service.generatePlayerStatistics(state, team, [starter, bench]);
      const benchResult = results.find(s => s.playerId === 'bench')!;

      expect(benchResult.rating).toBe(0);
    });

    it('credits tackle stats and rating only to the turnover winner', () => {
      const defender = createTestPlayer({ id: 'home-def', teamId: 'home', position: Position.DEFENDER });
      const attacker = createTestPlayer({ id: 'away-att', teamId: 'away', position: Position.FORWARD });
      const homeTeam = makeTeam([defender], [], 'home');
      const awayTeam = makeTeam([attacker], [], 'away');
      const state = makeMatchState([
        makeEvent(EventType.TACKLE, ['home-def', 'away-att'], 30)
      ]);

      const [defenderStats] = service.generatePlayerStatistics(state, homeTeam, [defender]);
      const [attackerStats] = service.generatePlayerStatistics(state, awayTeam, [attacker]);

      expect(defenderStats.tackles).toBe(1);
      expect(defenderStats.tacklesSuccessful).toBe(1);
      expect(defenderStats.rating).toBeGreaterThan(50);
      expect(attackerStats.tackles).toBe(0);
      expect(attackerStats.tacklesSuccessful).toBe(0);
      expect(attackerStats.rating).toBe(50);
    });

    it('credits interception stats and rating only to the turnover winner', () => {
      const defender = createTestPlayer({ id: 'home-def', teamId: 'home', position: Position.DEFENDER });
      const attacker = createTestPlayer({ id: 'away-att', teamId: 'away', position: Position.FORWARD });
      const homeTeam = makeTeam([defender], [], 'home');
      const awayTeam = makeTeam([attacker], [], 'away');
      const state = makeMatchState([
        makeEvent(EventType.INTERCEPTION, ['home-def', 'away-att'], 30, false)
      ]);

      const [defenderStats] = service.generatePlayerStatistics(state, homeTeam, [defender]);
      const [attackerStats] = service.generatePlayerStatistics(state, awayTeam, [attacker]);

      expect(defenderStats.interceptions).toBe(1);
      expect(defenderStats.rating).toBeGreaterThan(50);
      expect(attackerStats.interceptions).toBe(0);
      expect(attackerStats.rating).toBe(50);
    });

    it('uses a fixed base of 50 for a substitute immediately after entering', () => {
      const starter = createTestPlayer({ id: 'starter', position: Position.MIDFIELDER });
      const bench = createTestPlayer({ id: 'bench', position: Position.FORWARD, role: Role.BENCH });
      const team = makeTeam([starter], [bench]);
      const state = makeMatchState([
        makeEvent(EventType.SUBSTITUTION, ['starter', 'bench'], 60)
      ], 60);

      const results = service.generatePlayerStatistics(state, team, [starter, bench]);
      const benchResult = results.find(s => s.playerId === 'bench')!;

      expect(benchResult.minutesPlayed).toBe(0);
      expect(benchResult.rating).toBe(50);
    });

    it('increases rating above 50 for a GOAL event', () => {
      const player = createTestPlayer({ id: 'p1', position: Position.FORWARD });
      const team = makeTeam([player]);
      const state = makeMatchState([makeEvent(EventType.GOAL, ['p1'], 30)]);

      const [stats] = service.generatePlayerStatistics(state, team, [player]);

      expect(stats.rating).toBeGreaterThan(50);
    });

    it('decreases rating below 50 for a MISS event', () => {
      const player = createTestPlayer({ id: 'p1', position: Position.FORWARD });
      const team = makeTeam([player]);
      const state = makeMatchState([makeEvent(EventType.MISS, ['p1'], 30)]);

      const [stats] = service.generatePlayerStatistics(state, team, [player]);

      expect(stats.rating).toBeLessThan(50);
    });

    it('increases rating above 50 when the player is the victim of a foul', () => {
      const player = createTestPlayer({ id: 'p1', position: Position.FORWARD });
      const team = makeTeam([player]);
      // playerIds[1] = victim of the foul
      const state = makeMatchState([makeEvent(EventType.FOUL, ['opponent', 'p1'], 20)]);

      const [stats] = service.generatePlayerStatistics(state, team, [player]);

      expect(stats.rating).toBeGreaterThan(50);
    });

    it('increases GK rating above 50 for SAVE events', () => {
      const gk = createTestPlayer({ id: 'gk1', position: Position.GOALKEEPER });
      const team = makeTeam([gk]);
      // save event: playerIds[0] = shooter, playerIds[1] = keeper
      const state = makeMatchState([makeEvent(EventType.SAVE, ['shooter', 'gk1'], 45)]);

      const [stats] = service.generatePlayerStatistics(state, team, [gk]);

      expect(stats.rating).toBeGreaterThan(50);
    });

    it('does not give a save bonus to a non-GK player mentioned in a SAVE event', () => {
      const shooter = createTestPlayer({ id: 'fwd1', position: Position.FORWARD });
      const gk = createTestPlayer({ id: 'gk1', position: Position.GOALKEEPER });
      const team = makeTeam([shooter, gk]);
      // shooter appears as playerIds[0] in SAVE event
      const state = makeMatchState([makeEvent(EventType.SAVE, ['fwd1', 'gk1'], 45)]);

      const results = service.generatePlayerStatistics(state, team, [shooter, gk]);
      const fwdStats = results.find(s => s.playerId === 'fwd1')!;

      expect(fwdStats.rating).toBe(50); // no bonus, no penalty for a saved shot
    });

    it('clamps minimum rating to 1 even with many negative events', () => {
      const player = createTestPlayer({ id: 'p1', position: Position.MIDFIELDER });
      const team = makeTeam([player]);
      const events = [
        makeEvent(EventType.RED_CARD, ['p1'], 10),
        makeEvent(EventType.FOUL, ['p1'], 5),
        makeEvent(EventType.FOUL, ['p1'], 8),
        makeEvent(EventType.MISS, ['p1'], 9)
      ];
      const state = makeMatchState(events, 10);
      // Red card at minute 10 → minutesPlayed = 10 (not 0), so rating is computed
      const [stats] = service.generatePlayerStatistics(state, team, [player]);

      expect(stats.rating).toBeGreaterThanOrEqual(1);
    });
  });

  describe('generatePlayerStatistics — minutesPlayed', () => {
    it('gives a starter who played the full match the full matchCurrentMinute', () => {
      const player = createTestPlayer({ id: 'p1' });
      const team = makeTeam([player]);
      const state = makeMatchState([], 90);

      const [stats] = service.generatePlayerStatistics(state, team, [player]);

      expect(stats.minutesPlayed).toBe(90);
    });

    it('gives a starter subbed off at minute 60 exactly 60 minutes', () => {
      const starter = createTestPlayer({ id: 'p1' });
      const sub = createTestPlayer({ id: 'sub1', role: Role.BENCH });
      const team = makeTeam([starter], [sub]);
      const state = makeMatchState(
        [makeEvent(EventType.SUBSTITUTION, ['p1', 'sub1'], 60)],
        90
      );

      const results = service.generatePlayerStatistics(state, team, [starter, sub]);
      const starterStats = results.find(s => s.playerId === 'p1')!;

      expect(starterStats.minutesPlayed).toBe(60);
    });

    it('gives a substitute who came on at minute 70 exactly 20 minutes', () => {
      const starter = createTestPlayer({ id: 'p1' });
      const sub = createTestPlayer({ id: 'sub1', role: Role.BENCH });
      const team = makeTeam([starter], [sub]);
      const state = makeMatchState(
        [makeEvent(EventType.SUBSTITUTION, ['p1', 'sub1'], 70)],
        90
      );

      const results = service.generatePlayerStatistics(state, team, [starter, sub]);
      const subStats = results.find(s => s.playerId === 'sub1')!;

      expect(subStats.minutesPlayed).toBe(20);
    });

    it('gives a starter sent off at minute 30 exactly 30 minutes', () => {
      const player = createTestPlayer({ id: 'p1' });
      const team = makeTeam([player]);
      const state = makeMatchState(
        [makeEvent(EventType.RED_CARD, ['p1'], 30)],
        90
      );

      const [stats] = service.generatePlayerStatistics(state, team, [player]);

      expect(stats.minutesPlayed).toBe(30);
    });

    it('gives a bench player who never entered 0 minutes', () => {
      const starter = createTestPlayer({ id: 'p1' });
      const bench = createTestPlayer({ id: 'bench1', role: Role.BENCH });
      const team = makeTeam([starter], [bench]);
      const state = makeMatchState([], 90);

      const results = service.generatePlayerStatistics(state, team, [starter, bench]);
      const benchStats = results.find(s => s.playerId === 'bench1')!;

      expect(benchStats.minutesPlayed).toBe(0);
    });

    it('gives a substitute sent off after coming on only their active minutes', () => {
      const starter = createTestPlayer({ id: 'p1' });
      const sub = createTestPlayer({ id: 'sub1', role: Role.BENCH });
      const team = makeTeam([starter], [sub]);
      const events = [
        makeEvent(EventType.SUBSTITUTION, ['p1', 'sub1'], 60),
        makeEvent(EventType.RED_CARD, ['sub1'], 80)
      ];
      const state = makeMatchState(events, 90);

      const results = service.generatePlayerStatistics(state, team, [starter, sub]);
      const subStats = results.find(s => s.playerId === 'sub1')!;

      expect(subStats.minutesPlayed).toBe(20); // 80 - 60
    });
  });
});
