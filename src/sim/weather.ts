import { clamp, rand, type Rng } from './rng';
import type { Track, Weather } from './types';
import type { Tuning } from './tuning';

/**
 * Rain timeline for the whole event, generated before qualifying (prototype model):
 * rain persists for several laps and has an intensity from light (0.25) to heavy (1.0).
 */
export function generateWeather(track: Track, rng: Rng, tuning: Tuning): Weather {
  // chance per lap that rain starts, so that rain happens with ~rainChance over the race
  const startChance = 1 - Math.pow(1 - track.rainChance, 1 / track.laps);
  let raining = rand(rng) < track.rainChance * 0.3;
  let intensity = 0.25 + rand(rng) * 0.75;
  const quali = raining ? intensity : 0;
  const laps: number[] = [];
  for (let l = 0; l < track.laps; l++) {
    if (raining) {
      if (rand(rng) < tuning.weather.stopChance) raining = false;
    } else if (rand(rng) < startChance) {
      raining = true;
      intensity = 0.25 + rand(rng) * 0.75;
    }
    laps.push(raining ? intensity : 0);
  }
  const noise = Array.from({ length: 12 }, () => rand(rng) * 2 - 1);
  return { quali, laps, noise };
}

/** Always dry weather (tests and balance runs). */
export function dryWeather(laps: number): Weather {
  return { quali: 0, laps: new Array(laps).fill(0), noise: new Array(12).fill(0) };
}

/**
 * Chance of rain (0..100, in steps of 10) for race laps [from, to) (0-based lap index)
 * as forecast when the leader is on lap index `now`. Far-away blocks are fuzzy.
 */
export function forecast(track: Track, wx: Weather, from: number, to: number, now: number, block: number): number {
  let wet = 0;
  let n = 0;
  for (let l = from; l < to && l < track.laps; l++) {
    if (wx.laps[l] > 0) wet++;
    n++;
  }
  const trueShare = n ? wet / n : 0;
  const accuracy = clamp(1 - (from - now) / 14, 0.15, 0.95);
  const prior = track.rainChance * 0.5;
  const p = prior * (1 - accuracy) + trueShare * accuracy + wx.noise[block % 12] * 0.18 * (1 - accuracy);
  return Math.round(clamp(p, 0.02, 0.98) * 10) * 10;
}

/** Forecast per block of 4 laps: [{ from, to, chance }], laps 1-based for display. */
export function forecastBlocks(track: Track, wx: Weather, nowLapIndex: number) {
  const out: { fromLap: number; toLap: number; chance: number }[] = [];
  for (let b = 0, from = 0; from < track.laps; b++, from += 4) {
    const to = Math.min(track.laps, from + 4);
    out.push({ fromLap: from + 1, toLap: to, chance: forecast(track, wx, from, to, nowLapIndex, b) });
  }
  return out;
}

/** Forecast for qualifying, shown on the briefing screen. */
export function qualiForecast(track: Track, wx: Weather): number {
  const p = wx.quali > 0 ? 0.75 : track.rainChance * 0.25;
  return Math.round(clamp(p + wx.noise[11] * 0.1, 0.02, 0.98) * 10) * 10;
}

/** Wetness (%) where rain tyres become faster than slicks. */
export function crossoverWetness(tuning: Tuning): number {
  const w = tuning.weather;
  // (x − slickFrom)·slickPer = (rainFrom − x)·rainPer + rainBase
  return (w.rainFrom * w.rainPer + w.rainBase + w.slickFrom * w.slickPer) / (w.slickPer + w.rainPer);
}
