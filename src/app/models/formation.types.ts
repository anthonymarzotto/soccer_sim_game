import { Position } from './enums';
import { Coordinates } from './simulation.types';

/**
 * FormationSlotDefinition: Core schema definition of a single position in a formation.
 * Represents a tactical slot with stable identity and constraints.
 */
export interface FormationSlotDefinition {
  slotId: string;          // Stable identifier (e.g., 'gk_1', 'def_l', 'mid_lc')
  label: string;           // Human-readable name (e.g., 'Left Back', 'Center Midfielder')
  preferredPosition: Position;  // Tactical position for role validation
  coordinates: Coordinates; // Field position (x: 0-100 width, y: 0-100 length)
  zone: string;            // FieldZone identifier for tactical grouping
}

/**
 * FormationSchema: Complete definition of a formation with all slots, metadata, and provenance.
 * This is the source of truth for a formation structure (e.g., 4-4-2, 3-5-2, 5-3-2).
 */
export interface FormationSchema {
  id: string;              // Unique identifier (e.g., 'formation_4_4_2', 'user_custom_1')
  name: string;            // Display name (e.g., 'Classic 4-4-2')
  shortCode: string;       // Abbreviated code (e.g., '4-4-2', '3-5-2')
  description?: string;    // Optional description of gameplay strengths
  slots: FormationSlotDefinition[];  // Exactly 11 slots for 11 players
  isUserDefined: boolean;  // Distinguish predefined vs runtime-created schemas
  createdAt: number;       // Timestamp for sorting/versioning
}

/**
 * FormationLibrary: Runtime container for predefined and user-defined formations.
 * Used by FormationLibraryService to manage the registry.
 */
export interface FormationLibrary {
  predefined: Map<string, FormationSchema>;  // Built-in formations (immutable)
  userDefined: Map<string, FormationSchema>; // Custom formations created at runtime
}

/**
 * Validation result for formation schema creation/modification.
 */
export interface FormationValidation {
  isValid: boolean;
  errors: string[];
}
