import type { Track } from './types';
import type { Tuning } from './tuning';

/**
 * The 8 fictional tracks (SPEC section 4). The first three come from the prototype.
 * Key corner positions were measured from the drawn shape (the three sharpest bends);
 * `bends` are three more bends that only count as braking points in qualifying.
 * Tracks are long and winding: a lap takes about 32–36 s at 1×, races have 11–12 laps.
 */
export const TRACKS: Track[] = [
  {
    id: 'rheinring',
    name: 'Rheinring',
    desc: 'A classic all-rounder along the river. Rain is never far away.',
    laps: 11,
    base: 117,
    wear: 1.0,
    overtaking: 0.55,
    pitLoss: 21,
    rainChance: 0.6,
    safetyCarChance: 0.35,
    corners: [
      { name: 'Hafenkurve', at: 0.26 },
      { name: 'Loreley', at: 0.59 },
      { name: 'Brückenschikane', at: 0.79 },
    ],
    bends: [
      { name: 'Schleusenknick', at: 0.17 },
      { name: 'Weinberg', at: 0.36 },
      { name: 'Fährkurve', at: 0.87 },
    ],
    shape: [[0.42, 0.9], [0.72, 0.9], [0.88, 0.84], [0.94, 0.7], [0.86, 0.58], [0.7, 0.6], [0.62, 0.5], [0.72, 0.4], [0.9, 0.38], [0.95, 0.22], [0.84, 0.1], [0.66, 0.12], [0.58, 0.26], [0.46, 0.32], [0.36, 0.22], [0.4, 0.1], [0.26, 0.06], [0.1, 0.12], [0.06, 0.3], [0.18, 0.42], [0.3, 0.48], [0.22, 0.6], [0.08, 0.62], [0.06, 0.78], [0.18, 0.9]],
  },
  {
    id: 'montesol',
    name: 'Monte Sol',
    desc: 'Tight street circuit by the sea. Overtaking is really hard – qualifying matters!',
    laps: 12,
    base: 115,
    wear: 0.8,
    overtaking: 0.22,
    pitLoss: 19,
    rainChance: 0.3,
    safetyCarChance: 0.6,
    corners: [
      { name: 'Casino', at: 0.35 },
      { name: 'Hafentunnel', at: 0.72 },
      { name: 'Haarnadel', at: 0.93 },
    ],
    bends: [
      { name: 'Hafenmole', at: 0.2 },
      { name: 'Tunnelausgang', at: 0.47 },
      { name: 'Leuchtturm', at: 0.8 },
    ],
    shape: [[0.46, 0.9], [0.74, 0.9], [0.9, 0.86], [0.92, 0.72], [0.8, 0.66], [0.8, 0.54], [0.94, 0.48], [0.94, 0.3], [0.82, 0.24], [0.84, 0.1], [0.66, 0.08], [0.6, 0.2], [0.66, 0.34], [0.56, 0.44], [0.44, 0.38], [0.46, 0.22], [0.36, 0.1], [0.2, 0.08], [0.12, 0.2], [0.24, 0.3], [0.16, 0.42], [0.06, 0.5], [0.1, 0.66], [0.26, 0.66], [0.3, 0.78], [0.2, 0.9]],
  },
  {
    id: 'waldkurs',
    name: 'Waldkurs',
    desc: 'Fast and flowing through the forest. Eats tyres – and it rains a lot.',
    laps: 12,
    base: 112,
    wear: 1.3,
    overtaking: 0.8,
    pitLoss: 23,
    rainChance: 0.75,
    safetyCarChance: 0.3,
    corners: [
      { name: 'Hirschsprung', at: 0.59 },
      { name: 'Tannenbogen', at: 0.77 },
      { name: 'Fuchsloch', at: 0.94 },
    ],
    bends: [
      { name: 'Eichenbogen', at: 0.21 },
      { name: 'Fuchsbau', at: 0.29 },
      { name: 'Lichtung', at: 0.46 },
    ],
    shape: [[0.44, 0.9], [0.76, 0.9], [0.92, 0.8], [0.94, 0.62], [0.84, 0.52], [0.9, 0.38], [0.96, 0.2], [0.84, 0.08], [0.66, 0.1], [0.58, 0.24], [0.66, 0.36], [0.56, 0.48], [0.42, 0.42], [0.4, 0.26], [0.48, 0.14], [0.34, 0.06], [0.16, 0.1], [0.06, 0.26], [0.16, 0.4], [0.08, 0.54], [0.14, 0.7], [0.3, 0.72], [0.24, 0.84], [0.22, 0.9]],
  },
  {
    id: 'duenenring',
    name: 'Dünenring',
    desc: 'Hot desert track with long straights. Sand eats the tyres, overtaking is easy, rain almost never.',
    laps: 11,
    base: 122,
    wear: 1.2,
    overtaking: 0.7,
    pitLoss: 22,
    rainChance: 0.2,
    safetyCarChance: 0.25,
    corners: [
      { name: 'Kamelbuckel', at: 0.29 },
      { name: 'Oasenbogen', at: 0.46 },
      { name: 'Sandsturm', at: 0.79 },
    ],
    bends: [
      { name: 'Sandfalle', at: 0.17 },
      { name: 'Oase', at: 0.7 },
      { name: 'Kamelbuckel', at: 0.89 },
    ],
    shape: [[0.4, 0.9], [0.76, 0.9], [0.92, 0.82], [0.94, 0.62], [0.8, 0.56], [0.62, 0.6], [0.5, 0.52], [0.6, 0.42], [0.86, 0.42], [0.95, 0.3], [0.9, 0.12], [0.7, 0.08], [0.4, 0.08], [0.18, 0.1], [0.06, 0.2], [0.12, 0.34], [0.32, 0.34], [0.36, 0.46], [0.2, 0.54], [0.06, 0.62], [0.08, 0.8], [0.2, 0.9]],
  },
  {
    id: 'alpenpass',
    name: 'Alpenpass',
    desc: 'Narrow and twisty in the mountains. Hard to overtake, gentle on tyres – the weather changes quickly.',
    laps: 11,
    base: 125,
    wear: 0.9,
    overtaking: 0.3,
    pitLoss: 24,
    rainChance: 0.55,
    safetyCarChance: 0.45,
    corners: [
      { name: 'Gämsenkehre', at: 0.1 },
      { name: 'Gletscherblick', at: 0.44 },
      { name: 'Murmeltierloch', at: 0.92 },
    ],
    bends: [
      { name: 'Gämsenkehre', at: 0.31 },
      { name: 'Gletscherblick', at: 0.62 },
      { name: 'Murmeltier', at: 0.81 },
    ],
    shape: [[0.46, 0.9], [0.7, 0.9], [0.84, 0.82], [0.76, 0.72], [0.62, 0.72], [0.56, 0.62], [0.68, 0.54], [0.86, 0.6], [0.95, 0.48], [0.88, 0.34], [0.72, 0.36], [0.66, 0.24], [0.8, 0.16], [0.76, 0.06], [0.56, 0.06], [0.48, 0.18], [0.52, 0.32], [0.4, 0.42], [0.3, 0.32], [0.36, 0.18], [0.24, 0.08], [0.08, 0.14], [0.1, 0.32], [0.2, 0.46], [0.08, 0.58], [0.12, 0.76], [0.26, 0.78], [0.24, 0.9]],
  },
  {
    id: 'seeblick',
    name: 'Seeblick',
    desc: 'Fast lakeside circuit. Average tyre wear, good overtaking – a fair fight for everyone.',
    laps: 12,
    base: 114,
    wear: 1.0,
    overtaking: 0.6,
    pitLoss: 20,
    rainChance: 0.45,
    safetyCarChance: 0.3,
    corners: [
      { name: 'Leuchtturm', at: 0.31 },
      { name: 'Seglerbucht', at: 0.58 },
      { name: 'Schilfkurve', at: 0.79 },
    ],
    bends: [
      { name: 'Bootshaus', at: 0.43 },
      { name: 'Schilfkurve', at: 0.7 },
      { name: 'Uferweg', at: 0.89 },
    ],
    shape: [[0.4, 0.9], [0.78, 0.9], [0.94, 0.8], [0.94, 0.58], [0.8, 0.5], [0.66, 0.56], [0.56, 0.48], [0.62, 0.36], [0.8, 0.34], [0.88, 0.18], [0.74, 0.08], [0.5, 0.1], [0.38, 0.2], [0.24, 0.12], [0.08, 0.18], [0.06, 0.36], [0.2, 0.44], [0.34, 0.52], [0.26, 0.64], [0.08, 0.66], [0.08, 0.82], [0.2, 0.9]],
  },
  {
    id: 'kesselring',
    name: 'Kesselring',
    desc: 'Short and very fast, nearly an oval. Lots of slipstream and overtaking – tyres suffer.',
    laps: 12,
    base: 111,
    wear: 1.15,
    overtaking: 0.8,
    pitLoss: 18,
    rainChance: 0.35,
    safetyCarChance: 0.4,
    corners: [
      { name: 'Steilkurve Nord', at: 0.15 },
      { name: 'Gegengerade', at: 0.49 },
      { name: 'Steilkurve Süd', at: 0.7 },
    ],
    bends: [
      { name: 'Dampfkessel', at: 0.27 },
      { name: 'Ventil', at: 0.41 },
      { name: 'Zielbogen', at: 0.93 },
    ],
    shape: [[0.4, 0.88], [0.74, 0.88], [0.92, 0.8], [0.96, 0.56], [0.9, 0.3], [0.76, 0.14], [0.56, 0.1], [0.44, 0.2], [0.5, 0.34], [0.66, 0.42], [0.62, 0.56], [0.46, 0.6], [0.3, 0.5], [0.26, 0.3], [0.34, 0.14], [0.22, 0.08], [0.08, 0.18], [0.04, 0.44], [0.06, 0.7], [0.18, 0.88]],
  },
  {
    id: 'nebelberg',
    name: 'Nebelberg',
    desc: 'Long old-school track on a misty hill. Rain is likely, pit stops are expensive.',
    laps: 11,
    base: 122,
    wear: 1.05,
    overtaking: 0.5,
    pitLoss: 25,
    rainChance: 0.7,
    safetyCarChance: 0.35,
    corners: [
      { name: 'Nebelwand', at: 0.17 },
      { name: 'Burgruine', at: 0.46 },
      { name: 'Teufelsschlucht', at: 0.83 },
    ],
    bends: [
      { name: 'Nebelwand', at: 0.32 },
      { name: 'Geisterkurve', at: 0.68 },
      { name: 'Talblick', at: 0.91 },
    ],
    shape: [[0.44, 0.9], [0.76, 0.9], [0.92, 0.78], [0.8, 0.66], [0.92, 0.54], [0.94, 0.36], [0.82, 0.28], [0.9, 0.14], [0.76, 0.06], [0.6, 0.1], [0.58, 0.26], [0.68, 0.36], [0.6, 0.48], [0.46, 0.46], [0.42, 0.32], [0.46, 0.18], [0.34, 0.08], [0.18, 0.06], [0.08, 0.16], [0.16, 0.3], [0.06, 0.42], [0.12, 0.56], [0.28, 0.6], [0.22, 0.72], [0.08, 0.78], [0.16, 0.9]],
  },
];

export function trackById(id: string): Track {
  const t = TRACKS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown track ${id}`);
  return t;
}

/** Length of the drawn track (same spline and 0.72 aspect as the track view). */
export function trackLength(shape: [number, number][]): number {
  const n = shape.length;
  let len = 0;
  let prev: [number, number] | null = null;
  for (let i = 0; i < n; i++) {
    const p0 = shape[(i - 1 + n) % n], p1 = shape[i], p2 = shape[(i + 1) % n], p3 = shape[(i + 2) % n];
    for (let s = 0; s < 30; s++) {
      const u = s / 30, u2 = u * u, u3 = u2 * u;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      const pt: [number, number] = [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]) * 0.72];
      if (prev) len += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
      prev = pt;
    }
  }
  return len;
}

/** Real seconds per lap at 1× speed: proportional to the drawn length (same speed on screen everywhere). */
export function realLapSeconds(track: Track, tuning: Tuning): number {
  return tuning.realSecondsPerLength * trackLength(track.shape);
}
