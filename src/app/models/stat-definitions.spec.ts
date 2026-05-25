import { describe, it, expect } from 'vitest';
import {
  isValidStatValue,
  buildStat,
  getStatKeysByCategory,
  STAT_VALUE_MIN,
  STAT_VALUE_MAX,
  STAT_DEFINITIONS
} from './stat-definitions';
import { StatKey, StatCategory } from './types';

describe('stat-definitions', () => {

  describe('isValidStatValue', () => {
    it('should return true for valid stat values within range', () => {
      expect(isValidStatValue(STAT_VALUE_MIN)).toBe(true);
      expect(isValidStatValue(STAT_VALUE_MAX)).toBe(true);
      expect(isValidStatValue(50)).toBe(true);
      expect(isValidStatValue(1)).toBe(true);
      expect(isValidStatValue(99)).toBe(true);
    });

    it('should return false for numbers outside the valid range', () => {
      expect(isValidStatValue(STAT_VALUE_MIN - 1)).toBe(false);
      expect(isValidStatValue(STAT_VALUE_MAX + 1)).toBe(false);
      expect(isValidStatValue(-100)).toBe(false);
      expect(isValidStatValue(200)).toBe(false);
    });

    it('should return false for non-number types', () => {
      expect(isValidStatValue('50')).toBe(false);
      expect(isValidStatValue(null)).toBe(false);
      expect(isValidStatValue(undefined)).toBe(false);
      expect(isValidStatValue({})).toBe(false);
      expect(isValidStatValue([])).toBe(false);
      expect(isValidStatValue(true)).toBe(false);
      expect(isValidStatValue(false)).toBe(false);
    });

    it('should return false for non-finite numbers', () => {
      expect(isValidStatValue(NaN)).toBe(false);
      expect(isValidStatValue(Infinity)).toBe(false);
      expect(isValidStatValue(-Infinity)).toBe(false);
    });
  });

  describe('buildStat', () => {
    it('should build a complete Stat object correctly', () => {
      const key: StatKey = 'speed';
      const value = 85;
      const expectedDef = STAT_DEFINITIONS[key];

      const stat = buildStat(key, value);

      expect(stat).toEqual({
        value,
        type: expectedDef.type,
        description: expectedDef.description,
        hidden: expectedDef.hidden
      });
    });

    it('should correctly build hidden stats', () => {
      const key: StatKey = 'clutch'; // clutch is hidden
      const value = 90;
      const expectedDef = STAT_DEFINITIONS[key];

      const stat = buildStat(key, value);

      expect(stat).toEqual({
        value,
        type: expectedDef.type,
        description: expectedDef.description,
        hidden: true // ensuring it maps correctly
      });
      expect(stat.hidden).toBe(true);
    });
  });

  describe('getStatKeysByCategory', () => {
    it('should return physical stats', () => {
      const category: StatCategory = 'physical';
      const keys = getStatKeysByCategory(category);

      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(STAT_DEFINITIONS[key].type).toBe(category);
      }
      expect(keys).toContain('speed');
      expect(keys).toContain('strength');
    });

    it('should return mental stats', () => {
      const category: StatCategory = 'mental';
      const keys = getStatKeysByCategory(category);

      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(STAT_DEFINITIONS[key].type).toBe(category);
      }
      expect(keys).toContain('vision');
      expect(keys).toContain('composure');
    });

    it('should return skill stats', () => {
      const category: StatCategory = 'skill';
      const keys = getStatKeysByCategory(category);

      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(STAT_DEFINITIONS[key].type).toBe(category);
      }
      expect(keys).toContain('shooting');
      expect(keys).toContain('tackling');
    });

    it('should return goalkeeping stats', () => {
      const category: StatCategory = 'goalkeeping';
      const keys = getStatKeysByCategory(category);

      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(STAT_DEFINITIONS[key].type).toBe(category);
      }
      expect(keys).toContain('handling');
      expect(keys).toContain('reflexes');
    });

    it('should return misc stats', () => {
      const category: StatCategory = 'misc';
      const keys = getStatKeysByCategory(category);

      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(STAT_DEFINITIONS[key].type).toBe(category);
      }
      expect(keys).toContain('overall');
    });
  });

});
