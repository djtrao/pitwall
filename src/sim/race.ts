import { aiAttack, aiDefend, aiOnLap, attackChoiceOdds, defendChoiceOdds } from './ai';
import { carLapTime, mistakeChance, tyreRuleOk, wearPerLap } from './model';
import { chance, clamp, gauss, int, makeRng, rand, range } from './rng';
import { makeTuning, type Tuning } from './tuning';
import type { Car, Command, Duel, DuelAttack, DuelDefend, DuelOutcome, EventKind, RaceConfig, RaceEvent, RaceState } from './types';
import { NORMAL } from './types';
import { generateWeather } from './weather';

/* =====================================================================
 * The race simulation. Pure and deterministic: no DOM, no Date, no Math.random.
 * The same seed + the same commands always give the same race.
 * ===================================================================== */

export function createRace(cfg: RaceConfig): RaceState {
  const track = cfg.track;
  const tuning = cfg.tuning ?? makeTuning();
  const weather = cfg.weather ?? generateWeather(track, makeRng(cfg.seed, 1), tuning);
  const scRng = makeRng(cfg.seed, 2);

  let plannedAt: number | null = null;
  let plannedLaps = 0;
  if (cfg.safetyCar !== undefined) {
    if (cfg.safetyCar) {
      plannedAt = cfg.safetyCar.lap - 1 + (cfg.safetyCar.at ?? 0.5);
      plannedLaps = cfg.safetyCar.laps;
    }
  } else if (chance(scRng, track.safetyCarChance)) {
    const lap = int(scRng, 2, Math.max(2, track.laps - 2));
    plannedAt = lap - 1 + rand(scRng);
    plannedLaps = int(scRng, tuning.safetyCar.minLaps, tuning.safetyCar.maxLaps);
  }

  const cars: Car[] = cfg.cars.map((s, i) => {
    const rng = makeRng(cfg.seed, 100 + i);
    const ai = s.ai ?? {
      wetThreshold: range(rng, 26, 40),
      dryThreshold: range(rng, 16, 26),
      aggression: rand(rng),
    };
    return {
      ...s,
      autopilot: s.autopilot ?? !s.human,
      autoDuel: s.autoDuel ?? !s.human,
      ai,
      grid: i + 1,
      status: 'running',
      // grid slots about 0.35 s apart, behind the line
      dist: -(0.15 + i * 0.35) / track.base,
      lap: -1,
      cond: 1,
      tyre: s.startTyre,
      tyreLaps: 0,
      usedTyres: [s.startTyre],
      mode: NORMAL,
      pitPlan: null,
      pitTimer: 0,
      pitTotal: 0,
      pitAwait: false,
      pitHold: 0,
      pitTyre: null,
      stops: 0,
      loss: 0,
      flatSpot: false,
      wingDamage: false,
      penalty: 0,
      noise: gauss(rng) * tuning.noise,
      lapTime: track.base,
      speed: 0,
      lapStart: 0,
      lastLap: null,
      bestLap: null,
      finishTime: 0,
      closeTime: 0,
      closeTo: null,
      duelLap: -99,
      mistakes: 0,
      rng,
    };
  });

  return {
    seed: cfg.seed,
    track,
    tuning,
    speed: cfg.speed ?? 1,
    timeScale: track.base / tuning.realLapSeconds,
    time: 0,
    realTime: 0,
    ticks: 0,
    weather,
    wetness: weather.quali * 100,
    rainNow: weather.quali,
    safetyCar: { plannedAt, plannedLaps, active: false, endAt: 0, count: 0 },
    cars,
    duels: [],
    duelCooldown: {},
    leaderFinished: false,
    over: false,
    events: [],
    nextId: 1,
    rng: makeRng(cfg.seed, 0),
  };
}

function emit(race: RaceState, kind: EventKind, car?: Car, other?: Car, data?: RaceEvent['data']) {
  race.events.push({
    id: race.nextId++,
    time: race.time,
    lap: leaderLap(race),
    kind,
    car: car?.id,
    other: other?.id,
    data,
  });
}

