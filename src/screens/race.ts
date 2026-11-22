import { lapTime, num, t, type StringKey } from '../i18n';
import {
  applyCommand,
  duelPreview,
  crossoverWetness,
  forecastBlocks,
  leaderLap,
  standings,
  step,
  tyreRuleOk,
  type Car,
  type Command,
  type Duel,
  type DuelAttack,
  type DuelDefend,
  type Mode,
  type RaceEvent,
  type RaceState,
  type Tyre,
} from '../sim';
import { $, esc, shortName, tyreIcon, tyreName } from '../ui/common';
import { fullscreenButton, wireFullscreen } from '../ui/fullscreen';
import { DuelView } from '../ui/duelview';
import { pitRating, runPitGame } from '../ui/pitgame';
import { TrackView } from '../ui/trackview';

const TICK = 0.1; // real seconds per simulation tick (same as the server later)
const MODE_ICON = ['🐢', '➖', '🔥', '💥'];
const TYRES: Tyre[] = ['S', 'M', 'H', 'W'];
const TICKER_SECONDS = 6;

/** Where the race comes from: the local simulation (single player) or the server (multiplayer). */
export interface RaceSource {
  /** Current race state (a newer snapshot may replace it). */
  readonly race: RaceState;
  /** Team id of the cars this phone controls. */
  myTeam: string;
  command(cmd: Command): void;
  /** Called every frame. Local: runs the simulation (10 ticks per real second). */
  advance(dt: number, speed: number): void;
  /** Interpolated distance of a car, for smooth drawing. */
  dist(c: Car): number;
  /** Speed buttons: local = pause/1×/2×/4×, host = pause/1×/2× (multiplayer host), none = no buttons. */
  speedMode: 'local' | 'host' | 'none';
  setSpeed?(speed: number): void;
  /** Multiplayer: current speed and pause state set by the host. */
  hostSpeed?(): number;
}

/** Single player: the race runs here on the phone. */
export function localRace(race: RaceState, myTeam = 'me'): RaceSource {
  let acc = 0;
  const prev = new Map<string, number>(race.cars.map((c) => [c.id, c.dist]));
  return {
    race,
    myTeam,
    speedMode: 'local',
    command: (cmd) => void applyCommand(race, cmd),
    advance(dt, speed) {
      if (race.over || speed <= 0) return;
      // always 10 ticks per real second; a faster race takes bigger steps (like the server)
      race.speed = speed;
      acc += dt;
      let n = 0;
      while (acc >= TICK && n < 100) {
        for (const c of race.cars) prev.set(c.id, c.dist);
        step(race, TICK);
        acc -= TICK;
        n++;
      }
    },
    dist(c) {
      const alpha = race.over ? 1 : Math.min(1, acc / TICK);
      const p = prev.get(c.id) ?? c.dist;
      return Math.abs(c.dist - p) > 0.1 ? c.dist : p + (c.dist - p) * alpha;
    },
  };
}

/**
 * The race screen.
 * Landscape (phone held sideways): timing tower left, track centre, driver cards right, bar at the bottom.
 * Portrait: everything stacked. The layout itself is pure CSS (see .race in style.css).
 */
