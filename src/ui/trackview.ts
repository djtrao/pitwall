/**
 * Top-down track drawing on a canvas (look taken from the prototype):
 * track outline, pit lane next to the start/finish straight, key corners,
 * cars as coloured dots with their numbers, safety car, rain.
 */
import type { Car, RaceState, Track } from '../sim';

const PIT_FROM = -0.045;
const PIT_TO = 0.06;

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

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
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
  /** Smoothed sideways offsets so cars running close together are drawn side by side. */
  private lat = new Map<string, number>();

  constructor(private cv: HTMLCanvasElement, private track: Track, private ratio = 0.72) {
    this.ctx = cv.getContext('2d')!;
    this.norm = buildTrack(track.shape);
    this.fit();
  }

  fit(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.cv.clientWidth || 320;
    const h = Math.round(w * this.ratio);
    this.w = w;
    this.h = h;
    this.cv.width = w * dpr;
    this.cv.height = h * dpr;
    this.cv.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const m = Math.max(22, w * 0.06);
    this.scr = this.norm.map(([x, y]) => [m + x * (w - 2 * m), m + y * (h - 2 * m)]);
    const N = this.scr.length;
    this.nrm = this.scr.map((_, i) => {
      const a = this.scr[(i - 1 + N) % N], b = this.scr[(i + 1) % N];
      const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
      return [-ty / l, tx / l];
    });
    const p = this.scr[0], nn = this.nrm[0];
    this.inSign = this.inside([p[0] + nn[0] * 20, p[1] + nn[1] * 20]) ? 1 : -1;
    this.tw = Math.max(12, w * 0.03);
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

  drawTrack(wetness: number, showCorners = true): void {
    const c = this.ctx, P = this.scr;
    c.fillStyle = '#0d1a13';
    c.fillRect(0, 0, this.w, this.h);
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
    c.strokeStyle = '#3d434d';
    c.lineWidth = this.tw * 0.5;
    c.stroke();
    // kerbs and asphalt (darker and bluer when wet)
    path();
    c.strokeStyle = '#d9dde3';
    c.lineWidth = this.tw + 4;
    c.stroke();
    path();
    const g = Math.round(58 - wetness * 0.2), b = Math.round(66 + wetness * 0.3);
    c.strokeStyle = `rgb(${g - 2},${g + 2},${b})`;
    c.lineWidth = this.tw;
    c.stroke();
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
      c.font = `600 ${Math.max(10, Math.round(this.w * 0.026))}px 'Titillium Web', system-ui, sans-serif`;
      c.textBaseline = 'middle';
      this.track.corners.forEach((corner, i) => {
        const [x, y] = this.xy(corner.at, -this.inSign * this.tw * 1.6);
        c.fillStyle = 'rgba(255,255,255,0.12)';
        c.beginPath();
        c.arc(x, y, 9, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#c9d1dc';
        c.textAlign = 'center';
        c.fillText(String(i + 1), x, y + 0.5);
      });
      c.textAlign = 'left';
    }
  }

  drawCar(x: number, y: number, color: string, label: string, highlight: boolean, alpha = 1): void {
    const c = this.ctx;
    const r = Math.max(8, this.w * 0.018);
    c.globalAlpha = alpha;
    if (highlight) {
      c.beginPath();
      c.arc(x, y, r + 4.5, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.3)';
      c.fill();
    }
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
    c.lineWidth = highlight ? 2.5 : 1.2;
    c.strokeStyle = highlight ? '#fff' : 'rgba(0,0,0,0.7)';
    c.stroke();
    c.fillStyle = luminance(color) > 0.55 ? '#000' : '#fff';
    c.font = `900 ${Math.round(r * (label.length > 2 ? 0.95 : 1.15))}px 'Titillium Web', system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(label, x, y + 0.5);
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

  /** Where to draw a car: on track, or on the pit lane while stopping. */
  private carPosition(car: Car, dist: number): { f: number; lat: number } {
    const k = Math.floor(dist);
    const fr = frac(dist);
    if (car.status === 'pit') {
      // drive in, stop in the box, drive out to the pit exit
      const prog = car.pitTotal > 0 ? 1 - car.pitTimer / car.pitTotal : 1;
      const f = prog < 0.75 ? 0.02 * (prog / 0.75) : 0.02 + (PIT_TO - 0.02) * ((prog - 0.75) / 0.25);
      return { f: k + f, lat: this.pitLat };
    }
    if (car.status === 'running' && car.stops > 0 && car.tyreLaps === 0 && car.lap >= 1 && fr < PIT_TO + 0.03) {
      // just left the pits: wait at the pit exit until the simulated car catches up, then merge
      const f = Math.max(fr, PIT_TO);
      const merge = fr < PIT_TO ? 1 : 1 - (fr - PIT_TO) / 0.03;
      return { f: k + f, lat: this.pitLat * merge };
    }
    if (car.status === 'running' && car.pitPlan && fr > 1 + PIT_FROM) {
      return { f: dist, lat: this.pitLat * ((fr - (1 + PIT_FROM)) / -PIT_FROM) };
    }
    return { f: dist, lat: 0 };
  }

  /** Draw the whole race. `dist` gives the interpolated distance per car id. */
  drawRace(race: RaceState, dist: (c: Car) => number, mine: (c: Car) => boolean): void {
    this.drawTrack(race.wetness);
    const cars = race.cars.filter((c) => c.status !== 'dnf').sort((a, b) => dist(a) - dist(b));
    // side-by-side offsets for cars running nose to tail
    const order = [...cars].reverse();
    for (let i = 0; i < order.length; i++) {
      const c = order[i];
      let target = 0;
      if (i > 0 && c.status === 'running' && order[i - 1].status === 'running') {
        const gap = dist(order[i - 1]) - dist(c);
        if (gap < 0.006) target = (this.lat.get(order[i - 1].id) ?? 0) > 0 ? -this.tw * 0.45 : this.tw * 0.45;
      }
      const cur = this.lat.get(c.id) ?? 0;
      this.lat.set(c.id, cur + (target - cur) * 0.15);
    }
    for (const c of cars) {
      const d = dist(c);
      const pos = this.carPosition(c, d);
      const lat = pos.lat !== 0 ? pos.lat : this.lat.get(c.id) ?? 0;
      const [x, y] = this.xy(pos.f, lat);
      this.drawCar(x, y, c.color, String(c.num), mine(c), c.status === 'finished' ? 0.45 : 1);
    }
    if (race.safetyCar.active) {
      const lead = cars.filter((c) => c.status === 'running').reduce((m, c) => Math.max(m, dist(c)), -Infinity);
      if (lead > -Infinity) {
        const [x, y] = this.xy(lead + 0.018, 0);
        this.drawCar(x, y, '#ffb000', 'SC', false);
      }
    }
    this.drawRain(race.rainNow);
  }
}
