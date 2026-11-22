import { describe, expect, it } from 'vitest';
import {
  aiSession,
  baseHotLap,
  buildField,
  cornerResult,
  dryWeather,
  gridFromQualifying,
  hitAt,
  markerAt,
  randomCentre,
  hotLapTime,
  leaderboard,
  makeRng,
  makeTuning,
  QUALI,
  zonesFor,
  type QualiRun,
} from '../src/sim';
import { pickSpots, shuffledWheels } from '../src/ui/pitgame';
import { humanCar, RHEIN } from './helpers';

const T = makeTuning();

describe('Hot Lap zones (section 6)', () => {
  it('green zone is 40 / 25 / 8 % of the bar for Safe / Attack / Send it on Medium', () => {
    expect(zonesFor(0, 'M', 0).green * 2).toBeCloseTo(0.4);
    expect(zonesFor(1, 'M', 0).green * 2).toBeCloseTo(0.25);
    expect(zonesFor(2, 'M', 0).green * 2).toBeCloseTo(0.08);
  });
  it('Soft makes zones 20 % wider, Hard 15 % narrower, slicks in the wet 40 % narrower', () => {
    expect(zonesFor(1, 'S', 0).green / zonesFor(1, 'M', 0).green).toBeCloseTo(1.2);
    expect(zonesFor(1, 'H', 0).green / zonesFor(1, 'M', 0).green).toBeCloseTo(0.85);
    expect(zonesFor(1, 'M', 50).green / zonesFor(1, 'M', 0).green).toBeCloseTo(0.6);
    expect(zonesFor(1, 'W', 50).green).toBeCloseTo(zonesFor(1, 'M', 0).green);
  });
  it('a tap in the middle is green, a bit off is yellow, far off or no tap is a miss', () => {
    const z = zonesFor(0, 'M', 0);
    expect(hitAt(0.5, z)).toBe('green');
    expect(hitAt(0.5 + z.green + 0.01, z)).toBe('yellow');
    expect(hitAt(0.02, z)).toBe('miss');
    expect(hitAt(null, z)).toBe('miss');
  });
});

describe('Hot Lap timing is a real challenge', () => {
  /** How long (ms) the marker stays in the green zone. */
  function greenWindow(risk: 0 | 1 | 2, centre: number, d: 'rookie' | 'pro'): number {
    const z = zonesFor(risk, 'M', 0, centre);
    let inside = 0;
    for (let ms = 0; ms < 3000; ms++) if (hitAt(markerAt(ms / 1000, d, risk), z) === 'green') inside++;
    return inside;
  }
  it('Send it! gives only about 50 ms for Pro and 80 ms for Rookies', () => {
    for (const c of [0.3, 0.5, 0.72]) {
      expect(greenWindow(2, c, 'pro')).toBeLessThan(65);
      expect(greenWindow(2, c, 'rookie')).toBeLessThan(95);
    }
  });
  it('Attack sits in between', () => {
    expect(greenWindow(1, 0.5, 'pro')).toBeLessThan(greenWindow(0, 0.5, 'pro') / 2);
    expect(greenWindow(1, 0.5, 'pro')).toBeGreaterThan(greenWindow(2, 0.5, 'pro') * 2);
  });
  it('Safe stays easy-ish', () => {
    expect(greenWindow(0, 0.5, 'rookie')).toBeGreaterThan(350);
  });
  it('the braking point moves around and the marker speeds up', () => {
    expect(randomCentre(0)).toBeCloseTo(QUALI.centreMin);
    expect(randomCentre(0.999)).toBeCloseTo(QUALI.centreMax, 2);
    const early = markerAt(0.2, 'pro') - markerAt(0.1, 'pro');
    const late = markerAt(0.8, 'pro') - markerAt(0.7, 'pro');
    expect(late).toBeGreaterThan(early * 1.5);
  });
});

