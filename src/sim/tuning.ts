/**
 * Every balance number of the race model lives here, so the balance runner can
 * try different values without touching the simulation code.
 * Defaults are the values from SPEC.md (sections 7.1 – 7.6), as tuned with the balance runner.
 */
export const DEFAULT_TUNING = {
  /**
   * Real seconds per unit of drawn track length at 1× speed: cars move across the screen at
   * the same speed on every track; longer tracks simply take longer (about 32–36 s per lap).
   */
  realSecondsPerLength: 8.5,
  /** Kept for the balance runner's race-length check (average lap). */
  realLapSeconds: 34,
  /** Random lap-time noise (standard deviation, s), new each lap. */
  noise: 0.45,

  /**
   * Natural driving within a lap. The lap is cut into sectors; each driver is a bit quicker or
   * slower in each (lasting strengths + new luck every lap), sometimes misses a corner, and loses
   * a little in corners / gains on straights when right behind another car (dirty air, slipstream).
   * Averaged over a lap this changes nothing: lap times and the balance stay the same.
   */
  flow: {
    sectors: 12,
    /** Lasting strength per sector (share of the sector time, standard deviation). */
    skill: 0.02,
    /** New luck per sector and lap. */
    luck: 0.03,
    /** Chance per lap of one clearly bad corner, and the time it costs (s). */
    badChance: 0.35,
    bad: [0.3, 0.7] as [number, number],
    /** Closer than this (s) behind a car: dirty air in corners, slipstream on straights. */
    dirtyGap: 1.6,
    dirtyCorner: 0.03,
    /** Half the length of a corner zone around each key corner / bend (lap share). */
    cornerHalf: 0.035,
  },

  tyres: {
    S: { pace: 0, wear: 12 },
    M: { pace: 0.6, wear: 8 },
    H: { pace: 1.2, wear: 5.5 },
    /** Rain tyre: wear on a wet track / when wetness is under `dryBelow`. */
    W: { pace: 0, wear: 3, wearDry: 14, dryBelow: 25 },
  },
  /** Slicks wear less on a wet track (prototype model). */
  slickWetWear: { above: 40, factor: 0.6 },
  /** Wear penalty = (1 − condition) × slope, plus a cliff below `cliffAt`. */
  wearSlope: 2.5,
  cliffAt: 0.25,
  cliffSlope: 16,

  /** Driving modes: 0 Conserve, 1 Normal, 2 Push, 3 Max Attack. */
  modes: [
    { pace: 0.5, wear: 0.6, mistake: 0, bigShare: 0 },
    { pace: 0, wear: 1.0, mistake: 0.005, bigShare: 0 },
    { pace: -0.8, wear: 1.25, mistake: 0.03, bigShare: 0.1 },
    { pace: -1.5, wear: 1.4, mistake: 0.08, bigShare: 0.25 },
  ],

  mistakes: {
    /** Below this condition the mistake chance rises, up to ×wornMax at 0 %. */
    wornBelow: 0.4,
    wornMax: 2,
    /** Slicks on a wet track: chance rises from `wetFrom` to ×wetMax at `wetFull`. */
    wetFrom: 15,
    wetFull: 45,
    wetMax: 3,
    /** On slicks above this wetness a mistake becomes a spin. */
    spinWetness: 30,
    small: [1.5, 2.5] as [number, number],
    big: 5,
    spin: 6,
    flatSpotWear: 0.2,
    flatSpotPace: 0.3,
    /** While losing time the car drives at this share of its speed. */
    slowFactor: 0.4,
  },

  weather: {
    /** Everyone: seconds per % wetness. */
    allPerWet: 0.03,
    slickFrom: 15,
    slickPer: 0.06,
    rainFrom: 35,
    rainPer: 0.11,
    rainBase: 0.8,
    /** Wetness change in % per lap of simulated time. */
    rise: 40,
    dry: 10,
    dryWhileRaining: 20,
    /** Chance per lap that a shower stops (laps are long: showers come and go). */
    stopChance: 0.3,
  },

  duel: {
    /** Gap (s) that counts as "close" for starting a duel. */
    closeGap: 1.2,
    /** A faster car can close up to about this gap (s, about one car length on screen), then must win a duel. */
    minGap: 0.8,
    /** Share of a lap the attacker must stay close before a duel starts. */
    closeLaps: 0.35,
    /** Real seconds a human has to choose. */
    answerSeconds: 6,
    /** Real seconds the duel animation runs before the result counts (only when a human chose). */
    showSeconds: 3,
    /**
     * Levels: attack 0 = Wait, 1 Careful, 2 Bold, 3 Risky, 4 All or nothing.
     * Defend 0 = Let go, 1 Clean, 2 Hard, 3 Very hard, 4 Slam the door.
     */
    attackPass: [0, 0.45, 0.55, 0.68, 0.2],
    /** Taken off the pass chance by the defence level (All or nothing ignores it). */
    defendCut: [0, 0, 0.12, 0.24, 0.36],
    /** Crash chance added by each level. */
    attackRisk: [0, 0, 0.04, 0.12, 0],
    defendRisk: [0, 0, 0.03, 0.08, 0.14],
    /** Extra crash chance when both fight at level 3 or more. */
    bothHard: 0.06,
    /** Time penalty for causing contact at level 3 or more (whoever chose the higher level). */
    contactPenalty: 5,
    /** All or nothing: share of failures that are punished, split into spin / off (rest: contact). */
    allIn: { punish: 0.85, spin: 0.5, off: 0.3, maxPass: 0.4 },
    /** Extra pass chance per 0.3 s of pace advantage, capped. */
    paceBonusPer03: 0.1,
    paceBonusMax: 0.3,
    maxPass: 0.95,
    /** Time lost by a failed attack, per attack level (risky moves cost more). */
    failLoss: [0, 0.2, 0.5, 0.9, 1.4],
    failWear: 0.02,
    crashLoss: 3,
    wingChance: 0.3,
    wingPace: 0.8,
    wingPitExtra: 5,
    safetyCarOnCrash: 0.25,
    /** How much ahead of the defender the attacker is placed after a pass (s). */
    passMargin: 0.2,
  },

  /** Damage: what a broken front wing or engine does until it is repaired in the pits. */
  damage: {
    /** Engine: less top speed. */
    enginePace: 1.0,
    enginePitExtra: 8,
    /** Chance of engine damage from contact / going off / a spin in a duel. */
    engineFromCrash: 0.2,
    engineFromOff: 0.15,
    engineFromSpin: 0.05,
    /** Broken wing: driving mistakes more likely, duel risks higher. */
    wingMistakes: 1.5,
    wingRisk: 1.6,
    /** Even a careful move gets some crash risk with a broken wing. */
    wingBaseRisk: 0.03,
    /** Pass chance change for the damaged car (attacker − / defender +). */
    wingPass: 0.08,
    enginePass: 0.15,
  },

  pit: {
    /** Pit lane: starts this share of a lap before the line, the box is at the line, exit after it. */
    laneIn: 0.035,
    laneOut: 0.045,
    /** Average time the car stands still (s, F1 scale) – already part of the track pit loss. */
    avgStop: 2.6,
    /** AI crews: spread of the standing time and chance of a fumbled stop. */
    crewSpread: 0.25,
    crewFumble: 0.05,
    fumbleLoss: 2,
    /** Real seconds the car waits in the box for the pit stop game before the crew does an average stop. */
    maxHold: 12,
    /** Waiting for the game is made up on the way out, but the exit takes at least this share of its normal time. */
    minOutShare: 0.75,
    /** Second car of a player's team while the first is still in the pit lane: crew stop, a bit slow (s). */
    busyCrew: 0.4,
    /** Second car of a team waits behind the first. */
    doubleStack: 3,
  },

  safetyCar: {
    /** Lap time under the safety car = base × slow (a stop in the pit lane costs less then). */
    slow: 1.8,
    /** How long it stays out, in laps of track (random, not always ending at the line). */
    minLaps: 0.6,
    maxLaps: 1.6,
    wear: 0.3,
  },

  /** Spreads the AI teams' pace (1 = the values in teams.ts). Bigger = the field splits into groups. */
  aiPaceSpread: 0.8,

  /** Multiplies every track's pit stop time loss (1 = spec values). */
  pitLossScale: 1,

  rules: {
    twoCompoundPenalty: 20,
  },
};

export type Tuning = typeof DEFAULT_TUNING;

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Copy of the defaults with the given overrides applied (deep merge, arrays are replaced). */
export function makeTuning(overrides?: DeepPartial<Tuning>): Tuning {
  const out = structuredClone(DEFAULT_TUNING) as unknown as Record<string, unknown>;
  const merge = (dst: Record<string, unknown>, src: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(src)) {
      if (v === undefined) continue;
      if (isPlainObject(v) && isPlainObject(dst[k])) merge(dst[k] as Record<string, unknown>, v);
      else dst[k] = structuredClone(v);
    }
  };
  if (overrides) merge(out, overrides as Record<string, unknown>);
  return out as unknown as Tuning;
}
