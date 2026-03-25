import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Position as PositionEnum, FieldZone } from '../../models/enums';
import { FormationLibraryService } from '../../services/formation-library.service';
import { FormationSchema, FormationSlotDefinition } from '../../models/formation.types';

interface SlotForm {
  slotId: string;
  label: string;
  preferredPosition: string;
  coordinates: { x: number; y: number };
  zone: string;
}

@Component({
  selector: 'app-formation-editor',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './formation-editor.html',
  styleUrls: ['./formation-editor.css']
})
export class FormationEditorComponent {
  formationLibrary = inject(FormationLibraryService);

  // Expose enums for template
  PositionEnum = PositionEnum;
  FieldZone = FieldZone;

  // Form state
  formationName = signal('');
  formationShortCode = signal('');
  formationDescription = signal('');
  slots = signal<SlotForm[]>(this.getDefaultSlots());
  validationErrors = signal<string[]>([]);
  registrationSuccess = signal(false);
  registrationError = signal('');

  // Computed states
  availablePositions = computed(() => Object.values(PositionEnum));
  availableZones = computed(() => Object.values(FieldZone));
  
  isFormValid = computed(() => {
    const name = this.formationName();
    const code = this.formationShortCode();
    const slots = this.slots();
    
    return name.trim().length > 0 &&
           code.trim().length > 0 &&
           slots.length === 11 &&
           !this.hasValidationErrors();
  });

  hasValidationErrors = computed(() => this.validationErrors().length > 0);

  goalkeeperCount = computed(() => {
    return this.slots().filter(s => s.preferredPosition === PositionEnum.GOALKEEPER).length;
  });

  private getDefaultSlots(): SlotForm[] {
    return [
      {
        slotId: 'gk_1',
        label: 'Goalkeeper',
        preferredPosition: PositionEnum.GOALKEEPER,
        coordinates: { x: 50, y: 5 },
        zone: FieldZone.DEFENSE
      },
      ...Array.from({ length: 10 }, (_, i) => ({
        slotId: `player_${i + 1}`,
        label: `Player ${i + 1}`,
        preferredPosition: PositionEnum.DEFENDER,
        coordinates: { x: 50, y: 50 },
        zone: FieldZone.MIDFIELD
      }))
    ];
  }

  onAddSlot(): void {
    const currentSlots = this.slots();
    if (currentSlots.length >= 11) {
      // Already at max
      return;
    }

    const newSlot: SlotForm = {
      slotId: `player_${Date.now()}`,
      label: `Player ${currentSlots.length + 1}`,
      preferredPosition: PositionEnum.MIDFIELDER,
      coordinates: { x: 50, y: 50 },
      zone: FieldZone.MIDFIELD
    };

    this.slots.set([...currentSlots, newSlot]);
  }

  onRemoveSlot(index: number): void {
    const currentSlots = this.slots();
    if (currentSlots.length <= 11) {
      // Can only remove if we exceed 11
      return;
    }

    const updated = currentSlots.filter((_, i) => i !== index);
    this.slots.set(updated);
  }

  onSlotUpdate<K extends keyof SlotForm>(index: number, field: K, value: SlotForm[K]): void {
    const currentSlots = this.slots();
    const updated = [...currentSlots];
    if (!updated[index]) {
      return;
    }
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    this.slots.set(updated);
  }

  validateFormation(): void {
    const errors: string[] = [];

    // Check name
    if (!this.formationName().trim()) {
      errors.push('Formation name is required');
    }

    // Check short code
    if (!this.formationShortCode().trim()) {
      errors.push('Formation short code is required');
    }

    // Check slot count
    if (this.slots().length !== 11) {
      errors.push(`Formation must have exactly 11 slots, got ${this.slots().length}`);
    }

    // Check goalkeeper count
    const gkCount = this.goalkeeperCount();
    if (gkCount !== 1) {
      errors.push(`Formation must have exactly 1 goalkeeper, got ${gkCount}`);
    }

    // Check unique slot IDs
    const slotIds = this.slots().map(s => s.slotId);
    if (new Set(slotIds).size !== slotIds.length) {
      errors.push('Slot IDs must be unique');
    }

    // Check unique labels
    const labels = this.slots().map(s => s.label);
    if (new Set(labels).size !== labels.length) {
      errors.push('Slot labels must be unique');
    }

    // Check coordinates bounds
    this.slots().forEach((slot, idx) => {
      if (slot.coordinates.x < 0 || slot.coordinates.x > 100) {
        errors.push(`Slot ${slot.label} X coordinate must be 0-100`);
      }
      if (slot.coordinates.y < 0 || slot.coordinates.y > 100) {
        errors.push(`Slot ${slot.label} Y coordinate must be 0-100`);
      }
    });

    this.validationErrors.set(errors);
  }

  registerFormation(): void {
    this.validateFormation();

    if (this.hasValidationErrors()) {
      this.registrationError.set('Please fix the errors above');
      return;
    }

    // Build FormationSchema from form state
    const schema: FormationSchema = {
      id: `user_formation_${Date.now()}`,
      name: this.formationName(),
      shortCode: this.formationShortCode(),
      description: this.formationDescription(),
      isUserDefined: true,
      createdAt: Date.now(),
      slots: this.slots().map(slot => ({
        slotId: slot.slotId,
        label: slot.label,
        preferredPosition: slot.preferredPosition as PositionEnum,
        coordinates: { ...slot.coordinates },
        zone: slot.zone as FieldZone
      }))
    };

    // Register via service
    const result = this.formationLibrary.registerUserFormation(schema);

    if (result.isValid) {
      this.registrationSuccess.set(true);
      this.registrationError.set('');
      
      // Reset form
      setTimeout(() => {
        this.resetForm();
      }, 2000);
    } else {
      this.registrationError.set(result.errors.join('; '));
    }
  }

  resetForm(): void {
    this.formationName.set('');
    this.formationShortCode.set('');
    this.formationDescription.set('');
    this.slots.set(this.getDefaultSlots());
    this.validationErrors.set([]);
    this.registrationSuccess.set(false);
    this.registrationError.set('');
  }

  loadPredefinedFormation(formationId: string): void {
    const schema = this.formationLibrary.getFormationById(formationId);
    if (!schema) return;

    this.formationName.set(schema.name);
    this.formationShortCode.set(schema.shortCode);
    this.formationDescription.set(schema.description || '');
    this.slots.set(schema.slots.map(slot => ({
      slotId: slot.slotId,
      label: slot.label,
      preferredPosition: slot.preferredPosition,
      coordinates: { ...slot.coordinates },
      zone: slot.zone
    })));
  }

  parseNumber(value: unknown): number {
    return parseFloat(String(value));
  }
}
