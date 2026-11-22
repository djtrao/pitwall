/**
 * Pit stop mini-game (about 3 s):
 *  1. The 4 wheels light up one after another in a random order – tap each as fast as you can.
 *     Tapping the wrong wheel = stuck wheel nut.
 *  2. Release light: wait for GREEN, then tap GO. Tapping on red = unsafe release (penalty).
 * The reaction times are turned into an F1-style standing time (about 1.9 – 6 s).
 * If the player does not touch anything, the crew does an average stop.
 */
import { num, t } from '../i18n';

export interface PitResult {
  /** Standing time on the F1 scale (s). */
  seconds: number;
  unsafe: boolean;
  /** The player did not play – the crew did an average stop. */
  crew: boolean;
}

const WHEELS = ['fl', 'fr', 'rl', 'rr'] as const;
const WHEEL_TIMEOUT = 1.2;
const RELEASE_TIMEOUT = 1.5;

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

export function pitRating(seconds: number): string {
  if (seconds <= 2.2) return t('pitGreat');
  if (seconds <= 2.8) return t('pitGood');
  if (seconds <= 3.6) return t('pitSlow');
  return t('pitVerySlow');
}

/** Turn reaction times into a standing time on the F1 scale. */
export function stopSeconds(wheelTimes: number[], wrongTaps: number, release: number): number {
  const wheels = wheelTimes.reduce((s, r) => s + Math.max(0, r - 0.18) * 0.55, 0);
  return Math.round((1.8 + wheels + wrongTaps * 0.8 + Math.max(0, release - 0.15) * 0.6) * 10) / 10;
}

/**
 * Runs the game inside `host` (an absolutely positioned overlay). Calls `done` with the result
 * as soon as the car is released, then shows the time for a moment and calls `closed`.
 */
export function runPitGame(host: HTMLElement, title: string, avgStop: number, done: (r: PitResult) => void, closed: () => void): void {
  host.innerHTML = `
    <div class="pg-title">${title}</div>
    <div class="pg-hint" id="pghint">${t('pitTapWheels')}</div>
    <div class="pg-car">
      <div class="pg-body"></div>
      ${WHEELS.map((w) => `<button class="pg-wheel pg-${w}" data-w="${w}" aria-label="${w}"></button>`).join('')}
      <div class="pg-light" id="pglight"></div>
    </div>
    <button class="pg-go" id="pggo" disabled>${t('pitGo')}</button>
    <div class="pg-result" id="pgres"></div>`;
  host.classList.add('show');

  const order = shuffledWheels();
  const times: number[] = [];
  let wrong = 0;
  let taps = 0;
  let idx = -1;
  let litAt = 0;
  let phase: 'wheels' | 'red' | 'green' | 'over' = 'wheels';
  let greenAt = 0;
  let timer = 0;
  const hint = host.querySelector<HTMLElement>('#pghint')!;
  const light = host.querySelector<HTMLElement>('#pglight')!;
  const go = host.querySelector<HTMLButtonElement>('#pggo')!;

  const nextWheel = () => {
    host.querySelectorAll('.pg-wheel').forEach((b) => b.classList.remove('lit'));
    idx++;
    if (idx >= order.length) return startRelease();
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

  const startRelease = () => {
    phase = 'red';
    hint.textContent = t('pitWaitGreen');
    light.className = 'pg-light red';
    go.disabled = false;
    timer = window.setTimeout(() => {
      phase = 'green';
      greenAt = performance.now();
      light.className = 'pg-light green';
      timer = window.setTimeout(() => finish(RELEASE_TIMEOUT * 0.66, false), RELEASE_TIMEOUT * 1000);
    }, 400 + Math.random() * 800);
  };

  const finish = (release: number, unsafe: boolean) => {
    if (phase === 'over') return;
    phase = 'over';
    clearTimeout(timer);
    go.disabled = true;
    const crew = taps === 0;
    const seconds = crew ? avgStop : stopSeconds(times, wrong, release);
    done({ seconds, unsafe, crew });
    const res = host.querySelector<HTMLElement>('#pgres')!;
    res.innerHTML = `<b>${t('pitTime', { s: num(seconds) })}</b><span>${crew ? t('pitCrew') : pitRating(seconds)}</span>${
      unsafe ? `<span class="bad">${t('pitUnsafe', { s: 5 })}</span>` : ''
    }`;
    res.classList.add('show');
    window.setTimeout(() => {
      host.classList.remove('show');
      host.innerHTML = '';
      closed();
    }, 1800);
  };

  host.querySelectorAll<HTMLButtonElement>('.pg-wheel').forEach((b) => {
    b.onpointerdown = (e) => {
      e.preventDefault();
      if (phase !== 'wheels' || idx < 0) return;
      taps++;
      if (b.dataset.w === order[idx]) {
        times.push((performance.now() - litAt) / 1000);
        b.classList.add('done');
        clearTimeout(timer);
        nextWheel();
      } else {
        wrong++;
        b.classList.add('wrong');
        hint.textContent = t('pitStuck');
        window.setTimeout(() => b.classList.remove('wrong'), 300);
      }
    };
  });
  go.onpointerdown = (e) => {
    e.preventDefault();
    taps++;
    if (phase === 'red') finish(0, true);
    else if (phase === 'green') finish((performance.now() - greenAt) / 1000, false);
  };

  window.setTimeout(nextWheel, 350);
}
