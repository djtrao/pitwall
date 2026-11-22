import './style.css';
import { getLang, setLang } from './i18n';
import { buildField, createRace, generateWeather, makeRng, makeTuning, quickQualifying } from './sim';
import { raceScreen } from './screens/race';
import { resultsScreen } from './screens/results';
import { setupScreen, type RaceSetup } from './screens/setup';
import { DEFAULT_TEAM } from './ui/common';

const app = document.getElementById('app')!;
setLang(getLang());

function startRace(setup: RaceSetup) {
  const tuning = makeTuning();
  const team = DEFAULT_TEAM;
  const field = buildField(
    { humans: [{ id: 'me', name: team.name, color: team.color, drivers: team.drivers }], seed: setup.seed, track: setup.track, tuning },
    setup.weather,
  ).map((c) => (c.human ? { ...c, startTyre: setup.startTyres[Number(c.id.slice(-1)) - 1], autoDuel: true } : c));
  const grid = quickQualifying(field, setup.track, setup.weather, tuning, setup.seed);
  const race = createRace({ seed: setup.seed, track: setup.track, cars: grid, weather: setup.weather, tuning });
  window.scrollTo(0, 0);
  raceScreen(app, race, () => {
    window.scrollTo(0, 0);
    resultsScreen(app, race, {
      again: () => {
        const seed = Math.floor(Math.random() * 1e9);
        startRace({ ...setup, seed, weather: generateWeather(setup.track, makeRng(seed, 1), tuning) });
      },
      menu: () => setupScreen(app, startRace),
    });
  });
}

setupScreen(app, startRace);
