/**
 * One multiplayer game room. Transport-free: the Cloudflare Durable Object and the Node server
 * both feed it messages and call `tick()` 10 times per second. It runs the whole season:
 * lobby → briefing → qualifying (everyone at the same time, 4 minutes) → race → results.
 */
import { addResult, currentTrack, newSeason, nextRound, seasonOver, type Season } from '../game/season';
import { validateTeam, type Team } from '../game/team';
import {
  aiSession,
  applyCommand,
  createRace,
  generateWeather,
  gridFromQualifying,
  makeRng,
  makeTuning,
  QUALI,
  results,
  step,
  type Command,
  type QualiRun,
  type RaceState,
} from '../sim';
import { MAX_PLAYERS, QUALI_SECONDS, type ClientMsg, type ErrorCode, type Phase, type PlayerInfo, type ServerMsg, type Settings } from '../net/protocol';

export interface RoomIO {
  /** Send to one player (only called for connected players). */
  send(playerId: string, msg: ServerMsg): void;
  /** Milliseconds (Date.now on the server). */
  now(): number;
  random(): number;
}

interface Player extends PlayerInfo {
  joinedAt: number;
}

const TICK = 0.1;
const tuning = makeTuning();

export class Room {
  players: Player[] = [];
  settings: Settings = { races: 3, speed: 1 };
  phase: Phase = 'lobby';
  season: Season | null = null;
  race: RaceState | null = null;
  paused = false;
  private seed = 0;
  private briefingReady = new Set<string>();
  private aiRuns: QualiRun[] = [];
  private humanRuns: QualiRun[] = [];
  private qualiEnd = 0;
  private qualiStart = 0;
  private eventCursor = 0;
  private ticks = 0;
  private points: Record<string, number> = {};
  private nextTeamNo = 1;
  lastActivity = 0;

  constructor(
    public code: string,
    private io: RoomIO,
  ) {
    this.lastActivity = io.now();
  }

  get connectedCount(): number {
    return this.players.filter((p) => p.connected).length;
  }

  /* ------------------------------------------------------------ joining */

  /** A phone connects (or reconnects). Returns an error code or null. */
  hello(playerId: string, msg: Extract<ClientMsg, { t: 'hello' }>): ErrorCode | null {
    this.lastActivity = this.io.now();
    const known = this.players.find((p) => p.id === playerId);
    if (known) {
      // reconnect: control comes back
      known.connected = true;
      if (this.race) for (const c of this.race.cars) if (c.teamId === known.teamId) applyCommand(this.race, { type: 'autopilot', car: c.id, on: false });
      this.ensureHost();
      this.sendWelcome(known.id);
      return null;
    }
    if (msg.create && this.players.length > 0) return 'roomTaken';
    if (!msg.create && this.players.length === 0) return 'noRoom';
    if (this.phase !== 'lobby') return 'started';
    if (this.players.length >= MAX_PLAYERS) return 'roomFull';
    if (validateTeam(msg.team).length) return 'badTeam';
    if (this.numberClash(msg.team, playerId)) return 'numberTaken';
    const p: Player = {
      id: playerId,
      team: msg.team,
      ready: false,
      connected: true,
      host: this.players.length === 0,
      teamId: `h${this.nextTeamNo++}`,
      joinedAt: this.io.now(),
    };
    this.players.push(p);
    this.sendWelcome(p.id);
    this.broadcastLobby();
    return null;
  }

  disconnect(playerId: string): void {
    const p = this.players.find((x) => x.id === playerId);
    if (!p) return;
    p.connected = false;
    if (this.phase === 'lobby') {
      this.players = this.players.filter((x) => x !== p);
    } else if (this.race) {
      // the cars keep driving in Normal mode with AI pit logic
      for (const c of this.race.cars) if (c.teamId === p.teamId) applyCommand(this.race, { type: 'autopilot', car: c.id, on: true });
    }
    this.ensureHost();
    this.broadcastLobby();
    if (this.phase === 'briefing') this.checkBriefingDone();
    if (this.phase === 'quali') this.checkQualiDone();
  }

  private ensureHost(): void {
    const host = this.players.find((p) => p.host);
    if (host?.connected) return;
    const next = this.players.find((p) => p.connected);
    if (!next) return;
    for (const p of this.players) p.host = p === next;
  }

  private numberClash(team: Team, playerId: string): boolean {
    const nums = this.players.filter((p) => p.id !== playerId).flatMap((p) => p.team.drivers.map((d) => d.num));
    return team.drivers.some((d) => nums.includes(d.num));
  }

  /* ------------------------------------------------------------ messages */

