import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class RngService {
  private generator: () => number = () => Math.random();

  beginSimulation(seed?: string): void {
    if (!seed) {
      this.generator = () => Math.random();
      return;
    }

    this.generator = this.createSeededGenerator(seed);
  }

  random(): number {
    return this.generator();
  }

  /**
   * Mulberry32 — a fast 32-bit PRNG with good statistical quality for
   * simulation use cases. Each call advances a single 32-bit state counter
   * (Weyl sequence) and applies a MurmurHash3-style finalizer to produce
   * a well-distributed output. Chosen because:
   *   - deterministic given the same seed
   *   - no external dependencies
   *   - sufficient randomness quality for match simulation (not cryptographic)
   *   - passes most TestU01 SmallCrush tests
   */
  private createSeededGenerator(seed: string): () => number {
    let state = this.hashSeed(seed);

    return () => {
      state += 0x6d2b79f5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * FNV-1a 32-bit hash — maps an arbitrary string seed to a 32-bit unsigned
   * integer used as the initial Mulberry32 state. FNV-1a distributes short
   * strings well and avoids the all-zero state that would make the PRNG
   * produce a degenerate sequence.
   */
  private hashSeed(seed: string): number {
    let hash = 2166136261;

    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
  }
}
