import { ChangeDetectionStrategy, Component, computed, inject, isDevMode, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { SettingsService } from '../../services/settings.service';
import { Position } from '../../models/enums';
import { PlayerCareerStats, PlayerSeasonAttributes, StatKey } from '../../models/types';
import { STAT_DEFINITIONS } from '../../models/stat-definitions';
import { computeAge, seasonAnchorDate } from '../../models/player-age';
import { getCurrentPlayerSeasonAttributes } from '../../models/season-history';
import { TeamBadgeComponent } from '../../components/team-badge/team-badge';

@Component({
  selector: 'app-player-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TeamBadgeComponent],
  templateUrl: './player-profile.html',
})
export class PlayerProfileComponent {
  private route = inject(ActivatedRoute);
  gameService = inject(GameService);
  private settingsService = inject(SettingsService);

  // Expose enums for template
  Position = Position;
  badgeStyle = this.settingsService.badgeStyle;
  isDev = isDevMode();

  private playerId = computed(() => this.route.snapshot.paramMap.get('id'));

  player = computed(() => {
    const id = this.playerId();
    if (!id) return undefined;
    return this.gameService.getPlayer(id);
  });

  currentSeasonAttributes = computed<PlayerSeasonAttributes | null>(() => {
    const p = this.player();
    const year = this.gameService.league()?.currentSeasonYear;
    if (!p || year === undefined) return null;
    return getCurrentPlayerSeasonAttributes(p, year);
  });

  playerAge = computed<number | null>(() => {
    const p = this.player();
    const year = this.gameService.league()?.currentSeasonYear;
    if (!p || year === undefined) return null;
    return computeAge(p.personal.birthday, seasonAnchorDate(year));
  });

  getStatDescription(key: StatKey): string {
    return STAT_DEFINITIONS[key].description;
  }

  team = computed(() => {
    const p = this.player();
    if (!p) return undefined;
    return this.gameService.getTeam(p.teamId);
  });

  // Toggle states for each skill section
  mentalView = signal<'list' | 'chart'>('list');
  physicalView = signal<'list' | 'chart'>('list');
  technicalView = signal<'list' | 'chart'>('list');
  goalkeeperView = signal<'list' | 'chart'>('list');

  // Season stats category toggle
  seasonStatsView = signal<'offensive' | 'defensive' | 'discipline'>('offensive');

  // Toggle methods
  toggleMentalView() {
    this.mentalView.update(v => v === 'list' ? 'chart' : 'list');
  }

  setSeasonStatsView(view: 'offensive' | 'defensive' | 'discipline') {
    this.seasonStatsView.set(view);
  }

  togglePhysicalView() {
    this.physicalView.update(v => v === 'list' ? 'chart' : 'list');
  }

  toggleTechnicalView() {
    this.technicalView.update(v => v === 'list' ? 'chart' : 'list');
  }

  toggleGoalkeeperView() {
    this.goalkeeperView.update(v => v === 'list' ? 'chart' : 'list');
  }

  // Chart data computation
  mentalChartData = computed(() => {
    const attrs = this.currentSeasonAttributes();
    if (!attrs) return [];

    return [
      { label: 'Flair', value: attrs.flair.value },
      { label: 'Vision', value: attrs.vision.value },
      { label: 'Determination', value: attrs.determination.value }
    ];
  });

  physicalChartData = computed(() => {
    const attrs = this.currentSeasonAttributes();
    if (!attrs) return [];

    return [
      { label: 'Speed', value: attrs.speed.value },
      { label: 'Strength', value: attrs.strength.value },
      { label: 'Endurance', value: attrs.endurance.value }
    ];
  });

  technicalChartData = computed(() => {
    const attrs = this.currentSeasonAttributes();
    if (!attrs) return [];

    return [
      { label: 'Tackling', value: attrs.tackling.value },
      { label: 'Shooting', value: attrs.shooting.value },
      { label: 'Heading', value: attrs.heading.value },
      { label: 'Long Passing', value: attrs.longPassing.value },
      { label: 'Short Passing', value: attrs.shortPassing.value }
    ];
  });

  goalkeepingChartData = computed(() => {
    const attrs = this.currentSeasonAttributes();
    if (!attrs) return [];

    return [
      { label: 'Handling', value: attrs.handling.value },
      { label: 'Reflexes', value: attrs.reflexes.value },
      { label: 'Cmd. of Area', value: attrs.commandOfArea.value }
    ];
  });

  currentSeasonStats = computed(() => {
    const player = this.player();
    if (!player) return null;
    return this.gameService.getCurrentSeasonStats(player);
  });

  // Season history
  seasonHistory = computed(() => {
    const player = this.player();
    if (!player) return [];
    return player.seasonAttributes || [];
  });

  selectedSeason = signal<number | null>(null);

  selectedSeasonAttributes = computed(() => {
    const seasonNum = this.selectedSeason();
    const player = this.player();
    if (!seasonNum || !player) return null;
    return player.seasonAttributes?.find(s => s.seasonYear === seasonNum) || null;
  });

  selectedSeasonStats = computed(() => {
    const seasonNum = this.selectedSeason();
    const player = this.player();
    if (!seasonNum || !player) return null;
    
    const careerStatsForSeason = player.careerStats?.find(stats => stats.seasonYear === seasonNum);
    return careerStatsForSeason || null;
  });

  hasSeasonHistory = computed(() => this.seasonHistory().length > 1);

  getPastSeasons = computed(() => {
    const seasons = this.seasonHistory();
    const league = this.gameService.league();
    const currentYear = league?.currentSeasonYear || 0;
    
    return seasons
      .filter(s => s.seasonYear < currentYear)
      .sort((a, b) => b.seasonYear - a.seasonYear);
  });

  allSeasonStats = computed(() =>
    [...(this.player()?.careerStats ?? [])].sort((a, b) => a.seasonYear - b.seasonYear)
  );

  private careerStatsBySeasonYear = computed(() => {
    const statsBySeason = new Map<number, PlayerCareerStats>();
    const careerStats = this.player()?.careerStats || [];
    for (const stats of careerStats) {
      statsBySeason.set(stats.seasonYear, stats);
    }
    return statsBySeason;
  });

  getCareerStatsForSeason(seasonYear: number): PlayerCareerStats | null {
    return this.careerStatsBySeasonYear().get(seasonYear) || null;
  }

  getTotalCareerStats = computed(() => {
    const player = this.player();
    if (!player) return null;

    const currentStats = this.currentSeasonStats();
    if (!currentStats) return null;

    const currentSeasonYear = this.gameService.league()?.currentSeasonYear;
    if (!currentSeasonYear) return null;

    const allStats = [
      currentStats,
      ...(player.careerStats?.filter(s => s.seasonYear < currentSeasonYear) || [])
    ].filter(Boolean);

    if (allStats.length === 0) return null;

    return {
      matchesPlayed: allStats.reduce((sum, s) => sum + (s?.matchesPlayed || 0), 0),
      minutesPlayed: allStats.reduce((sum, s) => sum + (s?.minutesPlayed || 0), 0),
      goals: allStats.reduce((sum, s) => sum + (s?.goals || 0), 0),
      assists: allStats.reduce((sum, s) => sum + (s?.assists || 0), 0),
      shots: allStats.reduce((sum, s) => sum + (s?.shots || 0), 0),
      shotsOnTarget: allStats.reduce((sum, s) => sum + (s?.shotsOnTarget || 0), 0),
      tackles: allStats.reduce((sum, s) => sum + (s?.tackles || 0), 0),
      interceptions: allStats.reduce((sum, s) => sum + (s?.interceptions || 0), 0),
      passes: allStats.reduce((sum, s) => sum + (s?.passes || 0), 0),
      saves: allStats.reduce((sum, s) => sum + (s?.saves || 0), 0),
      fouls: allStats.reduce((sum, s) => sum + (s?.fouls || 0), 0),
      foulsSuffered: allStats.reduce((sum, s) => sum + (s?.foulsSuffered || 0), 0),
      yellowCards: allStats.reduce((sum, s) => sum + (s?.yellowCards || 0), 0),
      redCards: allStats.reduce((sum, s) => sum + (s?.redCards || 0), 0),
      cleanSheets: allStats.reduce((sum, s) => sum + (s?.cleanSheets || 0), 0)
    };
  });

  // Chart calculation helpers
  createChartPoints(data: {label: string, value: number}[], size = 120): string {
    if (data.length === 0) return '';
    
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 10;
    const points: string[] = [];
    
    data.forEach((item, index) => {
      const angle = (index / data.length) * 2 * Math.PI - Math.PI / 2;
      const x = centerX + (radius * (item.value / 100)) * Math.cos(angle);
      const y = centerY + (radius * (item.value / 100)) * Math.sin(angle);
      points.push(`${x},${y}`);
    });
    
    return points.join(' ');
  }

  createAxisPoints(data: {label: string, value: number}[], size = 120): string {
    if (data.length === 0) return '';
    
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 10;
    const points: string[] = [];
    
    data.forEach((item, index) => {
      const angle = (index / data.length) * 2 * Math.PI - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      points.push(`${x},${y}`);
    });
    
    return points.join(' ');
  }

  getAxisLabelPosition(index: number, data: {label: string, value: number}[], size = 120): { x: number, y: number } {
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 + 15; // Position labels outside the chart
    const angle = (index / data.length) * 2 * Math.PI - Math.PI / 2;
    
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    };
  }
}
