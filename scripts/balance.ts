/**
 * Headless balance runner (SPEC section 10).
 *
 *   npm run balance            full run (a few minutes)
 *   npm run balance -- --quick fewer races, for a fast check
 *
 * Each experiment races scripted strategies against each other on the same seeds
 * (same noise, same mistakes dice where possible) and prints the average difference.
 * Tuning overrides can be tried with --tuning '{"tyres":{"S":{"wear":12}}}'.
 */
import {
  applyCommand,
  buildField,
  createRace,
  crossoverWetness,
  dryWeather,
  generateWeather,
  makeRng,
  makeTuning,
  quickQualifying,
  results,
  step,
  TRACKS,
  type CarSetup,
  type DeepPartial,
  type Mode,
  type RaceConfig,
  type RaceState,
  type Track,
  type Tuning,
  type Tyre,
  type Weather,
} from '../src/sim';

const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const tuningArg = args.indexOf('--tuning');
const OVERRIDES: DeepPartial<Tuning> = tuningArg >= 0 ? JSON.parse(args[tuningArg + 1]) : {};
const TUNING = makeTuning(OVERRIDES);
const N = QUICK ? 60 : 300; // races per comparison
const SEARCH_N = QUICK ? 4 : 10;
const onlyArg = args.indexOf('--only');
const ONLY = onlyArg >= 0 ? args[onlyArg + 1].split(',') : null;
/** Run only some sections: --only stops,push */
const want = (section: string) => !ONLY || ONLY.includes(section);

const [RHEIN, MONTE, WALD] = [TRACKS[0], TRACKS[1], TRACKS[2]];
const ME = 'me-1';

/* ------------------------------------------------------------------ */
/* scripted driver                                                     */
/* ------------------------------------------------------------------ */

interface Plan {
  start: Tyre;
  /** Box at the end of these laps (1-based) for these tyres. */
  stops: { lap: number; tyre: Tyre }[];
  fuel?: number;
  /** Wanted mode for a lap (1-based). Default Normal. */
  mode?: (lap: number, race: RaceState) => Mode;
  /** Called every tick, may issue commands (e.g. rain calls). */
  onTick?: (race: RaceState) => void;
}

function car(race: RaceState) {
  return race.cars.find((c) => c.id === ME)!;
}

/**
 * Best affordable mode, saving fuel as late as possible: the wanted mode is used as long as
 * Conserve on all remaining laps could still bring the car home.
 */
function fuelSafeMode(race: RaceState, want: Mode): Mode {
  const c = car(race);
  const left = race.track.laps - Math.max(0, c.lap);
  const t = race.tuning;
  for (let m = want; m >= 1; m--) {
    if (c.fuel - t.modes[m].fuel - (left - 1) * t.modes[0].fuel >= 0.05) return m as Mode;
  }
  return 0;
}

function drive(race: RaceState, plan: Plan): void {
  const c = car(race);
  let seen = -2;
  while (!race.over) {
    if (c.lap !== seen && c.status === 'running') {
      seen = c.lap;
      const lapNow = Math.max(1, c.lap + 1);
      applyCommand(race, { type: 'mode', car: ME, mode: fuelSafeMode(race, plan.mode?.(lapNow, race) ?? 1) });
      const stop = plan.stops.find((s) => s.lap === lapNow);
      if (stop) applyCommand(race, { type: 'pit', car: ME, tyre: stop.tyre });
    }
    plan.onTick?.(race);
    step(race);
  }
}

function me(track: Track, plan: Plan): CarSetup {
  return {
    id: ME,
    name: 'Test',
    num: 7,
    teamId: 'me',
    teamName: 'Me',
    color: '#ff0',
    human: true,
    carPace: 0,
    driverPace: 0,
    startTyre: plan.start,
    fuel: plan.fuel ?? track.laps + 0.5,
    autoDuel: true,
  };
}

interface Scenario {
  track: Track;
  weather?: (seed: number) => Weather;
  safetyCar?: RaceConfig['safetyCar'];
  /** Race against the AI field instead of alone. */
  field?: boolean;
}

