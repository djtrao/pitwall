/**
 * Duel close-up: a zoomed-in top-down scene with the two cars.
 * Phase 1 (choosing): the attacker sits behind and looks for a way past.
 * Phase 2 (showing): a ~3 s animation – always the same start, different endings.
 * Three scenes: a straight, a corner and a chicane (S-bend).
 */
import type { DuelOutcome } from '../sim';
import { img } from './assets';
import { drawF1 } from './f1car';

export type DuelScene = 'straight' | 'corner' | 'chicane';

interface CarLook {
  color: string;
  num: number;
}

type Pt = [number, number];

/** Road centre line for each scene, in a 0..1 box (x right, y down; box aspect 1.6 : 1). */
function scenePath(scene: DuelScene): Pt[] {
  const pts: Pt[] = [];
  if (scene === 'straight') {
    for (let i = 0; i <= 40; i++) pts.push([-0.1 + i * 0.03, 0.55]);
  } else if (scene === 'corner') {
    // up the left side, a right-hand bend, then off to the right
    for (let i = 0; i <= 20; i++) pts.push([0.3, 1.15 - i * 0.03]);
    for (let i = 1; i <= 24; i++) {
      const a = Math.PI + (i / 24) * (Math.PI / 2);
      pts.push([0.62 + Math.cos(a) * 0.32, 0.55 + Math.sin(a) * 0.32]);
    }
    for (let i = 1; i <= 20; i++) pts.push([0.62 + i * 0.03, 0.23]);
  } else {
    for (let i = 0; i <= 50; i++) {
      const x = -0.1 + i * 0.025;
      const k = Math.max(0, Math.min(1, (x - 0.15) / 0.7));
      pts.push([x, 0.52 - 0.2 * Math.sin(k * Math.PI * 2) * Math.sin(k * Math.PI)]);
    }
  }
  return resample(pts, 300);
}

function resample(pts: Pt[], n: number): Pt[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1];
  const out: Pt[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / (n - 1)) * L;
    while (j < cum.length - 2 && cum[j + 1] < target) j++;
    const u = (target - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * u, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * u]);
  }
  return out;
}

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const seg = (t: number, a: number, b: number) => ease((t - a) / (b - a));

export class DuelView {
  private ctx: CanvasRenderingContext2D;
  private w = 300;
  private h = 200;
  private dpr = 1;
  private path: Pt[] = [];
  private scene: DuelScene = 'straight';
  private att: CarLook = { color: '#fff', num: 0 };
  private def: CarLook = { color: '#fff', num: 0 };
  private outcome: DuelOutcome | null = null;
  private startedAt = 0;
  private animAt = 0;
  private animSeconds = 3;
  private caption = '';
  private subtitle = '';
  private sparks: { x: number; y: number; vx: number; vy: number; life: number }[] = [];

  constructor(private cv: HTMLCanvasElement) {
    this.ctx = cv.getContext('2d')!;
  }

  fit(): void {
    const parent = this.cv.parentElement!;
    this.dpr = window.devicePixelRatio || 1;
    this.w = parent.clientWidth || 300;
    this.h = parent.clientHeight || 200;
    this.cv.width = Math.round(this.w * this.dpr);
    this.cv.height = Math.round(this.h * this.dpr);
  }

  /** Start the close-up (choosing phase). */
  start(scene: DuelScene, attacker: CarLook, defender: CarLook): void {
    this.scene = scene;
    this.path = scenePath(scene);
    this.att = attacker;
    this.def = defender;
    this.outcome = null;
    this.caption = '';
    this.sparks = [];
    this.startedAt = performance.now();
    this.fit();
  }

  /** Play the ending. */
  play(outcome: DuelOutcome, caption: string, seconds: number, subtitle = ''): void {
    if (this.outcome) return;
    this.outcome = outcome;
    this.caption = caption;
    this.subtitle = subtitle;
    this.animSeconds = seconds;
    this.animAt = performance.now();
  }

  get finished(): boolean {
    return !!this.outcome && performance.now() - this.animAt > (this.animSeconds + 0.9) * 1000;
  }

  /* ---------- geometry ---------- */

  /** Scale of the 0..1 box on screen (keeps the 1.6 : 1 shape, centred). */
  private box() {
    const bw = Math.min(this.w, this.h * 1.6);
    const bh = bw / 1.6;
    return { bw, bh, ox: (this.w - bw) / 2, oy: (this.h - bh) / 2 };
  }

