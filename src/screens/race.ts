import { lapTime, num, t, type StringKey } from '../i18n';
import {
  applyCommand,
  crossoverWetness,
  forecastBlocks,
  leaderLap,
  standings,
  step,
  tyreRuleOk,
  type Car,
  type Mode,
  type RaceEvent,
  type RaceState,
  type Tyre,
} from '../sim';
import { $, esc, shortName, tyreIcon, tyreName } from '../ui/common';
import { TrackView } from '../ui/trackview';

const TICK = 0.1; // real seconds per simulation tick (same as the server later)
const MODE_ICON = ['🐢', '➖', '🔥', '💥'];
const TYRES: Tyre[] = ['S', 'M', 'H', 'W'];

/** The single-player race screen. Calls `onDone` when the player wants to see the results. */
export function raceScreen(app: HTMLElement, race: RaceState, onDone: () => void): void {
  const mine = race.cars.filter((c) => c.human).sort((a, b) => a.id.localeCompare(b.id));
  const isMine = (c: Car) => c.human;
  const cross = Math.round(crossoverWetness(race.tuning));
  // tyre the player has selected for the next stop, per driver
  const sel = new Map<string, Tyre>(mine.map((c) => [c.id, suggestTyre(c)]));
  let speed = 1;
  let acc = 0;
  let last = performance.now();
  let uiTimer = 0;
  let lastEvent = 0;
  let bannerShown = false;
  let running = true;
  const wornShown = new Set<string>();
  const prev = new Map<string, number>(race.cars.map((c) => [c.id, c.dist]));

  app.innerHTML = `
    <div class="topbar">
      <div><div class="mut small">${esc(race.track.name)}</div><div class="lapc" id="lapc"></div></div>
      <div class="seg" id="spd">${[0, 1, 2, 4]
        .map((s) => `<button data-s="${s}" class="${s === 1 ? 'on' : ''}" aria-label="${s ? `${s}×` : t('pause')}">${s ? `${s}×` : '❚❚'}</button>`)
        .join('')}</div>
    </div>
    <div class="race-grid">
      <div class="panel" id="cvp">
        <div id="scb"></div>
        <canvas id="cv"></canvas>
        <div id="banner"><b>${t('chequered')}</b><button class="big" id="tores">${t('seeResults')}</button></div>
      </div>
      <div id="cards">${mine.map((c, i) => cardHTML(c, i)).join('')}</div>
      <div class="panel" id="wx"></div>
      <div class="panel" id="tower"></div>
      <div class="panel" id="log"><h3>${t('radio')}</h3><div id="msgs"><div class="msg mine">${t('rLightsOut')}</div></div></div>
    </div>`;

  const tv = new TrackView($('cv') as HTMLCanvasElement, race.track);
  const onResize = () => tv.fit();
  window.addEventListener('resize', onResize);

  $('spd').onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    speed = Number(b.dataset.s);
    $('spd').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  };

  $('cards').onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!b) return;
    const c = mine[Number(b.dataset.d)];
    if (c.status === 'finished' || c.status === 'dnf') return;
    const v = b.dataset.v!;
    if (b.dataset.act === 'mode') applyCommand(race, { type: 'mode', car: c.id, mode: Number(v) as Mode });
    if (b.dataset.act === 'sel') {
      sel.set(c.id, v as Tyre);
      if (c.pitPlan) applyCommand(race, { type: 'pit', car: c.id, tyre: v as Tyre });
    }
    if (b.dataset.act === 'box') applyCommand(race, { type: 'pit', car: c.id, tyre: c.pitPlan ? null : sel.get(c.id)! });
    updateUI();
  };

  $('tores').onclick = () => {
    running = false;
    window.removeEventListener('resize', onResize);
    onDone();
  };

  /* ---------- per-frame loop ---------- */
  const frame = (now: number) => {
    if (!running) return;
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (!race.over && speed > 0) {
      acc += dt * speed;
      let n = 0;
      while (acc >= TICK && n < 100) {
        for (const c of race.cars) prev.set(c.id, c.dist);
        step(race, TICK);
        acc -= TICK;
        n++;
      }
    }
    // smooth movement between simulation ticks
    const alpha = race.over ? 1 : Math.min(1, acc / TICK);
    tv.drawRace(
      race,
      (c) => {
        const p = prev.get(c.id) ?? c.dist;
        return Math.abs(c.dist - p) > 0.1 ? c.dist : p + (c.dist - p) * alpha;
      },
      isMine,
    );
    uiTimer += dt;
    if (uiTimer > 0.2) {
      uiTimer = 0;
      updateUI();
    }
    if (race.over && !bannerShown) {
      bannerShown = true;
      setTimeout(() => ($('banner').style.display = 'flex'), 900);
    }
    requestAnimationFrame(frame);
  };

  /* ---------- text panels ---------- */
  function updateUI() {
    const st = standings(race);
    const leader = st[0];
    $('lapc').textContent = race.leaderFinished ? t('finish') : t('lapOf', { lap: leaderLap(race), laps: race.track.laps });
    $('scb').innerHTML = race.safetyCar.active ? `<div class="scbanner">${t('safetyCar')}</div>` : '';
    mine.forEach((c, i) => updateCard(c, i, st));
    updateWeather();
    updateTower(st, leader);
    updateRadio();
  }

  function updateCard(c: Car, i: number, st: Car[]) {
    const pos = st.indexOf(c);
    $(`cpos${i}`).textContent = `P${pos + 1}`;
    $(`cty${i}`).innerHTML = `${tyreIcon(c.tyre)} <b>${Math.round(c.cond * 100)}%</b>`;
    const wb = $(`cwb${i}`);
    wb.style.width = `${Math.round(c.cond * 100)}%`;
    wb.style.background = c.cond > 0.5 ? '#3c3' : c.cond > 0.3 ? '#fc3' : '#f33';
    let info: string;
    if (c.status === 'finished') info = t('finished') + (c.penalty ? ` (${t('penalty')})` : '');
    else if (c.status === 'pit') info = t('inPits', { s: Math.ceil(c.pitTimer / race.timeScale) });
    else if (c.loss > 0) info = t('losing');
    else {
      const ahead = st[pos - 1];
      const behind = st[pos + 1];
      const gap = (a: Car, b: Car) => num((a.dist - b.dist) * c.lapTime);
      info = `${t('lastLap')} ${lapTime(c.lastLap)}`;
      if (ahead && ahead.status === 'running') info += ` · ${t('ahead')} +${gap(ahead, c)}`;
      if (behind && behind.status === 'running') info += ` · ${t('behind')} −${gap(c, behind)}`;
    }
    $(`cinfo${i}`).textContent = info;
    for (let k = 0; k < 4; k++) $(`cm${i}_${k}`).classList.toggle('on', c.mode === k);
    for (const k of TYRES) $(`cs${i}_${k}`).classList.toggle('on', sel.get(c.id) === k);
    const bb = $(`cb${i}`);
    bb.classList.toggle('on', !!c.pitPlan);
    bb.textContent = c.pitPlan ? t('boxing') : t('box');

    const warn: string[] = [];
    if (c.status === 'running' || c.status === 'pit') {
      if (c.pitPlan) warn.push(t('boxPlanned', { tyre: tyreName(c.pitPlan) }));
      if (!tyreRuleOk(c.usedTyres) && !(c.pitPlan && !c.usedTyres.includes(c.pitPlan))) warn.push(t('warnRule'));
      if (c.status === 'running') {
        if (c.cond < race.tuning.cliffAt + 0.05) warn.push(t('warnWorn'));
        if (c.tyre !== 'W' && race.wetness > cross + 5) warn.push(t('warnWet'));
        if (c.tyre === 'W' && race.wetness < cross - 8 && race.rainNow === 0) warn.push(t('warnDry'));
        if (c.flatSpot) warn.push(t('warnFlat'));
        if (c.wingDamage) warn.push(t('warnWing'));
      }
    }
    $(`cw${i}`).innerHTML = warn.map(esc).join('<br>');
  }

  function updateWeather() {
    const r = race.rainNow;
    const now = leaderLap(race) - 1;
    const blocks = forecastBlocks(race.track, race.weather, now).filter((b) => b.toLap > now).slice(0, 4);
    const state = r > 0.55 ? t('heavyRain') : r > 0 ? t('lightRain') : race.wetness > 5 ? t('dryWet') : t('dry');
    $('wx').innerHTML = `<h3>${t('weather')}</h3>
      <div><b>${state}</b> · ${t('wetness')} <b>${Math.round(race.wetness)} %</b></div>
      <div class="wetbar"><i style="width:${race.wetness}%"></i><span class="x" style="left:${cross}%"></span></div>
      <div class="hint">${t('crossover', { w: cross })}</div>
      <div class="hint mt">${t('forecast')}:</div>
      <div class="fc">${blocks.map((b) => `<div class="fcb"><small>${t('lap')} ${b.fromLap}–${b.toLap}</small><b>${b.chance} %</b></div>`).join('')}</div>`;
  }

  function updateTower(st: Car[], leader: Car) {
    const rows = st.map((c, i) => {
      let gap: string;
      if (c.status === 'dnf') gap = t('dnf');
      else if (c.status === 'pit') gap = `<b>${t('pit')}</b>`;
      else if (i === 0) gap = c.status === 'finished' ? '🏁' : t('leader');
      else if (c.status === 'finished' && leader.status === 'finished') gap = c.lap < leader.lap ? t('lapped') : `+${num(c.finishTime - leader.finishTime)}`;
      else if (leader.dist - c.dist >= 1) gap = t('lapped');
      else gap = `+${num(Math.max(0, (leader.dist - c.dist) * c.lapTime))}`;
      const flag = c.status === 'running' && c.loss > 0 ? ' ⚠️' : c.pitPlan ? ' 📻' : '';
      return `<tr class="${isMine(c) ? 'me' : ''}"><td>${i + 1}</td>
        <td><span class="chip" style="background:${c.color}"></span>${c.num} ${shortName(c.name)}${flag}</td>
        <td>${gap}</td><td>${tyreIcon(c.tyre, true)} <span class="mut">${Math.round(c.cond * 100)}%</span></td></tr>`;
    });
    $('tower').innerHTML = `<h3>${t('timing')}</h3><table>${rows.join('')}</table>`;
  }

  function updateRadio() {
    const fresh = race.events.filter((e) => e.id > lastEvent);
    if (!fresh.length) return;
    lastEvent = fresh[fresh.length - 1].id;
    const box = $('msgs');
    for (const e of fresh) {
      const m = radio(e);
      if (!m) continue;
      const d = document.createElement('div');
      d.className = `msg${m.mine ? ' mine' : ''}`;
      d.textContent = `${t('lap')} ${e.lap} · ${m.text}`;
      box.prepend(d);
    }
    while (box.childElementCount > 12) box.lastElementChild!.remove();
  }

  function radio(e: RaceEvent): { text: string; mine: boolean } | null {
    const car = race.cars.find((c) => c.id === e.car);
    const other = race.cars.find((c) => c.id === e.other);
    const name = (c?: Car) => (c ? `#${c.num} ${c.name}` : '');
    const p = { car: name(car), other: name(other) };
    const carMine = !!car && isMine(car);
    const otherMine = !!other && isMine(other);
    const msg = (key: StringKey, extra: Record<string, string | number> = {}, isMineMsg = carMine) => ({ text: t(key, { ...p, ...extra }), mine: isMineMsg });
    switch (e.kind) {
      case 'rainStart': return msg(Number(e.data?.intensity) > 0.55 ? 'rRainHeavy' : 'rRainStart', {}, true);
      case 'rainStop': return msg('rRainStop', {}, true);
      case 'safetyCar': return msg('rSafetyCar', {}, true);
      case 'safetyCarEnd': return msg('rSafetyCarEnd', {}, true);
      case 'pitIn':
        if (carMine) return msg('rPitIn', { tyre: tyreName(e.data!.tyre as Tyre) });
        return e.data?.tyre === 'W' ? msg('rAiRain') : null;
      case 'pitOut': return carMine ? msg('rPitOut', { tyre: tyreName(e.data!.tyre as Tyre) }) : null;
      case 'mistakeSmall': return carMine ? msg('rMistakeSmall', { s: num(Number(e.data?.loss ?? 2)) }) : null;
      case 'mistakeBig': return carMine ? msg('rMistakeBig') : null;
      case 'spin': return msg('rSpin');
      case 'pass':
        if (carMine) return msg('rPassMine');
        if (otherMine) return msg('rPassedMine', {}, true);
        return null;
      case 'duelFail': return carMine || otherMine ? msg('rDuelFail', {}, carMine || otherMine) : null;
      case 'crash': return msg('rCrash', {}, carMine || otherMine);
      case 'wingDamage': return msg('rWing');
      case 'tyresWorn': {
        if (!car) return null;
        const key = `${car.id}-${car.stops}`;
        if (wornShown.has(key)) return null;
        wornShown.add(key);
        return msg('rWorn', { cond: e.data?.cond ?? 0 });
      }
      case 'penalty': return carMine ? msg('rPenalty') : null;
      case 'win': return msg('rWin', {}, true);
      case 'finish': return carMine ? msg('rFinish') : null;
      default: return null;
    }
  }

  updateUI();
  requestAnimationFrame(frame);
}

