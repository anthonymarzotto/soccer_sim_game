import { TestBed } from '@angular/core/testing';
import { MatchSimulationVariantBService } from './match.simulation.variant-b.service';
import { FieldService } from './field.service';
import { FormationLibraryService } from './formation-library.service';
import { CommentaryService } from './commentary.service';
import { StatisticsService } from './statistics.service';
import { Role, Position as PositionEnum, CommentaryStyle, EventType, TeamSide } from '../models/enums';
import { Player, Team } from '../models/types';
import { PlayByPlayEvent, SimulationConfig } from '../models/simulation.types';
import { createEmptyPlayerCareerStats } from '../models/player-career-stats';
import { SimulationABReporter } from '../testing/simulation-ab.reporter';
import { SimulationABRunner, SimulationABVariant } from '../testing/simulation-ab.runner';

describe('Match Simulation Variant B Guardrails', () => {
  let simulationB: MatchSimulationVariantBService;
  let homeTeam: Team;
  let awayTeam: Team;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MatchSimulationVariantBService,
        FieldService,
        FormationLibraryService,
        CommentaryService,
        StatisticsService
      ]
    });

    simulationB = TestBed.inject(MatchSimulationVariantBService);

    const homePlayers = create442Players('home');
    const awayPlayers = create442Players('away');
    homeTeam = createTeam('home', homePlayers);
    awayTeam = createTeam('away', awayPlayers);
  });

  it('should generate a Variant B report and stay within acceptance bands', async () => {
    const runner = new SimulationABRunner();
    const reporter = new SimulationABReporter();
    const variants: SimulationABVariant[] = [
      { name: 'Current Variant B', variant: 'B', seedPrefix: 'guardrail-b' }
    ];

    const iterations = 30;
    const passQualityTotals = {
      attempts: 0,
      completed: 0,
      progressionCompleted: 0,
      turnovers: 0
    };

    const report = await runner.run(iterations, variants, async (variant, seed) => {
      const config: SimulationConfig = {
        enablePlayByPlay: true,
        enableSpatialTracking: true,
        enableTactics: true,
        enableFatigue: true,
        commentaryStyle: CommentaryStyle.DETAILED,
        simulationVariant: variant.variant,
        seed,
        ...(variant.configOverrides ?? {})
      };

      const match = {
        id: `${variant.variant}-${seed}`,
        week: 1,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        played: false
      };

      const state =
        simulationB.simulateMatch(match, homeTeam, awayTeam, config);

      const quality = calculatePassQuality(state.events);
      passQualityTotals.attempts += quality.attempts;
      passQualityTotals.completed += quality.completed;
      passQualityTotals.progressionCompleted += quality.progressionCompleted;
      passQualityTotals.turnovers += quality.turnovers;

      return {
        homeScore: state.homeScore,
        awayScore: state.awayScore,
        homeShots: state.homeShots,
        awayShots: state.awayShots,
        homeShotsOnTarget: state.homeShotsOnTarget,
        awayShotsOnTarget: state.awayShotsOnTarget,
        eventsLength: state.events.length
      };
    });

    const json = reporter.toJson(report);
    const outputPath = await reporter.writeJsonReport(report);
    const parsed = JSON.parse(json) as { rows: unknown[]; summary: unknown[] };

    expect(parsed.rows.length).toBe(iterations * variants.length);
    expect(parsed.summary.length).toBe(variants.length);
    expect(report.summary.every(item => item.matches === iterations)).toBe(true);
    expect(report.rows[0].seed.length).toBeGreaterThan(0);
    expect(outputPath.endsWith('.json')).toBe(true);
    expect(outputPath.includes('test-output')).toBe(true);

    const variantBSummary = report.summary.find(item => item.variant === 'B');
    expect(variantBSummary).toBeDefined();
    expect((variantBSummary?.avgTotalGoals ?? 0)).toBeGreaterThanOrEqual(2.4);
    expect((variantBSummary?.avgTotalGoals ?? 0)).toBeLessThanOrEqual(2.9);
    expect((variantBSummary?.avgShots ?? 0)).toBeGreaterThanOrEqual(20);
    expect((variantBSummary?.avgShots ?? 0)).toBeLessThanOrEqual(30);
    expect((variantBSummary?.avgEvents ?? 0)).toBeGreaterThan(120);

    const completionRate = passQualityTotals.attempts > 0
      ? passQualityTotals.completed / passQualityTotals.attempts
      : 0;
    const progressionShare = passQualityTotals.completed > 0
      ? passQualityTotals.progressionCompleted / passQualityTotals.completed
      : 0;
    const turnoverShare = passQualityTotals.attempts > 0
      ? passQualityTotals.turnovers / passQualityTotals.attempts
      : 0;

    expect(passQualityTotals.attempts).toBeGreaterThan(300);
    expect(completionRate).toBeGreaterThanOrEqual(0.6);
    expect(completionRate).toBeLessThanOrEqual(0.9);
    expect(progressionShare).toBeGreaterThanOrEqual(0.1);
    expect(progressionShare).toBeLessThanOrEqual(0.75);
    expect(turnoverShare).toBeGreaterThanOrEqual(0.1);
    expect(turnoverShare).toBeLessThanOrEqual(0.4);

    const fs = await import('fs/promises');
    const saved = await fs.readFile(outputPath, 'utf-8');
    expect(saved.length).toBeGreaterThan(0);
  });

  it('should shift late-game behavior by scoreline state without breaking metadata', () => {
    const iterations = 90;
    const combined = createCombinedLateGameMetrics();

    for (let i = 0; i < iterations; i++) {
      const config: SimulationConfig = {
        enablePlayByPlay: true,
        enableSpatialTracking: true,
        enableTactics: true,
        enableFatigue: true,
        commentaryStyle: CommentaryStyle.DETAILED,
        simulationVariant: 'B',
        seed: `late-game-${i}`
      };

      const match = {
        id: `late-game-${i}`,
        week: 1,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        played: false
      };

      const state = simulationB.simulateMatch(match, homeTeam, awayTeam, config);
      const perMatch = calculateLateGameBehaviorMetrics(state.events);
      mergeLateGameMetrics(combined, perMatch);
    }

    expect(combined.trailing.late.passAttempts).toBeGreaterThan(200);
    expect(combined.trailing.early.passAttempts).toBeGreaterThan(200);
    expect(combined.leading.late.passAttempts).toBeGreaterThan(200);

    const trailingLateShotShare = getShotShare(combined.trailing.late);
    const trailingEarlyShotShare = getShotShare(combined.trailing.early);
    const trailingLateDirectShare = getDirectPassShare(combined.trailing.late);
    const trailingEarlyDirectShare = getDirectPassShare(combined.trailing.early);
    const trailingLateRecycleShare = getRecycleShare(combined.trailing.late);
    const trailingEarlyRecycleShare = getRecycleShare(combined.trailing.early);

    expect(trailingLateShotShare).toBeGreaterThanOrEqual(trailingEarlyShotShare);
    expect(trailingLateDirectShare).toBeGreaterThan(trailingEarlyDirectShare);
    expect(trailingLateRecycleShare).toBeLessThan(trailingEarlyRecycleShare);

    const leadingLateRecycleShare = getRecycleShare(combined.leading.late);
    const leadingLateDirectShare = getDirectPassShare(combined.leading.late);
    const leadingLateShotShare = getShotShare(combined.leading.late);

    expect(leadingLateRecycleShare).toBeGreaterThan(0.75);
    expect(leadingLateDirectShare).toBeLessThan(trailingLateDirectShare);
    expect(leadingLateShotShare).toBeLessThanOrEqual(trailingLateShotShare);

    const homeTrailingLateDirectShare = getDirectPassShare(combined.homeTrailing.late);
    const homeTrailingEarlyDirectShare = getDirectPassShare(combined.homeTrailing.early);
    const awayTrailingLateDirectShare = getDirectPassShare(combined.awayTrailing.late);
    const awayTrailingEarlyDirectShare = getDirectPassShare(combined.awayTrailing.early);

    expect(combined.homeTrailing.late.passAttempts).toBeGreaterThan(80);
    expect(combined.awayTrailing.late.passAttempts).toBeGreaterThan(80);
    expect(homeTrailingLateDirectShare).toBeGreaterThanOrEqual(homeTrailingEarlyDirectShare);
    expect(awayTrailingLateDirectShare).toBeGreaterThanOrEqual(awayTrailingEarlyDirectShare);

    expect(combined.metadata.passWithIntent).toBeGreaterThan(2000);
    expect(combined.metadata.failedPassTurnovers).toBeGreaterThan(300);
    expect(combined.metadata.carryDispossessed).toBeGreaterThan(80);
  });

  it('should favor the full-strength side against a reduced-shape opponent', () => {
    const iterations = 60;
    const reducedAwayTeam = createReducedShapeTeam(
      createReducedShapeTeam(awayTeam, 'away-fwd2', 'att_r'),
      'away-mid4',
      'mid_r'
    );

    let baselineAwayGoals = 0;
    let reducedAwayGoals = 0;
    let baselineAwayShotsOnTarget = 0;
    let reducedAwayShotsOnTarget = 0;

    for (let i = 0; i < iterations; i++) {
      const baselineConfig: SimulationConfig = {
        enablePlayByPlay: true,
        enableSpatialTracking: true,
        enableTactics: true,
        enableFatigue: true,
        commentaryStyle: CommentaryStyle.DETAILED,
        simulationVariant: 'B',
        seed: `reduced-shape-${i}`
      };

      const reducedConfig: SimulationConfig = {
        ...baselineConfig,
        seed: `reduced-shape-${i}`
      };

      const baselineMatch = {
        id: `reduced-shape-baseline-${i}`,
        week: 1,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        played: false
      };

      const reducedMatch = {
        id: `reduced-shape-${i}`,
        week: 1,
        homeTeamId: homeTeam.id,
        awayTeamId: reducedAwayTeam.id,
        played: false
      };

      const baselineState = simulationB.simulateMatch(baselineMatch, homeTeam, awayTeam, baselineConfig);
      const reducedState = simulationB.simulateMatch(reducedMatch, homeTeam, reducedAwayTeam, reducedConfig);

      baselineAwayGoals += baselineState.awayScore;
      reducedAwayGoals += reducedState.awayScore;
      baselineAwayShotsOnTarget += baselineState.awayShotsOnTarget;
      reducedAwayShotsOnTarget += reducedState.awayShotsOnTarget;
    }

    const avgBaselineAwayGoals = baselineAwayGoals / iterations;
    const avgReducedAwayGoals = reducedAwayGoals / iterations;
    const avgBaselineAwayShotsOnTarget = baselineAwayShotsOnTarget / iterations;
    const avgReducedAwayShotsOnTarget = reducedAwayShotsOnTarget / iterations;

    expect(avgReducedAwayGoals).toBeLessThan(avgBaselineAwayGoals);
    expect(avgReducedAwayShotsOnTarget).toBeLessThan(avgBaselineAwayShotsOnTarget);
  });

  it('should keep central-spine depletion scenarios within stable guardrail bounds', () => {
    const iterations = 60;
    const reducedAwayTeam = createReducedShapeTeam(
      createReducedShapeTeam(awayTeam, 'away-def2', 'def_lc'),
      'away-def3',
      'def_rc'
    );

    let baselineAwayGoals = 0;
    let reducedAwayGoals = 0;
    let reducedTotalGoals = 0;
    let reducedTotalShots = 0;

    for (let i = 0; i < iterations; i++) {
      const baselineConfig: SimulationConfig = {
        enablePlayByPlay: true,
        enableSpatialTracking: true,
        enableTactics: true,
        enableFatigue: true,
        commentaryStyle: CommentaryStyle.DETAILED,
        simulationVariant: 'B',
        seed: `reduced-spine-${i}`
      };

      const reducedConfig: SimulationConfig = {
        ...baselineConfig,
        seed: `reduced-spine-${i}`
      };

      const baselineMatch = {
        id: `reduced-spine-baseline-${i}`,
        week: 1,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        played: false
      };

      const reducedMatch = {
        id: `reduced-spine-${i}`,
        week: 1,
        homeTeamId: homeTeam.id,
        awayTeamId: reducedAwayTeam.id,
        played: false
      };

      const baselineState = simulationB.simulateMatch(baselineMatch, homeTeam, awayTeam, baselineConfig);
      const reducedState = simulationB.simulateMatch(reducedMatch, homeTeam, reducedAwayTeam, reducedConfig);

      baselineAwayGoals += baselineState.awayScore;
      reducedAwayGoals += reducedState.awayScore;
      reducedTotalGoals += reducedState.homeScore + reducedState.awayScore;
      reducedTotalShots += reducedState.homeShots + reducedState.awayShots;
    }

    const avgBaselineAwayGoals = baselineAwayGoals / iterations;
    const avgReducedAwayGoals = reducedAwayGoals / iterations;
    const avgReducedTotalGoals = reducedTotalGoals / iterations;
    const avgReducedTotalShots = reducedTotalShots / iterations;

    expect(avgReducedAwayGoals).toBeLessThanOrEqual(avgBaselineAwayGoals + 0.35);
    expect(avgReducedTotalGoals).toBeGreaterThan(1.8);
    expect(avgReducedTotalGoals).toBeLessThan(4.1);
    expect(avgReducedTotalShots).toBeGreaterThan(18);
    expect(avgReducedTotalShots).toBeLessThan(33);
  });

  it('should not produce goalkeeper scorers in standard simulations', () => {
    const iterations = 60;
    let goalkeeperGoals = 0;
    const playersById = new Map<string, Player>([
      ...homeTeam.players.map(player => [player.id, player] as const),
      ...awayTeam.players.map(player => [player.id, player] as const)
    ]);

    for (let i = 0; i < iterations; i++) {
      const config: SimulationConfig = {
        enablePlayByPlay: true,
        enableSpatialTracking: true,
        enableTactics: true,
        enableFatigue: true,
        commentaryStyle: CommentaryStyle.DETAILED,
        simulationVariant: 'B',
        seed: `gk-goal-guard-${i}`
      };

      const match = {
        id: `gk-goal-guard-${i}`,
        week: 1,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        played: false
      };

      const state = simulationB.simulateMatch(match, homeTeam, awayTeam, config);
      goalkeeperGoals += state.events.filter((event) => {
        if (event.type !== EventType.GOAL) {
          return false;
        }

        const scorer = playersById.get(event.playerIds[0] ?? '');
        return scorer?.position === PositionEnum.GOALKEEPER;
      }).length;
    }

    expect(goalkeeperGoals).toBe(0);
  });

  it('should not credit goalkeepers with tackles in player statistics', () => {
    const iterations = 30;
    const statisticsService = TestBed.inject(StatisticsService);

    for (let i = 0; i < iterations; i++) {
      const config: SimulationConfig = {
        enablePlayByPlay: true,
        enableSpatialTracking: true,
        enableTactics: true,
        enableFatigue: true,
        commentaryStyle: CommentaryStyle.DETAILED,
        simulationVariant: 'B',
        seed: `gk-tackle-guard-${i}`
      };

      const match = {
        id: `gk-tackle-guard-${i}`,
        week: 1,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        played: false
      };

      const state = simulationB.simulateMatch(match, homeTeam, awayTeam, config);
      const homeStats = statisticsService.generatePlayerStatistics(state, homeTeam);
      const awayStats = statisticsService.generatePlayerStatistics(state, awayTeam);

      const allStats = [...homeStats, ...awayStats];
      const goalkeeperStats = allStats.filter(s => s.position === PositionEnum.GOALKEEPER);

      goalkeeperStats.forEach(gkStats => {
        expect(gkStats.tackles).toBe(0);
        expect(gkStats.tacklesSuccessful).toBe(0);
      });
    }
  });
});

