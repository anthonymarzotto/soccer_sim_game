import {
  INJURY_DEFINITIONS,
  TOTAL_INJURY_WEIGHT,
  getInjuryDefinition,
  pickInjuryDefinition,
  rollInjuryDurationWeeks
} from './injuries';

describe('Injuries Data', () => {
  describe('INJURY_DEFINITIONS', () => {
    it('should not be empty', () => {
      expect(INJURY_DEFINITIONS.length).toBeGreaterThan(0);
    });

    it('should have valid total weight', () => {
      const sum = INJURY_DEFINITIONS.reduce((acc, def) => acc + def.weight, 0);
      expect(TOTAL_INJURY_WEIGHT).toBe(sum);
    });
  });

  describe('getInjuryDefinition', () => {
    it('should return the correct definition for a valid ID', () => {
      const def = INJURY_DEFINITIONS[0];
      expect(getInjuryDefinition(def.id)).toBe(def);
    });

    it('should return null for an invalid ID', () => {
      expect(getInjuryDefinition('invalid-id')).toBeNull();
    });
  });

  describe('pickInjuryDefinition', () => {
    it('should return the first definition for a random fraction of 0', () => {
      expect(pickInjuryDefinition(0)).toBe(INJURY_DEFINITIONS[0]);
    });

    it('should return the last definition for a random fraction just below 1', () => {
      expect(pickInjuryDefinition(0.999999)).toBe(INJURY_DEFINITIONS[INJURY_DEFINITIONS.length - 1]);
    });

    it('should pick a definition in the middle correctly', () => {
      const firstWeight = INJURY_DEFINITIONS[0].weight;
      // Fraction that targets right after the first item
      const fraction = (firstWeight + 1) / TOTAL_INJURY_WEIGHT;
      expect(pickInjuryDefinition(fraction)).toBe(INJURY_DEFINITIONS[1]);
    });
  });

  describe('rollInjuryDurationWeeks', () => {
    const mockDef = {
      id: 'test_injury',
      name: 'Test Injury',
      severity: 'Moderate',
      minWeeks: 2,
      maxWeeks: 5,
      weight: 10
    } as const;

    it('should return minWeeks when random fraction is 0', () => {
      expect(rollInjuryDurationWeeks(mockDef, 0)).toBe(2);
    });

    it('should return maxWeeks when random fraction is just below 1', () => {
      expect(rollInjuryDurationWeeks(mockDef, 0.9999)).toBe(5);
    });

    it('should return correct value for a mid-range fraction', () => {
      // span is 5 - 2 + 1 = 4.
      // fraction = 0.5 * 4 = 2. minWeeks + 2 = 4.
      expect(rollInjuryDurationWeeks(mockDef, 0.5)).toBe(4);
    });

    it('should handle minWeeks equal to maxWeeks', () => {
      const fixedDef = { ...mockDef, minWeeks: 3, maxWeeks: 3 };
      expect(rollInjuryDurationWeeks(fixedDef, 0.5)).toBe(3);
    });
  });
});
