import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { GameService } from '../../services/game.service';

@Component({
  selector: 'app-navigation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navigation.html',
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class NavigationComponent {
  private gameService = inject(GameService);

  hasLeague = this.gameService.hasLeague;

  userTeamId = computed(() => {
    const league = this.gameService.league();
    return league?.userTeamId;
  });
}