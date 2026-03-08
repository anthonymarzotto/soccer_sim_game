import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { GameService } from '../../services/game.service';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  template: `
    <div class="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-zinc-100 p-6">
      <div class="max-w-md w-full text-center space-y-8">
        <div class="space-y-2">
          <h1 class="text-5xl font-bold tracking-tight text-emerald-400">FC Sim</h1>
          <p class="text-zinc-400 text-lg">Text-Based Soccer Simulator</p>
        </div>
        
        <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-xl">
          @if (!leagueGenerated()) {
            <p class="text-zinc-300 mb-8 leading-relaxed">
              Take control of a generated league. View standings, manage team rosters, and simulate weekly matches.
            </p>
            
            <button 
              (click)="generateLeague()"
              class="w-full bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold py-4 px-6 rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-emerald-500/20">
              Generate New League
            </button>
          } @else {
            <h2 class="text-xl font-semibold text-white mb-4">Select Your Team</h2>
            <div class="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              @for (team of gameService.league()?.teams; track team.id) {
                <button 
                  (click)="selectTeam(team.id)"
                  class="w-full text-left px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors border border-zinc-700/50 hover:border-emerald-500/50">
                  <div class="flex justify-between items-center">
                    <span class="font-medium">{{ team.name }}</span>
                    <span class="text-xs text-zinc-500 font-mono">OVR {{ gameService.calculateTeamOverall(team) }}</span>
                  </div>
                </button>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .custom-scrollbar::-webkit-scrollbar {
      width: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background-color: #3f3f46;
      border-radius: 20px;
    }
  `]
})
export class HomeComponent {
  gameService = inject(GameService);
  private router = inject(Router);

  leagueGenerated = signal(false);

  generateLeague() {
    this.gameService.generateNewLeague();
    this.leagueGenerated.set(true);
  }

  selectTeam(teamId: string) {
    this.gameService.setUserTeam(teamId);
    this.router.navigate(['/standings']);
  }
}
