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
  runProgress?: number;
}

export interface VariantBMatchShapeSnapshot {
  home: VariantBShapeSlotSnapshot[];
  away: VariantBShapeSlotSnapshot[];
}

export type CardReason = 'SECOND_YELLOW' | 'DOGSO' | 'SERIOUS_FOUL' | 'SPITTING';

export type PassIntentMetadata = 'RECYCLE' | 'PROGRESSION' | 'THROUGH_BALL' | 'CROSS';

export type PassFailureMetadata = 'TACKLED' | 'LANE_CUT_OUT' | 'OVERHIT' | 'RECOVERY';

export type CarryResultMetadata = 'DISPOSSESSED' | 'SCRAMBLE_RECOVERED' | 'SCRAMBLE_LOST';

export interface InjuryEventMetadata {
  definitionId: string;
  totalWeeks: number;
  weeksRemaining: number;
}

export interface PlayByPlayEventAdditionalData {
  variantBReplay?: VariantBReplayMetadata;
  formationSnapshot?: VariantBMatchShapeSnapshot;
  cardReason?: CardReason;
  passIntent?: PassIntentMetadata;
  passFailure?: PassFailureMetadata;
  carryResult?: CarryResultMetadata;
  injury?: InjuryEventMetadata;
  isCorner?: boolean;
  isFreeKick?: boolean;
  isPenalty?: boolean;
  freeKickDirect?: boolean;
  aerialWinner?: string;
  aerialLoser?: string;
  isOffside?: boolean;
  offsidePlayerId?: string;
  targetPlayerId?: string;
  playerWithBall?: string;
  recoveredByTeam?: 'Home' | 'Away';
  scrambleWinnerId?: string;
  scrambleWinnerName?: string;
  scrambleDecisions?: ScrambleCandidateDecision[];
  tackleDecisions?: TackleCandidateDecision[];
  interceptionDecisions?: TackleCandidateDecision[];
  xg?: number;
}

export interface ScrambleCandidateDecision {
  playerId: string;
  playerName: string;
  teamSide: 'Home' | 'Away';
  distance: number;
  score: number;
  probability: number;
}

export interface TackleCandidateDecision {
  playerId: string;
  playerName: string;
  distance: number;
  score: number;
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
  fatigue: number;
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
  cardChanceBase: number;
  directRedChance: number;
  secondYellowChanceMultiplier: number;
  penaltyFoulRateMultiplier: number;
  saveToCornerChance: number;
  missToCornerChance: number;
  cornerGoalChanceBase: number;
  cornerGoalChanceMax: number;
  indirectFkGoalChanceBase: number;
  indirectFkGoalChanceMax: number;
  skillCompressionFactor?: number;
  passTurnoverRecoveryChance?: number;
  passOverhitRecoveryChance?: number;
}
export interface PassScoreBreakdown {
  base: number;
  style: number;
  flank: number;
  block: number;
  offside: number;
}

export interface PassCandidateDecision {
  playerId: string;
  playerName: string;
  role: string;
  score: number;
  distance: number;
  probability: number;
  isTargetOffside: boolean;
  breakdown: PassScoreBreakdown;
}

export interface TickTrace {
  minute: number;
  tickIndex: number;
  ballPossession: Possession;
  actionWeights: {
    pass: number;
    carry: number;
    shot: number;
    foul: number;
  };
  channels: {
    wideChannel: boolean;
    channelSlots: number;
    centralSlots: number;
  };
  eventCreated: PlayByPlayEvent | null;
  matchShapeSnapshot: VariantBMatchShapeSnapshot | null;
  passDecisions?: PassCandidateDecision[];
}

export interface MatchState {
  ballPossession: Possession;
  events: PlayByPlayEvent[];
  fatigueTimeline: MatchFatigueTimeline;
  tickTraces?: TickTrace[];
  counterAttackTicks?: number;
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
  homeFreeKicks?: number;
  awayFreeKicks?: number;
  homeFreeKickGoals?: number;
  awayFreeKickGoals?: number;
  homePenalties?: number;
  awayPenalties?: number;
  homePenaltyGoals?: number;
  awayPenaltyGoals?: number;
  homeSetPieceGoals?: number;
  awaySetPieceGoals?: number;
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
  // When true, the engine never rolls injuries. Used by calibration / scenario
  // guardrail tests that pre-date the injury system and need stable goal/shot
  // distributions independent of injury-driven manpower changes.
  disableInjuries?: boolean;
  debugTickTracing?: boolean;
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
  fatigueLevel: number; // 0-100
  performanceModifier: number; // 0.5-1.0
}

export function calculateFatigueModifier(fatigue: number): number {
  return Math.max(0.5, 1.0 - 0.5 * Math.pow(fatigue / 100, 2));
}

export function scaleOverallWithFatigue(baseOverall: number, fatigueModifier: number): number {
  return Math.round(baseOverall * fatigueModifier);
}