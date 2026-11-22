import { lapTime, num, t } from '../i18n';
import { driverStandings, teamStandings, type Season } from '../game/season';
import { POINTS, results, type RaceState, type ResultRow } from '../sim';
import { $, esc } from '../ui/common';

export interface ResultActions {
  /** Main button (next race / final standings / race again). */
  next: () => void;
  nextLabel: string;
  menu: () => void;
}

/** Why a car got time penalties (from the race events). */
function penaltyReasons(race: RaceState): Map<string, string[]> {
  const m = new Map<string, string[]>();
  const add = (id: string | undefined, txt: string) => id && m.set(id, [...(m.get(id) ?? []), txt]);
  for (const e of race.events) {
    if (e.kind === 'unsafeRelease') add(e.car, `+${e.data?.seconds ?? 5} s 🚦 ${t('penUnsafe')}`);
    if (e.kind === 'penalty') add(e.car, `+${e.data?.seconds ?? 20} s 🛞 ${t('penTyre')}`);
  }
  return m;
}

/** Order in which the cars crossed the line (before penalties). */
function roadOrder(rows: ResultRow[]): Map<string, number> {
  const fin = rows.filter((r) => r.car.status === 'finished').map((r) => r.car);
  fin.sort((a, b) => b.lap - a.lap || a.finishTime - b.finishTime);
  return new Map(fin.map((c, i) => [c.id, i + 1]));
}

function resultTable(
  rows: ResultRow[],
  points: Record<string, number> | null,
  mine: (teamId: string, human: boolean) => boolean,
  reasons: Map<string, string[]>,
): string {
  const road = roadOrder(rows);
  return `<table class="res">
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
        const pts = points ? points[c.id] ?? 0 : POINTS[r.pos - 1] ?? 0;
        return `<tr class="${mine(c.teamId, c.human) ? 'me' : ''}"><td>${r.pos}</td>
          <td><span class="chip" style="background:${c.color}"></span>#${c.num} ${esc(c.name)} ${moved}
            ${c.penalty ? `<div class="penwhy">${road.get(c.id) !== r.pos ? `🏁 ${t('resRoad', { p: road.get(c.id) ?? '–' })} · ` : ''}${(reasons.get(c.id) ?? [`+${c.penalty} s`]).map(esc).join(' · ')}</div>` : ''}</td>
          <td>${time}${c.penalty ? `<span class="pill">+${c.penalty} s</span>` : ''}</td>
          <td>${c.stops}</td><td>${pts || ''}</td></tr>`;
      })
      .join('')}
  </table>`;
}

export function standingsHTML(s: Season, myTeam?: string): string {
  const mine = (teamId: string, human: boolean) => (myTeam ? teamId === myTeam : human);
  const ds = driverStandings(s);
  const ts = teamStandings(s);
  return `<div class="champgrid">
    <div class="panel"><h3>${t('cDrivers')}</h3><table class="res">${ds
      .map(
        (d, i) => `<tr class="${mine(d.car.teamId, d.car.human) ? 'me' : ''}"><td>${i + 1}</td><td><span class="chip" style="background:${d.car.color}"></span>${esc(d.car.name)}</td>
        <td class="mut">${d.wins ? `${d.wins}🏆` : ''}</td><td><b>${d.points}</b></td></tr>`,
      )
      .join('')}</table></div>
    <div class="panel"><h3>${t('cTeams')}</h3><table class="res">${ts
      .map(
        (tm, i) => `<tr class="${mine(tm.teamId, tm.human) ? 'me' : ''}"><td>${i + 1}</td><td><span class="chip" style="background:${tm.color}"></span>${esc(tm.name)}</td><td><b>${tm.points}</b></td></tr>`,
      )
      .join('')}</table></div>
  </div>`;
}

/** Race result; with a season also the points of this race and both championships. */
export function resultsScreen(
  app: HTMLElement,
  race: RaceState,
  a: ResultActions,
  season?: Season,
  points?: Record<string, number>,
  myTeam?: string,
): void {
  const rows = results(race);
  const reasons = penaltyReasons(race);
  const anyPenalty = rows.some((x) => x.car.penalty > 0);
  const mine = (teamId: string, human: boolean) => (myTeam ? teamId === myTeam : human);
  const best = rows.find((r) => mine(r.car.teamId, r.car.human));
  app.innerHTML = `
    <h1>${t('result')} · ${esc(race.track.name)}</h1>
    ${season ? `<div class="mut small">${t('bRound', { r: season.results.length, n: season.trackIds.length })}</div>` : ''}
    ${best ? `<p class="sub">${t('bestOfYou', { pos: best.pos })}</p>` : ''}
    <div class="panel">${resultTable(rows, points ?? null, mine, reasons)}${anyPenalty ? `<p class="hint">⚖️ ${t('penLegend')}</p>` : ''}</div>
    ${season ? standingsHTML(season, myTeam) : ''}
    <button class="big" id="next">${a.nextLabel}</button>
    <button class="big" id="menu" style="background:#222935">${t('toMenu')}</button>`;
  $('next').onclick = a.next;
  $('menu').onclick = a.menu;
}

/** End of the season: the champions and the final tables. */
export function seasonEndScreen(app: HTMLElement, s: Season, a: { newSeason: () => void; menu: () => void }, myTeam?: string): void {
  const ds = driverStandings(s);
  const ts = teamStandings(s);
  const mine = ts.findIndex((x) => (myTeam ? x.teamId === myTeam : x.human));
  app.innerHTML = `
    <h1>${t('seasonOver')}</h1>
    <div class="panel champ">
      <div class="trophy">🏆</div>
      <div class="champname">${esc(t('champion', { name: ds[0].car.name }))}</div>
      <div>${esc(t('teamChampion', { name: ts[0].name }))}</div>
      ${mine >= 0 ? `<div class="mt"><b>${esc(t('yourTeamPos', { team: ts[mine].name, pos: mine + 1 }))}</b></div>` : ''}
    </div>
    ${standingsHTML(s, myTeam)}
    <button class="big" id="again">${t('newSeason')}</button>
    <button class="big" id="menu" style="background:#222935">${t('toMenu')}</button>`;
  $('again').onclick = a.newSeason;
  $('menu').onclick = a.menu;
}
