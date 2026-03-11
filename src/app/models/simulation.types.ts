export interface Coordinates {
  x: number; // 0-100 (width)
  y: number; // 0-100 (length)
}

export type FieldZone = 'DEFENSE' | 'MIDFIELD' | 'ATTACK';

export interface PlayerPosition {
  playerId: string;
  coordinates: Coordinates;
  zone: FieldZone;
  role: string;
}

export interface TeamFormation {
  name: string;
  positions: PlayerPosition[];
}

export interface Possession {
  teamId: string;
  playerWithBall: string;
  location: Coordinates;
  phase: 'BUILD_UP' | 'ATTACKING' | 'DEFENDING' | 'COUNTER_ATTACK';
  passes: number;
  timeElapsed: number;
}

export interface PlayByPlayEvent {
  id: string;
  type: 'PASS' | 'SHOT' | 'TACKLE' | 'INTERCEPTION' | 'SAVE' | 'MISS' | 'GOAL' | 'CORNER' | 'FREE_KICK' | 'PENALTY' | 'SUBSTITUTION' | 'INJURY' | 'YELLOW_CARD' | 'RED_CARD' | 'FOUL';
  description: string;
  playerIds: string[];
  location: Coordinates;
  time: number; // minutes
  success: boolean;
  additionalData?: any;
}

export interface MatchState {
  ballPossession: Possession;
  events: PlayByPlayEvent[];
  currentMinute: number;
  homeScore: number;
  awayScore: number;
  homeShots: number;
  awayShots: number;
  homeShotsOnTarget: number;
  awayShotsOnTarget: number;
  homePossession: number;
  awayPossession: number;
  homeCorners: number;
  awayCorners: number;
  homeFouls: number;
  awayFouls: number;
  homeYellowCards: number;
  awayYellowCards: number;
  homeRedCards: number;
  awayRedCards: number;
}

export interface SimulationConfig {
  enablePlayByPlay: boolean;
  enableSpatialTracking: boolean;
  enableTactics: boolean;
  enableFatigue: boolean;
  commentaryStyle: 'DETAILED' | 'BRIEF' | 'STATS_ONLY';
}

export interface TacticalSetup {
  teamId: string;
  formation: TeamFormation;
  playingStyle: 'POSSESSION' | 'COUNTER_ATTACK' | 'PRESSING' | 'DEFENSIVE';
  mentality: 'ATTACKING' | 'BALANCED' | 'DEFENSIVE';
  pressingIntensity: number; // 1-100
  defensiveLine: number; // 1-100 (how high the defensive line is)
  tempo: number; // 1-100
}

export interface PlayerFatigue {
  playerId: string;
  currentStamina: number; // 0-100
  fatigueLevel: number; // 0-100
  performanceModifier: number; // 0.5-1.0
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