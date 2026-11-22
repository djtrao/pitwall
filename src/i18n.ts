/**
 * All UI text in one place: German (default) and English.
 * Use t('key', { name: 'Kenny' }) – {name} in the text is replaced.
 */
export type Lang = 'de' | 'en';

const STRINGS = {
  // general
  appTitle: { de: 'Pit Wall', en: 'Pit Wall' },
  start: { de: 'RENNEN STARTEN', en: 'START RACE' },
  track: { de: 'Strecke', en: 'Track' },
  laps: { de: 'Runden', en: 'Laps' },
  lap: { de: 'Runde', en: 'Lap' },
  lapOf: { de: 'Runde {lap}/{laps}', en: 'Lap {lap}/{laps}' },
  finish: { de: 'ZIEL', en: 'FINISH' },
  yourTeam: { de: 'Dein Team', en: 'Your team' },
  startTyre: { de: 'Start-Reifen', en: 'Start tyre' },
  setupHint: {
    de: 'Wähle Strecke und Start-Reifen. Qualifying und Team-Editor kommen später – die Startaufstellung wird noch ausgewürfelt.',
    en: 'Pick a track and start tyres. Qualifying and the team editor come later – the grid is still rolled at random.',
  },
  ruleHint: {
    de: 'Regel: Im Trockenen musst du zwei verschiedene Trocken-Reifen benutzen, sonst +20 s.',
    en: 'Rule: in a dry race you must use two different dry tyres, otherwise +20 s.',
  },
  wetQuali: { de: 'Es regnet am Start!', en: 'It is raining at the start!' },
  pause: { de: 'Pause', en: 'Pause' },
  fullscreen: { de: 'Vollbild', en: 'Fullscreen' },
  rotateHint: { de: '🔄 Tipp: Handy quer halten – so passt alles auf einen Blick.', en: '🔄 Tip: hold your phone sideways – everything fits on one screen.' },
  rainTyresFrom: { de: 'Regenreifen ab {w} %', en: 'rain tyres from {w} %' },
  lapShort: { de: 'R', en: 'L' },
  followHint: { de: '🎥 Tippe auf deinen Fahrer: Die Kamera folgt ihm und du steuerst seine Zweikämpfe.', en: '🎥 Tap your driver: the camera follows him and you control his duels.' },
  duelAttack: { de: '⚔️ Angriff auf {other}!', en: '⚔️ Attack {other}!' },
  duelDefend: { de: '🛡️ {other} greift an!', en: '🛡️ {other} attacks!' },
  ch_inside: { de: 'Innen', en: 'Inside' },
  ch_outside: { de: 'Außen', en: 'Outside' },
  ch_wait: { de: 'Warten', en: 'Wait' },
  ch_coverInside: { de: 'Innen zu', en: 'Cover inside' },
  ch_coverOutside: { de: 'Außen zu', en: 'Cover outside' },
  ch_letGo: { de: 'Vorbeilassen', en: 'Let him go' },
  chPass: { de: 'Vorbei: {p} %', en: 'Pass: {p} %' },
  chHold: { de: 'Vorne bleiben: {p} %', en: 'Stay ahead: {p} %' },
  chWait: { de: 'Reifen schonen', en: 'Save tyres' },
  chLetGo: { de: 'Keine Zeit verlieren', en: 'Lose no time' },
  riskLow: { de: 'Risiko niedrig', en: 'Low risk' },
  riskMid: { de: 'Risiko mittel', en: 'Medium risk' },
  riskHigh: { de: 'Risiko hoch', en: 'High risk' },
  nextTyre: { de: 'Reifen für den nächsten Stopp', en: 'Tyre for the next stop' },

  // track descriptions
  desc_rheinring: { de: 'Ein Allrounder am Fluss. Regen ist nie weit weg.', en: 'A classic all-rounder along the river. Rain is never far away.' },
  desc_montesol: { de: 'Enger Stadtkurs am Meer. Überholen ist richtig schwer – die Startposition zählt!', en: 'Tight street circuit by the sea. Overtaking is really hard – grid position matters!' },
  desc_waldkurs: { de: 'Schnell und flüssig durch den Wald. Frisst Reifen – und es regnet oft.', en: 'Fast and flowing through the forest. Eats tyres – and it rains a lot.' },

  // tyres and modes
  tyreS: { de: 'Soft', en: 'Soft' },
  tyreM: { de: 'Medium', en: 'Medium' },
  tyreH: { de: 'Hart', en: 'Hard' },
  tyreW: { de: 'Regen', en: 'Rain' },
  mode0: { de: 'Schonen', en: 'Conserve' },
  mode1: { de: 'Normal', en: 'Normal' },
  mode2: { de: 'Pushen', en: 'Push' },
  mode3: { de: 'Vollgas', en: 'Max Attack' },

  // driver card
  box: { de: 'BOX', en: 'BOX' },
  boxing: { de: 'BOX ✕', en: 'BOX ✕' },
  lastLap: { de: 'Letzte', en: 'Last' },
  ahead: { de: 'vorne', en: 'ahead' },
  behind: { de: 'hinten', en: 'behind' },
  inPits: { de: '🔧 In der Box … {s} s', en: '🔧 In the pits … {s} s' },
  losing: { de: '⚠️ Verliert Zeit …', en: '⚠️ Losing time …' },
  finished: { de: '🏁 Im Ziel', en: '🏁 Finished' },
  boxPlanned: { de: '📻 Box nach dieser Runde: {tyre}', en: '📻 Box after this lap: {tyre}' },
  warnRule: { de: '⚠️ 2. Trocken-Reifen fehlt (+20 s)', en: '⚠️ 2nd dry tyre missing (+20 s)' },
  warnWorn: { de: '🛞 Reifen hinüber – bald Box!', en: '🛞 Tyres gone – box soon!' },
  warnFlat: { de: '🛞 Bremsplatten: +0,3 s pro Runde bis zum Stopp', en: '🛞 Flat spot: +0.3 s per lap until the stop' },
  warnWing: { de: '🪛 Frontflügel kaputt: +0,8 s pro Runde, Stopp +5 s', en: '🪛 Front wing damaged: +0.8 s per lap, stop +5 s' },
  warnWet: { de: '🌧️ Strecke nass – Regenreifen sind schneller', en: '🌧️ Track is wet – rain tyres are faster' },
  warnDry: { de: '☀️ Strecke trocknet – Slicks sind schneller', en: '☀️ Track is drying – slicks are faster' },

  // weather
  weather: { de: 'Wetter', en: 'Weather' },
  dry: { de: '☀️ Trocken', en: '☀️ Dry' },
  dryWet: { de: '⛅ Trocken, Strecke noch nass', en: '⛅ Dry, track still wet' },
  lightRain: { de: '🌦️ Leichter Regen', en: '🌦️ Light rain' },
  heavyRain: { de: '🌧️ Starker Regen', en: '🌧️ Heavy rain' },
  wetness: { de: 'Nässe', en: 'Wetness' },
  crossover: { de: 'Ab {w} % Nässe sind Regenreifen schneller.', en: 'Rain tyres are faster above {w} % wetness.' },
  forecast: { de: 'Regenchance', en: 'Chance of rain' },

  // panels
  timing: { de: 'Zeiten', en: 'Timing' },
  radio: { de: 'Boxenfunk', en: 'Team radio' },
  leader: { de: 'Führt', en: 'Leader' },
  pit: { de: 'BOX', en: 'PIT' },
  lapped: { de: '+1 Rd.', en: '+1 Lap' },
  dnf: { de: 'Aus', en: 'DNF' },
  safetyCar: { de: 'SAFETY CAR', en: 'SAFETY CAR' },
  chequered: { de: '🏁 ZIELFLAGGE', en: '🏁 CHEQUERED FLAG' },
  seeResults: { de: 'ERGEBNIS ANSEHEN', en: 'SEE RESULTS' },

  // results
  result: { de: 'Ergebnis', en: 'Result' },
  pos: { de: 'Pos', en: 'Pos' },
  driver: { de: 'Fahrer', en: 'Driver' },
  time: { de: 'Zeit', en: 'Time' },
  stops: { de: 'Stopps', en: 'Stops' },
  points: { de: 'Pkt', en: 'Pts' },
  penalty: { de: '+20 s Strafe', en: '+20 s penalty' },
  penaltyShort: { de: '+20 s', en: '+20 s' },
  raceAgain: { de: 'NOCHMAL FAHREN', en: 'RACE AGAIN' },
  newTrack: { de: 'ANDERE STRECKE', en: 'OTHER TRACK' },
  bestOfYou: { de: 'Dein bestes Auto: P{pos}', en: 'Your best car: P{pos}' },

  // radio messages
  rLightsOut: { de: '🚦 Lichter aus – los geht’s!', en: '🚦 Lights out and away we go!' },
  rRainStart: { de: '🌧️ Es fängt an zu regnen!', en: '🌧️ It is starting to rain!' },
  rRainHeavy: { de: '🌧️ Starker Regen setzt ein!', en: '🌧️ Heavy rain is starting!' },
  rRainStop: { de: '☀️ Der Regen hört auf – die Strecke trocknet.', en: '☀️ The rain has stopped – the track will dry.' },
  rSafetyCar: { de: '🚨 SAFETY CAR! Jetzt an die Box? Der Stopp ist gerade billig.', en: '🚨 SAFETY CAR! Box now? A stop is cheap right now.' },
  rSafetyCarEnd: { de: '🟢 Safety Car kommt rein – wieder Rennen!', en: '🟢 Safety car is in – racing again!' },
  rPitIn: { de: '📻 BOX BOX! {car} kommt rein für {tyre}', en: '📻 BOX BOX! {car} pits for {tyre}' },
  rPitOut: { de: '🔧 {car} fährt raus auf {tyre}', en: '🔧 {car} leaves the pits on {tyre}' },
  rAiRain: { de: '🌧️ {car} holt sich Regenreifen', en: '🌧️ {car} pits for rain tyres' },
  rMistakeSmall: { de: '😬 {car} verbremst sich – {s} s verloren', en: '😬 {car} locks up – {s} s lost' },
  rMistakeBig: { de: '💥 {car} fliegt ab! −5 s und Bremsplatten', en: '💥 {car} goes off! −5 s and a flat spot' },
  rSpin: { de: '💫 {car} dreht sich auf Slicks im Nassen!', en: '💫 {car} spins on slicks in the wet!' },
  rPassMine: { de: '⚔️ {car} überholt {other}!', en: '⚔️ {car} overtakes {other}!' },
  rPassedMine: { de: '😤 {other} wird von {car} überholt', en: '😤 {other} is overtaken by {car}' },
  rDuelFail: { de: '🛡️ {car} kommt nicht an {other} vorbei', en: '🛡️ {car} cannot get past {other}' },
  rCrash: { de: '💥 Berührung! {car} und {other} kollidieren', en: '💥 Contact! {car} and {other} touch' },
  rWing: { de: '🪛 {car} hat den Frontflügel beschädigt', en: '🪛 {car} has damaged the front wing' },
  rWorn: { de: '🛞 {car}: Reifen bei {cond} % – denk an die Box!', en: '🛞 {car}: tyres at {cond} % – think about boxing!' },
  rPenalty: { de: '⚠️ {car}: +20 s – nur eine Trocken-Reifen-Sorte!', en: '⚠️ {car}: +20 s – only one dry tyre type!' },
  rWin: { de: '🏆 {car} gewinnt das Rennen!', en: '🏆 {car} wins the race!' },
  rFinish: { de: '🏁 {car} ist im Ziel', en: '🏁 {car} crosses the line' },
} satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof STRINGS;

let lang: Lang = 'de';
try {
  const saved = localStorage.getItem('pitwall-lang');
  if (saved === 'de' || saved === 'en') lang = saved;
} catch {
  /* storage blocked – keep default */
}

export const getLang = () => lang;

export const hasKey = (k: string): k is StringKey => k in STRINGS;

export function setLang(l: Lang): void {
  lang = l;
  try {
    localStorage.setItem('pitwall-lang', l);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = l;
}

export function t(key: StringKey, params: Record<string, string | number> = {}): string {
  let s: string = STRINGS[key][lang];
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Number with the right decimal mark (1,5 in German, 1.5 in English). */
export function num(v: number, digits = 1): string {
  const s = v.toFixed(digits);
  return lang === 'de' ? s.replace('.', ',') : s;
}

/** Lap time like 1:18,4 / 1:18.4 */
export function lapTime(sec: number | null): string {
  if (sec === null) return '–';
  const m = Math.floor(sec / 60);
  const rest = (sec - m * 60).toFixed(1).padStart(4, '0');
  return `${m}:${lang === 'de' ? rest.replace('.', ',') : rest}`;
}
