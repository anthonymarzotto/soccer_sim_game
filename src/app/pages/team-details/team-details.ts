import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';

@Component({
  selector: 'app-team-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-12">
      <div class="max-w-6xl mx-auto space-y-8">
        
        <div class="flex items-center gap-4">
          <a routerLink="/standings" class="p-2 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </a>
          <div>
            <div class="flex items-center gap-3">
              <h1 class="text-3xl font-bold tracking-tight text-white">{{ team()?.name }}</h1>
              @if (team()) {
                <span class="px-2 py-1 rounded text-sm font-bold bg-zinc-800 text-white border border-zinc-700">
                  OVR {{ teamOverall() }}
                </span>
              }
            </div>
            <p class="text-zinc-400 mt-1">Team Roster & Details</p>
          </div>
        </div>

        @if (team()) {
          <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
            
            <div class="lg:col-span-1 space-y-6">
              <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
                <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Team Stats</h2>
                <div class="space-y-4">
                  <div class="flex justify-between items-center">
                    <span class="text-zinc-500">Matches Played</span>
                    <span class="font-medium">{{ team()?.stats?.played }}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-zinc-500">Wins</span>
                    <span class="font-medium text-emerald-400">{{ team()?.stats?.won }}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-zinc-500">Draws</span>
                    <span class="font-medium text-zinc-300">{{ team()?.stats?.drawn }}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-zinc-500">Losses</span>
                    <span class="font-medium text-red-400">{{ team()?.stats?.lost }}</span>
                  </div>
                  <div class="h-px bg-zinc-800 my-2"></div>
                  <div class="flex justify-between items-center">
                    <span class="text-zinc-500">Goals For</span>
                    <span class="font-medium">{{ team()?.stats?.goalsFor }}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-zinc-500">Goals Against</span>
                    <span class="font-medium">{{ team()?.stats?.goalsAgainst }}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-zinc-500">Goal Diff</span>
                    <span class="font-medium">{{ (team()?.stats?.goalsFor || 0) - (team()?.stats?.goalsAgainst || 0) }}</span>
                  </div>
                  <div class="h-px bg-zinc-800 my-2"></div>
                  <div class="flex justify-between items-center text-lg">
                    <span class="text-zinc-400 font-medium">Points</span>
                    <span class="font-bold text-white">{{ team()?.stats?.points }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="lg:col-span-3 space-y-8">
              
              <!-- Starters -->
              <div class="space-y-4">
                <h2 class="text-xl font-semibold text-white flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Starting XI
                </h2>
                <div class="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                  <table class="w-full text-sm text-left">
                    <thead class="text-xs text-zinc-400 uppercase bg-zinc-900/50 border-b border-zinc-800">
                      <tr>
                        <th scope="col" class="px-6 py-4 font-medium">Pos</th>
                        <th scope="col" class="px-6 py-4 font-medium">Player</th>
                        <th scope="col" class="px-4 py-4 font-medium text-center">OVR</th>
                        <th scope="col" class="px-4 py-4 font-medium text-center">Age</th>
                        <th scope="col" class="px-4 py-4 font-medium text-center">Nat</th>
                        <th scope="col" class="px-4 py-4 font-medium text-right">Role</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-zinc-800">
                      @for (player of starters(); track player.id) {
                        <tr class="hover:bg-zinc-800/50 transition-colors">
                          <td class="px-6 py-4 whitespace-nowrap font-mono text-xs font-bold"
                              [class.text-yellow-400]="player.position === 'GK'"
                              [class.text-blue-400]="player.position === 'DEF'"
                              [class.text-emerald-400]="player.position === 'MID'"
                              [class.text-red-400]="player.position === 'FWD'">
                            {{ player.position }}
                          </td>
                          <td class="px-6 py-4 whitespace-nowrap font-medium text-white">
                            <a [routerLink]="['/player', player.id]" class="hover:text-emerald-400 transition-colors">
                              {{ player.name }}
                            </a>
                          </td>
                          <td class="px-4 py-4 whitespace-nowrap text-center font-bold text-white">{{ player.overall }}</td>
                          <td class="px-4 py-4 whitespace-nowrap text-center text-zinc-400">{{ player.personal.age }}</td>
                          <td class="px-4 py-4 whitespace-nowrap text-center text-zinc-400">{{ player.personal.nationality }}</td>
                          <td class="px-4 py-4 whitespace-nowrap text-right text-zinc-500 text-xs uppercase tracking-wider">
                            @if (isUserTeam()) {
                              <select 
                                [value]="player.role" 
                                (change)="changeRole(player.id, $event)"
                                class="bg-zinc-800 text-white border border-zinc-700 rounded px-2 py-1 text-xs focus:ring-emerald-500 focus:border-emerald-500">
                                @for (role of availableRoles; track role) {
                                  <option [value]="role">{{ role }}</option>
                                }
                              </select>
                            } @else {
                              {{ player.role }}
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Bench -->
              <div class="space-y-4">
                <h2 class="text-xl font-semibold text-white flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-yellow-500"></span>
                  Bench
                </h2>
                <div class="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                  <table class="w-full text-sm text-left">
                    <thead class="text-xs text-zinc-400 uppercase bg-zinc-900/50 border-b border-zinc-800">
                      <tr>
                        <th scope="col" class="px-6 py-4 font-medium w-16">Pos</th>
                        <th scope="col" class="px-6 py-4 font-medium">Player</th>
                        <th scope="col" class="px-4 py-4 font-medium text-center w-16">OVR</th>
                        <th scope="col" class="px-4 py-4 font-medium text-center w-16">Age</th>
                        <th scope="col" class="px-4 py-4 font-medium text-center w-24">Nat</th>
                        <th scope="col" class="px-4 py-4 font-medium text-right w-32">Role</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-zinc-800">
                      @for (player of bench(); track player.id) {
                        <tr class="hover:bg-zinc-800/50 transition-colors">
                          <td class="px-6 py-4 whitespace-nowrap font-mono text-xs font-bold w-16"
                              [class.text-yellow-400]="player.position === 'GK'"
                              [class.text-blue-400]="player.position === 'DEF'"
                              [class.text-emerald-400]="player.position === 'MID'"
                              [class.text-red-400]="player.position === 'FWD'">
                            {{ player.position }}
                          </td>
                          <td class="px-6 py-4 whitespace-nowrap font-medium text-white">
                            <a [routerLink]="['/player', player.id]" class="hover:text-emerald-400 transition-colors">
                              {{ player.name }}
                            </a>
                          </td>
                          <td class="px-4 py-4 whitespace-nowrap text-center font-bold text-white w-16">{{ player.overall }}</td>
                          <td class="px-4 py-4 whitespace-nowrap text-center text-zinc-400 w-16">{{ player.personal.age }}</td>
                          <td class="px-4 py-4 whitespace-nowrap text-center text-zinc-400 w-24">{{ player.personal.nationality }}</td>
                          <td class="px-4 py-4 whitespace-nowrap text-right text-zinc-500 text-xs uppercase tracking-wider w-32">
                            @if (isUserTeam()) {
                              <select 
                                [value]="player.role" 
                                (change)="changeRole(player.id, $event)"
                                class="bg-zinc-800 text-white border border-zinc-700 rounded px-2 py-1 text-xs focus:ring-emerald-500 focus:border-emerald-500">
                                @for (role of availableRoles; track role) {
                                  <option [value]="role">{{ role }}</option>
                                }
                              </select>
                            } @else {
                              {{ player.role }}
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Reserves -->
              <div class="space-y-4">
                <h2 class="text-xl font-semibold text-white flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-zinc-600"></span>
                  Reserves
                </h2>
                <div class="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                  <table class="w-full text-sm text-left">
                    <thead class="text-xs text-zinc-400 uppercase bg-zinc-900/50 border-b border-zinc-800">
                      <tr>
                        <th scope="col" class="px-6 py-4 font-medium w-16">Pos</th>
                        <th scope="col" class="px-6 py-4 font-medium">Player</th>
                        <th scope="col" class="px-4 py-4 font-medium text-center w-16">OVR</th>
                        <th scope="col" class="px-4 py-4 font-medium text-center w-16">Age</th>
                        <th scope="col" class="px-4 py-4 font-medium text-center w-24">Nat</th>
                        <th scope="col" class="px-4 py-4 font-medium text-right w-32">Role</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-zinc-800">
                      @for (player of reserves(); track player.id) {
                        <tr class="hover:bg-zinc-800/50 transition-colors opacity-75">
                          <td class="px-6 py-4 whitespace-nowrap font-mono text-xs font-bold w-16"
                              [class.text-yellow-400]="player.position === 'GK'"
                              [class.text-blue-400]="player.position === 'DEF'"
                              [class.text-emerald-400]="player.position === 'MID'"
                              [class.text-red-400]="player.position === 'FWD'">
                            {{ player.position }}
                          </td>
                          <td class="px-6 py-4 whitespace-nowrap font-medium text-white">
                            <a [routerLink]="['/player', player.id]" class="hover:text-emerald-400 transition-colors">
                              {{ player.name }}
                            </a>
                          </td>
                          <td class="px-4 py-4 whitespace-nowrap text-center font-bold text-white w-16">{{ player.overall }}</td>
                          <td class="px-4 py-4 whitespace-nowrap text-center text-zinc-400 w-16">{{ player.personal.age }}</td>
                          <td class="px-4 py-4 whitespace-nowrap text-center text-zinc-400 w-24">{{ player.personal.nationality }}</td>
                          <td class="px-4 py-4 whitespace-nowrap text-right text-zinc-500 text-xs uppercase tracking-wider w-32">
                            @if (isUserTeam()) {
                              <select 
                                [value]="player.role" 
                                (change)="changeRole(player.id, $event)"
                                class="bg-zinc-800 text-white border border-zinc-700 rounded px-2 py-1 text-xs focus:ring-emerald-500 focus:border-emerald-500">
                                @for (role of availableRoles; track role) {
                                  <option [value]="role">{{ role }}</option>
                                }
                              </select>
                            } @else {
                              {{ player.role }}
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>
        } @else {
          <div class="text-center py-12 text-zinc-500">
            Team not found.
          </div>
        }
      </div>
    </div>
  `
})
export class TeamDetailsComponent {
  private route = inject(ActivatedRoute);
  private gameService = inject(GameService);

  availableRoles = ['Goalkeeper', 'Defense', 'Midfield', 'Attack', 'Bench', 'Not Dressed'];

  private teamId = computed(() => this.route.snapshot.paramMap.get('id'));

  isUserTeam = computed(() => {
    const l = this.gameService.league();
    return l?.userTeamId === this.teamId();
  });

  team = computed(() => {
    const id = this.teamId();
    if (!id) return undefined;
    return this.gameService.getTeam(id);
  });

  teamOverall = computed(() => {
    const t = this.team();
    if (!t) return 0;
    return this.gameService.calculateTeamOverall(t);
  });

  starters = computed(() => {
    const t = this.team();
    if (!t) return [];
    return t.players.filter(p => p.role !== 'Bench' && p.role !== 'Not Dressed')
      .sort((a, b) => this.positionWeight(a.position) - this.positionWeight(b.position));
  });

  bench = computed(() => {
    const t = this.team();
    if (!t) return [];
    return t.players.filter(p => p.role === 'Bench')
      .sort((a, b) => this.positionWeight(a.position) - this.positionWeight(b.position));
  });

  reserves = computed(() => {
    const t = this.team();
    if (!t) return [];
    return t.players.filter(p => p.role === 'Not Dressed')
      .sort((a, b) => this.positionWeight(a.position) - this.positionWeight(b.position));
  });

  private positionWeight(pos: string): number {
    switch(pos) {
      case 'GK': return 1;
      case 'DEF': return 2;
      case 'MID': return 3;
      case 'FWD': return 4;
      default: return 5;
    }
  }

  changeRole(playerId: string, event: Event) {
    const select = event.target as HTMLSelectElement;
    this.gameService.updatePlayerRole(playerId, select.value as import('../../models/types').Role);
  }
}
