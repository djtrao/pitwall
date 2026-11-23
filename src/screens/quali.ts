/**
 * Hot Lap qualifying (SPEC section 6).
 * Each of your drivers gets one flying lap with 6 braking points (the 3 key corners and 3 more bends).
 * Before each one: Safe / Attack / Send it! (3 s, default Safe), then tap the timing bar.
 * Each driver starts the race on the tyre of his qualifying lap.
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
  qualiPoints,
  rand,
  realLapSeconds,
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
import { play } from '../ui/assets';

const TYRES: Tyre[] = ['S', 'M', 'H', 'W'];
/** Share of a race lap's real time for a hot lap without prompts (prompts slow the car down). */
const DRIVE_SHARE = 0.36;
const SLOW = 0.1;
/** Prompt appears this far (lap share) before a corner. */
const APPROACH = 0.045;
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
  /** Multiplayer: laps go to the server, the leaderboard comes from the server. */
  remote?: {
    myTeam: string;
    submit(run: QualiRun): void;
    /** Register for leaderboard updates (all visible runs, seconds left). */
    subscribe(cb: (runs: QualiRun[], left: number) => void): void;
  };
}

/** Returns a function that stops the screen (multiplayer: the server moves on). */
export function qualiScreen(app: HTMLElement, ctx: QualiContext, onDone: (grid: CarSetup[]) => void): () => void {
  const { track, tuning } = ctx;
  const wet = ctx.weather.quali * 100;
  const cross = Math.round(crossoverWetness(tuning));
  const driveSeconds = realLapSeconds(track, tuning) * DRIVE_SHARE;
  const remote = ctx.remote;
  const mine = ctx.cars.filter((c) => (remote ? c.teamId === remote.myTeam : c.human)).sort((a, b) => a.id.localeCompare(b.id));
  const order = Array.from({ length: QUALI.runs }, (_, run) => mine.map((car) => ({ car, run }))).flat();
  const points = qualiPoints(track);
  const aiRuns = remote ? [] : aiSession(ctx.cars, track, ctx.weather, tuning, ctx.seed);
  let serverRuns: QualiRun[] = [];
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
    if (remote) {
      // server list plus my laps that have not come back yet
      const known = new Set(serverRuns.map((r) => `${r.carId}/${r.run}`));
      return [...serverRuns, ...myRuns.filter((r) => !known.has(`${r.carId}/${r.run}`))];
    }
    // AI laps appear once your first driver has set a time
    const aiVisible = myRuns.length >= 1 ? aiRuns : [];
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
          <td class="n"><span class="chip" style="background:${c.color}"></span><span class="tn">${c.num}</span><span class="nm">${esc(surname(c.name))}</span><span class="code">${shortName(c.name)}</span></td>
          <td class="ty">${e.best !== null ? tyreIcon(e.bestTyre, true) : ''}</td><td class="g">${gap}</td></tr>`;
      })
      .join('')}</table>`;
  }

  function renderPanel() {
    const panel = $('qpanel');
    $('qstep').textContent = phase === 'done' ? t('qOver') : t('qSession', { n: step + 1 });
    if (phase === 'done') {
      panel.innerHTML = remote
        ? `<div class="dcard qcard"><h3>${t('qOver')}</h3><p class="hint">${t('mpWaitOthers')}</p><p class="hint" id="qleft"></p></div>`
        : `<div class="dcard qcard"><h3>${t('qOver')}</h3><p class="hint">${t('qGridTyre')}</p>
        <button class="big" id="torace">${t('qToRace')}</button></div>`;
      if (!remote) $('torace').onclick = finish;
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
          : `<div class="qcorners">${points
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
    const cn = points[nextCorner];
    $('qov').innerHTML = `<div class="qprompt">
      <div class="duel-title">${esc(t('qCorner', { n: nextCorner + 1, of: points.length, name: cn.name }))}</div>
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

  const markerPos = () => markerAt((performance.now() - phaseStart) / 1000, difficulty, risk);

  function judge() {
    const hit = hitAt(tapPos, zonesFor(risk, tyre, wet, centre));
    const res = cornerResult(risk, hit, rngNext());
    corners.push(res);
    phase = 'feedback';
    phaseStart = performance.now();
    play(res.deleted || hit === 'miss' ? 'bad' : hit === 'green' ? 'good' : 'select', 0.7);
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
    remote?.submit({ carId: car.id, run, tyre, corners, time });
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

  function stop() {
    running = false;
    unwireFs();
    window.removeEventListener('resize', onResize);
    document.body.classList.remove('racing');
  }

  function finish() {
    stop();
    onDone(gridFromQualifying(ctx.cars, [...aiRuns, ...myRuns]));
  }

  remote?.subscribe((runs, left) => {
    serverRuns = runs;
    if (!running) return;
    renderTower();
    const el = document.getElementById('qleft');
    if (el) el.textContent = `⏱️ ${Math.ceil(left)} s`;
    const st = document.getElementById('qstep');
    if (st && phase !== 'done') st.textContent = `${t('qSession', { n: step + 1 })} · ⏱️ ${Math.ceil(left)} s`;
  });

  /* ---------- per frame ---------- */
  function frame(now: number) {
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const driving = phase === 'drive' || phase === 'choose' || phase === 'timing' || phase === 'feedback';
    if (driving) {
      const slow = phase === 'choose' || phase === 'timing';
      f += (dt / driveSeconds) * (slow ? SLOW : 1);
      if (phase === 'drive' && nextCorner < points.length && f >= points[nextCorner].at - APPROACH) showChoice();
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
    const target = phase === 'pick' || phase === 'done' || nextCorner >= points.length ? null : points[nextCorner].at;
    tv.drawHotLap(Math.min(f, 1), car.color, String(car.num), wet, target, ctx.weather.quali);
    requestAnimationFrame(frame);
  }

  renderPanel();
  renderTower();
  requestAnimationFrame(() => {
    tv.fit();
    requestAnimationFrame(frame);
  });
  return stop;
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
