import { Injectable } from '@angular/core';
import { Coordinates, FieldZone, PlayerPosition, TeamFormation, TacticalSetup } from '../models/simulation.types';
import { Team, Player, Position } from '../models/types';
import { PlayingStyle, Mentality, Role } from '../models/enums';

@Injectable({
  providedIn: 'root'
})
export class FieldService {
  
  // Field dimensions (0-100 scale)
  private readonly FIELD_WIDTH = 100;
  private readonly FIELD_LENGTH = 100;
  
  // Zone boundaries
  private readonly DEFENSE_ZONE = { start: 0, end: 33 };
  private readonly MIDFIELD_ZONE = { start: 34, end: 66 };
  private readonly ATTACK_ZONE = { start: 67, end: 100 };

  // Default formations
  private readonly FORMATIONS = {
    '4-4-2': {
      name: '4-4-2',
      positions: [
        // Goalkeeper
        { role: Role.GOALKEEPER, x: 50, y: 10, zone: FieldZone.DEFENSE },
        // Defenders
        { role: Role.DEFENSE, x: 25, y: 25, zone: FieldZone.DEFENSE },
        { role: Role.DEFENSE, x: 45, y: 25, zone: FieldZone.DEFENSE },
        { role: Role.DEFENSE, x: 55, y: 25, zone: FieldZone.DEFENSE },
        { role: Role.DEFENSE, x: 75, y: 25, zone: FieldZone.DEFENSE },
        // Midfielders
        { role: Role.MIDFIELD, x: 35, y: 45, zone: FieldZone.MIDFIELD },
        { role: Role.MIDFIELD, x: 45, y: 45, zone: FieldZone.MIDFIELD },
        { role: Role.MIDFIELD, x: 55, y: 45, zone: FieldZone.MIDFIELD },
        { role: Role.MIDFIELD, x: 65, y: 45, zone: FieldZone.MIDFIELD },
        // Forwards
        { role: Role.ATTACK, x: 45, y: 75, zone: FieldZone.ATTACK },
        { role: Role.ATTACK, x: 55, y: 75, zone: FieldZone.ATTACK }
      ]
    },
    '4-3-3': {
      name: '4-3-3',
      positions: [
        // Goalkeeper
        { role: Role.GOALKEEPER, x: 50, y: 10, zone: FieldZone.DEFENSE },
        // Defenders
        { role: Role.DEFENSE, x: 25, y: 25, zone: FieldZone.DEFENSE },
        { role: Role.DEFENSE, x: 45, y: 25, zone: FieldZone.DEFENSE },
        { role: Role.DEFENSE, x: 55, y: 25, zone: FieldZone.DEFENSE },
        { role: Role.DEFENSE, x: 75, y: 25, zone: FieldZone.DEFENSE },
        // Midfielders
        { role: Role.MIDFIELD, x: 40, y: 45, zone: FieldZone.MIDFIELD },
        { role: Role.MIDFIELD, x: 50, y: 45, zone: FieldZone.MIDFIELD },
        { role: Role.MIDFIELD, x: 60, y: 45, zone: FieldZone.MIDFIELD },
        // Forwards
        { role: Role.ATTACK, x: 30, y: 75, zone: FieldZone.ATTACK },
        { role: Role.ATTACK, x: 50, y: 75, zone: FieldZone.ATTACK },
        { role: Role.ATTACK, x: 70, y: 75, zone: FieldZone.ATTACK }
      ]
    },
    '3-5-2': {
      name: '3-5-2',
      positions: [
        // Goalkeeper
        { role: Role.GOALKEEPER, x: 50, y: 10, zone: FieldZone.DEFENSE },
        // Defenders
        { role: Role.DEFENSE, x: 35, y: 25, zone: FieldZone.DEFENSE },
        { role: Role.DEFENSE, x: 50, y: 25, zone: FieldZone.DEFENSE },
        { role: Role.DEFENSE, x: 65, y: 25, zone: FieldZone.DEFENSE },
        // Midfielders
        { role: Role.MIDFIELD, x: 25, y: 45, zone: FieldZone.MIDFIELD },
        { role: Role.MIDFIELD, x: 40, y: 45, zone: FieldZone.MIDFIELD },
        { role: Role.MIDFIELD, x: 50, y: 45, zone: FieldZone.MIDFIELD },
        { role: Role.MIDFIELD, x: 60, y: 45, zone: FieldZone.MIDFIELD },
        { role: Role.MIDFIELD, x: 75, y: 45, zone: FieldZone.MIDFIELD },
        // Forwards
        { role: Role.ATTACK, x: 45, y: 75, zone: FieldZone.ATTACK },
        { role: Role.ATTACK, x: 55, y: 75, zone: FieldZone.ATTACK }
      ]
    },
    '5-3-2': {
      name: '5-3-2',
      positions: [
        // Goalkeeper
        { role: Role.GOALKEEPER, x: 50, y: 10, zone: FieldZone.DEFENSE },
        // Defenders
        { role: Role.DEFENSE, x: 20, y: 25, zone: FieldZone.DEFENSE },
        { role: Role.DEFENSE, x: 35, y: 25, zone: FieldZone.DEFENSE },
        { role: Role.DEFENSE, x: 50, y: 25, zone: FieldZone.DEFENSE },
        { role: Role.DEFENSE, x: 65, y: 25, zone: FieldZone.DEFENSE },
        { role: Role.DEFENSE, x: 80, y: 25, zone: FieldZone.DEFENSE },
        // Midfielders
        { role: Role.MIDFIELD, x: 40, y: 45, zone: FieldZone.MIDFIELD },
        { role: Role.MIDFIELD, x: 50, y: 45, zone: FieldZone.MIDFIELD },
        { role: Role.MIDFIELD, x: 60, y: 45, zone: FieldZone.MIDFIELD },
        // Forwards
        { role: Role.ATTACK, x: 45, y: 75, zone: FieldZone.ATTACK },
        { role: Role.ATTACK, x: 55, y: 75, zone: FieldZone.ATTACK }
      ]
    }
  };