type TeamEvent = TeamSide | null;
type ScorelineState = 'LEADING' | 'TRAILING' | 'LEVEL';

interface BehaviorWindowMetrics {
  passAttempts: number;
  shotEvents: number;
  recyclePasses: number;
  directPasses: number;
}

interface CombinedLateGameMetrics {
  trailing: { early: BehaviorWindowMetrics; late: BehaviorWindowMetrics };
  leading: { early: BehaviorWindowMetrics; late: BehaviorWindowMetrics };
  homeTrailing: { early: BehaviorWindowMetrics; late: BehaviorWindowMetrics };
  awayTrailing: { early: BehaviorWindowMetrics; late: BehaviorWindowMetrics };
  metadata: {
    passWithIntent: number;
    failedPassTurnovers: number;
    carryDispossessed: number;
  };
}

function createWindowMetrics(): BehaviorWindowMetrics {
  return {
    passAttempts: 0,
    shotEvents: 0,
    recyclePasses: 0,
    directPasses: 0
  };
}

function createCombinedLateGameMetrics(): CombinedLateGameMetrics {
  return {
    trailing: { early: createWindowMetrics(), late: createWindowMetrics() },
    leading: { early: createWindowMetrics(), late: createWindowMetrics() },
    homeTrailing: { early: createWindowMetrics(), late: createWindowMetrics() },
    awayTrailing: { early: createWindowMetrics(), late: createWindowMetrics() },
    metadata: {
      passWithIntent: 0,
      failedPassTurnovers: 0,
      carryDispossessed: 0
    }
  };
}

