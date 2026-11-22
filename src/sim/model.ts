import type { Car, Mode, Track, Tyre } from './types';
import type { Tuning } from './tuning';

/** Time lost because of worn tyres (s per lap). */
export function wearPenalty(cond: number, t: Tuning): number {
  let p = (1 - cond) * t.wearSlope;
  if (cond < t.cliffAt) p += (t.cliffAt - cond) * t.cliffSlope;
  return p;
}

/** Time lost because of track wetness for this tyre (s per lap), without the all-cars part. */
export function wetTyrePenalty(tyre: Tyre, wetness: number, t: Tuning): number {
  const w = t.weather;
  if (tyre === 'W') return Math.max(0, w.rainFrom - wetness) * w.rainPer + w.rainBase;
  return Math.max(0, wetness - w.slickFrom) * w.slickPer;
}

export function weatherPenalty(tyre: Tyre, wetness: number, t: Tuning): number {
  return wetness * t.weather.allPerWet + wetTyrePenalty(tyre, wetness, t);
}

/** Tyre wear as a share of condition per lap (0.09 = 9 % per lap). */
export function wearPerLap(tyre: Tyre, mode: Mode, wetness: number, track: Track, t: Tuning, safetyCar: boolean): number {
  let r: number;
  if (tyre === 'W') r = wetness < t.tyres.W.dryBelow ? t.tyres.W.wearDry : t.tyres.W.wear;
  else {
    r = t.tyres[tyre].wear * track.wear;
    if (wetness > t.slickWetWear.above) r *= t.slickWetWear.factor;
  }
  r *= t.modes[mode].wear;
  if (safetyCar) r *= t.safetyCar.wear;
  return r / 100;
}

/** T = T_base + car + driver + tyre + wear + mode + weather + noise (+ damage). */
export function carLapTime(c: Car, track: Track, wetness: number, t: Tuning): number {
  let lt = track.base + c.carPace + c.driverPace;
  lt += t.tyres[c.tyre].pace + wearPenalty(c.cond, t);
  lt += t.modes[c.mode].pace;
  lt += weatherPenalty(c.tyre, wetness, t);
  lt += c.noise;
  if (c.flatSpot) lt += t.mistakes.flatSpotPace;
  if (c.wingDamage) lt += t.duel.wingPace;
  if (c.engineDamage) lt += t.damage.enginePace;
  return lt;
}

/** Mistake chance per lap for this car right now. */
export function mistakeChance(c: Car, wetness: number, t: Tuning): number {
  const m = t.mistakes;
  let p = t.modes[c.mode].mistake;
  if (c.wingDamage) p *= t.damage.wingMistakes;
  if (c.cond < m.wornBelow) p *= 1 + ((m.wornBelow - c.cond) / m.wornBelow) * (m.wornMax - 1);
  if (c.tyre !== 'W' && wetness > m.wetFrom) {
    const k = Math.min(1, (wetness - m.wetFrom) / (m.wetFull - m.wetFrom));
    p *= 1 + k * (m.wetMax - 1);
  }
  return p;
}

/** True when the car has used two different dry compounds, or rain tyres. */
export function tyreRuleOk(used: readonly Tyre[]): boolean {
  if (used.includes('W')) return true;
  return new Set(used).size >= 2;
}

/**
 * Estimated time cost (s) of a stint of `laps` laps on fresh `tyre` in a given mode on a
 * dry track, relative to a fresh Soft with no wear. Used by the AI and the tyre guide.
 */
export function stintCost(tyre: Tyre, laps: number, track: Track, t: Tuning, mode: Mode = 1): number {
  const r = wearPerLap(tyre, mode, 0, track, t, false);
  let cond = 1;
  let cost = 0;
  for (let i = 0; i < laps; i++) {
    const mid = Math.max(0, cond - r / 2);
    cost += t.tyres[tyre].pace + wearPenalty(mid, t) + (tyre === 'W' ? wetTyrePenalty('W', 0, t) : 0);
    cond = Math.max(0, cond - r);
  }
  return cost;
}

/** Laps until a fresh tyre reaches the cliff (shown in the track briefing tyre guide). */
export function lapsToCliff(tyre: Tyre, mode: Mode, track: Track, t: Tuning, wetness = 0): number {
  const r = wearPerLap(tyre, mode, wetness, track, t, false);
  return (1 - t.cliffAt) / r;
}
