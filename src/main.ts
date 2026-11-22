import './style.css';
import { getLang, setLang } from './i18n';
import { buildField, createRace, generateWeather, makeRng, makeTuning, type CarSetup } from './sim';
import { qualiScreen } from './screens/quali';
import { raceScreen } from './screens/race';
import { resultsScreen } from './screens/results';
import { setupScreen, type RaceSetup } from './screens/setup';
import { DEFAULT_TEAM } from './ui/common';

const app = document.getElementById('app')!;
setLang(getLang());
const tuning = makeTuning();

/** Start screen → qualifying → race → results. */
function startWeekend(setup: RaceSetup) {
  const team = DEFAULT_TEAM;
  const cars = buildField(
    { humans: [{ id: 'me', name: team.name, color: team.color, drivers: team.drivers }], seed: setup.seed, track: setup.track, tuning },
    setup.weather,
  ).map((c) => (c.human ? { ...c, autoDuel: true, pitGame: true } : c));
  window.scrollTo(0, 0);
  qualiScreen(app, { track: setup.track, weather: setup.weather, tuning, seed: setup.seed, cars }, (grid) => startRace(setup, grid));
}

function startRace(setup: RaceSetup, grid: CarSetup[]) {
  const race = createRace({ seed: setup.seed, track: setup.track, cars: grid, weather: setup.weather, tuning });
  window.scrollTo(0, 0);
  raceScreen(app, race, () => {
    window.scrollTo(0, 0);
    resultsScreen(app, race, {
      again: () => {
        const seed = Math.floor(Math.random() * 1e9);
        startWeekend({ ...setup, seed, weather: generateWeather(setup.track, makeRng(seed, 1), tuning) });
      },
      menu: () => setupScreen(app, startWeekend),
    });
  });
}

setupScreen(app, startWeekend);