function leaderDist(race: RaceState): number {
  let d = -Infinity;
  for (const c of race.cars) if ((c.status === 'running' || c.status === 'pit') && c.dist > d) d = c.dist;
  return d === -Infinity ? race.track.laps : d;
}

/** Leader lap, 1-based, as shown in the lap counter. */
export function leaderLap(race: RaceState): number {
  if (race.leaderFinished) return race.track.laps;
  return clamp(Math.floor(leaderDist(race)) + 1, 1, race.track.laps);
}

function deploySafetyCar(race: RaceState, laps: number): void {
  const sc = race.safetyCar;
  if (sc.active || race.leaderFinished) return;
  const ld = leaderDist(race);
  // the safety car comes in at the line; there must be at least one racing lap after it
  const endAt = Math.min(Math.ceil(ld) + laps - 1, race.track.laps - 1);
  if (endAt - ld < 0.5) return;
  sc.active = true;
  sc.endAt = endAt;
  sc.count++;
  for (const c of race.cars) {
    c.closeTime = 0;
    c.closeTo = null;
  }
  for (const d of race.duels) if (d.state !== 'done') cancelDuel(d);
  emit(race, 'safetyCar', undefined, undefined, { laps });
  for (const c of race.cars) if (c.human && c.status === 'running') emit(race, 'boxNow', c);
}

/* ------------------------------------------------------------------ */

