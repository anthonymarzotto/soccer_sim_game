import { Injectable, inject } from '@angular/core';
import { Coordinates, FieldZone, TeamFormation, TacticalSetup, FormationSlot } from '../models/simulation.types';
import { Team, Player } from '../models/types';
import { resolveTeamPlayers } from '../models/team-players';
import { getCurrentPlayerSeasonAttributes } from '../models/season-history';
import { PlayingStyle, Mentality, Role, Position } from '../models/enums';
import { FormationLibraryService } from './formation-library.service';

@Injectable({
  providedIn: 'root'
})
export class FieldService {
  private formationLibrary = inject(FormationLibraryService);
  
  // Real FIFA pitch dimensions
  readonly FIELD_WIDTH_METERS = 68;   // x-axis: 0–100 grid units = 68m
  readonly FIELD_LENGTH_METERS = 105; // y-axis: 0–100 grid units = 105m

  // Scale factors: multiply grid-unit deltas by these to get meters
  private readonly X_SCALE = this.FIELD_WIDTH_METERS / 100;  // metres per x-unit
  private readonly Y_SCALE = this.FIELD_LENGTH_METERS / 100; // metres per y-unit

  // Goal posts (x-axis). Goal is 7.32m wide, centred at x=50.
  // 7.32 / 68 * 100 = 10.76 units → half = 5.38 units each side of centre.
  readonly GOAL_LEFT_X  = 44.6;
  readonly GOAL_RIGHT_X = 55.4;

  // Opponent penalty area (attacking end, y=100 side).
  // Width: 40.32m  → 40.32/68*100 = 59.3 units centred → xMin=20.4, xMax=79.6
  // Depth: 16.5m   → 16.5/105*100 = 15.7 units from goal line → yMin=84.3
  readonly PENALTY_AREA = { xMin: 20.4, xMax: 79.6, yMin: 84.3 };

  // Six-yard box (goal area), attacking end.
  // Width: 18.32m  → 18.32/68*100 = 26.9 units centred → xMin=36.5, xMax=63.5
  // Depth: 5.5m    → 5.5/105*100  = 5.2 units from goal line → yMin=94.8
  readonly SIX_YARD_BOX = { xMin: 36.5, xMax: 63.5, yMin: 94.8 };

  // Penalty spot (attacking end). 11m from goal line → 11/105*100 = 10.5 units.
  readonly PENALTY_SPOT: Coordinates = { x: 50, y: 89.5 };

  // Zone boundaries (y-axis thirds: defence 0–33, midfield 34–66, attack 67–100)
  private readonly DEFENSE_ZONE  = { start: 0,  end: 33  };
  private readonly MIDFIELD_ZONE = { start: 34, end: 66  };
  private readonly ATTACK_ZONE   = { start: 67, end: 100 };

  getZoneBoundaries(zone: FieldZone): { start: number; end: number } {
    switch (zone) {
      case FieldZone.DEFENSE: return this.DEFENSE_ZONE;
      case FieldZone.MIDFIELD: return this.MIDFIELD_ZONE;
      case FieldZone.ATTACK: return this.ATTACK_ZONE;
      default: return this.DEFENSE_ZONE;
    }
  }

  getZoneFromY(y: number): FieldZone {
    if (y <= this.DEFENSE_ZONE.end) return FieldZone.DEFENSE;
    if (y <= this.MIDFIELD_ZONE.end) return FieldZone.MIDFIELD;
    return FieldZone.ATTACK;
  }

