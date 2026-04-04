export interface Coordinates {
  x: number; // 0-100 (width)
  y: number; // 0-100 (length)
}

import { FieldZone, EventType, CommentaryStyle, PlayingStyle, Mentality, MatchPhase, Position } from './enums';
// Re-export the enums for backward compatibility
export { FieldZone, EventType, CommentaryStyle, PlayingStyle, Mentality, MatchPhase };

export interface PlayerPosition {
  slotId: string;
  playerId: string;
  coordinates: Coordinates;
  zone: FieldZone;
  role: string;
}

export interface FormationSlot {
  slotId: string;
  label: string;
  position: Position;
  coordinates: Coordinates;
  zone: FieldZone;
}

export interface TeamFormation {
  name: string;
  positions: PlayerPosition[];
}

export interface Possession {
  teamId: string;
  playerWithBall: string;
  location: Coordinates;
  phase: MatchPhase;
  passes: number;
  timeElapsed: number;
}

export interface PlayByPlayEvent {
  id: string;
  type: EventType;
  description: string;
  playerIds: string[];
  location: Coordinates;
  time: number; // minutes
  success: boolean;
  additionalData?: Record<string, unknown>;
}

export interface ReplayKeyframe {
  timestampMs: number;
  ballLocation: Coordinates;
}

export interface VariantBReplayMetadata {
  actorPlayerId: string;
  actionType: EventType;
  durationMs: number;
  keyframes: ReplayKeyframe[];
}

export interface VariantBTuningConfig {
  baseTickMin: number;
  baseTickMax: number;
  midfieldTickMin: number;
  midfieldTickMax: number;
  attackTickMin: number;
  attackTickMax: number;
  lateCloseBoostTicks: number;

  movementStepBase: number;
  movementStepRandom: number;
  lateUrgencyMultiplier: number;

  passWeightBase: number;
  shotWeightBase: number;
  foulWeightBase: number;
  outOfWindowShotMultiplier: number;

  onTargetBase: number;
  onTargetSkillScale: number;
  onTargetWidePenalty: number;
  onTargetFatiguePenalty: number;
  onTargetMin: number;
  onTargetMax: number;

  goalChanceBase: number;
  goalChanceSkillVsKeeperScale: number;
  goalChanceWidePenalty: number;
  goalChanceMin: number;
  goalChanceMax: number;

  homeAdvantageGoalBonus: number;
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

export type SimulationVariant = 'B';

export interface SimulationConfig {
  enablePlayByPlay: boolean;
  enableSpatialTracking: boolean;
  enableTactics: boolean;
  enableFatigue: boolean;
  commentaryStyle: CommentaryStyle;
  simulationVariant?: SimulationVariant;
  seed?: string;
  skipCommentary?: boolean;
  variantBTuning?: Partial<VariantBTuningConfig>;
}

export interface TacticalSetup {
  teamId: string;
  formation: TeamFormation;
  playingStyle: PlayingStyle;
  mentality: Mentality;
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