import { describe, expect, it } from 'vitest';
import type { Team } from '../src/game/team';
import { Room } from '../src/server/room';
import { cardOffer, makeTuning, mpCardSlot, step, wornOffRate } from '../src/sim';
import { soloRace } from './helpers';

describe('start lights', () => {
  it('the cars wait on the grid until the lights go green', () => {
    const race = soloRace({ startLights: true });
    const start = race.cars[0].dist;
    const green = race.start!.green;
    expect(green).toBeGreaterThan(race.tuning.start.red3);
    for (let i = 0; i < Math.floor(green / 0.1) - 1; i++) step(race, 0.1);
    expect(race.cars[0].dist).toBe(start);
    expect(race.time).toBe(0);
    for (let i = 0; i < 30; i++) step(race, 0.1);
    expect(race.events.some((e) => e.kind === 'lightsOut')).toBe(true);
    expect(race.cars[0].dist).toBeGreaterThan(start);
  });

  it('without the option the race starts at once', () => {
    const race = soloRace();
    step(race, 0.1);
    expect(race.time).toBeGreaterThan(0);
  });
});

describe('Max Attack can end in the barrier', () => {
  it('a car flying off on its own breaks its wing or is out', () => {
    const tuning = makeTuning({ noise: 0 });
    tuning.modes[3].mistake = 50;
    tuning.modes[3].offShare = 1;
    const race = soloRace({ tuning });
    race.cars[0].mode = 3;
    for (let i = 0; i < 3000 && race.cars[0].status !== 'dnf'; i++) step(race, 0.1);
    expect(race.cars[0].status).toBe('dnf');
    expect(race.events.some((e) => e.kind === 'out')).toBe(true);
    expect(race.over).toBe(true);
  });

  it('Normal mode never flies off on its own', () => {
    expect(makeTuning().modes[1].offShare).toBe(0);
  });
});

describe('driver cards in multiplayer', () => {
  const team = (name: string, a: number, b: number): Team => ({ name, color: '#ff0', drivers: [{ name: `${name} A`, num: a }, { name: `${name} B`, num: b }] });

  it('only offered cards for your own cars count, and AI drivers get one too', () => {
    const room = new Room('ABCD', { send: () => {}, now: () => 1e6, random: () => 0.42 });
    room.hello('a', { t: 'hello', playerId: 'a', team: team('A', 5, 6), create: true });
    room.hello('b', { t: 'hello', playerId: 'b', team: team('B', 7, 8), create: false });
    room.message('b', { t: 'ready', ready: true });
    room.message('a', { t: 'start' });
    expect(room.settings.cards).toBe(true);
    const [ta, tb] = room.players.map((p) => p.teamId);
    const seed = room.season!.seed + room.season!.round * 101;
    const good = cardOffer(seed, mpCardSlot(`${ta}-1`))[0].id;
    const notOffered = ['jog', 'sleep', 'gym', 'yoga', 'rain', 'sim', 'wall', 'crew', 'pasta', 'coffee'].find(
      (id) => !cardOffer(seed, mpCardSlot(`${ta}-2`)).some((c) => c.id === id),
    )!;
    room.message('a', { t: 'briefingReady', picks: { [`${ta}-1`]: good, [`${ta}-2`]: notOffered, [`${tb}-1`]: good } });
    room.message('b', { t: 'briefingReady' });
    expect(room.phase).toBe('quali');
    const cards = room.season!.cards!;
    expect(cards[`${ta}-1`]).toEqual([good]);
    expect(cards[`${ta}-2`]).toBeUndefined();
    expect(cards[`${tb}-1`]).toBeUndefined();
    const ai = room.season!.cars.filter((c) => !c.human);
    expect(ai.every((c) => cards[c.id]?.length === 1)).toBe(true);
  });

  it('different players are offered different cards', () => {
    expect(mpCardSlot('h1-1')).not.toBe(mpCardSlot('h2-1'));
    expect(mpCardSlot('h2-2')).toBe(21);
  });
});

describe('Max Attack on worn tyres', () => {
  const tuning = makeTuning();

  it('gets more dangerous the more the tyres are worn', () => {
    expect(wornOffRate(0.8, tuning)).toBe(0);
    expect(wornOffRate(0.5, tuning)).toBe(0);
    const r40 = wornOffRate(0.4, tuning);
    const r15 = wornOffRate(0.15, tuning);
    const r3 = wornOffRate(0.03, tuning);
    expect(r40).toBeGreaterThan(0);
    expect(r15).toBeGreaterThan(r40 * 5);
    expect(r3).toBeGreaterThan(r15 * 3);
  });

  it('on fully worn tyres the car flies off at once', () => {
    const t = makeTuning({ noise: 0 });
    t.modes[3].mistake = 0;
    const race = soloRace({ tuning: t });
    for (let i = 0; i < 20; i++) step(race, 0.1); // get going
    const c = race.cars[0];
    c.mode = 3;
    c.cond = 0;
    c.wingDamage = true; // already broken: flying off means out
    step(race, 0.1);
    expect(c.status).toBe('dnf');
  });

  it('on fresh tyres there is no extra risk, and the radio warns when it gets dangerous', () => {
    const t = makeTuning({ noise: 0 });
    t.modes[3].mistake = 0;
    const race = soloRace({ tuning: t });
    const c = race.cars[0];
    c.mode = 3;
    for (let i = 0; i < 600; i++) step(race, 0.1);
    expect(c.status).toBe('running');
    c.cond = 0.45;
    step(race, 0.1);
    expect(race.events.some((e) => e.kind === 'maxAttackRisk' && e.data?.level === 1)).toBe(true);
  });
});
