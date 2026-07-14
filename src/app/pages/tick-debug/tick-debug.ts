import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe, JsonPipe } from '@angular/common';
import { GameService } from '../../services/game.service';
import { MatchSimulationVariantBService } from '../../services/match.simulation.variant-b.service';
import { FormationLibraryService } from '../../services/formation-library.service';
import { TeamColorsService } from '../../services/team-colors.service';
import { CommentaryStyle, EventType, Position, Role, TeamSide } from '../../models/enums';
import { Match, Player, Team } from '../../models/types';
import { MatchState, PlayByPlayEventAdditionalData, SimulationConfig } from '../../models/simulation.types';
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
  runProgress: number;
}

interface CleanedVariantBReplay {
  actionType: EventType;
  durationMs: number;
  actor?: string;
  actorPlayerId?: string;
  keyframes?: unknown;
}

interface CleanedAdditionalData extends Omit<PlayByPlayEventAdditionalData, 'variantBReplay'> {
  variantBReplay?: CleanedVariantBReplay;
  offsidePlayer?: string;
}

export interface CleanedEvent {
  type: string;
  description: string;
  playerNames: string[];
  additionalData: CleanedAdditionalData | null;
  isPass: boolean;
  isFailedPass: boolean;
  isCarryTackle: boolean;
  isPassiveCarry: boolean;
  passSequence: number;
  passerName?: string;
  receiverName?: string;
  intendedTargetName?: string;
  passIntent?: string;
  passFailure?: string;
  winnerName?: string;
  loserName?: string;
  offsideCalled: boolean;
  distanceToLane?: number;
  location: { x: number; y: number };
}

