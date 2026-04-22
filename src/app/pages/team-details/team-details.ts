import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { FieldService } from '../../services/field.service';
import { FormationLibraryService } from '../../services/formation-library.service';
import { Player, PlayerCareerStats, Role } from '../../models/types';
import { FormationSlot } from '../../models/simulation.types';
import { MatchResult, Position as PositionEnum, TeamDetailsViewMode } from '../../models/enums';

type TeamDetailsRowStats = Pick<PlayerCareerStats, 'matchesPlayed' | 'minutesPlayed' | 'goals' | 'assists' | 'yellowCards' | 'redCards'>;

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

  private teamId = computed(() => this.route.snapshot.paramMap.get('id'));

  isUserTeam = computed(() => {
    const l = this.gameService.league();
    return l?.userTeamId === this.teamId();
  });

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

  formationValidationErrors = computed(() => {
    const t = this.team();
    if (!t) return [];
    return this.gameService.getFormationValidationErrors(t);
  });

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

  bench = computed(() => {
    const t = this.team();
    if (!t) return [];
    return this.gameService.getPlayersForTeam(t.id).filter(p => p.role === Role.BENCH)
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
    return this.gameService.getPlayersForTeam(t.id).filter(p => p.role === Role.RESERVE)
      .sort((a, b) => this.positionWeight(a.position) - this.positionWeight(b.position));
  });

  getCurrentSeasonStats(player: Player): TeamDetailsRowStats {
    return this.gameService.getCurrentSeasonStats(player) || {
      matchesPlayed: 0,
      minutesPlayed: 0,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0
    };
  }

  getPlayerOverall(player: Player): number {
    const attrs = this.gameService.getCurrentSeasonPlayerAttributes(player);
    if (!attrs) {
      throw new Error('Player attributes unavailable for current season');
    }
    return attrs.overall;
  }

  getRowStats(player: Player | null): TeamDetailsRowStats {
    if (!player) return {
      matchesPlayed: 0,
      minutesPlayed: 0,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0
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

    const allTeams = this.gameService.league()?.teams ?? [];

    return this.seasonHistory().map(snapshot => {
      const playerOveralls = snapshot.playerIds
        .map(id => this.gameService.getPlayer(id))
        .filter((p): p is NonNullable<typeof p> => p !== undefined)
        .map(p => p.seasonAttributes?.find(sa => sa.seasonYear === snapshot.seasonYear)?.overall)
        .filter((o): o is number => o !== undefined);

      const ovr = playerOveralls.length > 0
        ? Math.round(playerOveralls.reduce((a, b) => a + b, 0) / playerOveralls.length)
        : null;

      const ranked = allTeams
        .map(team => {
          const s = team.seasonSnapshots?.find(ss => ss.seasonYear === snapshot.seasonYear);
          return { teamId: team.id, stats: s?.stats };
        })
        .filter(entry => entry.stats !== undefined)
        .sort((a, b) => {
          const ap = a.stats!.points, bp = b.stats!.points;
          if (bp !== ap) return bp - ap;
          const agd = (a.stats!.goalsFor - a.stats!.goalsAgainst);
          const bgd = (b.stats!.goalsFor - b.stats!.goalsAgainst);
          if (bgd !== agd) return bgd - agd;
          return b.stats!.goalsFor - a.stats!.goalsFor;
        });

      const rank = ranked.findIndex(entry => entry.teamId === t.id) + 1;

      return {
        season: snapshot.seasonYear,
        stats: snapshot.stats,
        ovr,
        rank: rank > 0 ? rank : null,
        totalTeams: ranked.length
      };
    }).sort((a, b) => b.season - a.season);
  });

  onFormationChange(formationId: string) {
    const team = this.team();
    if (!team) return;
    this.gameService.changeTeamFormation(team.id, formationId);
  }

  setViewMode(mode: TeamDetailsViewMode) {
    this.viewMode.set(mode);
  }
}
