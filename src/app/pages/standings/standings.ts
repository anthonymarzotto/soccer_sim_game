import { ChangeDetectionStrategy, Component, inject, isDevMode } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { MatchResult } from '../../models/enums';
import { Team } from '../../models/types';
import { getTeamSeasonSnapshotForYear, createEmptyTeamStats } from '../../models/season-history';

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

    const snapshot = getTeamSeasonSnapshotForYear(team, league.currentSeasonYear);
    if (snapshot) {
      return snapshot.stats;
    }

    const message = `Missing current-season team snapshot for ${team.name} (${team.id}) in season ${league.currentSeasonYear}`;
    if (isDevMode()) {
      throw new Error(message);
    }

    console.warn(message);
    return createEmptyTeamStats();
  }
}
