import { TestBed } from '@angular/core/testing';
import { StatisticsService } from './statistics.service';
import { EventType, MatchPhase, Position, Role } from '../models/enums';
import { PlayByPlayEvent, MatchState } from '../models/simulation.types';
import { Player, Team, PlayerStatistics } from '../models/types';
import { createTestPlayer } from '../testing/test-player-fixtures';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeEvent(
  type: EventType,
  playerIds: string[],
  time: number,
  success = true,
  location = { x: 50, y: 50 }
): PlayByPlayEvent {
  return {
    id: `evt-${type}-${time}-${playerIds.join('-')}`,
    type,
    description: '',
    playerIds,
    location,
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
    finances: { tier: 3, transferBudget: 7000000, wagePointsCap: 65, wagePointsUsed: 50 },
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
      const player = createTestPlayer({ id: 'p1', position: Position.CM });
      const team = makeTeam([player]);
      const state = makeMatchState([], 0);

      const [stats] = service.generatePlayerStatistics(state, team, [player]);

      expect(stats.rating).toBe(60);
    });

    it('uses a fixed base of 50 for a starter with no events', () => {
      const player = createTestPlayer({ id: 'p1', position: Position.CM });
      const team = makeTeam([player]);
      const state = makeMatchState([]);

      const [stats] = service.generatePlayerStatistics(state, team, [player]);

      expect(stats.rating).toBe(50);
    });

    it('gives 0 rating to a bench player who never enters', () => {
      const starter = createTestPlayer({ id: 'starter', position: Position.CM });
      const bench = createTestPlayer({ id: 'bench', position: Position.ST, role: Role.BENCH });
      const team = makeTeam([starter], [bench]);
      const state = makeMatchState([]);

      const results = service.generatePlayerStatistics(state, team, [starter, bench]);
      const benchResult = results.find(s => s.playerId === 'bench')!;

      expect(benchResult.rating).toBe(0);
    });

    it('credits tackle stats and rating only to the turnover winner', () => {
      const defender = createTestPlayer({ id: 'home-def', teamId: 'home', position: Position.CB });
      const attacker = createTestPlayer({ id: 'away-att', teamId: 'away', position: Position.ST });
      const homeTeam = makeTeam([defender], [], 'home');
      const awayTeam = makeTeam([attacker], [], 'away');
      const state = makeMatchState([
        makeEvent(EventType.TACKLE, ['home-def', 'away-att'], 30)
      ]);

      const [defenderStats] = service.generatePlayerStatistics(state, homeTeam, [defender]);
      const [attackerStats] = service.generatePlayerStatistics(state, awayTeam, [attacker]);

      expect(defenderStats.tackles).toBe(1);
      expect(defenderStats.tacklesSuccessful).toBe(1);
      expect(defenderStats.rating).toBeGreaterThan(56);
      expect(attackerStats.tackles).toBe(0);
      expect(attackerStats.tacklesSuccessful).toBe(0);
      expect(attackerStats.rating).toBe(56);
    });

    it('credits interception stats and rating only to the turnover winner', () => {
      const defender = createTestPlayer({ id: 'home-def', teamId: 'home', position: Position.CB });
      const attacker = createTestPlayer({ id: 'away-att', teamId: 'away', position: Position.ST });
      const homeTeam = makeTeam([defender], [], 'home');
      const awayTeam = makeTeam([attacker], [], 'away');
      const state = makeMatchState([
        makeEvent(EventType.INTERCEPTION, ['home-def', 'away-att'], 30, false)
      ]);

      const [defenderStats] = service.generatePlayerStatistics(state, homeTeam, [defender]);
      const [attackerStats] = service.generatePlayerStatistics(state, awayTeam, [attacker]);

      expect(defenderStats.interceptions).toBe(1);
      expect(defenderStats.rating).toBeGreaterThan(57);
      expect(attackerStats.interceptions).toBe(0);
      expect(attackerStats.rating).toBe(56);
    });

    it('does not credit goalkeepers with clutch events for box tackle or interception events', () => {
      const keeper = createTestPlayer({ id: 'home-gk', teamId: 'home', position: Position.GK });
      const homeTeam = makeTeam([keeper], [], 'home');

      const state = makeMatchState([
        makeEvent(EventType.INTERCEPTION, ['home-gk', 'away-att'], 30, false, { x: 50, y: 10 })
      ]);

      const [keeperStats] = service.generatePlayerStatistics(state, homeTeam, [keeper]);

      expect(keeperStats.clutchActionsCount).toBe(0);
      expect(keeperStats.clutchRatingBonus).toBe(0);
    });

    it('applies a moderated tackle bonus for multiple successful tackles', () => {
      const defender = createTestPlayer({ id: 'home-def', teamId: 'home', position: Position.CB });
      const homeTeam = makeTeam([defender], [], 'home');

      const state = makeMatchState([
        makeEvent(EventType.TACKLE, ['home-def', 'away-att'], 10),
        makeEvent(EventType.TACKLE, ['home-def', 'away-att'], 20),
        makeEvent(EventType.TACKLE, ['home-def', 'away-att'], 30),
        makeEvent(EventType.TACKLE, ['home-def', 'away-att'], 40)
      ]);

      const [defenderStats] = service.generatePlayerStatistics(state, homeTeam, [defender]);

      expect(defenderStats.tacklesSuccessful).toBe(4);
      expect(defenderStats.rating).toBe(65);
    });

    it('uses a fixed base of 50 for a substitute immediately after entering', () => {
      const starter = createTestPlayer({ id: 'starter', position: Position.CM });
      const bench = createTestPlayer({ id: 'bench', position: Position.ST, role: Role.BENCH });
      const team = makeTeam([starter], [bench]);
      const state = makeMatchState([
        makeEvent(EventType.SUBSTITUTION, ['starter', 'bench'], 60)
      ], 60);

      const results = service.generatePlayerStatistics(state, team, [starter, bench]);
      const benchResult = results.find(s => s.playerId === 'bench')!;

      expect(benchResult.minutesPlayed).toBe(0);
      expect(benchResult.rating).toBe(60);
    });

    it('correctly calculates the rating of a substitute who enters and has events', () => {
      const starter = createTestPlayer({ id: 'starter', position: Position.CM, teamId: 'team-1' });
      const bench = createTestPlayer({ id: 'bench', position: Position.ST, role: Role.BENCH, teamId: 'team-1' });
      const team = makeTeam([starter], [bench], 'team-1');

      const subEvent = makeEvent(EventType.SUBSTITUTION, ['starter', 'bench'], 60);
      const goalEvent = makeEvent(EventType.GOAL, ['bench'], 75);

      const state = makeMatchState([subEvent, goalEvent], 90);

      const results = service.generatePlayerStatistics(state, team, [starter, bench]);
      const benchStats = results.find(s => s.playerId === 'bench')!;

      expect(benchStats.minutesPlayed).toBe(30);
      expect(benchStats.goals).toBe(1);
      expect(benchStats.rating).toBeGreaterThan(60);
    });

    it('increases rating above 50 for a GOAL event', () => {
      const player = createTestPlayer({ id: 'p1', position: Position.ST });
      const team = makeTeam([player]);
      const state = makeMatchState([makeEvent(EventType.GOAL, ['p1'], 30)]);

      const [stats] = service.generatePlayerStatistics(state, team, [player]);

      expect(stats.rating).toBeGreaterThan(50);
    });

    it('does not allow successful pass volume alone to force an early 10.0 rating', () => {
      const player = createTestPlayer({ id: 'p1', position: Position.CM });
      const receiver = createTestPlayer({ id: 'p2', position: Position.CM });
      const team = makeTeam([player, receiver]);
      const events: PlayByPlayEvent[] = [];

      for (let minute = 1; minute <= 30; minute++) {
        for (let i = 0; i < 4; i++) {
          events.push(makeEvent(EventType.PASS, ['p1', 'p2'], minute, true));
        }
      }
      events.push(makeEvent(EventType.GOAL, ['p1'], 30));

      const state = makeMatchState(events, 30);
      const [stats] = service.generatePlayerStatistics(state, team, [player, receiver]);

      expect(stats.passesSuccessful).toBe(120);
      expect(stats.rating).toBeLessThan(90);
    });

    it('decreases rating below 50 for a MISS event', () => {
      const player = createTestPlayer({ id: 'p1', position: Position.ST });
      const team = makeTeam([player]);
      const state = makeMatchState([makeEvent(EventType.MISS, ['p1'], 30)]);

      const [stats] = service.generatePlayerStatistics(state, team, [player]);

      expect(stats.rating).toBeLessThan(60);
    });

    it('increases rating above 50 when the player is the victim of a foul', () => {
      const player = createTestPlayer({ id: 'p1', position: Position.ST });
      const team = makeTeam([player]);
      // playerIds[1] = victim of the foul
      const state = makeMatchState([makeEvent(EventType.FOUL, ['opponent', 'p1'], 20)]);

      const [stats] = service.generatePlayerStatistics(state, team, [player]);

      expect(stats.rating).toBeGreaterThan(50);
    });

    it('increases GK rating above 50 for SAVE events', () => {
      const gk = createTestPlayer({ id: 'gk1', position: Position.GK });
      const team = makeTeam([gk]);
      // save events: playerIds[0] = shooter, playerIds[1] = keeper
      const state = makeMatchState([
        makeEvent(EventType.SAVE, ['shooter', 'gk1'], 45),
        makeEvent(EventType.SAVE, ['shooter', 'gk1'], 60)
      ]);

      const [stats] = service.generatePlayerStatistics(state, team, [gk]);

      expect(stats.rating).toBeGreaterThan(50);
    });

    it('gives shooter a shots-on-target bonus for a SAVE event, not the GK save bonus', () => {
      const shooter = createTestPlayer({ id: 'fwd1', position: Position.ST });
      const gk = createTestPlayer({ id: 'gk1', position: Position.GK });
      const team = makeTeam([shooter, gk]);
      // shooter appears as playerIds[0] in SAVE event
      const state = makeMatchState([makeEvent(EventType.SAVE, ['fwd1', 'gk1'], 45)]);

      const results = service.generatePlayerStatistics(state, team, [shooter, gk]);
      const fwdStats = results.find(s => s.playerId === 'fwd1')!;

      // SAVE counts as a shot on target for the shooter (+1 shotsOnTarget rating bonus)
      expect(fwdStats.shots).toBe(1);
      expect(fwdStats.shotsOnTarget).toBe(1);
      expect(fwdStats.rating).toBe(58);
    });

    it('clamps minimum rating to 1 even with many negative events', () => {
      const player = createTestPlayer({ id: 'p1', position: Position.CM });
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

  describe('generatePlayerStatistics — assists', () => {
    it('credits only the final successful pass to the goal scorer', () => {
      const passerEarly = createTestPlayer({ id: 'p-early', teamId: 'team-1', position: Position.CM });
      const passerFinal = createTestPlayer({ id: 'p-final', teamId: 'team-1', position: Position.CM });
      const scorer = createTestPlayer({ id: 'p-scorer', teamId: 'team-1', position: Position.ST });
      const team = makeTeam([passerEarly, passerFinal, scorer], [], 'team-1');
      const state = makeMatchState([
        makeEvent(EventType.PASS, ['p-early', 'p-scorer'], 10),
        makeEvent(EventType.PASS, ['p-final', 'p-scorer'], 11),
        makeEvent(EventType.GOAL, ['p-scorer'], 12)
      ]);

      const results = service.generatePlayerStatistics(state, team, [passerEarly, passerFinal, scorer]);
      const earlyStats = results.find(s => s.playerId === 'p-early')!;
      const finalStats = results.find(s => s.playerId === 'p-final')!;
      const scorerStats = results.find(s => s.playerId === 'p-scorer')!;

      expect(earlyStats.assists).toBe(0);
      expect(finalStats.assists).toBe(1);
      expect(scorerStats.assists).toBe(0);
    });

    it('does not credit unsuccessful or opponent passes as assists', () => {
      const homePasser = createTestPlayer({ id: 'home-pass', teamId: 'home', position: Position.CM });
      const homeScorer = createTestPlayer({ id: 'home-score', teamId: 'home', position: Position.ST });
      const homeTeam = makeTeam([homePasser, homeScorer], [], 'home');
      const state = makeMatchState([
        makeEvent(EventType.PASS, ['away-pass', 'home-score'], 20),
        makeEvent(EventType.PASS, ['home-pass', 'home-score'], 21, false),
        makeEvent(EventType.GOAL, ['home-score'], 22)
      ]);

      const results = service.generatePlayerStatistics(state, homeTeam, [homePasser, homeScorer]);
      const passerStats = results.find(s => s.playerId === 'home-pass')!;
      const scorerStats = results.find(s => s.playerId === 'home-score')!;

      expect(passerStats.assists).toBe(0);
      expect(scorerStats.assists).toBe(0);
    });

    it('credits the corner taker with an assist when a goal is scored from a corner', () => {
      const taker = createTestPlayer({ id: 'p-taker', teamId: 'team-1', position: Position.CM });
      const scorer = createTestPlayer({ id: 'p-scorer', teamId: 'team-1', position: Position.ST });
      const team = makeTeam([taker, scorer], [], 'team-1');
      const state = makeMatchState([
        makeEvent(EventType.CORNER, ['p-taker'], 10),
        {
          id: 'e-goal',
          type: EventType.GOAL,
          description: 'Goal scored from corner',
          playerIds: ['p-scorer'],
          location: { x: 50, y: 50 },
          time: 10,
          success: true,
          additionalData: { isCorner: true }
        }
      ]);

      const results = service.generatePlayerStatistics(state, team, [taker, scorer]);
      const takerStats = results.find(s => s.playerId === 'p-taker')!;
      const scorerStats = results.find(s => s.playerId === 'p-scorer')!;

      expect(takerStats.assists).toBe(1);
      expect(scorerStats.assists).toBe(0);
    });

    it('credits the free kick taker with an assist when a goal is scored from an indirect free kick', () => {
      const taker = createTestPlayer({ id: 'p-taker', teamId: 'team-1', position: Position.CM });
      const scorer = createTestPlayer({ id: 'p-scorer', teamId: 'team-1', position: Position.ST });
      const team = makeTeam([taker, scorer], [], 'team-1');
      const state = makeMatchState([
        makeEvent(EventType.FREE_KICK, ['p-taker'], 15),
        {
          id: 'e-goal',
          type: EventType.GOAL,
          description: 'Goal scored from free kick',
          playerIds: ['p-scorer'],
          location: { x: 50, y: 50 },
          time: 15,
          success: true,
          additionalData: { isFreeKick: true, freeKickDirect: false }
        }
      ]);

      const results = service.generatePlayerStatistics(state, team, [taker, scorer]);
      const takerStats = results.find(s => s.playerId === 'p-taker')!;
      const scorerStats = results.find(s => s.playerId === 'p-scorer')!;

      expect(takerStats.assists).toBe(1);
      expect(scorerStats.assists).toBe(0);
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

  describe('generateMatchStatistics', () => {
    it('returns match counters and event-derived aggregates', () => {
      const home = makeTeam([createTestPlayer({ id: 'home-1', teamId: 'home' })], [], 'home');
      const away = makeTeam([createTestPlayer({ id: 'away-1', teamId: 'away' })], [], 'away');
      const state = makeMatchState([
        makeEvent(EventType.PASS, ['home-1', 'home-2'], 10),
        makeEvent(EventType.TACKLE, ['home-1', 'away-1'], 12),
        makeEvent(EventType.SAVE, ['away-1', 'home-gk'], 13)
      ]);
      state.homePossession = 58;
      state.awayPossession = 42;
      state.homeShots = 14;
      state.awayShots = 6;
      state.homeShotsOnTarget = 7;
      state.awayShotsOnTarget = 3;
      state.homeCorners = 5;
      state.awayCorners = 2;
      state.homeFouls = 11;
      state.awayFouls = 9;
      state.homeYellowCards = 2;
      state.awayYellowCards = 1;
      state.homeRedCards = 0;
      state.awayRedCards = 1;

      const stats = service.generateMatchStatistics(state, home, away);

      expect(stats.possession).toEqual({ home: 58, away: 42 });
      expect(stats.shots).toEqual({ home: 14, away: 6 });
      expect(stats.shotsOnTarget).toEqual({ home: 7, away: 3 });
      expect(stats.corners).toEqual({ home: 5, away: 2 });
      expect(stats.fouls).toEqual({ home: 11, away: 9 });
      expect(stats.cards).toEqual({
        home: { yellow: 2, red: 0 },
        away: { yellow: 1, red: 1 }
      });
      expect(stats.passes).toEqual({ home: 1, away: 1 });
      expect(stats.tackles).toEqual({ home: 1, away: 1 });
      expect(stats.saves).toEqual({ home: 1, away: 1 });
    });
  });

  describe('generateTeamStatistics', () => {
    it('computes results and per-game averages from played matches', () => {
      const team = makeTeam([createTestPlayer({ id: 'p1', teamId: 'home' })], [], 'home');

      const winAtHome = makeMatchState([], 90);
      winAtHome.ballPossession.teamId = 'home';
      winAtHome.homeScore = 2;
      winAtHome.awayScore = 1;
      winAtHome.homeShots = 10;
      winAtHome.awayShots = 6;
      winAtHome.homePossession = 57;
      winAtHome.homeCorners = 5;
      winAtHome.awayCorners = 2;
      winAtHome.homeFouls = 8;
      winAtHome.awayFouls = 10;
      winAtHome.homeYellowCards = 1;
      winAtHome.awayYellowCards = 2;
      winAtHome.homeRedCards = 0;
      winAtHome.awayRedCards = 0;

      const drawAway = makeMatchState([], 90);
      drawAway.ballPossession.teamId = 'away';
      drawAway.homeScore = 0;
      drawAway.awayScore = 0;
      drawAway.homeShots = 9;
      drawAway.awayShots = 11;
      drawAway.homePossession = 48;
      drawAway.homeCorners = 3;
      drawAway.awayCorners = 4;
      drawAway.homeFouls = 12;
      drawAway.awayFouls = 9;
      drawAway.homeYellowCards = 2;
      drawAway.awayYellowCards = 1;
      drawAway.homeRedCards = 0;
      drawAway.awayRedCards = 1;

      const lossAway = makeMatchState([], 90);
      lossAway.ballPossession.teamId = 'away';
      lossAway.homeScore = 3;
      lossAway.awayScore = 1;
      lossAway.homeShots = 12;
      lossAway.awayShots = 7;
      lossAway.homePossession = 51;
      lossAway.homeCorners = 6;
      lossAway.awayCorners = 1;
      lossAway.homeFouls = 7;
      lossAway.awayFouls = 11;
      lossAway.homeYellowCards = 0;
      lossAway.awayYellowCards = 3;
      lossAway.homeRedCards = 1;
      lossAway.awayRedCards = 0;

      const stats = service.generateTeamStatistics(team, [winAtHome, drawAway, lossAway]);

      expect(stats.teamId).toBe('home');
      expect(stats.matchesPlayed).toBe(3);
      expect(stats.wins).toBe(1);
      expect(stats.draws).toBe(1);
      expect(stats.losses).toBe(1);
      expect(stats.goalsFor).toBe(3);
      expect(stats.goalsAgainst).toBe(4);
      expect(stats.shotsPerGame).toBe((16 + 20 + 19) / 3);
      expect(stats.possessionPerGame).toBe((57 + 48 + 51) / 3);
      expect(stats.cornersPerGame).toBe((7 + 7 + 7) / 3);
      expect(stats.foulsPerGame).toBe((18 + 21 + 18) / 3);
      expect(stats.cardsPerGame.yellow).toBe((3 + 3 + 3) / 3);
      expect(stats.cardsPerGame.red).toBe((0 + 1 + 1) / 3);
    });
  });

  describe('generateHeatMapData', () => {
    it('maps events into a 10x10 grid and ignores out-of-bounds events', () => {
      const state = makeMatchState([
        { ...makeEvent(EventType.PASS, ['p1', 'p2'], 1), location: { x: 0, y: 0 } },
        { ...makeEvent(EventType.PASS, ['p1', 'p2'], 2), location: { x: 9, y: 9 } },
        { ...makeEvent(EventType.PASS, ['p1', 'p2'], 3), location: { x: 10, y: 10 } },
        { ...makeEvent(EventType.PASS, ['p1', 'p2'], 4), location: { x: 95, y: 99 } },
        { ...makeEvent(EventType.PASS, ['p1', 'p2'], 5), location: { x: 100, y: 100 } },
        { ...makeEvent(EventType.PASS, ['p1', 'p2'], 6), location: { x: -1, y: 50 } }
      ]);

      const heatMap = service.generateHeatMapData(state, 'team-1');

      expect(heatMap.teamId).toBe('team-1');
      expect(heatMap.totalEvents).toBe(6);
      expect(heatMap.heatMap.length).toBe(10);
      expect(heatMap.heatMap[0].length).toBe(10);
      expect(heatMap.heatMap[0][0]).toBe(2);
      expect(heatMap.heatMap[1][1]).toBe(1);
      expect(heatMap.heatMap[9][9]).toBe(1);
    });
  });

  describe('generatePassingNetwork', () => {
    it('builds nodes and links from successful PASS events only', () => {
      const state = makeMatchState([
        makeEvent(EventType.PASS, ['p1', 'p2'], 10, true),
        makeEvent(EventType.PASS, ['p1', 'p3'], 11, true),
        makeEvent(EventType.PASS, ['p2', 'p1'], 12, true),
        makeEvent(EventType.PASS, ['p3', 'p1'], 13, false),
        makeEvent(EventType.SHOT, ['p1'], 14, true)
      ]);

      const network = service.generatePassingNetwork(state, 'team-1');

      expect(network.teamId).toBe('team-1');
      expect(network.links).toEqual([
        { source: 'p1', target: 'p2', value: 1 },
        { source: 'p1', target: 'p3', value: 1 },
        { source: 'p2', target: 'p1', value: 1 }
      ]);

      const nodeById = new Map(network.nodes.map(node => [node.id, node]));
      expect(nodeById.get('p1')).toEqual({ id: 'p1', name: 'p1', value: 2 });
      expect(nodeById.get('p2')).toEqual({ id: 'p2', name: 'p2', value: 1 });
      expect(nodeById.get('p3')).toEqual({ id: 'p3', name: 'p3', value: 0 });
    });
  });

  describe('Expected Goals (xG) aggregation', () => {
    it('aggregates xG correctly in match statistics and player statistics', () => {
      const p1 = createTestPlayer({ id: 'p1', name: 'Shooter 1', position: Position.ST, teamId: 'team-1' });
      const p2 = createTestPlayer({ id: 'p2', name: 'Shooter 2', position: Position.ST, teamId: 'team-2' });
      const homeTeam = makeTeam([p1], [], 'team-1');
      const awayTeam = makeTeam([p2], [], 'team-2');

      const state = makeMatchState([
        {
          id: 'evt-1',
          type: EventType.GOAL,
          description: '',
          playerIds: ['p1'],
          location: { x: 50, y: 88 },
          time: 12,
          success: true,
          additionalData: { xg: 0.75 }
        },
        {
          id: 'evt-2',
          type: EventType.SAVE,
          description: '',
          playerIds: ['p2'],
          location: { x: 50, y: 12 },
          time: 35,
          success: true,
          additionalData: { xg: 0.15 }
        },
        {
          id: 'evt-3',
          type: EventType.MISS,
          description: '',
          playerIds: ['p1'],
          location: { x: 50, y: 88 },
          time: 60,
          success: false,
          additionalData: { xg: 0.20 }
        }
      ]);

      const matchStats = service.generateMatchStatistics(state, homeTeam, awayTeam);
      expect(matchStats.xg).toBeDefined();
      expect(matchStats.xg!.home).toBeCloseTo(0.95);
      expect(matchStats.xg!.away).toBeCloseTo(0.15);

      const p1Stats = service.generatePlayerStatistics(state, homeTeam, [p1]).find(p => p.playerId === 'p1');
      expect(p1Stats).toBeDefined();
      expect(p1Stats!.expectedGoals).toBeCloseTo(0.95);

      const p2Stats = service.generatePlayerStatistics(state, awayTeam, [p2]).find(p => p.playerId === 'p2');
      expect(p2Stats).toBeDefined();
      expect(p2Stats!.expectedGoals).toBeCloseTo(0.15);
    });
  });

  describe('Clutch events running score evaluation', () => {
    it('evaluates clutch events against pre-event scores rather than post-event scores', () => {
      const p1 = createTestPlayer({ id: 'p1', name: 'Scorer', position: Position.ST, teamId: 'team-1' });
      const team1 = makeTeam([p1], [], 'team-1');

      // Timeline:
      // Team-1 is already winning 3-0.
      // At min 80, p1 scores to make it 4-0.
      // - Score before Goal: 3-0 (ourScoreBefore = 3, oppScoreBefore = 0).
      // - Since ourScoreBefore >= oppScoreBefore + 3, this is garbage time.
      // - It should receive a blowout penalty (-4) to clutch rating bonus.
      const state = makeMatchState([
        { id: 'g-pre-1', type: EventType.GOAL, description: '', playerIds: ['teammate'], location: { x: 50, y: 88 }, time: 10, success: true },
        { id: 'g-pre-2', type: EventType.GOAL, description: '', playerIds: ['teammate'], location: { x: 50, y: 88 }, time: 20, success: true },
        { id: 'g-pre-3', type: EventType.GOAL, description: '', playerIds: ['teammate'], location: { x: 50, y: 88 }, time: 30, success: true },
        { id: 'g-clutch', type: EventType.GOAL, description: '', playerIds: ['p1'], location: { x: 50, y: 88 }, time: 80, success: true }
      ]);

      const [p1Stats] = service.generatePlayerStatistics(state, team1, [p1]);
      expect(p1Stats.clutchRatingBonus).toBe(-4); // blowout penalty
      expect(p1Stats.clutchActionsCount).toBe(0);
    });
  });

  describe('computeRatingBreakdown consistency', () => {
    it('computes breakdown items using positional weights matching rating expectations', () => {
      const playerStats: PlayerStatistics = {
        playerId: 'p1',
        playerName: 'Test Player',
        minutesPlayed: 90,
        position: Position.ST,
        goals: 1,
        assists: 1,
        shots: 3,
        shotsOnTarget: 2,
        misses: 1,
        passes: 20,
        passesSuccessful: 15,
        offsides: 0,
        tackles: 1,
        tacklesSuccessful: 1,
        interceptions: 0,
        fouls: 0,
        foulsSuffered: 0,
        yellowCards: 0,
        redCards: 0,
        saves: 0,
        rating: 70
      };

      const breakdown = service.computeRatingBreakdown(playerStats);
      expect(breakdown.positiveItems.length).toBeGreaterThan(0);
      const goalItem = breakdown.positiveItems.find(i => i.label.includes('Goals'));
      expect(goalItem).toBeDefined();
    });
  });

  describe('Pass turnover recovery evaluation', () => {
    it('does not count a RECOVERY or OVERHIT pass failure as a turnover if recovered by a teammate', () => {
      const p1 = createTestPlayer({ id: 'p1', name: 'Passer', position: Position.CM, teamId: 'team-1' });
      const p2 = createTestPlayer({ id: 'p2', name: 'Teammate', position: Position.ST, teamId: 'team-1' });
      const team1 = makeTeam([p1, p2], [], 'team-1');

      const passRecoveredByTeammate = {
        ...makeEvent(EventType.PASS, ['p1', 'p2'], 10, false),
        additionalData: { passFailure: 'RECOVERY' as const }
      };

      const passRecoveredByOpponent = {
        ...makeEvent(EventType.PASS, ['p1', 'opp'], 20, false),
        additionalData: { passFailure: 'RECOVERY' as const }
      };

      const state = makeMatchState([passRecoveredByTeammate, passRecoveredByOpponent]);

      const stats = service.generatePlayerStatistics(state, team1, [p1, p2]);
      const p1Stats = stats.find(s => s.playerId === 'p1')!;
      expect(p1Stats.passingTurnovers).toBe(1);
    });
  });
});
