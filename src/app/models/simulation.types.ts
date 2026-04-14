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

export interface VariantBShapeSlotSnapshot {
  slotId: string;
  playerId: string | null;
  coordinates: Coordinates;
  zone: FieldZone;
  role: string;
}

export interface VariantBMatchShapeSnapshot {
  home: VariantBShapeSlotSnapshot[];
  away: VariantBShapeSlotSnapshot[];
}

export type CardReason = 'DIRECT_RED' | 'SECOND_YELLOW';

export type PassIntentMetadata = 'RECYCLE' | 'PROGRESSION' | 'THROUGH_BALL' | 'CROSS';

export type PassFailureMetadata = 'TACKLED' | 'LANE_CUT_OUT' | 'OVERHIT';

export type CarryResultMetadata = 'DISPOSSESSED';

export interface PlayByPlayEventAdditionalData {
  variantBReplay?: VariantBReplayMetadata;
  formationSnapshot?: VariantBMatchShapeSnapshot;
  cardReason?: CardReason;
  passIntent?: PassIntentMetadata;
  passFailure?: PassFailureMetadata;
  carryResult?: CarryResultMetadata;
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
  additionalData?: PlayByPlayEventAdditionalData;
}

export interface PlayerFatigueSnapshot {
  playerId: string;
  stamina: number;
}

export interface MinuteFatigueSnapshot {
  minute: number;
  players: PlayerFatigueSnapshot[];
}

export type MatchFatigueTimeline = MinuteFatigueSnapshot[];

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
  carryWeightBase: number;
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
  fatigueTimeline: MatchFatigueTimeline;
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