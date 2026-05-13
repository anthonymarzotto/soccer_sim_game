import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { FieldService } from '../../services/field.service';
import { FormationLibraryService } from '../../services/formation-library.service';
import { Player, PlayerCareerStats, Role } from '../../models/types';
import { FormationSlot } from '../../models/simulation.types';
import { MatchResult, Position as PositionEnum, TeamDetailsViewMode } from '../../models/enums';
import { computeAge, seasonAnchorDate } from '../../models/player-age';
import { formatAverageMatchRating } from '../../models/player-career-stats';
import { getActiveInjury, isPlayerInjured } from '../../models/season-history';
import { InjuryRecord, getInjuryDefinition } from '../../data/injuries';

type TeamDetailsRowStats = Pick<PlayerCareerStats, 'matchesPlayed' | 'minutesPlayed' | 'goals' | 'assists' | 'yellowCards' | 'redCards' | 'totalMatchRating' | 'starNominations'>;

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
  imports: [RouterLink],
  templateUrl: './team-details.html',
})
export class TeamDetailsComponent {
  private static readonly BENCH_SLOT_COUNT = 9;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private gameService = inject(GameService);
  private fieldService = inject(FieldService);
  private formationLibrary = inject(FormationLibraryService);

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

  injured = computed(() => {
    const t = this.team();
    if (!t) return [];
    return this.gameService.getPlayersForTeam(t.id).filter(p => isPlayerInjured(p))
      .sort((a, b) => this.positionWeight(a.position) - this.positionWeight(b.position));
  });

  bench = computed(() => {
    const t = this.team();
    if (!t) return [];
    return this.gameService.getPlayersForTeam(t.id).filter(p => p.role === Role.BENCH && !isPlayerInjured(p))
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
    return this.gameService.getPlayersForTeam(t.id).filter(p => p.role === Role.RESERVE && !isPlayerInjured(p))
      .sort((a, b) => this.positionWeight(a.position) - this.positionWeight(b.position));
  });

  getCurrentSeasonStats(player: Player): TeamDetailsRowStats {
    return this.gameService.getCurrentSeasonStats(player) || {
      matchesPlayed: 0,
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

  getPlayerAge(player: Player | null | undefined): number | null {
    if (!player) return null;
    const year = this.gameService.league()?.currentSeasonYear;
    if (year === undefined) return null;
    return computeAge(player.personal.birthday, seasonAnchorDate(year));
  }

  formatAvgRating(stats: TeamDetailsRowStats): string {
    return formatAverageMatchRating(stats);
  }

  getRowStats(player: Player | null): TeamDetailsRowStats {
    if (!player) return {
      matchesPlayed: 0,
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
    switch(pos) {
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
    return Object.values(t.seasonSnapshots || {});
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
    }).sort((a, b) => b.season - a.season);
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
}
