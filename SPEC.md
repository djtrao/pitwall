# Pit Wall – Build Spec for the F1 Manager Game

## 1. Goal

Build "Pit Wall", a Formula 1 team-manager game for phones. 1 to 4 players each use their own phone and race against each other and AI teams. It is made for children around 11 who already understand F1 strategy: tyres, pit stops, pushing versus saving tyres, and rain.

- Complexity like Motorsport Manager Mobile 1, but with **no car parts development**, no money, sponsors or staff.
- The fun comes from decisions: study the track, gamble in qualifying, choose tyres, call pit stops, react to rain and safety cars, and take risks in duels.
- The race is shown from above: a track outline with cars as coloured dots carrying their numbers, like Motorsport Manager.
- A playable single-file prototype exists: `pitwall.html`. Use it as the reference for look and feel, the tyre model, the weather model and the screen flow. This spec replaces it wherever they differ.

## 2. Platform and architecture

- **Mobile web app (PWA)**, portrait first, installable on the home screen, works on iPhone and Android browsers. No app store.
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
| Pit stop time loss | 18 to 25 s | cost of a pit stop |
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
- Lap time = base lap time from the race model (car, driver, tyre, wetness, light fuel) + corner results + small noise (±0.1 s).
- **Difficulty per player:** Rookie (slower marker) or Pro (faster marker), so kids of different ages can play together.

**Order and multiplayer**

- Each player plays driver 1 run 1, driver 2 run 1, then both second runs. In multiplayer, all players play at the same time on their own phones. A live leaderboard updates as runs finish. The session ends when everyone is done (time limit 4 minutes).
- The timing tap is measured on the phone and only the result is sent to the server, so network delay does not matter.
- AI drivers get simulated results with their own risk style (some always Safe, some gamble).
- Grid = best lap order. **Each driver starts the race on the tyre of their best lap.**

## 7. Race model

The race runs in real time. At 1× speed one lap takes about 20 seconds, so a race lasts 6 to 8 minutes. Each car's current lap time is:

```
T = T_base + car + driver + tyre + wear + fuel + mode + weather + noise
```

- **car:** team pace offset (humans equal, AI spread up to 0.6 s). **driver:** ±0.15 s for AI drivers, 0 for human drivers. **noise:** about ±0.3 s, new each lap.
- Cars cannot drive through each other: a faster car closes up to about 0.4 s behind and then has to pass in a duel (section 7.5).

### 7.1 Tyres

| Tyre | Pace | Wear per lap (× track wear factor) |
| --- | --- | --- |
| Soft | 0 s | 9% |
| Medium | +0.6 s | 6% |
| Hard | +1.2 s | 4% |
| Rain | see weather | 3% on a wet track, 14% when wetness is under 25% |

- **Worn tyres lose time more steeply than in the prototype:** wear penalty = (1 − condition) × 2.0 s, plus a cliff below 25%: (0.25 − condition) × 16 s. Fresh tyres must clearly pay off, so an early stop (undercut) is a real tactic.
- **Rules:** in a dry race each driver must use two different dry compounds, otherwise +20 s at the finish. Using rain tyres removes this rule. Each driver starts on the tyre of their best qualifying lap.

### 7.2 Fuel (no refuelling, like modern F1)

- Before the race, each player chooses the starting fuel for each driver, shown in laps: from 90% to 105% of the race distance, in steps of 0.5 laps. Default: race distance + 0.5 laps.
- **Weight:** each lap of fuel on board costs +0.12 s per lap. The car gets faster as fuel burns.
- **Consumption per lap** depends on the driving mode (section 7.3). Safety car laps use 50%.
- The driver card always shows a fuel projection: "Fuel to the finish: +0.8 laps" or "−1.2 laps – save fuel!". If the tank runs empty, the car stops and retires (DNF), with clear warnings well before.
- Starting light is a gamble: faster, but you must save fuel later, unless a safety car saves fuel for you.

### 7.3 Driving modes and mistakes

| Mode | Pace | Tyre wear | Fuel per lap | Mistake chance per lap |
| --- | --- | --- | --- | --- |
| Conserve | +0.5 s | ×0.6 | 0.75 | 0% |
| Normal | 0 s | ×1.0 | 1.00 | 0.5% |
| Push | −0.6 s | ×1.5 | 1.15 | 3% |
| Max Attack | −1.2 s | ×3.0 | 1.30 | 8% |

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
- **Slicks** lose (wetness − 15) × 0.12 s when wetness is over 15%. **Rain tyres** lose (35 − wetness) × 0.11 + 0.8 s. The crossover is around 30% wetness: show that number in the UI.
- The forecast shows a chance of rain per block of 4 laps. The further ahead, the fuzzier it is. It gets more accurate as the race goes on.

### 7.5 Overtaking duels

When a car is within 0.8 s of the car ahead for half a lap and is faster, a duel starts.

- If a human driver is involved, their phone shows a prompt with 6 seconds to choose. The race does not pause. If nobody answers, the game chooses automatically. Each player can switch on "Auto duels" per driver.
- **Attacker** chooses: Inside, Outside, or Wait (stay behind, save tyres). **Defender** chooses: Cover inside, Cover outside, or Let him go.
- AI-only duels are resolved automatically with the same table.