function mergeLateGameMetrics(target: CombinedLateGameMetrics, source: CombinedLateGameMetrics): void {
  addWindow(target.trailing.early, source.trailing.early);
  addWindow(target.trailing.late, source.trailing.late);
  addWindow(target.leading.early, source.leading.early);
  addWindow(target.leading.late, source.leading.late);
  addWindow(target.homeTrailing.early, source.homeTrailing.early);
  addWindow(target.homeTrailing.late, source.homeTrailing.late);
  addWindow(target.awayTrailing.early, source.awayTrailing.early);
  addWindow(target.awayTrailing.late, source.awayTrailing.late);

  target.metadata.passWithIntent += source.metadata.passWithIntent;
  target.metadata.failedPassTurnovers += source.metadata.failedPassTurnovers;
  target.metadata.carryDispossessed += source.metadata.carryDispossessed;
}

function addWindow(target: BehaviorWindowMetrics, source: BehaviorWindowMetrics): void {
  target.passAttempts += source.passAttempts;
  target.shotEvents += source.shotEvents;
  target.recyclePasses += source.recyclePasses;
  target.directPasses += source.directPasses;
}

function getShotShare(window: BehaviorWindowMetrics): number {
  const attempts = window.passAttempts + window.shotEvents;
  return attempts > 0 ? window.shotEvents / attempts : 0;
}

