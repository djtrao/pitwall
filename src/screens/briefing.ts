import { num, t, type StringKey } from '../i18n';
import { crossoverWetness, forecastBlocks, lapsToCliff, qualiForecast, type Track, type Tuning, type Tyre, type Weather } from '../sim';
import { $, esc, trackDesc, tyreIcon, tyreName } from '../ui/common';
import { TrackView } from '../ui/trackview';

/** Level with a colour and an icon (not colour alone). */
function level(v: number, lowBelow: number, highFrom: number, words: [StringKey, StringKey, StringKey], invert = false): string {
  const i = v < lowBelow ? 0 : v >= highFrom ? 2 : 1;
  const good = invert ? 2 - i : i;
  const cls = ['lv-good', 'lv-mid', 'lv-bad'][good];
  const icon = ['🟢', '🟡', '🔴'][good];
  return `<span class="lv ${cls}">${icon} ${t(words[i])}</span>`;
}

/** Track briefing: the "study the track" screen (SPEC section 5). */
export function briefingScreen(
  app: HTMLElement,
  o: { track: Track; weather: Weather; tuning: Tuning; round?: number; rounds?: number },
  onGo: () => void,
  onBack?: () => void,
): void {
  const { track, weather, tuning } = o;
  const cross = Math.round(crossoverWetness(tuning));
  const blocks = forecastBlocks(track, weather, -4);
  const dry: Tyre[] = ['S', 'M', 'H'];
  app.innerHTML = `
    <div class="row-between">
      <div>${o.rounds ? `<div class="mut small">${t('bRound', { r: (o.round ?? 0) + 1, n: o.rounds })}</div>` : ''}<h1>${esc(track.name)}</h1></div>
      ${onBack ? `<button id="back">${t('back')}</button>` : ''}
    </div>
    <p class="sub">${esc(trackDesc(track))}</p>
    <div class="brgrid">
      <div class="panel brmap">
        <div class="brcanvas"><canvas id="bcv"></canvas></div>
        <h3 class="mt">${t('bCorners')}</h3>
        ${track.corners.map((c, i) => `<div class="brcorner"><b>${i + 1}</b> ${esc(c.name)}</div>`).join('')}
      </div>
      <div>
        <div class="panel">
          <h3>${t('bFacts')}</h3>
          <div class="facts">
            <div><span>${t('bLaps')}</span><b>${track.laps}</b></div>
            <div><span>${t('bWear')}</span>${level(track.wear, 0.95, 1.15, ['lvlLow', 'lvlMid', 'lvlHigh'])}</div>
            <div><span>${t('bOvertake')}</span>${level(track.overtaking, 0.4, 0.65, ['lvlHard', 'lvlMid', 'lvlEasy'], true)}</div>
            <div><span>${t('bPit')}</span><b>${track.pitLoss} s</b></div>
            <div><span>${t('bRain')}</span>${level(track.rainChance, 0.25, 0.45, ['lvlLow', 'lvlMid', 'lvlHigh'])}</div>
            <div><span>${t('bSC')}</span>${level(track.safetyCarChance, 0.3, 0.45, ['lvlLow', 'lvlMid', 'lvlHigh'])}</div>
          </div>
        </div>
        <div class="panel">
          <h3>${t('bTyres')}</h3>
          ${dry
            .map((k) => {
              const pace = tuning.tyres[k].pace;
              return `<div class="tyrerow">${tyreIcon(k)} <b>${tyreName(k)}</b>
                <span class="mut">${pace === 0 ? t('bFastest') : t('bSlower', { s: num(pace) })}</span>
                <span>${t('bLasts', { n: Math.round(lapsToCliff(k, 1, track, tuning)), p: Math.round(lapsToCliff(k, 2, track, tuning)) })}</span></div>`;
            })
            .join('')}
          <div class="tyrerow">${tyreIcon('W')} <b>${tyreName('W')}</b> <span class="mut">${t('bRainTyre', { w: cross })}</span></div>
        </div>
        <div class="panel">
          <h3>${t('bWeather')}</h3>
          <div class="fc">
            <div class="fcb"><small>${t('quali')}</small><b>${qualiForecast(track, weather)} %</b></div>
            ${blocks.map((b) => `<div class="fcb"><small>${t('lap')} ${b.fromLap === b.toLap ? b.fromLap : `${b.fromLap}–${b.toLap}`}</small><b>${b.chance} %</b></div>`).join('')}
          </div>
          <p class="hint">${t('bFuzzy')}</p>
        </div>
        <div class="panel">
          <h3>${t('bRules')}</h3>
          <div class="rules"><div>📏 ${t('rule1')}</div><div>🛞 ${t('rule2')}</div><div>🚨 ${t('rule3')}</div></div>
        </div>
      </div>
    </div>
    <button class="big" id="bgo">${t('toQuali')}</button>`;
  if (onBack) $('back').onclick = onBack;
  $('bgo').onclick = onGo;
  const tv = new TrackView($('bcv') as HTMLCanvasElement, track);
  requestAnimationFrame(() => {
    tv.fit();
    tv.drawTrack(weather.quali * 100);
  });
}
