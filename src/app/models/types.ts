import { Position, Role, MatchResult, EventImportance, EventType, PlayingStyle } from './enums';
import { Coordinates, PlayByPlayEventAdditionalData } from './simulation.types';

// Re-export the enums for backward compatibility
export { Position, Role, MatchResult, EventImportance };

export interface PlayerPersonal {
  height: number; // cm
  weight: number; // kg
  age: number;
  nationality: string;
}

export interface PlayerPhysical {
  speed: number;
  strength: number;
  endurance: number;
}

export interface PlayerMental {
  flair: number;
  vision: number;
  determination: number;
}

export interface PlayerHidden {
  luck: number;
  injuryRate: number;
}

export interface PlayerSkills {
  tackling: number;
  shooting: number;
  heading: number;
  longPassing: number;
  shortPassing: number;
  goalkeeping: number;
}

export interface PlayerSeasonAttributes {
  seasonYear: number;
  physical: PlayerPhysical;
  mental: PlayerMental;
  hidden: PlayerHidden;
  skills: PlayerSkills;
  overall: number;
}

export interface Player {
  id: string;
  name: string;
  teamId: string;
  position: Position;
  role: Role;
  personal: PlayerPersonal;
  // Legacy flat attributes remain for incremental migration and should not be treated as authoritative.
  physical: PlayerPhysical;
  mental: PlayerMental;
  skills: PlayerSkills;
  hidden: PlayerHidden;
  overall: number;
  seasonAttributes?: PlayerSeasonAttributes[];
  careerStats: PlayerCareerStats[];
}

export interface PlayerCareerStats {
  seasonYear: number;
  teamId: string;
  matchesPlayed: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  shots: number;
  shotsOnTarget: number;
  tackles: number;
  interceptions: number;
  passes: number;
  saves: number;
  cleanSheets: number;
  minutesPlayed: number;
  fouls: number;
  foulsSuffered: number;
}

export interface TeamStats {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  last5: MatchResult[];
}

export interface TeamSeasonSnapshot {
  seasonYear: number;
  playerIds: string[];
  stats: TeamStats;
}

export interface Team {
  id: string;
  name: string;
  players: Player[];
  // Legacy root fields remain for incremental migration and should not be treated as authoritative.
  playerIds: string[]; // Canonical player identity order for normalized persistence and roster resolution.
  stats: TeamStats;
  selectedFormationId: string;  // References a formation schema ID from FormationLibraryService
  formationAssignments: Record<string, string>;  // slotId -> playerId mapping, validated against selectedFormation
  seasonSnapshots?: TeamSeasonSnapshot[];
}

export interface Match {
  id: string;
  seasonYear?: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore?: number;
  awayScore?: number;
  played: boolean;
  keyEvents?: MatchEvent[];
  matchStats?: MatchStatistics;
  matchReport?: MatchReport;
}

export interface MatchEvent {
  id: string;
  time: number;
  type: EventType;
  description: string;
  playerIds: string[];
  location?: Coordinates;
  additionalData?: PlayByPlayEventAdditionalData;
  icon?: string;
  importance: EventImportance;
}

export interface MatchStatistics {
  possession: { home: number; away: number };
  shots: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  corners: { home: number; away: number };
  fouls: { home: number; away: number };
  cards: { 
    home: { yellow: number; red: number }; 
    away: { yellow: number; red: number } 
  };
  passes: { home: number; away: number };
  tackles: { home: number; away: number };
  saves: { home: number; away: number };
}

export interface MatchReport {
  matchId: string;
  finalScore: string;
  keyMoments: MatchEvent[];
  tacticalAnalysis: TacticalAnalysis;
  playerPerformances: PlayerAnalysis;
  matchSummary: string;
}

export interface TacticalAnalysis {
  homeTeam: {
    possession: number;
    shots: number;
    corners: number;
    fouls: number;
    style: PlayingStyle;
    effectiveness: number;
  };
  awayTeam: {
    possession: number;
    shots: number;
    corners: number;
    fouls: number;
    style: PlayingStyle;
    effectiveness: number;
  };
  tacticalBattle: string;
}

export interface PlayerAnalysis {
  homeTeam: {
    mvp: PlayerStatistics;
    topPerformers: PlayerStatistics[];
    strugglers: PlayerStatistics[];
    averageRating: number;
  };
  awayTeam: {
    mvp: PlayerStatistics;
    topPerformers: PlayerStatistics[];
    strugglers: PlayerStatistics[];
    averageRating: number;
  };
}

export interface PlayerStatistics {
  playerId: string;
  playerName: string;
  position: Position;
  rating: number;
  minutesPlayed: number;
  passes: number;
  passesSuccessful: number;
  shots: number;
  shotsOnTarget: number;
  goals: number;
  assists: number;
  tackles: number;
  tacklesSuccessful: number;
  interceptions: number;
  saves: number;
  fouls: number;
  foulsSuffered: number;
  yellowCards: number;
  redCards: number;
}

export interface League {
  teams: Team[];
  schedule: Match[];
  currentWeek: number;
  currentSeasonYear: number;
  userTeamId?: string;
}
