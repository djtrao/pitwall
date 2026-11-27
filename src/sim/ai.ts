import { rand } from './rng';
import { stintCost, tyreRuleOk, wearPerLap } from './model';
import type { Car, DuelAttack, DuelDefend, Mode, RaceState, Tyre } from './types';
import { CONSERVE, DRY_TYRES, MAX_ATTACK, NORMAL, PUSH } from './types';

/**
 * Best dry compound for the remaining `left` laps, respecting the two-compound rule.
 * Picks the compound with the lowest estimated stint time (including the cliff).
 */
export function pickDryTyre(race: RaceState, c: Car, left: number): Tyre {
  const dry = c.usedTyres.filter((x) => x !== 'W');
  const usedRain = c.usedTyres.includes('W');
  // the compound we are on (or the only one used) must change if the rule is not met yet
  const mustAvoid = !usedRain && new Set(dry).size === 1 ? dry[0] : null;
  let best: Tyre = 'M';
  let bestCost = Infinity;
  for (const k of DRY_TYRES) {
    if (k === mustAvoid) continue;
    const cost = stintCost(k, left, race.track, race.tuning) + rand(c.rng) * 0.6 * c.ai.aggression;
    if (cost < bestCost) {
      bestCost = cost;
      best = k;
    }
  }
  return best;
}

function gapAheadBehind(race: RaceState, c: Car): { ahead: number; behind: number } {
  let ahead = Infinity;
  let behind = Infinity;
  for (const o of race.cars) {
    if (o === c || o.status !== 'running') continue;
    const d = (o.dist - c.dist) * c.lapTime;
    if (d > 0 && d < ahead) ahead = d;
    if (d < 0 && -d < behind) behind = -d;
  }
  return { ahead, behind };
}

/**
 * AI decision when a car crosses the line (it has just completed `done` laps).
 * Sets the driving mode for the next lap and the pit plan. The race checks the pit plan
 * right after this call, so a plan set here means "box now".
 */
export function aiOnLap(race: RaceState, c: Car, done: number): void {
  const t = race.tuning;
  const track = race.track;
  const left = track.laps - done;
  if (left <= 0) return;
  const w = race.wetness;
  const sc = race.safetyCar.active;

  // ---------- pit decisions ----------
  c.pitPlan = null;
  if (left >= 2) {
    if (c.tyre !== 'W') {
      if (w > c.ai.wetThreshold) c.pitPlan = 'W';
    } else if (w < c.ai.dryThreshold && race.rainNow === 0) {
      c.pitPlan = pickDryTyre(race, c, left);
    }
    // damaged car: come in for repairs while there is still time to gain from it
    if (!c.pitPlan && (c.wingDamage || c.engineDamage) && left >= 3) {
      c.pitPlan = c.tyre === 'W' && w > c.ai.dryThreshold ? 'W' : pickDryTyre(race, c, left);
    }
    if (!c.pitPlan && c.tyre !== 'W') {
      const r = wearPerLap(c.tyre, NORMAL, w, track, t, false);
      const endCond = c.cond - r * left;
      const ruleOk = tyreRuleOk(c.usedTyres);
      const used = (1 - c.cond) / (1 - t.cliffAt); // share of a full stint used
      if (sc && (used > 0.4 || !ruleOk)) {
        // cheap stop under the safety car
        c.pitPlan = pickDryTyre(race, c, left);
      } else if (ruleOk && endCond > t.cliffAt - 0.08) {
        // tyres reach the finish
      } else if (c.cond < t.cliffAt + 0.07 + c.ai.aggression * 0.1) {
        c.pitPlan = pickDryTyre(race, c, left);
      } else if (!ruleOk && left <= 2) {
        c.pitPlan = pickDryTyre(race, c, left);
      }
    }
  } else if (left === 1 && !tyreRuleOk(c.usedTyres) && c.tyre !== 'W') {
    // a last-lap stop only makes sense if it costs less than the penalty
    if (track.pitLoss * t.pitLossScale < t.rules.twoCompoundPenalty) c.pitPlan = pickDryTyre(race, c, left);
  }

  // ---------- driving mode ----------
  // Push and Max Attack only cost tyre wear and mistake risk.
  let mode: Mode = NORMAL;
  const { ahead, behind } = gapAheadBehind(race, c);
  const willStop = c.pitPlan !== null;
  const r = wearPerLap(c.tyre, NORMAL, w, track, t, false);
  if (left <= 3) mode = PUSH;
  else if (ahead < 1.0 || behind < 0.8) mode = PUSH;
  // rare Max Attack: last lap for aggressive drivers, but not on worn tyres (too dangerous)
  if (left === 1 && c.ai.aggression > 0.6 && c.cond >= t.wornOff[0][0]) mode = MAX_ATTACK;
  // tyres nearly dead and far from the finish: look after them
  if (c.cond < t.cliffAt + 0.1 && left > 2 && !willStop && mode > NORMAL) mode = NORMAL;
  // nursing the tyres to the finish instead of stopping
  const endCond = c.cond - r * left;
  if (!willStop && tyreRuleOk(c.usedTyres) && left > 3 && endCond < t.cliffAt && endCond > t.cliffAt - 0.12) mode = CONSERVE;
  if (sc) mode = NORMAL;
  c.mode = mode;
}

/** Probabilities for levels 0..4 (index = level). */
export type LevelOdds = [number, number, number, number, number];

/**
 * How likely an AI attacker picks each level (0 Wait … 4 All or nothing).
 * Used for the AI's own choice and for the chance/risk preview shown to players.
 */
export function attackChoiceOdds(c: Car, paceAdv: number, lastLap = false): LevelOdds {
  const wait = c.cond < 0.3 && paceAdv < 0.3 ? 0.5 : 0.08;
  const g = c.ai.aggression;
  const w = [0, 0.4 - 0.15 * g, 0.35, 0.2 + 0.15 * g, lastLap ? 0.2 : 0.05];
  const sum = w.reduce((s, x) => s + x, 0);
  return [wait, ...w.slice(1).map((x) => ((1 - wait) * x) / sum)] as LevelOdds;
}

/** How likely an AI defender picks each level (0 Let go … 4 Slam the door). */
export function defendChoiceOdds(paceDisadvantage: number): LevelOdds {
  const letGo = paceDisadvantage > 1.5 ? 0.6 : 0.06;
  const w = [0, 0.3, 0.35, 0.25, 0.1];
  return [letGo, ...w.slice(1).map((x) => (1 - letGo) * x)] as LevelOdds;
}

function pickLevel(c: Car, odds: LevelOdds): number {
  let r = rand(c.rng);
  for (let i = 0; i < odds.length; i++) {
    r -= odds[i];
    if (r < 0) return i;
  }
  return odds.length - 1;
}

/** Duel choices for AI (and humans who did not answer in time / use auto duels). */
export function aiAttack(c: Car, paceAdv: number, lastLap = false): DuelAttack {
  return pickLevel(c, attackChoiceOdds(c, paceAdv, lastLap)) as DuelAttack;
}

export function aiDefend(c: Car, paceDisadvantage: number): DuelDefend {
  return pickLevel(c, defendChoiceOdds(paceDisadvantage)) as DuelDefend;
}
