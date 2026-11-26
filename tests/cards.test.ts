import { describe, expect, it } from 'vitest';
import { CARDS, carLapTime, combinePerks, drawCards, makeRng, mistakeChance, NO_PERKS, simulate } from '../src/sim';
import { RHEIN, soloRace } from './helpers';

describe('driver cards', () => {
  it('no cards = no change; cards add up with limits', () => {
    expect(combinePerks([])).toEqual(NO_PERKS);
    const p = combinePerks(['sleep', 'pasta']);
    expect(p.pace).toBeCloseTo(-0.15);
    expect(p.mistake).toBeCloseTo(0.9);
    expect(combinePerks(Array(10).fill('sleep')).pace).toBe(-0.3);
    expect(combinePerks(Array(10).fill('jog')).mistake).toBe(0.4);
  });
  it('offers 3 different cards', () => {
    for (let s = 0; s < 50; s++) {
      const c = drawCards(makeRng(s, 1));
      expect(new Set(c.map((x) => x.id)).size).toBe(3);
    }
    expect(CARDS.length).toBeGreaterThanOrEqual(8);
  });
  it('a pace card makes the lap faster, a stamina card fewer mistakes', () => {
    const plain = soloRace();
    const fast = soloRace({}, { perks: combinePerks(['sleep']) });
    const c0 = plain.cars[0], c1 = fast.cars[0];
    expect(carLapTime(c1, RHEIN, 0, fast.tuning)).toBeLessThan(carLapTime(c0, RHEIN, 0, plain.tuning));
    const calm = soloRace({}, { perks: combinePerks(['jog']), mode: undefined } as never);
    calm.cars[0].mode = 2;
    plain.cars[0].mode = 2;
    expect(mistakeChance(calm.cars[0], 0, calm.tuning)).toBeLessThan(mistakeChance(plain.cars[0], 0, plain.tuning));
  });
  it('a race with cards still runs to the end', () => {
    const r = soloRace({}, { perks: combinePerks(['coffee', 'crew', 'yoga', 'rain']) });
    simulate(r);
    expect(r.over).toBe(true);
  });
});
