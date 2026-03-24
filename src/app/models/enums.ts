// Event Types
export enum EventType {
  PASS = 'PASS',
  SHOT = 'SHOT',
  TACKLE = 'TACKLE',
  INTERCEPTION = 'INTERCEPTION',
  SAVE = 'SAVE',
  MISS = 'MISS',
  GOAL = 'GOAL',
  CORNER = 'CORNER',
  FREE_KICK = 'FREE_KICK',
  PENALTY = 'PENALTY',
  SUBSTITUTION = 'SUBSTITUTION',
  INJURY = 'INJURY',
  YELLOW_CARD = 'YELLOW_CARD',
  RED_CARD = 'RED_CARD',
  FOUL = 'FOUL'
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
  RESERVE = 'Reserve'
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
  STATS = 'stats'
}
