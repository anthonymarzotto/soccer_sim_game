import { Injectable } from '@angular/core';
import { FieldZone, Position } from '../models/enums';
import { FormationSchema, FormationSlotDefinition, FormationValidation } from '../models/formation.types';
import { ALL_PREDEFINED_FORMATIONS } from '../data/formations';

/**
 * FormationLibraryService: Registry and management service for all formation schemas.
 * Maintains both predefined formations and runtime-created custom formations.
 * This is the single source of truth for what formations are available and their slot definitions.
 */
@Injectable({ providedIn: 'root' })
export class FormationLibraryService {
  private predefinedFormations = new Map<string, FormationSchema>();
  private userDefinedFormations = new Map<string, FormationSchema>();

  constructor() {
    this.initializePredefinedFormations();
  }

  private initializePredefinedFormations(): void {
    for (const formation of ALL_PREDEFINED_FORMATIONS) {
      this.predefinedFormations.set(formation.id, formation);
    }
  }

  /**
   * Retrieve a formation schema by ID from either predefined or user-defined registry.
   */
  getFormationById(formationId: string): FormationSchema | undefined {
    return this.predefinedFormations.get(formationId) || this.userDefinedFormations.get(formationId);
  }

  /**
   * Get all predefined formation schemas (immutable by service contract).
   */
  listPredefinedFormations(): FormationSchema[] {
    return Array.from(this.predefinedFormations.values());
  }

  /**
   * Get all user-defined formation schemas.
   */
  listUserDefinedFormations(): FormationSchema[] {
    return Array.from(this.userDefinedFormations.values());
  }

  /**
   * Get all formations (predefined and user-defined).
   */
  getAllFormations(): FormationSchema[] {
    return [...this.listPredefinedFormations(), ...this.listUserDefinedFormations()];
  }

  /**
   * Get the default formation ID for new teams (always the classic 4-4-2).
   */
  getDefaultFormationId(): string {
    return 'formation_4_4_2';
  }

  /**
   * Register a new user-defined formation in the runtime registry.
   * Validates the schema before adding.
   * Returns validation result; if valid, formation is added and can be used immediately.
   */
  registerUserFormation(schema: FormationSchema): FormationValidation {
    const validation = this.validateFormationSchema(schema);

    // If basic schema validation fails, return as-is.
    if (!validation.isValid) {
      return validation;
    }

    // Prevent collisions with both predefined and existing user-defined formations.
    const idAlreadyUsed =
      this.predefinedFormations.has(schema.id) || this.userDefinedFormations.has(schema.id);

    if (idAlreadyUsed) {
      const v: any = validation;
      v.isValid = false;
      const duplicateMessage = `Formation ID '${schema.id}' is already in use.`;

      if (Array.isArray(v.errors)) {
        v.errors.push(duplicateMessage);
      } else {
        v.errors = [duplicateMessage];
      }

      return validation;
    }

    this.userDefinedFormations.set(schema.id, schema);
    return validation;
  }

  /**
   * Remove a user-defined formation from the runtime registry.
   * Predefined formations cannot be removed.
   */
  removeUserFormation(formationId: string): boolean {
    if (this.predefinedFormations.has(formationId)) {
      // Prevent removal of predefined formations
      return false;
    }
    return this.userDefinedFormations.delete(formationId);
  }

  /**
   * Validate a formation schema against core constraints.
   * Enforces:
   * - Exactly 11 slots
   * - Exactly one goalkeeper-preferred slot
   * - Unique slot IDs within schema
   * - Unique labels within schema
   * - Coordinates within 0-100 bounds
   * - Valid zones and positions
   */
  validateFormationSchema(schema: FormationSchema): FormationValidation {
    const errors: string[] = [];

    // Check slot count
    if (!schema.slots || schema.slots.length !== 11) {
      errors.push(`Formation must have exactly 11 slots, got ${schema.slots?.length ?? 0}`);
    }

    // Check for exactly one goalkeeper
    const gkSlots = schema.slots.filter(s => s.preferredPosition === Position.GOALKEEPER);
    if (gkSlots.length !== 1) {
      errors.push(`Formation must have exactly 1 goalkeeper slot, got ${gkSlots.length}`);
    }

    // Check for unique slot IDs
    const slotIds = schema.slots.map(s => s.slotId);
    const uniqueSlotIds = new Set(slotIds);
    if (slotIds.length !== uniqueSlotIds.size) {
      errors.push('Slot IDs must be unique within the formation');
    }

    // Check for unique labels
    const labels = schema.slots.map(s => s.label);
    const uniqueLabels = new Set(labels);
    if (labels.length !== uniqueLabels.size) {
      errors.push('Slot labels must be unique within the formation');
    }

    // Validate each slot
    schema.slots.forEach((slot, idx) => {
      // Check coordinates bounds
      if (slot.coordinates.x < 0 || slot.coordinates.x > 100 || slot.coordinates.y < 0 || slot.coordinates.y > 100) {
        errors.push(`Slot ${slot.slotId} coordinates out of bounds: (${slot.coordinates.x}, ${slot.coordinates.y})`);
      }

      // Check zone is valid
      const validZones = Object.values(FieldZone);
      if (!validZones.includes(slot.zone as FieldZone)) {
        errors.push(`Slot ${slot.slotId} has invalid zone: ${slot.zone}`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get all slot definitions for a formation.
   * Returns undefined if formation ID not found.
   */
  getFormationSlots(formationId: string): FormationSlotDefinition[] | undefined {
    const formation = this.getFormationById(formationId);
    return formation?.slots;
  }

  /**
   * Get a specific slot definition within a formation.
   * Returns the slot or undefined if formation or slot not found.
   */
  getSlotDefinition(formationId: string, slotId: string): FormationSlotDefinition | undefined {
    const slots = this.getFormationSlots(formationId);
    return slots?.find(s => s.slotId === slotId);
  }

  /**
   * Validate assignment keys for a given formation.
   * Returns array of errors; empty if all keys are valid for the formation.
   */
  validateAssignmentKeys(formationId: string, assignmentKeys: string[]): string[] {
    const slots = this.getFormationSlots(formationId);
    if (!slots) {
      return [`Formation ${formationId} not found`];
    }

    const validSlotIds = new Set(slots.map(s => s.slotId));
    const errors: string[] = [];

    assignmentKeys.forEach(key => {
      if (!validSlotIds.has(key)) {
        errors.push(`Assignment key '${key}' is not valid for formation ${formationId}`);
      }
    });

    return errors;
  }
}
