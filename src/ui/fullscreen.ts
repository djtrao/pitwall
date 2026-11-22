/**
 * Fullscreen on/off + landscape lock. Works in Chrome on Android; iPhones don't allow it,
 * so the button is only shown where the browser supports fullscreen.
 */
const ENTER_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
const EXIT_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';

export function supportsFullscreen(): boolean {
  return !!document.fullscreenEnabled && !window.matchMedia('(display-mode: fullscreen)').matches;
}

export const isFullscreen = () => !!document.fullscreenElement;

export async function toggleFullscreen(): Promise<void> {
  try {
    if (isFullscreen()) {
      const orientation = screen.orientation as ScreenOrientation & { unlock?: () => void };
      orientation.unlock?.();
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      // lock() exists on Android Chrome but not in every browser's type definitions
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await orientation.lock?.('landscape');
    }
  } catch {
    /* not allowed here – the game still works */
  }
}

/** HTML for the button (empty where fullscreen is not possible). */
export function fullscreenButton(label: string): string {
  return supportsFullscreen() ? `<button class="r-fs" data-fs aria-label="${label}">${isFullscreen() ? EXIT_ICON : ENTER_ICON}</button>` : '';
}

/** Wire every fullscreen button inside `root`; keeps the icon right when the state changes (also via the back button). */
export function wireFullscreen(root: HTMLElement, onChange: () => void): () => void {
  const update = () => {
    root.querySelectorAll<HTMLButtonElement>('[data-fs]').forEach((b) => (b.innerHTML = isFullscreen() ? EXIT_ICON : ENTER_ICON));
    onChange();
  };
  root.querySelectorAll<HTMLButtonElement>('[data-fs]').forEach((b) => (b.onclick = () => void toggleFullscreen()));
  document.addEventListener('fullscreenchange', update);
  return () => document.removeEventListener('fullscreenchange', update);
}
