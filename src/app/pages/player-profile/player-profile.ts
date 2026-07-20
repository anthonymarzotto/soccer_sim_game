import { ChangeDetectionStrategy, Component, computed, inject, isDevMode, signal } from '@angular/core';
import { DecimalPipe, CurrencyPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';
import { GameService } from '../../services/game.service';
import { SettingsService } from '../../services/settings.service';
import { Position, getPositionGroup } from '../../models/enums';
import { PlayerCareerStats, PlayerSeasonAttributes, StatKey, SuspensionRecord } from '../../models/types';
import { STAT_DEFINITIONS } from '../../models/stat-definitions';
import { computeAge, seasonAnchorDate } from '../../models/player-age';
import { formatAverageMatchRating, formatGamesPlayed } from '../../models/player-career-stats';
import { getCurrentPlayerSeasonAttributes, getActiveInjury, getActiveSuspension } from '../../models/season-history';
import { InjuryRecord, getInjuryDefinition } from '../../data/injuries';
import { TeamBadgeComponent } from '../../components/team-badge/team-badge';
import { calculateMarketValue, calculatePlayerWageCost, POSITION_OVR_CONFIG } from '../../models/player-progression';

import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-player-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TeamBadgeComponent, DecimalPipe, CurrencyPipe, FormsModule, RouterLink],
  templateUrl: './player-profile.html',
})
export class PlayerProfileComponent {
  private route = inject(ActivatedRoute);
  gameService = inject(GameService);
  private settingsService = inject(SettingsService);

  private readonly FATIGUE_EXHAUSTED_THRESHOLD = 75;
  private readonly FATIGUE_TIRED_THRESHOLD = 40;
  private readonly FATIGUE_FRESH_COLOR = '#22c55e';
  private readonly FATIGUE_TIRED_COLOR = '#f59e0b';
  private readonly FATIGUE_EXHAUSTED_COLOR = '#dc2626';

  // Expose enums for template
  Position = Position;
  getPositionGroup = getPositionGroup;
  badgeStyle = this.settingsService.badgeStyle;
  isDev = isDevMode();

  isKeyStat(statKey: string): boolean {
    const p = this.player();
    return !!p && statKey in (POSITION_OVR_CONFIG[p.position]?.core || {});
  }

  playerId = toSignal(this.route.paramMap.pipe(map(params => params.get('id'))), { initialValue: null });
  transferWindowPhase = this.gameService.transferWindowPhase;
  isUserTeamPlayer = computed(() => {
    const p = this.player();
    const userTeamId = this.gameService.league()?.userTeamId;
    return !!p && !!userTeamId && p.teamId === userTeamId;
  });
  showOfferModal = signal(false);
  isSubmitting = signal(false);
  offerBidAmount = signal<number>(0);
  offerError = signal<string>('');
  offerSuccess = signal<string>('');

  userTeam = computed(() => {
    const uid = this.gameService.league()?.userTeamId;
    return uid ? this.gameService.getTeam(uid) : null;
  });
  userBudget = computed(() => this.userTeam()?.finances.transferBudget ?? 0);
  userWageHeadroom = computed(() => {
    const t = this.userTeam();
    return t ? t.finances.wagePointsCap - t.finances.wagePointsUsed : 0;
  });
  targetPlayerWage = computed(() => {
    const p = this.player();
    return p ? calculatePlayerWageCost(p, this.gameService.league()?.currentSeasonYear ?? new Date().getFullYear()) : 0;
  });

  isPlayerTransferListed = computed(() => {
    const id = this.playerId();
    const listings = this.gameService.league()?.transferListings;
    return !!id && !!listings && listings.includes(id);
  });

  addToTransferList() {
    const id = this.playerId();
    if (id) {
      this.gameService.addPlayerToTransferList(id);
    }
  }

  removeFromTransferList() {
    const id = this.playerId();
    if (id) {
      this.gameService.removePlayerFromTransferList(id);
    }
  }

  makeTransferOffer() {
    if (this.transferWindowPhase() === 'closed') return;
    const p = this.player();
    if (p) {
      const val = calculateMarketValue(p, this.gameService.league()?.currentSeasonYear ?? new Date().getFullYear());
      this.offerBidAmount.set(Math.round(val * 1.15));
    }
    this.isSubmitting.set(false);
    this.offerError.set('');
    this.offerSuccess.set('');
    this.showOfferModal.set(true);
  }

