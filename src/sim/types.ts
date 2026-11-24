import type { Rng } from './rng';
import type { Tuning } from './tuning';

export type Tyre = 'S' | 'M' | 'H' | 'W';
export const DRY_TYRES: readonly Tyre[] = ['S', 'M', 'H'];

/** 0 Conserve, 1 Normal, 2 Push, 3 Max Attack */
export type Mode = 0 | 1 | 2 | 3;
export const CONSERVE: Mode = 0;
export const NORMAL: Mode = 1;
export const PUSH: Mode = 2;
export const MAX_ATTACK: Mode = 3;

export interface KeyCorner {
  name: string;
  /** Position on the lap, 0..1 from the start/finish line. */
  at: number;
}

export interface Track {
  id: string;
  name: string;
  desc: string;
  laps: number;
  /** Base lap time in simulated seconds (per-lap effects scale with base / 78). */
  base: number;
  wear: number;
  /** Overtaking factor, 0.2 (very hard) – 0.8 (easy). */
  overtaking: number;
  pitLoss: number;
  rainChance: number;
  safetyCarChance: number;
  corners: [KeyCorner, KeyCorner, KeyCorner];
  /** Three more bends: braking points in qualifying (6 per lap together with the key corners). */
  bends: [KeyCorner, KeyCorner, KeyCorner];
  /** Closed outline, points in 0..1 (used by the UI). */
  shape: [number, number][];
}

export interface Weather {
  /** Rain intensity during qualifying (0 = dry). */
  quali: number;
  /** Rain intensity for each race lap (index 0 = lap 1). 0 = dry, 0.25 – 1 = light – heavy. */
  laps: number[];
  /** Random offsets that make forecasts fuzzy. */
  noise: number[];
}

export interface AiProfile {
  /** Switch to rain tyres above this wetness (%). */
  wetThreshold: number;
  /** Switch back to slicks below this wetness (%). */
  dryThreshold: number;
  /** 0..1 – pits a little earlier, attacks more, uses Max Attack more often. */
  aggression: number;
}

/** What the game needs to know about a car before the race. */
export interface CarSetup {
  id: string;
  name: string;
  num: number;
  teamId: string;
  teamName: string;
  color: string;
  /** Human-controlled team (equal pace, accepts commands). */
  human: boolean;
  /** Team pace offset (s per lap, + is slower). */
  carPace: number;
  /** Driver offset (s per lap). 0 for humans. */
  driverPace: number;
  startTyre: Tyre;
  /** AI drives this car (always true for AI teams; for humans = disconnected / balance bot). */
  autopilot?: boolean;
  /** Human driver: resolve duels automatically. */
  autoDuel?: boolean;
  /** A player plays the pit stop game for this car. */
  pitGame?: boolean;
  ai?: AiProfile;
}

export type CarStatus = 'running' | 'pit' | 'finished' | 'dnf';

export interface Car extends CarSetup {
  autopilot: boolean;
  autoDuel: boolean;
  ai: AiProfile;
  grid: number;
  status: CarStatus;
  /** Distance in laps since the start line (negative on the grid). */
  dist: number;
  /** Completed laps (floor of dist when last crossing the line). */
  lap: number;
  cond: number;
  tyre: Tyre;
  /** Laps driven on the current set. */
  tyreLaps: number;
  usedTyres: Tyre[];
  mode: Mode;
  /** Tyre to fit at the end of this lap, or null. */
  pitPlan: Tyre | null;
  pitTimer: number;
  /** Length of the current pit stop (s), for the pit lane animation. */
  pitTotal: number;
  /** In the pit lane: driving in, standing in the box, driving out. */
  pitPhase: 'in' | 'stop' | 'out' | null;
  /** Lap for which the AI / pit entry decision was already made. */
  decidedLap: number;
  /** Waiting for the pit stop game result. */
  pitAwait: boolean;
  /** Real seconds already waited for it. */
  pitHold: number;
  pitTyre: Tyre | null;
  stops: number;
  /** Seconds still to lose from a mistake / failed attack / crash. */
  loss: number;
  flatSpot: boolean;
  wingDamage: boolean;
  /** Engine damaged: less top speed until repaired in the pits. */
  engineDamage: boolean;
  penalty: number;
  /** Current lap-time noise. */
  noise: number;
  /** Current potential lap time (s). */
  lapTime: number;
  /** Actual speed this tick (laps per sim second). */
  speed: number;
  lapStart: number;
  lastLap: number | null;
  bestLap: number | null;
  finishTime: number;
  /** Time spent close behind `closeTo`. */
  closeTime: number;
  closeTo: string | null;
  /** Last lap number in which this car had a duel. */
  duelLap: number;
  mistakes: number;
  /** Driver's lasting strengths per sector of the lap (+ is slower), see `tuning.flow`. */
  skill: number[];
  /** Time factor per sector for the current lap: good and bad corners. */
  sectors: number[];
  /** Separate random stream for the sector flow (keeps the other random draws unchanged). */
  flowRng: Rng;
  rng: Rng;
}

