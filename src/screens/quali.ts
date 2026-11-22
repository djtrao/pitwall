/**
 * Hot Lap qualifying (SPEC section 6).
 * Each of your drivers gets 2 flying laps: driver 1 run 1, driver 2 run 1, then the second runs.
 * Before each key corner: Safe / Attack / Send it! (3 s, default Safe), then tap the timing bar.
 * The best lap counts; each driver starts the race on the tyre of his best lap.
 */
import { getLang, num, t, type StringKey } from '../i18n';
import {
  aiSession,
  baseHotLap,
  cornerResult,
  crossoverWetness,
  gridFromQualifying,
  hitAt,
  markerAt,
  randomCentre,
  hotLapTime,
  leaderboard,
  makeRng,
  QUALI,
  rand,
  zonesFor,
  type CarSetup,
  type CornerResult,
  type CornerRisk,
  type Difficulty,
  type QualiRun,
  type Track,
  type Tuning,
  type Tyre,
  type Weather,
} from '../sim';
import { $, esc, shortName, tyreIcon, tyreName } from '../ui/common';
import { fullscreenButton, wireFullscreen } from '../ui/fullscreen';
import { TrackView } from '../ui/trackview';

const TYRES: Tyre[] = ['S', 'M', 'H', 'W'];
/** Seconds for a full lap at normal driving speed (prompts slow the car down). */
const DRIVE_SECONDS = 9;
const SLOW = 0.1;
/** Prompt appears this far (lap share) before a corner. */
const APPROACH = 0.06;
const RISK_ICON = ['🛡️', '⚡', '🔥'];

function loadDifficulty(): Difficulty {
  try {
    return localStorage.getItem('pitwall-difficulty') === 'pro' ? 'pro' : 'rookie';
  } catch {
    return 'rookie';
  }
}
function saveDifficulty(d: Difficulty) {
  try {
    localStorage.setItem('pitwall-difficulty', d);
  } catch {
    /* ignore */
  }
}

export interface QualiContext {
  track: Track;
  weather: Weather;
  tuning: Tuning;
  seed: number;
  cars: CarSetup[];
}

