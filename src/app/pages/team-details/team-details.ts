import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { FieldService } from '../../services/field.service';
import { FormationLibraryService } from '../../services/formation-library.service';
import { Player, Role } from '../../models/types';
import { FormationSlot } from '../../models/simulation.types';
import { MatchResult, Position as PositionEnum, TeamDetailsViewMode } from '../../models/enums';

interface StarterRow {
  slot: FormationSlot;
  player: Player | null;
}

@Component({
  selector: 'app-team-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './team-details.html',
})
export class TeamDetailsComponent {
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

  reserves = computed(() => {
    const t = this.team();
    if (!t) return [];
    return this.gameService.getPlayersForTeam(t.id).filter(p => p.role === Role.RESERVE)
      .sort((a, b) => this.positionWeight(a.position) - this.positionWeight(b.position));
  });

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

  onFormationChange(formationId: string) {
    const team = this.team();
    if (!team) return;
    this.gameService.changeTeamFormation(team.id, formationId);
  }

  toggleView() {
    this.viewMode.set(this.viewMode() === TeamDetailsViewMode.BIO ? TeamDetailsViewMode.STATS : TeamDetailsViewMode.BIO);
  }
}
