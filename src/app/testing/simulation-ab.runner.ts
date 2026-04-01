import { SimulationConfig, SimulationVariant } from '../models/simulation.types';

export interface SimulationABVariant {
  name: string;
  variant: SimulationVariant;
  configOverrides?: Partial<SimulationConfig>;
  seedPrefix: string;
}

export interface SimulationABMatchRow {
  variant: SimulationVariant;
  variantName: string;
  iteration: number;
  seed: string;
  homeScore: number;
  awayScore: number;
  totalGoals: number;
  totalShots: number;
  shotsOnTarget: number;
  eventCount: number;
}

export interface SimulationABSummaryRow {
  variant: SimulationVariant;
  variantName: string;
  matches: number;
  avgHomeGoals: number;
  avgAwayGoals: number;
  avgTotalGoals: number;
  avgShots: number;
  avgShotsOnTarget: number;
  avgEvents: number;
}

export interface SimulationABReport {
  generatedAt: string;
  iterationsPerVariant: number;
  variants: SimulationABVariant[];
  rows: SimulationABMatchRow[];
  summary: SimulationABSummaryRow[];
}

export class SimulationABRunner {
  async run(
    iterationsPerVariant: number,
    variants: SimulationABVariant[],
    simulate: (variant: SimulationABVariant, seed: string, iteration: number) => Promise<{
      homeScore: number;
      awayScore: number;
      homeShots: number;
      awayShots: number;
      homeShotsOnTarget: number;
      awayShotsOnTarget: number;
      eventsLength: number;
    }>
  ): Promise<SimulationABReport> {
    const rows: SimulationABMatchRow[] = [];

    for (const variant of variants) {
      for (let iteration = 0; iteration < iterationsPerVariant; iteration++) {
        const seed = `${variant.seedPrefix}-${iteration + 1}`;
        const result = await simulate(variant, seed, iteration);

        rows.push({
          variant: variant.variant,
          variantName: variant.name,
          iteration: iteration + 1,
          seed,
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          totalGoals: result.homeScore + result.awayScore,
          totalShots: result.homeShots + result.awayShots,
          shotsOnTarget: result.homeShotsOnTarget + result.awayShotsOnTarget,
          eventCount: result.eventsLength
        });
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      iterationsPerVariant,
      variants,
      rows,
      summary: this.buildSummary(rows, variants)
    };
  }

  private buildSummary(rows: SimulationABMatchRow[], variants: SimulationABVariant[]): SimulationABSummaryRow[] {
    return variants.map(variant => {
      const variantRows = rows.filter(row => row.variant === variant.variant);
      const matchCount = variantRows.length || 1;

      const sum = variantRows.reduce(
        (acc, row) => {
          acc.homeGoals += row.homeScore;
          acc.awayGoals += row.awayScore;
          acc.totalGoals += row.totalGoals;
          acc.shots += row.totalShots;
          acc.shotsOnTarget += row.shotsOnTarget;
          acc.events += row.eventCount;
          return acc;
        },
        {
          homeGoals: 0,
          awayGoals: 0,
          totalGoals: 0,
          shots: 0,
          shotsOnTarget: 0,
          events: 0
        }
      );

      return {
        variant: variant.variant,
        variantName: variant.name,
        matches: variantRows.length,
        avgHomeGoals: sum.homeGoals / matchCount,
        avgAwayGoals: sum.awayGoals / matchCount,
        avgTotalGoals: sum.totalGoals / matchCount,
        avgShots: sum.shots / matchCount,
        avgShotsOnTarget: sum.shotsOnTarget / matchCount,
        avgEvents: sum.events / matchCount
      };
    });
  }
}
