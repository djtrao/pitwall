/** Fictional AI teams. `pace` is the gap to the human car level in s per lap (− = faster). */
export interface AiTeam {
  id: string;
  name: string;
  color: string;
  pace: number;
  drivers: [{ name: string; num: number }, { name: string; num: number }];
}

export const AI_TEAMS: AiTeam[] = [
  { id: 'nordlicht', name: 'Nordlicht Racing', color: '#2b4bff', pace: -0.5, drivers: [{ name: 'Finn Halvorsen', num: 3 }, { name: 'Mika Strand', num: 21 }] },
  { id: 'vulcan', name: 'Vulcan Motorsport', color: '#e10600', pace: -0.2, drivers: [{ name: 'Rafa Ortega', num: 9 }, { name: 'Theo Brandt', num: 30 }] },
  { id: 'comet', name: 'Comet GP', color: '#00d2be', pace: 0.05, drivers: [{ name: 'Kenta Mori', num: 12 }, { name: 'Lucas Ferreira', num: 26 }] },
  { id: 'bluewave', name: 'Blue Wave', color: '#ff8700', pace: 0.25, drivers: [{ name: 'Noah Clement', num: 8 }, { name: 'Ivan Petrov', num: 47 }] },
  { id: 'desertfox', name: 'Desert Fox', color: '#2ecc40', pace: 0.55, drivers: [{ name: 'Omar Haddad', num: 6 }, { name: 'Sam Kowalski', num: 72 }] },
];

/**
 * AI teams for a grid with `count` AI slots. The fastest and the slowest team are
 * always included so there is one clearly faster and one clearly slower team.
 */
export function pickAiTeams(count: number): AiTeam[] {
  const sorted = [...AI_TEAMS].sort((a, b) => a.pace - b.pace);
  if (count <= 0) return [];
  if (count === 1) return [sorted[0]];
  const middle = sorted.slice(1, -1);
  // keep the middle teams closest to human pace
  middle.sort((a, b) => Math.abs(a.pace) - Math.abs(b.pace));
  const chosen = [sorted[0], sorted[sorted.length - 1], ...middle.slice(0, count - 2)];
  return chosen.sort((a, b) => a.pace - b.pace);
}

export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
