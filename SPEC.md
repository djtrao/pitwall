# Pit Wall – Build Spec for the F1 Manager Game

## 1. Goal

Build "Pit Wall", a Formula 1 team-manager game for phones. 1 to 4 players each use their own phone and race against each other and AI teams. It is made for children around 11 who already understand F1 strategy: tyres, pit stops, pushing versus saving tyres, and rain.

- Complexity like Motorsport Manager Mobile 1, but with **no car parts development**, no money, sponsors or staff.
- The fun comes from decisions: study the track, gamble in qualifying, choose tyres, call pit stops, react to rain and safety cars, and take risks in duels.
- The race is shown from above: a track outline with cars as coloured dots carrying their numbers, like Motorsport Manager.
- A playable single-file prototype exists: `pitwall.html`. Use it as the reference for look and feel, the tyre model, the weather model and the screen flow. This spec replaces it wherever they differ.

## 2. Platform and architecture

- **Mobile web app (PWA)**, **landscape first** (the phone is held sideways, Android first), portrait still usable, installable on the home screen, works on iPhone and Android browsers. No app store.
- **TypeScript + Vite**, rendering with Canvas 2D. No heavy game engine needed.
- **Simulation as a pure, deterministic module** (seeded random number generator, no DOM). The same module runs in the browser for single player and on the server for multiplayer.
- **Multiplayer:** one authoritative server room per game, connected by WebSocket. Propose a free or very cheap hosting option (for example PartyKit / Cloudflare Durable Objects, or a small Node server on Fly.io) and explain the choice before building it.
- The server runs the race at 10 ticks per second and sends state to the phones about 5 times per second. Phones interpolate car positions smoothly and only send commands (driving mode, pit plan, duel choice, qualifying results).
- It must work on the same Wi-Fi and over the internet (kids at different homes).
- **Unit tests** (Vitest) for the simulation, and a **headless balance runner**: a script that simulates hundreds of races with scripted strategies and prints statistics (see section 10).
- UI text in **German (default) and English**, all strings in one translation file.

## 3. Game structure

- **Team setup:** each player names their team, picks a team colour, and names two drivers with car numbers (2 to 99, unique on the grid). Remember this on the phone.
- **Grid:** always 12 cars = 6 teams with 2 drivers each. Human teams first, AI teams fill the rest. Each player controls both of their drivers.
- **Fairness:** all human teams have exactly the same car speed. AI teams range from 0.0 to 0.6 s per lap slower or faster around the human level (one AI team clearly faster, one clearly slower). Use fictional team and driver names only.
- **Season:** the host picks 3, 5 or 8 races. Each round: Track briefing → Hot Lap qualifying → Race → Results and championship standings.
- **Points:** 25, 18, 15, 12, 10, 8, 6, 4, 2, 1 for places 1 to 10. Drivers' and teams' championships.

## 4. Tracks

Create 8 fictional tracks, each with its own drawn shape (closed spline, start/finish line on a straight, a pit lane drawn next to the start/finish straight). Each track has these values:

| Value | Range | What it changes |
| --- | --- | --- |
| Laps | 15 to 20 | race length |
| Base lap time | 70 to 90 s | simulation time |
| Tyre wear factor | 0.8 to 1.3 | how fast tyres wear |
| Overtaking factor | 0.2 (very hard) to 0.8 (easy) | duel success chances |
| Pit stop time loss | 18 to 25 s | cost of a pit stop (pit lane + an average 2.6 s standing time) |
| Rain chance | 0.1 to 0.6 | chance of rain during the event |
| Safety car chance | 0.2 to 0.6 | chance of a safety car per race |
| 3 key corners | names + position on the lap | used in Hot Lap qualifying |

Mix the tracks: a street circuit (hard overtaking, low wear, high safety car chance), a fast forest track (high wear, rainy), an all-rounder, and so on.

## 5. Track briefing screen

This is the "study the track" part. Show:

- The track drawing with the 3 key corners marked.
- Track facts in kid-friendly words with colour levels: laps, tyre wear (low / medium / high), overtaking (easy / medium / hard), pit stop cost in seconds, rain risk, safety car risk.
- A tyre guide for this track: speed difference and roughly how many laps each compound lasts in Normal and in Push mode.
- A weather forecast: chance of rain for qualifying and for each block of 4 race laps. Forecasts far in the future are fuzzy and get more accurate during the race.
- The rules in one line each: two different dry compounds in a dry race, start on your best qualifying tyre.

## 6. Hot Lap qualifying

