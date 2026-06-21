import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';
import { GameService } from '../../services/game.service';
import { scaleMatchRating } from '../../models/player-career-stats';

@Component({
  selector: 'app-player-game-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DecimalPipe],
  templateUrl: './player-game-log.html',
})
export class PlayerGameLogComponent {
  private route = inject(ActivatedRoute);
  gameService = inject(GameService);
  scaleMatchRating = scaleMatchRating;

  playerId = toSignal(this.route.paramMap.pipe(map(params => params.get('id'))), { initialValue: null });

  player = computed(() => {
    const id = this.playerId();
    if (!id) return undefined;
    return this.gameService.getPlayer(id);
  });

  gameLog = computed(() => {
    const p = this.player();
    if (!p) return [];

    const l = this.gameService.league();
    if (!l) return [];

    const teamId = p.teamId;

    // Filter matches for the current season, played, and involving the player's team
    const teamMatches = l.schedule.filter(m =>
      m.played &&
      (m.seasonYear ?? l.currentSeasonYear) === l.currentSeasonYear &&
      (m.homeTeamId === teamId || m.awayTeamId === teamId)
    );

    // Sort newest games on top
    teamMatches.sort((a, b) => b.week - a.week);

    return teamMatches.map(match => {
      const isHome = match.homeTeamId === teamId;
      const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
      const opponent = this.gameService.getTeam(opponentId);

      const teamScore = isHome ? match.homeScore : match.awayScore;
      const oppScore = isHome ? match.awayScore : match.homeScore;
      let result = 'D';
      if (teamScore !== undefined && oppScore !== undefined) {
        if (teamScore > oppScore) result = 'W';
        if (teamScore < oppScore) result = 'L';
      }

      // Find player stats in match report
      let playerStats = null;
      if (match.matchReport) {
        const statsArray = isHome ? match.matchReport.homePlayerStats : match.matchReport.awayPlayerStats;
        playerStats = statsArray.find(s => s.playerId === p.id);
      }

      return {
        match,
        opponentName: opponent?.name || 'Unknown',
        isHome,
        result,
        teamScore,
        oppScore,
        playerStats
      };
    });
  });
}
