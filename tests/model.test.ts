import { describe, expect, it } from 'vitest';
import {
  crossoverWetness,
  DEFAULT_TUNING as T,
  duelOutcomes,
  gauss,
  lapsToCliff,
  makeRng,
  makeTuning,
  pickAiTeams,
  rand,
  tyreRuleOk,
  wearPenalty,
  wearPerLap,
  lapScale,
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
    // per-lap numbers are given for a 78 s lap and scale with the track's lap time
    const s = (T.tyres.S.wear / 100) * lapScale(RHEIN);
    const k = lapScale(RHEIN);
    expect(RHEIN.wear).toBe(1);
    expect(wearPerLap('S', 1, 0, RHEIN, T, false)).toBeCloseTo(s);
    expect(wearPerLap('M', 1, 0, RHEIN, T, false)).toBeCloseTo((T.tyres.M.wear / 100) * k);
    expect(wearPerLap('H', 1, 0, RHEIN, T, false)).toBeCloseTo((T.tyres.H.wear / 100) * k);
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
    expect(wearPerLap('W', 1, 60, RHEIN, T, false)).toBeCloseTo(0.03 * lapScale(RHEIN));
    expect(wearPerLap('W', 1, 10, RHEIN, T, false)).toBeCloseTo(0.14 * lapScale(RHEIN));
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
    expect(x).toBeLessThan(35);
    expect(weatherPenalty('S', x - 3, T)).toBeLessThan(weatherPenalty('W', x - 3, T));
    expect(weatherPenalty('S', x + 3, T)).toBeGreaterThan(weatherPenalty('W', x + 3, T));
  });
  it('everybody is slower on a wet track', () => {
    expect(weatherPenalty('W', 100, T)).toBeCloseTo(100 * T.weather.allPerWet + T.weather.rainBase);
    expect(weatherPenalty('S', 0, T)).toBe(0);
  });
});

describe('duel outcomes (7.5, risk levels)', () => {
  const sum = (o: Record<string, number>) => Object.values(o).reduce((x, y) => x + y, 0);
  it('all outcome chances add up to 1 for every pair of levels', () => {
    for (const a of [0, 1, 2, 3, 4] as const) for (const d of [0, 1, 2, 3, 4] as const) {
      for (const adv of [-1, 0, 0.6, 2]) expect(sum(duelOutcomes(T, 0.5, a, d, adv))).toBeCloseTo(1, 6);
    }
  });
  it('Wait never attacks, Let go always lets the attacker past', () => {
    expect(duelOutcomes(T, 0.5, 0, 3, 0).wait).toBe(1);
    expect(duelOutcomes(T, 0.5, 2, 0, 0).pass).toBe(1);
  });
  it('a higher attack level passes more often, a harder defence lets fewer through', () => {
    const p = (a: 1 | 2 | 3, d: 1 | 2 | 3 | 4) => duelOutcomes(T, 0.5, a, d, 0).pass;
    expect(p(2, 2)).toBeGreaterThan(p(1, 2));
    expect(p(3, 2)).toBeGreaterThan(p(2, 2));
    expect(p(2, 3)).toBeLessThan(p(2, 2));
    expect(p(2, 4)).toBeLessThan(p(2, 3));
  });
  it('the harder both fight, the higher the crash risk', () => {
    const crash = (a: 1 | 2 | 3, d: 1 | 2 | 3 | 4) => duelOutcomes(T, 0.5, a, d, 0).crash;
    expect(crash(1, 1)).toBe(0);
    expect(crash(3, 3)).toBeGreaterThan(crash(2, 2));
    expect(crash(3, 4)).toBeGreaterThan(crash(3, 3));
  });
  it('All or nothing rarely works and is almost always punished when it fails', () => {
    const o = duelOutcomes(T, 0.5, 4, 2, 0);
    expect(o.pass).toBeLessThan(0.25);
    expect(o.spin + o.off + o.crash).toBeGreaterThan(0.6);
    // but it ignores how hard the defender blocks
    expect(duelOutcomes(T, 0.5, 4, 4, 0).pass).toBeGreaterThan(duelOutcomes(T, 0.5, 1, 4, 0).pass);
  });
  it('scales with the overtaking factor and pace advantage', () => {
    expect(duelOutcomes(T, 0.25, 1, 1, 0).pass).toBeCloseTo(duelOutcomes(T, 0.5, 1, 1, 0).pass / 2);
    expect(duelOutcomes(T, 0.5, 1, 1, 0.6).pass).toBeGreaterThan(duelOutcomes(T, 0.5, 1, 1, 0).pass);
    expect(duelOutcomes(T, 0.8, 3, 1, 5).pass).toBeLessThanOrEqual(T.duel.maxPass);
  });
});

describe('setup helpers', () => {
  it('AI grid always has a clearly faster and a clearly slower team', () => {
    for (const n of [2, 3, 4, 5]) for (const r of [0, 0.3, 0.7, 0.99]) {
      const teams = pickAiTeams(n, () => r);
      expect(teams).toHaveLength(n);
      expect(Math.min(...teams.map((t) => t.pace))).toBeLessThanOrEqual(-0.15);
      expect(Math.max(...teams.map((t) => t.pace))).toBeGreaterThanOrEqual(0.35);
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
