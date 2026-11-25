/**
 * Driver cards (optional, chosen before qualifying): small bonuses for one driver, like in
 * roguelite games. In a season they add up race by race. AI drivers get a random card too.
 */
import { int, rand, type Rng } from './rng';

/** What a driver's cards change. Neutral values: pace 0, multipliers 1, additions 0. */
export interface Perks {
  /** Lap time (s per lap, F1 scale; negative = faster). */
  pace: number;
  /** Driving-mistake chance ×. */
  mistake: number;
  /** Tyre wear ×. */
  wear: number;
  /** Own crash / spin risk in duels ×. */
  risk: number;
  /** Pass chance when attacking (+). */
  pass: number;
  /** Taken off the attacker's pass chance when defending (+). */
  defend: number;
  /** Time lost on a wet track or on the wrong tyres ×. */
  wet: number;
  /** Pit stop standing time (s, negative = quicker). */
  pit: number;
}

export const NO_PERKS: Perks = { pace: 0, mistake: 1, wear: 1, risk: 1, pass: 0, defend: 0, wet: 1, pit: 0 };

export interface Card {
  id: string;
  icon: string;
  name: { de: string; en: string };
  /** The effect in a few words (shown small at the bottom of the card). */
  effect: { de: string; en: string };
  perks: Partial<Perks>;
}

export const CARDS: Card[] = [
  { id: 'jog', icon: '🏃', name: { de: 'War joggen', en: 'Went jogging' }, effect: { de: 'Mehr Ausdauer: −25 % Fahrfehler', en: 'More stamina: −25 % mistakes' }, perks: { mistake: 0.75 } },
  { id: 'sleep', icon: '😴', name: { de: 'Super geschlafen', en: 'Great sleep' }, effect: { de: 'Ausgeruht: −0,1 s pro Runde', en: 'Well rested: −0.1 s per lap' }, perks: { pace: -0.1 } },
  { id: 'gym', icon: '🏋️', name: { de: 'Krafttraining', en: 'Gym session' }, effect: { de: 'Harte Duelle: −30 % Unfallrisiko', en: 'Hard duels: −30 % crash risk' }, perks: { risk: 0.7 } },
  { id: 'yoga', icon: '🧘', name: { de: 'Yoga', en: 'Yoga' }, effect: { de: 'Sanft am Gas: Reifen halten 10 % länger', en: 'Smooth: tyres last 10 % longer' }, perks: { wear: 0.9 } },
  { id: 'rain', icon: '🌧️', name: { de: 'Regentraining', en: 'Rain practice' }, effect: { de: 'Bei Nässe −30 % Zeitverlust', en: 'Wet track: −30 % time lost' }, perks: { wet: 0.7 } },
  { id: 'sim', icon: '🎮', name: { de: 'Simulator-Abend', en: 'Simulator night' }, effect: { de: 'Angriff: +6 % Überholchance', en: 'Attack: +6 % pass chance' }, perks: { pass: 0.06 } },
  { id: 'wall', icon: '🧱', name: { de: 'Verteidigungs-Kurs', en: 'Defence class' }, effect: { de: 'Gegner überholen 6 % seltener', en: 'Rivals pass 6 % less often' }, perks: { defend: 0.06 } },
  { id: 'crew', icon: '🔧', name: { de: 'Boxen-Drill', en: 'Pit drill' }, effect: { de: 'Boxenstopp −0,3 s', en: 'Pit stop −0.3 s' }, perks: { pit: -0.3 } },
  { id: 'pasta', icon: '🍝', name: { de: 'Pasta-Abend', en: 'Pasta night' }, effect: { de: '−0,05 s pro Runde, −10 % Fahrfehler', en: '−0.05 s per lap, −10 % mistakes' }, perks: { pace: -0.05, mistake: 0.9 } },
  { id: 'coffee', icon: '☕', name: { de: 'Doppelter Espresso', en: 'Double espresso' }, effect: { de: '+10 % Überholchance, aber +20 % Risiko', en: '+10 % pass chance, but +20 % risk' }, perks: { pass: 0.1, risk: 1.2 } },
];

export const cardById = (id: string) => CARDS.find((c) => c.id === id);

/** All cards of a driver together (multipliers multiply, the rest adds up), with sensible limits. */
export function combinePerks(ids: readonly string[]): Perks {
  const p = { ...NO_PERKS };
  for (const id of ids) {
    const c = cardById(id);
    if (!c) continue;
    p.pace += c.perks.pace ?? 0;
    p.mistake *= c.perks.mistake ?? 1;
    p.wear *= c.perks.wear ?? 1;
    p.risk *= c.perks.risk ?? 1;
    p.pass += c.perks.pass ?? 0;
    p.defend += c.perks.defend ?? 0;
    p.wet *= c.perks.wet ?? 1;
    p.pit += c.perks.pit ?? 0;
  }
  p.pace = Math.max(-0.3, p.pace);
  p.mistake = Math.max(0.4, p.mistake);
  p.wear = Math.max(0.75, p.wear);
  p.risk = Math.max(0.4, p.risk);
  p.pass = Math.min(0.2, p.pass);
  p.defend = Math.min(0.2, p.defend);
  p.wet = Math.max(0.4, p.wet);
  p.pit = Math.max(-1, p.pit);
  return p;
}

/** Three different random cards to choose from. */
export function drawCards(r: Rng, n = 3): Card[] {
  const pool = [...CARDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand(r) * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/** An AI driver's pick: one random card. */
export const aiCard = (r: Rng): Card => CARDS[int(r, 0, CARDS.length - 1)];
