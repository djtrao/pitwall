import './style.css';
import { getLang, setLang, t } from './i18n';
import { addResult, currentTrack, newSeason, nextRound, seasonOver, type Season } from './game/season';
import { loadSettings, loadTeam, saveSeason } from './game/store';
import type { Team } from './game/team';
import { aiCard, buildField, combinePerks, createRace, generateWeather, makeRng, makeTuning, rand, results, type CarSetup, type HumanTeam, type RaceState, type Track } from './sim';
import { briefingScreen } from './screens/briefing';
import { cardsScreen } from './screens/cards';
import { menuScreen } from './screens/menu';
import { multiplayerScreen } from './screens/multi';
import { qualiScreen } from './screens/quali';
import { localRace, raceScreen } from './screens/race';
import { resultsScreen, seasonEndScreen } from './screens/results';
import { teamScreen } from './screens/team';
import { initSound, preload } from './ui/assets';

preload();
initSound();
const app = document.getElementById('app')!;
setLang(getLang());
const tuning = makeTuning();
const newSeed = () => Math.floor(Math.random() * 1e9);
const top = () => window.scrollTo(0, 0);

const humanTeam = (team: Team): HumanTeam => ({ id: 'me', name: team.name, color: team.color, drivers: team.drivers });

/** One race weekend: briefing → (driver cards) → qualifying (or a random grid) → race. Calls `done` with the finished race. */
function weekend(
  track: Track,
  seed: number,
  cars: CarSetup[],
  round: { r: number; n: number } | null,
  done: (race: RaceState) => void,
  /** Driver cards collected so far (a season keeps them; `save` stores them). */
  owned: Record<string, string[]> = {},
  save: () => void = () => {},
) {
  const weather = generateWeather(track, makeRng(seed, 1), tuning);
  const settings = loadSettings();
  const startRace = (grid: CarSetup[]) => {
    const race = createRace({ seed, track, cars: grid, weather, tuning });
    top();
    raceScreen(app, localRace(race), () => done(race));
  };
  const qualifying = (field: CarSetup[]) => {
    top();
    if (settings.skipQuali) startRace(randomGrid(field, seed));
    else qualiScreen(app, { track, weather, tuning, seed, cars: field }, startRace);
  };
  const withPerks = () => cars.map((c) => (settings.cards && owned[c.id]?.length ? { ...c, perks: combinePerks(owned[c.id]) } : c));
  top();
  briefingScreen(
    app,
    { track, weather, tuning, round: round?.r, rounds: round?.n },
    () => {
      if (!settings.cards) return qualifying(withPerks());
      top();
      cardsScreen(app, { drivers: cars.filter((c) => c.human), owned, seed, season: !!round }, (picks) => {
        // AI drivers pick a random card too, so the field stays fair
        const rng = makeRng(seed, 450);
        for (const c of cars) {
          const id = c.human ? picks[c.id] : aiCard(rng).id;
          if (id) (owned[c.id] ??= []).push(id);
        }
        save();
        qualifying(withPerks());
      });
    },
    menu,
  );
}

/** Skip qualifying: the grid is drawn at random. */
function randomGrid(cars: CarSetup[], seed: number): CarSetup[] {
  const rng = makeRng(seed, 33);
  const g = [...cars];
  for (let i = g.length - 1; i > 0; i--) {
    const j = Math.floor(rand(rng) * (i + 1));
    [g[i], g[j]] = [g[j], g[i]];
  }
  return g;
}

/* ---------- season ---------- */
function playRound(s: Season) {
  const track = currentTrack(s);
  s.cards ??= {};
  weekend(track, s.seed + s.round * 101, s.cars, { r: s.round, n: s.trackIds.length }, (race) => {
    const points = addResult(s, results(race));
    const over = seasonOver(s);
    if (!over) nextRound(s);
    saveSeason(over ? null : s);
    top();
    resultsScreen(
      app,
      race,
      {
        nextLabel: over ? t('finalStandings') : t('nextRace'),
        next: () => (over ? seasonEnd(s) : playRound(s)),
        menu,
      },
      s,
      points,
    );
  }, s.cards, () => saveSeason(s));
}

function seasonEnd(s: Season) {
  top();
  seasonEndScreen(app, s, { newSeason: () => startSeason(s.trackIds.length), menu });
}

function startSeason(races: number) {
  const s = newSeason([humanTeam(loadTeam())], races, newSeed());
  saveSeason(s);
  playRound(s);
}

/* ---------- single race ---------- */
function quickRace(track: Track) {
  const seed = newSeed();
  const cars = buildField({ humans: [humanTeam(loadTeam())], seed, track, tuning }, generateWeather(track, makeRng(seed, 1), tuning)).map((c) =>
    c.human ? { ...c, autoDuel: true, pitGame: true } : c,
  );
  weekend(track, seed, cars, null, (race) => {
    top();
    resultsScreen(app, race, { nextLabel: t('raceAgain'), next: () => quickRace(track), menu });
  });
}

/* ---------- menu ---------- */
function menu() {
  document.body.classList.remove('racing');
  top();
  menuScreen(app, {
    startSeason,
    continueSeason: (s) => playRound(s),
    abandonSeason: () => saveSeason(null),
    quickRace,
    multiplayer: (code) => multiplayerScreen(app, menu, code),
    editTeam: () => teamScreen(app, () => menu(), menu),
  });
}

// first start: create your team
let hasTeam = false;
try {
  hasTeam = !!localStorage.getItem('pitwall-team');
} catch {
  /* storage blocked */
}
// a QR code / link like …/?join=ABCD opens multiplayer directly
const join = new URLSearchParams(location.search).get('join')?.toUpperCase() ?? '';
if (join) history.replaceState(null, '', location.pathname);
const afterTeam = () => (join ? multiplayerScreen(app, menu, join) : menu());
if (hasTeam) afterTeam();
else teamScreen(app, afterTeam);
