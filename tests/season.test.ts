import { describe, expect, it } from 'vitest';
import { addResult, driverStandings, newSeason, nextRound, pickTracks, seasonOver, teamStandings } from '../src/game/season';
import { DEFAULT_TEAM, validateTeam } from '../src/game/team';
import { createRace, results, simulate, TRACKS } from '../src/sim';

const humans = [{ id: 'me', name: 'Me', color: '#ff0', drivers: DEFAULT_TEAM.drivers }];

describe('season', () => {
  it('picks different tracks for 3, 5 and 8 races', () => {
    for (const n of [3, 5, 8]) {
      const ids = pickTracks(n, 7);
      expect(ids).toHaveLength(n);
      expect(new Set(ids).size).toBe(n);
      for (const id of ids) expect(TRACKS.some((t) => t.id === id)).toBe(true);
    }
  });
  it('gives 25-18-15… points and keeps drivers and teams championship', () => {
    const s = newSeason(humans, 3, 11);
    expect(s.cars).toHaveLength(12);
    for (let r = 0; r < 3; r++) {
      const track = TRACKS.find((t) => t.id === s.trackIds[s.round])!;
      const race = simulate(createRace({ seed: 100 + r, track, cars: s.cars.map((c) => ({ ...c, autopilot: true })) }));
      const pts = addResult(s, results(race));
      expect(Object.values(pts).sort((a, b) => b - a).slice(0, 10)).toEqual([25, 18, 15, 12, 10, 8, 6, 4, 2, 1]);
      nextRound(s);
    }
    expect(seasonOver(s)).toBe(true);
    const ds = driverStandings(s);
    const total = ds.reduce((x, d) => x + d.points, 0);
    expect(total).toBe(3 * 101);
    const ts = teamStandings(s);
    expect(ts).toHaveLength(6);
    expect(ts.reduce((x, t) => x + t.points, 0)).toBe(total);
    for (let i = 1; i < ds.length; i++) expect(ds[i].points).toBeLessThanOrEqual(ds[i - 1].points);
  });
});

describe('team setup', () => {
  it('needs names and unique numbers from 2 to 99', () => {
    expect(validateTeam(DEFAULT_TEAM)).toEqual([]);
    expect(validateTeam({ ...DEFAULT_TEAM, name: ' ' })).toContain('errTeamName');
    expect(validateTeam({ ...DEFAULT_TEAM, drivers: [{ name: 'A', num: 1 }, { name: 'B', num: 5 }] })).toContain('errNumber');
    expect(validateTeam({ ...DEFAULT_TEAM, drivers: [{ name: 'A', num: 5 }, { name: 'B', num: 5 }] })).toContain('errSameNumber');
    expect(validateTeam({ ...DEFAULT_TEAM, drivers: [{ name: '', num: 5 }, { name: 'B', num: 6 }] })).toContain('errDriverName');
  });
});
