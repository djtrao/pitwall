/** Saving on the phone (localStorage). Browser only – the server never uses this file. */
import type { Season } from './season';
import { DEFAULT_TEAM, validateTeam, type Team } from './team';

const TEAM_KEY = 'pitwall-team';

export function loadTeam(): Team {
  try {
    const raw = localStorage.getItem(TEAM_KEY);
    if (raw) {
      const t = JSON.parse(raw) as Team;
      if (validateTeam(t).length === 0) return t;
    }
  } catch {
    /* storage blocked or broken – use the default */
  }
  return structuredClone(DEFAULT_TEAM);
}

export function saveTeam(team: Team): void {
  try {
    localStorage.setItem(TEAM_KEY, JSON.stringify(team));
  } catch {
    /* ignore */
  }
}


const SEASON_KEY = 'pitwall-season';

export function saveSeason(s: Season | null): void {
  try {
    if (s) localStorage.setItem(SEASON_KEY, JSON.stringify(s));
    else localStorage.removeItem(SEASON_KEY);
  } catch {
    /* ignore */
  }
}

export function loadSeason(): Season | null {
  try {
    const raw = localStorage.getItem(SEASON_KEY);
    return raw ? (JSON.parse(raw) as Season) : null;
  } catch {
    return null;
  }
}

/* ---------- options (main menu) ---------- */

export interface Settings {
  /** Driver cards before qualifying. */
  cards: boolean;
  /** Skip qualifying: the grid is drawn at random. */
  skipQuali: boolean;
}
// "-v3": the cards are on by default since build 3 (older saved options had them off)
const SETTINGS_KEY = 'pitwall-settings-v3';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { cards: true, skipQuali: false, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* ignore */
  }
  return { cards: true, skipQuali: false };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
