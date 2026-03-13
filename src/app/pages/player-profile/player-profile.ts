import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { Position } from '../../models/enums';

@Component({
  selector: 'app-player-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './player-profile.html',
})
export class PlayerProfileComponent {
  private route = inject(ActivatedRoute);
  private gameService = inject(GameService);

  // Expose enums for template
  Position = Position;

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
