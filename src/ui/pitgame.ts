/**
 * Pit stop mini-game (about 3 s):
 * 8 spots on the car can light up (4 wheels, front jack, rear jack, front wing, engine).
 * In each stop 6 of them light up one after another in a random order – tap each as fast
 * as you can. Tapping a dark spot = something got stuck. A broken wing / engine is always
 * one of the 6 (it is being repaired). After the last one the car is released at once.
 * The reaction times are turned into an F1-style standing time (about 1.8 – 6 s).
 * If the player does not touch anything, the crew does an average stop.
 */
import { num, t } from '../i18n';
import { play } from './assets';

export interface PitResult {
  /** Standing time on the F1 scale (s). */
  seconds: number;
  unsafe: boolean;
  /** The player did not play – the crew did an average stop. */
  crew: boolean;
}

const WHEELS = ['fl', 'fr', 'rl', 'rr'] as const;
/** All spots that can light up. */
export const SPOTS = ['fl', 'fr', 'rl', 'rr', 'fj', 'rj', 'fw', 'en'] as const;
export type Spot = (typeof SPOTS)[number];
const TASKS = 6;
const WHEEL_TIMEOUT = 1.2;

let lastOrder = '';

/** Random wheel order (Fisher–Yates shuffle), never the same as the previous stop. */
export function shuffledWheels(): (typeof WHEELS)[number][] {
  let order: (typeof WHEELS)[number][];
  do {
    order = [...WHEELS];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  } while (order.join() === lastOrder);
  lastOrder = order.join();
  return order;
}

/**
 * The 6 jobs for this stop, in a random order: `forced` spots (damage repairs) are always included,
 * the rest is picked at random from all 8 spots. Never the same as the previous stop.
 */
export function pickSpots(forced: Spot[] = []): Spot[] {
  let order: Spot[];
  do {
    const pool = SPOTS.filter((x) => !forced.includes(x)) as Spot[];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    order = [...forced, ...pool].slice(0, TASKS);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  } while (order.join() === lastOrder);
  lastOrder = order.join();
  return order;
}

export function pitRating(seconds: number): string {
  if (seconds <= 2.2) return t('pitGreat');
  if (seconds <= 2.8) return t('pitGood');
  if (seconds <= 3.6) return t('pitSlow');
  return t('pitVerySlow');
}

/** Turn reaction times into a standing time on the F1 scale. */
export function stopSeconds(wheelTimes: number[], wrongTaps: number): number {
  const wheels = wheelTimes.reduce((s, r) => s + Math.max(0, r - 0.18) * 0.4, 0);
  return Math.round((1.8 + wheels + wrongTaps * 0.8) * 10) / 10;
}

/**
 * Runs the game inside `host` (an absolutely positioned overlay). Calls `done` with the result
 * as soon as the last spot is done (the car is released), then shows the time for a moment and calls `closed`.
 */
export function runPitGame(
  host: HTMLElement,
  title: string,
  avgStop: number,
  done: (r: PitResult) => void,
  closed: () => void,
  forced: Spot[] = [],
): void {
  const label: Record<Spot, string> = { fl: '', fr: '', rl: '', rr: '', fj: t('spotJack'), rj: t('spotJack'), fw: t('spotWing'), en: t('spotEngine') };
  host.innerHTML = `
    <div class="pg-title">${title}</div>
    <div class="pg-hint" id="pghint">${t('pitTapWheels')}</div>
    <div class="pg-car">
      <div class="pg-body"></div>
      ${SPOTS.map((w) => `<button class="pg-wheel pg-${w}${w.length && WHEELS.includes(w as never) ? '' : ' pg-part'}" data-w="${w}" aria-label="${w}">${label[w]}</button>`).join('')}
    </div>
    <div class="pg-result" id="pgres"></div>`;
  host.classList.add('show');

  const order = pickSpots(forced);
  const times: number[] = [];
  let wrong = 0;
  let taps = 0;
  let idx = -1;
  let litAt = 0;
  let phase: 'wheels' | 'over' = 'wheels';
  let timer = 0;
  const hint = host.querySelector<HTMLElement>('#pghint')!;

  const nextWheel = () => {
    host.querySelectorAll('.pg-wheel').forEach((b) => b.classList.remove('lit'));
    idx++;
    if (idx >= order.length) return finish();
    host.querySelector(`.pg-${order[idx]}`)!.classList.add('lit');
    litAt = performance.now();
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      // the crew does this wheel
      times.push(WHEEL_TIMEOUT);
      host.querySelector(`.pg-${order[idx]}`)!.classList.add('done');
      nextWheel();
    }, WHEEL_TIMEOUT * 1000);
  };

  const finish = () => {
    if (phase === 'over') return;
    phase = 'over';
    clearTimeout(timer);
    const crew = taps === 0;
    const seconds = crew ? avgStop : stopSeconds(times, wrong);
    done({ seconds, unsafe: false, crew });
    play('go');
    const res = host.querySelector<HTMLElement>('#pgres')!;
    res.innerHTML = `<b>${t('pitTime', { s: num(seconds) })}</b><span>${crew ? t('pitCrew') : pitRating(seconds)}</span>`;
    res.classList.add('show');
    // short, so you see your car leave the pit lane
    window.setTimeout(() => {
      host.classList.remove('show');
      host.innerHTML = '';
      closed();
    }, 1100);
  };

  host.querySelectorAll<HTMLButtonElement>('.pg-wheel').forEach((b) => {
    b.dataset.nosound = '1';
    b.onpointerdown = (e) => {
      e.preventDefault();
      if (phase !== 'wheels' || idx < 0) return;
      taps++;
      if (b.dataset.w === order[idx]) {
        times.push((performance.now() - litAt) / 1000);
        b.classList.add('done');
        play('gun');
        clearTimeout(timer);
        nextWheel();
      } else {
        wrong++;
        play('bad', 0.6);
        b.classList.add('wrong');
        hint.textContent = t('pitStuck');
        window.setTimeout(() => b.classList.remove('wrong'), 300);
      }
    };
  });

  window.setTimeout(nextWheel, 350);
}
