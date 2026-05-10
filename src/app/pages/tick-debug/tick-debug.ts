import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe, JsonPipe } from '@angular/common';
import { GameService } from '../../services/game.service';
import { MatchSimulationVariantBService } from '../../services/match.simulation.variant-b.service';
import { FormationLibraryService } from '../../services/formation-library.service';
import { TeamColorsService } from '../../services/team-colors.service';
import { CommentaryStyle, Position, Role, TeamSide } from '../../models/enums';
import { Match, Player, Team } from '../../models/types';
import { MatchState, SimulationConfig, TickTrace, VariantBMatchShapeSnapshot, VariantBShapeSlotSnapshot } from '../../models/simulation.types';
import { normalizeTeamFormation } from '../../models/team-migration';
import { resolveTeamPlayers } from '../../models/team-players';

interface TeamOption {
  id: string;
  team: Team;
  label: string;
}

interface FormationOption {
  id: string;
  label: string;
}

interface PitchPoint {
  left: number;
  top: number;
}

interface TickShapeDot {
  id: string;
  slotId: string;
  slotLabel: string;
  teamSide: TeamSide;
  playerId: string;
  label: string;
  fullName: string;
  x: number;
  y: number;
}

@Component({
  selector: 'app-tick-debug',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DecimalPipe, JsonPipe],
  templateUrl: './tick-debug.html'
})
export class TickDebugComponent {
  private gameService = inject(GameService);
  private simulationB = inject(MatchSimulationVariantBService);
  private formationLibrary = inject(FormationLibraryService);
  private teamColorsService = inject(TeamColorsService);

  TeamSide = TeamSide;