  message(playerId: string, msg: ClientMsg): void {
    const p = this.players.find((x) => x.id === playerId);
    if (!p) return;
    this.lastActivity = this.io.now();
    switch (msg.t) {
      case 'team':
        if (this.phase !== 'lobby' || validateTeam(msg.team).length) return;
        if (this.numberClash(msg.team, playerId)) return this.io.send(playerId, { t: 'error', code: 'numberTaken' });
        p.team = msg.team;
        this.broadcastLobby();
        return;
      case 'ready':
        if (this.phase !== 'lobby') return;
        p.ready = msg.ready;
        this.broadcastLobby();
        return;
      case 'settings':
        if (!p.host || this.phase !== 'lobby') return;
        if ([3, 5, 8].includes(msg.settings.races)) this.settings.races = msg.settings.races;
        if ([1, 2].includes(msg.settings.speed)) this.settings.speed = msg.settings.speed;
        this.broadcastLobby();
        return;
      case 'start':
        if (!p.host || this.phase !== 'lobby') return;
        if (!this.players.filter((x) => x.connected).every((x) => x.ready || x.host)) return;
        this.startSeason();
        return;
      case 'briefingReady':
        if (this.phase !== 'briefing') return;
        this.briefingReady.add(playerId);
        this.broadcastPhase();
        this.checkBriefingDone();
        return;
      case 'qualiRun':
        this.qualiRun(p, msg.run);
        return;
      case 'cmd':
        this.command(p, msg.cmd);
        return;
      case 'speed':
        if (!p.host || !this.race) return;
        this.paused = msg.speed === 0;
        if (msg.speed === 1 || msg.speed === 2) this.race.speed = msg.speed;
        this.sendState();
        return;
      case 'next':
        if (!p.host || this.phase !== 'results' || !this.season) return;
        if (seasonOver(this.season)) {
          this.phase = 'seasonEnd';
          this.broadcastPhase();
        } else {
          nextRound(this.season);
          this.startBriefing();
        }
        return;
      case 'leave':
        this.disconnect(playerId);
        return;
    }
  }

  /* ------------------------------------------------------------ season flow */

  private startSeason(): void {
    const humans = this.players.map((p) => ({ id: p.teamId, name: p.team.name, color: p.team.color, drivers: p.team.drivers }));
    this.season = newSeason(humans, this.settings.races, Math.floor(this.io.random() * 1e9));
    this.startBriefing();
  }

  private startBriefing(): void {
    const s = this.season!;
    this.seed = s.seed + s.round * 101;
    this.phase = 'briefing';
    this.race = null;
    this.briefingReady.clear();
    this.broadcastPhase();
  }

  private checkBriefingDone(): void {
    const waiting = this.players.filter((p) => p.connected && !this.briefingReady.has(p.id));
    if (waiting.length === 0) this.startQuali();
  }

  private weather() {
    return generateWeather(currentTrack(this.season!), makeRng(this.seed, 1), tuning);
  }

  private startQuali(): void {
    const s = this.season!;
    this.phase = 'quali';
    this.aiRuns = aiSession(s.cars, currentTrack(s), this.weather(), tuning, this.seed);
    this.humanRuns = [];
    this.qualiStart = this.io.now();
    this.qualiEnd = this.qualiStart + QUALI_SECONDS * 1000;
    this.broadcastPhase();
    this.broadcastQuali();
  }

  private qualiRun(p: Player, run: QualiRun): void {
    if (this.phase !== 'quali' || !run || typeof run.carId !== 'string') return;
    if (!run.carId.startsWith(`${p.teamId}-`) || !(Number.isInteger(run.run) && run.run >= 0 && run.run < QUALI.runs)) return;
    if (this.humanRuns.some((r) => r.carId === run.carId && r.run === run.run)) return;
    const track = currentTrack(this.season!);
    // plausibility: no lap can be faster than a perfect one
    const fastest = track.base - 4;
    const time = run.time === null ? null : Math.max(fastest, Number(run.time) || track.base + 10);
    this.humanRuns.push({ carId: run.carId, run: run.run, tyre: run.tyre, corners: Array.isArray(run.corners) ? run.corners.slice(0, 8) : [], time });
    this.broadcastQuali();
    this.checkQualiDone();
  }

  /** Human cars that still have runs to do. */
  private qualiOpenCars(): string[] {
    const open: string[] = [];
    for (const p of this.players) {
      if (!p.connected) continue;
      for (const n of [1, 2]) {
        const id = `${p.teamId}-${n}`;
        if (this.humanRuns.filter((r) => r.carId === id).length < QUALI.runs) open.push(id);
      }
    }
    return open;
  }

