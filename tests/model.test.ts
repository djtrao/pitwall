import { describe, expect, it } from 'vitest';
import {
  crossoverWetness,
  DEFAULT_TUNING as T,
  duelOdds,
  fuelOptions,
  gauss,
  lapsToCliff,
  makeRng,
  makeTuning,
  pickAiTeams,
  rand,
  tyreRuleOk,
  wearPenalty,
  wearPerLap,
  weatherPenalty,
} from '../src/sim';
import { RHEIN } from './helpers';

describe('random numbers', () => {
  it('are the same for the same seed and different for another seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const c = makeRng(43);
    const sa = [rand(a), rand(a), rand(a)];
    expect([rand(b), rand(b), rand(b)]).toEqual(sa);
    expect([rand(c), rand(c), rand(c)]).not.toEqual(sa);
  });
  it('gauss has mean ≈ 0 and sd ≈ 1', () => {
    const r = makeRng(1);
    const xs = Array.from({ length: 20000 }, () => gauss(r));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(sd).toBeGreaterThan(0.95);
    expect(sd).toBeLessThan(1.05);
  });
});

describe('tyres (7.1)', () => {
  it('wear penalty is linear and has a cliff below 25 %', () => {
    expect(wearPenalty(1, T)).toBe(0);
    expect(wearPenalty(0.5, T)).toBeCloseTo(1.0);
    expect(wearPenalty(0.25, T)).toBeCloseTo(1.5);
    expect(wearPenalty(0.2, T)).toBeCloseTo(0.8 * 2 + 0.05 * 16);
  });
  it('wear per lap follows compound × track × mode', () => {
    expect(wearPerLap('S', 1, 0, RHEIN, T, false)).toBeCloseTo(0.09);
    expect(wearPerLap('M', 1, 0, RHEIN, T, false)).toBeCloseTo(0.06);
    expect(wearPerLap('H', 1, 0, RHEIN, T, false)).toBeCloseTo(0.04);
    expect(wearPerLap('S', 3, 0, RHEIN, T, false)).toBeCloseTo(0.27);
    expect(wearPerLap('S', 0, 0, RHEIN, T, false)).toBeCloseTo(0.054);
    expect(wearPerLap('S', 1, 0, { ...RHEIN, wear: 1.3 }, T, false)).toBeCloseTo(0.117);
    expect(wearPerLap('S', 1, 0, RHEIN, T, true)).toBeCloseTo(0.027); // safety car ×0.3
  });
  it('rain tyres wear fast on a drying track', () => {
    expect(wearPerLap('W', 1, 60, RHEIN, T, false)).toBeCloseTo(0.03);
    expect(wearPerLap('W', 1, 10, RHEIN, T, false)).toBeCloseTo(0.14);
  });
  it('soft lasts about 8 laps to the cliff in Normal on a medium-wear track', () => {
    expect(lapsToCliff('S', 1, RHEIN, T)).toBeCloseTo(8.33, 1);
    expect(lapsToCliff('S', 2, RHEIN, T)).toBeCloseTo(5.56, 1);
  });
  it('two-compound rule', () => {
    expect(tyreRuleOk(['S'])).toBe(false);
    expect(tyreRuleOk(['S', 'S'])).toBe(false);
    expect(tyreRuleOk(['S', 'M'])).toBe(true);
    expect(tyreRuleOk(['S', 'W'])).toBe(true);
  });
});

describe('weather (7.4)', () => {
  it('slicks and rain tyres cross over at about 30 % wetness', () => {
    const x = crossoverWetness(T);
    expect(x).toBeGreaterThan(26);
    expect(x).toBeLessThan(32);
    expect(weatherPenalty('S', x - 3, T)).toBeLessThan(weatherPenalty('W', x - 3, T));
    expect(weatherPenalty('S', x + 3, T)).toBeGreaterThan(weatherPenalty('W', x + 3, T));
  });
  it('everybody is slower on a wet track', () => {
    expect(weatherPenalty('W', 100, T)).toBeCloseTo(100 * 0.04 + 0.8);
    expect(weatherPenalty('S', 0, T)).toBe(0);
  });
});

describe('duel odds (7.5)', () => {
  it('match the table on an average track with equal pace', () => {
    expect(duelOdds(T, 0.5, 'inside', 'coverInside', 0).pass).toBeCloseTo(0.2);
    expect(duelOdds(T, 0.5, 'inside', 'coverOutside', 0).pass).toBeCloseTo(0.7);
    expect(duelOdds(T, 0.5, 'outside', 'coverInside', 0)).toEqual({ pass: 0.6, crash: 0.1 });
    expect(duelOdds(T, 0.5, 'outside', 'coverOutside', 0).crash).toBeCloseTo(0.15);
    expect(duelOdds(T, 0.5, 'inside', 'letGo', 0).pass).toBe(1);
    expect(duelOdds(T, 0.5, 'wait', 'coverInside', 0).pass).toBe(0);
  });
  it('scale with the overtaking factor and pace advantage', () => {
    expect(duelOdds(T, 0.25, 'inside', 'coverInside', 0).pass).toBeCloseTo(0.1);
    expect(duelOdds(T, 0.5, 'inside', 'coverInside', 0.6).pass).toBeCloseTo(0.4);
    expect(duelOdds(T, 0.8, 'inside', 'coverOutside', 3).pass).toBeCloseTo(0.95); // capped
  });
});

describe('setup helpers', () => {
  it('fuel options run from 90 % to 105 % in half laps', () => {
    const o = fuelOptions(RHEIN, T);
    expect(o[0]).toBe(14.5);
    expect(o[o.length - 1]).toBe(16.5);
    expect(o).toContain(16.5);
  });
  it('AI grid always has a clearly faster and a clearly slower team', () => {
    for (const n of [2, 3, 4, 5]) {
      const teams = pickAiTeams(n);
      expect(teams).toHaveLength(n);
      expect(Math.min(...teams.map((t) => t.pace))).toBeLessThanOrEqual(-0.25);
      expect(Math.max(...teams.map((t) => t.pace))).toBeGreaterThanOrEqual(0.4);
      for (const t of teams) expect(Math.abs(t.pace)).toBeLessThanOrEqual(0.6);
    }
  });
  it('tuning overrides merge deeply without changing the defaults', () => {
    const t = makeTuning({ tyres: { S: { wear: 12 } } });
    expect(t.tyres.S.wear).toBe(12);
    expect(t.tyres.S.pace).toBe(0);
    expect(T.tyres.S.wear).toBe(9);
  });
});
