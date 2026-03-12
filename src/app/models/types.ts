import { Position, Role, MatchResult } from './enums';

// Re-export the enums for backward compatibility
export { Position, Role, MatchResult };

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
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  week: number;
  played: boolean;
}

export interface League {
  teams: Team[];
  schedule: Match[];
  currentWeek: number;
  userTeamId?: string;
}