  /** Point on the road at progress s (0..1) with sideways offset lat (in road widths, + = right of travel). */
  private at(s: number, lat: number): { x: number; y: number; angle: number } {
    const n = this.path.length;
    const f = Math.max(0, Math.min(0.9999, s)) * (n - 1);
    const i = Math.floor(f);
    const u = f - i;
    const a = this.path[i];
    const b = this.path[Math.min(n - 1, i + 1)];
    const { bw, bh, ox, oy } = this.box();
    const x = ox + (a[0] + (b[0] - a[0]) * u) * bw;
    const y = oy + (a[1] + (b[1] - a[1]) * u) * bh;
    const p2 = this.path[Math.min(n - 1, i + 2)];
    const p0 = this.path[Math.max(0, i - 1)];
    const angle = Math.atan2((p2[1] - p0[1]) * bh, (p2[0] - p0[0]) * bw);
    const rw = this.roadWidth();
    return { x: x - Math.sin(angle) * lat * rw, y: y + Math.cos(angle) * lat * rw, angle };
  }

  private roadWidth(): number {
    return this.box().bw * 0.17;
  }

  /** Which side the attack goes: inside of the corner, left on a straight, first bend's outside in a chicane. */
  private get attackSide(): number {
    if (this.scene === 'corner') return 0.27; // right-hand bend: inside is right of travel
    if (this.scene === 'chicane') return -0.27;
    return -0.27;
  }

  /**
   * Where both cars are at animation time t (0..1). Before the animation (choosing) t is
   * negative and the cars hover at the start, the attacker probing left and right.
   */
  private positions(t: number, now: number) {
    const side = this.attackSide;
    const s0 = 0.24;
    const span = 0.44;
    // defender: steady progress (slower after contact)
    let sD = s0 + span * ease(Math.max(0, t));
    let latD = 0;
    let rel = -0.11; // attacker distance behind (in path units)
    let latA = 0;
    let rotA = 0;
    let rotD = 0;
    if (t < 0) {
      // probing: small side-to-side moves, creeping closer
      const k = (now - this.startedAt) / 1000;
      latA = Math.sin(k * 2.2) * 0.25;
      rel = -0.11 + Math.sin(k * 1.3) * 0.01;
      sD = s0 + Math.sin(k * 0.7) * 0.004;
      return { sA: sD + rel, latA, rotA, sD, latD, rotD };
    }
    // same start every time: close up and pull out to the attack side
    rel = lerp(-0.11, -0.06, seg(t, 0, 0.35));
    latA = lerp(0, side, seg(t, 0.05, 0.35));
    latD = lerp(0, -side * 0.15, seg(t, 0.15, 0.4)); // defender moves to cover
    const o = this.outcome;
    if (o === 'pass') {
      rel = lerp(rel, 0.11, seg(t, 0.35, 0.85));
      if (this.scene === 'corner') {
        // dive down the inside and cut over the kerb at the apex, then back to the racing line
        latA = lerp(latA, side * 1.55, seg(t, 0.3, 0.5));
        latA = lerp(latA, 0, seg(t, 0.62, 1));
      } else latA = this.scene === 'chicane' ? lerp(latA, -side, seg(t, 0.35, 0.6)) : lerp(latA, 0, seg(t, 0.7, 1));
      latD = lerp(latD, -side * 0.9, seg(t, 0.4, 0.7)); // the defender is pushed wide
    } else if (o === 'fail') {
      if (this.scene === 'corner') latA = lerp(latA, side * 1.4, seg(t, 0.3, 0.5)); // tries the cut ...
      rel = lerp(rel, -0.035, seg(t, 0.35, 0.5));
      rel = lerp(rel, -0.12, seg(t, 0.5, 0.9));
      latA = this.scene === 'chicane' ? lerp(latA, -side * 0.8, seg(t, 0.4, 0.6)) : latA;
      latA = lerp(latA, 0, seg(t, 0.65, 1));
      latD = lerp(latD, this.scene === 'chicane' ? -side * 0.6 : side * 0.6, seg(t, 0.35, 0.55));
    } else if (o === 'crash') {
      rel = lerp(rel, -0.03, seg(t, 0.35, 0.5));
      latD = lerp(latD, side * 0.55, seg(t, 0.35, 0.5));
      const hit = seg(t, 0.5, 0.65);
      rotA = Math.sin(t * 40) * 0.25 * hit * (1 - seg(t, 0.75, 1));
      rotD = -Math.sin(t * 34) * 0.18 * hit * (1 - seg(t, 0.75, 1));
      sD = s0 + span * lerp(ease(t), ease(0.5) + (t - 0.5) * 0.25, seg(t, 0.5, 0.6));
      rel = lerp(rel, -0.09, seg(t, 0.6, 1));
      latA = lerp(latA, side * 1.4, seg(t, 0.5, 0.75));
    } else if (o === 'spin') {
      rel = lerp(rel, -0.03, seg(t, 0.35, 0.5));
      const sp = seg(t, 0.48, 0.95);
      rotA = sp * Math.PI * 3;
      latA = lerp(latA, Math.sign(side) * 1.4, sp);
      rel = lerp(rel, -0.3, seg(t, 0.5, 1));
    } else if (o === 'off') {
      rel = lerp(rel, -0.02, seg(t, 0.35, 0.5));
      latA = lerp(latA, Math.sign(side) * 1.6, seg(t, 0.5, 0.85));
      rel = lerp(rel, -0.25, seg(t, 0.5, 1));
      rotA = Math.sin(t * 25) * 0.1 * seg(t, 0.55, 0.9);
    } else if (o === 'wait') {
      rel = lerp(rel, -0.11, seg(t, 0.35, 0.7));
      latA = lerp(latA, 0, seg(t, 0.35, 0.7));
    }
    return { sA: sD + rel, latA, rotA, sD, latD, rotD };
  }

