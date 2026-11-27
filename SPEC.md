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
- **Multiplayer:** one authoritative server room per game, connected by WebSocket. **Chosen: Cloudflare Workers + Durable Objects (free plan)** – one Durable Object per game code = one authoritative room per game, never sleeps, no credit card. The same room code also runs as a small Node server (`npm run server`) for testing and for playing on the same Wi-Fi from a laptop. Setup guide: `docs/MULTIPLAYER.md`.
- The server runs the race at 10 ticks per second and sends state to the phones about 5 times per second. Phones interpolate car positions smoothly and only send commands (driving mode, pit plan, duel choice, qualifying results).
- It must work on the same Wi-Fi and over the internet (kids at different homes).
- **Unit tests** (Vitest) for the simulation, and a **headless balance runner**: a script that simulates hundreds of races with scripted strategies and prints statistics (see section 10).
- UI text in **German (default) and English**, all strings in one translation file.

## 3. Game structure

- **Team setup:** each player names their team, picks a team colour, and names two drivers with car numbers (2 to 99, unique on the grid). Remember this on the phone.
- **Grid:** always 12 cars = 6 teams with 2 drivers each. Human teams first, AI teams fill the rest. Each player controls both of their drivers.
- **Fairness:** all human teams have exactly the same car speed. AI teams range up to about 0.9 s per (78 s) lap slower or faster than the human level, so the field splits into groups during a race (one or two clearly faster teams, one clearly slower). **AI teams use the real current F1 teams, drivers, car numbers and (approximate) team colours** (decided after milestone 6); their speed follows the current championship standings (team pace) and teammate comparison (driver skill). Each race / season picks 5 of the 11 teams at random.
- **Season:** the host picks 3, 5 or 8 races. Each round: Track briefing → Hot Lap qualifying → Race → Results and championship standings.
- **Points:** 25, 18, 15, 12, 10, 8, 6, 4, 2, 1 for places 1 to 10. Drivers' and teams' championships.

## 4. Tracks

Create 8 fictional tracks, each with its own drawn shape (closed spline, start/finish line on a straight, a pit lane drawn next to the start/finish straight). Each track has these values:

| Value | Range | What it changes |
| --- | --- | --- |
| Laps | 11 to 12 | race length (long, winding tracks: a lap takes about 32–36 s at 1×) |
| Base lap time | 110 to 125 s | simulation time (per-lap effects are defined for a 78 s lap and scale with it) |
| Tyre wear factor | 0.8 to 1.3 | how fast tyres wear |
| Overtaking factor | 0.2 (very hard) to 0.8 (easy) | duel success chances |
| Pit stop time loss | 18 to 25 s | cost of a pit stop (pit lane + an average 2.6 s standing time) |
| Rain chance | 0.2 to 0.75 | chance of rain during the event (showers come and go) |
| Safety car chance | 0.2 to 0.6 | chance of a safety car per race |
| 3 key corners | names + position on the lap | braking points in Hot Lap qualifying, kerbs and labels on the map |
| 3 more bends | names + position on the lap | extra braking points in Hot Lap qualifying |

Mix the tracks: a street circuit (hard overtaking, low wear, high safety car chance), a fast forest track (high wear, rainy), an all-rounder, and so on.

## 5. Track briefing screen

This is the "study the track" part. Show:

- The track drawing with the 3 key corners marked.
- Track facts in kid-friendly words with colour levels: laps, tyre wear (low / medium / high), overtaking (easy / medium / hard), pit stop cost in seconds, rain risk, safety car risk.
- A tyre guide for this track: speed difference and roughly how many laps each compound lasts in Normal and in Push mode.
- A weather forecast: chance of rain for qualifying and for each block of 4 race laps. Forecasts far in the future are fuzzy and get more accurate during the race.
- The rules in one line each: two different dry compounds in a dry race, start on your best qualifying tyre.

## 6. Hot Lap qualifying

Qualifying is a short mini-game, not a simulation. Each driver gets **one flying lap** with **6 braking points**: the 3 key corners plus 3 more bends (`bends` in the track data). That lap counts for the grid. Each lap takes about 30–40 seconds to play.

