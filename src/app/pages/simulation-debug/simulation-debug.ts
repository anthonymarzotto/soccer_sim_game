import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SIMULATION_SEED_MAX_LENGTH } from '../../constants';
import { GameService } from '../../services/game.service';
import { MatchSimulationVariantBService } from '../../services/match.simulation.variant-b.service';
import { CommentaryStyle } from '../../models/enums';
import { Match, Team } from '../../models/types';
import { MatchState, SimulationConfig, VariantBTuningConfig } from '../../models/simulation.types';

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
  variantB: VariantMetrics;
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
              <p class="text-zinc-400 mt-1">Run isolated Variant B batches without touching saved league state</p>
            </div>
          </div>
        </div>

        <div class="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl p-6 space-y-6">
          <div>
            <h2 class="text-xl font-semibold text-white">Variant B Sandbox</h2>
            <p class="text-zinc-400 mt-2">Each run executes the current Variant B engine with an isolated matchup and deterministic seed.</p>
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
                (click)="showTuning.set(!showTuning())"
                class="inline-flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 font-semibold text-white hover:bg-zinc-700"
              >
                <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                <span>{{ showTuning() ? 'Hide' : 'Show' }} Advanced Tuning</span>
              </button>
            </div>

            @if (showTuning()) {
              <div class="rounded-xl border border-zinc-700 bg-zinc-900 p-6 space-y-4">
                <h3 class="text-sm font-semibold text-white">Variant B Tuning Parameters</h3>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label for="goalChanceBase" class="block text-xs font-medium text-zinc-300 mb-2">
                      Goal Chance Base: {{ goalChanceBase().toFixed(2) }}
                    </label>
                    <input
                      id="goalChanceBase"
                      type="range"
                      min="0.05"
                      max="0.40"
                      step="0.01"
                      [value]="goalChanceBase()"
                      (input)="setGoalChanceBase($any($event.target).value)"
                      class="w-full"
                    />
                    <p class="text-xs text-zinc-500 mt-1">Base conversion rate for shots on target</p>
                  </div>

                  <div>
                    <label for="goalChanceMin" class="block text-xs font-medium text-zinc-300 mb-2">
                      Goal Chance Min: {{ goalChanceMin().toFixed(2) }}
                    </label>
                    <input
                      id="goalChanceMin"
                      type="range"
                      min="0.05"
                      max="0.30"
                      step="0.01"
                      [value]="goalChanceMin()"
                      (input)="setGoalChanceMin($any($event.target).value)"
                      class="w-full"
                    />
                    <p class="text-xs text-zinc-500 mt-1">Minimum goal probability floor</p>
                  </div>

                  <div>
                    <label for="goalChanceMax" class="block text-xs font-medium text-zinc-300 mb-2">
                      Goal Chance Max: {{ goalChanceMax().toFixed(2) }}
                    </label>
                    <input
                      id="goalChanceMax"
                      type="range"
                      min="0.40"
                      max="0.80"
                      step="0.01"
                      [value]="goalChanceMax()"
                      (input)="setGoalChanceMax($any($event.target).value)"
                      class="w-full"
                    />
                    <p class="text-xs text-zinc-500 mt-1">Maximum goal probability ceiling</p>
                  </div>

                  <div>
                    <label for="onTargetBase" class="block text-xs font-medium text-zinc-300 mb-2">
                      On Target Base: {{ onTargetBase().toFixed(2) }}
                    </label>
                    <input
                      id="onTargetBase"
                      type="range"
                      min="0.15"
                      max="0.50"
                      step="0.01"
                      [value]="onTargetBase()"
                      (input)="setOnTargetBase($any($event.target).value)"
                      class="w-full"
                    />
                    <p class="text-xs text-zinc-500 mt-1">Base rate of shots hitting the target</p>
                  </div>

                  <div>
                    <label for="passWeightBase" class="block text-xs font-medium text-zinc-300 mb-2">
                      Pass Weight: {{ passWeightBase().toFixed(2) }}
                    </label>
                    <input
                      id="passWeightBase"
                      type="range"
                      min="0.30"
                      max="0.80"
                      step="0.01"
                      [value]="passWeightBase()"
                      (input)="setPassWeightBase($any($event.target).value)"
                      class="w-full"
                    />
                    <p class="text-xs text-zinc-500 mt-1">Weighting toward passing vs shooting/carrying</p>
                  </div>

                  <div>
                    <label for="carryWeightBase" class="block text-xs font-medium text-zinc-300 mb-2">
                      Carry Weight: {{ carryWeightBase().toFixed(2) }}
                    </label>
                    <input
                      id="carryWeightBase"
                      type="range"
                      min="0.02"
                      max="0.40"
                      step="0.01"
                      [value]="carryWeightBase()"
                      (input)="setCarryWeightBase($any($event.target).value)"
                      class="w-full"
                    />
                    <p class="text-xs text-zinc-500 mt-1">Weighting toward carrying vs passing/shooting</p>
                  </div>

                  <div>
                    <label for="shotWeightBase" class="block text-xs font-medium text-zinc-300 mb-2">
                      Shot Weight: {{ shotWeightBase().toFixed(2) }}
                    </label>
                    <input
                      id="shotWeightBase"
                      type="range"
                      min="0.10"
                      max="0.50"
                      step="0.01"
                      [value]="shotWeightBase()"
                      (input)="setShotWeightBase($any($event.target).value)"
                      class="w-full"
                    />
                    <p class="text-xs text-zinc-500 mt-1">Weighting toward shooting vs passing/carrying</p>
                  </div>

                  <div>
                    <label for="homeAdvantageGoalBonus" class="block text-xs font-medium text-zinc-300 mb-2">
                      Home Advantage Bonus: {{ homeAdvantageGoalBonus().toFixed(3) }}
                    </label>
                    <input
                      id="homeAdvantageGoalBonus"
                      type="range"
                      min="0.00"
                      max="0.15"
                      step="0.005"
                      [value]="homeAdvantageGoalBonus()"
                      (input)="setHomeAdvantageGoalBonus($any($event.target).value)"
                      class="w-full"
                    />
                    <p class="text-xs text-zinc-500 mt-1">Goal conversion bonus added for home team shots</p>
                  </div>
                </div>
              </div>
            }

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

            @if (summaryB()) {
              <div class="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <h3 class="text-sm font-semibold text-zinc-300">Batch Summary</h3>

                <div class="mt-3 rounded-lg border border-zinc-800 p-4">
                  <h4 class="text-cyan-300 font-semibold">Variant B</h4>
                  <p class="mt-2 text-sm text-zinc-300">Runs: {{ summaryB()!.runs }}</p>
                  <p class="text-sm text-zinc-300">Avg Goals: {{ summaryB()!.avgGoals.toFixed(2) }}</p>
                  <p class="text-sm text-zinc-300">Avg Shots: {{ summaryB()!.avgShots.toFixed(2) }}</p>
                  <p class="text-sm text-zinc-300">Avg SOT: {{ summaryB()!.avgShotsOnTarget.toFixed(2) }}</p>
                  <p class="text-sm text-zinc-500">W-D-L: {{ summaryB()!.homeWins }}-{{ summaryB()!.draws }}-{{ summaryB()!.awayWins }}</p>
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
                        <th class="px-3 py-2">B Score</th>
                        <th class="px-3 py-2">B Goals</th>
                        <th class="px-3 py-2">Shots</th>
                        <th class="px-3 py-2">SOT</th>
                        <th class="px-3 py-2">Events</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of rows(); track row.run) {
                        <tr class="border-t border-zinc-800 text-zinc-200">
                          <td class="px-3 py-2">{{ row.run }}</td>
                          <td class="px-3 py-2">{{ row.seed || '-' }}</td>
                          <td class="px-3 py-2">{{ row.variantB.homeScore }}-{{ row.variantB.awayScore }}</td>
                          <td class="px-3 py-2">{{ row.variantB.totalGoals }}</td>
                          <td class="px-3 py-2">{{ row.variantB.totalShots }}</td>
                          <td class="px-3 py-2">{{ row.variantB.shotsOnTarget }}</td>
                          <td class="px-3 py-2">{{ row.variantB.events }}</td>
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
  private simulationB = inject(MatchSimulationVariantBService);

  readonly teams = computed(() => this.gameService.league()?.teams ?? []);
  readonly runCount = signal(20);
  readonly seedPrefix = signal('');
  readonly homeTeamId = signal('');
  readonly awayTeamId = signal('');
  readonly isRunning = signal(false);
  readonly rows = signal<SimulationRunRow[]>([]);
  readonly showTuning = signal(false);

  // Tuning parameters
  readonly goalChanceBase = signal(0.21);
  readonly goalChanceMin = signal(0.1);
  readonly goalChanceMax = signal(0.50);
  readonly onTargetBase = signal(0.31);
  readonly passWeightBase = signal(0.57);
  readonly carryWeightBase = signal(0.12);
  readonly shotWeightBase = signal(0.24);
  readonly homeAdvantageGoalBonus = signal(0.04);

  readonly canRun = computed(() => {
    return this.homeTeamId().length > 0 && this.awayTeamId().length > 0 && this.homeTeamId() !== this.awayTeamId();
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

  setGoalChanceBase(value: string): void {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      this.goalChanceBase.set(Math.round(parsed * 100) / 100);
    }
  }

  setGoalChanceMin(value: string): void {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      this.goalChanceMin.set(Math.round(parsed * 100) / 100);
    }
  }

  setGoalChanceMax(value: string): void {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      this.goalChanceMax.set(Math.round(parsed * 100) / 100);
    }
  }

  setOnTargetBase(value: string): void {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      this.onTargetBase.set(Math.round(parsed * 100) / 100);
    }
  }

  setPassWeightBase(value: string): void {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      this.passWeightBase.set(Math.round(parsed * 100) / 100);
    }
  }

  setCarryWeightBase(value: string): void {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      this.carryWeightBase.set(Math.round(parsed * 100) / 100);
    }
  }

  setShotWeightBase(value: string): void {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      this.shotWeightBase.set(Math.round(parsed * 100) / 100);
    }
  }

  setHomeAdvantageGoalBonus(value: string): void {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      this.homeAdvantageGoalBonus.set(Math.round(parsed * 1000) / 1000);
    }
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

        const stateB = this.simulateMatch({ ...matchBase, id: `${matchBase.id}-B` }, homeTeam, awayTeam, seed);
        const metricsB = this.toMetrics(stateB);

        rows.push({
          run: runIndex + 1,
          variantB: metricsB,
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

  private async yieldToUi(): Promise<void> {
    await new Promise<void>(resolve => {
      setTimeout(resolve, 0);
    });
  }

  private simulateMatch(match: Match, homeTeam: Team, awayTeam: Team, seed?: string) {
    const tuning: Partial<VariantBTuningConfig> = {
      goalChanceBase: this.goalChanceBase(),
      goalChanceMin: this.goalChanceMin(),
      goalChanceMax: this.goalChanceMax(),
      onTargetBase: this.onTargetBase(),
      passWeightBase: this.passWeightBase(),
      carryWeightBase: this.carryWeightBase(),
      shotWeightBase: this.shotWeightBase(),
      homeAdvantageGoalBonus: this.homeAdvantageGoalBonus()
    };

    const config: SimulationConfig = {
      enablePlayByPlay: true,
      enableSpatialTracking: true,
      enableTactics: true,
      enableFatigue: true,
      commentaryStyle: CommentaryStyle.DETAILED,
      simulationVariant: 'B',
      seed,
      variantBTuning: tuning
    };

    return this.simulationB.simulateMatch(match, homeTeam, awayTeam, config);
  }
}
