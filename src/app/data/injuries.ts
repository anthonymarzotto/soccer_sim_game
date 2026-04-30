// Injury data table and types.
//
// `weight` drives weighted random selection. `severity` groups injuries for
// display and tuning. `weight` totals are relative; the table is rebalanced to
// target ~52 games missed per team-season at ~19 injuries per team-season,
// which works out to ~2.74 games missed per injury on average.
//
// See plans/player-injuries.md for the calibration math.

export type InjurySeverity = 'Knock' | 'Minor' | 'Moderate' | 'Serious' | 'Severe';

export interface InjuryDefinition {
  id: string;
  name: string;
  severity: InjurySeverity;
  minWeeks: number; // 0 = game-only
  maxWeeks: number;
  weight: number; // relative weight for weighted random selection
}

export interface InjuryRecord {
  definitionId: string; // references InjuryDefinition.id
  totalWeeks: number; // original rolled duration (immutable after creation)
  weeksRemaining: number; // 0 = healed/game-only, >=1 = active multi-week injury
  sustainedInSeason: number;
  sustainedInWeek: number;
}

export const INJURY_DEFINITIONS: readonly InjuryDefinition[] = [
  { id: 'knock', name: 'Knock', severity: 'Knock', minWeeks: 0, maxWeeks: 0, weight: 65 },
  { id: 'cramp', name: 'Cramp', severity: 'Knock', minWeeks: 0, maxWeeks: 0, weight: 30 },
  { id: 'minor_cut', name: 'Minor Cut', severity: 'Knock', minWeeks: 0, maxWeeks: 0, weight: 15 },
  { id: 'dead_leg', name: 'Dead Leg', severity: 'Knock', minWeeks: 0, maxWeeks: 1, weight: 35 },
  { id: 'winded', name: 'Winded', severity: 'Knock', minWeeks: 0, maxWeeks: 0, weight: 20 },
  { id: 'bruising', name: 'Bruising', severity: 'Minor', minWeeks: 1, maxWeeks: 1, weight: 95 },
  { id: 'shin_contusion', name: 'Shin Contusion', severity: 'Minor', minWeeks: 1, maxWeeks: 2, weight: 75 },
  { id: 'groin_strain', name: 'Groin Strain', severity: 'Minor', minWeeks: 1, maxWeeks: 2, weight: 70 },
  { id: 'wrist_sprain', name: 'Wrist Sprain', severity: 'Minor', minWeeks: 1, maxWeeks: 2, weight: 40 },
  { id: 'minor_ankle_twist', name: 'Minor Ankle Twist', severity: 'Minor', minWeeks: 1, maxWeeks: 3, weight: 72 },
  { id: 'calf_strain', name: 'Calf Strain', severity: 'Moderate', minWeeks: 2, maxWeeks: 4, weight: 75 },
  { id: 'thigh_strain', name: 'Thigh Strain', severity: 'Moderate', minWeeks: 2, maxWeeks: 4, weight: 75 },
  { id: 'hamstring_pull', name: 'Hamstring Pull', severity: 'Moderate', minWeeks: 3, maxWeeks: 5, weight: 90 },
  { id: 'ankle_sprain', name: 'Ankle Sprain', severity: 'Moderate', minWeeks: 2, maxWeeks: 5, weight: 95 },
  { id: 'shoulder_sprain', name: 'Shoulder Sprain', severity: 'Moderate', minWeeks: 2, maxWeeks: 4, weight: 45 },
  { id: 'rib_contusion', name: 'Rib Contusion', severity: 'Moderate', minWeeks: 2, maxWeeks: 3, weight: 60 },
  { id: 'knee_sprain', name: 'Knee Sprain', severity: 'Serious', minWeeks: 4, maxWeeks: 6, weight: 30 },
  { id: 'hamstring_tear', name: 'Hamstring Tear', severity: 'Serious', minWeeks: 5, maxWeeks: 7, weight: 30 },
  { id: 'ankle_ligament_tear', name: 'Ankle Ligament Tear', severity: 'Serious', minWeeks: 5, maxWeeks: 8, weight: 20 },
  { id: 'fractured_rib', name: 'Fractured Rib', severity: 'Serious', minWeeks: 4, maxWeeks: 6, weight: 15 },
  { id: 'broken_metatarsal', name: 'Broken Metatarsal', severity: 'Serious', minWeeks: 6, maxWeeks: 9, weight: 14 },
  { id: 'knee_ligament_sprain', name: 'Knee Ligament Sprain', severity: 'Serious', minWeeks: 6, maxWeeks: 9, weight: 12 },
  { id: 'broken_leg', name: 'Broken Leg', severity: 'Severe', minWeeks: 10, maxWeeks: 16, weight: 8 },
  { id: 'acl_partial_tear', name: 'ACL Partial Tear', severity: 'Severe', minWeeks: 10, maxWeeks: 14, weight: 8 },
  { id: 'acl_rupture', name: 'ACL Rupture', severity: 'Severe', minWeeks: 18, maxWeeks: 24, weight: 6 },
] as const;

const INJURY_DEFINITIONS_BY_ID = new Map<string, InjuryDefinition>(
  INJURY_DEFINITIONS.map(definition => [definition.id, definition])
);

export function getInjuryDefinition(definitionId: string): InjuryDefinition | null {
  return INJURY_DEFINITIONS_BY_ID.get(definitionId) ?? null;
}

export const TOTAL_INJURY_WEIGHT: number = INJURY_DEFINITIONS.reduce(
  (sum, definition) => sum + definition.weight,
  0
);

/**
 * Picks a random injury definition using weighted selection.
 * `randomFraction` must be in `[0, 1)` (e.g. from RngService.random()).
 */
export function pickInjuryDefinition(randomFraction: number): InjuryDefinition {
  const target = randomFraction * TOTAL_INJURY_WEIGHT;
  let cumulative = 0;
  for (const definition of INJURY_DEFINITIONS) {
    cumulative += definition.weight;
    if (target < cumulative) {
      return definition;
    }
  }
  // Should be unreachable if randomFraction is in [0, 1).
  return INJURY_DEFINITIONS[INJURY_DEFINITIONS.length - 1];
}

/**
 * Rolls a duration in `[minWeeks, maxWeeks]` inclusive.
 * `randomFraction` must be in `[0, 1)`.
 */
export function rollInjuryDurationWeeks(
  definition: InjuryDefinition,
  randomFraction: number
): number {
  const span = definition.maxWeeks - definition.minWeeks + 1;
  return definition.minWeeks + Math.floor(randomFraction * span);
}
