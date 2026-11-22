import { gauss, makeRng, rand, range, type Rng } from './rng';
import { weatherPenalty } from './model';
import { pickAiTeams } from './teams';
import type { Tuning } from './tuning';
import type { AiProfile, CarSetup, Track, Tyre, Weather } from './types';

export interface HumanTeam {
  id: string;
  name: string;
  color: string;
  drivers: [{ name: string; num: number }, { name: string; num: number }];
}

export interface FieldOptions {
  humans: HumanTeam[];
  seed: number;
  track: Track;
  tuning: Tuning;
}

/** Start fuel options in laps: 90 % – 105 % of race distance in 0.5-lap steps. */
export function fuelOptions(track: Track, tuning: Tuning): number[] {
  const lo = Math.ceil(track.laps * tuning.fuel.min * 2) / 2;
  const hi = Math.floor(track.laps * tuning.fuel.max * 2) / 2;
  const out: number[] = [];
  for (let f = lo; f <= hi + 1e-9; f += 0.5) out.push(f);
  return out;
}

export const defaultFuel = (track: Track) => track.laps + 0.5;

/** AI fuel choice: around race distance with some variation (they push at the end). */
export function aiFuel(track: Track, rng: Rng, tuning: Tuning): number {
  const opts = fuelOptions(track, tuning);
  const want = track.laps + 0.5 + Math.round(range(rng, -0.5, 1.5)) * 0.5;
  return opts.reduce((best, f) => (Math.abs(f - want) < Math.abs(best - want) ? f : best), opts[0]);
}

/** AI start tyre: rain tyres if quali was wet, otherwise mostly Soft, Medium on high-wear tracks. */
export function aiStartTyre(track: Track, wx: Weather, rng: Rng): Tyre {
  if (wx.quali * 100 > 30) return 'W';
  const softShare = track.wear > 1.15 ? 0.35 : track.wear < 0.9 ? 0.75 : 0.6;
  return rand(rng) < softShare ? 'S' : 'M';
}

/**
 * Build the 12 car setups: human teams first, AI teams fill the rest.
 * AI car numbers that clash with human numbers are changed.
 */
export function buildField(opts: FieldOptions, wx: Weather): CarSetup[] {
  const rng = makeRng(opts.seed, 7);
  const taken = new Set<number>();
  const cars: CarSetup[] = [];
  for (const h of opts.humans) {
    h.drivers.forEach((d, i) => {
      taken.add(d.num);
      cars.push({
        id: `${h.id}-${i + 1}`,
        name: d.name,
        num: d.num,
        teamId: h.id,
        teamName: h.name,
        color: h.color,
        human: true,
        carPace: 0,
        driverPace: 0,
        startTyre: wx.quali * 100 > 30 ? 'W' : 'S',
        fuel: defaultFuel(opts.track),
      });
    });
  }
  for (const team of pickAiTeams(6 - opts.humans.length)) {
    team.drivers.forEach((d, i) => {
      let num = d.num;
      while (taken.has(num)) num = 2 + ((num + 9) % 98);
      taken.add(num);
      const ai: AiProfile = { wetThreshold: range(rng, 26, 40), dryThreshold: range(rng, 16, 26), aggression: rand(rng) };
      cars.push({
        id: `${team.id}-${i + 1}`,
        name: d.name,
        num,
        teamId: team.id,
        teamName: team.name,
        color: team.color,
        human: false,
        carPace: team.pace,
        driverPace: range(rng, -0.15, 0.15),
        startTyre: aiStartTyre(opts.track, wx, rng),
        fuel: aiFuel(opts.track, rng, opts.tuning),
        ai,
      });
    });
  }
  return cars;
}

/**
 * Simple qualifying stand-in until the Hot Lap mini-game exists (milestone 4):
 * a lap time from the race model with light fuel, plus `hotLapBonus` per car (negative = better).
 * Returns the cars sorted into grid order.
 */
export function quickQualifying(
  cars: CarSetup[],
  track: Track,
  wx: Weather,
  tuning: Tuning,
  seed: number,
  hotLapBonus: Record<string, number> = {},
): CarSetup[] {
  const rng = makeRng(seed, 8);
  const wet = wx.quali * 100;
  const timed = cars.map((c) => {
    const t =
      track.base + c.carPace + c.driverPace + tuning.tyres[c.startTyre].pace + weatherPenalty(c.startTyre, wet, tuning) +
      (hotLapBonus[c.id] ?? 0) + gauss(rng) * 0.25;
    return { c, t };
  });
  timed.sort((a, b) => a.t - b.t);
  return timed.map((x) => x.c);
}