function getRecycleShare(window: BehaviorWindowMetrics): number {
  return window.passAttempts > 0 ? window.recyclePasses / window.passAttempts : 0;
}

function getDirectPassShare(window: BehaviorWindowMetrics): number {
  return window.passAttempts > 0 ? window.directPasses / window.passAttempts : 0;
}

function calculateLateGameBehaviorMetrics(events: PlayByPlayEvent[]): CombinedLateGameMetrics {
  const metrics = createCombinedLateGameMetrics();
  let homeScore = 0;
  let awayScore = 0;

  for (const event of events) {
    const team = inferTeamFromEvent(event);

    if (event.type === EventType.PASS) {
      const passIntent = event.additionalData?.passIntent;
      if (passIntent) {
        metrics.metadata.passWithIntent += 1;
      }
    }

    if ((event.type === EventType.TACKLE || event.type === EventType.INTERCEPTION)
      && !!event.additionalData?.passFailure) {
      metrics.metadata.failedPassTurnovers += 1;
    }

    if (event.type === EventType.TACKLE && event.additionalData?.carryResult === 'DISPOSSESSED') {
      metrics.metadata.carryDispossessed += 1;
    }

    const isPassTurnover = (event.type === EventType.TACKLE || event.type === EventType.INTERCEPTION)
      && !!event.additionalData?.passFailure;

    if (team && (event.type === EventType.PASS || event.type === EventType.SHOT || isPassTurnover)) {
      const scorelineState = getScorelineStateForTeam(team, homeScore, awayScore);
      const isLateWindow = event.time >= 80;
      const windowBucket = isLateWindow ? 'late' : 'early';

      if (scorelineState === 'TRAILING') {
        registerBehaviorEvent(metrics.trailing[windowBucket], event);
        if (team === TeamSide.HOME) {
          registerBehaviorEvent(metrics.homeTrailing[windowBucket], event);
        } else {
          registerBehaviorEvent(metrics.awayTrailing[windowBucket], event);
        }
      } else if (scorelineState === 'LEADING') {
        registerBehaviorEvent(metrics.leading[windowBucket], event);
      }
    }

    if (event.type === EventType.GOAL && team) {
      if (team === TeamSide.HOME) {
        homeScore += 1;
      } else {
        awayScore += 1;
      }
    }
  }

  return metrics;
}

