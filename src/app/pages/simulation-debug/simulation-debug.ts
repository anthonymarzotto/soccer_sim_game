import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SIMULATION_SEED_MAX_LENGTH } from '../../constants';
import { GameService } from '../../services/game.service';
import { MatchSimulationService } from '../../services/match.simulation.service';
import { MatchSimulationVariantBService } from '../../services/match.simulation.variant-b.service';
import { CommentaryStyle } from '../../models/enums';
import { Match, Team } from '../../models/types';
import { MatchState, SimulationConfig, SimulationVariant } from '../../models/simulation.types';

interface VariantMetrics {
  homeScore: number;
  awayScore: number;
  totalGoals: number;
  totalShots: number;
  shotsOnTarget: number;
  events: number;
}

interface SimulationRunRow {
  run: number;
  variantA: VariantMetrics;
  variantB: VariantMetrics;
  goalsDiff: number;
  shotsDiff: number;
  shotsOnTargetDiff: number;
  seed?: string;
}

interface SimulationSummary {
  runs: number;
  avgGoals: number;
  avgShots: number;
  avgShotsOnTarget: number;
  homeWins: number;
  draws: number;
  awayWins: number;
}

interface ComparisonHighlight {
  label: string;
  value: string;
  tone: 'positive' | 'negative' | 'neutral';
}

