/**
 * Graphics and sounds from the Kenney packs (CC0, www.kenney.nl), served from public/kenney.
 * Everything loads in the background; drawing code falls back to plain shapes until an image is ready.
 */
const BASE = `${import.meta.env.BASE_URL}kenney/`;

const images = new Map<string, HTMLImageElement>();

/** A loaded image, or null while it is still loading. */
export function img(name: string): HTMLImageElement | null {
  let im = images.get(name);
  if (!im) {
    im = new Image();
    im.src = `${BASE}img/${name}.png`;
    images.set(name, im);
  }
  return im.complete && im.naturalWidth > 0 ? im : null;
}

export const icon = (name: string, cls = 'ic') => `<img class="${cls}" src="${BASE}icons/${name}.png" alt="" draggable="false">`;

const SPRITES = [
  'grass', 'tribune_full', 'tribune_overhang_red', 'tent_red_large', 'tent_blue_large',
  'tree_large', 'tree_small', 'tires_red', 'tires_white', 'barrier_red_race', 'barrier_white_race', 'lights',
] as const;

/** Start loading all sprites (call once at start-up). */
export function preload(): void {
  for (const s of SPRITES) img(s);
}

/** Resolves when all sprites have loaded (or failed), for screens that draw only once. */
export function whenReady(): Promise<void> {
  preload();
  return Promise.all(
    SPRITES.map((s) => {
      const im = images.get(s)!;
      if (im.complete) return Promise.resolve();
      return new Promise<void>((ok) => {
        im.addEventListener('load', () => ok(), { once: true });
        im.addEventListener('error', () => ok(), { once: true });
      });
    }),
  ).then(() => undefined);
}

// ---------------------------------------------------------------- sounds

export type Sfx =
  | 'click' | 'select' | 'good' | 'bad' | 'tick' | 'go' | 'crash' | 'bump' | 'gun' | 'pass' | 'radio'
  // made for Pit Wall (not from Kenney): wheel gun, overtaking jingles, qualifying hits
  | 'wrench' | 'passup' | 'passdown' | 'qgreen' | 'qyellow' | 'qmiss' | 'lred' | 'lgreen';
const MUTE_KEY = 'pitwall.mute';
let ctx: AudioContext | null = null;
const buffers = new Map<Sfx, AudioBuffer>();
const VOLUME: Partial<Record<Sfx, number>> = { click: 0.5, select: 0.5, tick: 0.7, radio: 0.4, gun: 0.8, passup: 1.4, passdown: 1.4, qyellow: 1.3, qmiss: 1.3, lred: 0.9, lgreen: 0.9 };

export function muted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(m: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* ignore */
  }
}

async function load(name: Sfx): Promise<void> {
  if (!ctx || buffers.has(name)) return;
  try {
    const res = await fetch(`${BASE}sfx/${name}.mp3`);
    buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
  } catch {
    /* no sound then */
  }
}

/** Browsers only allow audio after a tap: create the audio context on the first one. */
function unlock(): void {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    for (const s of ['click', 'select', 'good', 'bad', 'tick', 'go', 'crash', 'bump', 'gun', 'pass', 'radio', 'wrench', 'passup', 'passdown', 'qgreen', 'qyellow', 'qmiss', 'lred', 'lgreen'] as Sfx[])
      void load(s);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

export function play(name: Sfx, volume = 1): void {
  if (muted() || !ctx) return;
  const b = buffers.get(name);
  if (!b) return;
  const src = ctx.createBufferSource();
  src.buffer = b;
  const g = ctx.createGain();
  g.gain.value = volume * (VOLUME[name] ?? 1);
  src.connect(g).connect(ctx.destination);
  src.start();
}

/** Unlock audio on the first tap and give every button a soft click. */
export function initSound(): void {
  window.addEventListener('pointerdown', (e) => {
    unlock();
    const b = (e.target as HTMLElement | null)?.closest?.('button');
    if (b && !b.disabled && !b.dataset.nosound) play('click');
  }, { capture: true });
}

/** Button that switches sound on and off (wire it with `wireSound`). */
export function soundButton(label: string): string {
  return `<button class="r-fs" data-sound aria-label="${label}">${icon(muted() ? 'audioOff' : 'audioOn')}</button>`;
}

export function wireSound(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>('[data-sound]').forEach((b) => {
    b.onclick = () => {
      setMuted(!muted());
      b.innerHTML = icon(muted() ? 'audioOff' : 'audioOn');
      play('click');
    };
  });
}
