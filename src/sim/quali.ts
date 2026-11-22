/**
 * Hot Lap qualifying (SPEC section 6). Pure rules, no DOM:
 * zone widths, corner results, lap times, AI laps and the grid.
 * The timing tap itself happens on the phone; only the zone that was hit is used here.
 */
import { weatherPenalty } from './model';
import { clamp, gauss, makeRng, rand, range, type Rng } from './rng';
import type { Tuning } from './tuning';
import type { CarSetup, Track, Tyre, Weather } from './types';

/** 0 Safe, 1 Attack, 2 Send it! */
export type CornerRisk = 0 | 1 | 2;
export type CornerHit = 'green' | 'yellow' | 'miss';
export type Difficulty = 'rookie' | 'pro';

export const QUALI = {
  /** Green zone width as a share of the bar, per risk level. */
  green: [0.4, 0.25, 0.08],
  /** Each yellow zone beside the green one. */
  yellow: 0.12,
  /** Time change (s) per risk level. */
  delta: {
    green: [0, -0.25, -0.5],
    yellow: [0.3, 0.3, 0.4],
    miss: [0.5, 1.2, 2.0],
  },
  /** Send it! missed: chance the lap is deleted. */
  deleteChance: 0.5,
  softWider: 1.2,
  hardNarrower: 0.85,
  /** Slicks on a wet track (wetness over `wetAbove`). */
  wetSlicks: 0.6,
  wetAbove: 30,
  /** Second run on the same compound. */
  usedTyre: 0.2,
  /** ± random part of a lap (s). */
  noise: 0.1,
  /** Seconds the marker needs to cross the bar. */
  markerSeconds: { rookie: 1.4, pro: 0.95 } as Record<Difficulty, number>,
  /** The marker speeds up while it moves: position = (time share) ^ curve. */
  markerCurve: 1.6,
  /** More risk = braking later = the marker comes faster (Safe, Attack, Send it!). */
  riskSpeed: [1, 1.25, 1.6],
  /** The braking point (centre of the zones) sits somewhere in this part of the bar. */
  centreMin: 0.3,
  centreMax: 0.72,
  /** Seconds to choose the risk before a corner. */
  chooseSeconds: 3,
  runs: 2,
};

export interface Zones {
  /** Braking point: centre of the zones (share of the bar). */
  centre: number;
  /** Half widths (share of the bar) of the green zone and of green + yellow. */
  green: number;
  outer: number;
}

/** Zone sizes for a corner: depends on risk, tyre and wetness. */
export function zonesFor(risk: CornerRisk, tyre: Tyre, wetness: number, centre = 0.5): Zones {
  let f = 1;
  if (tyre === 'S') f *= QUALI.softWider;
  if (tyre === 'H') f *= QUALI.hardNarrower;
  if (tyre !== 'W' && wetness > QUALI.wetAbove) f *= QUALI.wetSlicks;
  const green = (QUALI.green[risk] * f) / 2;
  return { centre, green, outer: green + QUALI.yellow * f };
}

/** Which zone a tap at `pos` (0..1 along the bar, null = no tap) hit. */
export function hitAt(pos: number | null, z: Zones): CornerHit {
  if (pos === null) return 'miss';
  const d = Math.abs(pos - z.centre);
  if (d <= z.green) return 'green';
  if (d <= z.outer) return 'yellow';
  return 'miss';
}

export interface CornerResult {
  risk: CornerRisk;
  hit: CornerHit;
  /** Time change (s). */
  delta: number;
  /** Lap deleted (track limits). */
  deleted: boolean;
}

/** Random braking point for a corner. */
export function randomCentre(roll: number): number {
  return QUALI.centreMin + (QUALI.centreMax - QUALI.centreMin) * roll;
}

/** Marker position (0..1) after `seconds`; it speeds up while it moves. */
export function markerAt(seconds: number, difficulty: Difficulty, risk: CornerRisk = 0): number {
  const crossing = QUALI.markerSeconds[difficulty] / QUALI.riskSpeed[risk];
  return Math.min(1, Math.pow(Math.max(0, seconds) / crossing, QUALI.markerCurve));
}

/** Turn a hit into a time change. `roll` is a random number 0..1 (deletion on a missed Send it!). */
export function cornerResult(risk: CornerRisk, hit: CornerHit, roll: number): CornerResult {
  if (hit === 'miss' && risk === 2 && roll < QUALI.deleteChance) return { risk, hit, delta: 0, deleted: true };
  return { risk, hit, delta: QUALI.delta[hit][risk], deleted: false };
}

