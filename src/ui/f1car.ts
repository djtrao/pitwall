/**
 * A top-down F1 car in the flat Kenney style (thick darker outline, simple shapes).
 * Drawn around (0, 0) with the nose pointing to +x; `L` is the car length in px.
 */

/** The colour made darker (k < 1) or lighter (k > 1). */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 1 ? v * k : v + (255 - v) * (k - 1))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const cache = new Map<string, HTMLCanvasElement>();
const RES = 96; // sprite length in px before scaling

/** Paint the car once per colour into a small canvas, then just copy it (fast with 12 cars). */
function sprite(color: string): HTMLCanvasElement {
  const hit = cache.get(color);
  if (hit) return hit;
  const L = RES, W = L * 0.5, pad = 4;
  const cv = document.createElement('canvas');
  cv.width = L + pad * 2;
  cv.height = W + pad * 2;
  const c = cv.getContext('2d')!;
  c.translate(cv.width / 2, cv.height / 2);
  c.lineJoin = 'round';
  const line = Math.max(2, L * 0.035);
  const dark = shade(color, 0.6);
  const box = (x: number, y: number, w: number, h: number, r: number, fill: string, stroke: string) => {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    c.fillStyle = fill;
    c.fill();
    c.lineWidth = line;
    c.strokeStyle = stroke;
    c.stroke();
  };
  // wheels
  const wl = L * 0.17, ww = W * 0.26;
  for (const [x, y] of [[L * 0.27, -W / 2], [L * 0.27, W / 2 - ww], [-L * 0.33, -W / 2], [-L * 0.33, W / 2 - ww]]) {
    box(x - wl / 2, y, wl, ww, ww * 0.3, '#2b2b2b', '#111');
  }
  // rear wing and front wing
  box(-L * 0.5, -W * 0.42, L * 0.11, W * 0.84, 2, dark, '#111');
  box(L * 0.4, -W * 0.44, L * 0.09, W * 0.88, 2, dark, '#111');
  // body: nose, cockpit, sidepods, engine cover
  c.beginPath();
  c.moveTo(L * 0.47, 0);
  c.lineTo(L * 0.42, -W * 0.07);
  c.lineTo(L * 0.16, -W * 0.12);
  c.lineTo(L * 0.06, -W * 0.33);
  c.lineTo(-L * 0.24, -W * 0.33);
  c.lineTo(-L * 0.4, -W * 0.13);
  c.lineTo(-L * 0.4, W * 0.13);
  c.lineTo(-L * 0.24, W * 0.33);
  c.lineTo(L * 0.06, W * 0.33);
  c.lineTo(L * 0.16, W * 0.12);
  c.lineTo(L * 0.42, W * 0.07);
  c.closePath();
  c.fillStyle = color;
  c.fill();
  c.lineWidth = line;
  c.strokeStyle = dark;
  c.stroke();
  // light stripe along the nose (Kenney-style highlight)
  c.beginPath();
  c.moveTo(L * 0.4, 0);
  c.lineTo(-L * 0.3, 0);
  c.strokeStyle = shade(color, 1.45);
  c.lineWidth = W * 0.08;
  c.lineCap = 'round';
  c.stroke();
  // cockpit with the driver's helmet
  c.beginPath();
  c.ellipse(-L * 0.03, 0, L * 0.11, W * 0.15, 0, 0, Math.PI * 2);
  c.fillStyle = '#1b1b1b';
  c.fill();
  c.beginPath();
  c.arc(-L * 0.04, 0, W * 0.1, 0, Math.PI * 2);
  c.fillStyle = '#ffd200';
  c.fill();
  c.lineWidth = line * 0.7;
  c.strokeStyle = '#111';
  c.stroke();
  cache.set(color, cv);
  return cv;
}

/** Draw the car at (x, y), nose along `angle` (radians), `L` px long. Returns the car width. */
export function drawF1(c: CanvasRenderingContext2D, x: number, y: number, angle: number, L: number, color: string, shadow = true): number {
  const s = sprite(color);
  const k = L / RES;
  const w = s.width * k, h = s.height * k;
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  if (shadow) {
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.beginPath();
    c.ellipse(L * 0.04, L * 0.06, L * 0.5, L * 0.22, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.drawImage(s, -w / 2, -h / 2, w, h);
  c.restore();
  return L * 0.5;
}
