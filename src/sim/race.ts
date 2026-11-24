import { aiAttack, aiDefend, aiOnLap, attackChoiceOdds, defendChoiceOdds } from './ai';
import { carLapTime, lapScale, mistakeChance, REF_LAP, tyreRuleOk, wearPerLap } from './model';
import { realLapSeconds } from './tracks';
import { chance, clamp, gauss, int, makeRng, rand, range, type Rng } from './rng';
import { makeTuning, type Tuning } from './tuning';
import type { Car, Command, Track, Duel, DuelAttack, DuelDefend, DuelOutcome, EventKind, RaceConfig, RaceEvent, RaceState } from './types';
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
    plannedLaps = range(scRng, tuning.safetyCar.minLaps, tuning.safetyCar.maxLaps);
  }

  const cars: Car[] = cfg.cars.map((s, i) => {
    const rng = makeRng(cfg.seed, 100 + i);
    const flowRng = makeRng(cfg.seed, 300 + i);
    const skill = Array.from({ length: tuning.flow.sectors }, () => gauss(flowRng) * tuning.flow.skill);
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
      pitPhase: null,
      decidedLap: -1,
      pitAwait: false,
      pitHold: 0,
      pitStood: 0,
      pitOutV: 0,
      pitTyre: null,
      stops: 0,
      loss: 0,
      flatSpot: false,
      wingDamage: false,
      engineDamage: false,
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
      skill,
      sectors: rollSectors(skill, flowRng, track, tuning),
      flowRng,
      rng,
    };
  });

  return {
    seed: cfg.seed,
    track,
    tuning,
    speed: cfg.speed ?? 1,
    timeScale: track.base / realLapSeconds(track, tuning),
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

/**
 * Time factor per sector for one lap: the driver's strengths, fresh luck and maybe one bad corner.
 * The strengths and the luck average out to zero; the bad corner's average cost is spread back over
 * the lap, so the expected lap time stays exactly `lapTime`.
 */
function rollSectors(skill: readonly number[], r: Rng, track: Track, t: Tuning): number[] {
  const f = t.flow;
  const n = f.sectors;
  const out = skill.map((s) => s + gauss(r) * f.luck);
  const mean = out.reduce((a, b) => a + b, 0) / n;
  // seconds → share of one sector's time
  const share = (sec: number) => (sec * lapScale(track) * n) / track.base;
  const avgBad = f.badChance * share((f.bad[0] + f.bad[1]) / 2);
  for (let k = 0; k < n; k++) out[k] -= mean + avgBad / n;
  if (chance(r, f.badChance)) out[int(r, 0, n - 1)] += share(range(r, f.bad[0], f.bad[1]));
  return out;
}

/** How much of a corner zone this spot is: 1 at a key corner / bend, fading smoothly to 0 at the zone edge. */
function cornerWeight(track: Track, frac: number, half: number): number {
  let w = 0;
  for (const k of [...track.corners, ...track.bends]) {
    const d = Math.abs(((frac - k.at + 1.5) % 1) - 0.5) / half;
    if (d < 1) w = Math.max(w, 0.5 + 0.5 * Math.cos(d * Math.PI));
  }
  return w;
}

/** Average corner weight over the lap (cached per track), to balance dirty air against slipstream. */
const cornerShareCache = new Map<string, number>();
function cornerShare(track: Track, half: number): number {
  const key = `${track.id}:${half}`;
  let v = cornerShareCache.get(key);
  if (v === undefined) {
    let n = 0;
    for (let i = 0; i < 1000; i++) n += cornerWeight(track, i / 1000, half);
    v = Math.min(0.9, Math.max(0.1, n / 1000));
    cornerShareCache.set(key, v);
  }
  return v;
}

/**
 * Extra time factor for this car right now: sector flow (blended smoothly from sector to sector),
 * plus dirty air / slipstream behind `ahead` (fading in smoothly as the gap closes).
 */
function flowFactor(c: Car, ahead: Car | undefined, race: RaceState): number {
  if (c.dist < 0) return 0;
  const t = race.tuning.flow;
  const n = t.sectors;
  const frac = c.dist - Math.floor(c.dist);
  // value at each sector's middle, blended in between; 0 at the line, where the next lap's values start
  const x = frac * n - 0.5;
  const i0 = Math.floor(x);
  const u = x - i0;
  const at = (i: number) => (i < 0 || i >= n ? 0 : c.sectors[i]);
  const s = 0.5 - 0.5 * Math.cos(u * Math.PI);
  let k = at(i0) * (1 - s) + at(i0 + 1) * s;
  if (ahead && !race.safetyCar.active) {
    const dd = ahead.dist - c.dist;
    const gap = dd * c.lapTime;
    const full = t.dirtyGap * lapScale(race.track);
    if (dd > 0 && dd < 0.5 && gap < full) {
      const near = Math.min(1, (full - gap) / (full * 0.5));
      const cs = cornerShare(race.track, t.cornerHalf);
      const w = cornerWeight(race.track, frac, t.cornerHalf);
      // close behind: slower in corners, faster on straights; zero on average over the lap
      k += (near * t.dirtyCorner * (w - cs)) / (1 - cs);
    }
  }
  return k;
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

/** Safety car for `laps` laps of track (random length: nobody knows when it comes in). */
function deploySafetyCar(race: RaceState, laps: number): void {
  const sc = race.safetyCar;
  if (sc.active || race.leaderFinished) return;
  const ld = leaderDist(race);
  // at least half a lap of racing after it
  const endAt = Math.min(ld + laps, race.track.laps - 0.5);
  if (endAt - ld < 0.3) return;
  sc.active = true;
  sc.endAt = endAt;
  sc.count++;
  for (const c of race.cars) {
    c.closeTime = 0;
    c.closeTo = null;
  }
  for (const d of race.duels) if (d.state !== 'done') cancelDuel(d);
  emit(race, 'safetyCar');
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

  // ----- pit lane: drive in slowly, stop in the box (at the line), drive out slowly -----
  for (const c of race.cars) {
    if (c.status !== 'pit') continue;
    if (c.pitPhase === 'stop') {
      c.pitTimer -= dt;
      c.pitStood += dt;
      if (c.pitTimer <= 0 && c.pitAwait) {
        // the player is still playing the pit stop game: the car stands until the game is done
        // (after `maxHold` real seconds without a result the crew finishes with an average stop)
        c.pitHold += realDt;
        if (c.pitHold < t.pit.maxHold) continue;
        c.pitAwait = false;
      }
      if (c.pitTimer <= 0) {
        c.pitTimer = 0;
        c.pitPhase = 'out';
        // Waiting for the game must not cost time: the stop counts as long as the game result says
        // (`pitTotal`). Time stood beyond that is made up on the way out, still under the limiter.
        const excess = c.pitStood - c.pitTotal;
        if (excess > 0) {
          const normal = t.pit.laneOut / pitLaneSpeed(race);
          c.pitOutV = t.pit.laneOut / Math.max(normal * t.pit.minOutShare, normal - excess);
        }
        c.tyre = c.pitTyre ?? c.tyre;
        c.pitTyre = null;
        c.cond = 1;
        c.tyreLaps = 0;
        if (!c.usedTyres.includes(c.tyre)) c.usedTyres.push(c.tyre);
        c.flatSpot = false;
        c.wingDamage = false;
        c.engineDamage = false;
      }
      continue;
    }
    const v = c.pitPhase === 'out' && c.pitOutV > 0 ? c.pitOutV : pitLaneSpeed(race);
    c.speed = v;
    c.dist += v * dt;
    if (c.pitPhase === 'in' && c.dist >= c.lap + 1) {
      // the box is at the line: the lap is complete
      c.dist = c.lap + 1;
      crossLine(race, c);
      if (c.status !== 'pit') continue; // finished
      c.pitPhase = 'stop';
      c.pitTimer = c.pitTotal;
    } else if (c.pitPhase === 'out' && c.dist >= c.lap + t.pit.laneOut) {
      c.status = 'running';
      c.pitPhase = null;
      c.pitOutV = 0;
      emit(race, 'pitOut', c, undefined, { tyre: c.tyre });
    }
  }

  // ----- lap times -----
  const running = race.cars.filter((c) => c.status === 'running').sort((a, b) => b.dist - a.dist);
  for (const c of running) c.lapTime = carLapTime(c, track, race.wetness, t);

  // ----- movement: nobody drives through the car ahead -----
  // A car that comes close eases off smoothly to the speed of the car ahead (no sudden stops, so a
  // queue of cars never jerks back and forth). It only gets past by winning a duel (then the two
  // swap places; the track view shows the attacker driving past).
  const next = new Map<Car, number>();
  for (let i = 0; i < running.length; i++) {
    const c = running[i];
    let v = 1 / (c.lapTime * (1 + flowFactor(c, running[i - 1], race)));
    if (c.loss > 0) v *= t.mistakes.slowFactor;
    if (sc.active && i === 0) v = Math.min(v, 1 / (track.base * t.safetyCar.slow));
    let nd = c.dist + v * dt;
    if (i > 0) {
      const a = running[i - 1];
      const aNext = next.get(a)!;
      // a car losing time from a mistake can be passed freely (except under the safety car);
      // lapped cars (a whole lap ahead in distance) never block.
      // a car already right next to the one ahead (it was going past) is not blocked any more.
      const alongside = (a.dist - c.dist) * c.lapTime < 0.15;
      if ((a.loss <= 0 || sc.active) && aNext - c.dist < 0.5 && !alongside) {
        const aV = Math.max(0, aNext - a.dist) / dt;
        // gap after this step if the car kept its speed
        const gap = (aNext - c.dist - v * dt) * c.lapTime;
        const m = t.duel.minGap;
        const soft = m * 1.6;
        if (gap < soft) {
          const w = clamp((soft - gap) / (soft - m * 0.7), 0, 1);
          const target = Math.min(v, aV * (gap < m ? 0.9 + 0.1 * Math.max(0, gap) / m : 1));
          nd = c.dist + (v + (target - v) * w) * dt;
        }
        // never through the car ahead
        if (nd > aNext - 0.02 / c.lapTime) nd = Math.max(c.dist, aNext - 0.02 / c.lapTime);
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
        if (c.closeTime >= t.duel.closeLaps * REF_LAP) startDuel(race, c, a);
      } else if (c.closeTo === a.id && gap < t.duel.closeGap * 1.6 && a.loss <= 0 && dd < 0.5) {
        // the gap breathes (corners / straights): the attack is only paused, not over
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
    else if (!sc.active && rand(c.rng) < mistakeChance(c, race.wetness, t) * lapScale(track) * dDist) makeMistake(race, c);
  }

  // ----- decisions before the pit entry, pit entry, line crossings -----
  for (const c of running) {
    if (c.status !== 'running') continue;
    const next = c.lap + 1; // the next line
    // decide just before the pit lane starts (AI strategy, BOX calls), then maybe turn in
    if (c.lap >= 0 && c.decidedLap < next && c.dist >= next - t.pit.laneIn - 0.02) {
      c.decidedLap = next;
      if (c.autopilot && next < track.laps) aiOnLap(race, c, next);
    }
    if (c.pitPlan && c.lap >= 0 && next < track.laps && !race.leaderFinished && c.dist >= next - t.pit.laneIn) {
      enterPits(race, c);
      continue;
    }
    if (Math.floor(c.dist) > c.lap) crossLine(race, c);
  }

  // finished cars roll on slowly (cool-down lap, for the track view)
  for (const c of race.cars) if (c.status === 'finished') c.dist += dt / (track.base + 8);

  resolveDuels(race);

  if (race.cars.every((c) => c.status === 'finished' || c.status === 'dnf')) race.over = true;
}

/** Pit lane speed limit (laps per sim second): pit lane time + an average stop = the track's pit loss. */
function pitLaneSpeed(race: RaceState): number {
  const t = race.tuning;
  const len = t.pit.laneIn + t.pit.laneOut;
  const laneTime = race.track.pitLoss * t.pitLossScale - t.pit.avgStop + len * race.track.base;
  return len / laneTime;
}

function enterPits(race: RaceState, c: Car): void {
  const t = race.tuning;
  c.status = 'pit';
  c.pitPhase = 'in';
  c.pitTyre = c.pitPlan;
  c.pitPlan = null;
  // standing time: average stop (+ repairs, + waiting for the team mate)
  let stop = t.pit.avgStop + (c.wingDamage ? t.duel.wingPitExtra : 0) + (c.engineDamage ? t.damage.enginePitExtra : 0);
  if (race.cars.some((o) => o !== c && o.teamId === c.teamId && o.status === 'pit')) stop += t.pit.doubleStack;
  const loss = race.track.pitLoss * t.pitLossScale + stop - t.pit.avgStop;
  c.pitHold = 0;
  c.pitStood = 0;
  c.pitOutV = 0;
  // the player plays the pit game – but not for the second car while the team mate is still
  // in the pit lane: that stop is done by the crew (a slightly slow one, they are busy)
  const mateIn = race.cars.some((o) => o !== c && o.teamId === c.teamId && o.status === 'pit');
  c.pitAwait = !!c.pitGame && c.human && !c.autopilot && !mateIn;
  if (!!c.pitGame && c.human && !c.autopilot && mateIn) stop += t.pit.busyCrew;
  if (!c.pitAwait) {
    // crew performance: usually close to average, sometimes a fumble
    stop += gauss(c.rng) * t.pit.crewSpread + (chance(c.rng, t.pit.crewFumble) ? t.pit.fumbleLoss : 0);
  }
  c.pitTotal = Math.max(1.5, stop);
  c.stops++;
  c.closeTime = 0;
  c.closeTo = null;
  emit(race, 'pitIn', c, undefined, { tyre: c.pitTyre!, loss: Math.round(loss * 10) / 10 });
}

/** A car reaches the line (on track or in the pit lane). */
function crossLine(race: RaceState, c: Car): void {
  const t = race.tuning;
  const f = Math.floor(c.dist + 1e-9);
  c.lap = f;
  if (f >= 1) {
    c.lastLap = race.time - c.lapStart;
    if (c.bestLap === null || c.lastLap < c.bestLap) c.bestLap = c.lastLap;
    c.tyreLaps++;
  }
  c.lapStart = race.time;
  if (f >= race.track.laps || (race.leaderFinished && f >= 1)) {
    c.pitPhase = null;
    finishCar(race, c);
    return;
  }
  c.noise = gauss(c.rng) * t.noise;
  c.sectors = rollSectors(c.skill, c.flowRng, race.track, t);
  if (f >= 1 && c.human && c.status === 'running' && c.cond < t.cliffAt + 0.05) emit(race, 'tyresWorn', c, undefined, { cond: Math.round(c.cond * 100) });
}

function updateWeather(race: RaceState, dt: number): void {
  const w = race.tuning.weather;
  const li = race.leaderFinished ? race.track.laps - 1 : leaderLap(race) - 1;
  const rain = race.weather.laps[li] ?? 0;
  if (rain > 0 && race.rainNow === 0) emit(race, 'rainStart', undefined, undefined, { intensity: rain });
  if (rain === 0 && race.rainNow > 0) emit(race, 'rainStop');
  race.rainNow = rain;
  const dl = dt / REF_LAP;
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
  emit(race, first ? 'win' : 'finish', c, undefined, c.penalty ? { penalty: c.penalty } : undefined);
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
  const adv = (def.lapTime - att.lapTime) / lapScale(race.track);
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
  // AI-only duels are decided at the end of this tick (resolveDuels), after the cars have moved:
  // deciding here, in the middle of the tick, let the movement step undo a pass at once.
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

/** How damage on either car changes a duel. */
export interface DuelMods {
  /** Multiplies the attacker's / defender's share of the crash risk. */
  attRisk: number;
  defRisk: number;
  /** Extra crash risk (e.g. attacking with a broken wing). */
  baseRisk: number;
  /** Added to the pass chance. */
  pass: number;
}

export const NO_MODS: DuelMods = { attRisk: 1, defRisk: 1, baseRisk: 0, pass: 0 };

/** Damage effects for a pair of cars. */
export function duelMods(tuning: Tuning, att: Car, def: Car): DuelMods {
  const d = tuning.damage;
  return {
    attRisk: att.wingDamage ? d.wingRisk : 1,
    defRisk: def.wingDamage ? d.wingRisk : 1,
    baseRisk: (att.wingDamage ? d.wingBaseRisk : 0) + (def.wingDamage ? d.wingBaseRisk : 0),
    pass:
      -(att.wingDamage ? d.wingPass : 0) - (att.engineDamage ? d.enginePass : 0) + (def.wingDamage ? d.wingPass : 0) + (def.engineDamage ? d.enginePass : 0),
  };
}

/** Pass chance (section 7.5 as changed after milestone 2): level against level, track and pace. */
function passChance(t: Tuning['duel'], overtaking: number, a: DuelAttack, d: DuelDefend, adv: number, mods: DuelMods): number {
  const bonus = Math.min(t.paceBonusMax, Math.max(-t.paceBonusMax, t.paceBonusPer03 * (adv / 0.3)));
  const ot = overtaking / 0.5;
  if (a === 4) return clamp(t.attackPass[4] * ot + bonus * 0.5 + mods.pass * 0.5, 0.03, t.allIn.maxPass);
  return clamp((t.attackPass[a] - t.defendCut[d]) * ot + bonus + mods.pass, 0.02, t.maxPass);
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
  mods: DuelMods = NO_MODS,
): Record<'pass' | 'fail' | 'crash' | 'spin' | 'off' | 'wait', number> {
  const t = tuning.duel;
  const out = { pass: 0, fail: 0, crash: 0, spin: 0, off: 0, wait: 0 };
  if (a === 0) return { ...out, wait: 1 };
  if (d === 0) return { ...out, pass: 1 };
  if (a === 4) {
    const pass = passChance(t, overtaking, a, d, adv, mods);
    const contact = Math.min(1 - pass, t.defendRisk[d] * mods.defRisk + mods.baseRisk);
    const rest = 1 - pass - contact;
    const punished = rest * Math.min(0.98, t.allIn.punish * Math.sqrt(mods.attRisk));
    out.pass = pass;
    out.spin = punished * t.allIn.spin;
    out.off = punished * t.allIn.off;
    out.crash = contact + punished * (1 - t.allIn.spin - t.allIn.off);
    out.fail = rest - punished;
    return out;
  }
  const crash = Math.min(
    0.9,
    t.attackRisk[a] * mods.attRisk + t.defendRisk[d] * mods.defRisk + (a >= 3 && d >= 3 ? t.bothHard * Math.max(mods.attRisk, mods.defRisk) : 0) + mods.baseRisk,
  );
  const pass = Math.min(passChance(t, overtaking, a, d, adv, mods), 1 - crash);
  return { ...out, crash, pass, fail: 1 - crash - pass };
}

/** Kept for older callers: pass and crash chance of a pair of choices. */
export function duelOdds(tuning: Tuning, overtaking: number, a: DuelAttack, d: DuelDefend, adv: number, mods: DuelMods = NO_MODS) {
  const o = duelOutcomes(tuning, overtaking, a, d, adv, mods);
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
  const adv = (def.lapTime - att.lapTime) / lapScale(race.track);
  const ot = race.track.overtaking;
  const mods = duelMods(race.tuning, att, def);
  const levels = [0, 1, 2, 3, 4] as const;
  if (carId === att.id) {
    const opp = defendChoiceOdds(adv);
    return levels.map((a) => {
      let success = 0;
      let risk = 0;
      levels.forEach((d) => {
        const o = duelOutcomes(race.tuning, ot, a, d, adv, mods);
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
      const o = duelOutcomes(race.tuning, ot, a, d, adv, mods);
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
  const adv = (def.lapTime - att.lapTime) / lapScale(race.track);
  if (d.attack === null) d.attack = aiAttack(att, adv, att.lap >= race.track.laps - 1);
  if (d.defend === null) d.defend = aiDefend(def, adv);
  const o = duelOutcomes(race.tuning, race.track.overtaking, d.attack, d.defend, adv, duelMods(race.tuning, att, def));
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

function damageEngine(race: RaceState, c: Car, p: number): void {
  if (c.engineDamage || !chance(race.rng, p)) return;
  c.engineDamage = true;
  emit(race, 'engineDamage', c);
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
      att.loss += t.failLoss[d.attack ?? 1];
      att.cond = Math.max(0, att.cond - t.failWear);
      if (humans) emit(race, 'duelFail', att, def, data);
      return;
    case 'spin':
      att.loss += race.tuning.mistakes.spin;
      emit(race, 'duelSpin', att, def, data);
      damageEngine(race, att, race.tuning.damage.engineFromSpin);
      return;
    case 'off':
      att.loss += race.tuning.mistakes.big;
      att.cond = Math.max(0, att.cond - race.tuning.mistakes.flatSpotWear);
      att.flatSpot = true;
      emit(race, 'duelOff', att, def, data);
      damageEngine(race, att, race.tuning.damage.engineFromOff);
      return;
    case 'crash': {
      att.loss += t.crashLoss;
      def.loss += t.crashLoss;
      emit(race, 'crash', att, def, data);
      // the one who took the bigger risk caused it: time penalty for risky moves
      const a = d.attack ?? 0;
      const df = d.defend ?? 0;
      const culprit = a >= df ? att : def;
      if ((culprit === att ? a : df) >= 3) {
        culprit.penalty += t.contactPenalty;
        emit(race, 'contactPenalty', culprit, culprit === att ? def : att, { seconds: t.contactPenalty });
      }
      if (!att.wingDamage && chance(race.rng, d.attack === 4 ? 0.6 : t.wingChance)) {
        att.wingDamage = true;
        emit(race, 'wingDamage', att);
      }
      damageEngine(race, att, race.tuning.damage.engineFromCrash);
      damageEngine(race, def, race.tuning.damage.engineFromCrash / 2);
      if (chance(race.rng, t.safetyCarOnCrash)) {
        deploySafetyCar(race, range(race.rng, race.tuning.safetyCar.minLaps, race.tuning.safetyCar.maxLaps));
      }
      return;
    }
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
      // the game result replaces the average stop (still in the pit lane or already standing)
      const total = Math.max(1.5, car.pitTotal + sec - race.tuning.pit.avgStop);
      if (car.pitPhase === 'stop') car.pitTimer += total - car.pitTotal;
      car.pitTotal = total;
      emit(race, 'pitStopTime', car, undefined, { seconds: Math.round(sec * 10) / 10 });
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
