import { getLang, setLang, t } from '../i18n';
import { generateWeather, makeRng, makeTuning, TRACKS, type Track, type Weather } from '../sim';
import { $, DEFAULT_TEAM, esc, trackDesc } from '../ui/common';

export interface RaceSetup {
  track: Track;
  seed: number;
  weather: Weather;
}

let lastTrack = TRACKS[0];

/** Pick a track. Calls `onStart` when the player goes to qualifying. */
export function setupScreen(app: HTMLElement, onStart: (s: RaceSetup) => void): void {
  let track = lastTrack;
  let seed = Math.floor(Math.random() * 1e9);
  let weather = generateWeather(track, makeRng(seed, 1), makeTuning());
  const wetStart = () => weather.quali * 100 > 30;

  const render = () => {
    const team = DEFAULT_TEAM;
    app.innerHTML = `
      <div class="row-between">
        <h1>🏁 ${t('appTitle')}</h1>
        <button class="lang" id="lang">${getLang() === 'de' ? 'EN' : 'DE'}</button>
      </div>
      <p class="sub">${t('setupHint')}</p>
      <div class="panel">
        <h3>${t('track')}</h3>
        <div class="tracks">${TRACKS.map(
          (tr) => `<button data-track="${tr.id}" class="${tr === track ? 'on' : ''}">${esc(tr.name)}<small>${tr.laps} ${t('laps')}</small></button>`,
        ).join('')}</div>
        <p class="hint mt">${esc(trackDesc(track))}</p>
      </div>
      <div class="panel" style="border-left:6px solid ${team.color}">
        <h3>${t('yourTeam')}: ${esc(team.name)}</h3>
        ${team.drivers.map((d) => `<div class="drow"><span class="name">#${d.num} ${esc(d.name)}</span></div>`).join('')}
        ${wetStart() ? `<p class="hint">🌧️ ${t('wetQuali')}</p>` : ''}
        <p class="hint">${t('ruleHint')}</p>
      </div>
      <button class="big" id="go">${t('toQuali')}</button>`;

    $('lang').onclick = () => {
      setLang(getLang() === 'de' ? 'en' : 'de');
      render();
    };
    app.querySelectorAll<HTMLButtonElement>('[data-track]').forEach((b) => {
      b.onclick = () => {
        track = TRACKS.find((x) => x.id === b.dataset.track)!;
        lastTrack = track;
        seed = Math.floor(Math.random() * 1e9);
        weather = generateWeather(track, makeRng(seed, 1), makeTuning());
        render();
      };
    });
    $('go').onclick = () => onStart({ track, seed, weather });
  };
  render();
}
