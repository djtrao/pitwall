/**
 * Seeded random number generator (mulberry32).
 * The state is a plain object so the whole race state stays JSON-serialisable
 * (the server can send it to phones) and every run with the same seed is identical.
 */
export interface Rng {
  s: number;
}

export function makeRng(seed: number, stream = 0): Rng {
  // Mix seed and stream so different streams are independent.
  let h = (seed ^ 0x9e3779b9) + Math.imul(stream + 1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return { s: h | 0 };
}

/** Uniform number in [0, 1). */
export function rand(r: Rng): number {
  let t = (r.s = (r.s + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Uniform number in [a, b). */
export function range(r: Rng, a: number, b: number): number {
  return a + (b - a) * rand(r);
}

/** Integer in [a, b] (both inclusive). */
export function int(r: Rng, a: number, b: number): number {
  return a + Math.floor(rand(r) * (b - a + 1));
}

/** Roughly normal distributed, mean 0, standard deviation 1 (clipped to about ±3). */
export function gauss(r: Rng): number {
  return (rand(r) + rand(r) + rand(r) - 1.5) * 2;
}

export function chance(r: Rng, p: number): boolean {
  return rand(r) < p;
}

export function pick<T>(r: Rng, items: readonly T[]): T {
  return items[Math.floor(rand(r) * items.length)];
}

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
