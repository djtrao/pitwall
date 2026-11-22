// Two fake phones against a game server: lobby → briefing → qualifying → race.
// npx tsx scripts/mp-smoke.ts wss://pitwall-server.<name>.workers.dev
import WebSocket from 'ws';
const base = process.argv[2] ?? 'ws://localhost:8788';
const code = 'TEST'.split('').map(() => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
const team = (n: string, a: number, b: number) => ({ name: n, color: '#ff0', drivers: [{ name: n + ' A', num: a }, { name: n + ' B', num: b }] });
function phone(id: string, create: boolean, tm: ReturnType<typeof team>) {
  const ws = new WebSocket(`${base}/room/${code}`);
  const got: any[] = [];
  ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', playerId: id, team: tm, create })));
  ws.on('message', (d) => got.push(JSON.parse(String(d))));
  return { ws, got, send: (m: any) => ws.send(JSON.stringify(m)), last: (t: string) => [...got].reverse().find((m) => m.t === t) };
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const A = phone('pa', true, team('A', 5, 6));
  await wait(800);
  const B = phone('pb', false, team('B', 7, 8));
  await wait(800);
  console.log('lobby players:', A.last('lobby')?.players.length);
  B.send({ t: 'ready', ready: true });
  await wait(300);
  A.send({ t: 'start' });
  await wait(500);
  console.log('phase:', A.last('phase')?.phase);
  A.send({ t: 'briefingReady' });
  B.send({ t: 'briefingReady' });
  await wait(500);
  console.log('phase:', B.last('phase')?.phase);
  const lobby = A.last('lobby');
  for (const [P, pid] of [[A, 'pa'], [B, 'pb']] as const) {
    const tid = lobby.players.find((p: any) => p.id === pid).teamId;
    for (const run of [0, 1]) for (const n of [1, 2]) P.send({ t: 'qualiRun', run: { carId: `${tid}-${n}`, run, tyre: 'S', corners: [], time: 80 } });
  }
  await wait(5500);
  console.log('phase:', A.last('phase')?.phase);
  await wait(2000);
  const states = A.got.filter((m) => m.t === 'state');
  console.log('state messages in 2 s:', states.length, 'leader dist', states.at(-1)?.race.cars[0].dist.toFixed(3));
  A.ws.close(); B.ws.close();
  process.exit(0);
})();
