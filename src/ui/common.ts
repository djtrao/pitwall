import { hasKey, t, type StringKey } from '../i18n';
import type { Track, Tyre } from '../sim';

export const TYRE_COLOR: Record<Tyre, string> = { S: '#ff3333', M: '#ffd400', H: '#f4f4f4', W: '#2f8cff' };

export const esc = (s: unknown) =>
  String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]!);

/** Round tyre icon with its letter (letter + colour, not colour alone). */
export const tyreIcon = (k: Tyre, small = false) => `<span class="td${small ? ' sm' : ''}" style="border-color:${TYRE_COLOR[k]}">${k}</span>`;

export const tyreName = (k: Tyre) => t(`tyre${k}`);

/** Translated track description (falls back to the English text in the track data). */
export function trackDesc(track: Track): string {
  const key = `desc_${track.id}` as StringKey;
  return hasKey(key) ? t(key) : track.desc;
}

export function shortName(name: string): string {
  const w = name.trim().split(/\s+/);
  return (w[w.length - 1] || 'DRV').slice(0, 3).toUpperCase();
}

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
