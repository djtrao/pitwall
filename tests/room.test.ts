import { describe, expect, it } from 'vitest';
import type { Team } from '../src/game/team';
import type { ServerMsg } from '../src/net/protocol';
import { randomCode, validCode } from '../src/net/protocol';
import { Room } from '../src/server/room';

const team = (name: string, a: number, b: number): Team => ({ name, color: '#ff0', drivers: [{ name: `${name} A`, num: a }, { name: `${name} B`, num: b }] });

function setup() {
  let now = 1_000_000;
  const inbox = new Map<string, ServerMsg[]>();
  const room = new Room('ABCD', {
    send: (id, msg) => inbox.set(id, [...(inbox.get(id) ?? []), msg]),
    now: () => now,
    random: () => 0.42,
  });
  const last = (id: string, t: ServerMsg['t']) => [...(inbox.get(id) ?? [])].reverse().find((m) => m.t === t) as ServerMsg | undefined;
  return { room, inbox, last, advance: (ms: number) => (now += ms) };
}

describe('room codes', () => {
  it('are 4 letters without look-alikes', () => {
    for (let i = 0; i < 100; i++) expect(validCode(randomCode())).toBe(true);
    expect(validCode('AB1D')).toBe(false);
    expect(validCode('ABOD')).toBe(false);
  });
});

describe('multiplayer room', () => {
  it('lobby rules: create, join, errors', () => {
    const { room } = setup();
    expect(room.hello('x', { t: 'hello', playerId: 'x', team: team('X', 5, 6), create: false })).toBe('noRoom');
    expect(room.hello('a', { t: 'hello', playerId: 'a', team: team('A', 5, 6), create: true })).toBeNull();
    expect(room.hello('b', { t: 'hello', playerId: 'b', team: team('B', 7, 8), create: true })).toBe('roomTaken');
    expect(room.hello('b', { t: 'hello', playerId: 'b', team: team('B', 6, 8), create: false })).toBe('numberTaken');
    expect(room.hello('b', { t: 'hello', playerId: 'b', team: team('B', 7, 8), create: false })).toBeNull();
    expect(room.hello('c', { t: 'hello', playerId: 'c', team: team('C', 9, 10), create: false })).toBeNull();
    expect(room.hello('d', { t: 'hello', playerId: 'd', team: team('D', 11, 12), create: false })).toBeNull();
    expect(room.hello('e', { t: 'hello', playerId: 'e', team: team('E', 13, 14), create: false })).toBe('roomFull');
    expect(room.players[0].host).toBe(true);
  });

  it('plays a whole round: briefing, qualifying for everyone, race, results', () => {
    const { room, last, advance } = setup();
    room.hello('a', { t: 'hello', playerId: 'a', team: team('A', 5, 6), create: true });
    room.hello('b', { t: 'hello', playerId: 'b', team: team('B', 7, 8), create: false });
    room.message('a', { t: 'settings', settings: { races: 3, speed: 2 } });
    room.message('a', { t: 'start' });
    expect(room.phase).toBe('lobby'); // b not ready yet
    room.message('b', { t: 'ready', ready: true });
    room.message('a', { t: 'start' });
    expect(room.phase).toBe('briefing');
    expect(room.season!.cars.filter((c) => c.human)).toHaveLength(4);
    room.message('a', { t: 'briefingReady' });
    expect(room.phase).toBe('briefing');
    room.message('b', { t: 'briefingReady' });
    expect(room.phase).toBe('quali');

    // both play their laps at the same time
    const [ta, tb] = room.players.map((p) => p.teamId);
    for (const [pid, tid] of [['a', ta], ['b', tb]] as const) {
      for (const run of [0]) for (const n of [1, 2]) {
        room.message(pid, { t: 'qualiRun', run: { carId: `${tid}-${n}`, run, tyre: 'S', corners: [], time: 70 + n + run } });
      }
    }
    // cannot submit for someone else's car
    room.message('a', { t: 'qualiRun', run: { carId: `${tb}-1`, run: 0, tyre: 'S', corners: [], time: 1 } });
    // everyone is done: 4 seconds to see the last lap, then the race
    expect(room.phase).toBe('quali');
    advance(4100);
    room.tick();
    expect(room.phase).toBe('race');
    const grid = room.race!.cars;
    expect(grid[0].teamId).toBe(ta); // fastest lap (70) on pole
    expect(room.race!.speed).toBe(2);

    // commands only for your own cars
    room.message('a', { t: 'cmd', cmd: { type: 'mode', car: `${tb}-1`, mode: 3 } });
    expect(room.race!.cars.find((c) => c.id === `${tb}-1`)!.mode).toBe(1);
    room.message('a', { t: 'cmd', cmd: { type: 'mode', car: `${ta}-1`, mode: 2 } });
    expect(room.race!.cars.find((c) => c.id === `${ta}-1`)!.mode).toBe(2);

    // b's phone drops out: autopilot; back again: control returns
    room.disconnect('b');
    expect(room.race!.cars.find((c) => c.id === `${tb}-1`)!.autopilot).toBe(true);
    room.hello('b', { t: 'hello', playerId: 'b', team: team('B', 7, 8), create: false });
    expect(room.race!.cars.find((c) => c.id === `${tb}-1`)!.autopilot).toBe(false);
    expect(last('b', 'state')).toBeTruthy();

    // only the host can pause
    room.message('b', { t: 'speed', speed: 0 });
    expect(room.paused).toBe(false);
    room.message('a', { t: 'speed', speed: 0 });
    expect(room.paused).toBe(true);
    room.message('a', { t: 'speed', speed: 2 });

    let n = 0;
    while (room.phase === 'race' && n < 20000) {
      room.tick(0.1);
      advance(100);
      n++;
    }
    expect(room.phase).toBe('results');
    expect(Object.values(room.season!.driverPts).reduce((x, y) => x + y, 0)).toBe(101);
    const ph = last('a', 'phase') as Extract<ServerMsg, { t: 'phase' }>;
    expect(ph.phase).toBe('results');
    room.message('a', { t: 'next' });
    expect(room.phase).toBe('briefing');
    expect(room.season!.round).toBe(1);
  });

  it('qualifying ends after 4 minutes even if someone does not finish', () => {
    const { room, advance } = setup();
    room.hello('a', { t: 'hello', playerId: 'a', team: team('A', 5, 6), create: true });
    room.message('a', { t: 'start' });
    room.message('a', { t: 'briefingReady' });
    expect(room.phase).toBe('quali');
    advance(241_000);
    room.tick();
    expect(room.phase).toBe('race');
  });
});
