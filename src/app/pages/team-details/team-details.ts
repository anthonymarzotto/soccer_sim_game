import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GameService } from '../../services/game.service';
import { Role } from '../../models/types';
import { MatchResult, Position as PositionEnum } from '../../models/enums';

@Component({
  selector: 'app-team-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './team-details.html',
})
export class TeamDetailsComponent {
  private route = inject(ActivatedRoute);
  private gameService = inject(GameService);

  // Expose enums for template
  Position = PositionEnum;
  MatchResult = MatchResult;

  // Drag and drop state
  draggedPlayerId = signal<string | null>(null);
  dragOverPlayerId = signal<string | null>(null);

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

  starters = computed(() => {
    const t = this.team();
    if (!t) return [];
    return t.players.filter(p => p.role !== Role.BENCH && p.role !== Role.NOT_DRESSED)
      .sort((a, b) => this.positionWeight(a.position) - this.positionWeight(b.position));
  });

  bench = computed(() => {
    const t = this.team();
    if (!t) return [];
    return t.players.filter(p => p.role === Role.BENCH)
      .sort((a, b) => this.positionWeight(a.position) - this.positionWeight(b.position));
  });

  reserves = computed(() => {
    const t = this.team();
    if (!t) return [];
    return t.players.filter(p => p.role === Role.NOT_DRESSED)
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

  onDragOver(event: DragEvent, playerId: string) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dragOverPlayerId.set(playerId);
  }

  onDragLeave(_event: DragEvent) {
    this.dragOverPlayerId.set(null);
  }

  onDrop(event: DragEvent, targetPlayerId: string) {
    event.preventDefault();
    const draggedId = this.draggedPlayerId();
    
    if (draggedId && draggedId !== targetPlayerId) {
      this.gameService.swapPlayerRoles(draggedId, targetPlayerId);
    }
    
    this.draggedPlayerId.set(null);
    this.dragOverPlayerId.set(null);
  }

  onDragEnd() {
    this.draggedPlayerId.set(null);
    this.dragOverPlayerId.set(null);
  }

  isDragging(playerId: string): boolean {
    return this.draggedPlayerId() === playerId;
  }

  isDragOver(playerId: string): boolean {
    return this.dragOverPlayerId() === playerId;
  }
}
