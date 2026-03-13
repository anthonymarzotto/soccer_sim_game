import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { GameService } from '../../services/game.service';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './home.html',
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