**Flow of one run**

1. Choose a tyre (Soft, Medium, Hard, Rain).
2. The car drives around the track view. Before each of the 6 braking points, the player chooses how hard to go (3 seconds to choose, default Safe).
3. Then a timing bar appears: a marker sweeps across it and the player taps at the braking point. The braking point (green zone with yellow zones beside it) sits at a **random place** on the bar (30–72 %), and the marker **speeds up** while it moves, so the timing cannot be learned by heart. More risk also means a faster marker (braking later): Safe ×1, Attack ×1.25, Send it! ×1.6. Send it! leaves only about 0.05 s.
4. After the lap: lap time, position on the provisional leaderboard, and a short comment ("Great lap!", "Lap deleted – track limits").

| Choice | Green zone width | Hit green | Hit yellow | Miss |
| --- | --- | --- | --- | --- |
| Safe | 40% of bar | 0 s | +0.2 s | +0.35 s |
| Attack | 25% of bar | −0.17 s | +0.2 s | +0.8 s |
| Send it! | 8% of bar | −0.33 s | +0.3 s | 30%: lap deleted, else +1.3 s |

**Modifiers**

- Soft tyres make green zones 20% wider, Hard 15% narrower.
- Slick tyres on a wet track (over 30% wetness): zones 40% narrower. Rain tyres on a wet track: normal width.
- Lap time = base lap time from the race model (car, driver, tyre, wetness) + corner results + small noise (±0.1 s).
- **One difficulty only (Pro):** the marker crosses the bar in 0.95 s. (The Rookie choice was removed.)

**Order and multiplayer**

- Each player plays driver 1's lap, then driver 2's lap. In multiplayer, all players play at the same time on their own phones. A live leaderboard updates as runs finish. The session ends when everyone is done (time limit 4 minutes).
- The timing tap is measured on the phone and only the result is sent to the server, so network delay does not matter.
- AI drivers get simulated results with their own risk style (some always Safe, some gamble).
- Grid = lap time order (a deleted lap starts at the back). **Each driver starts the race on the tyre of their qualifying lap.**

## 7. Race model

The race runs in real time. Cars move across the screen at the same speed on every track; the tracks are long and winding, so one lap takes about 32–36 seconds at 1× and a race (11–12 laps) lasts 6 to 8 minutes. Each car's current lap time is:

```
T = T_base + car + driver + tyre + wear + mode + weather + noise
```

- **car:** team pace offset (humans equal; AI teams keep the real 2026 order, spread about ±0.45 s). **driver:** ±0.15 s for AI drivers, 0 for human drivers. **noise:** about ±0.3 s, new each lap.
- Cars cannot drive through each other: a faster car closes up to about 0.8 s behind (about one car length on screen), easing off smoothly to the speed of the car ahead (never a sudden stop), and then has to pass in a duel (section 7.5).

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
| Max Attack | −2.0 s | ×1.5 | 8% |

- The mistake chance goes up on worn tyres (up to ×2 below 40% condition) and on slick tyres on a wet track (up to ×3).
- **Small mistake** (lock-up, running wide): −1.5 to −2.5 s.
- **Big mistake** (10% of mistakes in Push, 25% in Max Attack): off the track, −5 s, and a flat-spotted tyre: condition −20% and +0.3 s per lap until the next stop.
- **Spin** on slicks in the wet: −6 s.
- **Flying off on its own** (4% of mistakes in Push, 28% in Max Attack): into the barrier. 55% of these
  end the race (always if the front wing is already broken), the rest break the front wing (−6 s).
  A car out of the race brings out the safety car 35% of the time. A driver on Max Attack the whole
  race is out in about 1 race in 5.
- Every mistake creates a team radio message so the kids understand what happened.

