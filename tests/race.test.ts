import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  duelPreview,
  lapScale,
  duelMods,
  duelOutcomes,
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

const RHEIN_TUNING = makeTuning();

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
  it('every race ends with all cars classified and 1× lasting 6 – 8 minutes at 1×', () => {
    for (let s = 1; s <= 12; s++) {
      const race = simulate(fullRace(s, s % 3));
      expect(race.over).toBe(true);
      const res = results(race);
      expect(res).toHaveLength(12);
      expect(res[0].car.status).toBe('finished');
      const minutes = race.realTime / 60;
      expect(minutes).toBeGreaterThan(5.9);
      expect(minutes).toBeLessThan(8.6); // until the last car is home
    }
  });
  it('AI cars follow the two-compound rule in dry races', () => {
    let penalties = 0;
    for (let s = 1; s <= 20; s++) {
      const race = simulate(createRace({ ...cfgFrom(fullRace(s)), weather: dryWeather(RHEIN.laps) }));
      penalties += race.events.filter((e) => e.kind === 'penalty').length; // two-compound rule only
    }
    expect(penalties).toBe(0);
  });
});

function cfgFrom(r: RaceState) {
  return { seed: r.seed, track: r.track, cars: r.cars.map((c) => ({ ...c })), tuning: r.tuning };
}