/** 0 Wait, 1 Careful, 2 Bold, 3 Risky, 4 All or nothing */
export type DuelAttack = 0 | 1 | 2 | 3 | 4;
/** 0 Let go, 1 Clean, 2 Hard, 3 Very hard, 4 Slam the door */
export type DuelDefend = 0 | 1 | 2 | 3 | 4;
export type DuelOutcome = 'pass' | 'fail' | 'crash' | 'spin' | 'off' | 'wait' | 'cancelled';

export interface Duel {
  id: number;
  attacker: string;
  defender: string;
  lap: number;
  /** Leader distance where it started (for choosing the animation scene). */
  at: number;
  /** Real-time deadline (s) for human answers. */
  deadline: number;
  attack: DuelAttack | null;
  defend: DuelDefend | null;
  /** A human had to choose (then the result counts only after the animation). */
  prompted: boolean;
  /** choosing → showing (animation) → done */
  state: 'choosing' | 'showing' | 'done';
  outcome?: DuelOutcome;
  /** Real time when the result is applied. */
  applyAt?: number;
}

export interface SafetyCarState {
  /** Planned deployment at this leader distance (laps), or null. */
  plannedAt: number | null;
  plannedLaps: number;
  active: boolean;
  /** Ends when the leader reaches this distance. */
  endAt: number;
  /** Number of safety car periods so far. */
  count: number;
}

export type EventKind =
  | 'rainStart'
  | 'rainStop'
  | 'safetyCar'
  | 'safetyCarEnd'
  | 'boxNow'
  | 'pitIn'
  | 'pitOut'
  | 'mistakeSmall'
  | 'mistakeBig'
  | 'spin'
  | 'duelStart'
  | 'pass'
  | 'duelFail'
  | 'duelWait'
  | 'duelSpin'
  | 'duelOff'
  | 'crash'
  | 'pitStopTime'
  | 'unsafeRelease'
  | 'contactPenalty'
  | 'wingDamage'
  | 'engineDamage'
  | 'tyresWorn'
  | 'penalty'
  | 'win'
  | 'finish';

/** Something that happened. The UI turns these into radio messages (translated). */
export interface RaceEvent {
  id: number;
  time: number;
  /** Leader lap (1-based) when it happened. */
  lap: number;
  kind: EventKind;
  car?: string;
  other?: string;
  data?: Record<string, number | string>;
}

export interface RaceConfig {
  seed: number;
  track: Track;
  cars: CarSetup[];
  /** Race speed set by the host (1 or 2). */
  speed?: number;
  /** Override the generated weather (for tests and balance runs). */
  weather?: Weather;
  /** Override the safety car: null = none, or deploy on a given lap for a number of laps. */
  safetyCar?: null | { lap: number; laps: number; at?: number };
  tuning?: Tuning;
}

export interface RaceState {
  seed: number;
  track: Track;
  tuning: Tuning;
  speed: number;
  /** Simulated seconds per real second at 1×. */
  timeScale: number;
  time: number;
  realTime: number;
  ticks: number;
  weather: Weather;
  /** Track wetness 0..100. */
  wetness: number;
  rainNow: number;
  safetyCar: SafetyCarState;
  cars: Car[];
  duels: Duel[];
  /** Pair key → leader lap until which the pair may not duel again. */
  duelCooldown: Record<string, number>;
  leaderFinished: boolean;
  over: boolean;
  events: RaceEvent[];
  nextId: number;
  rng: Rng;
}

export type Command =
  | { type: 'mode'; car: string; mode: Mode }
  | { type: 'pit'; car: string; tyre: Tyre | null }
  | { type: 'duel'; duel: number; car: string; choice: DuelAttack | DuelDefend }
  | { type: 'autoDuel'; car: string; on: boolean }
  /** Result of the pit stop game: standing time on the F1 scale (s) and whether the release was unsafe. */
  | { type: 'pitStop'; car: string; seconds: number; unsafe: boolean }
  | { type: 'autopilot'; car: string; on: boolean };
