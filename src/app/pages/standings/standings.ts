import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { MatchResult } from '../../models/enums';
import { Team } from '../../models/types';
import { createEmptyTeamStats } from '../../models/season-history';

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

  getTeamStats(team: Team) {
    const league = this.gameService.league();
    if (!league) {
      return createEmptyTeamStats();
    }

    return this.gameService.getTeamSnapshotForSeason(team, league.currentSeasonYear).stats;
  }
}