export function qualiScreen(app: HTMLElement, ctx: QualiContext, onDone: (grid: CarSetup[]) => void): void {
  const { track, tuning } = ctx;
  const wet = ctx.weather.quali * 100;
  const cross = Math.round(crossoverWetness(tuning));
  const mine = ctx.cars.filter((c) => c.human).sort((a, b) => a.id.localeCompare(b.id));
  const order = [0, 1].flatMap((run) => mine.map((car) => ({ car, run })));
  const aiRuns = aiSession(ctx.cars, track, ctx.weather, tuning, ctx.seed);
  const myRuns: QualiRun[] = [];
  const rng = makeRng(ctx.seed, 10);
  let difficulty = loadDifficulty();
  let step = 0; // index in `order`
  let tyre: Tyre = wet > cross ? 'W' : 'S';

  // lap state
  type Phase = 'pick' | 'drive' | 'choose' | 'timing' | 'feedback' | 'lapdone' | 'done';
  let phase: Phase = 'pick';
  let f = -0.04;
  let nextCorner = 0;
  let corners: CornerResult[] = [];
  let risk: CornerRisk = 0;
  let centre = 0.5;
  let phaseStart = 0;
  let tapPos: number | null = null;
  let running = true;
  let last = performance.now();

  document.body.classList.add('racing');
  app.innerHTML = `
    <div class="race quali">
      <div class="r-bar">
        <div class="r-lap"><span class="mut small">${esc(track.name)} · ${t('quali')}</span><b id="qstep"></b></div>
        <div class="r-wx"><span class="small">${wet > 5 ? t('qWet', { w: Math.round(wet) }) : t('qHowTo')}</span></div>
        ${fullscreenButton(t('fullscreen'))}
      </div>
      <div class="r-tower" id="tower"></div>
      <div class="r-track" id="cvp">
        <canvas id="cv"></canvas>
        <div class="qoverlay" id="qov"></div>
      </div>
      <div class="r-cards" id="qpanel"></div>
      <div class="r-rotate">${t('rotateHint')}</div>
    </div>`;

  const tv = new TrackView($('cv') as HTMLCanvasElement, track);
  const onResize = () => requestAnimationFrame(() => tv.fit());
  window.addEventListener('resize', onResize);
  const unwireFs = wireFullscreen(app, onResize);

  const current = () => order[step];
  const allRuns = () => {
    // AI laps appear as the session goes on: first runs after your first pair, second runs at the end
    const done = myRuns.length;
    const aiVisible = aiRuns.filter((r) => (r.run === 0 ? done >= 2 : done >= 4));
    return [...aiVisible, ...myRuns];
  };

  /* ---------- panels ---------- */
  function renderTower() {
    const lb = leaderboard(ctx.cars, allRuns());
    const best = lb[0]?.best ?? null;
    $('tower').innerHTML = `<table>${lb
      .map((e, i) => {
        const c = e.car;
        const gap = e.best === null ? `<span class="mut">${e.runs.length ? t('qNoTime') : '–'}</span>` : i === 0 ? lapTime3(e.best) : `+${num(e.best - best!, 3)}`;
        return `<tr class="${c.human ? 'me' : ''}${phase !== 'pick' && phase !== 'done' && current()?.car.id === c.id ? ' follow' : ''}">
          <td class="p">${i + 1}</td>
          <td class="n"><span class="chip" style="background:${c.color}"></span><span class="nm">${esc(surname(c.name))}</span><span class="code">${shortName(c.name)}</span></td>
          <td class="ty">${e.best !== null ? tyreIcon(e.bestTyre, true) : ''}</td><td class="g">${gap}</td></tr>`;
      })
      .join('')}</table>`;
  }

  function renderPanel() {
    const panel = $('qpanel');
    $('qstep').textContent = phase === 'done' ? t('qOver') : t('qSession', { n: step + 1 });
    if (phase === 'done') {
      panel.innerHTML = `<div class="dcard qcard"><h3>${t('qOver')}</h3><p class="hint">${t('qGridTyre')}</p>
        <button class="big" id="torace">${t('qToRace')}</button></div>`;
      $('torace').onclick = finish;
      return;
    }
    const { car, run } = current();
    const firstTyre = run > 0 ? myRuns.find((r) => r.carId === car.id && r.run === 0)?.tyre : undefined;
    const bestMine = myRuns.filter((r) => r.carId === car.id && r.time !== null).reduce<number | null>((b, r) => (b === null || r.time! < b ? r.time! : b), null);
    panel.innerHTML = `<div class="dcard qcard" style="border-left-color:${car.color}">
      <div class="crow"><span class="cname">${esc(t('qDriverRun', { num: car.num, name: surname(car.name), run: run + 1 }))}</span></div>
      <div class="cinfo">${bestMine !== null ? `⏱️ ${lapTime3(bestMine)}` : '&nbsp;'}</div>
      ${
        phase === 'pick'
          ? `<h3>${t('qPickTyre')}</h3>
        <div class="seg qtyres">${TYRES.map(
          (k) => `<button class="tb ${k === tyre ? 'on' : ''}" data-tyre="${k}">${tyreIcon(k)}<small>${tyreName(k)}${k === firstTyre ? `<br><em>${t('qUsed')}</em>` : ''}</small></button>`,
        ).join('')}</div>
        <div class="seg mt qdiff"><button data-diff="rookie" class="${difficulty === 'rookie' ? 'on' : ''}">${t('rookie')}</button><button data-diff="pro" class="${difficulty === 'pro' ? 'on' : ''}">${t('pro')}</button></div>
        <button class="big" id="qgo">${t('qGo')}</button>`
          : `<div class="qcorners">${track.corners
              .map((cn, i) => {
                const r = corners[i];
                const mark = r ? (r.deleted ? '❌' : r.hit === 'green' ? '🟢' : r.hit === 'yellow' ? '🟡' : '🔴') : i === nextCorner ? '👉' : '⚪';
                const d = r && !r.deleted ? ` ${r.delta > 0 ? '+' : r.delta < 0 ? '−' : '±'}${num(Math.abs(r.delta), 2)} s` : '';
                return `<div>${mark} ${esc(cn.name)}${d}</div>`;
              })
              .join('')}</div>
             <div class="hint">${tyreIcon(tyre, true)} ${tyreName(tyre)}</div>`
      }
    </div>`;
    panel.querySelectorAll<HTMLButtonElement>('[data-tyre]').forEach((b) => (b.onclick = () => ((tyre = b.dataset.tyre as Tyre), renderPanel())));
    panel.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach(
      (b) => (b.onclick = () => ((difficulty = b.dataset.diff as Difficulty), saveDifficulty(difficulty), renderPanel())),
    );
    const go = document.getElementById('qgo');
    if (go) go.onclick = startLap;
  }

  /* ---------- the lap ---------- */
  function startLap() {
    phase = 'drive';
    f = -0.04;
    nextCorner = 0;
    corners = [];
    $('qov').innerHTML = `<div class="qbadge">${t('qFlying')}</div>`;
    renderPanel();
    renderTower();
  }

  function showChoice() {
    phase = 'choose';
    phaseStart = performance.now();
    const cn = track.corners[nextCorner];
    $('qov').innerHTML = `<div class="qprompt">
      <div class="duel-title">${esc(t('qCorner', { n: nextCorner + 1, name: cn.name }))}</div>
      <div class="duel-time"><i id="qbar"></i></div>
      <div class="duel-opts">${[0, 1, 2]
        .map((k) => `<button data-risk="${k}" class="risk-${k * 2}"><span class="dc-name">${RISK_ICON[k]} ${t(`qRisk${k}` as StringKey)}</span><span class="dc-chance">${t(`qRiskInfo${k}` as StringKey)}</span></button>`)
        .join('')}</div></div>`;
    $('qov').querySelectorAll<HTMLButtonElement>('[data-risk]').forEach((b) => (b.onclick = () => showTiming(Number(b.dataset.risk) as CornerRisk)));
  }

  function showTiming(r: CornerRisk) {
    if (phase !== 'choose') return;
    risk = r;
    phase = 'timing';
    phaseStart = performance.now();
    tapPos = null;
    centre = randomCentre(rngNext());
    const z = zonesFor(risk, tyre, wet, centre);
    const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
    $('qov').innerHTML = `<div class="qtiming" id="qtap">
      <div class="duel-title">${RISK_ICON[risk]} ${t('qTap')}</div>
      <div class="qtbar">
        <i class="y" style="left:${pct(z.centre - z.outer)};width:${pct(z.outer * 2)}"></i>
        <i class="g" style="left:${pct(z.centre - z.green)};width:${pct(z.green * 2)}"></i>
        <b id="qmark"></b>
      </div></div>`;
    $('qtap').onpointerdown = (e) => {
      e.preventDefault();
      if (phase !== 'timing') return;
      tapPos = markerPos();
      judge();
    };
  }

  const markerPos = () => markerAt((performance.now() - phaseStart) / 1000, difficulty);

  function judge() {
    const hit = hitAt(tapPos, zonesFor(risk, tyre, wet, centre));
    const res = cornerResult(risk, hit, rngNext());
    corners.push(res);
    phase = 'feedback';
    phaseStart = performance.now();
    const label = res.deleted ? t('qLapDeleted') : hit === 'green' ? t('qGreen') : hit === 'yellow' ? t('qYellow') : t('qMiss');
    const d = res.deleted ? '' : `${res.delta > 0 ? '+' : res.delta < 0 ? '−' : '±'}${num(Math.abs(res.delta), 2)} s`;
    $('qov').innerHTML = `<div class="qfeedback ${res.deleted ? 'miss' : hit}"><b>${label}</b><span>${d}</span></div>`;
    nextCorner++;
    renderPanel();
  }

  const rngNext = () => rand(rng);

  function finishLap() {
    const { car, run } = current();
    const first = myRuns.find((r) => r.carId === car.id && r.run === 0);
    const used = run > 0 && first?.tyre === tyre;
    const prevBest = myRuns.filter((r) => r.carId === car.id && r.time !== null).reduce<number | null>((b, r) => (b === null || r.time! < b ? r.time! : b), null);
    const time = hotLapTime(baseHotLap(car, tyre, wet, track, tuning, used), corners, rng);
    myRuns.push({ carId: car.id, run, tyre, corners, time });
    phase = 'lapdone';
    const lb = leaderboard(ctx.cars, allRuns());
    const pos = lb.findIndex((e) => e.car.id === car.id) + 1;
    let comment: string;
    const missIdx = corners.findIndex((c) => c.hit === 'miss');
    if (time === null) comment = t('qLapDeleted');
    else if (prevBest !== null && time < prevBest) comment = t('qBest');
    else if (corners.every((c) => c.hit === 'green') && corners.some((c) => c.risk > 0)) comment = t('qGreat');
    else if (missIdx >= 0) comment = t('qMistake', { n: missIdx + 1 });
    else comment = t('qSolid');
    $('qov').innerHTML = `<div class="qresult">
      <b>${time === null ? '–:––.–––' : lapTime3(time)}</b>
      <span>${comment}</span>
      ${time !== null || prevBest !== null ? `<span class="mut">${t('qPlace', { p: pos })}</span>` : ''}
      <button class="big" id="qnext">${step + 1 >= order.length ? t('qOver') : t('qNext')}</button></div>`;
    $('qnext').onclick = nextRun;
    renderTower();
    renderPanel();
  }

  function nextRun() {
    step++;
    $('qov').innerHTML = '';
    if (step >= order.length) {
      phase = 'done';
    } else {
      phase = 'pick';
      const { car, run } = current();
      // second run: keep the first run's tyre selected
      const prev = myRuns.find((r) => r.carId === car.id && r.run === run - 1);
      tyre = prev?.tyre ?? (wet > cross ? 'W' : 'S');
    }
    renderPanel();
    renderTower();
  }

  function finish() {
    running = false;
    unwireFs();
    window.removeEventListener('resize', onResize);
    document.body.classList.remove('racing');
    onDone(gridFromQualifying(ctx.cars, [...aiRuns, ...myRuns]));
  }

  /* ---------- per frame ---------- */
  function frame(now: number) {
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const driving = phase === 'drive' || phase === 'choose' || phase === 'timing' || phase === 'feedback';
    if (driving) {
      const slow = phase === 'choose' || phase === 'timing';
      f += (dt / DRIVE_SECONDS) * (slow ? SLOW : 1);
      if (phase === 'drive' && nextCorner < 3 && f >= track.corners[nextCorner].at - APPROACH) showChoice();
      if (phase === 'choose') {
        const left = 1 - (now - phaseStart) / 1000 / QUALI.chooseSeconds;
        const bar = document.getElementById('qbar');
        if (bar) bar.style.width = `${Math.max(0, left) * 100}%`;
        if (left <= 0) showTiming(0); // default Safe
      }
      if (phase === 'timing') {
        const p = markerPos();
        const m = document.getElementById('qmark');
        if (m) m.style.left = `${p * 100}%`;
        if (p >= 1) judge(); // no tap: miss
      }
      if (phase === 'feedback' && now - phaseStart > 700) {
        phase = 'drive';
        $('qov').innerHTML = corners.some((c) => c.deleted) ? `<div class="qbadge bad">${t('qLapDeleted')}</div>` : `<div class="qbadge">${t('qFlying')}</div>`;
      }
      if (phase === 'drive' && f >= 1) finishLap();
    }
    const car = current()?.car ?? mine[0];
    tv.drawHotLap(Math.min(f, 1), car.color, String(car.num), wet, phase === 'pick' || phase === 'done' ? null : nextCorner < 3 ? nextCorner : null, ctx.weather.quali);
    requestAnimationFrame(frame);
  }

  renderPanel();
  renderTower();
  requestAnimationFrame(() => {
    tv.fit();
    requestAnimationFrame(frame);
  });
}

function surname(name: string): string {
  const w = name.trim().split(/\s+/);
  return w[w.length - 1] || name;
}

/** Qualifying lap time with 3 decimals, like 1:17,532 / 1:17.532 */
function lapTime3(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec - m * 60).toFixed(3).padStart(6, '0');
  return `${m}:${getLang() === 'de' ? s.replace('.', ',') : s}`;
}
