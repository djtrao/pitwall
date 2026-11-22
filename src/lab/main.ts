/**
 * Sim Lab – a tiny viewer for the milestone 1 race engine.
 * Not the real race screen (that is milestone 2): just enough to watch a race on a phone.
 */
import {
  buildField,
  createRace,
  generateWeather,
  leaderLap,
  makeRng,
  makeTuning,
  quickQualifying,
  standings,
  step,
  TRACKS,
  type RaceEvent,
  type RaceState,
  type Track,
} from '../sim';

const TYRE_COLOR = { S: '#ff3333', M: '#ffd400', H: '#f4f4f4', W: '#2f8cff' } as const;
const $ = (id: string) => document.getElementById(id)!;

let track: Track = TRACKS[0];
let speed = 1;
let race: RaceState | null = null;
let lastEvent = 0;
let acc = 0;
let last = performance.now();

/* ---------- controls ---------- */
function buttons(el: HTMLElement, items: { label: string; on: () => boolean; click: () => void }[]) {
  el.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button');
    b.textContent = it.label;
    b.className = it.on() ? 'on' : '';
    b.onclick = () => {
      it.click();
      renderControls();
    };
    el.appendChild(b);
  }
}
function renderControls() {
  buttons($('tracks'), TRACKS.map((t) => ({ label: t.name, on: () => t === track, click: () => (track = t) })));
  buttons($('speeds'), [1, 4, 16].map((s) => ({ label: `${s}×`, on: () => s === speed, click: () => (speed = s) })));
}

function startRace() {
  const seed = Math.floor(Math.random() * 1e9);
  const tuning = makeTuning();
  const wx = generateWeather(track, makeRng(seed, 1), tuning);
  const field = buildField(
    { humans: [{ id: 'you', name: 'Your Team', color: '#ffd200', drivers: [{ name: 'Kenny Junior', num: 7 }, { name: 'Alex Speed', num: 27 }] }], seed, track, tuning },
    wx,
  ).map((c) => ({ ...c, autopilot: true }));
  race = createRace({ seed, track, cars: quickQualifying(field, track, wx, tuning, seed), weather: wx, tuning });
  lastEvent = 0;
  $('log').innerHTML = '';
}

/* ---------- track drawing ---------- */
interface Path { pts: [number, number][]; len: number[]; total: number }
const paths = new Map<string, Path>();

function trackPath(t: Track): Path {
  const cached = paths.get(t.id);
  if (cached) return cached;
  // closed Catmull-Rom spline through the shape points, starting at point 0 (start/finish)
  const p = t.shape;
  const pts: [number, number][] = [];
  for (let i = 0; i < p.length; i++) {
    const p0 = p[(i - 1 + p.length) % p.length], p1 = p[i], p2 = p[(i + 1) % p.length], p3 = p[(i + 2) % p.length];
    for (let k = 0; k < 20; k++) {
      const s = k / 20, s2 = s * s, s3 = s2 * s;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s2 + (-a + 3 * b - 3 * c + d) * s3);
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const len = [0];
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1], b = pts[i % pts.length];
    len.push(len[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const path = { pts, len, total: len[len.length - 1] };
  paths.set(t.id, path);
  return path;
}

function pointAt(path: Path, frac: number): [number, number] {
  const d = (((frac % 1) + 1) % 1) * path.total;
  let lo = 0, hi = path.len.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path.len[mid] <= d) lo = mid; else hi = mid;
  }
  const a = path.pts[lo % path.pts.length], b = path.pts[(lo + 1) % path.pts.length];
  const s = (d - path.len[lo]) / (path.len[lo + 1] - path.len[lo] || 1);
  return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
}