### 7.3a Natural driving within a lap
The lap is cut into 12 sectors. Each driver has lasting strengths and weaknesses per sector (±2 % of
the sector time) plus fresh luck every lap (±3 %); in about one lap of three one corner goes clearly
wrong (+0.3–0.7 s). Closer than 1.6 s behind another car: up to 3 % slower in corner zones (dirty air),
faster on the straights (slipstream). All of this averages out over a lap, so lap times and balance
stay the same; it only makes gaps grow and shrink. An attack (close for a while) pauses rather than
ends when the gap briefly opens to under 1.6 × the close gap. The sector values blend smoothly into each other and dirty air fades in as the gap closes, so speeds never jump.
In the track view every car drives its own slightly different line; only an attacking car moves to
one side (the inside of what comes next) and stays there until the attack is over. Cars are never
drawn overlapping. The inside/outside overtaking scene is shown only in the duel close-up.

### 7.4 Weather

Keep the prototype model:

- The rain timeline is generated per lap before the event, with persistence (rain lasts several laps) and an intensity from light (0.25) to heavy (1.0).
- **Track wetness** (0 to 100%) rises while it rains (up to intensity × 100) and dries slowly after.
- All cars are slower when wet: +0.04 s per % wetness.
- **Slicks** lose (wetness − 15) × 0.06 s when wetness is over 15%. **Rain tyres** lose (35 − wetness) × 0.11 + 0.8 s. The crossover is around 33% wetness: show that number in the UI.
- The forecast shows a chance of rain per block of 4 laps. The further ahead, the fuzzier it is. It gets more accurate as the race goes on.

### 7.5 Overtaking duels

When a car is within 1.2 s of the car ahead for about a third of a lap and is faster, a duel starts. After a pass the two swap places in the simulation at once; the track view shows the attacker driving past over about 1.5 s.

- **Duel close-up only for the car you are following:** when a player taps a driver card, the track zooms in and follows that car. When that car (one of your own) gets into a duel, the track view changes to a **close-up of the two cars**: the attacker sits behind and looks for a way past. **Both sides get 6 seconds** to choose (in multiplayer two players may fight each other; the AI decides at once but secretly). The race does not pause. If nobody answers, the driver decides by himself (same logic as the AI). Duels of cars you are not following are decided automatically, without a close-up.
- **Choices** (each with its chance in % and a risk symbol 🟢 🟡 🟠 🔴, colour + icon + word):

| Level | Attacker | Defender |
| --- | --- | --- |
| 0 | Wait (save tyres, no risk) | Let him go (lose no time) |
| 1 | Careful | Clean |
| 2 | Bold | Hard |
| 3 | Risky | Very hard |
| 4 | All or nothing! | Slam the door! |

- **Rules:** a higher attack level passes more often, a harder defence lets fewer cars through, and the harder both fight, the higher the crash risk. Base pass chance for attack levels 1–3: 45 / 55 / 68 %, minus 0 / 12 / 24 / 36 % for defence levels 1–4. Crash chance: attack 0 / 4 / 12 %, plus defence 0 / 3 / 8 / 14 %, plus 6 % if both fight at level 3 or more. A failed attack costs 0.2 / 0.5 / 0.9 / 1.4 s (more risk, more loss). **Contact penalty:** in a crash, the driver who chose the higher level caused it and gets +5 s if that level was 3 or 4 (Risky / All or nothing / Very hard / Slam the door). After the animation both choices are shown ("Risky vs Hard").
- **All or nothing** is a last-ditch effort: about 20 % success whatever the defender does, and a failure is almost always punished (85 %): a spin (−6 s), going off with a flat spot (−5 s), or contact (both −3 s, 60 % front wing damage).
- The pass chance is multiplied by the track's overtaking factor (0.5 = ×1.0) and gets +10 % per 0.3 s of pace advantage (at most +30 %).
- **Animation:** after both have chosen (or the 6 s are over), a ~3 s animation shows how it pans out. Three scenes, chosen by where the duel happens: a straight, a corner and a chicane. Each scene always starts the same way and then shows the ending: passed, defended, contact, spin, off the track, or waiting. The result counts in the race only after the animation (so the timing tower does not give it away).
- **Failed attack:** attacker loses 0.3 s and 2% tyre condition. **Crash:** both lose 3 s, the attacker has a 30% chance of front wing damage (+0.8 s per lap until a pit stop repairs it, which adds 5 s to the stop).

