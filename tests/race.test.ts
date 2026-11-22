import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  buildField,
  createRace,
  dryWeather,
  generateWeather,
  makeRng,
  makeTuning,
  quickQualifying,
  results,
  simulate,
  standings,
  step,
  TRACKS,
  type RaceState,
  type Weather,
} from '../src/sim';
import { humanCar, RHEIN, soloRace } from './helpers';

function fullRace(seed: number, trackIndex = 0) {
  const track = TRACKS[trackIndex];
  const tuning = makeTuning();
  const wx = generateWeather(track, makeRng(seed, 1), tuning);
  const field = buildField(
    { humans: [{ id: 'me', name: 'Me', color: '#ff0', drivers: [{ name: 'A', num: 7 }, { name: 'B', num: 27 }] }], seed, track, tuning },
    wx,
  ).map((c) => ({ ...c, autopilot: true }));
  return createRace({ seed, track, cars: quickQualifying(field, track, wx, tuning, seed), weather: wx, tuning });
}

/** Run until the car has completed `laps` laps (or the race is over). */
function runTo(race: RaceState, laps: number, id = 'me-1') {
  const c = race.cars.find((x) => x.id === id)!;
  while (!race.over && c.lap < laps && c.status !== 'dnf') step(race);
  return c;
}

describe('determinism', () => {
  it('the same seed gives exactly the same race', () => {
    const a = simulate(fullRace(11));
    const b = simulate(fullRace(11));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('a different seed gives a different race', () => {
    const a = simulate(fullRace(11));
    const b = simulate(fullRace(12));
    expect(results(a).map((r) => r.car.id)).not.toEqual(results(b).map((r) => r.car.id));
  });
  it('the race state survives a JSON round trip (can be sent over the network)', () => {
    const r = fullRace(3);
    for (let i = 0; i < 500; i++) step(r);
    const copy = JSON.parse(JSON.stringify(r)) as RaceState;
    for (let i = 0; i < 500; i++) {
      step(r);
      step(copy);
    }
    expect(JSON.stringify(copy)).toBe(JSON.stringify(r));
  });
});

describe('full races', () => {
  it('every race ends with all cars classified and 1× lasting roughly laps × 20 s', () => {
    for (let s = 1; s <= 12; s++) {
      const race = simulate(fullRace(s, s % 3));
      expect(race.over).toBe(true);
      const res = results(race);
      expect(res).toHaveLength(12);
      expect(res[0].car.status).toBe('finished');
      const minutes = race.realTime / 60;
      expect(minutes).toBeGreaterThan(race.track.laps * 20 / 60 * 0.95);
      expect(minutes).toBeLessThan(race.track.laps * 20 / 60 * 1.35);
    }
  });
  it('AI cars follow the two-compound rule in dry races', () => {
    let penalties = 0;
    for (let s = 1; s <= 20; s++) {
      const race = simulate(createRace({ ...cfgFrom(fullRace(s)), weather: dryWeather(RHEIN.laps) }));
      penalties += race.cars.filter((c) => c.penalty > 0).length;
    }
    expect(penalties).toBe(0);
  });
});

function cfgFrom(r: RaceState) {
  return { seed: r.seed, track: r.track, cars: r.cars.map((c) => ({ ...c })), tuning: r.tuning };
}

describe('fuel (7.2)', () => {
  it('Normal mode uses exactly one lap of fuel per lap', () => {
    const race = soloRace();
    applyCommand(race, { type: 'pit', car: 'me-1', tyre: null });
    const c = runTo(race, 5);
    expect(c.fuel).toBeCloseTo(RHEIN.laps + 0.5 - c.dist, 5);
  });
  it('each lap of fuel costs 0.12 s per lap', () => {
    const a = soloRace({}, { fuel: 10 });
    const b = soloRace({}, { fuel: 15 });
    step(a);
    step(b);
    expect(b.cars[0].lapTime - a.cars[0].lapTime).toBeCloseTo(0.6, 5);
  });
  it('running out of fuel retires the car', () => {
    const race = soloRace({}, { fuel: 3 });
    simulate(race);
    const c = race.cars[0];
    expect(c.status).toBe('dnf');
    expect(c.dist).toBeCloseTo(3, 1);
    expect(race.events.some((e) => e.kind === 'outOfFuel')).toBe(true);
  });
  it('humans get a fuel warning when the projection is negative', () => {
    const race = soloRace({}, { fuel: RHEIN.laps - 1 });
    runTo(race, 2);
    expect(race.events.some((e) => e.kind === 'fuelLow')).toBe(true);
  });
});

describe('modes and mistakes (7.3)', () => {
  it('Push is 0.6 s faster per lap and Max Attack 1.2 s', () => {
    const times = [0, 1, 2, 3].map((m) => {
      const r = soloRace();
      applyCommand(r, { type: 'mode', car: 'me-1', mode: m as 0 | 1 | 2 | 3 });
      step(r);
      return r.cars[0].lapTime;
    });
    expect(times[0] - times[1]).toBeCloseTo(0.5);
    expect(times[2] - times[1]).toBeCloseTo(-0.6);
    expect(times[3] - times[1]).toBeCloseTo(-1.2);
  });
  it('Conserve never makes mistakes, Max Attack makes many', () => {
    let conserve = 0;
    let maxAttack = 0;
    for (let s = 1; s <= 30; s++) {
      for (const [mode, add] of [[0, (n: number) => (conserve += n)], [3, (n: number) => (maxAttack += n)]] as const) {
        const r = soloRace({ seed: s }, { fuel: 30 });
        applyCommand(r, { type: 'mode', car: 'me-1', mode });
        runTo(r, 4);
        add(r.cars[0].mistakes);
      }
    }
    expect(conserve).toBe(0);
    // 30 races × 4 laps × 8 % ≈ 10, more on worn tyres
    expect(maxAttack).toBeGreaterThan(4);
  });
  it('slicks on a wet track spin', () => {
    const wet: Weather = { quali: 1, laps: new Array(RHEIN.laps).fill(1), noise: new Array(12).fill(0) };
    let spins = 0;
    for (let s = 1; s <= 20; s++) {
      const r = soloRace({ seed: s, weather: wet }, { fuel: 30 });
      applyCommand(r, { type: 'mode', car: 'me-1', mode: 2 });
      runTo(r, 5);
      spins += r.events.filter((e) => e.kind === 'spin').length;
    }
    expect(spins).toBeGreaterThan(3);
  });
});

describe('pit stops', () => {
  it('BOX fits the chosen tyre at the end of the lap and costs the pit loss', () => {
    const a = soloRace();
    const b = soloRace();
    applyCommand(b, { type: 'pit', car: 'me-1', tyre: 'M' });
    runTo(a, 2);
    const cb = runTo(b, 2);
    expect(cb.usedTyres).toEqual(['S', 'M']);
    expect(cb.tyre).toBe('M');
    expect(cb.stops).toBe(1);
    // lap 1 of b ends in the pits: lap 2 is pit loss slower (minus fresher tyres, plus slower Medium)
    expect(b.time - a.time).toBeGreaterThan(RHEIN.pitLoss - 1);
    expect(b.time - a.time).toBeLessThan(RHEIN.pitLoss + 1);
  });
  it('a BOX call can be cancelled', () => {
    const r = soloRace();
    applyCommand(r, { type: 'pit', car: 'me-1', tyre: 'M' });
    applyCommand(r, { type: 'pit', car: 'me-1', tyre: null });
    const c = runTo(r, 2);
    expect(c.stops).toBe(0);
  });
  it('one dry compound only gives a 20 s penalty', () => {
    const r = soloRace();
    simulate(r);
    expect(r.cars[0].penalty).toBe(20);
    expect(results(r)[0].time).toBeCloseTo(r.cars[0].finishTime + 20);
  });
});

describe('safety car (7.6)', () => {
  it('comes out on the given lap, slows the field and ends at the line', () => {
    const r = soloRace({ safetyCar: { lap: 4, laps: 3, at: 0.5 } });
    const c = runTo(r, 4);
    expect(r.safetyCar.active).toBe(true);
    expect(r.events.some((e) => e.kind === 'safetyCar')).toBe(true);
    expect(r.events.some((e) => e.kind === 'boxNow')).toBe(true);
    step(r);
    expect(c.speed).toBeCloseTo(1 / (RHEIN.base * 1.4), 5);
    runTo(r, 6); // in at the end of lap 6
    step(r);
    expect(r.safetyCar.active).toBe(false);
  });
  it('a stop under the safety car costs half the pit loss', () => {
    const r = soloRace({ safetyCar: { lap: 4, laps: 3, at: 0.2 } });
    runTo(r, 4);
    applyCommand(r, { type: 'pit', car: 'me-1', tyre: 'M' });
    runTo(r, 5);
    const pitIn = r.events.find((e) => e.kind === 'pitIn')!;
    expect(pitIn.data!.loss).toBeCloseTo(RHEIN.pitLoss / 2, 1);
  });
  it('bunches the field up to about 0.4 s apart', () => {
    const race = fullRace(4);
    const cfg = { ...cfgFrom(race), weather: dryWeather(RHEIN.laps), safetyCar: { lap: 5, laps: 4 } };
    const r = createRace(cfg);
    while (r.safetyCar.count === 0 || r.safetyCar.active) step(r);
    const order = standings(r).filter((c) => c.status === 'running');
    const spread = (order[0].dist - order[order.length - 1].dist) * RHEIN.base;
    expect(spread).toBeLessThan(0.45 * 11 + 3);
  });
});

describe('weather in the race', () => {
  it('track gets wet in rain and AI switches to rain tyres', () => {
    const laps = new Array(RHEIN.laps).fill(0).map((_, i) => (i >= 4 && i < 12 ? 0.9 : 0));
    const race = fullRace(5);
    const r = createRace({ ...cfgFrom(race), weather: { quali: 0, laps, noise: new Array(12).fill(0) }, safetyCar: null });
    while (r.cars[0].lap < 9) step(r);
    expect(r.wetness).toBeGreaterThan(70);
    const onRain = r.cars.filter((c) => c.tyre === 'W' || c.pitTyre === 'W').length;
    expect(onRain).toBeGreaterThanOrEqual(10);
    simulate(r);
    expect(r.cars.filter((c) => c.usedTyres.includes('W')).length).toBeGreaterThanOrEqual(10);
  });
});

describe('duels (7.5)', () => {
  it('a faster car cannot drive through a slower one and has to win a duel', () => {
    const slow = humanCar('slow-1', { carPace: 2, autoDuel: true, human: false, autopilot: false, fuel: 30 });
    const fast = humanCar('fast-1', { autoDuel: true, fuel: 30 });
    const r = createRace({ seed: 2, track: RHEIN, cars: [slow, fast], weather: dryWeather(RHEIN.laps), safetyCar: null, tuning: makeTuning({ noise: 0 }) });
    let minGap = Infinity;
    while (r.cars[0].lap < 6) {
      step(r);
      const [a, b] = r.cars;
      if (b.dist < a.dist && b.dist > 0) minGap = Math.min(minGap, (a.dist - b.dist) * b.lapTime);
    }
    expect(minGap).toBeGreaterThan(0.35);
    expect(r.events.some((e) => e.kind === 'duelStart')).toBe(true);
    expect(r.events.some((e) => e.kind === 'pass')).toBe(true);
  });
  it('human answers are used for the duel', () => {
    const slow = humanCar('slow-1', { carPace: 1.5, human: false, autopilot: false, fuel: 30 });
    const fast = humanCar('fast-1', { autoDuel: false, fuel: 30 });
    const r = createRace({ seed: 2, track: RHEIN, cars: [slow, fast], weather: dryWeather(RHEIN.laps), safetyCar: null, tuning: makeTuning({ noise: 0 }) });
    while (!r.duels.length) step(r);
    const d = r.duels[0];
    expect(d.attack).toBeNull();
    expect(applyCommand(r, { type: 'duel', duel: d.id, car: 'fast-1', choice: 'wait' })).toBe(true);
    step(r);
    expect(d.resolved).toBe(true);
    expect(d.outcome).toBe('wait');
  });
  it('unanswered human duels are decided automatically after 6 s', () => {
    const slow = humanCar('slow-1', { carPace: 1.5, human: false, autopilot: false, fuel: 30 });
    const fast = humanCar('fast-1', { autoDuel: false, fuel: 30 });
    const r = createRace({ seed: 2, track: RHEIN, cars: [slow, fast], weather: dryWeather(RHEIN.laps), safetyCar: null, tuning: makeTuning({ noise: 0 }) });
    while (!r.duels.length) step(r);
    const d = r.duels[0];
    for (let i = 0; i < 59; i++) step(r);
    expect(d.resolved).toBe(false);
    step(r);
    step(r);
    expect(d.resolved).toBe(true);
  });
});
