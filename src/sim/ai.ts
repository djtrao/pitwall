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
  // rare Max Attack: last lap for aggressive drivers
  if (left === 1 && c.ai.aggression > 0.6) mode = MAX_ATTACK;
  // tyres nearly dead and far from the finish: look after them
  if (c.cond < t.cliffAt + 0.1 && left > 2 && !willStop && mode > NORMAL) mode = NORMAL;
  // nursing the tyres to the finish instead of stopping
  const endCond = c.cond - r * left;
  if (!willStop && tyreRuleOk(c.usedTyres) && left > 3 && endCond < t.cliffAt && endCond > t.cliffAt - 0.12) mode = CONSERVE;
  if (sc) mode = NORMAL;
  c.mode = mode;
}

/** How likely an AI attacker picks each move (used for choices and for the risk preview). */
export function attackChoiceOdds(c: Car, paceAdv: number): Record<DuelAttack, number> {
  const wait = c.cond < 0.3 && paceAdv < 0.3 ? 0.54 : 0.08;
  const outside = (1 - wait) * (0.33 + c.ai.aggression * 0.16);
  return { inside: 1 - wait - outside, outside, wait };
}

/** How likely an AI defender picks each move. */
export function defendChoiceOdds(paceDisadvantage: number): Record<DuelDefend, number> {
  const letGo = paceDisadvantage > 1.5 ? 0.62 : 0.06;
  return { coverInside: (1 - letGo) * 0.53, coverOutside: (1 - letGo) * 0.47, letGo };
}

function pickWeighted<K extends string>(c: Car, odds: Record<K, number>): K {
  let r = rand(c.rng);
  const keys = Object.keys(odds) as K[];
  for (const k of keys) {
    r -= odds[k];
    if (r < 0) return k;
  }
  return keys[keys.length - 1];
}

/** Duel choices for AI (and humans who did not answer in time / use auto duels). */
export function aiAttack(c: Car, paceAdv: number): DuelAttack {
  return pickWeighted(c, attackChoiceOdds(c, paceAdv));
}

export function aiDefend(c: Car, paceDisadvantage: number): DuelDefend {
  return pickWeighted(c, defendChoiceOdds(paceDisadvantage));
}