describe('modes and mistakes (7.3)', () => {
  it('each mode changes the lap time by its pace value', () => {
    const times = [0, 1, 2, 3].map((m) => {
      const r = soloRace();
      applyCommand(r, { type: 'mode', car: 'me-1', mode: m as 0 | 1 | 2 | 3 });
      step(r);
      return r.cars[0].lapTime;
    });
    const m = RHEIN_TUNING.modes;
    const k = lapScale(RHEIN);
    expect(times[0] - times[1]).toBeCloseTo(m[0].pace * k);
    expect(times[2] - times[1]).toBeCloseTo(m[2].pace * k);
    expect(times[3] - times[1]).toBeCloseTo(m[3].pace * k);
    expect(times[3]).toBeLessThan(times[2]);
    expect(times[2]).toBeLessThan(times[1]);
    expect(times[1]).toBeLessThan(times[0]);
  });
  it('Conserve never makes mistakes, Max Attack makes many', () => {
    let conserve = 0;
    let maxAttack = 0;
    for (let s = 1; s <= 30; s++) {
      for (const [mode, add] of [[0, (n: number) => (conserve += n)], [3, (n: number) => (maxAttack += n)]] as const) {
        const r = soloRace({ seed: s });
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
      const r = soloRace({ seed: s, weather: wet });
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
    // b drove through the pit lane at the end of lap 1: about the pit loss slower
    expect(b.time - a.time).toBeGreaterThan(RHEIN.pitLoss - 2);
    expect(b.time - a.time).toBeLessThan(RHEIN.pitLoss + 2);
  });
  it('the car drives into the pit lane before the line, stops at the line and drives out slowly', () => {
    const r = soloRace();
    applyCommand(r, { type: 'pit', car: 'me-1', tyre: 'M' });
    const c = r.cars[0];
    while (c.status !== 'pit') step(r);
    expect(c.pitPhase).toBe('in');
    expect(c.dist).toBeLessThan(1);
    expect(c.dist).toBeGreaterThan(1 - RHEIN_TUNING.pit.laneIn - 0.01);
    step(r);
    expect(c.speed).toBeLessThan(0.6 / c.lapTime); // speed limit in the pit lane
    while (c.pitPhase === 'in') step(r);
    expect(c.pitPhase).toBe('stop');
    expect(c.dist).toBe(1);
    while (c.pitPhase === 'stop') step(r);
    expect(c.tyre).toBe('M');
    while (c.status === 'pit') step(r);
    expect(c.dist).toBeGreaterThanOrEqual(1 + RHEIN_TUNING.pit.laneOut);
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
  it('comes out on the given lap, slows the field and goes in after the given distance', () => {
    const r = soloRace({ safetyCar: { lap: 4, laps: 3, at: 0.5 } });
    const c = runTo(r, 4);
    expect(r.safetyCar.active).toBe(true);
    expect(r.events.some((e) => e.kind === 'safetyCar')).toBe(true);
    expect(r.events.some((e) => e.kind === 'boxNow')).toBe(true);
    step(r);
    expect(c.speed).toBeCloseTo(1 / (RHEIN.base * RHEIN_TUNING.safetyCar.slow), 5);
    while (c.dist < 3.5 + 3 + 0.01) step(r); // out at 3.5 laps, for 3 laps
    step(r);
    expect(r.safetyCar.active).toBe(false);
  });
  it('a stop under the safety car loses clearly less time (the others drive slowly)', () => {
    const lossWith = (sc: { lap: number; laps: number; at: number } | null) => {
      const tm = (pit: boolean) => {
        const r = soloRace({ safetyCar: sc });
        if (pit) applyCommand(r, { type: 'pit', car: 'me-1', tyre: 'M' });
        runTo(r, 3);
        return r.time;
      };
      return tm(true) - tm(false);
    };
    // the stop happens at the end of lap 1; the safety car is out from lap 1 for 1.5 laps
    const normal = lossWith(null);
    const underSc = lossWith({ lap: 1, laps: 1.5, at: 0.5 });
    expect(underSc).toBeLessThan(normal - 4);
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

describe('time penalties', () => {
  it('a car that crosses the line first can lose the win to a penalty', () => {
    const a = humanCar('a-1', { carPace: -1, startTyre: 'S' });
    const b = humanCar('b-1', { startTyre: 'S' });
    const r = createRace({ seed: 3, track: RHEIN, cars: [a, b], weather: dryWeather(RHEIN.laps), safetyCar: null, tuning: makeTuning({ noise: 0 }) });
    // both stop once (rule ok); car a gets a big penalty for an unsafe release
    applyCommand(r, { type: 'pit', car: 'a-1', tyre: 'M' });
    applyCommand(r, { type: 'pit', car: 'b-1', tyre: 'M' });
    r.cars[0].penalty = 60;
    simulate(r);
    const res = results(r);
    const win = r.events.find((e) => e.kind === 'win')!;
    expect(win.car).toBe('a-1'); // first over the line …
    expect(win.data?.penalty).toBe(60);
    expect(res[0].car.id).toBe('b-1'); // … but the result counts the penalty
  });
});

describe('damage', () => {
  it('a broken engine costs top speed, a broken wing too', () => {
    const r = soloRace();
    step(r);
    const base = r.cars[0].lapTime;
    r.cars[0].engineDamage = true;
    step(r);
    expect(r.cars[0].lapTime - base).toBeCloseTo(RHEIN_TUNING.damage.enginePace * lapScale(RHEIN), 2);
    r.cars[0].wingDamage = true;
    step(r);
    expect(r.cars[0].lapTime - base).toBeCloseTo((RHEIN_TUNING.damage.enginePace + RHEIN_TUNING.duel.wingPace) * lapScale(RHEIN), 2);
  });
  it('a broken wing makes every duel move riskier and less likely to work', () => {
    const ok = humanCar('a-1');
    const r = soloRace({}, {});
    const att = { ...r.cars[0], ...ok, wingDamage: false } as typeof r.cars[0];
    const def = { ...att, id: 'd-1' };
    const clean = duelOutcomes(RHEIN_TUNING, 0.5, 1, 2, 0, duelMods(RHEIN_TUNING, att, def));
    const broken = duelOutcomes(RHEIN_TUNING, 0.5, 1, 2, 0, duelMods(RHEIN_TUNING, { ...att, wingDamage: true }, def));
    expect(broken.crash).toBeGreaterThan(clean.crash);
    expect(broken.pass).toBeLessThan(clean.pass);
    const slow = duelOutcomes(RHEIN_TUNING, 0.5, 2, 2, 0, duelMods(RHEIN_TUNING, { ...att, engineDamage: true }, def));
    expect(slow.pass).toBeLessThan(duelOutcomes(RHEIN_TUNING, 0.5, 2, 2, 0).pass);
  });
  it('a pit stop repairs everything and takes longer for it', () => {
    const r = soloRace();
    const c = r.cars[0];
    c.wingDamage = true;
    c.engineDamage = true;
    applyCommand(r, { type: 'pit', car: 'me-1', tyre: 'M' });
    while (c.status !== 'pit') step(r);
    // standing time = average stop + both repairs
    expect(c.pitTotal).toBeGreaterThan(RHEIN_TUNING.pit.avgStop + RHEIN_TUNING.duel.wingPitExtra + RHEIN_TUNING.damage.enginePitExtra - 1);
    while (c.status === 'pit') step(r);
    expect(c.wingDamage).toBe(false);
    expect(c.engineDamage).toBe(false);
  });
});

describe('pit stop game', () => {
  it('the game result changes the stop time', () => {
    const times: number[] = [];
    for (const seconds of [RHEIN_TUNING.pit.avgStop, 2.0, 5.0]) {
      const r = soloRace({}, { pitGame: true });
      applyCommand(r, { type: 'pit', car: 'me-1', tyre: 'M' });
      const c = r.cars[0];
      while (c.status !== 'pit') step(r);
      expect(applyCommand(r, { type: 'pitStop', car: 'me-1', seconds, unsafe: false })).toBe(true);
      while (c.status === 'pit') step(r);
      times.push(r.time);
    }
    // 2.0 s is 0.6 s quicker than an average stop, 5.0 s is 2.4 s slower
    expect(times[1] - times[0]).toBeCloseTo(-0.6, 0);
    expect(times[2] - times[0]).toBeCloseTo(2.4, 0);
  });
  it('if the game never answers, the car still leaves the pits', () => {
    const r = soloRace({}, { pitGame: true });
    applyCommand(r, { type: 'pit', car: 'me-1', tyre: 'M' });
    const c = r.cars[0];
    while (c.status !== 'pit') step(r);
    let n = 0;
    while (c.status === 'pit' && n < 1000) {
      step(r);
      n++;
    }
    expect(c.status).toBe('running');
  });
  it('there is no time penalty from the pit stop game', () => {
    const r = soloRace({}, { pitGame: true });
    applyCommand(r, { type: 'pit', car: 'me-1', tyre: 'M' });
    while (r.cars[0].status !== 'pit') step(r);
    applyCommand(r, { type: 'pitStop', car: 'me-1', seconds: 2.2, unsafe: true });
    expect(r.cars[0].penalty).toBe(0);
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
  it('the duel preview gives a chance and a risk for each of the 5 levels', () => {
    const slow = humanCar('slow-1', { carPace: 1.5, human: false, autopilot: false });
    const fast = humanCar('fast-1', { autoDuel: false });
    const r = createRace({ seed: 2, track: RHEIN, cars: [slow, fast], weather: dryWeather(RHEIN.laps), safetyCar: null, tuning: makeTuning({ noise: 0 }) });
    while (!r.duels.length) step(r);
    const att = duelPreview(r, r.duels[0], 'fast-1');
    expect(att.map((o) => o.choice)).toEqual([0, 1, 2, 3, 4]);
    expect(att[0].success).toBe(0);
    expect(att[1].risk).toBeLessThan(att[3].risk);
    expect(att[4].risk).toBeGreaterThan(att[2].risk);
    for (const o of att) expect(o.success + o.risk).toBeLessThanOrEqual(1 + 1e-9);
    const def = duelPreview(r, r.duels[0], 'slow-1');
    expect(def.map((o) => o.choice)).toEqual([0, 1, 2, 3, 4]);
    expect(def[0].success).toBeLessThan(def[2].success);
  });
  it('a faster car cannot drive through a slower one and has to win a duel', () => {
    const slow = humanCar('slow-1', { carPace: 2, autoDuel: true, human: false, autopilot: false });
    const fast = humanCar('fast-1', { autoDuel: true });
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
    const slow = humanCar('slow-1', { carPace: 1.5, human: false, autopilot: false });
    const fast = humanCar('fast-1', { autoDuel: false });
    const r = createRace({ seed: 2, track: RHEIN, cars: [slow, fast], weather: dryWeather(RHEIN.laps), safetyCar: null, tuning: makeTuning({ noise: 0 }) });
    while (!r.duels.length) step(r);
    const d = r.duels[0];
    expect(d.attack).toBeNull();
    expect(applyCommand(r, { type: 'duel', duel: d.id, car: 'fast-1', choice: 0 })).toBe(true);
    step(r);
    // decided, then shown as an animation before it counts
    expect(d.state).toBe('showing');
    expect(d.outcome).toBe('wait');
    for (let i = 0; i < RHEIN_TUNING.duel.showSeconds / 0.1 + 1; i++) step(r);
    expect(d.state).toBe('done');
  });
  it('unanswered human duels are decided automatically after the answer time (real seconds, any speed)', () => {
    const slow = humanCar('slow-1', { carPace: 1.5, human: false, autopilot: false });
    const fast = humanCar('fast-1', { autoDuel: false });
    const r = createRace({ seed: 2, track: RHEIN, cars: [slow, fast], weather: dryWeather(RHEIN.laps), safetyCar: null, tuning: makeTuning({ noise: 0 }) });
    while (!r.duels.length) step(r);
    const d = r.duels[0];
    r.speed = 4; // faster race, same real answer time
    const ticks = Math.round(RHEIN_TUNING.duel.answerSeconds / 0.1);
    for (let i = 0; i < ticks - 1; i++) step(r);
    expect(d.state).toBe('choosing');
    step(r);
    step(r);
    expect(d.state).not.toBe('choosing');
  });
});
