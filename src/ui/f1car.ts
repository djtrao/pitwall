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
const RES = 120; // sprite length in px before scaling
/** Width : length of the car including wheels and wings (a real F1 car is about 2 m × 5.6 m). */
export const CAR_WIDTH = 0.4;

/** Paint the car once per colour into a small canvas, then just copy it (fast with 12 cars). */
function sprite(color: string): HTMLCanvasElement {
  const hit = cache.get(color);
  if (hit) return hit;
  const L = RES, W = L * CAR_WIDTH, pad = 4;
  const cv = document.createElement('canvas');
  cv.width = L + pad * 2;
  cv.height = W + pad * 2;
  const c = cv.getContext('2d')!;
  c.translate(cv.width / 2, cv.height / 2);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const line = L * 0.025;
  const dark = shade(color, 0.55);
  const shape = (pts: [number, number][], fill: string, stroke: string, mirror = true) => {
    c.beginPath();
    const all = mirror ? [...pts, ...pts.slice().reverse().map(([x, y]) => [x, -y] as [number, number])] : pts;
    all.forEach(([x, y], i) => (i ? c.lineTo(x * L, y * W) : c.moveTo(x * L, y * W)));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    c.lineWidth = line;
    c.strokeStyle = stroke;
    c.stroke();
  };
  const tyre = (x: number, y: number, len: number, wid: number) => {
    c.beginPath();
    c.roundRect((x - len / 2) * L, (y - wid / 2) * W, len * L, wid * W, wid * W * 0.35);
    c.fillStyle = '#262626';
    c.fill();
    c.lineWidth = line;
    c.strokeStyle = '#0d0d0d';
    c.stroke();
  };
  // suspension arms (thin dark lines to the wheels)
  c.strokeStyle = '#1a1a1a';
  c.lineWidth = line * 1.1;
  for (const [x, y] of [[0.27, 0.36], [-0.3, 0.36]]) {
    for (const sy of [1, -1]) {
      c.beginPath();
      c.moveTo(x * L, 0);
      c.lineTo(x * L, sy * y * W);
      c.stroke();
    }
  }
  // exposed wheels: thinner at the front, fatter at the back
  for (const sy of [1, -1]) {
    tyre(0.27, sy * 0.36, 0.15, 0.24);
    tyre(-0.3, sy * 0.37, 0.17, 0.27);
  }
  // rear wing (wide) and front wing (full width, team colour end plates)
  shape([[-0.5, 0.42], [-0.39, 0.42], [-0.39, 0.0]], dark, '#111');
  shape([[0.5, 0.0], [0.5, 0.47], [0.43, 0.47], [0.4, 0.2], [0.4, 0.0]], dark, '#111');
  // body: long thin nose, cockpit, sidepods, engine cover tapering to the back
  shape(
    [
      [0.49, 0.0], [0.47, 0.06], [0.2, 0.09], [0.12, 0.13], [0.06, 0.26], [-0.12, 0.3], [-0.24, 0.24],
      [-0.36, 0.12], [-0.43, 0.08], [-0.43, 0.0],
    ],
    color,
    dark,
  );
  // light stripe along the car (Kenney-style highlight)
  c.beginPath();
  c.moveTo(0.44 * L, 0);
  c.lineTo(0.14 * L, 0);
  c.moveTo(-0.16 * L, 0);
  c.lineTo(-0.38 * L, 0);
  c.strokeStyle = shade(color, 1.5);
  c.lineWidth = W * 0.07;
  c.stroke();
  // cockpit, halo and helmet
  c.beginPath();
  c.ellipse(-0.01 * L, 0, 0.1 * L, 0.11 * W, 0, 0, Math.PI * 2);
  c.fillStyle = '#151515';
  c.fill();
  c.beginPath();
  c.arc(-0.03 * L, 0, 0.085 * W, 0, Math.PI * 2);
  c.fillStyle = '#ffd200';
  c.fill();
  c.lineWidth = line * 0.8;
  c.strokeStyle = '#111';
  c.stroke();
  // halo: a dark arc in front of the helmet
  c.strokeStyle = '#3a3a3a';
  c.lineWidth = line * 1.2;
  c.beginPath();
  c.ellipse(-0.01 * L, 0, 0.09 * L, 0.13 * W, 0, -Math.PI * 0.55, Math.PI * 0.55);
  c.stroke();
  cache.set(color, cv);
  return cv;
}

/** Draw the car at (x, y), nose along `angle` (radians), `L` px long. Returns the car width (px). */
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
    c.ellipse(L * 0.04, L * 0.05, L * 0.5, L * CAR_WIDTH * 0.5, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.drawImage(s, -w / 2, -h / 2, w, h);
  c.restore();
  return L * CAR_WIDTH;
}