  private checkQualiDone(): void {
    if (this.phase !== 'quali') return;
    // everyone done: a few seconds to look at the last lap, then the race
    if (this.qualiOpenCars().length === 0) this.qualiEnd = Math.min(this.qualiEnd, this.io.now() + 4000);
    if (this.io.now() >= this.qualiEnd) this.startRace();
  }

  private visibleQualiRuns(): QualiRun[] {
    // AI laps appear as the session goes on
    const share = (this.io.now() - this.qualiStart) / (this.qualiEnd - this.qualiStart);
    const humansStarted = this.players.filter((p) => p.connected).every((p) => this.humanRuns.some((r) => r.carId.startsWith(`${p.teamId}-`)));
    return [...this.aiRuns.filter(() => share > 0.3 || humansStarted), ...this.humanRuns];
  }

  private startRace(): void {
    const s = this.season!;
    const all = [...this.aiRuns, ...this.humanRuns];
    const connected = new Set(this.players.filter((p) => p.connected).map((p) => p.teamId));
    const grid = gridFromQualifying(s.cars, all).map((c) =>
      c.human ? { ...c, autoDuel: true, pitGame: true, autopilot: !connected.has(c.teamId) } : c,
    );
    this.race = createRace({ seed: this.seed, track: currentTrack(s), cars: grid, weather: this.weather(), tuning, speed: this.settings.speed });
    this.paused = false;
    this.eventCursor = 0;
    this.phase = 'race';
    this.broadcastPhase();
    this.sendState();
  }

  private finishRace(): void {
    const s = this.season!;
    this.sendState();
    this.points = addResult(s, results(this.race!));
    this.phase = 'results';
    this.broadcastPhase();
  }

  private command(p: Player, cmd: Command): void {
    if (!this.race || !cmd || typeof cmd.car !== 'string' || !cmd.car.startsWith(`${p.teamId}-`)) return;
    if (cmd.type === 'autopilot') return; // only the server switches the autopilot
    applyCommand(this.race, cmd);
  }

  /* ------------------------------------------------------------ clock */

  tick(dt = TICK): void {
    this.ticks++;
    if (this.phase === 'race' && this.race) {
      if (!this.paused) step(this.race, dt);
      if (this.ticks % 2 === 0) this.sendState();
      if (this.race.over) this.finishRace();
    } else if (this.phase === 'quali') {
      if (this.ticks % 10 === 0) this.broadcastQuali();
      this.checkQualiDone();
    }
  }

  /* ------------------------------------------------------------ sending */

  private toAll(msg: ServerMsg): void {
    for (const p of this.players) if (p.connected) this.io.send(p.id, msg);
  }

  private lobbyMsg(): ServerMsg {
    return { t: 'lobby', players: this.players.map(({ joinedAt: _j, ...info }) => info), settings: this.settings };
  }

  private broadcastLobby(): void {
    this.toAll(this.lobbyMsg());
  }

  private phaseMsg(): ServerMsg {
    return {
      t: 'phase',
      phase: this.phase,
      season: this.season,
      seed: this.seed,
      readyIds: [...this.briefingReady],
      qualiLeft: this.phase === 'quali' ? Math.max(0, (this.qualiEnd - this.io.now()) / 1000) : undefined,
      points: this.phase === 'results' || this.phase === 'seasonEnd' ? this.points : undefined,
      paused: this.paused,
    };
  }

  private broadcastPhase(): void {
    this.toAll(this.phaseMsg());
  }

  private qualiMsg(): ServerMsg {
    return {
      t: 'quali',
      runs: this.visibleQualiRuns(),
      left: Math.max(0, (this.qualiEnd - this.io.now()) / 1000),
      done: this.players.filter((p) => this.qualiOpenCars().every((id) => !id.startsWith(`${p.teamId}-`))).map((p) => p.id),
    };
  }

  private broadcastQuali(): void {
    this.toAll(this.qualiMsg());
  }

  private sendState(): void {
    if (!this.race) return;
    const { events, ...snap } = this.race;
    const fresh = events.slice(this.eventCursor);
    this.eventCursor = events.length;
    this.toAll({ t: 'state', race: snap, events: fresh, paused: this.paused });
  }

  /** Everything a (re)joining phone needs. */
  private sendWelcome(playerId: string): void {
    this.io.send(playerId, { t: 'welcome', playerId, code: this.code });
    this.io.send(playerId, this.lobbyMsg());
    if (this.phase !== 'lobby') this.io.send(playerId, this.phaseMsg());
    if (this.phase === 'quali') this.io.send(playerId, this.qualiMsg());
    if (this.race && (this.phase === 'race' || this.phase === 'results')) {
      const { events, ...snap } = this.race;
      // full event history so the phone can rebuild its radio
      this.io.send(playerId, { t: 'state', race: snap, events, paused: this.paused });
    }
  }
}
