import { describe, it, expect, vi } from 'vitest';
import { gaussianRandom, clamp, lerp } from './math';

describe('math utilities', () => {
  describe('gaussianRandom', () => {
    it('returns the mean when variance is 0', () => {
      expect(gaussianRandom({ mean: 10, variance: 0 })).toBe(10);
      expect(gaussianRandom({ mean: -5, variance: 0 })).toBe(-5);
    });

    it('returns values distributed around the mean', () => {
      // Mocking Math.random to test the deterministic output of Box-Muller
      // u = 0.5 (1 - 0.5 = 0.5), v = 0.5
      // z = sqrt(-2 * ln(0.5)) * cos(2 * PI * 0.5)
      // z = sqrt(-2 * -0.693147) * cos(PI)
      // z = sqrt(1.386294) * -1 = 1.17741 * -1 = -1.17741

      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const mean = 10;
      const variance = 4; // stdev = 2
      const expectedZ = Math.sqrt(-2.0 * Math.log(0.5)) * Math.cos(2.0 * Math.PI * 0.5);
      const expected = expectedZ * 2 + mean;

      expect(gaussianRandom({ mean, variance })).toBeCloseTo(expected, 5);

      randomSpy.mockRestore();
    });

    it('handles negative variance by treating it as 0', () => {
      expect(gaussianRandom({ mean: 10, variance: -5 })).toBe(10);
    });
  });

  describe('clamp', () => {
    it('returns the value if it is within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it('returns the min if the value is below range', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it('returns the max if the value is above range', () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('handles min and max being the same', () => {
      expect(clamp(5, 10, 10)).toBe(10);
      expect(clamp(15, 10, 10)).toBe(10);
      expect(clamp(10, 10, 10)).toBe(10);
    });
  });

  describe('lerp', () => {
    it('returns the start value when t = 0', () => {
      expect(lerp(0, 10, 0)).toBe(0);
      expect(lerp(5, 15, 0)).toBe(5);
    });

    it('returns the end value when t = 1', () => {
      expect(lerp(0, 10, 1)).toBe(10);
      expect(lerp(5, 15, 1)).toBe(15);
    });

    it('returns the midpoint when t = 0.5', () => {
      expect(lerp(0, 10, 0.5)).toBe(5);
      expect(lerp(10, 20, 0.5)).toBe(15);
    });

    it('extrapolates when t is outside [0, 1]', () => {
      expect(lerp(0, 10, -0.5)).toBe(-5);
      expect(lerp(0, 10, 1.5)).toBe(15);
    });
  });
});