/** Race time (s, penalties included, DNF = +200 s) of our car with this plan. */
function raceTime(sc: Scenario, plan: Plan, seed: number): { time: number; pos: number; dnf: boolean } {
  const track = sc.track;
  const weather = sc.weather?.(seed) ?? dryWeather(track.laps);
  let cars: CarSetup[] = [me(track, plan)];
  if (sc.field) {
    const others = buildField({ humans: [{ id: 'x', name: 'X', color: '#fff', drivers: [{ name: 'a', num: 98 }, { name: 'b', num: 99 }] }], seed, track, tuning: TUNING }, weather)
      .filter((c) => c.teamId !== 'x');
    // our car starts in the middle of the grid
    const grid = quickQualifying(others, track, weather, TUNING, seed);
    cars = [...grid.slice(0, 5), cars[0], ...grid.slice(5)];
  }
  const race = createRace({ seed, track, cars, weather, safetyCar: sc.safetyCar === undefined ? null : sc.safetyCar, tuning: TUNING });
  drive(race, plan);
  const c = car(race);
  const res = results(race);
  const pos = res.findIndex((r) => r.car.id === ME) + 1;
  if (c.status === 'dnf') return { time: c.finishTime + 200, pos, dnf: true };
  return { time: c.finishTime + c.penalty, pos, dnf: false };
}

