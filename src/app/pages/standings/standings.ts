import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { MatchResult } from '../../models/enums';

@Component({
  selector: 'app-standings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './standings.html',
})
export class StandingsComponent {
  gameService = inject(GameService);
  
  // Expose enums for template
  MatchResult = MatchResult;
}