Qualifying is a short mini-game, not a simulation. Each driver gets **2 runs** of one lap. The best lap counts for the grid. Each lap takes about 20 seconds to play.

**Flow of one run**

1. Choose a tyre (Soft, Medium, Hard, Rain). A second run on the same compound as the first gets +0.2 s (used tyres).
2. The car drives around the track view. Before each of the 3 key corners, the player chooses how hard to go (3 seconds to choose, default Safe).
3. Then a timing bar appears: a marker sweeps across it and the player taps at the braking point. The bar has a green zone in the middle and yellow zones beside it.
4. After the lap: lap time, position on the provisional leaderboard, and a short comment ("Great lap!", "Lap deleted – track limits").

| Choice | Green zone width | Hit green | Hit yellow | Miss |
| --- | --- | --- | --- | --- |
| Safe | 40% of bar | 0 s | +0.3 s | +0.5 s |
| Attack | 25% of bar | −0.25 s | +0.3 s | +1.2 s |
| Send it! | 12% of bar | −0.5 s | +0.4 s | 50%: lap deleted, else +2.0 s |

**Modifiers**

- Soft tyres make green zones 20% wider, Hard 15% narrower.
- Slick tyres on a wet track (over 30% wetness): zones 40% narrower. Rain tyres on a wet track: normal width.
- Lap time = base lap time from the race model (car, driver, tyre, wetness) + corner results + small noise (±0.1 s).
- **Difficulty per player:** Rookie (slower marker) or Pro (faster marker), so kids of different ages can play together.

**Order and multiplayer**

- Each player plays driver 1 run 1, driver 2 run 1, then both second runs. In multiplayer, all players play at the same time on their own phones. A live leaderboard updates as runs finish. The session ends when everyone is done (time limit 4 minutes).
- The timing tap is measured on the phone and only the result is sent to the server, so network delay does not matter.
- AI drivers get simulated results with their own risk style (some always Safe, some gamble).
- Grid = best lap order. **Each driver starts the race on the tyre of their best lap.**

## 7. Race model

The race runs in real time. At 1× speed one lap takes about 23 seconds, so a race lasts 6 to 8 minutes. Each car's current lap time is:

```
T = T_base + car + driver + tyre + wear + mode + weather + noise
```

- **car:** team pace offset (humans equal, AI spread up to 0.6 s). **driver:** ±0.15 s for AI drivers, 0 for human drivers. **noise:** about ±0.3 s, new each lap.
- Cars cannot drive through each other: a faster car closes up to about 0.4 s behind and then has to pass in a duel (section 7.5).

### 7.1 Tyres

| Tyre | Pace | Wear per lap (× track wear factor) |
| --- | --- | --- |
| Soft | 0 s | 12% |
| Medium | +0.6 s | 8% |
| Hard | +1.2 s | 5.5% |
| Rain | see weather | 3% on a wet track, 14% when wetness is under 25% |

- **Worn tyres lose time more steeply than in the prototype:** wear penalty = (1 − condition) × 2.5 s, plus a cliff below 25%: (0.25 − condition) × 16 s. Fresh tyres must clearly pay off, so an early stop (undercut) is a real tactic, and two stops are a real alternative to one.
- **Rules:** in a dry race each driver must use two different dry compounds, otherwise +20 s at the finish. Using rain tyres removes this rule. Each driver starts on the tyre of their best qualifying lap.

### 7.2 Fuel

- **No fuel system** (decided after milestone 1): no fuel choice, no fuel use, no fuel weight, no running dry. Like modern F1, there is no refuelling, and fuel management is left out to keep the game simple. Push and Max Attack are limited only by tyre wear and mistakes.

### 7.3 Driving modes and mistakes

| Mode | Pace | Tyre wear | Mistake chance per lap |
| --- | --- | --- | --- |
| Conserve | +0.5 s | ×0.6 | 0% |
| Normal | 0 s | ×1.0 | 0.5% |
| Push | −0.8 s | ×1.25 | 3% |
| Max Attack | −1.5 s | ×1.6 | 8% |

- The mistake chance goes up on worn tyres (up to ×2 below 40% condition) and on slick tyres on a wet track (up to ×3).
- **Small mistake** (lock-up, running wide): −1.5 to −2.5 s.
- **Big mistake** (10% of mistakes in Push, 25% in Max Attack): off the track, −5 s, and a flat-spotted tyre: condition −20% and +0.3 s per lap until the next stop.
- **Spin** on slicks in the wet: −6 s.
- Every mistake creates a team radio message so the kids understand what happened.

