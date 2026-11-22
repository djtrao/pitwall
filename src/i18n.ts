/**
 * All UI text in one place: German (default) and English.
 * Use t('key', { name: 'Kenny' }) – {name} in the text is replaced.
 */
export type Lang = 'de' | 'en';

const STRINGS = {
  // general
  appTitle: { de: 'Pit Wall', en: 'Pit Wall' },
  start: { de: 'RENNEN STARTEN', en: 'START RACE' },
  track: { de: 'Strecke', en: 'Track' },
  laps: { de: 'Runden', en: 'Laps' },
  lap: { de: 'Runde', en: 'Lap' },
  lapOf: { de: 'Runde {lap}/{laps}', en: 'Lap {lap}/{laps}' },
  finish: { de: 'ZIEL', en: 'FINISH' },
  yourTeam: { de: 'Dein Team', en: 'Your team' },
  startTyre: { de: 'Start-Reifen', en: 'Start tyre' },
  setupHint: {
    de: 'Wähle eine Strecke. Im Qualifying fährst du mit beiden Fahrern je zwei schnelle Runden – die beste zählt für die Startaufstellung.',
    en: 'Pick a track. In qualifying each of your drivers gets two flying laps – the best one sets the grid.',
  },
  ruleHint: {
    de: 'Regel: Im Trockenen musst du zwei verschiedene Trocken-Reifen benutzen, sonst +20 s.',
    en: 'Rule: in a dry race you must use two different dry tyres, otherwise +20 s.',
  },
  wetQuali: { de: 'Es regnet am Start!', en: 'It is raining at the start!' },
  pause: { de: 'Pause', en: 'Pause' },
  fullscreen: { de: 'Vollbild', en: 'Fullscreen' },
  rotateHint: { de: '🔄 Tipp: Handy quer halten – so passt alles auf einen Blick.', en: '🔄 Tip: hold your phone sideways – everything fits on one screen.' },
  rainTyresFrom: { de: 'Regenreifen ab {w} %', en: 'rain tyres from {w} %' },
  lapShort: { de: 'R', en: 'L' },
  followHint: { de: '🎥 Tippe auf deinen Fahrer: Die Kamera folgt ihm und du steuerst seine Zweikämpfe.', en: '🎥 Tap your driver: the camera follows him and you control his duels.' },
  duelAttack: { de: '⚔️ Angriff auf {other}!', en: '⚔️ Attack {other}!' },
  duelDefend: { de: '🛡️ {other} greift an!', en: '🛡️ {other} attacks!' },
  duelWaiting: { de: 'Entscheidung gefallen …', en: 'Decision made …' },
  att0: { de: 'Warten', en: 'Wait' },
  att1: { de: 'Vorsichtig', en: 'Careful' },
  att2: { de: 'Mutig', en: 'Bold' },
  att3: { de: 'Riskant', en: 'Risky' },
  att4: { de: 'Alles oder nichts!', en: 'All or nothing!' },
  def0: { de: 'Vorbeilassen', en: 'Let him go' },
  def1: { de: 'Sauber', en: 'Clean' },
  def2: { de: 'Hart', en: 'Hard' },
  def3: { de: 'Sehr hart', en: 'Very hard' },
  def4: { de: 'Tür zu!', en: 'Slam the door!' },
  chPass: { de: 'Vorbei {p} %', en: 'Pass {p} %' },
  chHold: { de: 'Vorne {p} %', en: 'Ahead {p} %' },
  chWait: { de: 'Reifen schonen', en: 'Save tyres' },
  chLetGo: { de: 'Keine Zeit verlieren', en: 'Lose no time' },
  risk0: { de: 'kein Risiko', en: 'no risk' },
  risk1: { de: 'wenig Risiko', en: 'low risk' },
  risk2: { de: 'mittleres Risiko', en: 'medium risk' },
  risk3: { de: 'hohes Risiko', en: 'high risk' },
  risk4: { de: 'sehr gefährlich', en: 'very dangerous' },
  outPass: { de: 'VORBEI!', en: 'THROUGH!' },
  outHeld: { de: 'ABGEWEHRT!', en: 'DEFENDED!' },
  outCrash: { de: 'BERÜHRUNG!', en: 'CONTACT!' },
  outSpin: { de: 'DREHER!', en: 'SPIN!' },
  outOff: { de: 'ABFLUG!', en: 'OFF THE TRACK!' },
  outWait: { de: 'WARTET AB', en: 'WAITING' },
  pitTitle: { de: '🔧 Boxenstopp {car}!', en: '🔧 Pit stop {car}!' },
  pitTapWheels: { de: 'Tippe, was aufleuchtet – so schnell du kannst!', en: 'Tap whatever lights up – as fast as you can!' },
  spotJack: { de: 'Heber', en: 'Jack' },
  spotWing: { de: 'Flügel', en: 'Wing' },
  spotEngine: { de: 'Motor', en: 'Engine' },
  pitWaitGreen: { de: 'Warte auf GRÜN – dann LOS!', en: 'Wait for GREEN – then GO!' },
  pitGo: { de: 'LOS!', en: 'GO!' },
  pitStuck: { de: 'Falsch – das klemmt!', en: 'Wrong – that got stuck!' },
  pitTime: { de: 'Stopp: {s} s', en: 'Stop: {s} s' },
  pitGreat: { de: '🔥 Super-Stopp!', en: '🔥 Great stop!' },
  pitGood: { de: '👍 Guter Stopp', en: '👍 Good stop' },
  pitSlow: { de: '😕 Etwas langsam', en: '😕 A bit slow' },
  pitVerySlow: { de: '🐌 Langsamer Stopp', en: '🐌 Slow stop' },
  pitUnsafe: { de: '⚠️ Zu früh losgefahren! +{s} s Strafe', en: '⚠️ Released too early! +{s} s penalty' },
  pitCrew: { de: 'Die Crew hat übernommen', en: 'The crew took over' },
  rPitStop: { de: '⏱️ {car}: Stopp in {s} s – {rating}', en: '⏱️ {car}: {s} s stop – {rating}' },
  rUnsafe: { de: '⚠️ {car}: unsichere Freigabe, +{s} s Strafe', en: '⚠️ {car}: unsafe release, +{s} s penalty' },
  rDuelSpin: { de: '💫 {car} dreht sich beim Angriff auf {other}!', en: '💫 {car} spins attacking {other}!' },
  rDuelOff: { de: '💨 {car} rutscht beim Angriff auf {other} ins Kiesbett!', en: '💨 {car} slides into the gravel attacking {other}!' },
  nextTyre: { de: 'Reifen für den nächsten Stopp', en: 'Tyre for the next stop' },

  // track descriptions
  desc_rheinring: { de: 'Ein Allrounder am Fluss. Regen ist nie weit weg.', en: 'A classic all-rounder along the river. Rain is never far away.' },
  desc_montesol: { de: 'Enger Stadtkurs am Meer. Überholen ist richtig schwer – die Startposition zählt!', en: 'Tight street circuit by the sea. Overtaking is really hard – grid position matters!' },
  desc_duenenring: { de: 'Heiße Wüstenstrecke mit langen Geraden. Sand frisst Reifen, Überholen ist leicht, Regen fast nie.', en: 'Hot desert track with long straights. Sand eats the tyres, overtaking is easy, rain almost never.' },
  desc_alpenpass: { de: 'Eng und kurvig in den Bergen. Schwer zu überholen, schont die Reifen – das Wetter wechselt schnell.', en: 'Narrow and twisty in the mountains. Hard to overtake, gentle on tyres – the weather changes quickly.' },
  desc_seeblick: { de: 'Schnelle Strecke am See. Normaler Reifenverschleiß, gutes Überholen – ein fairer Kampf.', en: 'Fast lakeside circuit. Average tyre wear, good overtaking – a fair fight for everyone.' },
  desc_kesselring: { de: 'Kurz und sehr schnell, fast ein Oval. Viel Windschatten und Überholen – die Reifen leiden.', en: 'Short and very fast, nearly an oval. Lots of slipstream and overtaking – tyres suffer.' },
  desc_nebelberg: { de: 'Lange Traditionsstrecke auf einem nebligen Hügel. Regen ist wahrscheinlich, Boxenstopps sind teuer.', en: 'Long old-school track on a misty hill. Rain is likely, pit stops are expensive.' },
  desc_waldkurs: { de: 'Schnell und flüssig durch den Wald. Frisst Reifen – und es regnet oft.', en: 'Fast and flowing through the forest. Eats tyres – and it rains a lot.' },

  // menu
  mSeason: { de: 'Saison', en: 'Season' },
  mRaces: { de: '{n} Rennen', en: '{n} races' },
  mStartSeason: { de: 'SAISON STARTEN', en: 'START SEASON' },
  mContinue: { de: 'WEITER: Rennen {r}/{n}', en: 'CONTINUE: race {r}/{n}' },
  mQuickRace: { de: 'Einzelrennen', en: 'Single race' },
  mMulti: { de: 'Mehrspieler', en: 'Multiplayer' },
  mMultiHint: { de: 'Mit Freunden auf ihren eigenen Handys – zuhause oder übers Internet.', en: 'With friends on their own phones – at home or over the internet.' },
  mEditTeam: { de: 'Team bearbeiten', en: 'Edit team' },
  mPlay: { de: 'LOS', en: 'GO' },
  mAbandon: { de: 'Saison abbrechen', en: 'Abandon season' },

  // multiplayer
  mpCreate: { de: 'SPIEL ERSTELLEN', en: 'CREATE GAME' },
  mpCreateHint: { de: 'Du bist Gastgeber und bekommst einen Code für deine Freunde.', en: 'You are the host and get a code for your friends.' },
  mpJoin: { de: 'BEITRETEN', en: 'JOIN' },
  mpCodeHint: { de: 'Code vom Gastgeber (4 Buchstaben)', en: 'Code from the host (4 letters)' },
  mpYourCode: { de: 'Spiel-Code', en: 'Game code' },
  mpShare: { de: 'Zeig deinen Freunden den Code oder lass sie den QR-Code scannen.', en: 'Show your friends the code or let them scan the QR code.' },
  mpPlayers: { de: 'Spieler', en: 'Players' },
  mpHost: { de: 'Gastgeber', en: 'Host' },
  mpReady: { de: 'ICH BIN BEREIT', en: 'I AM READY' },
  mpNotReady: { de: 'DOCH NICHT BEREIT', en: 'NOT READY' },
  mpIsReady: { de: '✅ bereit', en: '✅ ready' },
  mpWaiting: { de: '⏳ wartet', en: '⏳ waiting' },
  mpOffline: { de: '📵 offline', en: '📵 offline' },
  mpStart: { de: 'SAISON STARTEN', en: 'START SEASON' },
  mpWaitHost: { de: 'Warte, bis der Gastgeber startet …', en: 'Waiting for the host to start …' },
  mpAllReady: { de: 'Alle müssen bereit sein.', en: 'Everybody has to be ready.' },
  mpRaces: { de: 'Rennen', en: 'Races' },
  mpSpeed: { de: 'Renntempo', en: 'Race speed' },
  mpWaitOthers: { de: 'Warte auf die anderen …', en: 'Waiting for the others …' },
  mpBriefingReady: { de: 'BEREIT FÜRS QUALIFYING', en: 'READY FOR QUALIFYING' },
  mpReadyCount: { de: '{n} von {m} bereit', en: '{n} of {m} ready' },
  mpNoServer: { de: 'Für Mehrspieler fehlt noch die Server-Adresse (siehe Anleitung).', en: 'Multiplayer needs a server address (see the guide).' },
  mpServer: { de: 'Server-Adresse', en: 'Server address' },
  mpConnecting: { de: 'Verbinde …', en: 'Connecting …' },
  mpReconnecting: { de: '📡 Verbindung weg – verbinde neu …', en: '📡 Connection lost – reconnecting …' },
  mpErr_roomFull: { de: 'Das Spiel ist voll (4 Spieler).', en: 'The game is full (4 players).' },
  mpErr_roomTaken: { de: 'Dieser Code ist schon vergeben.', en: 'This code is already taken.' },
  mpErr_noRoom: { de: 'Kein Spiel mit diesem Code gefunden.', en: 'No game with this code.' },
  mpErr_numberTaken: { de: 'Eine deiner Startnummern hat schon ein anderer Spieler – ändere sie unter „Team ändern“.', en: 'Another player already has one of your car numbers – change it under “Edit team”.' },
  mpErr_started: { de: 'Dieses Spiel läuft schon.', en: 'This game has already started.' },
  mpErr_badTeam: { de: 'Dein Team ist nicht vollständig.', en: 'Your team is not complete.' },
  mpRejoin: { de: 'ZURÜCK INS SPIEL {code}', en: 'BACK TO GAME {code}' },
  mpLeave: { de: 'Verlassen', en: 'Leave' },
  mpNext: { de: 'WEITER', en: 'CONTINUE' },
  mpWaitNext: { de: 'Der Gastgeber geht gleich weiter …', en: 'The host will continue in a moment …' },
  mpPaused: { de: '⏸ PAUSE (Gastgeber)', en: '⏸ PAUSED (host)' },

  // team editor
  tTitle: { de: 'Dein Team', en: 'Your team' },
  tTeamName: { de: 'Teamname', en: 'Team name' },
  tColor: { de: 'Teamfarbe', en: 'Team colour' },
  tDriver: { de: 'Fahrer {n}', en: 'Driver {n}' },
  tName: { de: 'Name', en: 'Name' },
  tNumber: { de: 'Nr. (2–99)', en: 'No. (2–99)' },
  tSave: { de: 'SPEICHERN', en: 'SAVE' },
  back: { de: '← Zurück', en: '← Back' },
  errTeamName: { de: 'Bitte einen Teamnamen eingeben.', en: 'Please enter a team name.' },
  errDriverName: { de: 'Bitte beide Fahrernamen eingeben.', en: 'Please enter both driver names.' },
  errNumber: { de: 'Startnummern von 2 bis 99.', en: 'Car numbers from 2 to 99.' },
  errSameNumber: { de: 'Die beiden Nummern müssen verschieden sein.', en: 'The two numbers must be different.' },

  // briefing
  bRound: { de: 'Rennen {r}/{n}', en: 'Race {r}/{n}' },
  bFacts: { de: 'Strecken-Infos', en: 'Track facts' },
  bLaps: { de: 'Runden', en: 'Laps' },
  bWear: { de: 'Reifenverschleiß', en: 'Tyre wear' },
  bOvertake: { de: 'Überholen', en: 'Overtaking' },
  bPit: { de: 'Boxenstopp', en: 'Pit stop' },
  bRain: { de: 'Regenrisiko', en: 'Rain risk' },
  bSC: { de: 'Safety Car', en: 'Safety car' },
  lvlLow: { de: 'niedrig', en: 'low' },
  lvlMid: { de: 'mittel', en: 'medium' },
  lvlHigh: { de: 'hoch', en: 'high' },
  lvlEasy: { de: 'leicht', en: 'easy' },
  lvlHard: { de: 'schwer', en: 'hard' },
  bCorners: { de: 'Schlüsselkurven (fürs Qualifying)', en: 'Key corners (for qualifying)' },
  bTyres: { de: 'Reifen-Guide', en: 'Tyre guide' },
  bFastest: { de: 'am schnellsten', en: 'fastest' },
  bSlower: { de: '+{s} s/Runde', en: '+{s} s/lap' },
  bLasts: { de: '≈ {n} Runden · Pushen ≈ {p}', en: '≈ {n} laps · push ≈ {p}' },
  bRainTyre: { de: 'nur bei Nässe (ab {w} %)', en: 'only when wet (from {w} %)' },
  bWeather: { de: 'Wetter-Vorhersage (Regenchance)', en: 'Weather forecast (chance of rain)' },
  bFuzzy: { de: 'Weit entfernte Vorhersagen sind ungenau – im Rennen werden sie genauer.', en: 'Far-off forecasts are fuzzy – they get better during the race.' },
  bRules: { de: 'Regeln', en: 'Rules' },
  rule1: { de: 'Im Trockenen zwei verschiedene Trocken-Reifen benutzen – sonst +20 s.', en: 'In a dry race use two different dry tyres – otherwise +20 s.' },
  rule2: { de: 'Du startest auf dem Reifen deiner besten Qualifying-Runde.', en: 'You start on the tyre of your best qualifying lap.' },
  rule3: { de: 'Unter Safety Car kostet ein Boxenstopp nur die Hälfte.', en: 'Under the safety car a pit stop costs only half.' },

  // championship
  cDrivers: { de: 'Fahrer-WM', en: 'Drivers’ championship' },
  cTeams: { de: 'Team-WM', en: 'Teams’ championship' },
  nextRace: { de: 'NÄCHSTES RENNEN →', en: 'NEXT RACE →' },
  finalStandings: { de: 'ENDSTAND →', en: 'FINAL STANDINGS →' },
  seasonOver: { de: '🏆 Saison vorbei!', en: '🏆 Season over!' },
  champion: { de: 'Weltmeister: {name}', en: 'Champion: {name}' },
  teamChampion: { de: 'Team-Weltmeister: {name}', en: 'Teams’ champion: {name}' },
  yourTeamPos: { de: '{team}: Platz {pos} in der Team-WM', en: '{team}: P{pos} in the teams’ championship' },
  newSeason: { de: 'NEUE SAISON', en: 'NEW SEASON' },
  toMenu: { de: 'ZUM MENÜ', en: 'TO THE MENU' },
  wins: { de: 'Siege', en: 'Wins' },

  // qualifying (Hot Lap)
  toQuali: { de: 'ZUM QUALIFYING', en: 'TO QUALIFYING' },
  quali: { de: 'Qualifying', en: 'Qualifying' },
  qSession: { de: 'Versuch {n}/4', en: 'Run {n}/4' },
  qDriverRun: { de: '#{num} {name} · Versuch {run}/2', en: '#{num} {name} · run {run}/2' },
  qPickTyre: { de: 'Reifen wählen', en: 'Pick a tyre' },
  qUsed: { de: '+0,2 s gebraucht', en: '+0.2 s used' },
  qGo: { de: 'LOS – FLIEGENDE RUNDE!', en: 'GO – FLYING LAP!' },
  qDifficulty: { de: 'Schwierigkeit', en: 'Difficulty' },
  rookie: { de: '🐢 Rookie', en: '🐢 Rookie' },
  pro: { de: '⚡ Profi', en: '⚡ Pro' },
  qHowTo: { de: 'Vor jeder Kurve: wie viel Risiko? Dann im richtigen Moment tippen – grün ist perfekt.', en: 'Before each corner: how much risk? Then tap at the right moment – green is perfect.' },
  qCorner: { de: 'Kurve {n}: {name}', en: 'Corner {n}: {name}' },
  qRisk0: { de: 'Sicher', en: 'Safe' },
  qRisk1: { de: 'Angriff', en: 'Attack' },
  qRisk2: { de: 'Voll rein!', en: 'Send it!' },
  qRiskInfo0: { de: 'großes Grün · ±0 s', en: 'big green · ±0 s' },
  qRiskInfo1: { de: 'Grün: −0,25 s', en: 'green: −0.25 s' },
  qRiskInfo2: { de: 'Grün: −0,5 s · Runde kann weg sein!', en: 'green: −0.5 s · lap may be deleted!' },
  qTap: { de: 'TIPPEN am Bremspunkt!', en: 'TAP at the braking point!' },
  qGreen: { de: 'PERFEKT!', en: 'PERFECT!' },
  qYellow: { de: 'GEHT SO', en: 'OK' },
  qMiss: { de: 'VERBREMST!', en: 'MISSED!' },
  qLapDeleted: { de: '❌ Runde gestrichen – Tracklimits!', en: '❌ Lap deleted – track limits!' },
  qGreat: { de: '🔥 Super Runde!', en: '🔥 Great lap!' },
  qBest: { de: '⭐ Neue Bestzeit!', en: '⭐ New personal best!' },
  qSolid: { de: '👍 Solide Runde', en: '👍 Solid lap' },
  qMistake: { de: '😬 Fehler in Kurve {n}', en: '😬 Mistake in corner {n}' },
  qPlace: { de: 'Platz {p}', en: 'P{p}' },
  qNext: { de: 'WEITER', en: 'NEXT' },
  qOver: { de: '🏁 Qualifying vorbei!', en: '🏁 Qualifying over!' },
  qToRace: { de: 'ZUM RENNEN', en: 'TO THE RACE' },
  qNoTime: { de: 'keine Zeit', en: 'no time' },
  qWet: { de: '🌧️ Nasse Strecke ({w} %) – Slicks machen die grünen Zonen kleiner', en: '🌧️ Wet track ({w} %) – slicks make the green zones smaller' },
  qFlying: { de: 'Fliegende Runde …', en: 'Flying lap …' },
  qGridTyre: { de: 'Startet auf dem Reifen der besten Runde', en: 'Starts on the tyre of the best lap' },

  // tyres and modes
  tyreS: { de: 'Soft', en: 'Soft' },
  tyreM: { de: 'Medium', en: 'Medium' },
  tyreH: { de: 'Hart', en: 'Hard' },
  tyreW: { de: 'Regen', en: 'Rain' },
  mode0: { de: 'Schonen', en: 'Conserve' },
  mode1: { de: 'Normal', en: 'Normal' },
  mode2: { de: 'Pushen', en: 'Push' },
  mode3: { de: 'Vollgas', en: 'Max Attack' },

  // driver card
  box: { de: 'BOX', en: 'BOX' },
  boxing: { de: 'BOX ✕', en: 'BOX ✕' },
  lastLap: { de: 'Letzte', en: 'Last' },
  ahead: { de: 'vorne', en: 'ahead' },
  behind: { de: 'hinten', en: 'behind' },
  inPits: { de: '🔧 In der Box … {s} s', en: '🔧 In the pits … {s} s' },
  losing: { de: '⚠️ Verliert Zeit …', en: '⚠️ Losing time …' },
  finished: { de: '🏁 Im Ziel', en: '🏁 Finished' },
  boxPlanned: { de: '📻 Box nach dieser Runde: {tyre}', en: '📻 Box after this lap: {tyre}' },
  warnRule: { de: '⚠️ 2. Trocken-Reifen fehlt (+20 s)', en: '⚠️ 2nd dry tyre missing (+20 s)' },
  warnWorn: { de: '🛞 Reifen hinüber – bald Box!', en: '🛞 Tyres gone – box soon!' },
  warnFlat: { de: '🛞 Bremsplatten: +0,3 s pro Runde bis zum Stopp', en: '🛞 Flat spot: +0.3 s per lap until the stop' },
  warnWing: { de: '🪛 Flügel kaputt: +0,8 s/Runde, mehr Risiko, Stopp +5 s', en: '🪛 Wing broken: +0.8 s/lap, more risk, stop +5 s' },
  warnEngine: { de: '⚙️ Motor beschädigt: +1 s pro Runde, Stopp +8 s', en: '⚙️ Engine damaged: +1 s per lap, stop +8 s' },
  dmgWing: { de: 'Frontflügel kaputt', en: 'Front wing broken' },
  dmgEngine: { de: 'Motor beschädigt', en: 'Engine damaged' },
  dmgFlat: { de: 'Bremsplatten', en: 'Flat spot' },
  rEngine: { de: '⚙️ {car}: Der Motor ist beschädigt – weniger Topspeed!', en: '⚙️ {car}: engine damaged – less top speed!' },
  warnWet: { de: '🌧️ Strecke nass – Regenreifen sind schneller', en: '🌧️ Track is wet – rain tyres are faster' },
  warnDry: { de: '☀️ Strecke trocknet – Slicks sind schneller', en: '☀️ Track is drying – slicks are faster' },

  // weather
  weather: { de: 'Wetter', en: 'Weather' },
  dry: { de: '☀️ Trocken', en: '☀️ Dry' },
  dryWet: { de: '⛅ Trocken, Strecke noch nass', en: '⛅ Dry, track still wet' },
  lightRain: { de: '🌦️ Leichter Regen', en: '🌦️ Light rain' },
  heavyRain: { de: '🌧️ Starker Regen', en: '🌧️ Heavy rain' },
  wetness: { de: 'Nässe', en: 'Wetness' },
  crossover: { de: 'Ab {w} % Nässe sind Regenreifen schneller.', en: 'Rain tyres are faster above {w} % wetness.' },
  forecast: { de: 'Regenchance', en: 'Chance of rain' },

  // panels
  timing: { de: 'Zeiten', en: 'Timing' },
  radio: { de: 'Boxenfunk', en: 'Team radio' },
  leader: { de: 'Führt', en: 'Leader' },
  pit: { de: 'BOX', en: 'PIT' },
  lapped: { de: '+1 Rd.', en: '+1 Lap' },
  dnf: { de: 'Aus', en: 'DNF' },
  safetyCar: { de: 'SAFETY CAR', en: 'SAFETY CAR' },
  chequered: { de: '🏁 ZIELFLAGGE', en: '🏁 CHEQUERED FLAG' },
  seeResults: { de: 'ERGEBNIS ANSEHEN', en: 'SEE RESULTS' },

  // results
  result: { de: 'Ergebnis', en: 'Result' },
  pos: { de: 'Pos', en: 'Pos' },
  driver: { de: 'Fahrer', en: 'Driver' },
  time: { de: 'Zeit', en: 'Time' },
  stops: { de: 'Stopps', en: 'Stops' },
  points: { de: 'Pkt', en: 'Pts' },
  penalty: { de: '+20 s Strafe', en: '+20 s penalty' },
  penaltyShort: { de: '+20 s', en: '+20 s' },
  raceAgain: { de: 'NOCHMAL FAHREN', en: 'RACE AGAIN' },
  newTrack: { de: 'ANDERE STRECKE', en: 'OTHER TRACK' },
  bestOfYou: { de: 'Dein bestes Auto: P{pos}', en: 'Your best car: P{pos}' },

  // radio messages
  rLightsOut: { de: '🚦 Lichter aus – los geht’s!', en: '🚦 Lights out and away we go!' },
  rRainStart: { de: '🌧️ Es fängt an zu regnen!', en: '🌧️ It is starting to rain!' },
  rRainHeavy: { de: '🌧️ Starker Regen setzt ein!', en: '🌧️ Heavy rain is starting!' },
  rRainStop: { de: '☀️ Der Regen hört auf – die Strecke trocknet.', en: '☀️ The rain has stopped – the track will dry.' },
  rSafetyCar: { de: '🚨 SAFETY CAR! Jetzt an die Box? Der Stopp ist gerade billig.', en: '🚨 SAFETY CAR! Box now? A stop is cheap right now.' },
  rSafetyCarEnd: { de: '🟢 Safety Car kommt rein – wieder Rennen!', en: '🟢 Safety car is in – racing again!' },
  rPitIn: { de: '📻 BOX BOX! {car} kommt rein für {tyre}', en: '📻 BOX BOX! {car} pits for {tyre}' },
  rPitOut: { de: '🔧 {car} fährt raus auf {tyre}', en: '🔧 {car} leaves the pits on {tyre}' },
  rAiRain: { de: '🌧️ {car} holt sich Regenreifen', en: '🌧️ {car} pits for rain tyres' },
  rMistakeSmall: { de: '😬 {car} verbremst sich – {s} s verloren', en: '😬 {car} locks up – {s} s lost' },
  rMistakeBig: { de: '💥 {car} fliegt ab! −5 s und Bremsplatten', en: '💥 {car} goes off! −5 s and a flat spot' },
  rSpin: { de: '💫 {car} dreht sich auf Slicks im Nassen!', en: '💫 {car} spins on slicks in the wet!' },
  rPassMine: { de: '⚔️ {car} überholt {other}!', en: '⚔️ {car} overtakes {other}!' },
  rPassedMine: { de: '😤 {other} wird von {car} überholt', en: '😤 {other} is overtaken by {car}' },
  rDuelFail: { de: '🛡️ {car} kommt nicht an {other} vorbei', en: '🛡️ {car} cannot get past {other}' },
  rCrash: { de: '💥 Berührung! {car} und {other} kollidieren', en: '💥 Contact! {car} and {other} touch' },
  rWing: { de: '🪛 {car} hat den Frontflügel beschädigt', en: '🪛 {car} has damaged the front wing' },
  rWorn: { de: '🛞 {car}: Reifen bei {cond} % – denk an die Box!', en: '🛞 {car}: tyres at {cond} % – think about boxing!' },
  rPenalty: { de: '⚠️ {car}: +20 s – nur eine Trocken-Reifen-Sorte!', en: '⚠️ {car}: +20 s – only one dry tyre type!' },
  rWin: { de: '🏆 {car} gewinnt das Rennen!', en: '🏆 {car} wins the race!' },
  rFinish: { de: '🏁 {car} ist im Ziel', en: '🏁 {car} crosses the line' },
} satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof STRINGS;

let lang: Lang = 'de';
try {
  const saved = localStorage.getItem('pitwall-lang');
  if (saved === 'de' || saved === 'en') lang = saved;
} catch {
  /* storage blocked – keep default */
}

export const getLang = () => lang;

export const hasKey = (k: string): k is StringKey => k in STRINGS;

export function setLang(l: Lang): void {
  lang = l;
  try {
    localStorage.setItem('pitwall-lang', l);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = l;
}

export function t(key: StringKey, params: Record<string, string | number> = {}): string {
  let s: string = STRINGS[key][lang];
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Number with the right decimal mark (1,5 in German, 1.5 in English). */
export function num(v: number, digits = 1): string {
  const s = v.toFixed(digits);
  return lang === 'de' ? s.replace('.', ',') : s;
}

/** Lap time like 1:18,4 / 1:18.4 */
export function lapTime(sec: number | null): string {
  if (sec === null) return '–';
  const m = Math.floor(sec / 60);
  const rest = (sec - m * 60).toFixed(1).padStart(4, '0');
  return `${m}:${lang === 'de' ? rest.replace('.', ',') : rest}`;
}
