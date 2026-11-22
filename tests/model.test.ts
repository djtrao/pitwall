import { describe, expect, it } from 'vitest';
import {
  crossoverWetness,
  DEFAULT_TUNING as T,
  duelOdds,
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
    expect(wearPenalty(0.5, T)).toBeCloseTo(0.5 * T.wearSlope);
    expect(wearPenalty(0.25, T)).toBeCloseTo(0.75 * T.wearSlope);
    // below the cliff the loss grows much faster
    expect(wearPenalty(0.2, T)).toBeCloseTo(0.8 * T.wearSlope + 0.05 * T.cliffSlope);
    expect(wearPenalty(0.15, T) - wearPenalty(0.2, T)).toBeGreaterThan(3 * (wearPenalty(0.3, T) - wearPenalty(0.35, T)));
  });
  it('wear per lap follows compound × track × mode', () => {
    const s = T.tyres.S.wear / 100;
    expect(RHEIN.wear).toBe(1);
    expect(wearPerLap('S', 1, 0, RHEIN, T, false)).toBeCloseTo(s);
    expect(wearPerLap('M', 1, 0, RHEIN, T, false)).toBeCloseTo(T.tyres.M.wear / 100);
    expect(wearPerLap('H', 1, 0, RHEIN, T, false)).toBeCloseTo(T.tyres.H.wear / 100);
    expect(wearPerLap('S', 3, 0, RHEIN, T, false)).toBeCloseTo(s * T.modes[3].wear);
    expect(wearPerLap('S', 0, 0, RHEIN, T, false)).toBeCloseTo(s * T.modes[0].wear);
    expect(wearPerLap('S', 1, 0, { ...RHEIN, wear: 1.3 }, T, false)).toBeCloseTo(s * 1.3);
    expect(wearPerLap('S', 1, 0, RHEIN, T, true)).toBeCloseTo(s * T.safetyCar.wear);
    // softer = faster but wears more
    expect(T.tyres.S.wear).toBeGreaterThan(T.tyres.M.wear);
    expect(T.tyres.M.wear).toBeGreaterThan(T.tyres.H.wear);
    expect(T.tyres.S.pace).toBeLessThan(T.tyres.M.pace);
    expect(T.tyres.M.pace).toBeLessThan(T.tyres.H.pace);
  });
  it('rain tyres wear fast on a drying track', () => {
    expect(wearPerLap('W', 1, 60, RHEIN, T, false)).toBeCloseTo(0.03);
    expect(wearPerLap('W', 1, 10, RHEIN, T, false)).toBeCloseTo(0.14);
  });
  it('a soft stint lasts a few laps less than half a race on a medium-wear track', () => {
    expect(lapsToCliff('S', 1, RHEIN, T)).toBeGreaterThan(RHEIN.laps / 3);
    expect(lapsToCliff('S', 1, RHEIN, T)).toBeLessThan(RHEIN.laps / 2);
    expect(lapsToCliff('S', 2, RHEIN, T)).toBeLessThan(lapsToCliff('S', 1, RHEIN, T));
    expect(lapsToCliff('H', 1, RHEIN, T)).toBeGreaterThan(RHEIN.laps / 2);
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
    const before = T.tyres.S.wear;
    const t = makeTuning({ tyres: { S: { wear: 99 } } });
    expect(t.tyres.S.wear).toBe(99);
    expect(t.tyres.S.pace).toBe(T.tyres.S.pace);
    expect(T.tyres.S.wear).toBe(before);
  });
});
