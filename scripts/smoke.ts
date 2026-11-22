// Quick look at one AI-only race: npx tsx scripts/smoke.ts <seed> <trackIndex>
import { TRACKS, makeTuning, buildField, generateWeather, makeRng, quickQualifying, createRace, simulate, results } from '../src/sim';
import type { HumanTeam } from '../src/sim';

const seed = Number(process.argv[2] ?? 1);
const track = TRACKS[Number(process.argv[3] ?? 0)];
const tuning = makeTuning();
const wx = generateWeather(track, makeRng(seed, 1), tuning);
const humans: HumanTeam[] = [{ id: 'me', name: 'Me', color: '#ff0', drivers: [{ name: 'A One', num: 7 }, { name: 'B Two', num: 27 }] }];
const field = buildField({ humans, seed, track, tuning }, wx).map((c) => ({ ...c, autopilot: true }));
const grid = quickQualifying(field, track, wx, tuning, seed);
const race = createRace({ seed, track, cars: grid, weather: wx, tuning });
simulate(race);
console.log(track.name, 'rain', wx.laps.map((x) => (x ? Math.round(x * 9) : '.')).join(''), 'real min', (race.realTime / 60).toFixed(2), 'SC', race.safetyCar.count);
for (const r of results(race)) {
  const c = r.car;
  console.log(
    String(r.pos).padStart(2), `P${c.grid}`.padEnd(4), c.name.padEnd(15), c.carPace.toFixed(2).padStart(5), (r.time?.toFixed(1) ?? 'DNF').padStart(7),
    (r.gap?.toFixed(1) ?? '').padStart(6), c.usedTyres.join('').padEnd(4), 'stops', c.stops, 'mist', c.mistakes, 'pen', c.penalty,
  );
}
const counts: Record<string, number> = {};
for (const e of race.events) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
console.log(counts);