| Attacker \ Defender | Cover inside | Cover outside | Let him go |
| --- | --- | --- | --- |
| Inside | 20% pass | 70% pass | pass |
| Outside | 60% pass, 10% crash | 25% pass, 15% crash | pass |

- The pass chance is then multiplied by the track's overtaking factor (scaled so 0.5 = ×1.0) and gets +10% for each 0.3 s of pace advantage (fresher tyres, Push mode).
- **Failed attack:** attacker loses 0.3 s and 2% tyre condition. **Crash:** both lose 3 s, the attacker has a 30% chance of front wing damage (+0.8 s per lap until a pit stop repairs it, which adds 5 s to the stop).
- The same pair cannot duel again for one lap. At most one duel prompt per driver per lap.

### 7.6 Safety car

- Chance per race comes from the track (0.2 to 0.6). It can start anywhere between lap 2 and two laps before the end. A crash in a duel also has a 25% chance to bring it out.
- It lasts 2 to 4 laps. All cars bunch up behind the leader about 0.4 s apart, drive slowly, and cannot overtake. Tyre wear ×0.3, fuel use 50%.
- **A pit stop under the safety car costs only half the normal time loss.** Show a big "SAFETY CAR" banner and a radio message: "Safety car! Box now?"
- On the restart, duels are possible again straight away.

### 7.7 AI teams

- Use the prototype logic as a base: pit when tyres are worn, choose the compound that reaches the finish, respect the two-compound rule.
- Each AI driver has its own wetness threshold for switching to rain tyres (26 to 40%) and back (16 to 26%), so smart players can beat them with a good rain call.
- AI uses Normal mode, Push in the last 3 laps and in duels, Max Attack only rarely. It pits under a safety car if its tyres are older than about 40% of a stint.
- AI chooses its fuel load around race distance, with some variation.

## 8. Race screen and UI

- Layout as in the prototype, portrait first: top bar (lap counter, track name, speed buttons), track view, the player's two driver cards, weather panel, timing tower, team radio.
- **Track view:** top-down track, cars as dots in team colour with their number, the player's own cars highlighted. Pitting cars move along the pit lane. Rain shown as streaks, a wet track darker. Safety car shown as its own car.
- **Driver card:** position, tyre and condition bar, fuel projection, last lap, gap ahead and behind, buttons for the 4 driving modes, tyre choice + BOX button (pits at the end of the lap, can be cancelled), warnings (two-compound rule, fuel, damage).
- **Duel prompt:** a big, clear pop-up on the driver card with the three choices and a 6-second countdown.
- Big touch targets (at least 44 px), readable text for 11-year-olds, short words, colour plus icons (not colour alone).
- Results screen with positions gained or lost, pit stops, penalties, points; then the championship tables. A season-end screen with the champion.
- Sounds (engine hum, radio beep, "Box box") as an optional later step.

## 9. Multiplayer details

- **Lobby:** the host creates a game and gets a 4-letter code (plus a QR code). Others join with the code, set up or load their team and press Ready. The host picks the number of races and the race speed.
- The server is the only source of truth. Phones send commands: driving mode, pit plan, fuel choice, duel choice, qualifying results.
- Race speed is fixed by the host (1× or 2×). Only the host can pause.
- **Disconnect:** the cars keep driving in Normal mode with AI pit logic until the player reconnects. Rejoining with the same code restores control.
- **Single player** works without a server: the same simulation runs in the browser.

## 10. Balancing targets

Tune the numbers with the headless balance runner until these hold. Report the statistics after each tuning round.

- A race at 1× lasts 6 to 8 minutes.
- Dry race, medium-wear track: the best one-stop and two-stop strategies finish within about 3 s of each other. On high-wear tracks, two stops are better.
- Max Attack for a whole stint usually loses time (wear and mistakes). Short bursts of 1 to 3 laps (undercut, attacking on fresh tyres) usually gain.
- Good use of Push over a race gains 5 to 8 s compared with Normal.
- A good rain call (switching within one lap of the crossover) beats a late one (3 laps late) by 10 to 15 s.
- A pit stop under the safety car gains about 10 s compared with a normal stop.
- Starting 5% light on fuel is about break-even in a normal race and pays off with a safety car. Starting 10% light is a real gamble.
- A perfect Hot Lap is about 1.5 s faster than an all-Safe lap, which is worth several grid places.
- A well-played human team can win about 1 race in 3. A badly played team finishes midfield or lower.

## 11. Not in scope

- Car parts development or upgrades.
- Refuelling during pit stops (banned in F1).
- Boost / ERS button (maybe later).
- Money, sponsors, staff, contracts, driver training.
- Real team names, driver names, logos or real track names.

## 12. Build order

Build in these milestones. After each one: give me a link to play it on my phone, a short list of what changed, and what my kids should test. Ask before changing anything in this spec or adding features that are not in it.

1. Simulation core (tyres, fuel, modes, mistakes, weather, safety car, AI) with unit tests and the headless balance runner.
2. Single-player race screen with the track view, driver cards, timing tower, weather and radio.
3. Overtaking duels.
4. Hot Lap qualifying.
5. Team setup, track briefing, results, championship and season (8 tracks).
6. Multiplayer: lobby, server, reconnecting.
7. Polish: PWA install, German and English, sounds, final balancing.
