import { Position, Role, MatchResult, EventImportance, EventType } from './enums';

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
}

export interface PlayerMental {
  flair: number;
  vision: number;
  determination: number;
}

export interface PlayerHidden {
  luck: number;
}

export interface PlayerSkills {
  tackling: number;
  shooting: number;
  heading: number;
  longPassing: number;
  shortPassing: number;
  goalkeeping: number;
}

export interface Player {
  id: string;
  name: string;
  teamId: string;
  position: Position;
  role: Role;
  personal: PlayerPersonal;
  physical: PlayerPhysical;
  mental: PlayerMental;
  skills: PlayerSkills;
  hidden: PlayerHidden;
  overall: number;
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

export interface Team {
  id: string;
  name: string;
  players: Player[];
  stats: TeamStats;
}

export interface Match {
  id: string;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore?: number;
  awayScore?: number;
  played: boolean;
  keyEvents?: KeyEvent[];
  matchStats?: MatchStatistics;
  matchReport?: MatchReport;
}

export interface KeyEvent {
  id: string;
  type: string;
  description: string;
  playerIds: string[];
  time: number;
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
  keyMoments: KeyMoment[];
  tacticalAnalysis: TacticalAnalysis;
  playerPerformances: PlayerAnalysis;
  matchSummary: string;
}

export type KeyEventType =
  | EventType.GOAL
  | EventType.RED_CARD
  | EventType.PENALTY
  | EventType.CORNER
  | EventType.YELLOW_CARD
  | EventType.SUBSTITUTION;

export interface KeyMoment {
  time: number;
  type: KeyEventType;
  description: string;
  playerIds: string[];
  location?: any;
}

export interface TacticalAnalysis {
  homeTeam: {
    possession: number;
    shots: number;
    corners: number;
    fouls: number;
    style: string;
    effectiveness: number;
  };
  awayTeam: {
    possession: number;
    shots: number;
    corners: number;
    fouls: number;
    style: string;
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
  position: string;
  rating: number;
  goals: number;
  assists: number;
  shots: number;
  passes: number;
  tackles: number;
  saves: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
}

export interface League {
  teams: Team[];
  schedule: Match[];
  currentWeek: number;
  userTeamId?: string;
}
