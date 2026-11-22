import { createRace, dryWeather, makeTuning, TRACKS, type CarSetup, type RaceConfig, type Track } from '../src/sim';

export const RHEIN = TRACKS[0];

export function humanCar(id = 'me-1', over: Partial<CarSetup> = {}): CarSetup {
  return {
    id,
    name: 'Test Driver',
    num: 7,
    teamId: 'me',
    teamName: 'Test Team',
    color: '#ffd200',
    human: true,
    carPace: 0,
    driverPace: 0,
    startTyre: 'S',
    fuel: RHEIN.laps + 0.5,
    autoDuel: true,
    ...over,
  };
}

/** One car alone on a dry track without safety car. */
export function soloRace(over: Partial<RaceConfig> = {}, car: Partial<CarSetup> = {}, track: Track = RHEIN) {
  return createRace({
    seed: 1,
    track,
    cars: [humanCar('me-1', { fuel: track.laps + 0.5, ...car })],
    weather: dryWeather(track.laps),
    safetyCar: null,
    tuning: makeTuning({ noise: 0 }),
    ...over,
  });
}
