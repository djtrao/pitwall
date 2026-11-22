/**
 * Every balance number of the race model lives here, so the balance runner can
 * try different values without touching the simulation code.
 * Defaults are the values from SPEC.md (sections 7.1 – 7.6).
 */
export const DEFAULT_TUNING = {
  /** Real seconds per lap at 1× speed (section 7). */
  realLapSeconds: 20,
  /** Random lap-time noise (standard deviation, s), new each lap. */
  noise: 0.3,

  tyres: {
    S: { pace: 0, wear: 9 },
    M: { pace: 0.6, wear: 6 },
    H: { pace: 1.2, wear: 4 },
    /** Rain tyre: wear on a wet track / when wetness is under `dryBelow`. */
    W: { pace: 0, wear: 3, wearDry: 14, dryBelow: 25 },
  },
  /** Slicks wear less on a wet track (prototype model). */
  slickWetWear: { above: 40, factor: 0.6 },
  /** Wear penalty = (1 − condition) × slope, plus a cliff below `cliffAt`. */
  wearSlope: 2.0,
  cliffAt: 0.25,
  cliffSlope: 16,

  fuel: {
    /** Seconds per lap for each lap of fuel on board. */
    weight: 0.12,
    /** Fuel use factor under the safety car. */
    safetyCar: 0.5,
    /** Allowed start fuel as a share of race distance. */
    min: 0.9,
    max: 1.05,
  },

  /** Driving modes: 0 Conserve, 1 Normal, 2 Push, 3 Max Attack. */
  modes: [
    { pace: 0.5, wear: 0.6, fuel: 0.75, mistake: 0, bigShare: 0 },
    { pace: 0, wear: 1.0, fuel: 1.0, mistake: 0.005, bigShare: 0 },
    { pace: -0.6, wear: 1.5, fuel: 1.15, mistake: 0.03, bigShare: 0.1 },
    { pace: -1.2, wear: 3.0, fuel: 1.3, mistake: 0.08, bigShare: 0.25 },
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
    allPerWet: 0.04,
    slickFrom: 15,
    slickPer: 0.12,
    rainFrom: 35,
    rainPer: 0.11,
    rainBase: 0.8,
    /** Wetness change in % per lap of simulated time. */
    rise: 40,
    dry: 10,
    dryWhileRaining: 20,
    /** Chance per lap that a shower stops. */
    stopChance: 0.18,
  },

  duel: {
    /** Gap (s) that counts as "close" for starting a duel. */
    closeGap: 0.8,
    /** A faster car can close up to this gap (s), then must win a duel. */
    minGap: 0.4,
    /** Share of a lap the attacker must stay close before a duel starts. */
    closeLaps: 0.5,
    /** Real seconds a human has to answer a duel prompt. */
    answerSeconds: 6,
    /** Base pass chance [attacker][defender]: rows Inside/Outside, columns CoverIn/CoverOut. */
    pass: { inside: [0.2, 0.7], outside: [0.6, 0.25] },
    crash: { inside: [0, 0], outside: [0.1, 0.15] },
    /** Extra pass chance per 0.3 s of pace advantage. */
    paceBonusPer03: 0.1,
    maxPass: 0.95,
    failLoss: 0.3,
    failWear: 0.02,
    crashLoss: 3,
    wingChance: 0.3,
    wingPace: 0.8,
    wingPitExtra: 5,
    safetyCarOnCrash: 0.25,
    /** How much ahead of the defender the attacker is placed after a pass (s). */
    passMargin: 0.2,
  },

  safetyCar: {
    /** Lap time under the safety car = base × slow. */
    slow: 1.4,
    minLaps: 2,
    maxLaps: 4,
    wear: 0.3,
    pitFactor: 0.5,
  },

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
