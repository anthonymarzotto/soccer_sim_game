import { TestBed } from '@angular/core/testing';
import { MatchSimulationVariantBService } from './match.simulation.variant-b.service';
import { FieldService } from './field.service';
import { FormationLibraryService } from './formation-library.service';
import { CommentaryService } from './commentary.service';
import { Role, Position as PositionEnum, CommentaryStyle } from '../models/enums';
import { Player, Team } from '../models/types';
import { SimulationConfig } from '../models/simulation.types';
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
        CommentaryService
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

    const iterations = 20;

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
    expect((variantBSummary?.avgTotalGoals ?? 0)).toBeGreaterThanOrEqual(2.0);
    expect((variantBSummary?.avgTotalGoals ?? 0)).toBeLessThanOrEqual(3.5);
    expect((variantBSummary?.avgShots ?? 0)).toBeGreaterThanOrEqual(20);
    expect((variantBSummary?.avgShots ?? 0)).toBeLessThanOrEqual(30);
    expect((variantBSummary?.avgEvents ?? 0)).toBeGreaterThan(120);

    const fs = await import('fs/promises');
    const saved = await fs.readFile(outputPath, 'utf-8');
    expect(saved.length).toBeGreaterThan(0);
  });
});

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
