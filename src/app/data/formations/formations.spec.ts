import { FieldZone, Position } from '../../models/enums';
import { FormationSchema } from '../../models/formation.types';
import { FORMATION_4_4_2 } from './formation-4-4-2';
import { ALL_PREDEFINED_FORMATIONS } from './index';

describe('FORMATION_4_4_2', () => {
  it('should have the correct id', () => {
    expect(FORMATION_4_4_2.id).toBe('formation_4_4_2');
  });

  it('should have the correct metadata', () => {
    expect(FORMATION_4_4_2.name).toBe('Classic 4-4-2');
    expect(FORMATION_4_4_2.shortCode).toBe('4-4-2');
    expect(FORMATION_4_4_2.isUserDefined).toBe(false);
    expect(FORMATION_4_4_2.description).toBeTruthy();
  });

  it('should have exactly 11 slots', () => {
    expect(FORMATION_4_4_2.slots.length).toBe(11);
  });

  it('should have exactly one goalkeeper slot', () => {
    const gkSlots = FORMATION_4_4_2.slots.filter(s => s.preferredPosition === Position.GOALKEEPER);
    expect(gkSlots.length).toBe(1);
    expect(gkSlots[0].slotId).toBe('gk_1');
  });

  it('should have the correct 4-4-2 position distribution', () => {
    const slots = FORMATION_4_4_2.slots;
    expect(slots.filter(s => s.preferredPosition === Position.GOALKEEPER).length).toBe(1);
    expect(slots.filter(s => s.preferredPosition === Position.DEFENDER).length).toBe(4);
    expect(slots.filter(s => s.preferredPosition === Position.MIDFIELDER).length).toBe(4);
    expect(slots.filter(s => s.preferredPosition === Position.FORWARD).length).toBe(2);
  });

  it('should have all slots with unique IDs', () => {
    const ids = FORMATION_4_4_2.slots.map(s => s.slotId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should have all slots with unique labels', () => {
    const labels = FORMATION_4_4_2.slots.map(s => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('should have all slots with coordinates in bounds (0-100)', () => {
    FORMATION_4_4_2.slots.forEach(slot => {
      expect(slot.coordinates.x).toBeGreaterThanOrEqual(0);
      expect(slot.coordinates.x).toBeLessThanOrEqual(100);
      expect(slot.coordinates.y).toBeGreaterThanOrEqual(0);
      expect(slot.coordinates.y).toBeLessThanOrEqual(100);
    });
  });

  it('should have all slots with valid FieldZone values', () => {
    const validZones = Object.values(FieldZone);
    FORMATION_4_4_2.slots.forEach(slot => {
      expect(validZones).toContain(slot.zone);
    });
  });

  it('should have all slots with valid Position values', () => {
    const validPositions = Object.values(Position);
    FORMATION_4_4_2.slots.forEach(slot => {
      expect(validPositions).toContain(slot.preferredPosition);
    });
  });

  it('should have all required slot fields defined', () => {
    FORMATION_4_4_2.slots.forEach(slot => {
      expect(slot.slotId).toBeTruthy();
      expect(slot.label).toBeTruthy();
      expect(slot.preferredPosition).toBeDefined();
      expect(slot.coordinates).toBeDefined();
      expect(slot.zone).toBeDefined();
    });
  });

  it('should place goalkeeper at the defensive end (low y)', () => {
    const gk = FORMATION_4_4_2.slots.find(s => s.slotId === 'gk_1')!;
    expect(gk.coordinates.y).toBeLessThan(20);
  });

  it('should place forwards at the attacking end (high y)', () => {
    const forwards = FORMATION_4_4_2.slots.filter(s => s.preferredPosition === Position.FORWARD);
    forwards.forEach(f => {
      expect(f.coordinates.y).toBeGreaterThan(60);
    });
  });
});

describe('ALL_PREDEFINED_FORMATIONS', () => {
  it('should be a non-empty array', () => {
    expect(ALL_PREDEFINED_FORMATIONS).toBeDefined();
    expect(Array.isArray(ALL_PREDEFINED_FORMATIONS)).toBe(true);
    expect(ALL_PREDEFINED_FORMATIONS.length).toBeGreaterThan(0);
  });

  it('should include the classic 4-4-2', () => {
    const has442 = ALL_PREDEFINED_FORMATIONS.some(f => f.id === 'formation_4_4_2');
    expect(has442).toBe(true);
  });

  it('should contain FORMATION_4_4_2 by reference', () => {
    expect(ALL_PREDEFINED_FORMATIONS).toContain(FORMATION_4_4_2);
  });

  it('should have no duplicate formation IDs', () => {
    const ids = ALL_PREDEFINED_FORMATIONS.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should have all entries with required FormationSchema fields', () => {
    ALL_PREDEFINED_FORMATIONS.forEach((formation: FormationSchema) => {
      expect(formation.id).toBeTruthy();
      expect(formation.name).toBeTruthy();
      expect(formation.shortCode).toBeTruthy();
      expect(formation.isUserDefined).toBe(false);
      expect(Array.isArray(formation.slots)).toBe(true);
    });
  });

  it('should have all entries with exactly 11 slots', () => {
    ALL_PREDEFINED_FORMATIONS.forEach(formation => {
      expect(formation.slots.length).toBe(11);
    });
  });

  it('should have all entries with exactly one goalkeeper slot', () => {
    ALL_PREDEFINED_FORMATIONS.forEach(formation => {
      const gkCount = formation.slots.filter(s => s.preferredPosition === Position.GOALKEEPER).length;
      expect(gkCount).toBe(1);
    });
  });
});
