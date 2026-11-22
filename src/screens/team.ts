import { t, type StringKey } from '../i18n';
import { loadTeam, saveTeam } from '../game/store';
import { TEAM_COLORS, validateTeam, type Team } from '../game/team';
import { $, esc } from '../ui/common';

/** Team setup: team name, colour, two drivers with car numbers. Saved on the phone. */
export function teamScreen(app: HTMLElement, onDone: (team: Team) => void, onBack?: () => void): void {
  const team = loadTeam();
  app.innerHTML = `
    <div class="row-between">
      <h1>${t('tTitle')}</h1>
      ${onBack ? `<button id="back">${t('back')}</button>` : ''}
    </div>
    <div class="teamgrid">
      <div class="panel">
        <label for="tname">${t('tTeamName')}</label>
        <input id="tname" maxlength="22" value="${esc(team.name)}" />
        <label>${t('tColor')}</label>
        <div class="sw">${TEAM_COLORS.map((c) => `<button data-col="${c}" style="background:${c}" class="${c === team.color ? 'on' : ''}" aria-label="${c}"></button>`).join('')}</div>
      </div>
      ${[0, 1]
        .map(
          (i) => `<div class="panel">
        <h3>${t('tDriver', { n: i + 1 })}</h3>
        <div class="row2">
          <div><label for="dn${i}">${t('tName')}</label><input id="dn${i}" maxlength="20" value="${esc(team.drivers[i].name)}" /></div>
          <div><label for="dnum${i}">${t('tNumber')}</label><input id="dnum${i}" type="number" inputmode="numeric" min="2" max="99" value="${team.drivers[i].num}" /></div>
        </div>
      </div>`,
        )
        .join('')}
    </div>
    <div class="err" id="terr"></div>
    <button class="big" id="tsave">${t('tSave')}</button>`;

  let color = team.color;
  app.querySelectorAll<HTMLButtonElement>('[data-col]').forEach((b) => {
    b.onclick = () => {
      color = b.dataset.col!;
      app.querySelectorAll('[data-col]').forEach((x) => x.classList.toggle('on', x === b));
    };
  });
  if (onBack) $('back').onclick = onBack;
  $('tsave').onclick = () => {
    const val = (id: string) => ($(id) as HTMLInputElement).value;
    const next: Team = {
      name: val('tname').trim(),
      color,
      drivers: [0, 1].map((i) => ({ name: val(`dn${i}`).trim(), num: Number(val(`dnum${i}`)) })) as Team['drivers'],
    };
    const errs = validateTeam(next);
    if (errs.length) {
      $('terr').innerHTML = errs.map((e) => `<div>⚠️ ${t(e as StringKey)}</div>`).join('');
      return;
    }
    saveTeam(next);
    onDone(next);
  };
}