  getZoneFromY(y: number): FieldZone {
    if (y <= this.DEFENSE_ZONE.end) return FieldZone.DEFENSE;
    if (y <= this.MIDFIELD_ZONE.end) return FieldZone.MIDFIELD;
    return FieldZone.ATTACK;
  }

  getDistance(coord1: Coordinates, coord2: Coordinates): number {
    const dx = coord1.x - coord2.x;
    const dy = coord1.y - coord2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  isInZone(coordinates: Coordinates, zone: FieldZone): boolean {
    const zoneBoundaries = this.getZoneBoundaries(zone);
    return coordinates.y >= zoneBoundaries.start && coordinates.y <= zoneBoundaries.end;
  }

  getZoneBoundaries(zone: FieldZone): { start: number; end: number } {
    switch (zone) {
      case FieldZone.DEFENSE: return this.DEFENSE_ZONE;
      case FieldZone.MIDFIELD: return this.MIDFIELD_ZONE;
      case FieldZone.ATTACK: return this.ATTACK_ZONE;
      default: return this.DEFENSE_ZONE;
    }
  }

  getFormation(name: string): TeamFormation | null {
    const baseFormation = this.FORMATIONS[name as keyof typeof this.FORMATIONS];
    if (!baseFormation) return null;

    return {
      name: baseFormation.name,
      positions: baseFormation.positions.map(pos => ({
        playerId: '',
        coordinates: { x: pos.x, y: pos.y },
        zone: pos.zone as FieldZone,
        role: pos.role
      }))
    };
  }

  assignPlayersToFormation(team: Team, formationName: string): TeamFormation | null {
    const formation = this.getFormation(formationName);
    if (!formation) return null;

    const playersByRole = {
      [Role.GOALKEEPER]: team.players.filter(p => p.role === Role.GOALKEEPER),
      [Role.DEFENSE]: team.players.filter(p => p.role === Role.DEFENSE),
      [Role.MIDFIELD]: team.players.filter(p => p.role === Role.MIDFIELD),
      [Role.ATTACK]: team.players.filter(p => p.role === Role.ATTACK)
    };

    // Sort players by overall rating within each role
    Object.keys(playersByRole).forEach(role => {
      playersByRole[role as keyof typeof playersByRole].sort((a, b) => b.overall - a.overall);
    });

    // Assign players to positions based on role and overall rating
    const assignedFormation: TeamFormation = {
      name: formation.name,
      positions: formation.positions.map((pos, index) => {
        let assignedPlayer: Player | undefined;
        
        // Find the best available player for this role
        const availablePlayers = playersByRole[pos.role as keyof typeof playersByRole];
        if (availablePlayers && availablePlayers.length > 0) {
          assignedPlayer = availablePlayers.shift();
        }

        return {
          playerId: assignedPlayer?.id || '',
          coordinates: pos.coordinates,
          zone: pos.zone,
          role: pos.role
        };
      })
    };

    return assignedFormation;
  }

  getAvailableFormations(): string[] {
    return Object.keys(this.FORMATIONS);
  }

  calculateTeamTactics(team: Team, formationName: string): TacticalSetup {
    const formation = this.assignPlayersToFormation(team, formationName);
    
    // Calculate team averages for different attributes
    const overallAvg = team.players.reduce((sum, p) => sum + p.overall, 0) / team.players.length;
    const speedAvg = team.players.reduce((sum, p) => sum + p.physical.speed, 0) / team.players.length;
    const passingAvg = team.players.reduce((sum, p) => sum + p.skills.shortPassing + p.skills.longPassing, 0) / (team.players.length * 2);
    const defendingAvg = team.players.reduce((sum, p) => sum + p.skills.tackling, 0) / team.players.length;
    const attackingAvg = team.players.reduce((sum, p) => sum + p.skills.shooting, 0) / team.players.length;

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
      formation: formation!,
      playingStyle,
      mentality,
      pressingIntensity: Math.floor(defendingAvg),
      defensiveLine: mentality === Mentality.ATTACKING ? 70 : mentality === Mentality.DEFENSIVE ? 30 : 50,
      tempo: Math.floor((speedAvg + passingAvg) / 2)
    };
  }

  getOptimalFormation(team: Team): string {
    const overallAvg = team.players.reduce((sum, p) => sum + p.overall, 0) / team.players.length;
    const attackingPlayers = team.players.filter(p => p.role === Role.ATTACK).length;
    const midfielders = team.players.filter(p => p.role === Role.MIDFIELD).length;
    const defenders = team.players.filter(p => p.role === Role.DEFENSE).length;

    // Simple heuristic for optimal formation
    if (attackingPlayers >= 2 && midfielders >= 4 && defenders >= 4) {
      return '4-4-2';
    } else if (attackingPlayers >= 3 && midfielders >= 3 && defenders >= 4) {
      return '4-3-3';
    } else if (attackingPlayers >= 2 && midfielders >= 5 && defenders >= 3) {
      return '3-5-2';
    } else {
      return '4-4-2'; // Default
    }
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