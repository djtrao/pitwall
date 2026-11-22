/**
 * Messages between the phones and the game server (one room per game).
 * The server is the only source of truth; phones send commands and qualifying results.
 */
import type { Season } from '../game/season';
import type { Team } from '../game/team';
import type { Command, QualiRun, RaceEvent, RaceState } from '../sim';

export type Phase = 'lobby' | 'briefing' | 'quali' | 'race' | 'results' | 'seasonEnd';

export interface Settings {
  races: 3 | 5 | 8;
  /** Race speed set by the host. */
  speed: 1 | 2;
}

export interface PlayerInfo {
  id: string;
  team: Team;
  ready: boolean;
  connected: boolean;
  host: boolean;
  /** Team id in the season (cars are `${teamId}-1` / `-2`). */
  teamId: string;
}

export type ClientMsg =
  | { t: 'hello'; playerId: string; team: Team; create: boolean }
  | { t: 'team'; team: Team }
  | { t: 'ready'; ready: boolean }
  | { t: 'settings'; settings: Settings }
  | { t: 'start' }
  | { t: 'briefingReady' }
  | { t: 'qualiRun'; run: QualiRun }
  | { t: 'cmd'; cmd: Command }
  /** Host only: 0 = pause, 1 or 2 = speed. */
  | { t: 'speed'; speed: 0 | 1 | 2 }
  /** Host only: continue after the results. */
  | { t: 'next' }
  | { t: 'leave' };

export type ErrorCode = 'roomFull' | 'roomTaken' | 'noRoom' | 'numberTaken' | 'started' | 'badTeam';

/** Race state without the event list (events are sent as a delta). */
export type RaceSnapshot = Omit<RaceState, 'events'>;

export interface PhaseInfo {
  phase: Phase;
  season: Season | null;
  /** Seed of this round (weather etc. are generated from it on every phone). */
  seed: number;
  /** Players who are ready for the next step (briefing). */
  readyIds: string[];
  /** Qualifying: real seconds left. */
  qualiLeft?: number;
  /** Results: points of the last race per car id. */
  points?: Record<string, number>;
  /** Host paused the race. */
  paused?: boolean;
}

export type ServerMsg =
  | { t: 'welcome'; playerId: string; code: string }
  | { t: 'error'; code: ErrorCode }
  | { t: 'lobby'; players: PlayerInfo[]; settings: Settings }
  | ({ t: 'phase' } & PhaseInfo)
  | { t: 'quali'; runs: QualiRun[]; left: number; done: string[] }
  | { t: 'state'; race: RaceSnapshot; events: RaceEvent[]; paused: boolean }
  | { t: 'pong' };

/** Room codes: 4 letters, no look-alikes (no I, O, 0, 1). */
export const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export function randomCode(rand: () => number = Math.random): string {
  let c = '';
  for (let i = 0; i < 4; i++) c += CODE_LETTERS[Math.floor(rand() * CODE_LETTERS.length)];
  return c;
}
export const validCode = (c: string) => /^[A-HJ-NP-Z]{4}$/.test(c);

export const MAX_PLAYERS = 4;
export const QUALI_SECONDS = 240;
