import { Position, Role, MatchResult, EventImportance, EventType, PlayingStyle } from './enums';
import { Coordinates, PlayByPlayEventAdditionalData } from './simulation.types';

// Re-export the enums for backward compatibility
export { Position, Role, MatchResult, EventImportance };

export interface PlayerPersonal {
  height: number; // cm
  weight: number; // kg
  birthday: Date;
  nationality: string;
}

export type StatCategory = 'physical' | 'mental' | 'skill' | 'goalkeeping' | 'misc';

export type StatKey =
  | 'speed' | 'strength' | 'endurance'
  | 'flair' | 'vision' | 'determination'
  | 'tackling' | 'shooting' | 'heading'
  | 'longPassing' | 'shortPassing'
  | 'clutch' | 'composure' | 'morale' | 'consistency' | 'aggressiveness'
  | 'fitness'
  | 'handling' | 'reflexes' | 'commandOfArea'
  | 'luck' | 'injuryRate'
  | 'overall';

export interface Stat {
  value: number;
  type: StatCategory;
  description?: string;
  hidden: boolean;
}

export interface PlayerSeasonAttributes {
  seasonYear: number;
  // physical
  speed: Stat;
  strength: Stat;
  endurance: Stat;
  // mental
  flair: Stat;
  vision: Stat;
  determination: Stat;
  // skill
  tackling: Stat;
  shooting: Stat;
  heading: Stat;
  longPassing: Stat;
  shortPassing: Stat;
  // goalkeeping
  handling: Stat;
  reflexes: Stat;
  commandOfArea: Stat;
  // hidden mental
  clutch: Stat;
  composure: Stat;
  morale: Stat;
  consistency: Stat;
  aggressiveness: Stat;
  // hidden physical
  fitness: Stat;
  // misc
  luck: Stat;
  injuryRate: Stat;
  overall: Stat;
}

export interface Player {
  id: string;
  name: string;
  teamId: string;
  position: Position;
  role: Role;
  personal: PlayerPersonal;
  seasonAttributes: PlayerSeasonAttributes[];
  careerStats: PlayerCareerStats[];
  mood: number;
  fatigue: number;
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