/** Default tyre for the next stop: a different dry compound than the current one. */
function suggestTyre(c: Car): Tyre {
  if (c.tyre === 'W') return 'M';
  return c.tyre === 'S' ? 'M' : 'S';
}

function cardHTML(c: Car, i: number): string {
  return `<div class="panel dcard" style="border-left-color:${c.color}">
    <div class="crow"><span class="cpos" id="cpos${i}">P${c.grid}</span><span class="cname">#${c.num} ${esc(c.name)}</span><span id="cty${i}"></span></div>
    <div class="wbar"><i id="cwb${i}"></i></div>
    <div class="cinfo" id="cinfo${i}"></div>
    <div class="seg modes">${[0, 1, 2, 3]
      .map((k) => `<button data-act="mode" data-d="${i}" data-v="${k}" id="cm${i}_${k}"><span>${MODE_ICON[k]}</span>${t(`mode${k}` as StringKey)}</button>`)
      .join('')}</div>
    <div class="seg mt">${TYRES.map(
      (k) => `<button class="tb" data-act="sel" data-d="${i}" data-v="${k}" id="cs${i}_${k}" aria-label="${tyreName(k)}">${tyreIcon(k)}</button>`,
    ).join('')}
      <button class="boxb" data-act="box" data-d="${i}" id="cb${i}">${t('box')}</button></div>
    <div class="cwarn" id="cw${i}"></div>
  </div>`;
}