function registerBehaviorEvent(window: BehaviorWindowMetrics, event: PlayByPlayEvent): void {
  if (event.type === EventType.SHOT) {
    window.shotEvents += 1;
    return;
  }

  const isPassEvent = event.type === EventType.PASS;
  const isPassTurnover = (event.type === EventType.TACKLE || event.type === EventType.INTERCEPTION)
    && !!event.additionalData?.passFailure;

  if (!isPassEvent && !isPassTurnover) {
    return;
  }

  window.passAttempts += 1;
  const passIntent = event.additionalData?.passIntent;
  if (passIntent === 'RECYCLE') {
    window.recyclePasses += 1;
  }

  if (passIntent === 'THROUGH_BALL' || passIntent === 'CROSS') {
    window.directPasses += 1;
  }
}

function inferTeamFromEvent(event: PlayByPlayEvent): TeamEvent {
  const primaryId = event.playerIds[0];
  if (!primaryId) {
    return null;
  }

  if (primaryId.startsWith('home-')) {
    return TeamSide.HOME;
  }

  if (primaryId.startsWith('away-')) {
    return TeamSide.AWAY;
  }

  return null;
}

function getScorelineStateForTeam(team: TeamSide, homeScore: number, awayScore: number): ScorelineState {
  const teamScore = team === TeamSide.HOME ? homeScore : awayScore;
  const opponentScore = team === TeamSide.HOME ? awayScore : homeScore;

  if (teamScore > opponentScore) {
    return 'LEADING';
  }

  if (teamScore < opponentScore) {
    return 'TRAILING';
  }

  return 'LEVEL';
}