/** Returns a function that stops the screen (used by multiplayer when the server moves on). */
export function raceScreen(app: HTMLElement, src: RaceSource, onDone: () => void): () => void {
  let race = src.race;
  const mineIds = race.cars.filter((c) => c.teamId === src.myTeam).map((c) => c.id).sort();
  // always the current Car objects (multiplayer snapshots replace them)
  const mineCars = () => mineIds.map((id) => race.cars.find((c) => c.id === id)!);
  let mine = mineCars();
  const isMine = (c: Car) => c.teamId === src.myTeam;
  const cross = Math.round(crossoverWetness(race.tuning));
  // tyre the player has selected for the next stop, per driver
  const sel = new Map<string, Tyre>(mine.map((c) => [c.id, suggestTyre(c)]));
  let speed = 1;
  let last = performance.now();
  let uiTimer = 0;
  let lastEvent = 0;
  let bannerShown = false;
  let running = true;
  let tickerUntil = 0;
  const wornShown = new Set<string>();

  document.body.classList.add('racing');
  app.innerHTML = `
    <div class="race">
      <div class="r-bar">
        <div class="r-lap"><span class="mut small">${esc(race.track.name)}</span><b id="lapc"></b></div>
        <div class="r-wx" id="wxbar"></div>
        <div class="seg r-speed" id="spd">${(src.speedMode === 'local' ? [0, 1, 2, 4] : src.speedMode === 'host' ? [0, 1, 2] : [])
          .map((s) => `<button data-s="${s}" class="${s === (src.hostSpeed?.() ?? 1) ? 'on' : ''}" aria-label="${s ? `${s}×` : t('pause')}">${s ? `${s}×` : '❚❚'}</button>`)
          .join('')}</div>
        ${fullscreenButton(t('fullscreen'))}
      </div>
      <div class="r-tower" id="tower"></div>
      <div class="r-track" id="cvp">
        <canvas id="cv"></canvas>
        <div id="scb"></div>
        <div class="ticker" id="ticker"></div>
        <div class="duelzone" id="duelzone"><canvas id="dcv"></canvas><div class="duel" id="duel"></div></div>
        <div class="pitgame" id="pitgame"></div>
        <div id="banner"><b>${t('chequered')}</b><button class="big" id="tores">${t('seeResults')}</button></div>
      </div>
      <div class="r-cards" id="cards">${mine.map((c, i) => cardHTML(c, i)).join('')}</div>
      <div class="r-wxfull panel" id="wx"></div>
      <div class="r-log panel" id="log"><h3>${t('radio')}</h3><div id="msgs"><div class="msg mine">${t('rLightsOut')}</div><div class="msg mine">${t('followHint')}</div></div></div>
      <div class="r-rotate">${t('rotateHint')}</div>
    </div>`;

  const tv = new TrackView($('cv') as HTMLCanvasElement, race.track);
  const onResize = () =>
    requestAnimationFrame(() => {
      tv.fit();
      if (active) dv.fit();
    });
  window.addEventListener('resize', onResize);
  screen.orientation?.addEventListener?.('change', onResize);

  $('spd').onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    speed = Number(b.dataset.s);
    src.setSpeed?.(speed);
    $('spd').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  };
  const unwireFs = wireFullscreen(app, onResize);

  $('cards').onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!b) return;
    const c = mine[Number(b.dataset.d)];
    if (b.dataset.act === 'follow') {
      follow(tv.followId === c.id ? null : c.id);
      return;
    }
    if (c.status === 'finished' || c.status === 'dnf') return;
    const v = b.dataset.v!;
    if (b.dataset.act === 'mode') src.command({ type: 'mode', car: c.id, mode: Number(v) as Mode });
    if (b.dataset.act === 'sel') {
      // tap cycles Soft → Medium → Hard → Rain
      const next = TYRES[(TYRES.indexOf(sel.get(c.id)!) + 1) % TYRES.length];
      sel.set(c.id, next);
      if (c.pitPlan) src.command({ type: 'pit', car: c.id, tyre: next });
    }
    if (b.dataset.act === 'box') src.command({ type: 'pit', car: c.id, tyre: c.pitPlan ? null : sel.get(c.id)! });
    updateUI();
  };

  // tap a timing tower row to follow that car, tap again (or the track) to see the whole track
  $('tower').onclick = (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-follow]');
    if (row) follow(tv.followId === row.dataset.follow ? null : row.dataset.follow!);
  };
  $('cv').onclick = () => follow(null);

  function follow(id: string | null) {
    tv.followId = id;
    // duel prompts only for the car you are watching; the other car decides by itself
    for (const c of mine) src.command({ type: 'autoDuel', car: c.id, on: c.id !== id });
    mine.forEach((c, i) => $(`cfollow${i}`).classList.toggle('on', c.id === id));
    updateUI();
  }

  function stop() {
    running = false;
    unwireFs();
    window.removeEventListener('resize', onResize);
    screen.orientation?.removeEventListener?.('change', onResize);
    document.body.classList.remove('racing');
  }
  $('tores').onclick = () => {
    stop();
    onDone();
  };

  /* ---------- per-frame loop ---------- */
  const frame = (now: number) => {
    if (!running) return;
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    // single player at 4×: slow to 2× while the pit stop game runs, so the stop does not end before you finish
    src.advance(dt, pitPlaying ? Math.min(speed, 2) : speed);
    race = src.race;
    mine = mineCars();
    tv.drawRace(race, (c) => src.dist(c), isMine);
    updateDuel();
    updatePitGame();
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

  /* ---------- duel close-up (only while following one of your cars) ---------- */
  const dv = new DuelView($('dcv') as HTMLCanvasElement);
  let active: { id: number; carId: string; attacking: boolean; playing: boolean } | null = null;

  function closeDuel() {
    active = null;
    $('duelzone').classList.remove('show');
  }

  function updateDuel() {
    const id = tv.followId;
    const followingMine = !!id && mine.some((c) => c.id === id);
    if (!active) {
      if (!followingMine) return;
      const d = race.duels.find((x) => x.state === 'choosing' && x.prompted && (x.attacker === id || x.defender === id));
      if (!d) return;
      const attacking = d.attacker === id;
      if ((attacking ? d.attack : d.defend) !== null) return;
      active = { id: d.id, carId: id!, attacking, playing: false };
      const att = race.cars.find((c) => c.id === d.attacker)!;
      const def = race.cars.find((c) => c.id === d.defender)!;
      $('duelzone').classList.add('show');
      dv.start(tv.sceneAt(d.at), { color: att.color, num: att.num }, { color: def.color, num: def.num });
      renderDuelChoices(d, attacking ? def : att);
    }
    const d = race.duels.find((x) => x.id === active!.id);
    if (!d || d.outcome === 'cancelled' || (active.carId !== tv.followId && !active.playing)) {
      closeDuel();
      return;
    }
    if (d.state === 'choosing') {
      const left = Math.max(0, d.deadline - race.realTime) / race.tuning.duel.answerSeconds;
      const bar = document.getElementById('duelbar');
      if (bar) bar.style.width = `${left * 100}%`;
    } else if (!active.playing && d.outcome) {
      active.playing = true;
      $('duel').innerHTML = '';
      const caption = { pass: t('outPass'), fail: t('outHeld'), crash: t('outCrash'), spin: t('outSpin'), off: t('outOff'), wait: t('outWait') }[d.outcome as 'pass'];
      dv.play(d.outcome, caption ?? '', race.tuning.duel.showSeconds);
    }
    dv.draw();
    if (active.playing && dv.finished) closeDuel();
  }

  function renderDuelChoices(d: Duel, other: Car) {
    const opts = duelPreview(race, d, active!.carId);
    const attacking = active!.attacking;
    const box = $('duel');
    box.innerHTML = `
      <div class="duel-title">${esc(t(attacking ? 'duelAttack' : 'duelDefend', { other: `#${other.num} ${surname(other.name)}` }))}</div>
      <div class="duel-time"><i id="duelbar"></i></div>
      <div class="duel-opts">${opts.map((o) => duelButton(o.choice, o.success, o.risk, attacking)).join('')}</div>`;
    box.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((b) => {
      b.onclick = () => {
        src.command({ type: 'duel', duel: d.id, car: active!.carId, choice: Number(b.dataset.choice) as DuelAttack | DuelDefend });
        box.innerHTML = `<div class="duel-title">${t('duelWaiting')}</div>`;
      };
    });
  }

  /* ---------- pit stop game ---------- */
  const pitQueue: Car[] = [];
  const pitSeen = new Set<string>();
  let pitPlaying = false;

  function updatePitGame() {
    for (const c of mine) {
      const key = `${c.id}-${c.stops}`;
      if (c.status === 'pit' && c.pitAwait && !pitSeen.has(key)) {
        pitSeen.add(key);
        pitQueue.push(c);
      }
    }
    if (pitPlaying || !pitQueue.length) return;
    const c = pitQueue.shift()!;
    if (c.status !== 'pit' || !c.pitAwait) return;
    pitPlaying = true;
    runPitGame(
      $('pitgame'),
      esc(t('pitTitle', { car: `#${c.num} ${surname(c.name)}` })),
      race.tuning.pit.avgStop,
      (r) => {
        src.command({ type: 'pitStop', car: c.id, seconds: r.seconds, unsafe: r.unsafe });
      },
      () => (pitPlaying = false),
      [...(c.wingDamage ? (['fw'] as const) : []), ...(c.engineDamage ? (['en'] as const) : [])],
    );
  }

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
    if (performance.now() > tickerUntil) $('ticker').classList.remove('show');
  }

  function updateCard(c: Car, i: number, st: Car[]) {
    const pos = st.indexOf(c);
    $(`cpos${i}`).textContent = `P${pos + 1}`;
    $(`cty${i}`).innerHTML = `${tyreIcon(c.tyre)} <b>${Math.round(c.cond * 100)}%</b>`;
    // damage always visible in the card head (also in fullscreen)
    $(`cdmg${i}`).innerHTML = damageBadges(c);
    $(`cdmg${i}`).parentElement!.parentElement!.classList.toggle('damaged', c.wingDamage || c.engineDamage);
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
      if (ahead && ahead.status === 'running') info += ` · ▲ ${gap(ahead, c)}`;
      if (behind && behind.status === 'running') info += ` · ▼ ${gap(c, behind)}`;
    }
    $(`cinfo${i}`).textContent = info;
    for (let k = 0; k < 4; k++) $(`cm${i}_${k}`).classList.toggle('on', c.mode === k);
    $(`cs${i}`).innerHTML = `${tyreIcon(sel.get(c.id)!)}<small>${tyreName(sel.get(c.id)!)}</small>`;
    const bb = $(`cb${i}`);
    bb.classList.toggle('on', !!c.pitPlan);
    bb.textContent = c.pitPlan ? t('boxing') : t('box');

    // most important first: in landscape only the first line is visible
    const warn: string[] = [];
    if (c.status === 'running' || c.status === 'pit') {
      if (c.pitPlan) warn.push(t('boxPlanned', { tyre: tyreName(c.pitPlan) }));
      if (c.status === 'running') {
        if (c.cond < race.tuning.cliffAt + 0.05) warn.push(t('warnWorn'));
        if (c.tyre !== 'W' && race.wetness > cross + 5) warn.push(t('warnWet'));
        if (c.tyre === 'W' && race.wetness < cross - 8 && race.rainNow === 0) warn.push(t('warnDry'));
      }
      if (c.penalty > 0) warn.push(t('warnPenalty', { s: c.penalty }));
      if (!tyreRuleOk(c.usedTyres) && !(c.pitPlan && !c.usedTyres.includes(c.pitPlan))) warn.push(t('warnRule'));
      if (c.status === 'running') {
        if (c.wingDamage) warn.push(t('warnWing'));
        if (c.engineDamage) warn.push(t('warnEngine'));
        if (c.flatSpot) warn.push(t('warnFlat'));
      }
    }
    const w = $(`cw${i}`);
    w.innerHTML = warn.map((x) => `<div>${esc(x)}</div>`).join('');
    w.title = warn.join('\n');
  }

  function updateWeather() {
    const r = race.rainNow;
    const now = leaderLap(race) - 1;
    const blocks = forecastBlocks(race.track, race.weather, now).filter((b) => b.toLap > now).slice(0, 4);
    const icon = r > 0.55 ? '🌧️' : r > 0 ? '🌦️' : race.wetness > 5 ? '⛅' : '☀️';
    const state = r > 0.55 ? t('heavyRain') : r > 0 ? t('lightRain') : race.wetness > 5 ? t('dryWet') : t('dry');
    const bar = `<div class="wetbar"><i style="width:${race.wetness}%"></i><span class="x" style="left:${cross}%"></span></div>`;
    // compact version for the bottom bar (landscape)
    $('wxbar').innerHTML = `
      <span class="wx-icon">${icon}</span>
      <div class="wx-wet" title="${t('crossover', { w: cross })}"><span class="small">${t('wetness')} <b>${Math.round(race.wetness)} %</b></span>${bar}</div>
      <div class="wx-fc">${blocks
        .slice(0, 3)
        .map((b) => `<span><small>${t('lapShort')}${b.fromLap === b.toLap ? b.fromLap : `${b.fromLap}–${b.toLap}`}</small><b>${b.chance}%</b></span>`)
        .join('')}</div>`;
    // full panel (portrait)
    $('wx').innerHTML = `<h3>${t('weather')}</h3>
      <div><b>${state}</b> · ${t('wetness')} <b>${Math.round(race.wetness)} %</b></div>
      ${bar}
      <div class="hint">${t('crossover', { w: cross })}</div>
      <div class="hint mt">${t('forecast')}:</div>
      <div class="fc">${blocks.map((b) => `<div class="fcb"><small>${t('lap')} ${b.fromLap === b.toLap ? b.fromLap : `${b.fromLap}–${b.toLap}`}</small><b>${b.chance} %</b></div>`).join('')}</div>`;
  }

  function updateTower(st: Car[], leader: Car) {
    const rows = st.map((c, i) => {
      let gap: string;
      if (c.status === 'dnf') gap = t('dnf');
      else if (c.status === 'pit') gap = `<b class="pitflag">${t('pit')}</b>`;
      else if (i === 0) gap = c.status === 'finished' ? '🏁' : t('leader');
      else if (c.status === 'finished' && leader.status === 'finished') gap = c.lap < leader.lap ? t('lapped') : `+${num(c.finishTime - leader.finishTime)}`;
      else if (leader.dist - c.dist >= 1) gap = t('lapped');
      else gap = `+${num(Math.max(0, (leader.dist - c.dist) * c.lapTime))}`;
      const flag = (c.wingDamage ? '🪛' : '') + (c.engineDamage ? '⚙️' : '') + (c.status === 'running' && c.loss > 0 ? '⚠️' : c.pitPlan ? '📻' : '');
      const followed = tv.followId === c.id ? ' follow' : '';
      return `<tr class="${isMine(c) ? 'me' : ''}${followed}" data-follow="${c.id}"><td class="p">${i + 1}</td>
        <td class="n"><span class="chip" style="background:${c.color}"></span><span class="tn">${c.num}</span><span class="nm">${esc(surname(c.name))}</span>${c.penalty ? `<span class="pen">+${c.penalty}s</span>` : ''}<span class="code">${shortName(c.name)}</span>${flag}</td>
        <td class="ty">${tyreIcon(c.tyre, true)}</td><td class="g">${gap}</td></tr>`;
    });
    $('tower').innerHTML = `<table>${rows.join('')}</table>`;
  }

  function updateRadio() {
    const fresh = race.events.filter((e) => e.id > lastEvent);
    if (!fresh.length) return;
    lastEvent = fresh[fresh.length - 1].id;
    const box = $('msgs');
    let newest: { text: string; mine: boolean } | null = null;
    for (const e of fresh) {
      const m = radio(e);
      if (!m) continue;
      const line = `${t('lap')} ${e.lap} · ${m.text}`;
      const d = document.createElement('div');
      d.className = `msg${m.mine ? ' mine' : ''}`;
      d.textContent = line;
      box.prepend(d);
      newest = m;
    }
    while (box.childElementCount > 12) box.lastElementChild!.remove();
    if (newest) {
      const tk = $('ticker');
      tk.textContent = `📻 ${newest.text}`;
      tk.classList.toggle('mine', newest.mine);
      tk.classList.add('show');
      tickerUntil = performance.now() + TICKER_SECONDS * 1000;
    }
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
      case 'duelSpin': return msg('rDuelSpin', {}, carMine || otherMine);
      case 'duelOff': return msg('rDuelOff', {}, carMine || otherMine);
      case 'pitStopTime': return carMine ? msg('rPitStop', { s: num(Number(e.data?.seconds)), rating: pitRating(Number(e.data?.seconds)) }) : null;
      case 'unsafeRelease': return carMine ? msg('rUnsafe', { s: e.data?.seconds ?? 5 }) : null;
      case 'duelFail': return carMine || otherMine ? msg('rDuelFail', {}, carMine || otherMine) : null;
      case 'crash': return msg('rCrash', {}, carMine || otherMine);
      case 'wingDamage': return msg('rWing');
      case 'engineDamage': return msg('rEngine');
      case 'tyresWorn': {
        if (!car) return null;
        const key = `${car.id}-${car.stops}`;
        if (wornShown.has(key)) return null;
        wornShown.add(key);
        return msg('rWorn', { cond: e.data?.cond ?? 0 });
      }
      case 'penalty': return carMine ? msg('rPenalty') : null;
      case 'win': return e.data?.penalty ? msg('rWinPenalty', { s: e.data.penalty }, true) : msg('rWin', {}, true);
      case 'finish': return carMine ? msg('rFinish') : null;
      default: return null;
    }
  }

  updateUI();
  // first tip in the ticker
  $('ticker').textContent = t('followHint');
  $('ticker').classList.add('show', 'mine');
  tickerUntil = performance.now() + 9000;
  requestAnimationFrame(() => {
    tv.fit();
    requestAnimationFrame(frame);
  });
  return stop;
}