### 7.4 Weather

Keep the prototype model:

- The rain timeline is generated per lap before the event, with persistence (rain lasts several laps) and an intensity from light (0.25) to heavy (1.0).
- **Track wetness** (0 to 100%) rises while it rains (up to intensity × 100) and dries slowly after.
- All cars are slower when wet: +0.04 s per % wetness.
- **Slicks** lose (wetness − 15) × 0.075 s when wetness is over 15%. **Rain tyres** lose (35 − wetness) × 0.11 + 0.8 s. The crossover is around 31% wetness: show that number in the UI.
- The forecast shows a chance of rain per block of 4 laps. The further ahead, the fuzzier it is. It gets more accurate as the race goes on.

### 7.5 Overtaking duels

When a car is within 0.8 s of the car ahead for half a lap and is faster, a duel starts.

- **Duel close-up only for the car you are following:** when a player taps a driver card, the track zooms in and follows that car. When that car (one of your own) gets into a duel, the track view changes to a **close-up of the two cars**: the attacker sits behind and looks for a way past. **Both sides get 6 seconds** to choose (in multiplayer two players may fight each other; the AI decides at once but secretly). The race does not pause. If nobody answers, the driver decides by himself (same logic as the AI). Duels of cars you are not following are decided automatically, without a close-up.
- **Choices** (each with its chance in % and a risk symbol 🟢 🟡 🟠 🔴, colour + icon + word):

| Level | Attacker | Defender |
| --- | --- | --- |
| 0 | Wait (save tyres, no risk) | Let him go (lose no time) |
| 1 | Careful | Clean |
| 2 | Bold | Hard |
| 3 | Risky | Very hard |
| 4 | All or nothing! | Slam the door! |

- **Rules:** a higher attack level passes more often, a harder defence lets fewer cars through, and the harder both fight, the higher the crash risk. Base pass chance for attack levels 1–3: 40 / 55 / 70 %, minus 0 / 12 / 24 / 36 % for defence levels 1–4. Crash chance: attack 0 / 3 / 8 %, plus defence 0 / 2 / 5 / 10 %, plus 5 % if both fight at level 3 or more.
- **All or nothing** is a last-ditch effort: about 20 % success whatever the defender does, and a failure is almost always punished (85 %): a spin (−6 s), going off with a flat spot (−5 s), or contact (both −3 s, 60 % front wing damage).
- The pass chance is multiplied by the track's overtaking factor (0.5 = ×1.0) and gets +10 % per 0.3 s of pace advantage (at most +30 %).
- **Animation:** after both have chosen (or the 6 s are over), a ~3 s animation shows how it pans out. Three scenes, chosen by where the duel happens: a straight, a corner and a chicane. Each scene always starts the same way and then shows the ending: passed, defended, contact, spin, off the track, or waiting. The result counts in the race only after the animation (so the timing tower does not give it away).
- **Failed attack:** attacker loses 0.3 s and 2% tyre condition. **Crash:** both lose 3 s, the attacker has a 30% chance of front wing damage (+0.8 s per lap until a pit stop repairs it, which adds 5 s to the stop).

### 7.5b Pit stop game

- When one of your cars stops, a short game (about 3 s) appears on the track view: a top-down car, the 4 wheels light up one after another in random order – tap each as fast as possible (wrong wheel = stuck wheel nut). Then the release light: wait for green, then tap GO. Tapping on red is an unsafe release: +5 s penalty.
- The reaction times are turned into an F1-style standing time (about 1.9 s to 6 s) and shown with a rating: great (≤ 2.2 s), good (≤ 2.8 s), a bit slow (≤ 3.6 s), slow. The difference to the average 2.6 s changes the stop.
- If the player does not touch anything, the crew does an average stop (no penalty). AI crews vary a little and sometimes fumble (+2 s). The second car of a team that stops at the same time waits behind the first (+3 s).
- The game runs on the phone; only the result is sent to the server (like the Hot Lap timing). In single player at 4× the race slows to 2× while the game runs.
- The same pair cannot duel again for one lap. At most one duel prompt per driver per lap.

### 7.6 Safety car

- Chance per race comes from the track (0.2 to 0.6). It can start anywhere between lap 2 and two laps before the end. A crash in a duel also has a 25% chance to bring it out.
- It lasts 2 to 4 laps. All cars bunch up behind the leader about 0.4 s apart, drive slowly, and cannot overtake. Tyre wear ×0.3.
- **A pit stop under the safety car costs only half the normal time loss.** Show a big "SAFETY CAR" banner and a radio message: "Safety car! Box now?"
- On the restart, duels are possible again straight away.