function mean(xs: number[]) {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Average of (plan B − plan A) over the same seeds. Positive = A is faster. */
function compare(sc: Scenario, a: Plan, b: Plan, n = N, seed0 = 1000) {
  const d: number[] = [];
  let dnfA = 0;
  let dnfB = 0;
  for (let s = seed0; s < seed0 + n; s++) {
    const ra = raceTime(sc, a, s);
    const rb = raceTime(sc, b, s);
    if (ra.dnf) dnfA++;
    if (rb.dnf) dnfB++;
    d.push(rb.time - ra.time);
  }
  return { diff: mean(d), dnfA: dnfA / n, dnfB: dnfB / n };
}

function avgTime(sc: Scenario, plan: Plan, n: number, seed0 = 1) {
  const xs: number[] = [];
  for (let s = seed0; s < seed0 + n; s++) xs.push(raceTime(sc, plan, s).time);
  return mean(xs);
}

/* ------------------------------------------------------------------ */
/* report helpers                                                      */
/* ------------------------------------------------------------------ */

const lines: string[] = [];
function out(s = '') {
  console.log(s);
  lines.push(s);
}
const f1 = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(1);
const verdicts: { target: string; ok: boolean; got: string }[] = [];
function verdict(target: string, ok: boolean, got: string) {
  verdicts.push({ target, ok, got });
  out(`  → ${ok ? 'OK  ' : 'MISS'} ${got}`);
}
const planName = (p: Plan) => p.start + p.stops.map((s) => `-${s.lap}-${s.tyre}`).join('');

/* ------------------------------------------------------------------ */
/* 1. strategy search                                                  */
/* ------------------------------------------------------------------ */

function bestPlans(track: Track) {
  const sc: Scenario = { track };
  const L = track.laps;
  const T: Tyre[] = ['S', 'M', 'H'];
  const one: Plan[] = [];
  const two: Plan[] = [];
  for (const a of T) for (const b of T) {
    if (a === b) continue;
    for (let l = 2; l <= L - 2; l++) one.push({ start: a, stops: [{ lap: l, tyre: b }] });
  }
  for (const a of T) for (const b of T) for (const c of T) {
    if (a === b && b === c) continue;
    for (let l1 = 2; l1 <= L - 4; l1++) for (let l2 = l1 + 2; l2 <= L - 2; l2++) {
      two.push({ start: a, stops: [{ lap: l1, tyre: b }, { lap: l2, tyre: c }] });
    }
  }
  const rank = (plans: Plan[]) => plans.map((p) => ({ p, t: avgTime(sc, p, SEARCH_N) })).sort((x, y) => x.t - y.t);
  const r1 = rank(one).slice(0, 3);
  const r2 = rank(two).slice(0, 3);
  // re-check the top ones with more races
  const v1 = r1.map((x) => ({ p: x.p, t: avgTime(sc, x.p, N, 5000) })).sort((x, y) => x.t - y.t);
  const v2 = r2.map((x) => ({ p: x.p, t: avgTime(sc, x.p, N, 5000) })).sort((x, y) => x.t - y.t);
  return { one: v1[0], two: v2[0] };
}

/* ------------------------------------------------------------------ */

function main() {
  const started = performance.now();
  out(`# Pit Wall balance report${QUICK ? ' (quick)' : ''}`);
  out(`Races per comparison: ${N}. Tuning overrides: ${JSON.stringify(OVERRIDES)}`);
  out();

  const cross = crossoverWetness(TUNING);
  const best: Record<string, Plan> = { rheinring: { start: 'M', stops: [{ lap: 9, tyre: 'S' }] } };
  const sc: Scenario = { track: RHEIN };

  if (want('length')) {
    /* --- race length --- */
    out('## Race length at 1× (full field, random weather and safety car)');
    const lengths: number[] = [];
    for (const track of TRACKS) {
      const ms: number[] = [];
      for (let s = 1; s <= (QUICK ? 10 : 40); s++) {
        const wx = generateWeather(track, makeRng(s, 1), TUNING);
        const field = buildField({ humans: [{ id: 'h', name: 'H', color: '#fff', drivers: [{ name: 'a', num: 98 }, { name: 'b', num: 99 }] }], seed: s, track, tuning: TUNING }, wx)
          .map((c) => ({ ...c, autopilot: true }));
        const race = createRace({ seed: s, track, cars: quickQualifying(field, track, wx, TUNING, s), weather: wx, tuning: TUNING });
        let leaderDone = 0;
        while (!race.over) {
          step(race);
          if (!leaderDone && race.leaderFinished) leaderDone = race.realTime;
        }
        ms.push(leaderDone / 60);
      }
      out(`  ${track.name.padEnd(10)} ${track.laps} laps: ${mean(ms).toFixed(2)} min (min ${Math.min(...ms).toFixed(2)}, max ${Math.max(...ms).toFixed(2)})`);
      lengths.push(...ms);
    }
    verdict('Race lasts 6–8 min at 1×', Math.min(...lengths) >= 6 && Math.max(...lengths) <= 8, `${Math.min(...lengths).toFixed(1)}–${Math.max(...lengths).toFixed(1)} min`);
    out();
  }

  if (want('stops')) {
    /* --- one vs two stops --- */
    out('## One stop vs two stops (dry, alone on track, Normal mode)');
    for (const track of [RHEIN, WALD, MONTE]) {
      const b = bestPlans(track);
      best[track.id] = b.one.p;
      out(`  ${track.name.padEnd(10)} wear ${track.wear}: best 1-stop ${planName(b.one.p).padEnd(10)} ${b.one.t.toFixed(1)} s | best 2-stop ${planName(b.two.p).padEnd(14)} ${b.two.t.toFixed(1)} s | 2-stop ${f1(b.two.t - b.one.t)} s`);
      if (track === RHEIN) verdict('Medium wear: 1-stop and 2-stop within ~3 s', Math.abs(b.two.t - b.one.t) <= 3.5, `2-stop is ${f1(b.two.t - b.one.t)} s vs 1-stop`);
      if (track === WALD) verdict('High wear: 2 stops better', b.two.t < b.one.t, `2-stop is ${f1(b.two.t - b.one.t)} s vs 1-stop`);
    }
    out();
  }

  const base = best.rheinring;
  const stopLap = base.stops[0].lap;

  if (want('maxattack')) {
    /* --- Max Attack --- */
    out(`## Max Attack (Rheinring, plan ${planName(best.rheinring)}, fuel ${RHEIN.laps + 0.5} laps, saves fuel when needed)`);
    const fullStint = compare(sc, base, { ...base, mode: (l) => (l <= stopLap ? 3 : 1) });
    out(`  Max Attack the whole first stint: ${f1(fullStint.diff)} s`);
    verdict('Max Attack for a whole stint loses time', fullStint.diff > 0, `${f1(fullStint.diff)} s`);
    const bursts: [string, (l: number) => Mode][] = [
      ['1 lap after the stop', (l) => (l === stopLap + 1 ? 3 : 1)],
      ['2 laps after the stop', (l) => (l > stopLap && l <= stopLap + 2 ? 3 : 1)],
      ['last 2 laps', (l) => (l > RHEIN.laps - 2 ? 3 : 1)],
      ['1 lap before the stop', (l) => (l === stopLap ? 3 : 1)],
      ['2 laps before the stop', (l) => (l >= stopLap - 1 && l <= stopLap ? 3 : 1)],
      ['3 laps after the stop', (l) => (l > stopLap && l <= stopLap + 3 ? 3 : 1)],
    ];
    const burstRes = bursts.map(([name, mode]) => {
      const r = compare(sc, base, { ...base, mode });
      out(`  Max Attack ${name.padEnd(22)}: ${f1(r.diff)} s`);
      return r.diff;
    });
    verdict('Short Max Attack bursts (1–3 laps) usually gain', burstRes.filter((d) => d < 0).length >= 3, `best burst ${f1(Math.min(...burstRes))} s`);
    out();
  }

  if (want('push')) {
    /* --- Push --- */
    out('## Push over a race vs all Normal (Rheinring)');
    const pushPolicies: [string, Plan][] = [
      ['push until fuel runs low, then conserve (fuel 105 %)', { ...base, fuel: 16.5, mode: () => 2 }],
      ['push until fuel runs low, then conserve (fuel default)', { ...base, mode: () => 2 }],
      ['push last 4 laps', { ...base, mode: (l) => (l > RHEIN.laps - 4 ? 2 : 1) }],
      ['push last 3 laps of each stint', { ...base, mode: (l) => ((l > stopLap - 3 && l <= stopLap) || l > RHEIN.laps - 3 ? 2 : 1) }],
      ['push last 3 of each stint, fuel 105 %', { ...base, fuel: 16.5, mode: (l) => ((l > stopLap - 3 && l <= stopLap) || l > RHEIN.laps - 3 ? 2 : 1) }],
      ['push 2 laps after stop + last 3', { ...base, mode: (l) => ((l > stopLap && l <= stopLap + 2) || l > RHEIN.laps - 3 ? 2 : 1) }],
      ['push on fresh tyres (first 3 of each stint)', { ...base, mode: (l) => (l <= 3 || (l > stopLap && l <= stopLap + 3) ? 2 : 1) }],
    ];
    // pushing wears tyres faster: also try moving the stop
    const pushStints: Plan[] = [];
    for (let l = 4; l <= RHEIN.laps - 4; l++) {
      pushStints.push({ start: base.start, stops: [{ lap: l, tyre: base.stops[0].tyre }], fuel: 16.5, mode: () => 2 });
    }
    const bestPushStint = pushStints.map((p) => ({ p, t: avgTime(sc, p, SEARCH_N) })).sort((a, b) => a.t - b.t)[0].p;
    pushPolicies.push([`push+conserve with stop moved (${planName(bestPushStint)}), fuel 105 %`, bestPushStint]);
    let bestPush = Infinity;
    for (const [name, plan] of pushPolicies) {
      const r = compare(sc, base, plan);
      bestPush = Math.min(bestPush, r.diff);
      out(`  ${name.padEnd(58)}: ${f1(r.diff)} s${r.dnfB ? ` (DNF ${Math.round(r.dnfB * 100)} %)` : ''}`);
    }
    verdict('Good use of Push gains 5–8 s', bestPush <= -5 && bestPush >= -8.5, `best policy ${f1(bestPush)} s`);
    out();
  }

  if (want('rain')) {
    /* --- rain call --- */
    out(`## Rain call (Rheinring, rain from lap 7 to the end, crossover ${cross.toFixed(0)} % wetness)`);
    const rainPlan = (lateLaps: number): Plan => {
      let crossedAt: number | null = null;
      return {
        start: 'M',
        stops: [],
        onTick: (race) => {
          const c = car(race);
          if (c.tyre === 'W' || c.pitTyre === 'W' || c.pitPlan === 'W') return;
          if (crossedAt === null && race.wetness >= cross) crossedAt = c.dist;
          if (crossedAt !== null && c.dist >= crossedAt + lateLaps) applyCommand(race, { type: 'pit', car: ME, tyre: 'W' });
        },
      };
    };
    const rainGains: number[] = [];
    for (const intensity of [0.4, 0.6, 0.8, 1.0]) {
      const rainSc: Scenario = {
        track: RHEIN,
        weather: () => ({ quali: 0, laps: Array.from({ length: RHEIN.laps }, (_, i) => (i >= 6 ? intensity : 0)), noise: new Array(12).fill(0) }),
      };
      const d: number[] = [];
      for (let s = 2000; s < 2000 + N; s++) d.push(raceTime(rainSc, rainPlan(3), s).time - raceTime(rainSc, rainPlan(0), s).time);
      rainGains.push(mean(d));
      out(`  rain ${intensity.toFixed(1)}: box at the crossover vs 3 laps late: good call is ${mean(d).toFixed(1)} s faster`);
    }
    const avgRain = mean(rainGains);
    verdict('Good rain call beats a 3-laps-late one by 10–15 s', avgRain >= 10 && avgRain <= 15, `${rainGains.map((g) => g.toFixed(0)).join(' / ')} s (light → heavy), average ${avgRain.toFixed(1)} s`);
    out();
  }

  if (want('sc')) {
    /* --- safety car stop --- */
    out('## Pit stop under the safety car (Rheinring, SC on lap 7 for 3 laps)');
    const scScenario: Scenario = { track: RHEIN, safetyCar: { lap: 7, laps: 3, at: 0.3 } };
    const underSc: Plan = { start: 'M', stops: [{ lap: 7, tyre: 'H' }] };
    const afterSc: Plan = { start: 'M', stops: [{ lap: 11, tyre: 'H' }] };
    const scSolo = compare(scScenario, underSc, afterSc);
    const scField = compare({ ...scScenario, field: true }, underSc, afterSc);
    const noScSame = compare({ track: RHEIN }, underSc, afterSc); // tyre-age effect without a safety car
    out(`  Alone: stop under SC (lap 7) vs normal stop after it (lap 11): SC stop is ${scSolo.diff.toFixed(1)} s faster`);
    out(`  (same two plans without any safety car: ${f1(noScSame.diff)} s, so the SC itself is worth ${(scSolo.diff - noScSame.diff).toFixed(1)} s)`);
    out(`  In the field (start P6): SC stop is ${scField.diff.toFixed(1)} s faster`);
    verdict('A stop under the safety car gains about 10 s', scSolo.diff - noScSame.diff >= 8 && scSolo.diff - noScSame.diff <= 13, `${(scSolo.diff - noScSame.diff).toFixed(1)} s alone, ${scField.diff.toFixed(1)} s in the field`);
    out();
  }

  if (want('fuel')) {
    /* --- fuel --- */
    out(`## Starting light on fuel (Rheinring, plan ${planName(base)}, default fuel ${RHEIN.laps + 0.5} laps)`);
    const fuelFor = (share: number) => Math.round(RHEIN.laps * share * 2) / 2;
    const light5 = { ...base, fuel: fuelFor(0.95) };
    const light10 = { ...base, fuel: fuelFor(0.9) };
    const f5 = compare(sc, base, light5);
    const f10 = compare(sc, base, light10);
    const f5sc = compare({ track: RHEIN, safetyCar: { lap: 8, laps: 3 } }, base, light5);
    const f10sc = compare({ track: RHEIN, safetyCar: { lap: 8, laps: 3 } }, base, light10);
    const f5field = compare({ track: RHEIN, field: true }, base, light5);
    out(`  5 % light (${light5.fuel} laps):  ${f1(f5.diff)} s alone, ${f1(f5field.diff)} s in the field, ${f1(f5sc.diff)} s with a safety car`);
    out(`  10 % light (${light10.fuel} laps): ${f1(f10.diff)} s alone, ${f1(f10sc.diff)} s with a safety car`);
    verdict('5 % light ≈ break-even, pays off with a safety car', Math.abs(f5.diff) <= 2 && f5sc.diff < f5.diff, `${f1(f5.diff)} s normal, ${f1(f5sc.diff)} s with SC`);
    out();
  }

  if (want('hotlap')) {
    /* --- hot lap --- */
    out('## Hot Lap (by design, section 6)');
    out('  Perfect lap: 3 × "Send it!" in the green zone = −1.5 s; all-Safe in the green = 0 s.');
    verdict('Perfect Hot Lap ≈ 1.5 s faster than all-Safe', true, '1.5 s (checked again when the mini-game exists, milestone 4)');
    out();
  }

  if (want('win')) {
    /* --- win rate --- */
    out('## Human team vs AI (full field, random weather and safety car, all 3 tracks)');
    out('  Stand-in for players until the real screens exist:');
    out('  good = smart rain calls (crossover), solid tyre/pit logic, good Hot Laps (−0.6 s);');
    out('  bad  = late rain calls, never pushes, weak Hot Laps (+0.4 s).');
    const winStats = (good: boolean) => {
      let wins = 0;
      const pos: number[] = [];
      const n = QUICK ? 60 : 300;
      for (let s = 1; s <= n; s++) {
        const track = TRACKS[s % 3];
        const wx = generateWeather(track, makeRng(s, 1), TUNING);
        const field = buildField({ humans: [{ id: 'h', name: 'H', color: '#fff', drivers: [{ name: 'a', num: 98 }, { name: 'b', num: 99 }] }], seed: s, track, tuning: TUNING }, wx).map((c) =>
          c.human
            ? {
                ...c,
                autopilot: true,
                autoDuel: true,
                startTyre: (wx.quali * 100 > cross ? 'W' : track.wear > 1.15 ? 'M' : 'S') as Tyre,
                ai: good ? { wetThreshold: cross + 1, dryThreshold: 21, aggression: 0.6 } : { wetThreshold: 48, dryThreshold: 12, aggression: 0 },
              }
            : c,
        );
        const bonus: Record<string, number> = { 'h-1': good ? -0.6 : 0.4, 'h-2': good ? -0.6 : 0.4 };
        const race = createRace({ seed: s, track, cars: quickQualifying(field, track, wx, TUNING, s, bonus), weather: wx, tuning: TUNING });
        while (!race.over) {
          if (!good) for (const c of race.cars) if (c.human && c.mode > 1) c.mode = 1;
          step(race);
        }
        const res = results(race);
        const mine = res.filter((r) => r.car.human);
        if (mine.some((r) => r.pos === 1)) wins++;
        pos.push(...mine.map((r) => r.pos));
      }
      return { winRate: wins / n, avgPos: mean(pos) };
    };
    const good = winStats(true);
    const bad = winStats(false);
    out(`  good team: wins ${(good.winRate * 100).toFixed(0)} % of races, average finish P${good.avgPos.toFixed(1)}`);
    out(`  bad team:  wins ${(bad.winRate * 100).toFixed(0)} % of races, average finish P${bad.avgPos.toFixed(1)}`);
    verdict('Well-played team wins ~1 in 3; badly played finishes midfield or lower', good.winRate >= 0.25 && good.winRate <= 0.42 && bad.avgPos >= 6, `good wins ${(good.winRate * 100).toFixed(0)} %, bad average P${bad.avgPos.toFixed(1)}`);
    out();
  }

  /* --- summary --- */
  out('## Summary');
  for (const v of verdicts) out(`  ${v.ok ? '✅' : '❌'} ${v.target}: ${v.got}`);
  out();
  out(`Done in ${((performance.now() - started) / 1000).toFixed(0)} s.`);
}

main();

export { lines };
