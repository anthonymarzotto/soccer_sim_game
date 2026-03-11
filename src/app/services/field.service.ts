import { Injectable } from '@angular/core';
import { Coordinates, FieldZone, PlayerPosition, TeamFormation, TacticalSetup } from '../models/simulation.types';
import { Team, Player, Position } from '../models/types';

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
        { role: 'Goalkeeper', x: 50, y: 10, zone: 'DEFENSE' },
        // Defenders
        { role: 'Defense', x: 25, y: 25, zone: 'DEFENSE' },
        { role: 'Defense', x: 45, y: 25, zone: 'DEFENSE' },
        { role: 'Defense', x: 55, y: 25, zone: 'DEFENSE' },
        { role: 'Defense', x: 75, y: 25, zone: 'DEFENSE' },
        // Midfielders
        { role: 'Midfield', x: 35, y: 45, zone: 'MIDFIELD' },
        { role: 'Midfield', x: 45, y: 45, zone: 'MIDFIELD' },
        { role: 'Midfield', x: 55, y: 45, zone: 'MIDFIELD' },
        { role: 'Midfield', x: 65, y: 45, zone: 'MIDFIELD' },
        // Forwards
        { role: 'Attack', x: 45, y: 75, zone: 'ATTACK' },
        { role: 'Attack', x: 55, y: 75, zone: 'ATTACK' }
      ]
    },
    '4-3-3': {
      name: '4-3-3',
      positions: [
        // Goalkeeper
        { role: 'Goalkeeper', x: 50, y: 10, zone: 'DEFENSE' },
        // Defenders
        { role: 'Defense', x: 25, y: 25, zone: 'DEFENSE' },
        { role: 'Defense', x: 45, y: 25, zone: 'DEFENSE' },
        { role: 'Defense', x: 55, y: 25, zone: 'DEFENSE' },
        { role: 'Defense', x: 75, y: 25, zone: 'DEFENSE' },
        // Midfielders
        { role: 'Midfield', x: 40, y: 45, zone: 'MIDFIELD' },
        { role: 'Midfield', x: 50, y: 45, zone: 'MIDFIELD' },
        { role: 'Midfield', x: 60, y: 45, zone: 'MIDFIELD' },
        // Forwards
        { role: 'Attack', x: 30, y: 75, zone: 'ATTACK' },
        { role: 'Attack', x: 50, y: 75, zone: 'ATTACK' },
        { role: 'Attack', x: 70, y: 75, zone: 'ATTACK' }
      ]
    },
    '3-5-2': {
      name: '3-5-2',
      positions: [
        // Goalkeeper
        { role: 'Goalkeeper', x: 50, y: 10, zone: 'DEFENSE' },
        // Defenders
        { role: 'Defense', x: 35, y: 25, zone: 'DEFENSE' },
        { role: 'Defense', x: 50, y: 25, zone: 'DEFENSE' },
        { role: 'Defense', x: 65, y: 25, zone: 'DEFENSE' },
        // Midfielders
        { role: 'Midfield', x: 25, y: 45, zone: 'MIDFIELD' },
        { role: 'Midfield', x: 40, y: 45, zone: 'MIDFIELD' },
        { role: 'Midfield', x: 50, y: 45, zone: 'MIDFIELD' },
        { role: 'Midfield', x: 60, y: 45, zone: 'MIDFIELD' },
        { role: 'Midfield', x: 75, y: 45, zone: 'MIDFIELD' },
        // Forwards
        { role: 'Attack', x: 45, y: 75, zone: 'ATTACK' },
        { role: 'Attack', x: 55, y: 75, zone: 'ATTACK' }
      ]
    },
    '5-3-2': {
      name: '5-3-2',
      positions: [
        // Goalkeeper
        { role: 'Goalkeeper', x: 50, y: 10, zone: 'DEFENSE' },
        // Defenders
        { role: 'Defense', x: 20, y: 25, zone: 'DEFENSE' },
        { role: 'Defense', x: 35, y: 25, zone: 'DEFENSE' },
        { role: 'Defense', x: 50, y: 25, zone: 'DEFENSE' },
        { role: 'Defense', x: 65, y: 25, zone: 'DEFENSE' },
        { role: 'Defense', x: 80, y: 25, zone: 'DEFENSE' },
        // Midfielders
        { role: 'Midfield', x: 40, y: 45, zone: 'MIDFIELD' },
        { role: 'Midfield', x: 50, y: 45, zone: 'MIDFIELD' },
        { role: 'Midfield', x: 60, y: 45, zone: 'MIDFIELD' },
        // Forwards
        { role: 'Attack', x: 45, y: 75, zone: 'ATTACK' },
        { role: 'Attack', x: 55, y: 75, zone: 'ATTACK' }
      ]
    }
  };

  getZoneFromY(y: number): FieldZone {
    if (y <= this.DEFENSE_ZONE.end) return 'DEFENSE';
    if (y <= this.MIDFIELD_ZONE.end) return 'MIDFIELD';
    return 'ATTACK';
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
      case 'DEFENSE': return this.DEFENSE_ZONE;
      case 'MIDFIELD': return this.MIDFIELD_ZONE;
      case 'ATTACK': return this.ATTACK_ZONE;
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
      'Goalkeeper': team.players.filter(p => p.role === 'Goalkeeper'),
      'Defense': team.players.filter(p => p.role === 'Defense'),
      'Midfield': team.players.filter(p => p.role === 'Midfield'),
      'Attack': team.players.filter(p => p.role === 'Attack')
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
    let playingStyle: 'POSSESSION' | 'COUNTER_ATTACK' | 'PRESSING' | 'DEFENSIVE';
    let mentality: 'ATTACKING' | 'BALANCED' | 'DEFENSIVE';

    if (passingAvg > 70 && speedAvg > 60) {
      playingStyle = 'POSSESSION';
      mentality = 'ATTACKING';
    } else if (speedAvg > 70 && attackingAvg > 65) {
      playingStyle = 'COUNTER_ATTACK';
      mentality = 'BALANCED';
    } else if (defendingAvg > 70 && overallAvg > 65) {
      playingStyle = 'PRESSING';
      mentality = 'ATTACKING';
    } else {
      playingStyle = 'DEFENSIVE';
      mentality = 'DEFENSIVE';
    }

    return {
      teamId: team.id,
      formation: formation!,
      playingStyle,
      mentality,
      pressingIntensity: Math.floor(defendingAvg),
      defensiveLine: mentality === 'ATTACKING' ? 70 : mentality === 'DEFENSIVE' ? 30 : 50,
      tempo: Math.floor((speedAvg + passingAvg) / 2)
    };
  }

  getOptimalFormation(team: Team): string {
    const overallAvg = team.players.reduce((sum, p) => sum + p.overall, 0) / team.players.length;
    const attackingPlayers = team.players.filter(p => p.role === 'Attack').length;
    const midfielders = team.players.filter(p => p.role === 'Midfield').length;
    const defenders = team.players.filter(p => p.role === 'Defense').length;

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

  getZonePressureMultiplier(zone: FieldZone, playingStyle: string): number {
    switch (playingStyle) {
      case 'PRESSING':
        return zone === 'DEFENSE' ? 1.3 : zone === 'MIDFIELD' ? 1.1 : 0.8;
      case 'POSSESSION':
        return zone === 'ATTACK' ? 1.2 : zone === 'MIDFIELD' ? 1.0 : 0.9;
      case 'COUNTER_ATTACK':
        return zone === 'DEFENSE' ? 0.8 : zone === 'ATTACK' ? 1.3 : 1.0;
      default:
        return 1.0;
    }
  }
}