/** Lap time without the corner results: car, driver, tyre, wetness (and used tyres). */
export function baseHotLap(car: CarSetup, tyre: Tyre, wetness: number, track: Track, tuning: Tuning, usedTyre: boolean): number {
  return (
    track.base + car.carPace + car.driverPace + tuning.tyres[tyre].pace + weatherPenalty(tyre, wetness, tuning) + (usedTyre ? QUALI.usedTyre : 0)
  );
}

/** Full lap time, or null if deleted. */
export function hotLapTime(base: number, corners: CornerResult[], rng: Rng): number | null {
  if (corners.some((c) => c.deleted)) return null;
  return base + corners.reduce((s, c) => s + c.delta, 0) + range(rng, -QUALI.noise, QUALI.noise);
}

export interface QualiRun {
  carId: string;
  run: number;
  tyre: Tyre;
  corners: CornerResult[];
  /** null = lap deleted */
  time: number | null;
}

export interface QualiEntry {
  car: CarSetup;
  best: number | null;
  bestTyre: Tyre;
  runs: QualiRun[];
}

/** Best tyre for qualifying in these conditions (the fastest one). */
export function fastestTyre(wetness: number, tuning: Tuning): Tyre {
  const opts: Tyre[] = ['S', 'M', 'H', 'W'];
  return opts.reduce((best, k) =>
    tuning.tyres[k].pace + weatherPenalty(k, wetness, tuning) < tuning.tyres[best].pace + weatherPenalty(best, wetness, tuning) ? k : best,
  );
}

/**
 * Simulated qualifying for an AI driver: risk style from its aggression, taps spread around the
 * braking point (better drivers aim more precisely).
 */
export function aiQualifying(car: CarSetup, track: Track, wx: Weather, tuning: Tuning, rng: Rng): QualiRun[] {
  const wet = wx.quali * 100;
  const tyre = fastestTyre(wet, tuning);
  const aggression = car.ai?.aggression ?? 0.5;
  // precision: faster drivers (negative driverPace) aim a little better
  const aim = clamp(0.15 + car.driverPace * 0.2, 0.1, 0.2);
  const runs: QualiRun[] = [];
  for (let run = 0; run < QUALI.runs; run++) {
    const used = run > 0 && runs[0].tyre === tyre;
    const corners: CornerResult[] = [];
    for (let k = 0; k < 3; k++) {
      const r = rand(rng);
      // cautious drivers mostly Safe, aggressive ones gamble; second runs are a bit bolder
      const bold = aggression + (run > 0 ? 0.15 : 0);
      const risk: CornerRisk = r < 0.55 - bold * 0.45 ? 0 : r < 0.9 - bold * 0.3 ? 1 : 2;
      const centre = randomCentre(rand(rng));
      const pos = centre + gauss(rng) * aim;
      corners.push(cornerResult(risk, hitAt(pos, zonesFor(risk, tyre, wet, centre)), rand(rng)));
    }
    const time = hotLapTime(baseHotLap(car, tyre, wet, track, tuning, used), corners, rng);
    runs.push({ carId: car.id, run, tyre, corners, time });
  }
  return runs;
}

/** All AI drivers' runs for a session (deterministic for a seed). */
export function aiSession(cars: CarSetup[], track: Track, wx: Weather, tuning: Tuning, seed: number): QualiRun[] {
  const rng = makeRng(seed, 9);
  return cars.filter((c) => !c.human).flatMap((c) => aiQualifying(c, track, wx, tuning, rng));
}

/** Leaderboard from all runs so far: best lap first, drivers without a valid lap last. */
export function leaderboard(cars: CarSetup[], runs: QualiRun[]): QualiEntry[] {
  const entries = cars.map((car) => {
    const mine = runs.filter((r) => r.carId === car.id);
    const valid = mine.filter((r) => r.time !== null);
    const bestRun = valid.reduce<QualiRun | null>((b, r) => (b === null || r.time! < b.time! ? r : b), null);
    return { car, best: bestRun?.time ?? null, bestTyre: bestRun?.tyre ?? mine[0]?.tyre ?? car.startTyre, runs: mine };
  });
  return entries.sort((a, b) => {
    if (a.best === null && b.best === null) return a.car.carPace - b.car.carPace;
    if (a.best === null) return 1;
    if (b.best === null) return -1;
    return a.best - b.best;
  });
}

/** Grid for the race: qualifying order, each driver on the tyre of his best lap. */
export function gridFromQualifying(cars: CarSetup[], runs: QualiRun[]): CarSetup[] {
  return leaderboard(cars, runs).map((e) => ({ ...e.car, startTyre: e.bestTyre }));
}