describe('Hot Lap corner results', () => {
  it('follow the table in the spec', () => {
    expect(cornerResult(0, 'green', 0.9).delta).toBe(0);
    expect(cornerResult(0, 'yellow', 0.9).delta).toBe(0.3);
    expect(cornerResult(0, 'miss', 0.9).delta).toBe(0.5);
    expect(cornerResult(1, 'green', 0.9).delta).toBe(-0.25);
    expect(cornerResult(1, 'miss', 0.9).delta).toBe(1.2);
    expect(cornerResult(2, 'green', 0.9).delta).toBe(-0.5);
    expect(cornerResult(2, 'yellow', 0.9).delta).toBe(0.4);
  });
  it('a missed Send it! deletes the lap half of the time, otherwise costs 2 s', () => {
    expect(cornerResult(2, 'miss', 0.2).deleted).toBe(true);
    const r = cornerResult(2, 'miss', 0.8);
    expect(r.deleted).toBe(false);
    expect(r.delta).toBe(2);
  });
  it('a perfect lap is about 1.5 s faster than an all-Safe lap (balance target)', () => {
    const base = baseHotLap(humanCar(), 'S', 0, RHEIN, T, false);
    const perfect = [0, 1, 2].map(() => cornerResult(2, 'green', 1));
    const safe = [0, 1, 2].map(() => cornerResult(0, 'green', 1));
    const tp = hotLapTime(base, perfect, makeRng(1))!;
    const ts = hotLapTime(base, safe, makeRng(1))!;
    expect(ts - tp).toBeCloseTo(1.5, 5);
    expect(hotLapTime(base, [cornerResult(2, 'miss', 0)], makeRng(1))).toBeNull();
  });
  it('a second run on the same compound is 0.2 s slower', () => {
    expect(baseHotLap(humanCar(), 'S', 0, RHEIN, T, true) - baseHotLap(humanCar(), 'S', 0, RHEIN, T, false)).toBeCloseTo(QUALI.usedTyre);
  });
});

describe('qualifying session', () => {
  const field = buildField(
    { humans: [{ id: 'me', name: 'Me', color: '#ff0', drivers: [{ name: 'A', num: 7 }, { name: 'B', num: 27 }] }], seed: 3, track: RHEIN, tuning: T },
    dryWeather(RHEIN.laps),
  );
  it('AI drivers each do 2 runs, mostly valid, with sensible times', () => {
    const runs = aiSession(field, RHEIN, dryWeather(RHEIN.laps), T, 5);
    expect(runs).toHaveLength(20);
    const valid = runs.filter((r) => r.time !== null);
    expect(valid.length).toBeGreaterThan(12);
    for (const r of valid) {
      expect(r.time!).toBeGreaterThan(RHEIN.base - 2.5);
      expect(r.time!).toBeLessThan(RHEIN.base + 6);
    }
    expect(JSON.stringify(aiSession(field, RHEIN, dryWeather(RHEIN.laps), T, 5))).toBe(JSON.stringify(runs));
  });
  it('the grid is the best-lap order and every driver starts on the tyre of his best lap', () => {
    const me1 = field.find((c) => c.id === 'me-1')!;
    const runs: QualiRun[] = [
      ...aiSession(field, RHEIN, dryWeather(RHEIN.laps), T, 5),
      { carId: 'me-1', run: 0, tyre: 'M', corners: [], time: RHEIN.base - 10 },
      { carId: 'me-1', run: 1, tyre: 'S', corners: [], time: RHEIN.base - 5 },
      { carId: 'me-2', run: 0, tyre: 'S', corners: [], time: null },
      { carId: 'me-2', run: 1, tyre: 'S', corners: [], time: null },
    ];
    const grid = gridFromQualifying(field, runs);
    expect(grid[0].id).toBe(me1.id);
    expect(grid[0].startTyre).toBe('M');
    // no valid lap: back of the grid
    expect(grid[grid.length - 1].id).toBe('me-2');
    const lb = leaderboard(field, runs);
    for (let i = 1; i < lb.length; i++) if (lb[i].best !== null) expect(lb[i].best!).toBeGreaterThanOrEqual(lb[i - 1].best!);
  });
});

describe('pit stop game', () => {
  it('wheel order is random and never the same twice in a row', () => {
    const seen = new Set<string>();
    let last = '';
    for (let i = 0; i < 200; i++) {
      const o = shuffledWheels();
      expect([...o].sort()).toEqual(['fl', 'fr', 'rl', 'rr']);
      expect(o.join()).not.toBe(last);
      last = o.join();
      seen.add(last);
    }
    expect(seen.size).toBeGreaterThan(15); // 24 possible orders
  });
  it('picks 4 of the 8 spots, always including damaged parts, in a random order', () => {
    const all = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const s = pickSpots();
      expect(s).toHaveLength(4);
      expect(new Set(s).size).toBe(4);
      s.forEach((x) => all.add(x));
      expect(pickSpots(['fw', 'en'])).toEqual(expect.arrayContaining(['fw', 'en']));
    }
    expect(all.size).toBe(8);
  });
});
