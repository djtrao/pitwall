/**
 * Top-down track drawing on a canvas (look taken from the prototype):
 * track outline, pit lane next to the start/finish straight, key corners,
 * cars as coloured dots with their numbers, safety car, rain.
 */
import { DEFAULT_TUNING, makeRng, rand, type Car, type RaceState, type Track } from '../sim';
import { img } from './assets';
import { drawF1 } from './f1car';

/** A sprite placed next to the track (tribune, tent, tree, tyre stack ...). */
interface Deco {
  name: string;
  x: number;
  y: number;
  /** length of the longer side in px */
  size: number;
  angle: number;
}

const GRASS = '#27ae60';
const KERB = '#e86a17';

// pit lane from just before the line to just after it (same numbers as the simulation)
const PIT_FROM = -DEFAULT_TUNING.pit.laneIn;
const PIT_TO = DEFAULT_TUNING.pit.laneOut;

function buildTrack(pts: [number, number][]): [number, number][] {
  const dense: [number, number][] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let s = 0; s < 40; s++) {
      const u = s / 40, u2 = u * u, u3 = u2 * u;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  // resample to equal distances so lap fraction = distance along the track
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const L = cum[cum.length - 1];
  const N = 900;
  const out: [number, number][] = [];
  let j = 0;
  for (let k = 0; k < N; k++) {
    const target = (k / N) * L;
    while (cum[j + 1] < target) j++;
    const a = dense[j], b = dense[(j + 1) % dense.length];
    const u = (target - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return out;
}

const frac = (d: number) => ((d % 1) + 1) % 1;

export class TrackView {
  private ctx: CanvasRenderingContext2D;
  private norm: [number, number][];
  private scr: [number, number][] = [];
  private nrm: [number, number][] = [];
  private inSign = 1;
  private tw = 12;
  private w = 320;
  private h = 230;
  /** Width of the drawn track box (px), used to scale cars and labels. */
  private size = 320;
  /** Smoothed sideways offsets so cars running close together are drawn side by side. */
  private lat = new Map<string, number>();
  /** Smoothed push-back (lap share) so cars in the same lane never overlap. */
  private gapFix = new Map<string, number>();
  /** Length of the drawn centre line (px). */
  private perim = 1;
  private dpr = 1;
  /** Camera: centre (px) and zoom. Follows `followId` when set. */
  private cam = { x: 160, y: 115, z: 1 };
  private carScale = 1;
  private decos: Deco[] = [];
  /** Where the corner numbers go: the free spot next to each key corner. */
  private labelPos: [number, number][] = [];
  private grass: CanvasPattern | null = null;
  followId: string | null = null;
  static readonly ZOOM = 3;

  constructor(private cv: HTMLCanvasElement, private track: Track, private ratio = 0.72) {
    this.ctx = cv.getContext('2d')!;
    this.norm = buildTrack(track.shape);
    this.fit();
  }

  /**
   * Size the canvas. If the canvas is absolutely positioned (landscape layout) it fills its
   * parent box; otherwise its height follows the width. The track keeps its shape either way.
   */
  fit(): void {
    const dpr = window.devicePixelRatio || 1;
    const fill = getComputedStyle(this.cv).position === 'absolute' && this.cv.parentElement;
    const w = (fill ? this.cv.parentElement!.clientWidth : this.cv.clientWidth) || 320;
    const h = fill ? this.cv.parentElement!.clientHeight || Math.round(w * this.ratio) : Math.round(w * this.ratio);
    this.w = w;
    this.h = h;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.cv.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dpr = dpr;
    if (!this.followId) this.cam = { x: w / 2, y: h / 2, z: 1 };
    // largest box with the track's own proportions that fits, centred
    const m = Math.max(12, Math.min(w, h) * 0.05);
    const dw = Math.min(w - 2 * m, (h - 2 * m) / this.ratio);
    const dh = dw * this.ratio;
    const ox = (w - dw) / 2;
    const oy = (h - dh) / 2;
    this.size = dw;
    this.scr = this.norm.map(([x, y]) => [ox + x * dw, oy + y * dh]);
    const N = this.scr.length;
    this.nrm = this.scr.map((_, i) => {
      const a = this.scr[(i - 1 + N) % N], b = this.scr[(i + 1) % N];
      const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
      return [-ty / l, tx / l];
    });
    const p = this.scr[0], nn = this.nrm[0];
    this.inSign = this.inside([p[0] + nn[0] * 20, p[1] + nn[1] * 20]) ? 1 : -1;
    // a wide road: two cars fit side by side, like in real F1
    this.tw = Math.max(13, dw * 0.044);
    this.perim = this.scr.reduce((sum, p, i) => {
      const q = this.scr[(i + 1) % N];
      return sum + Math.hypot(q[0] - p[0], q[1] - p[1]);
    }, 0);
    this.placeDecos();
  }

  /** Track heading (radians) at lap fraction f. */
  private heading(f: number): number {
    const [x1, y1] = this.xy(f - 0.002);
    const [x2, y2] = this.xy(f + 0.002);
    return Math.atan2(y2 - y1, x2 - x1);
  }

  /** Smallest distance (px) from a point to the track centre line. */
  private distToTrack(x: number, y: number): number {
    let m = Infinity;
    for (let i = 0; i < this.scr.length; i += 3) m = Math.min(m, Math.hypot(this.scr[i][0] - x, this.scr[i][1] - y));
    return m;
  }

  /** Which side (+1 / -1 along the normal) is the outside of the bend at f. */
  private outside(f: number): number {
    const [ax, ay] = this.xy(f - 0.02), [bx, by] = this.xy(f + 0.02);
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const [px, py] = this.xy(f, this.tw), [qx, qy] = this.xy(f, -this.tw);
    return Math.hypot(px - mx, py - my) > Math.hypot(qx - mx, qy - my) ? 1 : -1;
  }

  /** Tribunes on the main straight, team tents behind the pit lane, tyre stacks at the key corners, trees. */
  private placeDecos(): void {
    const tw = this.tw, out = -this.inSign;
    const d: Deco[] = [];
    const along = (name: string, f: number, lat: number, size: number, turn = 0) => {
      const [x, y] = this.xy(f, lat);
      d.push({ name, x, y, size, angle: this.heading(f) + turn });
    };
    // grandstands opposite the pits, or behind the garages if there is no room on screen
    const [sx, sy] = this.xy(0, out * tw * 2.6);
    const m = tw * 2.2;
    const room = sx > m && sx < this.w - m && sy > m && sy < this.h - m;
    const standLat = room ? out * tw * 2.4 : this.inSign * tw * 4.1;
    for (const f of [-0.03, 0, 0.03]) along(f === 0 ? 'tribune_overhang_red' : 'tribune_full', f, standLat, tw * 2.6, standLat > 0 ? 0 : Math.PI);
    // team garages behind the pit lane
    let k = 0;
    for (let f = PIT_FROM + 0.008; f < PIT_TO - 0.005; f += 0.014) along(k++ % 2 ? 'tent_blue_large' : 'tent_red_large', f, this.inSign * tw * 2.6, tw * 1.25);
    // tyre stacks and barriers on the outside of each key corner
    this.labelPos = [];
    this.track.corners.forEach((c, i) => {
      const s = this.outside(c.at);
      for (const df of [-0.008, 0, 0.008]) {
        const [x, y] = this.xy(c.at + df, s * tw * 1.5);
        if (this.distToTrack(x, y) > tw * 0.9) along(i % 2 ? 'tires_white' : 'tires_red', c.at + df, s * tw * 1.5, tw * 0.55);
      }
      // corner number: the spot near the corner that is furthest from any tarmac
      let best: [number, number] = this.xy(c.at, -s * tw * 2), bestD = -1;
      for (const side of [-s, s]) for (const k of [1.9, 2.4, 3]) for (const df of [0, -0.01, 0.01]) {
        const p = this.xy(c.at + df, side * tw * k);
        const dd = Math.min(this.distToTrack(p[0], p[1]), tw * 1.3) - (side === s ? tw * 0.2 : 0) - k * 0.05 * tw;
        if (dd > bestD) (bestD = dd), (best = p);
      }
      this.labelPos.push(best);
    });
    // trees, away from the track and from each other
    const rng = makeRng([...this.track.id].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7) >>> 0);
    const trees: [number, number][] = [];
    const pad = tw * 6;
    for (let tries = 0; tries < 900 && trees.length < 46; tries++) {
      const x = -pad + rand(rng) * (this.w + 2 * pad), y = -pad + rand(rng) * (this.h + 2 * pad);
      if (this.distToTrack(x, y) < tw * 2.4) continue;
      if (d.some((o) => Math.hypot(o.x - x, o.y - y) < o.size * 1.1)) continue;
      if (this.labelPos.some(([a, b]) => Math.hypot(a - x, b - y) < tw * 1.6)) continue;
      if (trees.some(([a, b]) => Math.hypot(a - x, b - y) < tw * 1.8)) continue;
      trees.push([x, y]);
      const big = rand(rng) < 0.5;
      d.push({ name: big ? 'tree_large' : 'tree_small', x, y, size: tw * (big ? 1.7 : 1.15), angle: rand(rng) * Math.PI * 2 });
    }
    this.decos = d;
  }

  private drawDecos(): void {
    const c = this.ctx;
    for (const o of this.decos) {
      const im = img(o.name);
      if (!im) continue;
      const k = o.size / Math.max(im.naturalWidth, im.naturalHeight);
      const w = im.naturalWidth * k, h = im.naturalHeight * k;
      c.save();
      c.translate(o.x, o.y);
      c.rotate(o.angle);
      c.drawImage(im, -w / 2, -h / 2, w, h);
      c.restore();
    }
  }

  /** Grass (Kenney tile) over the visible area plus a margin, darker when wet. */
  private drawGround(wetness: number): void {
    const c = this.ctx;
    const tile = img('grass');
    if (tile && !this.grass) this.grass = c.createPattern(tile, 'repeat');
    c.fillStyle = this.grass ?? GRASS;
    if (this.grass) this.grass.setTransform(new DOMMatrix().scale(this.tw / 40));
    c.fillRect(-this.w, -this.h, this.w * 3, this.h * 3);
    if (wetness > 0) {
      c.fillStyle = `rgba(10,30,50,${Math.min(0.35, wetness / 250)})`;
      c.fillRect(-this.w, -this.h, this.w * 3, this.h * 3);
    }
  }

  /** Orange-white kerbs along a stretch of track on the given side. */
  private kerb(from: number, to: number, side: number): void {
    const c = this.ctx;
    const line = () => {
      c.beginPath();
      for (let f = from; f <= to + 1e-9; f += 0.002) {
        const [x, y] = this.xy(f, side * this.tw * 0.55);
        if (f === from) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
    };
    c.lineCap = 'butt';
    line();
    c.strokeStyle = '#fafafa';
    c.lineWidth = this.tw * 0.22;
    c.stroke();
    line();
    c.strokeStyle = KERB;
    c.setLineDash([this.tw * 0.35, this.tw * 0.35]);
    c.stroke();
    c.setLineDash([]);
    c.lineCap = 'round';
  }

  private inside([x, y]: [number, number]): boolean {
    let c = false;
    const P = this.scr;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      if (P[i][1] > y !== P[j][1] > y && x < ((P[j][0] - P[i][0]) * (y - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
    }
    return c;
  }

  /** Screen position for a lap fraction and a sideways offset (px). */
  xy(f: number, lat = 0): [number, number] {
    const N = this.scr.length;
    const k = frac(f) * N;
    const i = Math.floor(k) % N, u = k - Math.floor(k);
    const a = this.scr[i], b = this.scr[(i + 1) % N], n = this.nrm[i];
    return [a[0] + (b[0] - a[0]) * u + n[0] * lat, a[1] + (b[1] - a[1]) * u + n[1] * lat];
  }

  private get pitLat() {
    return this.inSign * this.tw * 1.3;
  }

  drawTrack(wetness: number, showCorners = true, background = true): void {
    const c = this.ctx, P = this.scr;
    if (background) this.drawGround(wetness);
    const path = () => {
      c.beginPath();
      c.moveTo(P[0][0], P[0][1]);
      for (let i = 1; i < P.length; i++) c.lineTo(P[i][0], P[i][1]);
      c.closePath();
    };
    c.lineJoin = 'round';
    c.lineCap = 'round';
    // pit lane
    c.beginPath();
    for (let f = PIT_FROM; f <= PIT_TO + 1e-9; f += 0.005) {
      const [x, y] = this.xy(f, this.pitLat);
      if (f === PIT_FROM) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    const asphalt = (w: number) => {
      const g = Math.round(112 - wetness * 0.35), b = Math.round(124 - wetness * 0.15);
      return `rgb(${g - 6},${g + 2},${b + w})`;
    };
    c.strokeStyle = '#fafafa';
    c.lineWidth = this.tw * 0.5 + 3;
    c.stroke();
    c.strokeStyle = asphalt(0);
    c.lineWidth = this.tw * 0.5;
    c.stroke();
    // white edge lines and asphalt (darker and bluer when wet)
    path();
    c.strokeStyle = '#fafafa';
    c.lineWidth = this.tw + 3;
    c.stroke();
    path();
    c.strokeStyle = asphalt(wetness * 0.2);
    c.lineWidth = this.tw;
    c.stroke();
    // kerbs on both sides of every key corner
    for (const corner of [...this.track.corners, ...this.track.bends]) {
      this.kerb(corner.at - 0.025, corner.at + 0.025, 1);
      this.kerb(corner.at - 0.025, corner.at + 0.025, -1);
    }
    this.drawDecos();
    // chequered start/finish line
    const n = this.nrm[0], p = this.scr[0], sq = this.tw / 4;
    for (let r = -2; r < 2; r++) {
      for (let s = 0; s < 2; s++) {
        c.fillStyle = (r + s) % 2 === 0 ? '#fff' : '#111';
        const x = p[0] + n[0] * (r + 0.5) * sq - n[1] * (s - 1) * sq;
        const y = p[1] + n[1] * (r + 0.5) * sq + n[0] * (s - 1) * sq;
        c.fillRect(x - sq / 2, y - sq / 2, sq, sq);
      }
    }
    if (showCorners) {
      c.font = `600 ${Math.max(10, Math.round(this.size * 0.026))}px 'Titillium Web', system-ui, sans-serif`;
      c.textBaseline = 'middle';
      this.track.corners.forEach((corner, i) => {
        const [x, y] = this.labelPos[i] ?? this.xy(corner.at, this.tw * 2);
        c.fillStyle = 'rgba(0,0,0,0.45)';
        c.beginPath();
        c.arc(x, y, 9, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#fff';
        c.textAlign = 'center';
        c.fillText(String(i + 1), x, y + 0.5);
      });
      c.textAlign = 'left';
    }
  }

  /** Car length in px (world units: it grows with the camera zoom, like the road). */
  private get carLen(): number {
    return this.tw * 0.8;
  }

  /**
   * An F1 car, nose along `angle`. The number is shown above your own cars, the safety car,
   * and every car when the camera is zoomed in.
   */
  drawCar(x: number, y: number, color: string, label: string, highlight: boolean, alpha = 1, angle = 0, showLabel = highlight): void {
    const c = this.ctx;
    const L = this.carLen;
    c.globalAlpha = alpha;
    if (highlight) {
      c.beginPath();
      c.arc(x, y, L * 0.72, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.32)';
      c.fill();
    }
    drawF1(c, x, y, angle, L, color);
    if (showLabel || this.cam.z > 1.6) {
      // number tag above the car: same size on screen whatever the zoom
      const fs = (highlight ? 12 : 10) / this.cam.z;
      const ty = y - L * 0.55 - fs * 0.55;
      c.font = `900 ${fs}px 'Titillium Web', system-ui, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineJoin = 'round';
      c.lineWidth = 3 / this.cam.z;
      c.strokeStyle = 'rgba(0,0,0,0.85)';
      c.strokeText(label, x, ty);
      c.fillStyle = highlight ? '#ffd200' : '#fff';
      c.fillText(label, x, ty);
    }
    c.globalAlpha = 1;
  }

  drawRain(intensity: number): void {
    if (intensity <= 0) return;
    const c = this.ctx;
    c.strokeStyle = 'rgba(170,200,255,0.35)';
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < intensity * 140; i++) {
      const x = Math.random() * this.w, y = Math.random() * this.h;
      c.moveTo(x, y);
      c.lineTo(x - 3, y + 10);
    }
    c.stroke();
    c.fillStyle = `rgba(20,40,70,${intensity * 0.18})`;
    c.fillRect(0, 0, this.w, this.h);
  }

  /** What the track looks like at lap fraction f: a straight, a single corner or an S-bend. */
  sceneAt(f: number): 'straight' | 'corner' | 'chicane' {
    const heading = (a: number, b: number) => {
      const [x1, y1] = this.xy(a);
      const [x2, y2] = this.xy(b);
      return Math.atan2(y2 - y1, x2 - x1);
    };
    const wrap = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
    const d1 = wrap(heading(f, f + 0.03) - heading(f - 0.03, f));
    const d2 = wrap(heading(f + 0.03, f + 0.06) - heading(f, f + 0.03));
    if (Math.abs(d1) + Math.abs(d2) < 0.35) return 'straight';
    if (Math.sign(d1) !== Math.sign(d2) && Math.abs(d1) > 0.12 && Math.abs(d2) > 0.12) return 'chicane';
    return 'corner';
  }

  /** Where to draw a car: on track, or in the pit lane (the simulation moves it along the lane). */
  private carPosition(car: Car, dist: number): { f: number; lat: number } {
    if (car.status === 'pit') {
      // ease sideways into / out of the pit lane at its ends
      const fr = frac(dist);
      const fromStart = fr > 0.5 ? fr - (1 + PIT_FROM) : fr - PIT_FROM;
      const toEnd = PIT_TO - (fr > 0.5 ? fr - 1 : fr);
      const edge = Math.min(1, Math.max(0, Math.min(fromStart, toEnd) / 0.012));
      return { f: dist, lat: this.pitLat * edge };
    }
    return { f: dist, lat: 0 };
  }

  /** Draw the whole race. `dist` gives the interpolated distance per car id. */
  drawRace(race: RaceState, dist: (c: Car) => number, mine: (c: Car) => boolean): void {
    const c = this.ctx;
    const cars = race.cars.filter((x) => x.status !== 'dnf').sort((a, b) => dist(a) - dist(b));
    // Lanes: at most two cars side by side. A car closing in moves to the inside of the next bend
    // (cutting the corner to attack), the car in front keeps the outside. Cars in the same lane
    // are pushed back a little so they never overlap.
    const cf = this.carLen / this.perim; // one car length as a share of the lap
    const lane = new Map<string, number>();
    const vis = new Map<string, number>();
    const order = [...cars].reverse();
    for (let i = 0; i < order.length; i++) {
      const car = order[i];
      const d = dist(car);
      let ln = 0;
      let v = d;
      if (car.status === 'running') {
        let ahead: Car | undefined;
        for (let j = i - 1; j >= 0 && !ahead; j--) if (order[j].status === 'running') ahead = order[j];
        if (ahead) {
          const gap = vis.get(ahead.id)! - d;
          if (gap < cf * 2.6) {
            const la = lane.get(ahead.id)!;
            ln = la !== 0 ? -la : -this.outside(d + cf * 3);
            if (la === 0 && gap < cf * 1.6) lane.set(ahead.id, -ln);
          }
        }
        for (let j = i - 1; j >= 0 && j >= i - 4; j--) {
          const o = order[j];
          if (o.status !== 'running') continue;
          const lo = lane.get(o.id)!;
          if (lo === 0 || ln === 0 || lo === ln) v = Math.min(v, vis.get(o.id)! - cf * 1.25);
        }
      }
      lane.set(car.id, ln);
      vis.set(car.id, v);
    }
    for (const car of cars) {
      const target = lane.get(car.id)! * this.tw * 0.25;
      const cur = this.lat.get(car.id) ?? 0;
      this.lat.set(car.id, cur + (target - cur) * 0.2);
      const fix = vis.get(car.id)! - dist(car);
      const g = this.gapFix.get(car.id) ?? 0;
      this.gapFix.set(car.id, g + (fix - g) * (fix < g ? 0.5 : 0.15));
    }
    const shown = (car: Car) => dist(car) + (this.gapFix.get(car.id) ?? 0);
    const pos = new Map<string, [number, number]>();
    for (const car of cars) {
      const p = this.carPosition(car, car.status === 'pit' ? dist(car) : shown(car));
      pos.set(car.id, this.xy(p.f, p.lat !== 0 ? p.lat : this.lat.get(car.id) ?? 0));
    }

    // camera: glide towards the followed car (zoomed in) or the whole track
    const followed = this.followId ? pos.get(this.followId) : undefined;
    const goal = followed ? { x: followed[0], y: followed[1], z: TrackView.ZOOM } : { x: this.w / 2, y: this.h / 2, z: 1 };
    const k = 0.12;
    this.cam.x += (goal.x - this.cam.x) * k;
    this.cam.y += (goal.y - this.cam.y) * k;
    this.cam.z += (goal.z - this.cam.z) * k;
    this.carScale = 1 / Math.sqrt(this.cam.z);

    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.translate(this.w / 2, this.h / 2);
    c.scale(this.cam.z, this.cam.z);
    c.translate(-this.cam.x, -this.cam.y);
    this.drawTrack(race.wetness, true, true);
    for (const car of cars) {
      const [x, y] = pos.get(car.id)!;
      const f = car.status === 'pit' ? dist(car) : shown(car);
      // nose turned a little towards the lane it is moving to
      const steer = car.status === 'running' ? ((lane.get(car.id)! * this.tw * 0.25 - (this.lat.get(car.id) ?? 0)) / this.tw) * 0.9 : 0;
      this.drawCar(x, y, car.color, String(car.num), mine(car), car.status === 'finished' ? 0.45 : 1, this.heading(f) + steer);
    }
    if (race.safetyCar.active) {
      const lead = cars.filter((x) => x.status === 'running').reduce((m, x) => Math.max(m, dist(x)), -Infinity);
      if (lead > -Infinity) {
        const [x, y] = this.xy(lead + 0.018, 0);
        this.drawCar(x, y, '#ffb000', 'SC', false, 1, this.heading(lead + 0.018), true);
      }
    }
    if (followed) {
      // ring around the followed car
      c.beginPath();
      c.arc(followed[0], followed[1], this.carLen * 0.9, 0, Math.PI * 2);
      c.strokeStyle = '#ffd200';
      c.lineWidth = 2.5 / this.cam.z;
      c.stroke();
    }
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawRain(race.rainNow);
  }

  /** Hot Lap: one car alone, camera following it; the next braking point is highlighted. */
  drawHotLap(f: number, color: string, label: string, wetness: number, nextAt: number | null, rain: number): void {
    const c = this.ctx;
    const [px, py] = this.xy(f, 0);
    const k = 0.15;
    this.cam.x += (px - this.cam.x) * k;
    this.cam.y += (py - this.cam.y) * k;
    this.cam.z += (2.1 - this.cam.z) * k;
    this.carScale = 1 / Math.sqrt(this.cam.z);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.translate(this.w / 2, this.h / 2);
    c.scale(this.cam.z, this.cam.z);
    c.translate(-this.cam.x, -this.cam.y);
    this.drawTrack(wetness, true, true);
    if (nextAt !== null) {
      const [cx, cy] = this.xy(nextAt, 0);
      c.beginPath();
      c.arc(cx, cy, this.tw * 1.4, 0, Math.PI * 2);
      c.strokeStyle = '#ffd200';
      c.lineWidth = 3 * this.carScale;
      c.setLineDash([6 * this.carScale, 5 * this.carScale]);
      c.stroke();
      c.setLineDash([]);
    }
    this.drawCar(px, py, color, label, true, 1, this.heading(f));
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawRain(rain);
  }
}
