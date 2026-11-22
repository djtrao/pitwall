import { getLang, setLang, t } from '../i18n';
import { generateWeather, makeRng, makeTuning, TRACKS, type Track, type Tyre, type Weather } from '../sim';
import { $, DEFAULT_TEAM, esc, trackDesc, tyreIcon } from '../ui/common';

export interface RaceSetup {
  track: Track;
  seed: number;
  weather: Weather;
  startTyres: [Tyre, Tyre];
}

let lastTrack = TRACKS[0];

/** Pick track and start tyres. Calls `onStart` when the player presses START. */
export function setupScreen(app: HTMLElement, onStart: (s: RaceSetup) => void): void {
  let track = lastTrack;
  let seed = Math.floor(Math.random() * 1e9);
  let weather = generateWeather(track, makeRng(seed, 1), makeTuning());
  const wetStart = () => weather.quali * 100 > 30;
  let tyres: [Tyre, Tyre] = wetStart() ? ['W', 'W'] : ['S', 'S'];

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
        <h3>${t('yourTeam')}: ${esc(team.name)} · ${t('startTyre')}</h3>
        ${wetStart() ? `<p class="hint">🌧️ ${t('wetQuali')}</p>` : ''}
        ${team.drivers
          .map(
            (d, i) => `<div class="drow"><span class="name">#${d.num} ${esc(d.name)}</span>
              <div class="seg">${(['S', 'M', 'H', 'W'] as Tyre[])
                .map((k) => `<button class="tb ${tyres[i] === k ? 'on' : ''}" data-d="${i}" data-t="${k}" aria-label="${k}">${tyreIcon(k)}</button>`)
                .join('')}</div></div>`,
          )
          .join('')}
        <p class="hint">${t('ruleHint')}</p>
      </div>
      <button class="big" id="go">${t('start')}</button>`;

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
        tyres = wetStart() ? ['W', 'W'] : ['S', 'S'];
        render();
      };
    });
    app.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => {
      b.onclick = () => {
        tyres[Number(b.dataset.d)] = b.dataset.t as Tyre;
        render();
      };
    });
    $('go').onclick = () => onStart({ track, seed, weather, startTyres: [...tyres] as [Tyre, Tyre] });
  };
  render();
}
