// Event Types
export enum EventType {
  // --- Emitted to matchState.events by the simulation engine ---
  PASS = 'PASS',
  GOAL = 'GOAL',
  SAVE = 'SAVE',
  MISS = 'MISS',
  FOUL = 'FOUL',
  YELLOW_CARD = 'YELLOW_CARD',
  RED_CARD = 'RED_CARD',
  SUBSTITUTION = 'SUBSTITUTION',
  TACKLE = 'TACKLE',
  INTERCEPTION = 'INTERCEPTION',

  // --- Transient action tokens: used to route simulation logic, never emitted ---
  SHOT = 'SHOT',   // resolved into GOAL | SAVE | MISS before event creation
  CARRY = 'CARRY', // ball movement step; no event is recorded

  // --- Defined but not yet implemented in the simulation engine ---
  CORNER = 'CORNER',
  FREE_KICK = 'FREE_KICK',
  PENALTY = 'PENALTY',
  INJURY = 'INJURY',
}

// Distinguishes contact vs non-contact injury roll sites in the simulation
// engine. Drives which base chance constant is applied in `tryRollInjury`.
export enum InjuryRollKind {
  CONTACT = 'CONTACT',
  NON_CONTACT = 'NON_CONTACT',
}

// Position Types
export enum Position {
  GOALKEEPER = 'GK',
  DEFENDER = 'DEF',
  MIDFIELDER = 'MID',
  FORWARD = 'FWD'
}

// Role Types
export enum Role {
  STARTER = 'Starter',
  BENCH = 'Bench',
  RESERVE = 'Reserve',
  SUBSTITUTED_OUT = 'SubstitutedOut',
  DISMISSED = 'Dismissed'
}

// Tactical Types
export enum PlayingStyle {
  POSSESSION = 'POSSESSION',
  COUNTER_ATTACK = 'COUNTER_ATTACK',
  PRESSING = 'PRESSING',
  DEFENSIVE = 'DEFENSIVE'
}

export enum Mentality {
  ATTACKING = 'ATTACKING',
  BALANCED = 'BALANCED',
  DEFENSIVE = 'DEFENSIVE'
}

export enum CommentaryStyle {
  DETAILED = 'DETAILED',
  BRIEF = 'BRIEF',
  STATS_ONLY = 'STATS_ONLY'
}

// Zone Types
export enum FieldZone {
  DEFENSE = 'DEFENSE',
  MIDFIELD = 'MIDFIELD',
  ATTACK = 'ATTACK'
}

// Match Phase Types
export enum MatchPhase {
  BUILD_UP = 'BUILD_UP',
  ATTACKING = 'ATTACKING',
  DEFENDING = 'DEFENDING',
  COUNTER_ATTACK = 'COUNTER_ATTACK'
}

// Player Progression Phases
export enum Phase {
  Junior = 'JUNIOR',
  Peak = 'PEAK',
  Senior = 'SENIOR',
  Decline = 'DECLINE'
}

// Match Result Types
export enum MatchResult {
  WIN = 'W',
  DRAW = 'D',
  LOSS = 'L'
}

// Key Event Importance Types
export enum EventImportance {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

// View Mode Types
export enum TeamDetailsViewMode {
  BIO = 'bio',
  STATS = 'stats',
  SEASON_HISTORY = 'season_history'
}

// Match Side Types
export enum TeamSide {
  HOME = 'home',
  AWAY = 'away'
}
