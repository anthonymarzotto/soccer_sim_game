import { TestBed } from '@angular/core/testing';
import { FormationLibraryService } from './formation-library.service';
import { FormationSchema } from '../models/formation.types';
import { Position } from '../models/enums';
import { ALL_PREDEFINED_FORMATIONS } from '../data/formations';

describe('FormationLibraryService', () => {
  let service: FormationLibraryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FormationLibraryService]
    });
    service = TestBed.inject(FormationLibraryService);
  });

  describe('Initialization & Default Formation', () => {
    it('should initialize with default 4-4-2 formation', () => {
      const formations = service.listPredefinedFormations();
      expect(formations[0].shortCode).toBe('4-4-2');
    });

    it('should register exactly the formations from ALL_PREDEFINED_FORMATIONS', () => {
      const predefined = service.listPredefinedFormations();
      expect(predefined.length).toBe(ALL_PREDEFINED_FORMATIONS.length);
      ALL_PREDEFINED_FORMATIONS.forEach(expected => {
        const registered = service.getFormationById(expected.id);
        expect(registered).toBeDefined();
        expect(registered?.id).toBe(expected.id);
      });
    });

    it('should return correct default formation ID', () => {
      const defaultId = service.getDefaultFormationId();
      expect(defaultId).toBe('formation_4_4_2');
    });

    it('should retrieve default formation by ID', () => {
      const formation = service.getFormationById('formation_4_4_2');
      expect(formation).toBeDefined();
      expect(formation?.slots.length).toBe(11);
    });
  });

  describe('Formation Schema Validation', () => {
    it('should validate valid 4-4-2 schema', () => {
      const schema = service.getFormationById('formation_4_4_2');
      const validation = service.validateFormationSchema(schema!);
      expect(validation.isValid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });

    it('should reject formation with wrong slot count', () => {
      const schema: FormationSchema = {
        id: 'test_invalid',
        name: 'Invalid',
        shortCode: 'INV',
        isUserDefined: true,
        createdAt: Date.now(),
        slots: [] // No slots
      };

      const validation = service.validateFormationSchema(schema);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('11 slots'))).toBe(true);
    });

    it('should reject formation without exactly one goalkeeper', () => {
      const base442 = service.getFormationById('formation_4_4_2')!;
      const schema: FormationSchema = {
        ...base442,
        id: 'test_no_gk',
        slots: base442.slots.map(s => ({
          ...s,
          preferredPosition: s.preferredPosition === Position.GOALKEEPER ? Position.DEFENDER : s.preferredPosition
        }))
      };

      const validation = service.validateFormationSchema(schema);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('1 goalkeeper'))).toBe(true);
    });

    it('should reject formation with duplicate slot IDs', () => {
      const base442 = service.getFormationById('formation_4_4_2')!;
      const schema: FormationSchema = {
        ...base442,
        id: 'test_dup_ids',
        slots: base442.slots.map((s, i) => ({
          ...s,
          slotId: i === 0 ? 'gk_1' : i === 1 ? 'gk_1' : s.slotId // Duplicate gk_1
        }))
      };

      const validation = service.validateFormationSchema(schema);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('unique'))).toBe(true);
    });

    it('should reject formation with duplicate labels', () => {
      const base442 = service.getFormationById('formation_4_4_2')!;
      const schema: FormationSchema = {
        ...base442,
        id: 'test_dup_labels',
        slots: base442.slots.map((s) => ({
          ...s,
          label: 'Duplicate Label' // All slots get same label
        }))
      };

      const validation = service.validateFormationSchema(schema);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('label'))).toBe(true);
    });

    it('should reject formation with out-of-bounds coordinates', () => {
      const base442 = service.getFormationById('formation_4_4_2')!;
      const schema: FormationSchema = {
        ...base442,
        id: 'test_bad_coords',
        slots: base442.slots.map((s, i) => ({
          ...s,
          coordinates: i === 0 ? { x: 150, y: 50 } : s.coordinates // X > 100
        }))
      };

      const validation = service.validateFormationSchema(schema);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.includes('out of bounds'))).toBe(true);
    });
  });

  describe('User-Defined Formation Registration', () => {
    it('should register valid user formation', () => {
      const base442 = service.getFormationById('formation_4_4_2')!;
      const newSchema: FormationSchema = {
        id: 'user_test_1',
        name: 'Test Formation',
        shortCode: 'TST',
        isUserDefined: true,
        createdAt: Date.now(),
        slots: base442.slots
      };

      const validation = service.registerUserFormation(newSchema);
      expect(validation.isValid).toBe(true);
      expect(validation.errors.length).toBe(0);

      // Verify it was added
      const retrieved = service.getFormationById('user_test_1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test Formation');
    });

    it('should reject invalid user formation', () => {
      const invalidSchema: FormationSchema = {
        id: 'user_invalid',
        name: 'Invalid',
        shortCode: 'INV',
        isUserDefined: true,
        createdAt: Date.now(),
        slots: [] // Invalid
      };

      const validation = service.registerUserFormation(invalidSchema);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);

      // Verify it was NOT added
      const retrieved = service.getFormationById('user_invalid');
      expect(retrieved).toBeUndefined();
    });

    it('should maintain separate predefined and user-defined lists', () => {
      const base442 = service.getFormationById('formation_4_4_2')!;
      const userFormation: FormationSchema = {
        id: 'user_custom_test',
        name: 'Custom Test',
        shortCode: 'CUS',
        isUserDefined: true,
        createdAt: Date.now(),
        slots: base442.slots
      };

      service.registerUserFormation(userFormation);

      const predefined = service.listPredefinedFormations();
      const userDefined = service.listUserDefinedFormations();

      expect(predefined.length).toBe(1); // Still just 4-4-2
      expect(userDefined.length).toBe(1); // Our custom one
      expect(predefined[0].id).toBe('formation_4_4_2');
      expect(userDefined[0].id).toBe('user_custom_test');
    });
  });

  describe('Formation Query Operations', () => {
    it('should return all formations combined', () => {
      const base442 = service.getFormationById('formation_4_4_2')!;
      service.registerUserFormation({
        id: 'user_query_test',
        name: 'Query Test',
        shortCode: 'QRY',
        isUserDefined: true,
        createdAt: Date.now(),
        slots: base442.slots
      });

      const all = service.getAllFormations();
      expect(all.length).toBe(2);
      expect(all.some(f => f.id === 'formation_4_4_2')).toBe(true);
      expect(all.some(f => f.id === 'user_query_test')).toBe(true);
    });

    it('should get formation slots correctly', () => {
      const slots = service.getFormationSlots('formation_4_4_2');
      expect(slots).toBeDefined();
      expect(slots?.length).toBe(11);
      
      // Verify slot structure
      expect(slots?.[0].slotId).toBe('gk_1');
      expect(slots?.[0].preferredPosition).toBe(Position.GOALKEEPER);
    });

    it('should get specific slot definition', () => {
      const slot = service.getSlotDefinition('formation_4_4_2', 'gk_1');
      expect(slot).toBeDefined();
      expect(slot?.label).toBe('Goalkeeper');
      expect(slot?.preferredPosition).toBe(Position.GOALKEEPER);
    });

    it('should return undefined for non-existent formation', () => {
      const slots = service.getFormationSlots('nonexistent');
      expect(slots).toBeUndefined();
    });
  });

  describe('Assignment Key Validation', () => {
    it('should validate correct assignment keys for 4-4-2', () => {
      const validKeys = [
        'gk_1', 'def_l', 'def_lc', 'def_rc', 'def_r',
        'mid_l', 'mid_lc', 'mid_rc', 'mid_r',
        'att_l', 'att_r'
      ];
      const errors = service.validateAssignmentKeys('formation_4_4_2', validKeys);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid assignment keys', () => {
      const invalidKeys = ['gk_1', 'invalid_slot', 'another_bad_slot'];
      const errors = service.validateAssignmentKeys('formation_4_4_2', invalidKeys);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('invalid_slot'))).toBe(true);
    });

    it('should return error for non-existent formation', () => {
      const errors = service.validateAssignmentKeys('nonexistent', ['gk_1']);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('not found'))).toBe(true);
    });
  });

  describe('User Formation Removal', () => {
    it('should remove user-defined formations', () => {
      const base442 = service.getFormationById('formation_4_4_2')!;
      const userFormation = {
        id: 'user_remove_test',
        name: 'Remove Test',
        shortCode: 'RMV',
        isUserDefined: true,
        createdAt: Date.now(),
        slots: base442.slots
      };

      service.registerUserFormation(userFormation);
      expect(service.getFormationById('user_remove_test')).toBeDefined();

      const removed = service.removeUserFormation('user_remove_test');
      expect(removed).toBe(true);
      expect(service.getFormationById('user_remove_test')).toBeUndefined();
    });

    it('should not remove predefined formations', () => {
      const removed = service.removeUserFormation('formation_4_4_2');
      expect(removed).toBe(false);
      expect(service.getFormationById('formation_4_4_2')).toBeDefined();
    });

    it('should return false when removing non-existent formation', () => {
      const removed = service.removeUserFormation('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('Immutability Contract', () => {
    it('should not persist top-level mutations from getFormationById', () => {
      const original = service.getFormationById('formation_4_4_2')!;
      const originalName = original.name;

      original.name = 'Mutated Name';

      const refetched = service.getFormationById('formation_4_4_2')!;
      expect(refetched.name).toBe(originalName);
    });

    it('should not persist nested slot mutations from getFormationById', () => {
      const original = service.getFormationById('formation_4_4_2')!;
      const originalX = original.slots[0].coordinates.x;

      original.slots[0].coordinates.x = 999;

      const refetched = service.getFormationById('formation_4_4_2')!;
      expect(refetched.slots[0].coordinates.x).toBe(originalX);
    });

    it('should return detached data from listPredefinedFormations', () => {
      const listed = service.listPredefinedFormations();
      const originalName = listed[0].name;

      listed[0].name = 'Mutated Listed Name';

      const relisted = service.listPredefinedFormations();
      expect(relisted[0].name).toBe(originalName);
    });

    it('should return detached slot definitions from getSlotDefinition', () => {
      const slot = service.getSlotDefinition('formation_4_4_2', 'gk_1')!;
      const originalY = slot.coordinates.y;

      slot.coordinates.y = 123;

      const refetchedSlot = service.getSlotDefinition('formation_4_4_2', 'gk_1')!;
      expect(refetchedSlot.coordinates.y).toBe(originalY);
    });

    it('should not retain external schema mutations after registerUserFormation', () => {
      const base442 = service.getFormationById('formation_4_4_2')!;
      const schema: FormationSchema = {
        id: 'user_immutability_test',
        name: 'Immutability Test',
        shortCode: 'IMT',
        isUserDefined: true,
        createdAt: Date.now(),
        slots: structuredClone(base442.slots)
      };

      const validation = service.registerUserFormation(schema);
      expect(validation.isValid).toBe(true);

      schema.name = 'Externally Mutated';
      schema.slots[0].coordinates.x = 777;

      const stored = service.getFormationById('user_immutability_test')!;
      expect(stored.name).toBe('Immutability Test');
      expect(stored.slots[0].coordinates.x).not.toBe(777);
    });
  });

  describe('Formation Slot Integrity', () => {
    it('should have exactly one goalkeeper slot in 4-4-2', () => {
      const slots = service.getFormationSlots('formation_4_4_2')!;
      const gkSlots = slots.filter(s => s.preferredPosition === Position.GOALKEEPER);
      expect(gkSlots.length).toBe(1);
      expect(gkSlots[0].slotId).toBe('gk_1');
    });

    it('should have correct position distribution for 4-4-2', () => {
      const slots = service.getFormationSlots('formation_4_4_2')!;
      const defenders = slots.filter(s => s.preferredPosition === Position.DEFENDER);
      const midfielders = slots.filter(s => s.preferredPosition === Position.MIDFIELDER);
      const forwards = slots.filter(s => s.preferredPosition === Position.FORWARD);
      const goalkeepers = slots.filter(s => s.preferredPosition === Position.GOALKEEPER);

      expect(goalkeepers.length).toBe(1);
      expect(defenders.length).toBe(4);
      expect(midfielders.length).toBe(4);
      expect(forwards.length).toBe(2);
    });

    it('should have all slots with valid coordinates', () => {
      const slots = service.getFormationSlots('formation_4_4_2')!;
      slots.forEach(slot => {
        expect(slot.coordinates.x).toBeGreaterThanOrEqual(0);
        expect(slot.coordinates.x).toBeLessThanOrEqual(100);
        expect(slot.coordinates.y).toBeGreaterThanOrEqual(0);
        expect(slot.coordinates.y).toBeLessThanOrEqual(100);
      });
    });
  });
});