const ATTACK_ICON = ['⏳', '🙂', '😤', '😈', '🎲'];
const DEFEND_ICON = ['👋', '🛡️', '💪', '🧱', '🚪'];
const RISK_ICON = ['🟢', '🟢', '🟡', '🟠', '🔴'];

/** One duel choice: name, chance and a risk symbol (colour + icon + word). */
function duelButton(level: number, success: number, risk: number, attacking: boolean): string {
  const r = risk < 0.005 ? 0 : risk < 0.04 ? 1 : risk < 0.1 ? 2 : risk < 0.25 ? 3 : 4;
  let chance: string;
  if (level === 0) chance = t(attacking ? 'chWait' : 'chLetGo');
  else chance = t(attacking ? 'chPass' : 'chHold', { p: Math.round(success * 100) });
  return `<button data-choice="${level}" class="risk-${r}">
    <span class="dc-name">${(attacking ? ATTACK_ICON : DEFEND_ICON)[level]} ${t(`${attacking ? 'att' : 'def'}${level}` as StringKey)}</span>
    <span class="dc-chance">${chance}</span>
    <span class="dc-risk">${RISK_ICON[r]} ${t(`risk${r}` as StringKey)}</span>
  </button>`;
}

function damageBadges(c: Car): string {
  const b: string[] = [];
  if (c.wingDamage) b.push(`<span class="dmg" title="${t('dmgWing')}">🪛</span>`);
  if (c.engineDamage) b.push(`<span class="dmg" title="${t('dmgEngine')}">⚙️</span>`);
  if (c.flatSpot) b.push(`<span class="dmg minor" title="${t('dmgFlat')}">🛞</span>`);
  return b.join('');
}

