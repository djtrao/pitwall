/**
 * Pit Wall game server on Cloudflare Workers.
 * Every game code (e.g. "KYEU") gets its own Durable Object: one authoritative room per game,
 * running the same Room code as the Node server (src/server/room.ts).
 *
 *   wss://<your-worker>.workers.dev/room/KYEU
 */
import { Room } from '../src/server/room';
import { validCode, type ClientMsg, type ServerMsg } from '../src/net/protocol';

interface Env {
  ROOMS: DurableObjectNamespace;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const m = /^\/room\/([A-Z]{4})$/.exec(url.pathname);
    if (m && validCode(m[1])) {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
      return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(req);
    }
    return new Response('Pit Wall game server', { headers: { 'access-control-allow-origin': '*' } });
  },
};

export class GameRoom {
  private room: Room | null = null;
  private sockets = new Map<string, WebSocket>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(_state: DurableObjectState, _env: Env) {}

  async fetch(req: Request): Promise<Response> {
    const code = /\/room\/([A-Z]{4})/.exec(new URL(req.url).pathname)?.[1] ?? 'XXXX';
    if (!this.room) {
      this.room = new Room(code, {
        send: (id: string, msg: ServerMsg) => {
          const ws = this.sockets.get(id);
          if (!ws) return;
          try {
            ws.send(JSON.stringify(msg));
          } catch {
            /* socket already closed */
          }
        },
        now: () => Date.now(),
        random: () => Math.random(),
      });
    }
    const room = this.room;
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    let playerId: string | null = null;

    server.addEventListener('message', (ev) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.t === 'hello') {
        if (typeof msg.playerId !== 'string' || msg.playerId.length > 64) return;
        this.sockets.set(msg.playerId, server);
        const err = room.hello(msg.playerId, msg);
        if (err) {
          server.send(JSON.stringify({ t: 'error', code: err } satisfies ServerMsg));
          this.sockets.delete(msg.playerId);
          return;
        }
        playerId = msg.playerId;
      } else if (playerId) room.message(playerId, msg);
    });
    const closed = () => {
      if (playerId && this.sockets.get(playerId) === server) {
        this.sockets.delete(playerId);
        room.disconnect(playerId);
      }
    };
    server.addEventListener('close', closed);
    server.addEventListener('error', closed);

    // 10 ticks per second while somebody is around
    if (!this.timer) {
      this.timer = setInterval(() => {
        room.tick(0.1);
        if (room.connectedCount === 0 && Date.now() - room.lastActivity > 10 * 60 * 1000) {
          clearInterval(this.timer!);
          this.timer = null;
        }
      }, 100);
    }
    return new Response(null, { status: 101, webSocket: client });
  }
}