/** Advance the race by one tick. `realDt` is real seconds (server: 0.1 s = 10 ticks per second). */
export function step(race: RaceState, realDt = 0.1): void {
  if (race.over) return;
  const t = race.tuning;
  const track = race.track;
  const dt = realDt * race.timeScale * race.speed;
  race.time += dt;
  race.realTime += realDt;
  race.ticks++;

  updateWeather(race, dt);

  // ----- safety car -----
  const sc = race.safetyCar;
  const ld = leaderDist(race);
  if (!sc.active && sc.plannedAt !== null && ld >= sc.plannedAt) {
    deploySafetyCar(race, sc.plannedLaps);
    sc.plannedAt = null;
  }
  if (sc.active && ld >= sc.endAt) {
    sc.active = false;
    emit(race, 'safetyCarEnd');
  }

  // ----- pit stops -----
  for (const c of race.cars) {
    if (c.status !== 'pit') continue;
    c.pitTimer -= dt;
    if (c.pitTimer <= 0 && c.pitAwait) {
      // the player is still playing the pit stop game: wait a little, then the crew does an average stop
      c.pitHold += realDt;
      if (c.pitHold < t.pit.maxHold) continue;
      c.pitAwait = false;
    }
    if (c.pitTimer <= 0) {
      c.pitTimer = 0;
      c.status = 'running';
      c.tyre = c.pitTyre ?? c.tyre;
      c.pitTyre = null;
      c.cond = 1;
      c.tyreLaps = 0;
      if (!c.usedTyres.includes(c.tyre)) c.usedTyres.push(c.tyre);
      c.flatSpot = false;
      c.wingDamage = false;
      emit(race, 'pitOut', c, undefined, { tyre: c.tyre });
    }
  }

  // ----- lap times -----
  const running = race.cars.filter((c) => c.status === 'running').sort((a, b) => b.dist - a.dist);
  for (const c of running) c.lapTime = carLapTime(c, track, race.wetness, t);

  // ----- movement: nobody drives through the car ahead -----
  const next = new Map<Car, number>();
  for (let i = 0; i < running.length; i++) {
    const c = running[i];
    let v = 1 / c.lapTime;
    if (c.loss > 0) v *= t.mistakes.slowFactor;
    if (sc.active && i === 0) v = Math.min(v, 1 / (track.base * t.safetyCar.slow));
    let nd = c.dist + v * dt;
    if (i > 0) {
      const a = running[i - 1];
      const aNext = next.get(a)!;
      // a car losing time from a mistake can be passed freely (except under the safety car);
      // lapped cars (a whole lap ahead in distance) never block.
      if ((a.loss <= 0 || sc.active) && aNext - c.dist < 0.5) {
        const maxD = aNext - t.duel.minGap / c.lapTime;
        if (nd > maxD) nd = Math.max(c.dist, maxD);
      }
    }
    next.set(c, nd);
  }

  // ----- duel detection -----
  if (!sc.active) {
    for (let i = 1; i < running.length; i++) {
      const c = running[i];
      const a = running[i - 1];
      const dd = next.get(a)! - next.get(c)!;
      const gap = dd * c.lapTime;
      if (gap < t.duel.closeGap && dd < 0.5 && c.lapTime < a.lapTime && a.loss <= 0 && c.dist > 0) {
        if (c.closeTo !== a.id) {
          c.closeTo = a.id;
          c.closeTime = 0;
        }
        c.closeTime += dt;
        if (c.closeTime >= t.duel.closeLaps * c.lapTime) startDuel(race, c, a);
      } else {
        c.closeTo = null;
        c.closeTime = 0;
      }
    }
  }

  // ----- apply movement, wear, mistakes -----
  for (const c of running) {
    const nd = next.get(c)!;
    c.speed = Math.max(0, nd - c.dist) / dt;
    // wear only counts from the start line on
    const dDist = Math.max(0, nd - Math.max(0, c.dist));
    c.dist = nd;
    if (c.dist <= 0) continue; // still behind the start line
    c.cond = Math.max(0, c.cond - wearPerLap(c.tyre, c.mode, race.wetness, track, t, sc.active) * dDist);
    if (c.loss > 0) c.loss = Math.max(0, c.loss - dt * (1 - t.mistakes.slowFactor));
    else if (!sc.active && rand(c.rng) < mistakeChance(c, race.wetness, t) * dDist) makeMistake(race, c);
  }

  // ----- line crossings -----
  for (const c of running) {
    if (c.status !== 'running') continue;
    const f = Math.floor(c.dist);
    if (f <= c.lap) continue;
    c.lap = f;
    if (f >= 1) {
      c.lastLap = race.time - c.lapStart;
      if (c.bestLap === null || c.lastLap < c.bestLap) c.bestLap = c.lastLap;
      c.tyreLaps++;
    }
    c.lapStart = race.time;
    if (f >= track.laps || (race.leaderFinished && f >= 1)) {
      finishCar(race, c);
      continue;
    }
    c.noise = gauss(c.rng) * t.noise;
    if (f < 1) continue; // start of lap 1
    if (c.autopilot) aiOnLap(race, c, f);
    if (c.pitPlan) {
      c.status = 'pit';
      c.pitTyre = c.pitPlan;
      c.pitPlan = null;
      c.pitTimer = track.pitLoss * t.pitLossScale * (sc.active ? t.safetyCar.pitFactor : 1) + (c.wingDamage ? t.duel.wingPitExtra : 0);
      // team mate already in the box: wait behind him
      if (race.cars.some((o) => o !== c && o.teamId === c.teamId && o.status === 'pit')) c.pitTimer += t.pit.doubleStack;
      const baseLoss = c.pitTimer;
      c.pitHold = 0;
      c.pitAwait = !!c.pitGame && c.human && !c.autopilot;
      if (!c.pitAwait) {
        // crew performance: usually close to average, sometimes a fumble
        c.pitTimer += gauss(c.rng) * t.pit.crewSpread + (chance(c.rng, t.pit.crewFumble) ? t.pit.fumbleLoss : 0);
      }
      c.pitTotal = c.pitTimer;
      c.stops++;
      c.closeTime = 0;
      c.closeTo = null;
      emit(race, 'pitIn', c, undefined, { tyre: c.pitTyre, loss: Math.round(baseLoss * 10) / 10 });
      continue;
    }
    if (c.human) {
      if (c.cond < t.cliffAt + 0.05) emit(race, 'tyresWorn', c, undefined, { cond: Math.round(c.cond * 100) });
    }
  }

  // finished cars roll on slowly (cool-down lap, for the track view)
  for (const c of race.cars) if (c.status === 'finished') c.dist += dt / (track.base + 8);

  resolveDuels(race);

  if (race.cars.every((c) => c.status === 'finished' || c.status === 'dnf')) race.over = true;
}