  closeOfferModal() {
    this.showOfferModal.set(false);
    this.isSubmitting.set(false);
    this.offerError.set('');
    this.offerSuccess.set('');
  }

  formatCurrency(value: number): string {
    if (!value) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  onBidInput(event: Event) {
    const target = event.target as HTMLInputElement;
    const originalValue = target.value;
    const cursorPosition = target.selectionStart ?? 0;

    const digitsBeforeCursor = originalValue.slice(0, cursorPosition).replace(/[^0-9]/g, '').length;

    const clean = originalValue.replace(/[^0-9]/g, '');
    const numValue = clean ? parseInt(clean, 10) : 0;

    this.offerBidAmount.set(numValue);

    const formatted = this.formatCurrency(numValue);
    target.value = formatted;

    let newCursor = 0;
    let digitCount = 0;
    for (let i = 0; i < formatted.length; i++) {
      if (/[0-9]/.test(formatted[i])) {
        digitCount++;
      }
      if (digitCount === digitsBeforeCursor) {
        newCursor = i + 1;
        break;
      }
    }

    if (formatted === '') {
      newCursor = 0;
    } else if (digitCount < digitsBeforeCursor || cursorPosition === originalValue.length) {
      newCursor = formatted.length;
    }

    target.setSelectionRange(newCursor, newCursor);
  }

  submitOffer() {
    const player = this.player();
    if (!player) return;
    const bid = this.offerBidAmount();
    if (bid <= 0) {
      this.offerError.set('Please enter a valid offer amount.');
      return;
    }
    this.isSubmitting.set(true);
    this.offerError.set('');
    this.offerSuccess.set('');

    setTimeout(() => {
      const res = this.gameService.submitTransferOffer(player.id, bid);
      this.isSubmitting.set(false);
      if (res.success) {
        this.offerSuccess.set(res.message);
        this.offerError.set('');
        setTimeout(() => {
          this.closeOfferModal();
        }, 1000);
      } else {
        this.offerError.set(res.message);
        this.offerSuccess.set('');
      }
    }, 1500);
  }

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

  previousSeasonAttributes = computed<PlayerSeasonAttributes | null>(() => {
    const p = this.player();
    const year = this.gameService.league()?.currentSeasonYear;
    if (!p || year === undefined) return null;
    return p.seasonAttributes?.find(s => s.seasonYear === year - 1) || null;
  });

  playerAge = computed<number | null>(() => {
    const p = this.player();
    const year = this.gameService.league()?.currentSeasonYear;
    if (!p || year === undefined) return null;
    return computeAge(p.personal.birthday, seasonAnchorDate(year));
  });

  activeInjury = computed<InjuryRecord | null>(() => {
    const p = this.player();
    return p ? getActiveInjury(p) : null;
  });

  marketValue = computed<number | null>(() => {
    const p = this.player();
    const year = this.gameService.league()?.currentSeasonYear;
    if (!p || year === undefined) return null;
    return calculateMarketValue(p, year);
  });

  wageCost = computed<number | null>(() => {
    const p = this.player();
    const year = this.gameService.league()?.currentSeasonYear;
    if (!p || year === undefined) return null;
    return calculatePlayerWageCost(p, year);
  });

  contractYearsRemaining = computed<number | null>(() => {
    const p = this.player();
    const year = this.gameService.league()?.currentSeasonYear;
    if (!p || !p.contract || year === undefined) return null;
    const remaining = p.contract.expiresAfterSeason - year + 1;
    return remaining > 0 ? remaining : 0;
  });

  /**
   * Returns the player's injury records in chronological order
   * (oldest first). Includes both healed and active records.
   */
  injuryHistory = computed<InjuryRecord[]>(() => {
    const records = this.player()?.injuries ?? [];
    return [...records].sort((a, b) => {
      const seasonDiff = a.sustainedInSeason - b.sustainedInSeason;
      return seasonDiff !== 0 ? seasonDiff : a.sustainedInWeek - b.sustainedInWeek;
    });
  });

  activeSuspension = computed<SuspensionRecord | null>(() => {
    const p = this.player();
    return p ? getActiveSuspension(p) : null;
  });

  suspensionHistory = computed<SuspensionRecord[]>(() => {
    const records = this.player()?.suspensions ?? [];
    return [...records].sort((a, b) => {
      const seasonDiff = a.sustainedInSeason - b.sustainedInSeason;
      return seasonDiff !== 0 ? seasonDiff : a.sustainedInWeek - b.sustainedInWeek;
    });
  });

  transferHistory = computed(() => {
    return this.player()?.transferHistory ?? [];
  });

  getInjuryName(definitionId: string): string {
    return getInjuryDefinition(definitionId)?.name ?? definitionId;
  }

  getInjurySeverity(definitionId: string): string {
    return getInjuryDefinition(definitionId)?.severity ?? '—';
  }

  getSuspensionName(reason: string): string {
    switch (reason) {
      case 'SECOND_YELLOW': return 'Second Yellow Card';
      case 'DOGSO': return 'Denying Goal Opportunity';
      case 'SERIOUS_FOUL': return 'Serious Foul Play';
      case 'SPITTING': return 'Spitting at Opponent';
      case '5_YELLOWS': return '5 Yellow Cards Accumulation';
      case '10_YELLOWS': return '10 Yellow Cards Accumulation';
      case '15_YELLOWS': return '15 Yellow Cards Accumulation';
      case '20_YELLOWS': return '20 Yellow Cards Accumulation';
      default: return 'Suspension';
    }
  }

  formatSuspensionGames(games: number): string {
    if (games <= 0) return 'Back next game';
    if (games === 1) return '1 game';
    return `${games} games`;
  }

  getStatDescription(key: StatKey): string {
    return STAT_DEFINITIONS[key].description;
  }

  getStatDiff(key: StatKey): number | null {
    const current = this.currentSeasonAttributes();
    const prev = this.previousSeasonAttributes();
    if (!current || !prev) return null;

    const currentVal = current[key]?.value;
    const prevVal = prev[key]?.value;

    if (typeof currentVal === 'number' && typeof prevVal === 'number') {
      const diff = currentVal - prevVal;
      return diff !== 0 ? diff : null;
    }
    return null;
  }

  // Toggle states for each skill section
  mentalView = signal<'list' | 'chart'>('list');
  physicalView = signal<'list' | 'chart'>('list');
  technicalView = signal<'list' | 'chart'>('list');
  goalkeeperView = signal<'list' | 'chart'>('list');

  // Season stats category toggle
  seasonStatsView = signal<'general' | 'discipline' | 'setpieces' | 'goalkeeping' | 'ratings-finances'>('general');

  // Toggle methods
  toggleMentalView() {
    this.mentalView.update(v => v === 'list' ? 'chart' : 'list');
  }

  setSeasonStatsView(view: 'general' | 'discipline' | 'setpieces' | 'goalkeeping' | 'ratings-finances') {
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
      { label: 'Determination', value: attrs.determination.value },
      { label: 'Composure', value: attrs.composure.value }
    ];
  });

  physicalChartData = computed(() => {
    const attrs = this.currentSeasonAttributes();
    if (!attrs) return [];

    return [
      { label: 'Speed', value: attrs.speed.value },
      { label: 'Strength', value: attrs.strength.value },
      { label: 'Endurance', value: attrs.endurance.value },
      { label: 'Fitness', value: attrs.fitness.value }
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
      { label: 'Reflexes', value: attrs.reflexes.value }
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

  currentSeasonRatingChip = computed(() => {
    const stats = this.currentSeasonStats();
    if (!stats) return { avgRating: '--', first: 0, second: 0, third: 0 };
    const avgRating = formatAverageMatchRating(stats);
    return { avgRating, first: stats.starNominations.first, second: stats.starNominations.second, third: stats.starNominations.third };
  });

  formatAverageRating(stats: PlayerCareerStats): string {
    return formatAverageMatchRating(stats);
  }

  formatGamesPlayed(stats: { matchesPlayed: number; gamesStarted?: number; gamesSubbed?: number } | undefined | null): string {
    return formatGamesPlayed(stats);
  }

  totalStarNominations = computed(() => {
    const stats = this.allSeasonStats();
    return {
      first: stats.reduce((s, r) => s + r.starNominations.first, 0),
      second: stats.reduce((s, r) => s + r.starNominations.second, 0),
      third: stats.reduce((s, r) => s + r.starNominations.third, 0),
    };
  });

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

  getMarketValueForSeason(stats: PlayerCareerStats): number {
    if (stats.marketValue !== undefined) {
      return stats.marketValue;
    }
    const p = this.player();
    if (!p) return 0;
    const hasAttrs = p.seasonAttributes?.some(a => a.seasonYear === stats.seasonYear);
    if (!hasAttrs) return 0;
    return calculateMarketValue(p, stats.seasonYear);
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
      gamesStarted: allStats.reduce((sum, s) => sum + (s?.gamesStarted ?? s?.matchesPlayed ?? 0), 0),
      gamesSubbed: allStats.reduce((sum, s) => sum + (s?.gamesSubbed ?? 0), 0),
      minutesPlayed: allStats.reduce((sum, s) => sum + (s?.minutesPlayed || 0), 0),
      goals: allStats.reduce((sum, s) => sum + (s?.goals || 0), 0),
      assists: allStats.reduce((sum, s) => sum + (s?.assists || 0), 0),
      offsides: allStats.reduce((sum, s) => sum + (s?.offsides || 0), 0),
      shots: allStats.reduce((sum, s) => sum + (s?.shots || 0), 0),
      shotsOnTarget: allStats.reduce((sum, s) => sum + (s?.shotsOnTarget || 0), 0),
      tackles: allStats.reduce((sum, s) => sum + (s?.tackles || 0), 0),
      interceptions: allStats.reduce((sum, s) => sum + (s?.interceptions || 0), 0),
      passes: allStats.reduce((sum, s) => sum + (s?.passes || 0), 0),
      passesSuccessful: allStats.reduce((sum, s) => sum + (s?.passesSuccessful || 0), 0),
      goalsConceded: allStats.reduce((sum, s) => sum + (s?.goalsConceded || 0), 0),
      clutchActions: allStats.reduce((sum, s) => sum + (s?.clutchActions || 0), 0),
      saves: allStats.reduce((sum, s) => sum + (s?.saves || 0), 0),
      fouls: allStats.reduce((sum, s) => sum + (s?.fouls || 0), 0),
      foulsSuffered: allStats.reduce((sum, s) => sum + (s?.foulsSuffered || 0), 0),
      yellowCards: allStats.reduce((sum, s) => sum + (s?.yellowCards || 0), 0),
      redCards: allStats.reduce((sum, s) => sum + (s?.redCards || 0), 0),
      cleanSheets: allStats.reduce((sum, s) => sum + (s?.cleanSheets || 0), 0),
      cornersTaken: allStats.reduce((sum, s) => sum + (s?.cornersTaken || 0), 0),
      cornersWon: allStats.reduce((sum, s) => sum + (s?.cornersWon || 0), 0),
      freeKicksTaken: allStats.reduce((sum, s) => sum + (s?.freeKicksTaken || 0), 0),
      freeKickGoals: allStats.reduce((sum, s) => sum + (s?.freeKickGoals || 0), 0),
      penaltiesTaken: allStats.reduce((sum, s) => sum + (s?.penaltiesTaken || 0), 0),
      penaltiesScored: allStats.reduce((sum, s) => sum + (s?.penaltiesScored || 0), 0),
      penaltiesFaced: allStats.reduce((sum, s) => sum + (s?.penaltiesFaced || 0), 0),
      penaltiesSaved: allStats.reduce((sum, s) => sum + (s?.penaltiesSaved || 0), 0),
      aerialDuelsWon: allStats.reduce((sum, s) => sum + (s?.aerialDuelsWon || 0), 0),
      aerialDuelsLost: allStats.reduce((sum, s) => sum + (s?.aerialDuelsLost || 0), 0),
      cornerGoals: allStats.reduce((sum, s) => sum + (s?.cornerGoals || 0), 0),
      indirectFreeKickGoals: allStats.reduce((sum, s) => sum + (s?.indirectFreeKickGoals || 0), 0)
    };
  });

  // Chart calculation helpers
  createChartPoints(data: { label: string, value: number }[], size = 120): string {
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

  createAxisPoints(data: { label: string, value: number }[], size = 120): string {
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

  getAxisLabelPosition(index: number, data: { label: string, value: number }[], size = 120): { x: number, y: number } {
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 + 15; // Position labels outside the chart
    const angle = (index / data.length) * 2 * Math.PI - Math.PI / 2;

    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    };
  }

  getAttributesHistory = computed(() => {
    const player = this.player();
    if (!player || !player.seasonAttributes) return [];
    return [...player.seasonAttributes].sort((a, b) => a.seasonYear - b.seasonYear);
  });

  getFatigueColor(fatigue: number): string {
    if (fatigue >= this.FATIGUE_EXHAUSTED_THRESHOLD) {
      return this.FATIGUE_EXHAUSTED_COLOR;
    }
    if (fatigue >= this.FATIGUE_TIRED_THRESHOLD) {
      return this.FATIGUE_TIRED_COLOR;
    }
    return this.FATIGUE_FRESH_COLOR;
  }
}
