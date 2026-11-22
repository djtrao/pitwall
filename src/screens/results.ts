import { lapTime, num, t } from '../i18n';
import { POINTS, results, type RaceState } from '../sim';
import { $, esc } from '../ui/common';

/** Simple race result. Championship tables come with the season (milestone 5). */
export function resultsScreen(app: HTMLElement, race: RaceState, actions: { again: () => void; menu: () => void }): void {
  const rows = results(race);
  const best = rows.find((r) => r.car.human);
  app.innerHTML = `
    <h1>${t('result')} · ${esc(race.track.name)}</h1>
    ${best ? `<p class="sub">${t('bestOfYou', { pos: best.pos })}</p>` : ''}
    <div class="panel"><table class="res">
      <tr><th>${t('pos')}</th><th>${t('driver')}</th><th>${t('time')}</th><th>${t('stops')}</th><th>${t('points')}</th></tr>
      ${rows
        .map((r) => {
          const c = r.car;
          const moved = r.gained > 0 ? `<span class="up">▲${r.gained}</span>` : r.gained < 0 ? `<span class="down">▼${-r.gained}</span>` : '';
          let time: string;
          if (r.time === null) time = t('dnf');
          else if (r.pos === 1) time = lapTime(r.time);
          else if (r.gap === null) time = t('lapped');
          else time = `+${num(r.gap)} s`;
          return `<tr class="${c.human ? 'me' : ''}"><td>${r.pos}</td>
            <td><span class="chip" style="background:${c.color}"></span>#${c.num} ${esc(c.name)} ${moved}</td>
            <td>${time}${c.penalty ? `<span class="pill">${t('penaltyShort')}</span>` : ''}</td>
            <td>${c.stops}</td><td>${POINTS[r.pos - 1] ?? ''}</td></tr>`;
        })
        .join('')}
    </table></div>
    <button class="big" id="again">${t('raceAgain')}</button>
    <button class="big" id="menu" style="background:#222935">${t('newTrack')}</button>`;
  $('again').onclick = actions.again;
  $('menu').onclick = actions.menu;
}