function updateWeather(race: RaceState, dt: number): void {
  const w = race.tuning.weather;
  const li = race.leaderFinished ? race.track.laps - 1 : leaderLap(race) - 1;
  const rain = race.weather.laps[li] ?? 0;
  if (rain > 0 && race.rainNow === 0) emit(race, 'rainStart', undefined, undefined, { intensity: rain });
  if (rain === 0 && race.rainNow > 0) emit(race, 'rainStop');
  race.rainNow = rain;
  const dl = dt / race.track.base;
  const target = rain * 100;
  if (race.wetness < target) race.wetness = Math.min(target, race.wetness + w.rise * dl);
  else race.wetness = Math.max(target, race.wetness - (rain > 0 ? w.dryWhileRaining : w.dry) * dl);
}

function makeMistake(race: RaceState, c: Car): void {
  const t = race.tuning;
  const m = t.mistakes;
  c.mistakes++;
  if (c.tyre !== 'W' && race.wetness > m.spinWetness) {
    c.loss += m.spin;
    emit(race, 'spin', c);
  } else if (rand(c.rng) < t.modes[c.mode].bigShare) {
    c.loss += m.big;
    c.cond = Math.max(0, c.cond - m.flatSpotWear);
    c.flatSpot = true;
    emit(race, 'mistakeBig', c);
  } else {
    const loss = range(c.rng, m.small[0], m.small[1]);
    c.loss += loss;
    emit(race, 'mistakeSmall', c, undefined, { loss: Math.round(loss * 10) / 10 });
  }
}

function finishCar(race: RaceState, c: Car): void {
  c.status = 'finished';
  c.finishTime = race.time;
  c.lap = Math.min(c.lap, race.track.laps);
  const first = !race.leaderFinished;
  race.leaderFinished = true;
  if (!tyreRuleOk(c.usedTyres)) {
    c.penalty += race.tuning.rules.twoCompoundPenalty;
    emit(race, 'penalty', c, undefined, { seconds: race.tuning.rules.twoCompoundPenalty });
  }
  emit(race, first ? 'win' : 'finish', c);
}

/* ----------------------------- duels ------------------------------ */

const pairKey = (a: Car, b: Car) => (a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);
const carById = (race: RaceState, id: string) => race.cars.find((c) => c.id === id)!;
const asksHuman = (c: Car) => c.human && !c.autoDuel && !c.autopilot;

function startDuel(race: RaceState, att: Car, def: Car): void {
  const key = pairKey(att, def);
  if ((race.duelCooldown[key] ?? -1) > att.dist) return;
  if (att.duelLap === att.lap || def.duelLap === def.lap) return;
  const busy = (id: string) => race.duels.some((d) => d.state !== 'done' && (d.attacker === id || d.defender === id));
  if (busy(att.id) || busy(def.id)) return;
  const adv = def.lapTime - att.lapTime;
  const lastLap = att.lap >= race.track.laps - 1;
  const duel: Duel = {
    id: race.nextId++,
    attacker: att.id,
    defender: def.id,
    lap: leaderLap(race),
    at: att.dist,
    deadline: race.realTime + race.tuning.duel.answerSeconds,
    attack: asksHuman(att) ? null : aiAttack(att, adv, lastLap),
    defend: asksHuman(def) ? null : aiDefend(def, adv),
    prompted: asksHuman(att) || asksHuman(def),
    state: 'choosing',
  };
  race.duels.push(duel);
  att.duelLap = att.lap;
  def.duelLap = def.lap;
  att.closeTime = 0;
  race.duelCooldown[key] = att.dist + 1;
  if (att.human || def.human) emit(race, 'duelStart', att, def, { duel: duel.id });
  // AI-only duels are decided at once
  if (!duel.prompted) decideDuel(race, duel);
}

