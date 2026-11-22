/**
 * AI teams: the current Formula 1 teams with their drivers, car numbers and team colours
 * (approximate). `pace` is the gap to the human car level in s per lap (− = faster),
 * `skill` the driver's own offset (− = faster). Kept within ±0.6 s so a well-played
 * human team can still win.
 */
export interface AiDriver {
  name: string;
  num: number;
  skill: number;
}

export interface AiTeam {
  id: string;
  name: string;
  color: string;
  pace: number;
  drivers: [AiDriver, AiDriver];
}

export const AI_TEAMS: AiTeam[] = [
  // ordered like the 2026 constructors' championship (after Las Vegas, round 21 of 23)
  { id: 'mercedes', name: 'Mercedes', color: '#27F4D2', pace: -0.35, drivers: [{ name: 'Kimi Antonelli', num: 12, skill: -0.1 }, { name: 'George Russell', num: 63, skill: -0.06 }] },
  { id: 'ferrari', name: 'Ferrari', color: '#E8002D', pace: -0.22, drivers: [{ name: 'Lewis Hamilton', num: 44, skill: -0.07 }, { name: 'Charles Leclerc', num: 16, skill: -0.03 }] },
  { id: 'redbull', name: 'Red Bull Racing', color: '#3671C6', pace: -0.18, drivers: [{ name: 'Max Verstappen', num: 3, skill: -0.18 }, { name: 'Isack Hadjar', num: 6, skill: 0.05 }] },
  { id: 'mclaren', name: 'McLaren', color: '#FF8000', pace: -0.17, drivers: [{ name: 'Lando Norris', num: 1, skill: -0.08 }, { name: 'Oscar Piastri', num: 81, skill: 0 }] },
  { id: 'racingbulls', name: 'Racing Bulls', color: '#F2F2F2', pace: 0.05, drivers: [{ name: 'Liam Lawson', num: 30, skill: 0 }, { name: 'Arvid Lindblad', num: 41, skill: 0.08 }] },
  { id: 'alpine', name: 'Alpine', color: '#FF87BC', pace: 0.12, drivers: [{ name: 'Pierre Gasly', num: 10, skill: -0.07 }, { name: 'Franco Colapinto', num: 43, skill: 0.07 }] },
  { id: 'haas', name: 'Haas', color: '#9C9FA2', pace: 0.25, drivers: [{ name: 'Oliver Bearman', num: 87, skill: 0 }, { name: 'Esteban Ocon', num: 31, skill: 0.06 }] },
  { id: 'audi', name: 'Audi', color: '#C5003E', pace: 0.27, drivers: [{ name: 'Nico Hülkenberg', num: 27, skill: 0.02 }, { name: 'Gabriel Bortoleto', num: 5, skill: 0.02 }] },
  { id: 'williams', name: 'Williams', color: '#64C4FF', pace: 0.33, drivers: [{ name: 'Alexander Albon', num: 23, skill: 0.02 }, { name: 'Carlos Sainz', num: 55, skill: 0.02 }] },
  { id: 'astonmartin', name: 'Aston Martin', color: '#229971', pace: 0.42, drivers: [{ name: 'Fernando Alonso', num: 14, skill: -0.05 }, { name: 'Lance Stroll', num: 18, skill: 0.1 }] },
  { id: 'cadillac', name: 'Cadillac', color: '#C8A951', pace: 0.55, drivers: [{ name: 'Sergio Pérez', num: 11, skill: 0.03 }, { name: 'Valtteri Bottas', num: 77, skill: 0.03 }] },
];

const FAST = -0.15;
const SLOW = 0.35;

/**
 * AI teams for a grid with `count` AI slots, picked at random (`rand` 0..1):
 * one or two of the top 4 teams (pace ≤ −0.15), one clearly slower team (pace ≥ 0.35),
 * the rest from the midfield.
 */
export function pickAiTeams(count: number, rand: () => number = () => 0.5): AiTeam[] {
  if (count <= 0) return [];
  const shuffled = (list: AiTeam[]) => {
    const l = [...list];
    for (let i = l.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [l[i], l[j]] = [l[j], l[i]];
    }
    return l;
  };
  // the top 4 are close in real life: with 4 or 5 AI teams two of them race
  const top = shuffled(AI_TEAMS.filter((t) => t.pace <= FAST)).slice(0, count >= 4 ? 2 : 1);
  if (count <= top.length) return top.slice(0, count);
  const slow = shuffled(AI_TEAMS.filter((t) => t.pace >= SLOW))[0];
  const middle = shuffled(AI_TEAMS.filter((t) => t.pace > FAST && t.pace < SLOW));
  return [...top, slow, ...middle.slice(0, count - top.length - 1)].sort((a, b) => a.pace - b.pace);
}

export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
