/**
 * Multiplayer: create or join a game with a 4-letter code (or QR code), lobby, and then every
 * phone follows the server through briefing → qualifying → race → results.
 */
import qrcode from 'qrcode-generator';
import { t, type StringKey } from '../i18n';
import { currentTrack, type Season } from '../game/season';
import { loadTeam } from '../game/store';
import { Connection, saveServerUrl, serverUrl, type ConnStatus } from '../net/client';
import { randomCode, validCode, type PhaseInfo, type PlayerInfo, type ServerMsg, type Settings } from '../net/protocol';
import { applyCommand, generateWeather, makeRng, makeTuning, mpCardSlot, withCardPerks, type Car, type Command, type QualiRun, type RaceEvent, type RaceState } from '../sim';
import { $, esc } from '../ui/common';
import { briefingScreen } from './briefing';
import { cardsScreen } from './cards';
import { qualiScreen } from './quali';
import { raceScreen, type RaceSource } from './race';
import { resultsScreen, seasonEndScreen } from './results';
import { teamScreen } from './team';

const tuning = makeTuning();
const LAST_GAME = 'pitwall-mp-game';

function rememberGame(code: string | null) {
  try {
    if (code) localStorage.setItem(LAST_GAME, code);
    else localStorage.removeItem(LAST_GAME);
  } catch {
    /* ignore */
  }
}
export function lastGame(): string | null {
  try {
    return localStorage.getItem(LAST_GAME);
  } catch {
    return null;
  }
}

/** Race from the server: snapshots 5× per second, drawn smoothly in between. */
class RemoteRace implements RaceSource {
  race: RaceState;
  speedMode: 'host' | 'none';
  paused = false;
  private events: RaceEvent[] = [];
  private prev = new Map<string, number>();
  private at = performance.now();
  private interval = 200;

  constructor(
    snap: Omit<RaceState, 'events'>,
    events: RaceEvent[],
    public myTeam: string,
    host: boolean,
    private conn: Connection,
  ) {
    this.events = [...events];
    this.race = { ...snap, events: this.events };
    this.speedMode = host ? 'host' : 'none';
  }

  update(snap: Omit<RaceState, 'events'>, events: RaceEvent[], paused: boolean) {
    const now = performance.now();
    this.interval = Math.min(400, Math.max(100, now - this.at));
    this.at = now;
    this.prev = new Map(this.race.cars.map((c) => [c.id, c.dist]));
    const known = this.events.length ? this.events[this.events.length - 1].id : 0;
    for (const e of events) if (e.id > known) this.events.push(e);
    this.race = { ...snap, events: this.events };
    this.paused = paused;
  }

  command(cmd: Command) {
    applyCommand(this.race, cmd); // show it at once; the server's next snapshot confirms it
    this.conn.send({ t: 'cmd', cmd });
  }
  advance() {
    /* the server runs the race */
  }
  dist(c: Car): number {
    const p = this.prev.get(c.id) ?? c.dist;
    const a = Math.min(1, (performance.now() - this.at) / this.interval);
    return Math.abs(c.dist - p) > 0.1 ? c.dist : p + (c.dist - p) * a;
  }
  setSpeed(speed: number) {
    this.conn.send({ t: 'speed', speed: speed as 0 | 1 | 2 });
  }
  hostSpeed() {
    return this.paused ? 0 : this.race.speed;
  }
}

