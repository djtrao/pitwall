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
      });
    });
  }
  for (const team of pickAiTeams(6 - opts.humans.length, () => rand(rng))) {
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
        // the driver's own skill plus a little day-to-day form
        driverPace: d.skill + range(rng, -0.04, 0.04),
        startTyre: aiStartTyre(opts.track, wx, rng),
        ai,
      });
    });
  }
  return cars;
}

/**
 * Simple qualifying stand-in until the Hot Lap mini-game exists (milestone 4):
 * a lap time from the race model, plus `hotLapBonus` per car (negative = better).
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