### 7.5a Damage

- **Front wing** (from contact): +0.8 s per lap, driving mistakes ×1.5, and in duels all risks are higher (crash risk ×1.6, even a careful move has some risk) and the pass chance is lower. Repair: +5 s at the next stop.
- **Engine** (from contact 20 %, going off 15 %, spins 5 %): less top speed, +1.0 s per lap; harder to overtake and easier to be overtaken. Repair: +8 s at the next stop.
- Damage is always visible as symbols in the driver card and the timing tower (also in fullscreen); the duel chances and risk symbols include it. The AI pits for repairs.

### 7.5b Pit stop game

- When one of your cars stops, a short game (about 3 s) appears on the track view: a top-down car with **8 spots** (4 wheels, front jack, rear jack, front wing, engine). In each stop **6 of them** light up one after another in a random order – tap each as fast as possible; tapping a dark spot means something got stuck. A broken wing or engine is always one of the 6. After the last one the car is released at once (no release light). **No penalties** – a good stop simply gets the car out sooner, a bad one later.
- The game starts when the car turns into the pit lane. The car stands in its box until the game is done, then drives out under the limiter. Waiting for the game costs no time: it is made up on the way out (the exit still takes at least 75 % of its normal time). While the game is open and until the car is back on track, single-player races run at 1×.
- If the team's other car comes in while the first is still in the pit lane, the crew does its stop automatically (an average stop + 0.4 s).
- The reaction times are turned into an F1-style standing time (about 1.9 s to 6 s) and shown with a rating: great (≤ 2.2 s), good (≤ 2.8 s), a bit slow (≤ 3.6 s), slow. The difference to the average 2.6 s changes the stop.
- If the player does not touch anything, the crew does an average stop (no penalty). AI crews vary a little and sometimes fumble (+2 s). The second car of a team that stops at the same time waits behind the first (+3 s).
- The game runs on the phone; only the result is sent to the server (like the Hot Lap timing). In single player at 4× the race slows to 2× while the game runs.
- The same pair cannot duel again for one lap. At most one duel prompt per driver per lap.

### 7.6 Safety car

- Chance per race comes from the track (0.2 to 0.6). It can start anywhere between lap 2 and two laps before the end. A crash in a duel also has a 25% chance to bring it out.
- It stays out for a **random distance of 0.6 to 1.6 laps** and can come in anywhere on the lap – nobody knows when, so pitting is a real gamble. All cars bunch up behind the leader about 0.8 s apart, drive slowly (lap time ×1.8) and cannot overtake. Tyre wear ×0.3.
- **Pit lane:** a stopping car turns into the pit lane shortly before the line, drives to its box at the speed limit, stands still (about 2.6 s, from the pit stop game), and drives out at the speed limit; pit lane time + standing time = the track's pit loss (18–25 s). Under the safety car the others drive slowly, so a stop costs clearly less (about 6 s gain), but only if the safety car is still out. Show a big "SAFETY CAR" banner and a radio message: "Safety car! Box now?"
- On the restart, duels are possible again straight away.

### 7.7 AI teams

- Use the prototype logic as a base: pit when tyres are worn, choose the compound that reaches the finish, respect the two-compound rule.
- Each AI driver has its own wetness threshold for switching to rain tyres (26 to 40%) and back (16 to 26%), so smart players can beat them with a good rain call.
- AI uses Normal mode, Push in the last 3 laps and in duels, Conserve to nurse tyres to the finish, Max Attack only rarely. It pits under a safety car if its tyres are older than about 40% of a stint.


### 7.7a Start lights
The race starts with lights over the track while the cars stand on the grid: one red light, a second
red light (each with a low beep), a short wait of 1.2 to 2.2 s (different every race), then all three
go green with a higher, longer beep and the cars go. It runs in real time (also at 2× / 4×) and in
multiplayer the server holds the race until the lights are green, so everybody starts together.