  /* ---------- drawing ---------- */

  draw(): void {
    const c = this.ctx;
    const now = performance.now();
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Kenney grass, then the road, then trees and tyre stacks beside it
    const tile = img('grass');
    const pattern = tile ? c.createPattern(tile, 'repeat') : null;
    c.fillStyle = pattern ?? '#27ae60';
    c.fillRect(0, 0, this.w, this.h);
    this.drawRoad();
    this.drawDecos();

    const t = this.outcome ? (now - this.animAt) / 1000 / this.animSeconds : -1;
    const p = this.positions(Math.min(1, t), now);
    const A = this.at(p.sA, p.latA);
    const D = this.at(p.sD, p.latD);
    const offTrack = Math.abs(p.latA) > 0.6;
    if (offTrack && (this.outcome === 'off' || this.outcome === 'spin') && Math.random() < 0.6) {
      this.sparks.push({ x: A.x, y: A.y, vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5, life: 1 });
    }
    if (this.outcome === 'crash' && t > 0.5 && t < 0.62) {
      for (let i = 0; i < 4; i++) {
        this.sparks.push({ x: (A.x + D.x) / 2, y: (A.y + D.y) / 2, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5, life: 1 });
      }
    }
    this.drawSparks();
    // the car in front is drawn last
    const attFront = p.sA > p.sD;
    if (attFront) {
      this.drawCar(D.x, D.y, D.angle + p.rotD, this.def);
      this.drawCar(A.x, A.y, A.angle + p.rotA, this.att);
    } else {
      this.drawCar(A.x, A.y, A.angle + p.rotA, this.att);
      this.drawCar(D.x, D.y, D.angle + p.rotD, this.def);
    }
    if (this.outcome && t > 0.8 && this.caption) this.drawCaption(Math.min(1, (t - 0.8) / 0.15));
  }

  private decos: { key: string; list: { name: string; x: number; y: number; size: number; a: number }[] } = { key: '', list: [] };