  readonly teams = computed(() => this.gameService.league()?.teams ?? []);
  readonly sortedTeamOptions = computed<TeamOption[]>(() => {
    return [...this.teams()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(team => ({
        id: team.id,
        team,
        label: `${team.name} [${this.gameService.calculateTeamOverall(team)}]`
      }));
  });
  readonly formationOptions = computed<FormationOption[]>(() => {
    return this.formationLibrary
      .getAllFormations()
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(formation => ({
        id: formation.id,
        label: `${formation.name} (${formation.shortCode})`
      }));
  });

  readonly homeTeamId = signal('');
  readonly awayTeamId = signal('');
  readonly homeFormationId = signal('');
  readonly awayFormationId = signal('');

  readonly homeTeamColor = signal<string>('#0ea5e9');
  readonly homeTeamAccentColor = signal<string>('#f43f5e');
  readonly awayTeamColor = signal<string>('#f43f5e');
  readonly awayTeamAccentColor = signal<string>('#0ea5e9');

  readonly isRunning = signal(false);
  readonly matchState = signal<MatchState | null>(null);
  readonly tickTraces = computed(() => this.matchState()?.tickTraces ?? []);
  readonly currentTickIndex = signal(0);

  readonly currentTick = computed(() => {
    const traces = this.tickTraces();
    if (traces.length === 0) return null;
    return traces[this.currentTickIndex()] ?? null;
  });

  readonly canRun = computed(() => {
    return this.homeTeamId().length > 0 && this.awayTeamId().length > 0 && this.homeTeamId() !== this.awayTeamId();
  });

  readonly homeDots = computed(() => this.buildTickDots(TeamSide.HOME));
  readonly awayDots = computed(() => this.buildTickDots(TeamSide.AWAY));

  constructor() {
    effect(() => {
      const teamOptions = this.sortedTeamOptions();
      const teams = teamOptions.map(option => option.team);
      if (teams.length < 2) {
        this.homeTeamId.set('');
        this.awayTeamId.set('');
        return;
      }

      if (!teams.some(team => team.id === this.homeTeamId())) {
        this.homeTeamId.set(teams[0].id);
      }

      if (!teams.some(team => team.id === this.awayTeamId()) || this.awayTeamId() === this.homeTeamId()) {
        const awayFallback = teams.find(team => team.id !== this.homeTeamId());
        this.awayTeamId.set(awayFallback ? awayFallback.id : '');
      }

      const homeTeam = teams.find(team => team.id === this.homeTeamId());
      if (homeTeam && !this.homeFormationId()) {
        this.homeFormationId.set(homeTeam.selectedFormationId);
      }

      const awayTeam = teams.find(team => team.id === this.awayTeamId());
      if (awayTeam && !this.awayFormationId()) {
        this.awayFormationId.set(awayTeam.selectedFormationId);
      }
    });

    effect(() => {
      const formationOptions = this.formationOptions();
      if (formationOptions.length === 0) {
        this.homeFormationId.set('');
        this.awayFormationId.set('');
        return;
      }

      if (!formationOptions.some(option => option.id === this.homeFormationId())) {
        this.homeFormationId.set(formationOptions[0].id);
      }

      if (!formationOptions.some(option => option.id === this.awayFormationId())) {
        this.awayFormationId.set(formationOptions[0].id);
      }
    });

    effect(() => {
      const homeTeam = this.teams().find(t => t.id === this.homeTeamId());
      const awayTeam = this.teams().find(t => t.id === this.awayTeamId());
      if (homeTeam) {
        const homeColors = this.teamColorsService.getTeamColors(homeTeam.name);
        this.homeTeamColor.set(homeColors.main);
        this.homeTeamAccentColor.set(homeColors.accent);
      }
      if (awayTeam) {
        const awayColors = this.teamColorsService.getTeamColors(awayTeam.name);
        this.awayTeamColor.set(awayColors.main);
        this.awayTeamAccentColor.set(awayColors.accent);
      }
    });
  }

  setHomeTeam(teamId: string): void {
    this.homeTeamId.set(teamId);
    const selectedTeam = this.teams().find(team => team.id === teamId);
    if (selectedTeam) {
      this.homeFormationId.set(selectedTeam.selectedFormationId);
    }
    if (teamId === this.awayTeamId()) {
      const fallback = this.teams().find(team => team.id !== teamId);
      this.awayTeamId.set(fallback ? fallback.id : '');
    }
  }

  setAwayTeam(teamId: string): void {
    this.awayTeamId.set(teamId);
    const selectedTeam = this.teams().find(team => team.id === teamId);
    if (selectedTeam) {
      this.awayFormationId.set(selectedTeam.selectedFormationId);
    }
  }

  setHomeFormation(formationId: string): void {
    this.homeFormationId.set(formationId);
  }

  setAwayFormation(formationId: string): void {
    this.awayFormationId.set(formationId);
  }

  async runSimulation(): Promise<void> {
    if (!this.canRun() || this.isRunning()) {
      return;
    }

    const homeTeam = this.teams().find(team => team.id === this.homeTeamId());
    const awayTeam = this.teams().find(team => team.id === this.awayTeamId());

    if (!homeTeam || !awayTeam) {
      return;
    }

    const configuredHomeTeam = this.withSandboxFormation(homeTeam, this.homeFormationId());
    const configuredAwayTeam = this.withSandboxFormation(awayTeam, this.awayFormationId());

    this.isRunning.set(true);

    try {
      await this.yieldToUi();

      const matchBase: Match = {
        id: `sandbox-${Date.now()}`,
        week: 1,
        homeTeamId: configuredHomeTeam.id,
        awayTeamId: configuredAwayTeam.id,
        played: false
      };

      const config: SimulationConfig = {
        enablePlayByPlay: true,
        enableSpatialTracking: true,
        enableTactics: true,
        enableFatigue: true,
        commentaryStyle: CommentaryStyle.DETAILED,
        simulationVariant: 'B',
        debugTickTracing: true
      };

      const stateB = this.simulationB.simulateMatch(
        matchBase,
        configuredHomeTeam,
        configuredAwayTeam,
        config
      );

      this.matchState.set(stateB);
      this.currentTickIndex.set(0);

    } finally {
      this.isRunning.set(false);
    }
  }

  nextTick() {
    const traces = this.tickTraces();
    if (this.currentTickIndex() < traces.length - 1) {
      this.currentTickIndex.update(i => i + 1);
    }
  }

  prevTick() {
    if (this.currentTickIndex() > 0) {
      this.currentTickIndex.update(i => i - 1);
    }
  }

  jumpToTick(indexStr: string) {
    const idx = parseInt(indexStr, 10);
    const maxIdx = this.tickTraces().length - 1;
    if (!isNaN(idx) && idx >= 0 && idx <= maxIdx) {
      this.currentTickIndex.set(idx);
    }
  }

  private buildTickDots(teamSide: TeamSide): TickShapeDot[] {
    const tick = this.currentTick();
    if (!tick || !tick.matchShapeSnapshot) return [];

    const slots = teamSide === TeamSide.HOME ? tick.matchShapeSnapshot.home : tick.matchShapeSnapshot.away;
    const team = teamSide === TeamSide.HOME ? this.homeTeamId() : this.awayTeamId();
    const teamObj = this.teams().find(t => t.id === team);
    if (!teamObj) return [];

    const playersById = new Map((teamObj.players ?? []).map(p => [p.id, p]));
    const mirrorYAxis = teamSide === TeamSide.AWAY;

    return slots.map(slot => {
      const player = slot.playerId ? playersById.get(slot.playerId) : null;
      const fullName = player?.name ?? slot.role;
      return {
        id: `${team}-${slot.slotId}`,
        slotId: slot.slotId,
        slotLabel: slot.role,
        teamSide,
        playerId: slot.playerId ?? '',
        label: this.toInitials(fullName),
        fullName,
        x: slot.coordinates.x,
        y: mirrorYAxis ? 100 - slot.coordinates.y : slot.coordinates.y
      };
    });
  }

  getPitchPoint(coords: {x: number, y: number}, teamSide?: TeamSide): PitchPoint {
    const left = 100 - coords.x;
    let top: number;

    if (teamSide === TeamSide.AWAY) {
      top = 50 + coords.y / 2;
    } else {
      top = coords.y / 2;
    }

    return { left, top };
  }

  private toInitials(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) {
      return '?';
    }

    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  private async yieldToUi(): Promise<void> {
    await new Promise<void>(resolve => {
      setTimeout(resolve, 0);
    });
  }

  private withSandboxFormation(team: Team, formationId: string): Team {
    const slots = this.formationLibrary.getFormationSlots(formationId);
    if (!slots) {
      return structuredClone(team);
    }

    const clonedTeam = structuredClone(team);
    const normalized = normalizeTeamFormation(
      {
        ...clonedTeam,
        selectedFormationId: formationId
      },
      formationId,
      slots
    );

    const overallOf = (player: Player) => this.gameService.getCurrentSeasonPlayerAttributes(player).overall.value;
    const starters = resolveTeamPlayers(normalized)
      .filter(player => player.role === Role.STARTER)
      .sort((left, right) => overallOf(right) - overallOf(left));
    const startersById = new Map(starters.map(player => [player.id, player]));
    const usedPlayers = new Set<string>();
    const formationAssignments: Record<string, string> = { ...normalized.formationAssignments };

    for (const slot of slots) {
      const currentPlayerId = formationAssignments[slot.slotId];
      if (currentPlayerId && startersById.has(currentPlayerId) && !usedPlayers.has(currentPlayerId)) {
        usedPlayers.add(currentPlayerId);
        continue;
      }

      const replacement = this.pickStarterForSlot(starters, slot.preferredPosition, usedPlayers);
      formationAssignments[slot.slotId] = replacement?.id ?? '';
      if (replacement) {
        usedPlayers.add(replacement.id);
      }
    }

    return {
      ...normalized,
      formationAssignments
    };
  }

  private pickStarterForSlot(starters: Player[], preferredPosition: Position, usedPlayers: Set<string>): Player | undefined {
    const availableStarters = starters.filter(player => !usedPlayers.has(player.id));
    const overallOf = (player: Player) => this.gameService.getCurrentSeasonPlayerAttributes(player).overall.value;
    const exactPositionMatch = availableStarters
      .filter(player => player.position === preferredPosition)
      .sort((left, right) => overallOf(right) - overallOf(left))[0];

    if (exactPositionMatch) {
      return exactPositionMatch;
    }

    if (preferredPosition === Position.GOALKEEPER) {
      return availableStarters[0];
    }

    return availableStarters.find(player => player.position !== Position.GOALKEEPER) ?? availableStarters[0];
  }
}
