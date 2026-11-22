import type { Track } from './types';

/**
 * Tracks for the simulation core. Milestone 5 adds the full set of 8 tracks;
 * these three come from the prototype (shapes kept) with the new spec values.
 */
export const TRACKS: Track[] = [
  {
    id: 'rheinring',
    name: 'Rheinring',
    desc: 'A classic all-rounder along the river. Rain is never far away.',
    laps: 16,
    base: 78,
    wear: 1.0,
    overtaking: 0.55,
    pitLoss: 8.5,
    rainChance: 0.45,
    safetyCarChance: 0.35,
    corners: [
      { name: 'Hafenkurve', at: 0.18 },
      { name: 'Loreley', at: 0.52 },
      { name: 'Brückenschikane', at: 0.83 },
    ],
    shape: [[0.45, 0.86], [0.75, 0.86], [0.9, 0.72], [0.88, 0.47], [0.75, 0.37], [0.8, 0.15], [0.57, 0.1], [0.47, 0.3], [0.3, 0.32], [0.2, 0.12], [0.07, 0.3], [0.09, 0.7], [0.2, 0.86]],
  },
  {
    id: 'montesol',
    name: 'Monte Sol',
    desc: 'Tight street circuit by the sea. Overtaking is really hard – qualifying matters!',
    laps: 17,
    base: 72,
    wear: 0.8,
    overtaking: 0.22,
    pitLoss: 7.5,
    rainChance: 0.15,
    safetyCarChance: 0.6,
    corners: [
      { name: 'Casino', at: 0.22 },
      { name: 'Hafentunnel', at: 0.55 },
      { name: 'Haarnadel', at: 0.78 },
    ],
    shape: [[0.5, 0.88], [0.8, 0.88], [0.93, 0.76], [0.8, 0.6], [0.92, 0.45], [0.86, 0.16], [0.66, 0.11], [0.62, 0.36], [0.46, 0.42], [0.42, 0.15], [0.2, 0.1], [0.08, 0.28], [0.26, 0.5], [0.08, 0.68], [0.2, 0.88]],
  },
  {
    id: 'waldkurs',
    name: 'Waldkurs',
    desc: 'Fast and flowing through the forest. Eats tyres – and it rains a lot.',
    laps: 16,
    base: 84,
    wear: 1.3,
    overtaking: 0.8,
    pitLoss: 9,
    rainChance: 0.6,
    safetyCarChance: 0.3,
    corners: [
      { name: 'Hirschsprung', at: 0.25 },
      { name: 'Tannenbogen', at: 0.5 },
      { name: 'Fuchsloch', at: 0.8 },
    ],
    shape: [[0.5, 0.9], [0.84, 0.86], [0.95, 0.62], [0.8, 0.46], [0.92, 0.2], [0.66, 0.08], [0.5, 0.26], [0.35, 0.1], [0.12, 0.14], [0.05, 0.44], [0.22, 0.58], [0.1, 0.78], [0.25, 0.9]],
  },
];

export function trackById(id: string): Track {
  const t = TRACKS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown track ${id}`);
  return t;
}
