/**
 * A season: 3, 5 or 8 rounds. Keeps the field (same AI drivers all season), the tracks,
 * and the drivers' and teams' championship points. Pure data, also used by the server.
 */
import { buildField, dryWeather, makeRng, makeTuning, POINTS, rand, TRACKS, type CarSetup, type HumanTeam, type ResultRow } from '../sim';

export interface RoundResult {
  trackId: string;
  /** Car ids in finishing order. */
  order: string[];
  points: Record<string, number>;
}

export interface Season {
  seed: number;
  trackIds: string[];
  round: number;
  cars: CarSetup[];
  driverPts: Record<string, number>;
  teamPts: Record<string, number>;
  results: RoundResult[];
  /** Driver cards collected this season, per car id (only with the cards option). */
  cards?: Record<string, string[]>;
}

/** Pick `count` different tracks in a random order. */
export function pickTracks(count: number, seed: number): string[] {
  const rng = makeRng(seed, 21);
  const ids = TRACKS.map((t) => t.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand(rng) * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, Math.min(count, ids.length));
}

export function newSeason(humans: HumanTeam[], races: number, seed: number, trackIds?: string[]): Season {
  const tracks = trackIds ?? pickTracks(races, seed);
  const first = TRACKS.find((t) => t.id === tracks[0])!;
  const cars = buildField({ humans, seed, track: first, tuning: makeTuning() }, dryWeather(first.laps)).map((c) =>
    c.human ? { ...c, autoDuel: true, pitGame: true } : c,
  );
  return {
    seed,
    trackIds: tracks,
    round: 0,
    cars,
    driverPts: Object.fromEntries(cars.map((c) => [c.id, 0])),
    teamPts: Object.fromEntries([...new Set(cars.map((c) => c.teamId))].map((id) => [id, 0])),
    results: [],
  };
}

export const currentTrack = (s: Season) => TRACKS.find((t) => t.id === s.trackIds[s.round])!;
export const isLastRound = (s: Season) => s.round >= s.trackIds.length - 1;
export const seasonOver = (s: Season) => s.results.length >= s.trackIds.length;

/** Add a race result: points 25-18-15-12-10-8-6-4-2-1. Returns the points per car. */
export function addResult(s: Season, rows: ResultRow[]): Record<string, number> {
  const points: Record<string, number> = {};
  rows.forEach((r, i) => {
    const p = r.car.status === 'finished' ? POINTS[i] ?? 0 : 0;
    points[r.car.id] = p;
    s.driverPts[r.car.id] = (s.driverPts[r.car.id] ?? 0) + p;
    s.teamPts[r.car.teamId] = (s.teamPts[r.car.teamId] ?? 0) + p;
  });
  s.results.push({ trackId: s.trackIds[s.round], order: rows.map((r) => r.car.id), points });
  return points;
}

export function nextRound(s: Season): void {
  if (!isLastRound(s)) s.round++;
}

/** Drivers' standings: points, then most wins, then best finishes. */
export function driverStandings(s: Season): { car: CarSetup; points: number; wins: number }[] {
  const wins = (id: string) => s.results.filter((r) => r.order[0] === id).length;
  return s.cars
    .map((car) => ({ car, points: s.driverPts[car.id] ?? 0, wins: wins(car.id) }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins);
}

export function teamStandings(s: Season): { teamId: string; name: string; color: string; human: boolean; points: number }[] {
  const teams = new Map<string, { teamId: string; name: string; color: string; human: boolean; points: number }>();
  for (const c of s.cars) if (!teams.has(c.teamId)) teams.set(c.teamId, { teamId: c.teamId, name: c.teamName, color: c.color, human: c.human, points: s.teamPts[c.teamId] ?? 0 });
  return [...teams.values()].sort((a, b) => b.points - a.points);
}
