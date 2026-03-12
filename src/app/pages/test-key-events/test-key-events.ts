import { Component, inject } from '@angular/core';
import { GameService } from '../../services/game.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-test-key-events',
  imports: [RouterLink],
  template: `
    <div class="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-12">
      <div class="max-w-4xl mx-auto space-y-8">
        
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <a routerLink="/schedule" class="p-2 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </a>
            <div>
              <h1 class="text-3xl font-bold tracking-tight text-white">Key Events Test</h1>
              <p class="text-zinc-400 mt-1">Test the key events feature</p>
            </div>
          </div>
          
          <div class="flex items-center gap-3">
            <button 
              (click)="generateLeague()"
              class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-zinc-950 rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-blue-500/20">
              Generate League
            </button>
            <button 
              (click)="simulateWeek()"
              [disabled]="!gameService.hasLeague()"
              class="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
              Simulate Week {{ gameService.league()?.currentWeek }}
            </button>
          </div>
        </div>

        <div class="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl p-6">
          <h2 class="text-xl font-semibold text-white mb-4">Recent Matches with Key Events</h2>
          
          @if (gameService.hasLeague()) {
            @for (match of recentMatches(); track match.id) {
              <div class="mb-6 p-4 rounded-xl bg-zinc-950 border border-zinc-800/50">
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-4">
                    <span class="font-medium text-white">{{ gameService.getTeam(match.homeTeamId)?.name }}</span>
                    <span class="font-bold text-2xl">{{ match.homeScore }} - {{ match.awayScore }}</span>
                    <span class="font-medium text-white">{{ gameService.getTeam(match.awayTeamId)?.name }}</span>
                  </div>
                  <span class="text-sm text-zinc-400">Week {{ match.week }}</span>
                </div>
                
                @if (match.keyEvents && match.keyEvents.length > 0) {
                  <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                    <div class="text-center p-2 bg-zinc-900 rounded-lg">
                      <div class="text-2xl">⚽</div>
                      <div class="text-xs text-zinc-400 mt-1">Goals</div>
                      <div class="text-sm font-bold text-white">{{ getEventCount(match.keyEvents, 'GOAL') }}</div>
                    </div>
                    <div class="text-center p-2 bg-zinc-900 rounded-lg">
                      <div class="text-2xl">🟨</div>
                      <div class="text-xs text-zinc-400 mt-1">Yellow Cards</div>
                      <div class="text-sm font-bold text-white">{{ getEventCount(match.keyEvents, 'YELLOW_CARD') }}</div>
                    </div>
                    <div class="text-center p-2 bg-zinc-900 rounded-lg">
                      <div class="text-2xl">🟥</div>
                      <div class="text-xs text-zinc-400 mt-1">Red Cards</div>
                      <div class="text-sm font-bold text-white">{{ getEventCount(match.keyEvents, 'RED_CARD') }}</div>
                    </div>
                    <div class="text-center p-2 bg-zinc-900 rounded-lg">
                      <div class="text-2xl">🎯</div>
                      <div class="text-xs text-zinc-400 mt-1">Penalties</div>
                      <div class="text-sm font-bold text-white">{{ getEventCount(match.keyEvents, 'PENALTY') }}</div>
                    </div>
                  </div>
                  
                  <div class="space-y-2">
                    @for (event of match.keyEvents; track event.id) {
                      <div class="flex items-center gap-3 p-2 bg-zinc-900 rounded-lg">
                        <span class="text-lg">{{ event.icon }}</span>
                        <div class="flex-1">
                          <div class="text-sm font-medium text-white">{{ event.description }}</div>
                          <div class="text-xs text-zinc-400">{{ event.time }}'</div>
                        </div>
                        @if (event.importance === 'high') {
                          <span class="px-2 py-1 bg-red-500/20 text-red-300 text-xs rounded-full">Important</span>
                        } @else if (event.importance === 'medium') {
                          <span class="px-2 py-1 bg-yellow-500/20 text-yellow-300 text-xs rounded-full">Key</span>
                        }
                      </div>
                    }
                  </div>
                  
                  @if (match.matchStats) {
                    <div class="mt-4 p-3 bg-zinc-900 rounded-lg">
                      <h5 class="text-sm font-semibold text-zinc-300 mb-2">Match Statistics</h5>
                      <div class="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div class="flex justify-between">
                            <span class="text-zinc-400">Possession</span>
                            <span class="font-medium">{{ match.matchStats.possession.home }}% - {{ match.matchStats.possession.away }}%</span>
                          </div>
                          <div class="flex justify-between mt-1">
                            <span class="text-zinc-400">Shots</span>
                            <span class="font-medium">{{ match.matchStats.shots.home }} - {{ match.matchStats.shots.away }}</span>
                          </div>
                          <div class="flex justify-between mt-1">
                            <span class="text-zinc-400">Shots on Target</span>
                            <span class="font-medium">{{ match.matchStats.shotsOnTarget.home }} - {{ match.matchStats.shotsOnTarget.away }}</span>
                          </div>
                        </div>
                        <div>
                          <div class="flex justify-between">
                            <span class="text-zinc-400">Corners</span>
                            <span class="font-medium">{{ match.matchStats.corners.home }} - {{ match.matchStats.corners.away }}</span>
                          </div>
                          <div class="flex justify-between mt-1">
                            <span class="text-zinc-400">Fouls</span>
                            <span class="font-medium">{{ match.matchStats.fouls.home }} - {{ match.matchStats.fouls.away }}</span>
                          </div>
                          <div class="flex justify-between mt-1">
                            <span class="text-zinc-400">Cards</span>
                            <span class="font-medium">{{ match.matchStats.cards.home.yellow + match.matchStats.cards.home.red }} - {{ match.matchStats.cards.away.yellow + match.matchStats.cards.away.red }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  }
                } @else {
                  <div class="text-zinc-500 text-sm">No key events recorded for this match.</div>
                }
              </div>
            }
          } @else {
            <div class="text-center py-8 text-zinc-500">No league data available. Generate a league first.</div>
          }
        </div>

      </div>
    </div>
  `
})
export class TestKeyEventsComponent {
  gameService = inject(GameService);

  recentMatches() {
    const league = this.gameService.league();
    if (!league) return [];
    
    // Get matches from the current week and previous weeks
    return league.schedule
      .filter(m => m.week <= (league.currentWeek || 1) && m.played)
      .sort((a, b) => b.week - a.week)
      .slice(0, 5); // Show last 5 played matches
  }

  generateLeague() {
    this.gameService.generateNewLeague();
  }

  simulateWeek() {
    this.gameService.simulateCurrentWeek();
  }

  getEventCount(keyEvents: any[], eventType: string): number {
    return keyEvents.filter(event => event.type === eventType).length;
  }
}