import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe, CurrencyPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { FieldService } from '../../services/field.service';
import { FormationLibraryService } from '../../services/formation-library.service';
import { Player, PlayerCareerStats, Role, SuspensionRecord } from '../../models/types';
import { FormationSlot } from '../../models/simulation.types';
import { calculateFatigueModifier, scaleOverallWithFatigue } from '../../models/simulation.types';
import { MatchResult, Position as PositionEnum, TeamDetailsViewMode } from '../../models/enums';
import { computeAge, seasonAnchorDate } from '../../models/player-age';
import { formatAverageMatchRating, formatGamesPlayed } from '../../models/player-career-stats';
import { getActiveInjury, isPlayerInjured, getActiveSuspension, isPlayerSuspended, isPlayerEligible } from '../../models/season-history';
import { InjuryRecord, getInjuryDefinition } from '../../data/injuries';
import { calculateMarketValue, calculatePlayerWageCost, calculateSquadTotalMarketValue } from '../../models/player-progression';

type TeamDetailsRowStats = Pick<PlayerCareerStats, 'matchesPlayed' | 'gamesStarted' | 'gamesSubbed' | 'minutesPlayed' | 'goals' | 'assists' | 'yellowCards' | 'redCards' | 'totalMatchRating' | 'starNominations'>;

interface StarterRow {
  slot: FormationSlot;
  player: Player | null;
}

interface BenchRow {
  slotNumber: number;
  player: Player | null;
}

@Component({
  selector: 'app-team-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DecimalPipe, CurrencyPipe],
  templateUrl: './team-details.html',
})
export class TeamDetailsComponent {
  private static readonly BENCH_SLOT_COUNT = 9;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  gameService = inject(GameService);
  private fieldService = inject(FieldService);
  private formationLibrary = inject(FormationLibraryService);

  private readonly FATIGUE_EXHAUSTED_THRESHOLD = 75;
  private readonly FATIGUE_TIRED_THRESHOLD = 40;
  private readonly FATIGUE_FRESH_COLOR = '#22c55e';
  private readonly FATIGUE_TIRED_COLOR = '#f59e0b';
  private readonly FATIGUE_EXHAUSTED_COLOR = '#dc2626';

  // Expose enums for template
  Position = PositionEnum;
  MatchResult = MatchResult;
  ViewMode = TeamDetailsViewMode;

  // View mode state
  viewMode = signal<TeamDetailsViewMode>(TeamDetailsViewMode.BIO);

  // Drag and drop state
  draggedPlayerId = signal<string | null>(null);
  dragOverTargetId = signal<string | null>(null);

  teamId = toSignal(this.route.paramMap.pipe(map(params => params.get('id'))), { initialValue: null });

  isUserTeam = computed(() => {
    const l = this.gameService.league();
    return l?.userTeamId === this.teamId();
  });