function resolveDuels(race: RaceState): void {
  for (const d of race.duels) {
    if (d.state === 'choosing' && ((d.attack !== null && d.defend !== null) || race.realTime >= d.deadline)) decideDuel(race, d);
    if (d.state === 'showing' && race.realTime >= (d.applyAt ?? 0)) applyDuel(race, d);
  }
  // keep the list short
  if (race.duels.length > 40) race.duels = race.duels.filter((d) => d.state !== 'done' || race.realTime - d.deadline < 10);
}

function cancelDuel(d: Duel): void {
  d.state = 'done';
  d.outcome = 'cancelled';
}

/** Pass chance (section 7.5 as changed after milestone 2): level against level, track and pace. */
function passChance(t: Tuning['duel'], overtaking: number, a: DuelAttack, d: DuelDefend, adv: number): number {
  const bonus = Math.min(t.paceBonusMax, Math.max(-t.paceBonusMax, t.paceBonusPer03 * (adv / 0.3)));
  const ot = overtaking / 0.5;
  if (a === 4) return clamp(t.attackPass[4] * ot + bonus * 0.5, 0.03, t.allIn.maxPass);
  return clamp((t.attackPass[a] - t.defendCut[d]) * ot + bonus, 0.02, t.maxPass);
}

/**
 * Chances of every outcome for a pair of choices. All values add up to 1.
 */
export function duelOutcomes(
  tuning: Tuning,
  overtaking: number,
  a: DuelAttack,
  d: DuelDefend,
  adv: number,
): Record<'pass' | 'fail' | 'crash' | 'spin' | 'off' | 'wait', number> {
  const t = tuning.duel;
  const out = { pass: 0, fail: 0, crash: 0, spin: 0, off: 0, wait: 0 };
  if (a === 0) return { ...out, wait: 1 };
  if (d === 0) return { ...out, pass: 1 };
  if (a === 4) {
    const pass = passChance(t, overtaking, a, d, adv);
    const contact = Math.min(1 - pass, t.defendRisk[d]);
    const rest = 1 - pass - contact;
    const punished = rest * t.allIn.punish;
    out.pass = pass;
    out.spin = punished * t.allIn.spin;
    out.off = punished * t.allIn.off;
    out.crash = contact + punished * (1 - t.allIn.spin - t.allIn.off);
    out.fail = rest - punished;
    return out;
  }
  const crash = t.attackRisk[a] + t.defendRisk[d] + (a >= 3 && d >= 3 ? t.bothHard : 0);
  const pass = Math.min(passChance(t, overtaking, a, d, adv), 1 - crash);
  return { ...out, crash, pass, fail: 1 - crash - pass };
}

/** Kept for older callers: pass and crash chance of a pair of choices. */
export function duelOdds(tuning: Tuning, overtaking: number, a: DuelAttack, d: DuelDefend, adv: number) {
  const o = duelOutcomes(tuning, overtaking, a, d, adv);
  return { pass: o.pass, crash: o.crash + o.spin + o.off };
}

export interface DuelOption {
  choice: DuelAttack | DuelDefend;
  /** Attacker: chance to get past. Defender: chance to stay ahead. */
  success: number;
  /** Chance that something bad happens to this car (crash, spin, going off). */
  risk: number;
}

/**
 * What each level is likely to bring for `carId` in this duel, averaged over what the
 * opponent will probably choose. Used for the chances and risk symbols in the duel prompt.
 */
