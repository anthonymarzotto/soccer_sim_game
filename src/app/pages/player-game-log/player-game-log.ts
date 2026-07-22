import { ChangeDetectionStrategy, Component, computed, inject, isDevMode, effect } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';
import { GameService } from '../../services/game.service';
import { scaleMatchRating } from '../../models/player-career-stats';
import { Match, PlayerStatistics } from '../../models/types';

interface GameLogEntry {
  match: Match;
  opponentName: string;
  isHome: boolean;
  result: string;
  teamScore?: number;
  oppScore?: number;
  playerStats?: PlayerStatistics | null;
}

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
  isDev = isDevMode();

  playerId = toSignal(this.route.paramMap.pipe(map(params => params.get('id'))), { initialValue: null });
  highlightMatchId = toSignal(
    this.route.queryParamMap.pipe(map(params => params.get('highlightMatchId') || params.get('matchId'))),
    { initialValue: null }
  );

  player = computed(() => {
    const id = this.playerId();
    if (!id) return undefined;
    return this.gameService.getPlayer(id);
  });

  selectedSeason = computed(() => {
    const qpSeason = this.route.snapshot.queryParamMap.get('season');
    if (qpSeason && !isNaN(Number(qpSeason))) {
      return Number(qpSeason);
    }
    const targetMatchId = this.highlightMatchId();
    const l = this.gameService.league();
    if (targetMatchId && l) {
      const targetMatch = l.schedule.find(m => m.id === targetMatchId);
      if (targetMatch && targetMatch.seasonYear) {
        return targetMatch.seasonYear;
      }
    }
    return l?.currentSeasonYear ?? new Date().getFullYear();
  });

  gameLog = computed(() => {
    const p = this.player();
    if (!p) return [];

    const l = this.gameService.league();
    if (!l) return [];

    const teamId = p.teamId;
    const season = this.selectedSeason();

    // Filter matches for the season, played, and involving the player's team
    const teamMatches = l.schedule.filter(m =>
      m.played &&
      (m.seasonYear ?? l.currentSeasonYear) === season &&
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

  constructor() {
    effect(() => {
      const targetId = this.highlightMatchId();
      if (targetId) {
        setTimeout(() => {
          const el = document.getElementById('match-' + targetId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
    });
  }

  exportMatchJson(log: GameLogEntry) {
    const p = this.player();
    if (!p) return;

    const team = this.gameService.getTeam(p.teamId);
    const opponentId = log.isHome ? log.match.awayTeamId : log.match.homeTeamId;
    const opponent = this.gameService.getTeam(opponentId);

    const exportData = {
      exportedAt: new Date().toISOString(),
      player: {
        id: p.id,
        name: p.name,
        position: p.position,
        role: p.role,
        seasonAttributes: p.seasonAttributes,
        mood: p.mood,
        fatigue: p.fatigue,
        injuries: p.injuries,
        suspensions: p.suspensions,
        contract: p.contract,
      },
      team: team ? {
        id: team.id,
        name: team.name,
        selectedFormationId: team.selectedFormationId,
        formationAssignments: team.formationAssignments,
        roster: team.players.map(pl => ({
          id: pl.id,
          name: pl.name,
          position: pl.position,
          role: pl.role,
          seasonAttributes: pl.seasonAttributes,
        })),
      } : null,
      opponent: opponent ? {
        id: opponent.id,
        name: opponent.name,
        selectedFormationId: opponent.selectedFormationId,
        formationAssignments: opponent.formationAssignments,
        roster: opponent.players.map(pl => ({
          id: pl.id,
          name: pl.name,
          position: pl.position,
          role: pl.role,
          seasonAttributes: pl.seasonAttributes,
        })),
      } : null,
      match: log.match,
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `match_log_${log.match.id}_${p.name.replace(/\s+/g, '_')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }
}
