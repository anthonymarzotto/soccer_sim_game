import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';

@Component({
  selector: 'app-player-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-12">
      <div class="max-w-4xl mx-auto space-y-8">
        
        <div class="flex items-center gap-4">
          <a [routerLink]="['/team', player()?.teamId]" class="p-2 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </a>
          <div>
            <div class="flex items-center gap-3">
              <h1 class="text-3xl font-bold tracking-tight text-white">{{ player()?.name }}</h1>
              <span class="px-2 py-1 rounded text-xs font-bold font-mono"
                    [class.bg-yellow-500/20]="player()?.position === 'GK'"
                    [class.text-yellow-400]="player()?.position === 'GK'"
                    [class.bg-blue-500/20]="player()?.position === 'DEF'"
                    [class.text-blue-400]="player()?.position === 'DEF'"
                    [class.bg-emerald-500/20]="player()?.position === 'MID'"
                    [class.text-emerald-400]="player()?.position === 'MID'"
                    [class.bg-red-500/20]="player()?.position === 'FWD'"
                    [class.text-red-400]="player()?.position === 'FWD'">
                {{ player()?.position }}
              </span>
            </div>
            <p class="text-zinc-400 mt-1">{{ team()?.name }} • {{ player()?.role }}</p>
          </div>
          <div class="ml-auto flex items-center justify-center w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-inner">
            <span class="text-2xl font-bold text-white">{{ player()?.overall }}</span>
          </div>
        </div>

        @if (player()) {
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <!-- Personal Info -->
            <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
              <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Personal Details
              </h2>
              <div class="space-y-4">
                <div class="flex justify-between items-center border-b border-zinc-800/50 pb-3">
                  <span class="text-zinc-500">Age</span>
                  <span class="font-medium text-white">{{ player()?.personal?.age }}</span>
                </div>
                <div class="flex justify-between items-center border-b border-zinc-800/50 pb-3">
                  <span class="text-zinc-500">Nationality</span>
                  <span class="font-medium text-white">{{ player()?.personal?.nationality }}</span>
                </div>
                <div class="flex justify-between items-center border-b border-zinc-800/50 pb-3">
                  <span class="text-zinc-500">Height</span>
                  <span class="font-medium text-white">{{ player()?.personal?.height }} cm</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-zinc-500">Weight</span>
                  <span class="font-medium text-white">{{ player()?.personal?.weight }} kg</span>
                </div>
              </div>
            </div>

            <!-- Physical & Mental -->
            <div class="space-y-6">
              <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
                <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>
                  Physical
                </h2>
                <div class="space-y-4">
                  <div class="flex items-center gap-4">
                    <span class="text-zinc-500 w-24">Speed</span>
                    <div class="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div class="h-full bg-emerald-500 rounded-full" [style.width.%]="player()?.physical?.speed"></div>
                    </div>
                    <span class="font-mono text-sm font-medium w-8 text-right">{{ player()?.physical?.speed }}</span>
                  </div>
                  <div class="flex items-center gap-4">
                    <span class="text-zinc-500 w-24">Strength</span>
                    <div class="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div class="h-full bg-emerald-500 rounded-full" [style.width.%]="player()?.physical?.strength"></div>
                    </div>
                    <span class="font-mono text-sm font-medium w-8 text-right">{{ player()?.physical?.strength }}</span>
                  </div>
                </div>
              </div>

              <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
                <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l3-9 5 18 3-9h5"/></svg>
                  Mental
                </h2>
              <div class="space-y-4">
                <div class="flex items-center gap-4">
                  <span class="text-zinc-500 w-24">Flair</span>
                  <div class="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div class="h-full bg-blue-500 rounded-full" [style.width.%]="player()?.mental?.flair"></div>
                  </div>
                  <span class="font-mono text-sm font-medium w-8 text-right">{{ player()?.mental?.flair }}</span>
                </div>
                <div class="flex items-center gap-4">
                  <span class="text-zinc-500 w-24">Vision</span>
                  <div class="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div class="h-full bg-blue-500 rounded-full" [style.width.%]="player()?.mental?.vision"></div>
                  </div>
                  <span class="font-mono text-sm font-medium w-8 text-right">{{ player()?.mental?.vision }}</span>
                </div>
                <div class="flex items-center gap-4">
                  <span class="text-zinc-500 w-24">Determination</span>
                  <div class="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div class="h-full bg-blue-500 rounded-full" [style.width.%]="player()?.mental?.determination"></div>
                  </div>
                  <span class="font-mono text-sm font-medium w-8 text-right">{{ player()?.mental?.determination }}</span>
                </div>
              </div>
            </div>

            <!-- Hidden Stats -->
            <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
              <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l3-9 5 18 3-9h5"/></svg>
                Hidden Stats
              </h2>
              <div class="space-y-4">
                <div class="flex items-center gap-4">
                  <span class="text-zinc-500 w-24">Luck</span>
                  <div class="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div class="h-full bg-orange-500 rounded-full" [style.width.%]="player()?.hidden?.luck"></div>
                  </div>
                  <span class="font-mono text-sm font-medium w-8 text-right">{{ player()?.hidden?.luck }}</span>
                </div>
              </div>
              </div>
            </div>

            <!-- Skills -->
            <div class="md:col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
              <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                Technical Skills
              </h2>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                <div class="flex items-center gap-4">
                  <span class="text-zinc-500 w-28">Tackling</span>
                  <div class="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div class="h-full bg-purple-500 rounded-full" [style.width.%]="player()?.skills?.tackling"></div>
                  </div>
                  <span class="font-mono text-sm font-medium w-8 text-right">{{ player()?.skills?.tackling }}</span>
                </div>
                <div class="flex items-center gap-4">
                  <span class="text-zinc-500 w-28">Shooting</span>
                  <div class="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div class="h-full bg-purple-500 rounded-full" [style.width.%]="player()?.skills?.shooting"></div>
                  </div>
                  <span class="font-mono text-sm font-medium w-8 text-right">{{ player()?.skills?.shooting }}</span>
                </div>
                <div class="flex items-center gap-4">
                  <span class="text-zinc-500 w-28">Heading</span>
                  <div class="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div class="h-full bg-purple-500 rounded-full" [style.width.%]="player()?.skills?.heading"></div>
                  </div>
                  <span class="font-mono text-sm font-medium w-8 text-right">{{ player()?.skills?.heading }}</span>
                </div>
                <div class="flex items-center gap-4">
                  <span class="text-zinc-500 w-28">Long Passing</span>
                  <div class="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div class="h-full bg-purple-500 rounded-full" [style.width.%]="player()?.skills?.longPassing"></div>
                  </div>
                  <span class="font-mono text-sm font-medium w-8 text-right">{{ player()?.skills?.longPassing }}</span>
                </div>
                <div class="flex items-center gap-4">
                  <span class="text-zinc-500 w-28">Short Passing</span>
                  <div class="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div class="h-full bg-purple-500 rounded-full" [style.width.%]="player()?.skills?.shortPassing"></div>
                  </div>
                  <span class="font-mono text-sm font-medium w-8 text-right">{{ player()?.skills?.shortPassing }}</span>
                </div>
                <div class="flex items-center gap-4">
                  <span class="text-zinc-500 w-28">Goalkeeping</span>
                  <div class="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div class="h-full bg-yellow-500 rounded-full" [style.width.%]="player()?.skills?.goalkeeping"></div>
                  </div>
                  <span class="font-mono text-sm font-medium w-8 text-right">{{ player()?.skills?.goalkeeping }}</span>
                </div>
              </div>
            </div>

          </div>
        } @else {
          <div class="text-center py-12 text-zinc-500">
            Player not found.
          </div>
        }
      </div>
    </div>
  `
})
export class PlayerProfileComponent {
  private route = inject(ActivatedRoute);
  private gameService = inject(GameService);

  private playerId = computed(() => this.route.snapshot.paramMap.get('id'));

  player = computed(() => {
    const id = this.playerId();
    if (!id) return undefined;
    return this.gameService.getPlayer(id);
  });

  team = computed(() => {
    const p = this.player();
    if (!p) return undefined;
    return this.gameService.getTeam(p.teamId);
  });
}