### 7.7 AI teams

- Use the prototype logic as a base: pit when tyres are worn, choose the compound that reaches the finish, respect the two-compound rule.
- Each AI driver has its own wetness threshold for switching to rain tyres (26 to 40%) and back (16 to 26%), so smart players can beat them with a good rain call.
- AI uses Normal mode, Push in the last 3 laps and in duels, Conserve to nurse tyres to the finish, Max Attack only rarely. It pits under a safety car if its tyres are older than about 40% of a stint.

## 8. Race screen and UI

- **Landscape layout (main):** timing tower on the left, track view in the centre, the player's two compact driver cards on the right, a bottom bar with lap counter, weather (wetness, crossover marker, rain chance) and speed buttons. The newest team radio message shows as a strip on the track. A fullscreen button (Android) also locks landscape.
- **Portrait layout (fallback):** everything stacked: top bar, track view, driver cards, weather panel, timing tower, team radio.
- **Camera:** tapping a driver card (or a timing tower row) zooms the track in and follows that car; tapping again or tapping the track zooms out.
- **Track view:** top-down track, cars as dots in team colour with their number, the player's own cars highlighted. Pitting cars move along the pit lane. Rain shown as streaks, a wet track darker. Safety car shown as its own car.
- **Driver card:** position, tyre and condition bar, last lap, gap ahead and behind, buttons for the 4 driving modes, tyre choice + BOX button (pits at the end of the lap, can be cancelled), warnings (two-compound rule, worn tyres, damage).
- **Duel close-up:** the track view changes to a close-up of the two cars with the five choices, their chances and risk symbols, and a 6-second countdown bar; then the animation.
- Big touch targets (at least 44 px), readable text for 11-year-olds, short words, colour plus icons (not colour alone).
- Results screen with positions gained or lost, pit stops, penalties, points; then the championship tables. A season-end screen with the champion.
- Sounds (engine hum, radio beep, "Box box") as an optional later step.

## 9. Multiplayer details

- **Lobby:** the host creates a game and gets a 4-letter code (plus a QR code). Others join with the code, set up or load their team and press Ready. The host picks the number of races and the race speed.
- The server is the only source of truth. Phones send commands: driving mode, pit plan, duel choice, qualifying results.
- Race speed is fixed by the host (1× or 2×). Only the host can pause.
- **Disconnect:** the cars keep driving in Normal mode with AI pit logic until the player reconnects. Rejoining with the same code restores control.
- **Single player** works without a server: the same simulation runs in the browser.

## 10. Balancing targets

Tune the numbers with the headless balance runner until these hold. Report the statistics after each tuning round.

- A race at 1× lasts 6 to 8 minutes.
- Dry race: one stop is usually the best plan (pit stops are expensive); two stops only pay off with a safety car, mistakes or very worn tyres (decided after milestone 2).
- Max Attack for a whole stint usually loses time (wear and mistakes). Short bursts of 1 to 3 laps (undercut, attacking on fresh tyres) usually gain.
- Good use of Push over a race gains 5 to 8 s compared with Normal.
- A good rain call (switching within one lap of the crossover) beats a late one (3 laps late) by 10 to 15 s.
- A pit stop under the safety car gains clearly compared with a normal stop (about 8–10 s).
- A perfect Hot Lap is about 1.5 s faster than an all-Safe lap, which is worth several grid places.
- A well-played human team can win about 1 race in 3. A badly played team finishes midfield or lower.

## 11. Not in scope

- Car parts development or upgrades.
- Fuel: no refuelling (banned in F1) and no fuel management.
- Boost / ERS button (maybe later).
- Money, sponsors, staff, contracts, driver training.
- Real team names, driver names, logos or real track names.

## 12. Build order

Build in these milestones. After each one: give me a link to play it on my phone, a short list of what changed, and what my kids should test. Ask before changing anything in this spec or adding features that are not in it.

1. Simulation core (tyres, modes, mistakes, weather, safety car, AI) with unit tests and the headless balance runner.
2. Single-player race screen with the track view, driver cards, timing tower, weather and radio.
3. Overtaking duels.
4. Hot Lap qualifying.
5. Team setup, track briefing, results, championship and season (8 tracks).
6. Multiplayer: lobby, server, reconnecting.
7. Polish: PWA install, German and English, sounds, final balancing.