export function multiplayerScreen(app: HTMLElement, back: () => void, joinCode?: string): void {
  let conn: Connection | null = null;
  let myId = '';
  let players: PlayerInfo[] = [];
  let settings: Settings = { races: 3, speed: 1, cards: true };
  let info: PhaseInfo | null = null;
  let shown = ''; // which phase screen is on display ("race:2" …)
  let stopScreen: (() => void) | null = null;
  let remote: RemoteRace | null = null;
  let qualiCb: ((runs: QualiRun[], left: number) => void) | null = null;
  let lastQuali: { runs: QualiRun[]; left: number } | null = null;
  let status: ConnStatus = 'connecting';
  let error = '';

  const me = () => players.find((p) => p.id === myId);
  const isHost = () => !!me()?.host;

  /* ---------- start: create or join ---------- */
  function startView() {
    stopScreen?.();
    stopScreen = null;
    shown = '';
    const url = serverUrl();
    const team = loadTeam();
    const resume = lastGame();
    app.innerHTML = `
      <div class="row-between"><h1>📱📱 ${t('mMulti')}</h1><button id="back">${t('back')}</button></div>
      ${error ? `<div class="err">⚠️ ${esc(error)}</div>` : ''}
      ${!url ? `<div class="panel"><p>${t('mpNoServer')}</p></div>` : ''}
      <div class="menugrid">
        <div class="panel teamcard" style="border-left:6px solid ${team.color}">
          <h3>${t('yourTeam')}</h3>
          <div class="tc-name">${esc(team.name)}</div>
          ${team.drivers.map((d) => `<div class="tc-drv">#${d.num} ${esc(d.name)}</div>`).join('')}
          <button class="mt" id="team">✏️ ${t('mEditTeam')}</button>
        </div>
        <div class="panel">
          <h3>👑 ${t('mpCreate')}</h3>
          <p class="hint">${t('mpCreateHint')}</p>
          <button class="big" id="create" ${url ? '' : 'disabled'}>${t('mpCreate')}</button>
        </div>
        <div class="panel">
          <h3>🔑 ${t('mpJoin')}</h3>
          <label for="code">${t('mpCodeHint')}</label>
          <input id="code" class="codein" maxlength="4" autocapitalize="characters" autocomplete="off" value="${esc(joinCode ?? resume ?? '')}" />
          <button class="big" id="join" ${url ? '' : 'disabled'}>${t('mpJoin')}</button>
        </div>
        <div class="panel">
          <h3>⚙️ ${t('mpServer')}</h3>
          <input id="srv" placeholder="wss://…" value="${esc(url ?? '')}" />
          <button class="mt" id="srvsave">${t('tSave')}</button>
        </div>
      </div>`;
    $('back').onclick = () => {
      conn?.close();
      back();
    };
    $('team').onclick = () => teamScreen(app, () => startView(), startView);
    $('srvsave').onclick = () => {
      saveServerUrl(($('srv') as HTMLInputElement).value);
      startView();
    };
    const codeIn = $('code') as HTMLInputElement;
    codeIn.oninput = () => (codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z]/g, ''));
    $('create').onclick = () => connect(randomCode(), true);
    $('join').onclick = () => {
      const c = codeIn.value.toUpperCase();
      if (validCode(c)) connect(c, false);
      else codeIn.focus();
    };
  }

  function connect(code: string, create: boolean) {
    const url = serverUrl();
    if (!url) return;
    error = '';
    conn?.close();
    app.innerHTML = `<h1>${t('mpConnecting')}</h1>`;
    conn = new Connection(url, code, create, loadTeam(), onMsg, (s) => {
      status = s;
      const bar = document.getElementById('mpstatus');
      if (bar) bar.textContent = s === 'reconnecting' ? t('mpReconnecting') : '';
      if (s === 'reconnecting' && !document.getElementById('mpstatus')) showStatusBadge();
    });
  }

  function showStatusBadge() {
    const d = document.createElement('div');
    d.id = 'mpstatus';
    d.className = 'mpstatus';
    d.textContent = status === 'reconnecting' ? t('mpReconnecting') : '';
    document.body.appendChild(d);
  }

  /* ---------- messages from the server ---------- */
  function onMsg(m: ServerMsg) {
    switch (m.t) {
      case 'welcome':
        myId = m.playerId;
        rememberGame(m.code);
        if (!document.getElementById('mpstatus')) showStatusBadge();
        return;
      case 'error':
        if (m.code === 'roomTaken') return connect(randomCode(), true); // try another code
        error = t(`mpErr_${m.code}` as StringKey);
        if (m.code === 'noRoom' || m.code === 'started') rememberGame(null);
        conn?.close();
        conn = null;
        startView();
        return;
      case 'lobby':
        players = m.players;
        settings = m.settings;
        if (!info || info.phase === 'lobby') lobbyView();
        return;
      case 'phase':
        info = m;
        render();
        return;
      case 'quali':
        lastQuali = { runs: m.runs, left: m.left };
        qualiCb?.(m.runs, m.left);
        return;
      case 'state':
        if (remote) remote.update(m.race, m.events, m.paused);
        else if (info?.phase === 'race' || info?.phase === 'results') {
          remote = new RemoteRace(m.race, m.events, me()?.teamId ?? '', isHost(), conn!);
          render();
        }
        return;
    }
  }

  /* ---------- lobby ---------- */
  function lobbyView() {
    if (!conn) return;
    shown = 'lobby';
    const code = conn.code;
    const joinUrl = `${location.origin}${location.pathname}?join=${code}`;
    const qr = qrcode(0, 'M');
    qr.addData(joinUrl);
    qr.make();
    const host = isHost();
    const allReady = players.filter((p) => p.connected).every((p) => p.ready || p.host);
    app.innerHTML = `
      <div class="row-between"><h1>${t('mMulti')}</h1><button id="leave">${t('mpLeave')}</button></div>
      <div class="lobbygrid">
        <div class="panel codecard">
          <h3>${t('mpYourCode')}</h3>
          <div class="bigcode">${code}</div>
          <div class="qr">${qr.createSvgTag({ cellSize: 4, margin: 2 })}</div>
          <p class="hint">${t('mpShare')}</p>
        </div>
        <div class="panel">
          <h3>${t('mpPlayers')} (${players.length}/4)</h3>
          ${players
            .map(
              (p) => `<div class="lp ${p.id === myId ? 'me' : ''}" style="border-left-color:${p.team.color}">
                <div><b>${esc(p.team.name)}</b> ${p.host ? `<span class="pill host">👑 ${t('mpHost')}</span>` : ''}</div>
                <div class="mut small">${p.team.drivers.map((d) => `#${d.num} ${esc(d.name)}`).join(' · ')}</div>
                <div class="small">${!p.connected ? t('mpOffline') : p.ready || p.host ? t('mpIsReady') : t('mpWaiting')}</div>
              </div>`,
            )
            .join('')}
          ${!host ? `<button class="mt" id="team">✏️ ${t('mEditTeam')}</button>` : ''}
        </div>
        <div class="panel">
          ${
            host
              ? `<h3>${t('mpRaces')}</h3>
                 <div class="seg">${[3, 5, 8].map((n) => `<button data-races="${n}" class="${settings.races === n ? 'on' : ''}">${n}</button>`).join('')}</div>
                 <h3 class="mt">${t('mpSpeed')}</h3>
                 <div class="seg">${[1, 2].map((n) => `<button data-speed="${n}" class="${settings.speed === n ? 'on' : ''}">${n}×</button>`).join('')}</div>
                 <button class="opt mt${settings.cards ? ' on' : ''}" id="mpcards"><b>${t('optCards')}</b><small>${t('optCardsHint')}</small></button>
                 <button class="big mt" id="start" ${allReady ? '' : 'disabled'}>${t('mpStart')}</button>
                 ${allReady ? '' : `<p class="hint">${t('mpAllReady')}</p>`}`
              : `<p class="hint">${t('mpRaces')}: <b>${settings.races}</b> · ${t('mpSpeed')}: <b>${settings.speed}×</b> · ${t('optCards')} ${settings.cards ? '✅' : '❌'}</p>
                 <button class="big" id="ready">${me()?.ready ? t('mpNotReady') : t('mpReady')}</button>
                 <p class="hint">${t('mpWaitHost')}</p>`
          }
        </div>
      </div>`;
    $('leave').onclick = leave;
    const teamBtn = document.getElementById('team');
    if (teamBtn)
      teamBtn.onclick = () =>
        teamScreen(
          app,
          (tm) => {
            conn?.send({ t: 'team', team: tm });
            lobbyView();
          },
          lobbyView,
        );
    app.querySelectorAll<HTMLButtonElement>('[data-races]').forEach(
      (b) => (b.onclick = () => conn?.send({ t: 'settings', settings: { ...settings, races: Number(b.dataset.races) as 3 | 5 | 8 } })),
    );
    app.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(
      (b) => (b.onclick = () => conn?.send({ t: 'settings', settings: { ...settings, speed: Number(b.dataset.speed) as 1 | 2 } })),
    );
    const cardsBtn = document.getElementById('mpcards');
    if (cardsBtn) cardsBtn.onclick = () => conn?.send({ t: 'settings', settings: { ...settings, cards: !settings.cards } });
    const start = document.getElementById('start');
    if (start) start.onclick = () => conn?.send({ t: 'start' });
    const ready = document.getElementById('ready');
    if (ready) ready.onclick = () => conn?.send({ t: 'ready', ready: !me()?.ready });
  }

  function leave() {
    stopScreen?.();
    stopScreen = null;
    conn?.close();
    conn = null;
    rememberGame(null);
    document.getElementById('mpstatus')?.remove();
    document.body.classList.remove('racing');
    back();
  }

  /* ---------- the season, following the server ---------- */
  function render() {
    if (!info || !conn) return;
    const s = info.season;
    if (info.phase === 'lobby' || !s) return lobbyView();
    const key = `${info.phase}:${s.results.length}:${s.round}`;
    if (info.phase === 'briefing') {
      if (shown !== key) briefingView(s, key);
      else updateBriefingReady();
      return;
    }
    if (shown === key) return;
    if (info.phase === 'quali') return qualiView(s, key);
    if (info.phase === 'race') {
      if (!remote) return; // wait for the first snapshot
      return raceView(key);
    }
    if (info.phase === 'results') return resultsView(s, key);
    if (info.phase === 'seasonEnd') return seasonEndView(s, key);
  }

  function weatherFor(s: Season) {
    return generateWeather(currentTrack(s), makeRng(info!.seed, 1), tuning);
  }

  function briefingView(s: Season, key: string) {
    stopScreen?.();
    stopScreen = null;
    remote = null;
    shown = key;
    window.scrollTo(0, 0);
    briefingScreen(app, { track: currentTrack(s), weather: weatherFor(s), tuning, round: s.round, rounds: s.trackIds.length }, () => {
      if (!settings.cards || info?.readyIds.includes(myId)) {
        conn?.send({ t: 'briefingReady' });
        updateBriefingReady();
        return;
      }
      // driver cards: pick one of 3 for each of your drivers, then wait for the others
      window.scrollTo(0, 0);
      cardsScreen(
        app,
        { drivers: s.cars.filter((c) => c.teamId === me()?.teamId), owned: s.cards ?? {}, seed: info!.seed, season: true, slot: (c) => mpCardSlot(c.id) },
        (picks) => {
          conn?.send({ t: 'briefingReady', picks });
          app.innerHTML = `<h1>🃏 ${t('cardsTitle')}</h1><button class="big mt" id="bgo" disabled></button>`;
          updateBriefingReady();
        },
      );
    });
    updateBriefingReady();
  }

  function updateBriefingReady() {
    const btn = document.getElementById('bgo') as HTMLButtonElement | null;
    if (!btn || !info) return;
    const total = players.filter((p) => p.connected).length;
    if (info.readyIds.includes(myId)) {
      btn.disabled = true;
      btn.textContent = `${t('mpWaitOthers')} ${t('mpReadyCount', { n: info.readyIds.length, m: total })}`;
    } else btn.textContent = `${t('mpBriefingReady')} (${t('mpReadyCount', { n: info.readyIds.length, m: total })})`;
  }

  function qualiView(s: Season, key: string) {
    stopScreen?.();
    shown = key;
    lastQuali = null;
    window.scrollTo(0, 0);
    stopScreen = qualiScreen(
      app,
      {
        track: currentTrack(s),
        weather: weatherFor(s),
        tuning,
        seed: info!.seed,
        cars: settings.cards ? withCardPerks(s.cars, s.cards ?? {}) : s.cars,
        remote: {
          myTeam: me()?.teamId ?? '',
          submit: (run) => conn?.send({ t: 'qualiRun', run }),
          subscribe: (cb) => {
            qualiCb = cb;
            if (lastQuali) cb(lastQuali.runs, lastQuali.left);
          },
        },
      },
      () => {},
    );
  }

  function raceView(key: string) {
    stopScreen?.();
    shown = key;
    window.scrollTo(0, 0);
    stopScreen = raceScreen(app, remote!, () => {
      // results arrive from the server; show them now if they are already there
      shown = '';
      render();
    });
  }

  function resultsView(s: Season, key: string) {
    if (!remote) return;
    // keep the race screen until the player taps "see results"
    if (shown.startsWith('race:') && document.getElementById('banner')) {
      return;
    }
    stopScreen?.();
    stopScreen = null;
    shown = key;
    window.scrollTo(0, 0);
    const host = isHost();
    resultsScreen(
      app,
      remote.race,
      {
        nextLabel: host ? t('mpNext') : t('mpWaitNext'),
        next: () => host && conn?.send({ t: 'next' }),
        menu: leave,
      },
      s,
      info?.points,
      me()?.teamId,
    );
    if (!host) ($('next') as HTMLButtonElement).disabled = true;
  }

  function seasonEndView(s: Season, key: string) {
    stopScreen?.();
    stopScreen = null;
    shown = key;
    rememberGame(null);
    seasonEndScreen(app, s, { newSeason: leave, menu: leave }, me()?.teamId);
  }

  startView();
  if (joinCode && validCode(joinCode)) connect(joinCode, false);
}
