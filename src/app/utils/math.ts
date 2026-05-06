export interface GaussianParams {
  mean: number;
  variance: number;
}

/**
 * Generates a normally distributed random number using the Box-Muller transform.
 */
export function gaussianRandom({ mean, variance }: GaussianParams): number {
  const stdev = Math.sqrt(variance);
  const u = 1 - Math.random(); // Converting [0,1) to (0,1]
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdev + mean;
}

/**
 * Clamps a number between a minimum and maximum value.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
