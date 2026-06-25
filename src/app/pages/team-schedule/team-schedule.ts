import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { MatchSummaryComponent } from '../../components/match-summary/match-summary';
import { Match } from '../../models/types';

@Component({
  selector: 'app-team-schedule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatchSummaryComponent, DecimalPipe],
  templateUrl: './team-schedule.html',
})
export class TeamScheduleComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  gameService = inject(GameService);

  // Get all teams sorted alphabetically for the dropdown selector
  allTeamsSorted = computed(() =>
    [...(this.gameService.league()?.teams ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  );

  // Track currently loaded team from the route parameter
  teamId = toSignal(this.route.paramMap.pipe(map(params => params.get('id'))), { initialValue: null });

  team = computed(() => {
    const id = this.teamId();
    if (!id) return undefined;
    return this.gameService.getTeam(id);
  });

  // Calculate unique seasons available for this team based on historical snapshots and current active season
  seasons = computed(() => {
    const t = this.team();
    const l = this.gameService.league();
    if (!t || !l) return [];
    
    const years = new Set<number>();
    if (t.seasonSnapshots) {
      t.seasonSnapshots.forEach(s => years.add(s.seasonYear));
    }
    years.add(l.currentSeasonYear);
    return Array.from(years).sort((a, b) => a - b);
  });

  // Fallback to active league season if no manual override has been selected
  private activeSeason = computed(() => {
    return this.gameService.league()?.currentSeasonYear ?? new Date().getFullYear();
  });

  selectedSeasonState = signal<number | null>(null);
  
  selectedSeason = computed(() => {
    return this.selectedSeasonState() ?? this.activeSeason();
  });

  isCurrentSeason = computed(() => {
    return this.selectedSeason() === this.activeSeason();
  });

  isSeasonComplete = computed(() => {
    const l = this.gameService.league();
    if (!l) return false;
    if (this.selectedSeason() !== l.currentSeasonYear) {
      return true; // Past seasons are completed by definition
    }
    return this.gameService.isSeasonComplete();
  });

  // Find all matches for this team in the selected season
  allSeasonMatches = computed(() => {
    const l = this.gameService.league();
    const tId = this.teamId();
    const yr = this.selectedSeason();
    if (!l || !tId) return [];

    return l.schedule.filter(m => 
      (m.homeTeamId === tId || m.awayTeamId === tId) && 
      (m.seasonYear ?? l.currentSeasonYear) === yr
    ).sort((a, b) => a.week - b.week);
  });

  // Split matches into pending vs completed for active/uncompleted seasons
  pendingMatches = computed(() => {
    if (this.isSeasonComplete()) {
      return [];
    }
    return this.allSeasonMatches().filter(m => !m.played);
  });

  completedMatches = computed(() => {
    if (this.isSeasonComplete()) {
      return this.allSeasonMatches();
    }
    return this.allSeasonMatches().filter(m => m.played);
  });

  // Fetch season-specific performance statistics
  seasonStats = computed(() => {
    const t = this.team();
    const yr = this.selectedSeason();
    if (!t || !yr) return null;
    try {
      const snapshot = this.gameService.getTeamSnapshotForSeason(t, yr);
      return snapshot ? snapshot.stats : null;
    } catch {
      return null;
    }
  });

  seasonOvr = computed(() => {
    const t = this.team();
    const yr = this.selectedSeason();
    if (!t || !yr) return null;
    return this.gameService.getTeamAverageOverallForSeason(t, yr);
  });

  seasonStanding = computed(() => {
    const t = this.team();
    const yr = this.selectedSeason();
    if (!t || !yr) return null;
    return this.gameService.getLeagueStandingsRankForSeason(t.id, yr);
  });

  // Event handlers
  onTeamChange(newTeamId: string) {
    // Clear the selected season state so it re-defaults correctly for the new team if needed
    this.selectedSeasonState.set(null);
    this.router.navigate(['/team', newTeamId, 'schedule']);
  }

  setSeason(year: number) {
    this.selectedSeasonState.set(year);
  }

  onSeasonChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.setSeason(parseInt(value, 10));
  }

  // Returns outcome badge styling for a given match relative to our selected team
  getMatchOutcome(match: Match): { result: 'W' | 'D' | 'L' | 'Upcoming'; label: string; bgClass: string; textClass: string; borderClass: string } {
    if (!match.played) {
      const currentWeek = this.gameService.league()?.currentWeek ?? 1;
      const isCurrentWeek = match.week === currentWeek && (match.seasonYear ?? this.activeSeason()) === this.activeSeason();
      return {
        result: 'Upcoming',
        label: isCurrentWeek ? 'Current Week' : 'Upcoming',
        bgClass: isCurrentWeek ? 'bg-accent/10' : 'bg-canvas',
        textClass: isCurrentWeek ? 'text-accent' : 'text-text-muted',
        borderClass: isCurrentWeek ? 'border-accent/30' : 'border-border/30'
      };
    }

    const tId = this.teamId();
    if (!tId) {
      return {
        result: 'Upcoming',
        label: 'Played',
        bgClass: 'bg-canvas',
        textClass: 'text-text-muted',
        borderClass: 'border-border/30'
      };
    }

    const isHome = match.homeTeamId === tId;
    const teamScore = isHome ? match.homeScore! : match.awayScore!;
    const oppScore = isHome ? match.awayScore! : match.homeScore!;

    if (teamScore > oppScore) {
      return {
        result: 'W',
        label: 'Win',
        bgClass: 'bg-accent/10',
        textClass: 'text-accent',
        borderClass: 'border-accent/20'
      };
    } else if (teamScore < oppScore) {
      return {
        result: 'L',
        label: 'Loss',
        bgClass: 'bg-danger/10',
        textClass: 'text-danger',
        borderClass: 'border-danger/20'
      };
    } else {
      return {
        result: 'D',
        label: 'Draw',
        bgClass: 'bg-warning/10',
        textClass: 'text-warning',
        borderClass: 'border-warning/20'
      };
    }
  }
}