### 7.8 Options: driver cards and skipping qualifying
Two switches in the main menu (saved on the phone). The driver cards are on by default; in
multiplayer the host switches them on or off in the lobby (each player picks on their own phone,
the server checks the picks and adds them to the season). Skipping qualifying is single player only.
- **Driver cards:** after the briefing every player driver gets 3 random cards and picks one
  (roguelite style). A card has an icon, a name and its effect in small print, e.g. 🏃 Went jogging:
  −25 % mistakes; 😴 Great sleep: −0.1 s per lap; 🏋️ Gym session: −30 % crash risk in duels;
  🧘 Yoga: tyres last 10 % longer; 🌧️ Rain practice: −30 % time lost when wet; 🎮 Simulator night:
  +6 % pass chance; 🧱 Defence class: rivals pass 6 % less often; 🔧 Pit drill: −0.3 s stops;
  🍝 Pasta night: −0.05 s per lap and −10 % mistakes; ☕ Double espresso: +10 % pass chance but
  +20 % risk. In a season the cards add up race by race (with limits); in a single race they count
  for that race. Every AI driver gets one random card per race too, so the field stays fair.
- **Skip qualifying:** the grid is drawn at random.

## 8. Race screen and UI

- **Landscape layout (main):** timing tower on the left, track view in the centre, the player's two compact driver cards on the right, a bottom bar with lap counter, weather (wetness, crossover marker, rain chance) and speed buttons. The newest team radio message shows as a strip on the track. A fullscreen button (Android) also locks landscape.
- **Portrait layout (fallback):** everything stacked: top bar, track view, driver cards, weather panel, timing tower, team radio.
- **Camera:** tapping a driver card (or a timing tower row) zooms the track in and follows that car; tapping again or tapping the track zooms out.
- **Track view:** top-down track, cars as dots in team colour with their number, the player's own cars highlighted. Pitting cars move along the pit lane. Rain shown as streaks, a wet track darker. Safety car shown as its own car.
- **Driver card:** position, tyre and condition bar, last lap, gap ahead and behind, buttons for the 4 driving modes, tyre choice + BOX button (pits at the end of the lap, can be cancelled), warnings (two-compound rule, worn tyres, damage).
- **Duel close-up:** the track view changes to a close-up of the two cars with the five choices, their chances and risk symbols, and a 6-second countdown bar; then the animation.
- Big touch targets (at least 44 px), readable text for 11-year-olds, short words, colour plus icons (not colour alone).
- Race controls react on press (not on click), and panels are only redrawn when something changed, so taps and mouse clicks never get lost. Tapping a car on the track follows it.
- Results screen with positions gained or lost, pit stops, penalties, points; then the championship tables. Every time penalty shows its reason and the position in which the car crossed the line ("crossed the line P1 · +5 s released too early"). An open penalty is shown during the race in the driver card and the timing tower. A season-end screen with the champion.
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
- A good rain call (switching within one lap of the crossover) beats a late one (2 of the long laps late) by 10 to 20 s.
- A pit stop under the safety car gains clearly compared with a normal stop (about 5–10 s alone), but it is no sure thing because nobody knows when the safety car comes in.
- A perfect Hot Lap (6 × Send it! in the green) is about 2 s faster than an all-Safe lap, which is worth several grid places.
- A well-played human team can win about 1 race in 3. A badly played team finishes midfield or lower.

## 11. Not in scope

- Car parts development or upgrades.
- Fuel: no refuelling (banned in F1) and no fuel management.
- Boost / ERS button (maybe later).
- Money, sponsors, staff, contracts, driver training.
- Logos or real track names (real team and driver names are used for the AI, see section 3).

## 12. Build order

Build in these milestones. After each one: give me a link to play it on my phone, a short list of what changed, and what my kids should test. Ask before changing anything in this spec or adding features that are not in it.

1. Simulation core (tyres, modes, mistakes, weather, safety car, AI) with unit tests and the headless balance runner.
2. Single-player race screen with the track view, driver cards, timing tower, weather and radio.
3. Overtaking duels.
4. Hot Lap qualifying.
5. Team setup, track briefing, results, championship and season (8 tracks).
6. Multiplayer: lobby, server, reconnecting.
7. Polish: PWA install, German and English, sounds, final balancing.