export function duelPreview(race: RaceState, duel: Duel, carId: string): DuelOption[] {
  const att = carById(race, duel.attacker);
  const def = carById(race, duel.defender);
  const adv = def.lapTime - att.lapTime;
  const ot = race.track.overtaking;
  const levels = [0, 1, 2, 3, 4] as const;
  if (carId === att.id) {
    const opp = defendChoiceOdds(adv);
    return levels.map((a) => {
      let success = 0;
      let risk = 0;
      levels.forEach((d) => {
        const o = duelOutcomes(race.tuning, ot, a, d, adv);
        success += opp[d] * o.pass;
        risk += opp[d] * (o.crash + o.spin + o.off);
      });
      return { choice: a, success, risk };
    });
  }
  const opp = attackChoiceOdds(att, adv, att.lap >= race.track.laps - 1);
  return levels.map((d) => {
    let success = 0;
    let risk = 0;
    levels.forEach((a) => {
      const o = duelOutcomes(race.tuning, ot, a, d, adv);
      success += opp[a] * (1 - o.pass - o.crash);
      risk += opp[a] * o.crash;
    });
    return { choice: d, success, risk };
  });
}

/** Both have chosen (or time is up): roll the outcome. It counts after the animation. */
function decideDuel(race: RaceState, d: Duel): void {
  const att = carById(race, d.attacker);
  const def = carById(race, d.defender);
  const adv = def.lapTime - att.lapTime;
  if (d.attack === null) d.attack = aiAttack(att, adv, att.lap >= race.track.laps - 1);
  if (d.defend === null) d.defend = aiDefend(def, adv);
  const o = duelOutcomes(race.tuning, race.track.overtaking, d.attack, d.defend, adv);
  let r = rand(race.rng);
  let outcome: DuelOutcome = 'fail';
  for (const k of ['wait', 'pass', 'crash', 'spin', 'off', 'fail'] as const) {
    if (r < o[k]) {
      outcome = k;
      break;
    }
    r -= o[k];
  }
  d.outcome = outcome;
  if (d.prompted) {
    d.state = 'showing';
    d.applyAt = race.realTime + race.tuning.duel.showSeconds;
  } else applyDuel(race, d);
}

function applyDuel(race: RaceState, d: Duel): void {
  const t = race.tuning.duel;
  const att = carById(race, d.attacker);
  const def = carById(race, d.defender);
  d.state = 'done';
  // the situation may have changed (pit stop, safety car, finish)
  const gap = (def.dist - att.dist) * att.lapTime;
  if (att.status !== 'running' || def.status !== 'running' || race.safetyCar.active || gap < 0 || gap > 1.5) {
    d.outcome = 'cancelled';
    return;
  }
  const humans = att.human || def.human;
  const data = { attack: d.attack ?? 0, defend: d.defend ?? 0 };
  switch (d.outcome) {
    case 'wait':
      if (humans) emit(race, 'duelWait', att, def, data);
      return;
    case 'pass':
      att.dist = def.dist + t.passMargin / att.lapTime;
      def.closeTime = 0;
      emit(race, 'pass', att, def, data);
      return;
    case 'fail':
      att.loss += t.failLoss;
      att.cond = Math.max(0, att.cond - t.failWear);
      if (humans) emit(race, 'duelFail', att, def, data);
      return;
    case 'spin':
      att.loss += race.tuning.mistakes.spin;
      emit(race, 'duelSpin', att, def, data);
      return;
    case 'off':
      att.loss += race.tuning.mistakes.big;
      att.cond = Math.max(0, att.cond - race.tuning.mistakes.flatSpotWear);
      att.flatSpot = true;
      emit(race, 'duelOff', att, def, data);
      return;
    case 'crash':
      att.loss += t.crashLoss;
      def.loss += t.crashLoss;
      emit(race, 'crash', att, def, data);
      if (chance(race.rng, d.attack === 4 ? 0.6 : t.wingChance)) {
        att.wingDamage = true;
        emit(race, 'wingDamage', att);
      }
      if (chance(race.rng, t.safetyCarOnCrash)) {
        deploySafetyCar(race, int(race.rng, race.tuning.safetyCar.minLaps, race.tuning.safetyCar.maxLaps));
      }
      return;
  }
}