function create442Players(prefix: string): Player[] {
  return [
    createPlayer(`${prefix}-gk1`, prefix, PositionEnum.GOALKEEPER, Role.STARTER, 85),
    createPlayer(`${prefix}-def1`, prefix, PositionEnum.DEFENDER, Role.STARTER, 74),
    createPlayer(`${prefix}-def2`, prefix, PositionEnum.DEFENDER, Role.STARTER, 75),
    createPlayer(`${prefix}-def3`, prefix, PositionEnum.DEFENDER, Role.STARTER, 76),
    createPlayer(`${prefix}-def4`, prefix, PositionEnum.DEFENDER, Role.STARTER, 74),
    createPlayer(`${prefix}-mid1`, prefix, PositionEnum.MIDFIELDER, Role.STARTER, 77),
    createPlayer(`${prefix}-mid2`, prefix, PositionEnum.MIDFIELDER, Role.STARTER, 79),
    createPlayer(`${prefix}-mid3`, prefix, PositionEnum.MIDFIELDER, Role.STARTER, 78),
    createPlayer(`${prefix}-mid4`, prefix, PositionEnum.MIDFIELDER, Role.STARTER, 77),
    createPlayer(`${prefix}-fwd1`, prefix, PositionEnum.FORWARD, Role.STARTER, 80),
    createPlayer(`${prefix}-fwd2`, prefix, PositionEnum.FORWARD, Role.STARTER, 81)
  ];
}

function createTeam(idPrefix: string, players: Player[]): Team {
  const [gk1, def1, def2, def3, def4, mid1, mid2, mid3, mid4, fwd1, fwd2] = players;

  return {
    id: `team-${idPrefix}`,
    name: `Team ${idPrefix.toUpperCase()}`,
    players,
    playerIds: players.map(player => player.id),
    selectedFormationId: 'formation_4_4_2',
    formationAssignments: {
      gk_1: gk1.id,
      def_l: def1.id,
      def_lc: def2.id,
      def_rc: def3.id,
      def_r: def4.id,
      mid_l: mid1.id,
      mid_lc: mid2.id,
      mid_rc: mid3.id,
      mid_r: mid4.id,
      att_l: fwd1.id,
      att_r: fwd2.id
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

function createReducedShapeTeam(team: Team, removedPlayerId: string, vacatedSlotId: string): Team {
  return {
    ...team,
    players: team.players.map(player => {
      if (player.id !== removedPlayerId) {
        return { ...player };
      }

      return {
        ...player,
        role: Role.DISMISSED
      };
    }),
    playerIds: [...team.playerIds],
    formationAssignments: {
      ...team.formationAssignments,
      [vacatedSlotId]: ''
    }
  };
}

function createPlayer(
  id: string,
  teamId: string,
  position: PositionEnum,
  role: Role,
  overall: number
): Player {
  return {
    id,
    name: id,
    teamId: `team-${teamId}`,
    position,
    role,
    personal: { height: 182, weight: 78, age: 26, nationality: 'ENG' },
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
    careerStats: createEmptyPlayerCareerStats()
  };
}

function calculatePassQuality(events: PlayByPlayEvent[]): {
  attempts: number;
  completed: number;
  progressionCompleted: number;
  turnovers: number;
} {
  const completedPasses = events.filter(event => event.type === EventType.PASS);
  const failedPasses = events.filter(event => {
    if (event.type !== EventType.TACKLE && event.type !== EventType.INTERCEPTION) {
      return false;
    }

    return !!event.additionalData?.passFailure;
  });

  const progressionCompleted = completedPasses.filter(event => {
    const passIntent = event.additionalData?.passIntent;
    return passIntent === 'PROGRESSION' || passIntent === 'THROUGH_BALL' || passIntent === 'CROSS';
  }).length;

  return {
    attempts: completedPasses.length + failedPasses.length,
    completed: completedPasses.length,
    progressionCompleted,
    turnovers: failedPasses.length
  };
}
