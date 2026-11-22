/**
 * Small Node.js game server (WebSocket). Good for testing and for playing on the same Wi-Fi
 * from a laptop:  npm run server   → ws://<laptop-ip>:8787
 * For playing over the internet the same Room runs on Cloudflare (see server/worker.ts).
 */
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { validCode, type ClientMsg, type ServerMsg } from '../net/protocol';
import { Room } from './room';

export function startServer(port = Number(process.env.PORT ?? 8787)) {
  const rooms = new Map<string, Room>();
  const sockets = new Map<string, Map<string, WebSocket>>(); // room → player → socket

  const roomFor = (code: string) => {
    let r = rooms.get(code);
    if (!r) {
      const conns = new Map<string, WebSocket>();
      sockets.set(code, conns);
      r = new Room(code, {
        send: (id: string, msg: ServerMsg) => {
          const ws = conns.get(id);
          if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
        },
        now: () => Date.now(),
        random: () => Math.random(),
      });
      rooms.set(code, r);
    }
    return r;
  };

  const http = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
    res.end('Pit Wall game server');
  });
  const wss = new WebSocketServer({ server: http });

  wss.on('connection', (ws, req) => {
    const m = /\/room\/([A-Z]{4})/.exec(req.url ?? '');
    if (!m || !validCode(m[1])) return ws.close(4000, 'bad room');
    const code = m[1];
    const room = roomFor(code);
    let playerId: string | null = null;
    ws.on('message', (data) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (msg.t === 'hello') {
        if (typeof msg.playerId !== 'string' || msg.playerId.length > 64) return;
        sockets.get(code)!.set(msg.playerId, ws);
        const err = room.hello(msg.playerId, msg);
        if (err) {
          ws.send(JSON.stringify({ t: 'error', code: err } satisfies ServerMsg));
          sockets.get(code)!.delete(msg.playerId);
          return;
        }
        playerId = msg.playerId;
      } else if (playerId) room.message(playerId, msg);
    });
    ws.on('close', () => {
      if (!playerId) return;
      if (sockets.get(code)?.get(playerId) === ws) {
        sockets.get(code)!.delete(playerId);
        room.disconnect(playerId);
      }
    });
  });

  // 10 ticks per second for every room; forget rooms nobody used for 30 minutes
  const timer = setInterval(() => {
    for (const [code, r] of rooms) {
      r.tick(0.1);
      if (r.connectedCount === 0 && Date.now() - r.lastActivity > 30 * 60 * 1000) {
        rooms.delete(code);
        sockets.delete(code);
      }
    }
  }, 100);

  http.listen(port);
  return {
    port,
    rooms,
    close: () => {
      clearInterval(timer);
      wss.close();
      http.close();
    },
  };
}

// started directly (npm run server)
if (process.argv[1] && /node\.ts$/.test(process.argv[1])) {
  const s = startServer();
  console.log(`Pit Wall game server on ws://localhost:${s.port}`);
}