@Component({
  selector: 'app-simulation-debug',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-12">
      <div class="max-w-4xl mx-auto space-y-8">
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <a routerLink="/settings" class="p-2 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </a>
            <div>
              <h1 class="text-3xl font-bold tracking-tight text-white">Simulation Playground</h1>
              <p class="text-zinc-400 mt-1">Run Variant A and B together for side-by-side comparison</p>
            </div>
          </div>
        </div>

        <div class="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl p-6 space-y-6">
          <div>
            <h2 class="text-xl font-semibold text-white">A/B Comparison Mode</h2>
            <p class="text-zinc-400 mt-2">Each run executes both variants with the same matchup and seed value.</p>
          </div>

          @if (teams().length < 2) {
            <div class="rounded-xl border border-amber-800/80 bg-amber-950/30 p-4 text-sm text-amber-200">
              Generate a league first, then use this sandbox to run isolated match simulations.
            </div>
          } @else {
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label for="homeTeam" class="block text-sm font-medium text-zinc-300 mb-2">Home Team</label>
                <select
                  id="homeTeam"
                  [value]="homeTeamId()"
                  (change)="setHomeTeam($any($event.target).value)"
                  class="w-full bg-zinc-950 border border-zinc-700 text-white rounded-lg px-4 py-3"
                >
                  @for (team of teams(); track team.id) {
                    <option [value]="team.id">{{ team.name }}</option>
                  }
                </select>
              </div>

              <div>
                <label for="awayTeam" class="block text-sm font-medium text-zinc-300 mb-2">Away Team</label>
                <select
                  id="awayTeam"
                  [value]="awayTeamId()"
                  (change)="setAwayTeam($any($event.target).value)"
                  class="w-full bg-zinc-950 border border-zinc-700 text-white rounded-lg px-4 py-3"
                >
                  @for (team of teams(); track team.id) {
                    <option [value]="team.id">{{ team.name }}</option>
                  }
                </select>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-zinc-800 pt-6">
              <div>
                <label for="runCount" class="block text-sm font-medium text-zinc-300 mb-2">Run Count</label>
                <input
                  id="runCount"
                  type="number"
                  min="1"
                  max="1000"
                  [value]="runCount()"
                  (input)="setRunCount($any($event.target).value)"
                  class="w-full bg-zinc-950 border border-zinc-700 text-white rounded-lg px-4 py-3"
                />
              </div>

              <div class="md:col-span-2">
                <label for="simSeed" class="block text-sm font-medium text-zinc-300 mb-2">Seed Prefix (Optional)</label>
                <input
                  id="simSeed"
                  type="text"
                  [value]="seedPrefix()"
                  (input)="setSeedPrefix($any($event.target).value)"
                  placeholder="e.g. tuning-run"
                  class="w-full bg-zinc-950 border border-zinc-700 text-white rounded-lg px-4 py-3"
                />
              </div>
            </div>

            <div class="flex items-center gap-3">
              <button
                type="button"
                (click)="runSandbox()"
                [disabled]="isRunning() || !canRun()"
                class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                @if (isRunning()) {
                  <svg class="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"></path>
                  </svg>
                }
                <span>{{ isRunning() ? 'Running...' : 'Run Simulation Batch' }}</span>
              </button>
              <span class="text-sm text-zinc-400">Runs are isolated and do not alter saved league results.</span>
            </div>

            @if (summaryA() && summaryB()) {
              <div class="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <h3 class="text-sm font-semibold text-zinc-300">Variant Summary</h3>
                <div class="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  @for (highlight of highlights(); track highlight.label) {
                    <div
                      [class]="highlight.tone === 'positive'
                        ? 'rounded-lg border border-emerald-700/60 bg-emerald-950/30 p-3'
                        : highlight.tone === 'negative'
                          ? 'rounded-lg border border-rose-700/60 bg-rose-950/30 p-3'
                          : 'rounded-lg border border-zinc-800 bg-zinc-900 p-3'"
                    >
                      <div class="text-zinc-400">{{ highlight.label }}</div>
                      <div class="mt-1 font-semibold text-white">{{ highlight.value }}</div>
                    </div>
                  }
                </div>

                <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div class="rounded-lg border border-zinc-800 p-4">
                    <h4 class="text-emerald-300 font-semibold">Variant A</h4>
                    <p class="mt-2 text-sm text-zinc-300">Runs: {{ summaryA()!.runs }}</p>
                    <p class="text-sm text-zinc-300">Avg Goals: {{ summaryA()!.avgGoals.toFixed(2) }}</p>
                    <p class="text-sm text-zinc-300">Avg Shots: {{ summaryA()!.avgShots.toFixed(2) }}</p>
                    <p class="text-sm text-zinc-300">Avg SOT: {{ summaryA()!.avgShotsOnTarget.toFixed(2) }}</p>
                    <p class="text-sm text-zinc-500">W-D-L: {{ summaryA()!.homeWins }}-{{ summaryA()!.draws }}-{{ summaryA()!.awayWins }}</p>
                  </div>
                  <div class="rounded-lg border border-zinc-800 p-4">
                    <h4 class="text-cyan-300 font-semibold">Variant B</h4>
                    <p class="mt-2 text-sm text-zinc-300">Runs: {{ summaryB()!.runs }}</p>
                    <p class="text-sm text-zinc-300">Avg Goals: {{ summaryB()!.avgGoals.toFixed(2) }}</p>
                    <p class="text-sm text-zinc-300">Avg Shots: {{ summaryB()!.avgShots.toFixed(2) }}</p>
                    <p class="text-sm text-zinc-300">Avg SOT: {{ summaryB()!.avgShotsOnTarget.toFixed(2) }}</p>
                    <p class="text-sm text-zinc-500">W-D-L: {{ summaryB()!.homeWins }}-{{ summaryB()!.draws }}-{{ summaryB()!.awayWins }}</p>
                  </div>
                </div>

                <div class="mt-4 rounded-lg border border-zinc-800 p-3 text-sm text-zinc-300">
                  <p>Avg Goals Diff (B - A): {{ goalsAvgDiff().toFixed(2) }}</p>
                  <p>Avg Shots Diff (B - A): {{ shotsAvgDiff().toFixed(2) }}</p>
                  <p>Avg SOT Diff (B - A): {{ shotsOnTargetAvgDiff().toFixed(2) }}</p>
                </div>
              </div>
            }

            @if (rows().length > 0) {
              <div class="rounded-xl border border-zinc-800 overflow-hidden">
                <div class="max-h-80 overflow-auto">
                  <table class="min-w-full text-sm">
                    <thead class="bg-zinc-900 sticky top-0">
                      <tr class="text-zinc-400 text-left">
                        <th class="px-3 py-2">Run</th>
                        <th class="px-3 py-2">Seed</th>
                        <th class="px-3 py-2">A Score</th>
                        <th class="px-3 py-2">B Score</th>
                        <th class="px-3 py-2">A Goals</th>
                        <th class="px-3 py-2">B Goals</th>
                        <th class="px-3 py-2">Goals Diff</th>
                        <th class="px-3 py-2">Shots Diff</th>
                        <th class="px-3 py-2">SOT Diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of rows(); track row.run) {
                        <tr [class]="row.goalsDiff > 0
                          ? 'border-t border-emerald-900/60 bg-emerald-950/10 text-zinc-200'
                          : row.goalsDiff < 0
                            ? 'border-t border-rose-900/60 bg-rose-950/10 text-zinc-200'
                            : 'border-t border-zinc-800 text-zinc-200'">
                          <td class="px-3 py-2">{{ row.run }}</td>
                          <td class="px-3 py-2">{{ row.seed || '-' }}</td>
                          <td class="px-3 py-2">{{ row.variantA.homeScore }}-{{ row.variantA.awayScore }}</td>
                          <td class="px-3 py-2">{{ row.variantB.homeScore }}-{{ row.variantB.awayScore }}</td>
                          <td class="px-3 py-2">{{ row.variantA.totalGoals }}</td>
                          <td class="px-3 py-2">{{ row.variantB.totalGoals }}</td>
                          <td [class]="formatDiffClass(row.goalsDiff)" class="px-3 py-2 font-semibold">{{ formatDiff(row.goalsDiff) }}</td>
                          <td [class]="formatDiffClass(row.shotsDiff)" class="px-3 py-2 font-semibold">{{ formatDiff(row.shotsDiff) }}</td>
                          <td [class]="formatDiffClass(row.shotsOnTargetDiff)" class="px-3 py-2 font-semibold">{{ formatDiff(row.shotsOnTargetDiff) }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }
          }
        </div>
      </div>
    </div>
  `
})
export class SimulationDebugComponent {
  private gameService = inject(GameService);
  private simulationA = inject(MatchSimulationService);
  private simulationB = inject(MatchSimulationVariantBService);

  readonly teams = computed(() => this.gameService.league()?.teams ?? []);
  readonly runCount = signal(20);
  readonly seedPrefix = signal('');
  readonly homeTeamId = signal('');
  readonly awayTeamId = signal('');
  readonly isRunning = signal(false);
  readonly rows = signal<SimulationRunRow[]>([]);

  readonly canRun = computed(() => {
    return this.homeTeamId().length > 0 && this.awayTeamId().length > 0 && this.homeTeamId() !== this.awayTeamId();
  });

  readonly summaryA = computed<SimulationSummary | null>(() => {
    const rows = this.rows();
    if (rows.length === 0) {
      return null;
    }

    const totals = rows.reduce(
      (acc, row) => {
        acc.goals += row.variantA.totalGoals;
        acc.shots += row.variantA.totalShots;
        acc.shotsOnTarget += row.variantA.shotsOnTarget;
        if (row.variantA.homeScore > row.variantA.awayScore) acc.homeWins++;
        else if (row.variantA.homeScore < row.variantA.awayScore) acc.awayWins++;
        else acc.draws++;
        return acc;
      },
      { goals: 0, shots: 0, shotsOnTarget: 0, homeWins: 0, awayWins: 0, draws: 0 }
    );

    return {
      runs: rows.length,
      avgGoals: totals.goals / rows.length,
      avgShots: totals.shots / rows.length,
      avgShotsOnTarget: totals.shotsOnTarget / rows.length,
      homeWins: totals.homeWins,
      draws: totals.draws,
      awayWins: totals.awayWins
    };
  });

  readonly summaryB = computed<SimulationSummary | null>(() => {
    const rows = this.rows();
    if (rows.length === 0) {
      return null;
    }

    const totals = rows.reduce(
      (acc, row) => {
        acc.goals += row.variantB.totalGoals;
        acc.shots += row.variantB.totalShots;
        acc.shotsOnTarget += row.variantB.shotsOnTarget;
        if (row.variantB.homeScore > row.variantB.awayScore) acc.homeWins++;
        else if (row.variantB.homeScore < row.variantB.awayScore) acc.awayWins++;
        else acc.draws++;
        return acc;
      },
      { goals: 0, shots: 0, shotsOnTarget: 0, homeWins: 0, awayWins: 0, draws: 0 }
    );

    return {
      runs: rows.length,
      avgGoals: totals.goals / rows.length,
      avgShots: totals.shots / rows.length,
      avgShotsOnTarget: totals.shotsOnTarget / rows.length,
      homeWins: totals.homeWins,
      draws: totals.draws,
      awayWins: totals.awayWins
    };
  });

  readonly goalsAvgDiff = computed(() => {
    const a = this.summaryA();
    const b = this.summaryB();
    return a && b ? b.avgGoals - a.avgGoals : 0;
  });

  readonly shotsAvgDiff = computed(() => {
    const a = this.summaryA();
    const b = this.summaryB();
    return a && b ? b.avgShots - a.avgShots : 0;
  });

  readonly shotsOnTargetAvgDiff = computed(() => {
    const a = this.summaryA();
    const b = this.summaryB();
    return a && b ? b.avgShotsOnTarget - a.avgShotsOnTarget : 0;
  });

  readonly highlights = computed<ComparisonHighlight[]>(() => {
    const summaryA = this.summaryA();
    const summaryB = this.summaryB();

    if (!summaryA || !summaryB) {
      return [];
    }

    return [
      {
        label: 'Goals Delta',
        value: this.formatDiff(this.goalsAvgDiff(), 2),
        tone: this.diffTone(this.goalsAvgDiff())
      },
      {
        label: 'Shots Delta',
        value: this.formatDiff(this.shotsAvgDiff(), 2),
        tone: this.diffTone(this.shotsAvgDiff())
      },
      {
        label: 'SOT Delta',
        value: this.formatDiff(this.shotsOnTargetAvgDiff(), 2),
        tone: this.diffTone(this.shotsOnTargetAvgDiff())
      }
    ];
  });

  constructor() {
    effect(() => {
      const teams = this.teams();
      if (teams.length < 2) {
        this.homeTeamId.set('');
        this.awayTeamId.set('');
        return;
      }

      if (!teams.some(team => team.id === this.homeTeamId())) {
        this.homeTeamId.set(teams[0].id);
      }

      if (!teams.some(team => team.id === this.awayTeamId()) || this.awayTeamId() === this.homeTeamId()) {
        const awayFallback = teams.find(team => team.id !== this.homeTeamId());
        this.awayTeamId.set(awayFallback ? awayFallback.id : '');
      }
    });
  }

  setHomeTeam(teamId: string): void {
    this.homeTeamId.set(teamId);
    if (teamId === this.awayTeamId()) {
      const fallback = this.teams().find(team => team.id !== teamId);
      this.awayTeamId.set(fallback ? fallback.id : '');
    }
  }

  setAwayTeam(teamId: string): void {
    this.awayTeamId.set(teamId);
  }

  setRunCount(value: string): void {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return;
    }

    this.runCount.set(Math.min(1000, Math.max(1, Math.floor(parsed))));
  }

  setSeedPrefix(value: string): void {
    this.seedPrefix.set(value.trim().slice(0, SIMULATION_SEED_MAX_LENGTH));
  }

  async runSandbox(): Promise<void> {
    if (!this.canRun() || this.isRunning()) {
      return;
    }

    const homeTeam = this.teams().find(team => team.id === this.homeTeamId());
    const awayTeam = this.teams().find(team => team.id === this.awayTeamId());

    if (!homeTeam || !awayTeam) {
      return;
    }

    this.isRunning.set(true);

    try {
      await this.yieldToUi();

      const rows: SimulationRunRow[] = [];

      for (let runIndex = 0; runIndex < this.runCount(); runIndex++) {
        if (runIndex > 0 && runIndex % 25 === 0) {
          await this.yieldToUi();
        }

        const seed = this.seedPrefix() ? `${this.seedPrefix()}-${runIndex + 1}` : undefined;
        const matchBase: Match = {
          id: `sandbox-${Date.now()}-${runIndex + 1}`,
          week: 1,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          played: false
        };

        const stateA = this.simulateMatch({ ...matchBase, id: `${matchBase.id}-A` }, homeTeam, awayTeam, 'A', seed);
        const stateB = this.simulateMatch({ ...matchBase, id: `${matchBase.id}-B` }, homeTeam, awayTeam, 'B', seed);

        const metricsA = this.toMetrics(stateA);
        const metricsB = this.toMetrics(stateB);

        rows.push({
          run: runIndex + 1,
          variantA: metricsA,
          variantB: metricsB,
          goalsDiff: metricsB.totalGoals - metricsA.totalGoals,
          shotsDiff: metricsB.totalShots - metricsA.totalShots,
          shotsOnTargetDiff: metricsB.shotsOnTarget - metricsA.shotsOnTarget,
          seed
        });
      }

      this.rows.set(rows);
    } finally {
      this.isRunning.set(false);
    }
  }

  private toMetrics(state: MatchState): VariantMetrics {
    return {
      homeScore: state.homeScore,
      awayScore: state.awayScore,
      totalGoals: state.homeScore + state.awayScore,
      totalShots: state.homeShots + state.awayShots,
      shotsOnTarget: state.homeShotsOnTarget + state.awayShotsOnTarget,
      events: state.events.length
    };
  }

  formatDiff(value: number, digits = 0): string {
    const formatted = value.toFixed(digits);
    return value > 0 ? `+${formatted}` : formatted;
  }

  formatDiffClass(value: number): string {
    if (value > 0) {
      return 'text-emerald-300';
    }

    if (value < 0) {
      return 'text-rose-300';
    }

    return 'text-zinc-300';
  }

  private diffTone(value: number): ComparisonHighlight['tone'] {
    if (value > 0) {
      return 'positive';
    }

    if (value < 0) {
      return 'negative';
    }

    return 'neutral';
  }

  private async yieldToUi(): Promise<void> {
    await new Promise<void>(resolve => {
      setTimeout(resolve, 0);
    });
  }

  private simulateMatch(match: Match, homeTeam: Team, awayTeam: Team, variant: SimulationVariant, seed?: string) {
    const config: SimulationConfig = {
      enablePlayByPlay: true,
      enableSpatialTracking: true,
      enableTactics: true,
      enableFatigue: true,
      commentaryStyle: CommentaryStyle.DETAILED,
      simulationVariant: variant,
      seed
    };

    if (variant === 'B') {
      return this.simulationB.simulateMatch(match, homeTeam, awayTeam, config);
    }

    return this.simulationA.simulateMatch(match, homeTeam, awayTeam, config);
  }
}