function surname(name: string): string {
  const w = name.trim().split(/\s+/);
  return w[w.length - 1] || name;
}

/** Default tyre for the next stop: a different dry compound than the current one. */
function suggestTyre(c: Car): Tyre {
  if (c.tyre === 'W') return 'M';
  return c.tyre === 'S' ? 'M' : 'S';
}

function cardHTML(c: Car, i: number): string {
  return `<div class="dcard" style="border-left-color:${c.color}">
    <div class="crow" data-act="follow" data-d="${i}" title="🎥">
      <span class="cpos" id="cpos${i}">P${c.grid}</span><span class="cname" title="${esc(c.name)}">#${c.num} ${esc(surname(c.name))}</span>
      <span class="cdmg" id="cdmg${i}"></span><span class="cty" id="cty${i}"></span><span class="cfollow" id="cfollow${i}">🎥</span>
    </div>
    <div class="wbar"><i id="cwb${i}"></i></div>
    <div class="cinfo" id="cinfo${i}"></div>
    <div class="cwarn" id="cw${i}"></div>
    <div class="seg modes">${[0, 1, 2, 3]
      .map((k) => `<button data-act="mode" data-d="${i}" data-v="${k}" id="cm${i}_${k}"><span>${MODE_ICON[k]}</span>${t(`mode${k}` as StringKey)}</button>`)
      .join('')}</div>
    <div class="seg pitrow">
      <button class="tb" data-act="sel" data-d="${i}" id="cs${i}" aria-label="${t('nextTyre')}"></button>
      <button class="boxb" data-act="box" data-d="${i}" id="cb${i}">${t('box')}</button>
    </div>
  </div>`;
}