function draw() {
  const cv = $('cv') as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  const W = cv.width, H = cv.height, pad = 30;
  const X = (x: number) => pad + x * (W - 2 * pad);
  const Y = (y: number) => pad + y * (H - 2 * pad);
  const path = trackPath(track);
  const wet = race ? race.wetness / 100 : 0;
  g.clearRect(0, 0, W, H);
  g.lineJoin = g.lineCap = 'round';
  g.beginPath();
  path.pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
  g.closePath();
  g.strokeStyle = '#3a4150';
  g.lineWidth = 26;
  g.stroke();
  g.strokeStyle = `rgb(${40 - wet * 15},${45 - wet * 10},${55 + wet * 10})`;
  g.lineWidth = 20;
  g.stroke();
  // start/finish line
  const [sx, sy] = pointAt(path, 0);
  g.fillStyle = '#fff';
  g.fillRect(X(sx) - 2, Y(sy) - 14, 4, 28);
  // key corners
  g.font = '600 13px system-ui';
  g.fillStyle = '#8b94a5';
  for (const c of track.corners) {
    const [cx, cy] = pointAt(path, c.at);
    g.fillText(c.name, X(cx) + 14, Y(cy) - 10);
  }
  // rain streaks
  if (race && race.rainNow > 0) {
    g.strokeStyle = 'rgba(150,190,255,0.35)';
    g.lineWidth = 1;
    for (let i = 0; i < 80 * race.rainNow; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 4, y + 12);
      g.stroke();
    }
  }
  if (!race) return;
  // cars (back to front so the leader is on top)
  const order = standings(race).reverse();
  for (const c of order) {
    if (c.status === 'dnf') continue;
    const inPit = c.status === 'pit';
    const [x, y] = pointAt(path, c.dist);
    const px = X(x) + (inPit ? 0 : 0), py = Y(y) + (inPit ? 22 : 0);
    g.beginPath();
    g.arc(px, py, 11, 0, Math.PI * 2);
    g.fillStyle = c.color;
    g.fill();
    g.lineWidth = c.human ? 3 : 1.5;
    g.strokeStyle = c.human ? '#fff' : '#000';
    g.stroke();
    g.fillStyle = luminance(c.color) > 0.6 ? '#000' : '#fff';
    g.font = '800 11px system-ui';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(c.num), px, py + 0.5);
  }
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/* ---------- text panels ---------- */
const MODE = ['🐢', '', '🔥', '💥'];
function renderTower() {
  if (!race) return;
  const r = race;
  const rows = standings(r);
  const leader = rows[0];
  $('lap').textContent = r.over ? '🏁 Finished' : `Lap ${leaderLap(r)} / ${r.track.laps}`;
  $('wx').textContent = `${r.rainNow > 0 ? '🌧️' : '☀️'} track ${Math.round(r.wetness)} % wet`;
  ($('wetbar') as HTMLElement).style.width = `${r.wetness}%`;
  $('banner').innerHTML = r.safetyCar.active ? '<div class="banner">SAFETY CAR</div>' : '';
  $('tower').innerHTML = rows
    .map((c, i) => {
      let gap = '';
      if (c.status === 'dnf') gap = 'DNF';
      else if (c.status === 'finished') gap = c === leader ? '🏁' : `+${(c.finishTime - leader.finishTime + c.penalty).toFixed(1)}`;
      else if (i > 0) gap = `+${((leader.dist - c.dist) * c.lapTime).toFixed(1)}`;
      const status = c.status === 'pit' ? ' 🔧' : c.loss > 0 ? ' ⚠️' : '';
      return `<tr class="${c.human ? 'me' : ''}"><td>${i + 1}</td><td><span class="chip" style="background:${c.color}"></span>#${c.num} ${c.name}${status}</td>
        <td><span class="tyre" style="border-color:${TYRE_COLOR[c.tyre]}">${c.tyre}</span> ${Math.round(c.cond * 100)}%</td><td>${MODE[c.mode]}</td><td class="mut">${gap}</td></tr>`;
    })
    .join('');
}

function radio(e: RaceEvent): string | null {
  const r = race!;
  const name = (id?: string) => {
    const c = r.cars.find((x) => x.id === id);
    return c ? `#${c.num} ${c.name}` : '';
  };
  const a = name(e.car), b = name(e.other);
  switch (e.kind) {
    case 'rainStart': return '🌧️ Rain is starting!';
    case 'rainStop': return '☀️ The rain has stopped – the track will dry.';
    case 'safetyCar': return '🚨 SAFETY CAR! Box now?';
    case 'safetyCarEnd': return '🟢 Safety car is in – racing again!';
    case 'pitIn': return `🔧 ${a} pits for ${e.data?.tyre} tyres`;
    case 'pass': return `⚔️ ${a} overtakes ${b}`;
    case 'crash': return `💥 ${a} and ${b} touch!`;
    case 'wingDamage': return `🪛 ${a} has front wing damage`;
    case 'mistakeSmall': return `😬 ${a} runs wide`;
    case 'mistakeBig': return `🛞 ${a} goes off – flat-spotted tyre!`;
    case 'spin': return `💫 ${a} spins on slick tyres in the wet!`;
    case 'outOfFuel': return `⛽ ${a} is out of fuel – retired`;
    case 'penalty': return `⚠️ ${a}: +20 s – only one dry tyre type used`;
    case 'win': return `🏆 ${a} wins the race!`;
    default: return null;
  }
}

function renderLog() {
  if (!race) return;
  const fresh = race.events.filter((e) => e.id > lastEvent);
  if (!fresh.length) return;
  lastEvent = fresh[fresh.length - 1].id;
  const log = $('log');
  for (const e of fresh) {
    const msg = radio(e);
    if (!msg) continue;
    const d = document.createElement('div');
    d.textContent = `L${e.lap} · ${msg}`;
    log.prepend(d);
  }
  while (log.childElementCount > 40) log.lastElementChild!.remove();
}

/* ---------- main loop: 10 ticks per real second, like the server will ---------- */
function frame(now: number) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (race && !race.over) {
    acc += dt * speed;
    let ticks = 0;
    while (acc >= 0.1 && ticks < 200) {
      step(race, 0.1);
      acc -= 0.1;
      ticks++;
    }
    renderTower();
    renderLog();
  }
  draw();
  requestAnimationFrame(frame);
}

$('start').onclick = () => {
  startRace();
  renderTower();
};
renderControls();
requestAnimationFrame(frame);
