import { getLang, setLang, t } from '../i18n';
import type { Season } from '../game/season';
import { loadSeason, loadTeam } from '../game/store';
import { TRACKS, type Track } from '../sim';
import { $, esc, trackDesc } from '../ui/common';
import { lastGame } from './multi';

export interface MenuActions {
  startSeason: (races: number) => void;
  continueSeason: (s: Season) => void;
  abandonSeason: () => void;
  quickRace: (track: Track) => void;
  multiplayer: (rejoin?: string) => void;
  editTeam: () => void;
}

let races = 5;
let quickTrack = TRACKS[0];

/** Main menu: your team, season, single race, multiplayer. */
export function menuScreen(app: HTMLElement, a: MenuActions): void {
  const render = () => {
    const team = loadTeam();
    const saved = loadSeason();
    app.innerHTML = `
      <div class="row-between">
        <h1>🏁 ${t('appTitle')}</h1>
        <button class="lang" id="lang">${getLang() === 'de' ? 'EN' : 'DE'}</button>
      </div>
      <div class="menugrid">
        <div class="panel teamcard" style="border-left:6px solid ${team.color}">
          <h3>${t('yourTeam')}</h3>
          <div class="tc-name">${esc(team.name)}</div>
          ${team.drivers.map((d) => `<div class="tc-drv"><span class="chip" style="background:${team.color}"></span>#${d.num} ${esc(d.name)}</div>`).join('')}
          <button class="mt" id="edit">✏️ ${t('mEditTeam')}</button>
        </div>
        <div class="panel">
          <h3>🏆 ${t('mSeason')}</h3>
          ${
            saved
              ? `<button class="big" id="cont">${t('mContinue', { r: saved.results.length + 1, n: saved.trackIds.length })}</button>
                 <button class="mt small" id="abandon">${t('mAbandon')}</button>`
              : `<div class="seg">${[3, 5, 8].map((n) => `<button data-races="${n}" class="${n === races ? 'on' : ''}">${t('mRaces', { n })}</button>`).join('')}</div>
                 <button class="big" id="season">${t('mStartSeason')}</button>`
          }
        </div>
        <div class="panel">
          <h3>📱📱 ${t('mMulti')}</h3>
          <p class="hint">${t('mMultiHint')}</p>
          ${lastGame() ? `<button class="big" id="rejoin" style="background:#2a7a3a">🔄 ${t('mpRejoin', { code: lastGame()! })}</button>` : ''}
          <button class="big" id="multi" style="background:#1f4fbf">${t('mMulti')}</button>
        </div>
        <div class="panel quickpanel">
          <h3>🏎️ ${t('mQuickRace')}</h3>
          <div class="tracks">${TRACKS.map(
            (tr) => `<button data-track="${tr.id}" class="${tr === quickTrack ? 'on' : ''}">${esc(tr.name)}<small>${tr.laps} ${t('laps')}</small></button>`,
          ).join('')}</div>
          <p class="hint mt">${esc(trackDesc(quickTrack))}</p>
          <button class="big" id="quick">${t('mPlay')}</button>
        </div>
      </div>`;
    $('lang').onclick = () => {
      setLang(getLang() === 'de' ? 'en' : 'de');
      render();
    };
    $('edit').onclick = a.editTeam;
    $('multi').onclick = () => a.multiplayer();
    const rejoin = document.getElementById('rejoin');
    if (rejoin) rejoin.onclick = () => a.multiplayer(lastGame()!);
    $('quick').onclick = () => a.quickRace(quickTrack);
    app.querySelectorAll<HTMLButtonElement>('[data-track]').forEach((b) => {
      b.onclick = () => {
        quickTrack = TRACKS.find((x) => x.id === b.dataset.track)!;
        render();
      };
    });
    app.querySelectorAll<HTMLButtonElement>('[data-races]').forEach((b) => {
      b.onclick = () => {
        races = Number(b.dataset.races);
        render();
      };
    });
    if (saved) {
      $('cont').onclick = () => a.continueSeason(saved);
      $('abandon').onclick = () => {
        a.abandonSeason();
        render();
      };
    } else $('season').onclick = () => a.startSeason(races);
  };
  render();
}