  /**
   * Returns the true Euclidean distance in metres between two grid-coordinate
   * points, accounting for the non-square real-world aspect ratio (68m × 105m).
   */
  getDistance(coord1: Coordinates, coord2: Coordinates): number {
    const dx = (coord1.x - coord2.x) * this.X_SCALE;
    const dy = (coord1.y - coord2.y) * this.Y_SCALE;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Returns true when the given coordinates are inside the opponent penalty area (y=100 end). */
  isInPenaltyArea(coords: Coordinates): boolean {
    return coords.x >= this.PENALTY_AREA.xMin &&
           coords.x <= this.PENALTY_AREA.xMax &&
           coords.y >= this.PENALTY_AREA.yMin;
  }

  /** Returns true when the given coordinates are inside the opponent six-yard box (y=100 end). */
  isInSixYardBox(coords: Coordinates): boolean {
    return coords.x >= this.SIX_YARD_BOX.xMin &&
           coords.x <= this.SIX_YARD_BOX.xMax &&
           coords.y >= this.SIX_YARD_BOX.yMin;
  }

  isInZone(coordinates: Coordinates, zone: FieldZone): boolean {
    const zoneBoundaries = this.getZoneBoundaries(zone);
    return coordinates.y >= zoneBoundaries.start && coordinates.y <= zoneBoundaries.end;
  }

  /**
   * Get all formation slots for a team's selected formation.
   * Returns an empty array if the team's selectedFormationId is invalid.
   */
  getFormationSlots(team: Team): FormationSlot[] {
    const slots = this.formationLibrary.getFormationSlots(team.selectedFormationId);
    if (!slots) {
      return [];
    }
    
    // Convert FormationSlotDefinition to FormationSlot (ensure immutability)
    return slots.map(slot => ({
      slotId: slot.slotId,
      label: slot.label,
      position: slot.preferredPosition,
      coordinates: { ...slot.coordinates },
      zone: slot.zone as FieldZone
    }));
  }

  /**
   * Get the formation schema for a team's selected formation.
   * Returns null if the selectedFormationId is invalid.
   */
  getFormation(team: Team): TeamFormation | null {
    const schema = this.formationLibrary.getFormationById(team.selectedFormationId);
    if (!schema) {
      return null;
    }

    return {
      name: schema.name,
      positions: schema.slots.map(slot => ({
        slotId: slot.slotId,
        playerId: '',
        coordinates: { ...slot.coordinates },
        zone: slot.zone as FieldZone,
        role: slot.label
      }))
    };
  }

  /**
   * Build a TeamFormation with currently assigned players for a team's selected formation.
   * Returns null if the selectedFormationId is invalid.
   */
  assignPlayersToFormation(team: Team): TeamFormation | null {
    const schema = this.formationLibrary.getFormationById(team.selectedFormationId);
    if (!schema) {
      return null;
    }

    return {
      name: schema.name,
      positions: schema.slots.map(slot => ({
        slotId: slot.slotId,
        playerId: team.formationAssignments[slot.slotId] ?? '',
        coordinates: { ...slot.coordinates },
        zone: slot.zone as FieldZone,
        role: slot.label
      }))
    };
  }

  validateFormationAssignments(team: Team, players?: Player[]): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const schema = this.formationLibrary.getFormationById(team.selectedFormationId);
    const teamPlayers = resolveTeamPlayers(team, players);
    
    // Invalid schema
    if (!schema) {
      errors.push(`Formation schema '${team.selectedFormationId}' not found`);
      return { isValid: false, errors };
    }

    const assignments = team.formationAssignments;
    const assignedPlayerIds: string[] = [];

    // Validate each slot
    for (const slot of schema.slots) {
      const playerId = assignments[slot.slotId];
      if (!playerId) {
        errors.push(`Missing assignment for ${slot.label}`);
        continue;
      }

      const player = teamPlayers.find(p => p.id === playerId);
      if (!player) {
        errors.push(`Assigned player for ${slot.label} was not found`);
        continue;
      }

      if (player.role !== Role.STARTER) {
        errors.push(`${player.name} must be a Starter to occupy ${slot.label}`);
      }

      // Check position compatibility (goalkeeper must be in goalkeeper slot)
      if (slot.preferredPosition === Position.GOALKEEPER && player.position !== Position.GOALKEEPER) {
        errors.push(`${slot.label} must be filled by a goalkeeper`);
      }

      assignedPlayerIds.push(playerId);
    }

    // Check for duplicate assignments
    const uniquePlayerIds = new Set(assignedPlayerIds);
    if (uniquePlayerIds.size !== assignedPlayerIds.length) {
      errors.push('A player is assigned to multiple formation slots');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  getAvailableFormations(): string[] {
    return this.formationLibrary.getAllFormations().map(f => f.id);
  }

  calculateTeamTactics(team: Team, seasonYear: number, players?: Player[]): TacticalSetup {
    const teamPlayers = resolveTeamPlayers(team, players);
    const formation =
      this.assignPlayersToFormation(team) ??
      this.assignPlayersToFormation({
        ...team,
        selectedFormationId: this.getOptimalFormation(team)
      }) ??
      {
        name: 'Unavailable Formation',
        positions: []
      };

    if (teamPlayers.length === 0) {
      return {
        teamId: team.id,
        formation,
        playingStyle: PlayingStyle.DEFENSIVE,
        mentality: Mentality.BALANCED,
        pressingIntensity: 50,
        defensiveLine: 50,
        tempo: 50
      };
    }
    
    // Calculate team averages for different attributes
    const validAttrs = teamPlayers.map(p => getCurrentPlayerSeasonAttributes(p, seasonYear));
    const overallAvg = validAttrs.reduce((sum, a) => sum + a.overall.value, 0) / validAttrs.length;
    const speedAvg = validAttrs.reduce((sum, a) => sum + a.speed.value, 0) / validAttrs.length;
    const passingAvg = validAttrs.reduce((sum, a) => sum + a.shortPassing.value + a.longPassing.value, 0) / (validAttrs.length * 2);
    const defendingAvg = validAttrs.reduce((sum, a) => sum + a.tackling.value, 0) / validAttrs.length;
    const attackingAvg = validAttrs.reduce((sum, a) => sum + a.shooting.value, 0) / validAttrs.length;

    // Determine playing style based on team attributes
    let playingStyle: PlayingStyle;
    let mentality: Mentality;

    if (passingAvg > 70 && speedAvg > 60) {
      playingStyle = PlayingStyle.POSSESSION;
      mentality = Mentality.ATTACKING;
    } else if (speedAvg > 70 && attackingAvg > 65) {
      playingStyle = PlayingStyle.COUNTER_ATTACK;
      mentality = Mentality.BALANCED;
    } else if (defendingAvg > 70 && overallAvg > 65) {
      playingStyle = PlayingStyle.PRESSING;
      mentality = Mentality.ATTACKING;
    } else {
      playingStyle = PlayingStyle.DEFENSIVE;
      mentality = Mentality.DEFENSIVE;
    }

    return {
      teamId: team.id,
      formation,
      playingStyle,
      mentality,
      pressingIntensity: Math.floor(defendingAvg),
      defensiveLine: mentality === Mentality.ATTACKING ? 70 : mentality === Mentality.DEFENSIVE ? 30 : 50,
      tempo: Math.floor((speedAvg + passingAvg) / 2)
    };
  }

  getOptimalFormation(_team: Team): string {
    return this.formationLibrary.getDefaultFormationId();
  }

  getStartingPositionForPlayer(player: Player, formation: TeamFormation): Coordinates {
    const position = formation.positions.find(pos => pos.playerId === player.id);
    return position ? position.coordinates : { x: 50, y: 50 }; // Default center if not found
  }

  getZonePressureMultiplier(zone: FieldZone, playingStyle: PlayingStyle): number {
    switch (playingStyle) {
      case PlayingStyle.PRESSING:
        return zone === FieldZone.DEFENSE ? 1.3 : zone === FieldZone.MIDFIELD ? 1.1 : 0.8;
      case PlayingStyle.POSSESSION:
        return zone === FieldZone.ATTACK ? 1.2 : zone === FieldZone.MIDFIELD ? 1.0 : 0.9;
      case PlayingStyle.COUNTER_ATTACK:
        return zone === FieldZone.DEFENSE ? 0.8 : zone === FieldZone.ATTACK ? 1.3 : 1.0;
      default:
        return 1.0;
    }
  }
}