@Component({
  selector: 'app-tick-debug',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, JsonPipe],
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

  readonly playerNamesMap = computed(() => {
    const map = new Map<string, string>();
    for (const team of this.teams()) {
      for (const p of team.players ?? []) {
        map.set(p.id, p.name);
      }
    }
    return map;
  });

  readonly formattedEvent = computed<CleanedEvent | null>(() => {
    const tick = this.currentTick();
    if (!tick || !tick.eventCreated) return null;

    const event = tick.eventCreated;
    const names = this.playerNamesMap();

    const playerNames = (event.playerIds ?? []).map(id => names.get(id) || id);

    let cleanedData: CleanedAdditionalData | null = null;
    if (event.additionalData) {
      cleanedData = { ...event.additionalData } as CleanedAdditionalData;

      delete cleanedData.formationSnapshot;

      if (cleanedData.variantBReplay) {
        cleanedData.variantBReplay = { ...cleanedData.variantBReplay } as CleanedVariantBReplay;
        delete cleanedData.variantBReplay.keyframes;
        
        if (cleanedData.variantBReplay.actorPlayerId) {
          const actorId = cleanedData.variantBReplay.actorPlayerId;
          cleanedData.variantBReplay.actor = names.get(actorId) || actorId;
          delete cleanedData.variantBReplay.actorPlayerId;
        }
      }

      if (cleanedData.aerialWinner) {
        cleanedData.aerialWinner = names.get(cleanedData.aerialWinner) || cleanedData.aerialWinner;
      }
      if (cleanedData.aerialLoser) {
        cleanedData.aerialLoser = names.get(cleanedData.aerialLoser) || cleanedData.aerialLoser;
      }
      if (cleanedData.offsidePlayerId) {
        cleanedData.offsidePlayer = names.get(cleanedData.offsidePlayerId) || cleanedData.offsidePlayerId;
        delete cleanedData.offsidePlayerId;
      }
      if (cleanedData.playerWithBall) {
        cleanedData.playerWithBall = names.get(cleanedData.playerWithBall) || cleanedData.playerWithBall;
      }
      if (cleanedData.scrambleWinnerId) {
        cleanedData.scrambleWinnerName = names.get(cleanedData.scrambleWinnerId) || cleanedData.scrambleWinnerId;
      }
      if (cleanedData.scrambleDecisions) {
        cleanedData.scrambleDecisions = cleanedData.scrambleDecisions.map(d => ({
          ...d,
          playerName: names.get(d.playerId) || d.playerName
        }));
      }
      if (cleanedData.tackleDecisions) {
        cleanedData.tackleDecisions = cleanedData.tackleDecisions.map(d => ({
          ...d,
          playerName: names.get(d.playerId) || d.playerName
        }));
      }
      if (cleanedData.interceptionDecisions) {
        cleanedData.interceptionDecisions = cleanedData.interceptionDecisions.map(d => ({
          ...d,
          playerName: names.get(d.playerId) || d.playerName
        }));
      }
    }

    const isPass = event.type === EventType.PASS && event.success === true;
    const isFailedPass =
      (event.type === EventType.INTERCEPTION && cleanedData?.passFailure !== undefined) ||
      (event.type === EventType.PASS && event.success === false);
    const isCarryTackle = event.type === EventType.TACKLE && event.success === true;
    const isPassiveCarry = event.type === EventType.CARRY;

    let distanceToLane: number | undefined = undefined;
    if (isFailedPass && event.type === EventType.INTERCEPTION && event.additionalData?.passFailure === 'LANE_CUT_OUT') {
      const interceptorId = event.playerIds?.[0];
      const passerId = event.playerIds?.[1];
      const targetId = event.additionalData?.offsidePlayerId;
      if (interceptorId && passerId && targetId) {
        const allDots = [...this.homeDots(), ...this.awayDots()];
        const interceptorDot = allDots.find(d => d.playerId === interceptorId);
        const passerDot = allDots.find(d => d.playerId === passerId);
        const targetDot = allDots.find(d => d.playerId === targetId);
        if (interceptorDot && passerDot && targetDot) {
          distanceToLane = this.getDistanceToLineSegment(
            interceptorDot.x,
            interceptorDot.y,
            passerDot.x,
            passerDot.y,
            targetDot.x,
            targetDot.y
          );
        }
      }
    }

    return {
      type: event.type,
      description: event.description,
      playerNames,
      additionalData: cleanedData,
      isPass,
      isFailedPass,
      isCarryTackle,
      isPassiveCarry,
      passSequence: tick.ballPossession.passes,
      passerName: event.type === EventType.PASS ? playerNames[0] : (event.type === EventType.INTERCEPTION ? playerNames[1] : undefined),
      receiverName: isPass ? playerNames[1] : undefined,
      intendedTargetName: isFailedPass && event.type === EventType.INTERCEPTION && cleanedData?.offsidePlayer ? cleanedData.offsidePlayer : undefined,
      passIntent: cleanedData?.passIntent,
      passFailure: cleanedData?.passFailure,
      winnerName: (isCarryTackle || (isFailedPass && event.type === EventType.INTERCEPTION)) ? playerNames[0] : ((isPassiveCarry || (isFailedPass && event.type === EventType.PASS)) ? playerNames[1] : undefined),
      loserName: isCarryTackle ? playerNames[1] : (isPassiveCarry ? playerNames[0] : undefined),
      offsideCalled: cleanedData?.isOffside || false,
      distanceToLane,
      location: event.location
    };
  });

  get eventDetails(): CleanedEvent | null {
    return this.formattedEvent();
  }

  readonly actionWeightsWithPercentages = computed(() => {
    const tick = this.currentTick();
    if (!tick || !tick.actionWeights) return null;

    const weights = tick.actionWeights;
    const total = (weights.pass || 0) + (weights.carry || 0) + (weights.shot || 0) + (weights.foul || 0);
    
    if (total === 0) return null;

    return {
      pass: { val: weights.pass, pct: (weights.pass / total) * 100 },
      carry: { val: weights.carry, pct: (weights.carry / total) * 100 },
      shot: { val: weights.shot, pct: (weights.shot / total) * 100 },
      foul: { val: weights.foul, pct: (weights.foul / total) * 100 }
    };
  });

  readonly canRun = computed(() => {
    return this.homeTeamId().length > 0 && this.awayTeamId().length > 0 && this.homeTeamId() !== this.awayTeamId();
  });

  readonly homeDots = computed(() => this.buildTickDots(TeamSide.HOME));
  readonly awayDots = computed(() => this.buildTickDots(TeamSide.AWAY));

  readonly activeRuns = computed(() => {
    const tick = this.currentTick();
    if (!tick || !tick.matchShapeSnapshot) return [];

    const isHomePossession = tick.ballPossession.teamId === this.homeTeamId();
    const slots = isHomePossession ? tick.matchShapeSnapshot.home : tick.matchShapeSnapshot.away;
    const teamId = isHomePossession ? this.homeTeamId() : this.awayTeamId();
    const teamObj = this.teams().find(t => t.id === teamId);
    if (!teamObj) return [];

    const playersById = new Map((teamObj.players ?? []).map(p => [p.id, p]));

    return slots
      .filter(slot => slot.playerId && (slot.runProgress ?? 0) > 0)
      .map(slot => {
        const player = playersById.get(slot.playerId!);
        return {
          playerId: slot.playerId!,
          playerName: player?.name ?? slot.role,
          role: slot.role,
          runProgress: slot.runProgress ?? 0,
        };
      })
      .sort((a, b) => b.runProgress - a.runProgress);
  });

  readonly offsideLineY = computed(() => {
    const tick = this.currentTick();
    if (!tick || !tick.matchShapeSnapshot) return null;

    const possessionTeam = tick.ballPossession.teamId === this.homeTeamId() ? TeamSide.HOME : TeamSide.AWAY;
    const dots = possessionTeam === TeamSide.HOME ? this.awayDots() : this.homeDots();
    
    // Filter to only active defenders (slots with a player assigned)
    const activeDefenders = dots.filter(d => d.playerId);
    if (activeDefenders.length < 2) return null;

    // Get defenders' Y coordinates from attacker's perspective (opponent goal is at 100)
    const defenderAttY = activeDefenders.map(d =>
      possessionTeam === TeamSide.HOME ? d.y : 100 - d.y
    );

    // Sort descending (highest attY is closest to defender's own goal line)
    defenderAttY.sort((a, b) => b - a);

    // The offside line is the second-last defender (index 1)
    const offsideLineAttY = defenderAttY[1];

    // Convert back to raw coordinates for drawing on the pitch
    return possessionTeam === TeamSide.HOME ? offsideLineAttY : 100 - offsideLineAttY;
  });

  readonly passLine = computed(() => {
    const tick = this.currentTick();
    if (!tick || !tick.eventCreated) return null;

    const event = tick.eventCreated;
    const isPass = event.type === EventType.PASS && event.success === true;
    const isFailedPass = (event.type === EventType.INTERCEPTION && event.additionalData?.passFailure !== undefined);
    const isPassiveFailedPass = event.type === EventType.PASS && event.success === false;

    if (isPass && event.playerIds && event.playerIds.length >= 2) {
      const actorId = event.playerIds[0];
      const targetId = event.playerIds[1];
      const allDots = [...this.homeDots(), ...this.awayDots()];
      const actorDot = allDots.find(d => d.playerId === actorId);
      const targetDot = allDots.find(d => d.playerId === targetId);
      if (actorDot && targetDot) {
        return {
          x1: actorDot.x,
          y1: actorDot.y,
          x2: targetDot.x,
          y2: targetDot.y
        };
      }
    } else if (isFailedPass) {
      const passerId = event.playerIds?.[1];
      const targetId = event.additionalData?.offsidePlayerId;
      if (passerId && targetId) {
        const allDots = [...this.homeDots(), ...this.awayDots()];
        const passerDot = allDots.find(d => d.playerId === passerId);
        const targetDot = allDots.find(d => d.playerId === targetId);
        if (passerDot && targetDot) {
          return {
            x1: passerDot.x,
            y1: passerDot.y,
            x2: targetDot.x,
            y2: targetDot.y
          };
        }
      }
    } else if (isPassiveFailedPass) {
      const passerId = event.playerIds?.[0];
      if (passerId) {
        const allDots = [...this.homeDots(), ...this.awayDots()];
        const passerDot = allDots.find(d => d.playerId === passerId);
        if (passerDot) {
          return {
            x1: passerDot.x,
            y1: passerDot.y,
            x2: event.location.x,
            y2: event.location.y
          };
        }
      }
    }
    return null;
  });

  readonly blockingDefenders = computed(() => {
    const line = this.passLine();
    if (!line) return new Set<string>();

    const tick = this.currentTick();
    if (!tick) return new Set<string>();

    const possessionTeam = tick.ballPossession.teamId === this.homeTeamId() ? TeamSide.HOME : TeamSide.AWAY;
    const defendingTeam = possessionTeam === TeamSide.HOME ? TeamSide.AWAY : TeamSide.HOME;
    const dots = defendingTeam === TeamSide.HOME ? this.homeDots() : this.awayDots();

    const blocking = new Set<string>();
    for (const d of dots) {
      const dist = this.getDistanceToLineSegment(
        d.x, d.y,
        line.x1, line.y1,
        line.x2, line.y2
      );
      if (dist < 4.5) {
        blocking.add(d.playerId);
      }
    }
    return blocking;
  });

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

  private getDistanceToLineSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;

    const ab2 = abx * abx + aby * aby;
    if (ab2 === 0) return Math.sqrt(apx * apx + apy * apy);

    let t = (apx * abx + apy * aby) / ab2;
    if (t < 0.0 || t > 1.0) {
      return 999.0;
    }
    t = Math.max(0, Math.min(1, t));

    const closestX = ax + t * abx;
    const closestY = ay + t * aby;
    const dx = px - closestX;
    const dy = py - closestY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private buildTickDots(teamSide: TeamSide): TickShapeDot[] {
    const tick = this.currentTick();
    if (!tick || !tick.matchShapeSnapshot) return [];

    const slots = teamSide === TeamSide.HOME ? tick.matchShapeSnapshot.home : tick.matchShapeSnapshot.away;
    const team = teamSide === TeamSide.HOME ? this.homeTeamId() : this.awayTeamId();
    const teamObj = this.teams().find(t => t.id === team);
    if (!teamObj) return [];

    const playersById = new Map((teamObj.players ?? []).map(p => [p.id, p]));

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
        y: slot.coordinates.y,
        runProgress: slot.runProgress ?? 0
      };
    });
  }

  getPitchPoint(coords: { x: number, y: number }): PitchPoint {
    const left = 100 - coords.x;
    const top = coords.y;
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

    if (preferredPosition === Position.GK) {
      return availableStarters[0];
    }

    return availableStarters.find(player => player.position !== Position.GK) ?? availableStarters[0];
  }
}
