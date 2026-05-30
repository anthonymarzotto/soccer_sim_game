import { TestBed } from '@angular/core/testing';
import { RngService } from './rng.service';

describe('RngService', () => {
  let service: RngService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RngService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('random()', () => {
    it('should return a number between 0 and 1 using Math.random by default', () => {
      const val = service.random();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    });
  });

  describe('beginSimulation()', () => {
    it('should create a deterministic generator when provided a seed', () => {
      service.beginSimulation('test-seed-123');
      const firstVal = service.random();
      const secondVal = service.random();

      // Reset with the same seed
      service.beginSimulation('test-seed-123');
      const resetFirstVal = service.random();
      const resetSecondVal = service.random();

      expect(firstVal).toEqual(resetFirstVal);
      expect(secondVal).toEqual(resetSecondVal);
      // Ensure it's actually changing on subsequent calls
      expect(firstVal).not.toEqual(secondVal);
    });

    it('should create different sequences for different seeds', () => {
      service.beginSimulation('seed-a');
      const valA = service.random();

      service.beginSimulation('seed-b');
      const valB = service.random();

      expect(valA).not.toEqual(valB);
    });

    it('should revert to non-deterministic Math.random when called without a seed', () => {
      // Mock Math.random to verify it is being called
      const originalRandom = Math.random;
      let mathRandomCalled = false;
      Math.random = () => {
        mathRandomCalled = true;
        return 0.5;
      };

      try {
        service.beginSimulation();
        const val = service.random();
        expect(mathRandomCalled).toBe(true);
        expect(val).toBe(0.5);
      } finally {
        Math.random = originalRandom;
      }
    });
  });

  describe('nextUUID()', () => {
    it('should return a valid UUID format string', () => {
      const uuid = service.nextUUID();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid).toMatch(uuidRegex);
    });

    it('should use deterministic fallback generator when crypto is not available', () => {
      // Cache original crypto if it exists
      const originalCrypto = (globalThis as unknown as { crypto?: unknown }).crypto;

      try {
        // Remove crypto or replace with object missing randomUUID
        Object.defineProperty(globalThis, 'crypto', {
          value: undefined,
          writable: true,
          configurable: true
        });

        // Set a seed to make it deterministic
        service.beginSimulation('uuid-seed');

        const firstUuid = service.nextUUID();
        const secondUuid = service.nextUUID();

        // Reset and check if we get same UUIDs
        service.beginSimulation('uuid-seed');
        const resetFirstUuid = service.nextUUID();
        const resetSecondUuid = service.nextUUID();

        expect(firstUuid).toEqual(resetFirstUuid);
        expect(secondUuid).toEqual(resetSecondUuid);
        expect(firstUuid).not.toEqual(secondUuid);

        // Verify format of generated fallback UUIDs
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(firstUuid).toMatch(uuidRegex);

      } finally {
        // Restore original crypto
        Object.defineProperty(globalThis, 'crypto', {
          value: originalCrypto,
          writable: true,
          configurable: true
        });
      }
    });
  });
});
