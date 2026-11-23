# Pit Wall

A Formula 1 team-manager game for phones (1–4 players). See [SPEC.md](SPEC.md) for the full plan.
`pitwall.html` is the original single-file prototype (reference only).

**Play / watch:** https://djtrao.github.io/pitwall/ (updates automatically when `main` changes)

## Status

| Milestone | What | State |
| --- | --- | --- |
| 1 | Simulation core + unit tests + balance runner | ✅ done |
| 2 | Single-player race screen (German + English) | ✅ done |
| 2b | Landscape layout, follow camera | ✅ done |
| 3 | Overtaking duels (close-up + animations) and pit stop game | ✅ done |
| 4 | Hot Lap qualifying | ✅ done |
| 5 | Team setup, briefing, season, 8 tracks | ✅ done |
| 6 | Multiplayer (lobby, server, reconnecting) | ✅ done – server setup: [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md) |
| 7 | Polish: PWA install, sounds, final balancing | next |

## Spielanleitung (für die Kinder)

- [Qualifying](docs/anleitung/Anleitung-1-Qualifying.png)
- [Zweikampf](docs/anleitung/Anleitung-2-Zweikampf.png)
- [Boxenstopp](docs/anleitung/Anleitung-3-Boxenstopp.png)

## Project layout

```
src/sim/        the race engine (pure TypeScript, no browser code – also runs on the server later)
  tuning.ts     ALL balance numbers in one place (SPEC.md values, tuned)
  model.ts      lap time, tyre wear, weather penalties, mistakes
  race.ts       the race loop: createRace(), step(), applyCommand(), results()
  ai.ts         AI pit stops, rain calls, driving modes, duel choices
  weather.ts    rain timeline and forecasts
  tracks.ts     the 8 tracks
  teams.ts      fictional AI teams, points
  grid.ts       building the 12-car field
  quali.ts      Hot Lap qualifying rules, AI laps, grid
src/game/       season, championship, team (+ saving on the phone)
src/net/        multiplayer messages and the connection to the server
src/server/     the multiplayer game room (+ a small Node server)
server/         the same room on Cloudflare (Workers + Durable Objects)
src/screens/    menu, team, briefing, qualifying, race, results, multiplayer
src/ui/         track drawing, duel close-up, pit stop game, helpers
src/i18n.ts     all UI text, German and English
tests/          unit tests (Vitest)
scripts/        balance runner and a quick one-race printout
docs/           latest balance report
```

## Commands

You need [Node.js](https://nodejs.org) 22 or newer. Run these in the project folder:

```bash
npm install
```

```bash
npm test
```

```bash
npm run balance -- --quick
```

```bash
npm run dev
```

- `npm install` downloads the tools (once).
- `npm test` runs all unit tests.
- `npm run balance` simulates hundreds of races and prints the section 10 statistics (`--quick` for a fast run, `--only stops,push` for some sections, `--tuning '{"pitLossScale":0.5}'` to try other numbers).
- `npm run dev` starts the game on your computer (open the address it prints).
- `npm run server` starts the multiplayer server on your computer (port 8787).

## Grafik und Töne

Autos, Streckendeko, Symbole und Soundeffekte stammen aus den Packs von **Kenney** (www.kenney.nl, Lizenz CC0 – frei nutzbar). Sie liegen in `public/kenney/`.
