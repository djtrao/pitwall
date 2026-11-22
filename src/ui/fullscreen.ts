/**
 * Fullscreen + landscape lock. Works in Chrome on Android; iPhones don't allow it,
 * so the button is only shown where the browser supports fullscreen.
 */
export function canGoFullscreen(): boolean {
  return !!document.fullscreenEnabled && !document.fullscreenElement && !window.matchMedia('(display-mode: fullscreen)').matches;
}

export async function goFullscreen(): Promise<void> {
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    // lock() exists on Android Chrome but not in every browser's type definitions
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await orientation.lock?.('landscape');
  } catch {
    /* not allowed here – the game still works */
  }
}
