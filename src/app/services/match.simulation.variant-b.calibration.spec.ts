import { TestBed } from '@angular/core/testing';
import { MatchSimulationVariantBService } from './match.simulation.variant-b.service';
import { FieldService } from './field.service';
import { FormationLibraryService } from './formation-library.service';
import { CommentaryService } from './commentary.service';
import { Role, Position as PositionEnum, CommentaryStyle } from '../models/enums';
import { Player, Team } from '../models/types';
import { SimulationConfig, VariantBTuningConfig } from '../models/simulation.types';
import { SimulationABRunner, SimulationABVariant } from '../testing/simulation-ab.runner';

describe('Match Simulation Variant B Calibration Benchmark', () => {
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

  it('should benchmark presets and write best tuning near target goals', async () => {
    const targetGoals = 2.75;
    const targetShots = 26.5;
    const iterations = 100;

    const presets: { name: string; tuning: Partial<VariantBTuningConfig> }[] = [
      {
        name: 'B-Current',
        tuning: {}
      },
      {
        name: 'B-Balanced-2.75-A',
        tuning: {
          attackTickMax: 3,
          passWeightBase: 0.64,
          shotWeightBase: 0.19,
          outOfWindowShotMultiplier: 0.28,
          onTargetBase: 0.32,
          goalChanceBase: 0.3,
          goalChanceMax: 0.67
        }
      },
      {
        name: 'B-Balanced-2.75-B',
        tuning: {
          attackTickMax: 3,
          passWeightBase: 0.61,
          shotWeightBase: 0.2,
          outOfWindowShotMultiplier: 0.3,
          onTargetBase: 0.33,
          onTargetMax: 0.86,
          goalChanceBase: 0.29,
          goalChanceMax: 0.66
        }
      },
      {
        name: 'B-Aggressive-Pressing',
        tuning: {
          midfieldTickMax: 5,
          attackTickMax: 4,
          passWeightBase: 0.58,
          shotWeightBase: 0.23,
          onTargetBase: 0.35,
          goalChanceBase: 0.31,
          goalChanceMax: 0.68
        }
      },
      {
        name: 'B-LowShots-HighQuality',
        tuning: {
          midfieldTickMax: 4,
          attackTickMax: 3,
          passWeightBase: 0.66,
          shotWeightBase: 0.18,
          outOfWindowShotMultiplier: 0.25,
          onTargetBase: 0.34,
          onTargetMax: 0.88,
          goalChanceBase: 0.32,
          goalChanceSkillVsKeeperScale: 0.004,
          goalChanceMax: 0.7
        }
      },
      {
        name: 'B-Premier-Target',
        tuning: {
          midfieldTickMax: 5,
          attackTickMax: 4,
          passWeightBase: 0.59,
          shotWeightBase: 0.22,
          outOfWindowShotMultiplier: 0.28,
          onTargetBase: 0.34,
          onTargetMax: 0.85,
          goalChanceBase: 0.28,
          goalChanceSkillVsKeeperScale: 0.0037,
          goalChanceMax: 0.63
        }
      },
      {
        name: 'B-Premier-Refined-A',
        tuning: {
          midfieldTickMax: 5,
          attackTickMax: 4,
          passWeightBase: 0.58,
          shotWeightBase: 0.23,
          outOfWindowShotMultiplier: 0.27,
          onTargetBase: 0.32,
          onTargetMax: 0.83,
          goalChanceBase: 0.24,
          goalChanceSkillVsKeeperScale: 0.0034,
          goalChanceMax: 0.56
        }
      },
      {
        name: 'B-Premier-Refined-B',
        tuning: {
          midfieldTickMax: 5,
          attackTickMax: 4,
          passWeightBase: 0.57,
          shotWeightBase: 0.24,
          outOfWindowShotMultiplier: 0.27,
          onTargetBase: 0.31,
          onTargetMax: 0.82,
          goalChanceBase: 0.23,
          goalChanceSkillVsKeeperScale: 0.0033,
          goalChanceMax: 0.54
        }
      }
    ];

    const variants: SimulationABVariant[] = presets.map((preset, index) => ({
      name: preset.name,
      variant: 'B',
      seedPrefix: `calibration-b-${index + 1}`,
      configOverrides: {
        variantBTuning: preset.tuning
      }
    }));

    const runner = new SimulationABRunner();
    const report = await runner.run(iterations, variants, async (variant, seed) => {
      const config: SimulationConfig = {
        enablePlayByPlay: true,
        enableSpatialTracking: true,
        enableTactics: true,
        enableFatigue: true,
        commentaryStyle: CommentaryStyle.DETAILED,
        simulationVariant: 'B',
        seed,
        ...(variant.configOverrides ?? {})
      };

      const match = {
        id: `B-${seed}`,
        week: 1,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        played: false
      };

      const state = simulationB.simulateMatch(match, homeTeam, awayTeam, config);

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

    const scored = report.summary
      .map((summary) => ({
        ...summary,
        targetDistance: Math.abs(summary.avgTotalGoals - targetGoals),
        shotDistance: Math.abs(summary.avgShots - targetShots),
        realismScore:
          Math.abs(summary.avgTotalGoals - targetGoals) +
          (Math.abs(summary.avgShots - targetShots) * 0.35)
      }))
      .sort((a, b) => a.realismScore - b.realismScore);

    const best = scored[0];

    const fs = await import('fs/promises');
    const path = await import('path');
    const outputDir = path.join('test-output', 'simulation-ab');
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'variant-b-calibration-latest.json');

    await fs.writeFile(
      outputPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          targetGoals,
          targetShots,
          iterations,
          best,
          scored
        },
        null,
        2
      ),
      'utf-8'
    );

    expect(report.summary.length).toBe(presets.length);
    expect(best).toBeDefined();
    expect(best.realismScore).toBeLessThan(3);
    expect(best.avgTotalGoals).toBeGreaterThan(2.2);
    expect(best.avgTotalGoals).toBeLessThan(3.3);
    expect(best.avgShots).toBeGreaterThan(22);
    expect(best.avgShots).toBeLessThan(28);
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
    playerIds: players.map((player) => player.id),
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
