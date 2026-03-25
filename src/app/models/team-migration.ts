import { Team } from './types';

/**
 * Team Migration Helpers
 * 
 * These utilities normalize team states when introducing new schema-driven formation system.
 * Applied during team initialization and whenever a team's selectedFormationId might be stale.
 */

/**
 * Normalize a team's formation assignment state.
 * 
 * When selectedFormationId is added to Team, existing team states may have:
 * - Missing selectedFormationId (set to default 4-4-2)
 * - Stale formationAssignments keys (clean up unknown slots)
 * - Incomplete formationAssignments (add missing slots as empty)
 * 
 * This function idempotently ensures a team is in a valid state for the selected formation schema.
 * 
 * @param team Team to normalize
 * @param defaultFormationId Default formation ID to apply if selectedFormationId is missing
 * @param schema FormationSlotDefinition[] from the selected formation to validate against
 * @returns Normalized team with consistent selectedFormationId and formationAssignments
 */
export function normalizeTeamFormation(
  team: Team,
  defaultFormationId: string,
  schema: Array<{ slotId: string }> | undefined
): Team {
  // Ensure selectedFormationId is set
  const selectedFormationId = team.selectedFormationId || defaultFormationId;

  // If no schema provided, just ensure selectedFormationId is set
  if (!schema) {
    return {
      ...team,
      selectedFormationId
    };
  }

  // Build normalized formationAssignments validated against schema
  const validSlotIds = new Set(schema.map(s => s.slotId));
  const normalizedAssignments: Record<string, string> = {};

  // Copy only valid slot assignments from current state
  Object.entries(team.formationAssignments || {}).forEach(([slotId, playerId]) => {
    if (validSlotIds.has(slotId)) {
      normalizedAssignments[slotId] = playerId;
    }
    // Unknown slots are dropped
  });

  // Ensure all valid slots have an entry (empty string if unassigned)
  schema.forEach(slot => {
    if (!(slot.slotId in normalizedAssignments)) {
      normalizedAssignments[slot.slotId] = '';
    }
  });

  return {
    ...team,
    selectedFormationId,
    formationAssignments: normalizedAssignments
  };
}

/**
 * Check if a team is in a legacy (pre-schema) state.
 * Returns true if:
 * - selectedFormationId is missing
 * - formationAssignments has unexpected keys
 * - formationAssignments is empty or missing
 */
export function isLegacyTeamState(team: Team): boolean {
  return (
    !team.selectedFormationId ||
    !team.formationAssignments ||
    Object.keys(team.formationAssignments).length === 0
  );
}