  /** Trees and tyre stacks off the road; placed once per scene and canvas size. */
  private drawDecos(): void {
    const key = `${this.scene}:${this.w}x${this.h}`;
    if (this.decos.key !== key) {
      const { bw, bh, ox, oy } = this.box();
      const rw = this.roadWidth();
      const pts = this.path.map(([x, y]) => [ox + x * bw, oy + y * bh]);
      const dist = (x: number, y: number) => Math.min(...pts.map(([a, b]) => Math.hypot(a - x, b - y)));
      const list: { name: string; x: number; y: number; size: number; a: number }[] = [];
      let seed = 1;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 400 && list.length < 9; i++) {
        const x = rnd() * this.w, y = rnd() * this.h, d = dist(x, y);
        if (list.some((o) => Math.hypot(o.x - x, o.y - y) < o.size)) continue;
        if (d > rw * 1.0 && d < rw * 1.25) list.push({ name: rnd() < 0.5 ? 'tires_red' : 'tires_white', x, y, size: rw * 0.32, a: 0 });
        else if (d > rw * 2) list.push({ name: rnd() < 0.5 ? 'tree_large' : 'tree_small', x, y, size: rw * (0.6 + rnd() * 0.35), a: rnd() * 6.3 });
      }
      this.decos = { key, list };
    }
    const c = this.ctx;
    for (const o of this.decos.list) {
      const im = img(o.name);
      if (!im) continue;
      c.save();
      c.translate(o.x, o.y);
      c.rotate(o.a);
      c.drawImage(im, -o.size / 2, -o.size / 2, o.size, o.size);
      c.restore();
    }
  }

  private drawRoad(): void {
    const c = this.ctx;
    const { bw, bh, ox, oy } = this.box();
    const rw = this.roadWidth();
    const line = () => {
      c.beginPath();
      this.path.forEach(([x, y], i) => (i ? c.lineTo(ox + x * bw, oy + y * bh) : c.moveTo(ox + x * bw, oy + y * bh)));
    };
    c.lineJoin = 'round';
    c.lineCap = 'butt';
    // gravel trap on the outside of corners
    if (this.scene !== 'straight') {
      line();
      c.strokeStyle = '#8a7a5a';
      c.lineWidth = rw * 2.4;
      c.globalAlpha = 0.55;
      c.stroke();
      c.globalAlpha = 1;
    }
    // orange/white kerbs (Kenney colours)
    line();
    c.strokeStyle = '#fafafa';
    c.lineWidth = rw * 1.16;
    c.stroke();
    line();
    c.setLineDash([rw * 0.35, rw * 0.35]);
    c.strokeStyle = '#e86a17';
    c.stroke();
    c.setLineDash([]);
    // asphalt
    line();
    c.strokeStyle = '#6a727c';
    c.lineWidth = rw;
    c.stroke();
    // racing line hint
    line();
    c.strokeStyle = 'rgba(0,0,0,0.12)';
    c.lineWidth = rw * 0.35;
    c.stroke();
  }

  private drawCar(x: number, y: number, angle: number, look: CarLook): void {
    const c = this.ctx;
    const L = this.roadWidth() * 0.62; // car length: about two cars fit side by side
    const W = drawF1(c, x, y, angle, L, look.color);
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.rotate(-angle);
    c.fillStyle = '#fff';
    c.strokeStyle = '#000';
    c.lineWidth = 3;
    c.font = `900 ${Math.max(12, Math.round(L * 0.34))}px 'Titillium Web', system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.strokeText(String(look.num), 0, -W * 1.6);
    c.fillText(String(look.num), 0, -W * 1.6);
    c.restore();
  }

  private drawSparks(): void {
    const c = this.ctx;
    for (const p of this.sparks) {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.04;
      c.fillStyle = this.outcome === 'crash' ? `rgba(255,210,80,${p.life})` : `rgba(190,170,130,${p.life * 0.7})`;
      c.beginPath();
      c.arc(p.x, p.y, this.outcome === 'crash' ? 2 : 4, 0, Math.PI * 2);
      c.fill();
    }
    this.sparks = this.sparks.filter((p) => p.life > 0);
  }

  private drawCaption(a: number): void {
    const c = this.ctx;
    c.globalAlpha = a;
    const size = Math.round(Math.min(this.w, this.h * 1.6) * 0.075);
    c.font = `900 ${size}px 'Titillium Web', system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 6;
    c.strokeStyle = 'rgba(0,0,0,0.85)';
    c.fillStyle = '#ffd200';
    c.strokeText(this.caption, this.w / 2, this.h * 0.18);
    c.fillText(this.caption, this.w / 2, this.h * 0.18);
    if (this.subtitle) {
      // what both drivers chose, so the result makes sense
      c.font = `700 ${Math.round(size * 0.42)}px 'Titillium Web', system-ui, sans-serif`;
      c.lineWidth = 4;
      c.fillStyle = '#ffffff';
      c.strokeText(this.subtitle, this.w / 2, this.h * 0.18 + size * 0.75);
      c.fillText(this.subtitle, this.w / 2, this.h * 0.18 + size * 0.75);
    }
    c.globalAlpha = 1;
  }
}
