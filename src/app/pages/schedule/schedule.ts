import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';

@Component({
  selector: 'app-schedule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-12">
      <div class="max-w-4xl mx-auto space-y-8">
        
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <a routerLink="/standings" class="p-2 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </a>
            <div>
              <h1 class="text-3xl font-bold tracking-tight text-white">Schedule</h1>
              <p class="text-zinc-400 mt-1">Match Results & Fixtures</p>
            </div>
          </div>
          
          <div class="flex items-center gap-3">
            <button 
              (click)="simulateCurrentWeek()"
              [disabled]="(gameService.league()?.currentWeek || 1) > maxWeeks()"
              class="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
              Simulate Week {{ gameService.league()?.currentWeek }}
            </button>
          </div>
        </div>

        <div class="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl p-6">
          <div class="flex items-center justify-between mb-8">
            <button 
              (click)="prevWeek()"
              [disabled]="selectedWeek() <= 1"
              class="p-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <h2 class="text-xl font-semibold text-white">Week {{ selectedWeek() }}</h2>
            <button 
              (click)="nextWeek()"
              [disabled]="selectedWeek() >= maxWeeks()"
              class="p-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>

          <div class="space-y-3">
            @for (match of matches(); track match.id) {
              <div class="flex flex-col p-4 rounded-xl bg-zinc-950 border border-zinc-800/50">
                <div class="flex items-center justify-between">
                  <div class="flex-1 text-right">
                    <a [routerLink]="['/team', match.homeTeamId]" class="font-medium hover:text-emerald-400 transition-colors">
                      {{ getTeamName(match.homeTeamId) }} <span class="text-zinc-500 text-xs ml-1">({{ getTeamOverall(match.homeTeamId) }})</span>
                    </a>
                  </div>
                  
                  <div class="w-32 flex justify-center items-center px-4">
                    @if (match.played) {
                      <div class="px-4 py-1.5 bg-zinc-800 rounded-lg font-bold font-mono text-lg tracking-widest text-white shadow-inner">
                        {{ match.homeScore }} - {{ match.awayScore }}
                      </div>
                    } @else {
                      <div class="px-4 py-1.5 bg-zinc-800/50 text-zinc-500 rounded-lg font-medium text-sm">
                        VS
                      </div>
                    }
                  </div>

                  <div class="flex-1 text-left">
                    <a [routerLink]="['/team', match.awayTeamId]" class="font-medium hover:text-emerald-400 transition-colors">
                      <span class="text-zinc-500 text-xs mr-1">({{ getTeamOverall(match.awayTeamId) }})</span> {{ getTeamName(match.awayTeamId) }}
                    </a>
                  </div>
                </div>
                @if (!match.played) {
                  <div class="mt-3 flex justify-center gap-4 text-xs text-zinc-500 font-mono">
                    <span class="text-emerald-500/70">W: {{ getProbabilities(match.homeTeamId, match.awayTeamId).home }}%</span>
                    <span class="text-zinc-500">D: {{ getProbabilities(match.homeTeamId, match.awayTeamId).draw }}%</span>
                    <span class="text-red-500/70">L: {{ getProbabilities(match.homeTeamId, match.awayTeamId).away }}%</span>
                  </div>
                }
              </div>
            }
            @if (matches().length === 0) {
              <div class="text-center py-8 text-zinc-500">No matches found for this week.</div>
            }
          </div>
        </div>

      </div>
    </div>
  `
})
export class ScheduleComponent {
  gameService = inject(GameService);

  selectedWeek = signal<number>(this.gameService.league()?.currentWeek || 1);

  maxWeeks = computed(() => {
    const l = this.gameService.league();
    if (!l) return 1;
    return (l.teams.length - 1) * 2;
  });

  matches = computed(() => {
    return this.gameService.getMatchesForWeek(this.selectedWeek());
  });

  prevWeek() {
    if (this.selectedWeek() > 1) {
      this.selectedWeek.update(w => w - 1);
    }
  }

  nextWeek() {
    if (this.selectedWeek() < this.maxWeeks()) {
      this.selectedWeek.update(w => w + 1);
    }
  }

  simulateCurrentWeek() {
    const currentWeek = this.gameService.league()?.currentWeek;
    if (currentWeek && currentWeek <= this.maxWeeks()) {
      this.gameService.simulateCurrentWeek();
      this.selectedWeek.set(currentWeek);
    }
  }

  getTeamName(id: string): string {
    return this.gameService.getTeam(id)?.name || 'Unknown';
  }

  getTeamOverall(id: string): number {
    const team = this.gameService.getTeam(id);
    if (!team) return 0;
    return this.gameService.calculateTeamOverall(team);
  }

  getProbabilities(homeId: string, awayId: string) {
    const homeTeam = this.gameService.getTeam(homeId);
    const awayTeam = this.gameService.getTeam(awayId);
    if (!homeTeam || !awayTeam) return { home: 0, draw: 0, away: 0 };

    const homeOverall = this.gameService.calculateTeamOverall(homeTeam);
    const awayOverall = this.gameService.calculateTeamOverall(awayTeam);

    const homeAdvantage = 5;
    const homeChance = homeOverall + homeAdvantage;
    const awayChance = awayOverall;
    const totalChance = homeChance + awayChance;

    const homeWinProb = Math.round((homeChance / totalChance) * 100);
    const awayWinProb = Math.round((awayChance / totalChance) * 100);
    
    const diff = Math.abs(homeChance - awayChance);
    const drawProb = Math.max(5, 30 - diff);
    
    const adjustedHome = Math.round(homeWinProb * (100 - drawProb) / 100);
    const adjustedAway = Math.round(awayWinProb * (100 - drawProb) / 100);
    const finalDraw = 100 - adjustedHome - adjustedAway;

    return { home: adjustedHome, draw: finalDraw, away: adjustedAway };
  }
}