/* --------------------------- commands ----------------------------- */

/** Apply a command from a player's phone. Invalid commands are ignored. Returns true if applied. */
export function applyCommand(race: RaceState, cmd: Command): boolean {
  const car = race.cars.find((c) => c.id === cmd.car);
  if (!car || car.status === 'finished' || car.status === 'dnf') return false;
  switch (cmd.type) {
    case 'mode':
      if (![0, 1, 2, 3].includes(cmd.mode)) return false;
      car.mode = cmd.mode;
      return true;
    case 'pit':
      if (cmd.tyre !== null && !['S', 'M', 'H', 'W'].includes(cmd.tyre)) return false;
      car.pitPlan = cmd.tyre;
      return true;
    case 'autoDuel':
      car.autoDuel = cmd.on;
      return true;
    case 'autopilot':
      car.autopilot = cmd.on;
      if (cmd.on) car.mode = NORMAL;
      return true;
    case 'duel': {
      const d = race.duels.find((x) => x.id === cmd.duel && x.state === 'choosing');
      if (!d || ![0, 1, 2, 3, 4].includes(cmd.choice)) return false;
      if (d.attacker === car.id && d.attack === null) d.attack = cmd.choice as DuelAttack;
      else if (d.defender === car.id && d.defend === null) d.defend = cmd.choice as DuelDefend;
      else return false;
      return true;
    }
    case 'pitStop': {
      if (car.status !== 'pit' || !car.pitAwait) return false;
      const sec = clamp(Number(cmd.seconds) || race.tuning.pit.avgStop, 1.5, 15);
      car.pitAwait = false;
      car.pitTimer += sec - race.tuning.pit.avgStop;
      emit(race, 'pitStopTime', car, undefined, { seconds: Math.round(sec * 10) / 10 });
      if (cmd.unsafe) {
        car.penalty += race.tuning.pit.unsafeReleasePenalty;
        emit(race, 'unsafeRelease', car, undefined, { seconds: race.tuning.pit.unsafeReleasePenalty });
      }
      return true;
    }
  }
}

/* ---------------------------- results ----------------------------- */

/** Live order: finished cars first, then by distance; retired cars last. */
export function standings(race: RaceState): Car[] {
  const rank = (c: Car) => (c.status === 'finished' ? 0 : c.status === 'dnf' ? 2 : 1);
  return race.cars.slice().sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r) return r;
    if (a.status === 'finished') return b.lap - a.lap || a.finishTime - b.finishTime;
    if (a.status === 'dnf') return b.dist - a.dist;
    return b.dist - a.dist;
  });
}

export interface ResultRow {
  pos: number;
  car: Car;
  /** Race time including penalties (s), null for DNF. */
  time: number | null;
  laps: number;
  gap: number | null;
  gained: number;
}

/** Final classification (penalties included). */
export function results(race: RaceState): ResultRow[] {
  const fin = race.cars.filter((c) => c.status === 'finished');
  const dnf = race.cars.filter((c) => c.status !== 'finished').sort((a, b) => b.dist - a.dist);
  fin.sort((a, b) => b.lap - a.lap || a.finishTime + a.penalty - (b.finishTime + b.penalty));
  const winner = fin[0];
  return [...fin, ...dnf].map((c, i) => {
    const time = c.status === 'finished' ? c.finishTime + c.penalty : null;
    return {
      pos: i + 1,
      car: c,
      time,
      laps: c.status === 'finished' ? c.lap : Math.max(0, Math.floor(c.dist)),
      gap: time !== null && winner && c.lap === winner.lap ? time - (winner.finishTime + winner.penalty) : null,
      gained: c.grid - (i + 1),
    };
  });
}

/** Run a race to the end without commands (AI only / autopilot). */
export function simulate(race: RaceState, realDt = 0.1, maxTicks = 200000): RaceState {
  while (!race.over && race.ticks < maxTicks) step(race, realDt);
  return race;
}
