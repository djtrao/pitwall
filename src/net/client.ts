/**
 * Connection to the game server. Reconnects by itself (phones lose Wi-Fi, screens turn off);
 * after a reconnect the server gives control of your cars back.
 */
import type { Team } from '../game/team';
import type { ClientMsg, ServerMsg } from './protocol';


/** The player id stays the same on this phone, so rejoining a game restores control. */
export function playerId(): string {
  try {
    let id = localStorage.getItem('pitwall-player');
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, '').slice(0, 20);
      localStorage.setItem('pitwall-player', id);
    }
    return id;
  } catch {
    return `p${Math.floor(Math.random() * 1e12)}`;
  }
}

/**
 * Server address: a saved one (advanced setting), the one built into the app, or – when the
 * game itself runs from a computer on the local network – that computer on port 8787.
 */
export function serverUrl(): string | null {
  try {
    const saved = localStorage.getItem('pitwall-server');
    if (saved) return saved;
  } catch {
    /* ignore */
  }
  const built = (import.meta.env.VITE_SERVER_URL as string | undefined) || '';
  if (built) return built;
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\./.test(h)) return `ws://${h}:8787`;
  return null;
}

export function saveServerUrl(url: string): void {
  try {
    if (url.trim()) localStorage.setItem('pitwall-server', url.trim());
    else localStorage.removeItem('pitwall-server');
  } catch {
    /* ignore */
  }
}

export type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export class Connection {
  private ws: WebSocket | null = null;
  private closed = false;
  private welcomed = false;
  private retry = 0;
  private queue: ClientMsg[] = [];

  constructor(
    private base: string,
    readonly code: string,
    private create: boolean,
    private team: Team,
    private onMsg: (m: ServerMsg) => void,
    private onStatus: (s: ConnStatus) => void,
  ) {
    this.open();
  }

  private open() {
    this.onStatus(this.welcomed ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(`${this.base.replace(/\/$/, '')}/room/${this.code}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      // after the first welcome we always "join" (rejoin), never create again
      ws.send(JSON.stringify({ t: 'hello', playerId: playerId(), team: this.team, create: this.create && !this.welcomed } satisfies ClientMsg));
    };
    ws.onmessage = (e) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (m.t === 'welcome') {
        this.welcomed = true;
        this.onStatus('open');
        const q = this.queue;
        this.queue = [];
        q.forEach((x) => this.send(x));
      }
      if (m.t === 'error' && !this.welcomed) this.closed = true; // don't retry a refused join
      this.onMsg(m);
    };
    ws.onclose = () => {
      if (this.closed) return this.onStatus('closed');
      this.onStatus('reconnecting');
      const wait = Math.min(5000, 500 * 2 ** this.retry++);
      setTimeout(() => !this.closed && this.open(), wait);
    };
  }

  send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.welcomed) this.ws.send(JSON.stringify(msg));
    else if (msg.t !== 'hello') this.queue.push(msg);
  }

  close(): void {
    this.closed = true;
    try {
      this.ws?.send(JSON.stringify({ t: 'leave' } satisfies ClientMsg));
    } catch {
      /* ignore */
    }
    this.ws?.close();
  }
}
