import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { GeneratorService } from '../../services/generator.service';
import { Player, PlayerSeasonAttributes, Position, Role, StatKey, StatCategory } from '../../models/types';
import { calculateOverall, getStatKeysForCategory } from '../../models/player-progression';
import { buildStat } from '../../models/stat-definitions';
import { computeAge, seasonAnchorDate, birthdayForAge } from '../../models/player-age';
import { Position as PositionEnum } from '../../models/enums';

@Component({
  selector: 'app-debug-player-profile',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-12">
      <div class="max-w-6xl mx-auto space-y-8">
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <a routerLink="/settings" class="p-2 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </a>
            <div>
              <h1 class="text-3xl font-bold tracking-tight text-white">Player Progression Debug</h1>
              <p class="text-zinc-400 mt-1">Simulate and fine-tune player growth over multiple seasons</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div class="flex flex-col gap-1">
              <label for="genAgeSelect" class="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-1">Gen Age</label>
              <select 
                id="genAgeSelect"
                [value]="selectedAge() ?? 'random'" 
                (change)="onAgeChange($event)"
                class="bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs rounded-lg px-2 py-2 outline-none focus:border-emerald-500 min-w-[100px]"
              >
                <option value="random">Random</option>
                @for (age of [16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35]; track age) {
                  <option [value]="age">{{ age }}</option>
                }
              </select>
            </div>
            <button
              (click)="generateRandomPlayer()"
              class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold transition-colors shadow-lg self-end h-[38px]"
            >
              Generate Random Player
            </button>
            <button
              (click)="resetStats()"
              [disabled]="!player()"
              class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 self-end h-[38px]"
            >
              Reset History
            </button>
          </div>
        </div>

        @if (player(); as p) {
          <!-- Column: Attributes Editor -->
          <div class="lg:col-span-3 space-y-8">
            <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-6">
              <div class="flex items-center justify-between border-b border-zinc-800 pb-4">
                <h2 class="text-xl font-bold text-white flex items-center gap-2">
                  <span class="material-icons text-emerald-400">edit</span>
                  Edit Attributes
                </h2>
                <div class="flex items-center gap-4">
                  <div class="text-right">
                    <p class="text-xs text-zinc-500 uppercase font-bold tracking-wider">Overall</p>
                    <p class="text-2xl font-black text-emerald-400">{{ currentAttributes()?.overall?.value }}</p>
                  </div>
                </div>
              </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                  <!-- Basic Info -->
                  <div class="space-y-4">
                    <h3 class="text-sm font-bold text-zinc-500 uppercase tracking-widest">Personal</h3>
                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <label for="playerName" class="block text-xs font-medium text-zinc-400 mb-1">Name</label>
                        <input id="playerName" [value]="p.name" (input)="updateName($event)" class="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-sm focus:border-emerald-500 outline-none" />
                      </div>
                      <div>
                        <label for="playerPosition" class="block text-xs font-medium text-zinc-400 mb-1">Position</label>
                        <select id="playerPosition" [value]="p.position" (change)="updatePosition($event)" class="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-sm focus:border-emerald-500 outline-none">
                          <option [value]="PositionEnum.GOALKEEPER">GK</option>
                          <option [value]="PositionEnum.DEFENDER">DEF</option>
                          <option [value]="PositionEnum.MIDFIELDER">MID</option>
                          <option [value]="PositionEnum.FORWARD">FWD</option>
                        </select>
                      </div>
                      <div>
                        <label for="playerAge" class="block text-xs font-medium text-zinc-400 mb-1">Age ({{ playerAge() }})</label>
                        <input id="playerAge" type="number" [value]="playerAge()" (input)="updateAge($event)" class="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-sm focus:border-emerald-500 outline-none" />
                      </div>
                    </div>
                  </div>

                  <!-- Progression Parameters -->
                  <div class="space-y-4">
                    <h3 class="text-sm font-bold text-zinc-500 uppercase tracking-widest">Progression</h3>
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <label for="progPotential" class="block text-xs font-medium text-zinc-400 mb-1">Potential</label>
                        <input id="progPotential" type="number" [value]="p.progression.potential" (input)="updateProgression('potential', $event)" class="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-sm focus:border-emerald-500 outline-none" />
                      </div>
                      <div>
                        <label for="progProfessionalism" class="block text-xs font-medium text-zinc-400 mb-1">Professionalism</label>
                        <input id="progProfessionalism" type="number" [value]="p.progression.professionalism" (input)="updateProgression('professionalism', $event)" class="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-sm focus:border-emerald-500 outline-none" />
                      </div>
                      <div>
                        <label for="progTemperament" class="block text-xs font-medium text-zinc-400 mb-1">Temperament</label>
                        <input id="progTemperament" type="number" [value]="p.progression.temperament" (input)="updateProgression('temperament', $event)" class="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-sm focus:border-emerald-500 outline-none" />
                      </div>
                      <div>
                        <label for="progJuniorEnd" class="block text-xs font-medium text-zinc-400 mb-1">Junior End</label>
                        <input id="progJuniorEnd" type="number" [value]="p.progression.juniorEndAge" (input)="updateProgression('juniorEndAge', $event)" class="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-sm focus:border-emerald-500 outline-none" />
                      </div>
                      <div>
                        <label for="progPeakEnd" class="block text-xs font-medium text-zinc-400 mb-1">Peak End</label>
                        <input id="progPeakEnd" type="number" [value]="p.progression.peakEndAge" (input)="updateProgression('peakEndAge', $event)" class="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-sm focus:border-emerald-500 outline-none" />
                      </div>
                      <div>
                        <label for="progSeniorEnd" class="block text-xs font-medium text-zinc-400 mb-1">Senior End</label>
                        <input id="progSeniorEnd" type="number" [value]="p.progression.seniorEndAge" (input)="updateProgression('seniorEndAge', $event)" class="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-sm focus:border-emerald-500 outline-none" />
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Stats Grid -->
                <div class="pt-6 border-t border-zinc-800">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-12">
                    @for (category of statCategories; track category) {
                      <div class="space-y-4">
                        <h3 class="text-sm font-bold text-zinc-500 uppercase tracking-widest">{{ category }}</h3>
                        <div class="space-y-3">
                          @for (key of getKeys(category); track key) {
                            <div class="flex items-center gap-4">
                              <label [for]="'stat-' + key" class="text-xs text-zinc-400 w-24 capitalize">{{ formatKey(key) }}</label>
                              <input
                                [id]="'stat-' + key"
                                type="range"
                                min="1"
                                max="99"
                                [value]="currentAttributes()?.[key]?.value || 0"
                                (input)="updateStat(key, $event)"
                                class="flex-1 accent-emerald-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                              />
                              <span class="text-xs font-mono w-6 text-right">{{ currentAttributes()?.[key]?.value || 0 }}</span>
                            </div>
                          }
                        </div>
                      </div>
                    }
                  </div>
                </div>
            </div>
          </div>

          <!-- Bottom: Detailed Season History -->
          <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 class="text-sm font-bold text-zinc-500 uppercase tracking-widest">Season History</h2>
                <p class="text-[10px] text-zinc-600 italic mt-1">Calculated using current GameService progression engine</p>
              </div>
              <button
                (click)="generateNextSeason()"
                class="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg flex items-center justify-center gap-2"
              >
                <span class="material-icons">fast_forward</span>
                Generate Next Season
              </button>
            </div>

            <div class="overflow-x-auto rounded-xl border border-zinc-800">
              <table class="w-full text-[10px] min-w-[1400px]">
                <thead class="bg-zinc-800/50">
                  <tr class="text-zinc-500 border-b border-zinc-800">
                    <th class="px-3 py-3 text-left sticky left-0 bg-zinc-900 z-20">Season</th>
                    <th class="px-2 py-3 text-right">Age</th>
                    <th class="px-2 py-3 text-right border-x border-zinc-800/50 font-bold text-zinc-300">OVR</th>
                    @for (key of allStatKeys(); track key) {
                      <th class="px-1 py-3 text-right capitalize">{{ formatKey(key) }}</th>
                    }
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-800">
                  @for (s of p.seasonAttributes; track s.seasonYear; let i = $index) {
                    <tr class="hover:bg-zinc-800/30 transition-colors">
                      <td class="px-3 py-3 font-medium sticky left-0 bg-zinc-900/90 backdrop-blur-sm z-20">{{ s.seasonYear }}</td>
                      <td class="px-2 py-3 text-right text-zinc-400 font-mono">{{ getAgeAtSeason(s.seasonYear) }}</td>
                      <td class="px-2 py-3 text-right font-bold text-emerald-400 font-mono border-x border-zinc-800/50">
                        {{ s.overall.value }}
                        @let diff = getOvrDiff(i);
                        @if (diff !== null) {
                          <span class="block text-[9px] mt-0.5" [class.text-emerald-500]="diff > 0" [class.text-red-500]="diff < 0" [class.text-zinc-600]="diff === 0">
                            {{ diff > 0 ? '+' : '' }}{{ diff }}
                          </span>
                        }
                      </td>
                      @for (key of allStatKeys(); track key) {
                        <td class="px-1 py-3 text-right font-mono text-zinc-300">
                          {{ s[key]?.value || 0 }}
                          @let sDiff = getStatDiff(i, key);
                          @if (sDiff !== null) {
                            <span class="block text-[9px] mt-0.5" [class.text-emerald-500]="sDiff > 0" [class.text-red-500]="sDiff < 0" [class.text-zinc-600]="sDiff === 0">
                              {{ sDiff > 0 ? '+' : '' }}{{ sDiff }}
                            </span>
                          }
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        } @else {
          <div class="bg-zinc-900/50 border border-zinc-800 border-dashed rounded-3xl p-32 text-center">
            <span class="material-icons text-6xl text-zinc-700 mb-4">person_add</span>
            <p class="text-zinc-500">Generate a player to start debugging progression</p>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    input[type=range]::-webkit-slider-thumb {
      appearance: none;
      height: 12px;
      width: 12px;
      border-radius: 50%;
      background: #10b981;
      cursor: pointer;
    }
  `]
})
export class DebugPlayerProfileComponent {
  private gameService = inject(GameService);
  private generator = inject(GeneratorService);

  selectedAge = signal<number | null>(null);

  player = signal<Player | null>(null);
  PositionEnum = PositionEnum;
  statCategories: StatCategory[] = ['physical', 'skill', 'goalkeeping', 'mental'];

  currentAttributes = computed<PlayerSeasonAttributes | null>(() => {
    const p = this.player();
    if (!p) return null;
    return p.seasonAttributes[p.seasonAttributes.length - 1];
  });

  playerAge = computed(() => {
    const p = this.player();
    const attrs = this.currentAttributes();
    if (!p || !attrs) return 0;
    return computeAge(p.personal.birthday, seasonAnchorDate(attrs.seasonYear));
  });

  onAgeChange(event: Event) {
    const val = (event.target as HTMLSelectElement).value;
    this.selectedAge.set(val === 'random' ? null : parseInt(val, 10));
  }

  generateRandomPlayer() {
    const year = this.gameService.league()?.currentSeasonYear ?? new Date().getFullYear();
    // Pass the selected age directly — generatePlayer handles youth quality scaling internally.
    const p = this.generator.generatePlayer('debug', PositionEnum.FORWARD, Role.STARTER, 1.0, year, this.selectedAge() ?? undefined);
    this.player.set(p);
  }

  resetStats() {
    const p = this.player();
    if (!p) return;
    const current = p.seasonAttributes[p.seasonAttributes.length - 1];
    this.player.set({
      ...p,
      seasonAttributes: [current],
      careerStats: p.careerStats.slice(0, 1)
    });
  }

  generateNextSeason() {
    const p = this.player();
    if (!p) return;
    const currentYear = p.seasonAttributes[p.seasonAttributes.length - 1].seasonYear;
    const nextYear = currentYear + 1;
    const nextAttrs = this.gameService.generateNextSeasonAttributes(p, nextYear);

    this.player.set({
      ...p,
      seasonAttributes: [...p.seasonAttributes, nextAttrs]
    });
  }

  updateName(event: Event) {
    const p = this.player();
    const name = (event.target as HTMLInputElement).value;
    if (p) this.player.set({ ...p, name });
  }

  updatePosition(event: Event) {
    const p = this.player();
    const attrs = this.currentAttributes();
    const pos = (event.target as HTMLSelectElement).value;
    if (!p || !attrs) return;
    const newP = { ...p, position: pos as Position };
    attrs.overall = buildStat('overall', calculateOverall(attrs, newP.position));
    this.player.set(newP);
  }

  updateAge(event: Event) {
    const p = this.player();
    const attrs = this.currentAttributes();
    const age = (event.target as HTMLInputElement).value;
    if (!p || !attrs) return;
    const year = attrs.seasonYear;
    const birthday = birthdayForAge(Number(age), year, 0.5);
    this.player.set({ ...p, personal: { ...p.personal, birthday } });
  }

  updateProgression(field: keyof Player['progression'], event: Event) {
    const p = this.player();
    const value = (event.target as HTMLInputElement).value;
    if (p) this.player.set({ ...p, progression: { ...p.progression, [field]: Number(value) } });
  }

  updateStat(key: StatKey, event: Event) {
    const p = this.player();
    const current = this.currentAttributes();
    const value = (event.target as HTMLInputElement).value;
    if (!p || !current) return;

    const attrs = { ...current };
    attrs[key] = buildStat(key, Number(value));
    attrs.overall = buildStat('overall', calculateOverall(attrs, p.position));

    const seasonAttributes = [...p.seasonAttributes];
    seasonAttributes[seasonAttributes.length - 1] = attrs;
    this.player.set({ ...p, seasonAttributes });
  }

  allStatKeys = computed(() => {
    return this.statCategories.flatMap(c => getStatKeysForCategory(c));
  });

  getKeys(category: StatCategory) {
    return getStatKeysForCategory(category);
  }

  formatKey(key: string) {
    return key.replace(/([A-Z])/g, ' $1').toLowerCase();
  }

  getAgeAtSeason(year: number) {
    const p = this.player();
    if (!p) return 0;
    return computeAge(p.personal.birthday, seasonAnchorDate(year));
  }

  getOvrDiff(index: number) {
    const p = this.player();
    if (!p || index === 0) return null;
    const current = p.seasonAttributes[index].overall.value;
    const prev = p.seasonAttributes[index - 1].overall.value;
    return current - prev;
  }

  getStatDiff(index: number, key: StatKey) {
    const p = this.player();
    if (!p || index === 0) return null;
    const current = p.seasonAttributes[index][key]?.value || 0;
    const prev = p.seasonAttributes[index - 1][key]?.value || 0;
    return current - prev;
  }
}