  allTeamsSorted = computed(() =>
    [...(this.gameService.league()?.teams ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  );

  userTeamId = computed(() => this.gameService.league()?.userTeamId);
  isSchemaMismatchBlocking = this.gameService.isMutatingWritesBlockedBySchemaMismatch;
  transferWindowPhase = this.gameService.transferWindowPhase;
  weeksRemainingInWindow = this.gameService.weeksRemainingInWindow;

  team = computed(() => {
    const id = this.teamId();
    if (!id) return undefined;
    return this.gameService.getTeam(id);
  });



  teamOverall = computed(() => {
    const t = this.team();
    if (!t) return 0;
    return this.gameService.calculateTeamOverall(t);
  });

  squadMarketValue = computed(() => {
    const t = this.team();
    if (!t) return 0;
    const year = this.gameService.league()?.currentSeasonYear;
    if (year === undefined) return 0;
    return calculateSquadTotalMarketValue(this.gameService.getPlayersForTeam(t.id), year);
  });

  wageUtilization = computed(() => {
    const t = this.team();
    if (!t || !t.finances || t.finances.wagePointsCap === 0) return 0;
    return (t.finances.wagePointsUsed / t.finances.wagePointsCap) * 100;
  });

  formationSlots = computed(() => {
    const t = this.team();
    if (!t) return [];
    return this.fieldService.getFormationSlots(t);
  });

  matchReadiness = computed(() => {
    const t = this.team();
    if (!t) {
      return { isReady: true, issues: [] };
    }
    return this.gameService.getMatchReadiness(t.id);
  });

  readinessIssues = computed(() => this.matchReadiness().issues);
  showQuickFix = computed(() => this.isUserTeam() && this.readinessIssues().length > 0);

  starterRows = computed<StarterRow[]>(() => {
    const t = this.team();
    if (!t) return [];
    const players = this.gameService.getPlayersForTeam(t.id);

    return this.formationSlots().map(slot => ({
      slot,
      player: players.find(player => player.id === t.formationAssignments[slot.slotId]) ?? null
    }));
  });

  starters = computed(() => this.starterRows().map(row => row.player).filter((player): player is Player => player !== null));

  unavailable = computed(() => {
    const t = this.team();
    if (!t) return [];
    return this.gameService.getPlayersForTeam(t.id).filter(p => !isPlayerEligible(p))
      .sort((a, b) => this.positionWeight(a.position) - this.positionWeight(b.position));
  });

  bench = computed(() => {
    const t = this.team();
    if (!t) return [];
    return this.gameService.getPlayersForTeam(t.id).filter(p => p.role === Role.BENCH && isPlayerEligible(p))
      .sort((a, b) => this.positionWeight(a.position) - this.positionWeight(b.position));
  });

  benchRows = computed<BenchRow[]>(() => {
    const players = this.bench();
    return Array.from({ length: TeamDetailsComponent.BENCH_SLOT_COUNT }, (_, index) => ({
      slotNumber: index + 1,
      player: players[index] ?? null
    }));
  });

  reserves = computed(() => {
    const t = this.team();
    if (!t) return [];
    return this.gameService.getPlayersForTeam(t.id).filter(p => p.role === Role.RESERVE && isPlayerEligible(p))
      .sort((a, b) => this.positionWeight(a.position) - this.positionWeight(b.position));
  });

  getCurrentSeasonStats(player: Player): TeamDetailsRowStats {
    return this.gameService.getCurrentSeasonStats(player) || {
      matchesPlayed: 0,
      gamesStarted: 0,
      gamesSubbed: 0,
      minutesPlayed: 0,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      totalMatchRating: 0,
      starNominations: { first: 0, second: 0, third: 0 }
    };
  }

  getPlayerOverall(player: Player): number {
    const attributes = this.gameService.getCurrentSeasonPlayerAttributes(player);
    if (!attributes) {
      throw new Error('Player attributes unavailable for current season');
    }
    return attributes.overall.value;
  }

  getPlayerMarketValue(player: Player): number {
    const year = this.gameService.league()?.currentSeasonYear;
    if (year === undefined) return 0;
    return calculateMarketValue(player, year);
  }

  getPlayerWageCost(player: Player): number {
    const year = this.gameService.league()?.currentSeasonYear;
    if (year === undefined) return 0;
    return calculatePlayerWageCost(player, year);
  }

  getPlayerContractYearsRemaining(player: Player): number {
    const year = this.gameService.league()?.currentSeasonYear;
    if (year === undefined || !player.contract) return 0;
    const remaining = player.contract.expiresAfterSeason - year + 1;
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Returns the fatigue-adjusted effective overall for display.
   * Returns null when fatigue is negligible (< 1 point difference).
   */
  getPlayerEffectiveOverall(player: Player): number | null {
    const base = this.getPlayerOverall(player);
    const fatigue = player.fatigue ?? 0;
    if (fatigue === 0) return null;
    const effective = scaleOverallWithFatigue(base, calculateFatigueModifier(fatigue));
    return effective < base ? effective : null;
  }

  getPlayerAge(player: Player | null | undefined): number | null {
    if (!player) return null;
    const year = this.gameService.league()?.currentSeasonYear;
    if (year === undefined) return null;
    return computeAge(player.personal.birthday, seasonAnchorDate(year));
  }

  formatAvgRating(stats: TeamDetailsRowStats): string {
    return formatAverageMatchRating(stats);
  }

  formatGamesPlayed(stats: TeamDetailsRowStats): string {
    return formatGamesPlayed(stats);
  }

  getRowStats(player: Player | null): TeamDetailsRowStats {
    if (!player) return {
      matchesPlayed: 0,
      gamesStarted: 0,
      gamesSubbed: 0,
      minutesPlayed: 0,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      totalMatchRating: 0,
      starNominations: { first: 0, second: 0, third: 0 }
    };
    return this.getCurrentSeasonStats(player);
  }

  private positionWeight(pos: string): number {
    switch (pos) {
      case this.Position.GOALKEEPER: return 1;
      case this.Position.DEFENDER: return 2;
      case this.Position.MIDFIELDER: return 3;
      case this.Position.FORWARD: return 4;
      default: return 5;
    }
  }

  isInjured(player: Player | null | undefined): boolean {
    return !!player && isPlayerInjured(player);
  }

  getActiveInjuryFor(player: Player | null | undefined): InjuryRecord | null {
    if (!player) return null;
    return getActiveInjury(player);
  }

  getInjuryName(definitionId: string): string {
    return getInjuryDefinition(definitionId)?.name ?? definitionId;
  }

  formatWeeksOut(weeksRemaining: number): string {
    if (weeksRemaining <= 0) return 'Back next game';
    if (weeksRemaining === 1) return '1 wk';
    return `${weeksRemaining} wks`;
  }

  isSuspended(player: Player | null | undefined): boolean {
    return !!player && isPlayerSuspended(player);
  }

  getActiveSuspensionFor(player: Player | null | undefined): SuspensionRecord | null {
    if (!player) return null;
    return getActiveSuspension(player);
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

  formatSuspensionGames(gamesRemaining: number): string {
    if (gamesRemaining <= 0) return 'Back next game';
    if (gamesRemaining === 1) return '1 game';
    return `${gamesRemaining} games`;
  }

  onDragStart(event: DragEvent, playerId: string) {
    this.draggedPlayerId.set(playerId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', playerId);
    }
  }

  onDragOver(event: DragEvent, targetId: string) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dragOverTargetId.set(targetId);
  }

  onDragLeave(_event: DragEvent) {
    this.dragOverTargetId.set(null);
  }

  onDropOnPlayer(event: DragEvent, targetPlayerId: string) {
    event.preventDefault();
    const draggedId = this.draggedPlayerId();

    if (draggedId && draggedId !== targetPlayerId) {
      this.gameService.swapPlayerRoles(draggedId, targetPlayerId);
    }

    this.draggedPlayerId.set(null);
    this.dragOverTargetId.set(null);
  }

  onDropOnStarterSlot(event: DragEvent, slotId: string, targetPlayerId?: string) {
    event.preventDefault();
    const draggedId = this.draggedPlayerId();
    const team = this.team();

    if (!draggedId || !team) {
      this.draggedPlayerId.set(null);
      this.dragOverTargetId.set(null);
      return;
    }

    if (targetPlayerId && draggedId !== targetPlayerId) {
      this.gameService.swapPlayerRoles(draggedId, targetPlayerId);
    } else if (!targetPlayerId) {
      this.gameService.updateFormationAssignment(team.id, slotId, draggedId);
    }

    this.draggedPlayerId.set(null);
    this.dragOverTargetId.set(null);
  }

  onDropOnBenchSlot(event: DragEvent) {
    event.preventDefault();
    const draggedId = this.draggedPlayerId();
    const team = this.team();

    if (!draggedId || !team) {
      this.draggedPlayerId.set(null);
      this.dragOverTargetId.set(null);
      return;
    }

    this.gameService.movePlayerToBench(team.id, draggedId);

    this.draggedPlayerId.set(null);
    this.dragOverTargetId.set(null);
  }

  onDragEnd() {
    this.draggedPlayerId.set(null);
    this.dragOverTargetId.set(null);
  }

  isDragging(playerId: string): boolean {
    return this.draggedPlayerId() === playerId;
  }

  isDragOver(playerId: string): boolean {
    return this.dragOverTargetId() === playerId;
  }

  starterRowTargetId(slotId: string): string {
    return `slot:${slotId}`;
  }

  benchSlotTargetId(slotNumber: number): string {
    return `bench:${slotNumber}`;
  }

  slotBadgeClass(slot: FormationSlot): string {
    switch (slot.position) {
      case this.Position.GOALKEEPER:
        return 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30';
      case this.Position.DEFENDER:
        return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
      case this.Position.MIDFIELDER:
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      case this.Position.FORWARD:
        return 'bg-red-500/15 text-red-300 border-red-500/30';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  }

  availableFormations = computed(() =>
    this.fieldService.getAvailableFormations()
      .map(id => this.formationLibrary.getFormationById(id))
      .filter((f): f is NonNullable<typeof f> => f !== undefined)
  );

  seasonHistory = computed(() => {
    const t = this.team();
    if (!t) return [];
    return t.seasonSnapshots || [];
  });

  seasonHistoryWithStats = computed(() => {
    const t = this.team();
    if (!t) return [];

    return this.seasonHistory().map(snapshot => {
      const ovr = this.gameService.getTeamAverageOverallForSeason(t, snapshot.seasonYear);
      const standing = this.gameService.getLeagueStandingsRankForSeason(t.id, snapshot.seasonYear);

      return {
        season: snapshot.seasonYear,
        stats: snapshot.stats,
        ovr,
        rank: standing.rank,
        totalTeams: standing.totalTeams
      };
    }).sort((a, b) => a.season - b.season);
  });

  onFormationChange(formationId: string) {
    const team = this.team();
    if (!team) return;
    this.gameService.changeTeamFormation(team.id, formationId);
  }

  onTeamChange(teamId: string) {
    this.router.navigate(['/team', teamId]);
  }

  runQuickFix() {
    if (this.isSchemaMismatchBlocking()) {
      return;
    }
    this.gameService.optimizeUserTeamLineup();
  }

  setViewMode(mode: TeamDetailsViewMode) {
    this.viewMode.set(mode);
  }

  isPlayerTransferListed(playerId: string): boolean {
    const listings = this.gameService.league()?.transferListings;
    return !!listings && listings.includes(playerId);
  }

  addToTransferList(playerId: string) {
    this.gameService.addPlayerToTransferList(playerId);
  }

  removeFromTransferList(playerId: string) {
    this.gameService.removePlayerFromTransferList(playerId);
  }

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
