const assert = require("assert");
const {
  initialState,
  addPoint,
  gameScoreDisplay,
  computeStats,
  pauseMatch,
  resumeMatch,
  retireMatch,
} = require("./matchLogic");

function play(state, seq) {
  for (const p of seq) addPoint(state, p);
  return state;
}

// Test 1: základní body 0-15-30-40
{
  const s = initialState();
  addPoint(s, "A");
  assert.deepStrictEqual(gameScoreDisplay(s), { type: "points", a: 15, b: 0 });
  addPoint(s, "A");
  addPoint(s, "A");
  assert.deepStrictEqual(gameScoreDisplay(s), { type: "points", a: 40, b: 0 });
  addPoint(s, "A");
  assert.strictEqual(s.currentSet.gamesA, 1);
  console.log("Test 1 OK: základní body a výhra gamu");
}

// Test 2: shoda (deuce) a výhoda
{
  const s = initialState();
  play(s, ["A", "A", "A", "B", "B", "B"]); // 40:40
  assert.deepStrictEqual(gameScoreDisplay(s), { type: "deuce", label: "40:40" });
  addPoint(s, "A"); // výhoda A
  assert.deepStrictEqual(gameScoreDisplay(s), { type: "advantage", side: "A" });
  addPoint(s, "B"); // zpět na shodu
  assert.deepStrictEqual(gameScoreDisplay(s), { type: "deuce", label: "40:40" });
  addPoint(s, "A");
  addPoint(s, "A"); // A vyhrává gem z výhody
  assert.strictEqual(s.currentSet.gamesA, 1);
  console.log("Test 2 OK: shoda a výhoda");
}

// Test 3: výhra setu 6:4 (bez tiebreaku)
{
  const s = initialState();
  // A vyhraje 6 gemů, B vyhraje 4 gemy postupně (pořadí nevadí pro výsledek setu)
  const winGameFor = (state, winner) => {
    // 4 body stačí, pokud soupeř nemá 3+ bodů zpět (žádná shoda)
    play(state, [winner, winner, winner, winner]);
  };
  winGameFor(s, "A");
  winGameFor(s, "B");
  winGameFor(s, "A");
  winGameFor(s, "B");
  winGameFor(s, "A");
  winGameFor(s, "B");
  winGameFor(s, "A");
  winGameFor(s, "B");
  winGameFor(s, "A");
  winGameFor(s, "A");
  assert.strictEqual(s.sets.length, 1);
  assert.deepStrictEqual(s.sets[0], { a: 6, b: 4 });
  console.log("Test 3 OK: výhra setu 6:4");
}

// Test 4: 6:6 spouští tiebreak, vítěz bere set 7:6
{
  const s = initialState();
  const winGameFor = (state, winner) => play(state, [winner, winner, winner, winner]);
  for (let i = 0; i < 6; i++) { winGameFor(s, "A"); winGameFor(s, "B"); }
  assert.strictEqual(s.currentSet.gamesA, 6);
  assert.strictEqual(s.currentSet.gamesB, 6);
  assert.ok(s.tiebreak, "tiebreak by měl běžet po 6:6");
  // A vyhraje tiebreak 7:0
  play(s, ["A","A","A","A","A","A","A"]);
  assert.strictEqual(s.sets.length, 1);
  assert.deepStrictEqual(s.sets[0], { a: 7, b: 6 });
  console.log("Test 4 OK: tiebreak při 6:6 -> 7:6");
}

// Test 5: celý zápas na 2 vítězné sety
{
  const s = initialState("Petra", "Jana", 2);
  const winGameFor = (state, winner) => play(state, [winner, winner, winner, winner]);
  const winSetFor = (state, winner, loser) => {
    for (let i = 0; i < 6; i++) winGameFor(state, winner);
  };
  winSetFor(s, "A"); // 6:0
  winSetFor(s, "A"); // 6:0 -> match over 2:0 na sety
  assert.strictEqual(s.matchWinner, "A");
  assert.strictEqual(s.sets.length, 2);
  console.log("Test 5 OK: konec zápasu po 2 vítězných setech");
}

// Test 6: po skončení zápasu se další body ignorují
{
  const s = initialState("Petra", "Jana", 2);
  const winGameFor = (state, winner) => play(state, [winner, winner, winner, winner]);
  for (let set = 0; set < 2; set++) for (let g = 0; g < 6; g++) winGameFor(s, "A");
  assert.strictEqual(s.matchWinner, "A");
  const before = JSON.stringify(s);
  addPoint(s, "B");
  assert.strictEqual(JSON.stringify(s), before, "stav se nesmí měnit po konci zápasu");
  console.log("Test 6 OK: body po konci zápasu se ignorují");
}

// Test 7: rozhodující sada jako supertiebreak do 10 (best of 3, deciderSuperTiebreak=true)
{
  const s = initialState("Petra", "Jana", 2, true);
  const winGameFor = (state, winner) => play(state, [winner, winner, winner, winner]);
  const winSetFor = (state, winner) => { for (let i = 0; i < 6; i++) winGameFor(state, winner); };

  winSetFor(s, "A"); // set 1: A vyhrává 6:0
  winSetFor(s, "B"); // set 2: B vyhrává 6:0 -> 1:1 na sety, matchWinner stále null
  assert.strictEqual(s.matchWinner, null);
  assert.strictEqual(s.sets.length, 2);
  assert.ok(s.isSuperTiebreakSet, "po 1:1 na sety s deciderSuperTiebreak by měl běžet supertiebreak místo 3. sady");

  // B vyhraje supertiebreak 10:4 (nejdřív odehrané body pro A, pak B doběhne na 10)
  play(s, ["A","A","A","A","B","B","B","B","B","B","B","B","B","B"]);
  assert.strictEqual(s.matchWinner, "B");
  assert.strictEqual(s.sets.length, 3);
  assert.deepStrictEqual(s.sets[2], { a: 4, b: 10, superTiebreak: true });
  console.log("Test 7 OK: rozhodující supertiebreak do 10 místo 3. sady");
}

// Test 8: bez deciderSuperTiebreak se hraje normální 3. sada
{
  const s = initialState("Petra", "Jana", 2, false);
  const winGameFor = (state, winner) => play(state, [winner, winner, winner, winner]);
  const winSetFor = (state, winner) => { for (let i = 0; i < 6; i++) winGameFor(state, winner); };

  winSetFor(s, "A");
  winSetFor(s, "B");
  assert.strictEqual(s.isSuperTiebreakSet, false, "bez deciderSuperTiebreak se nemá spouštět supertiebreak");
  winSetFor(s, "A"); // normální 3. sada
  assert.strictEqual(s.matchWinner, "A");
  assert.strictEqual(s.sets.length, 3);
  assert.deepStrictEqual(s.sets[2], { a: 6, b: 0 });
  console.log("Test 8 OK: bez zapnuté volby se hraje plná 3. sada");
}

// Test 9: kategorizace bodů (winner/eso/chyby) a agregace statistik
{
  const s = initialState("Petra", "Jana", 2);
  // server je na začátku "A"
  addPoint(s, "A", "ace"); // eso pro A (A podává) -> mělo by se počítat
  addPoint(s, "A", "winner");
  addPoint(s, "B", "unforced_error"); // bod pro B kvůli nevynucené chybě A
  addPoint(s, "B", "double_fault"); // bod pro B, protože A (podávající) udělal dvojchybu

  const { stats, totalPoints } = computeStats(s);
  assert.strictEqual(totalPoints, 4);
  assert.strictEqual(stats.A.aces, 1);
  assert.strictEqual(stats.A.winners, 1);
  assert.strictEqual(stats.A.unforcedErrors, 1, "nevynucená chyba A se má počítat A jako chyba, ne bod");
  assert.strictEqual(stats.A.doubleFaults, 1);
  assert.strictEqual(stats.B.pointsWon, 2);
  assert.strictEqual(stats.A.pointsWon, 2);
  console.log("Test 9 OK: kategorizace bodů a agregace statistik");
}

// Test 10: neplatný důvod se ignoruje (uloží se jako bez upřesnění), délka zápasu se měří
{
  const s = initialState();
  assert.strictEqual(s.startedAt, null);
  addPoint(s, "A", "neexistujici_duvod");
  assert.strictEqual(s.lastPointReason, null, "neplatný důvod by se měl uložit jako null");
  assert.ok(s.startedAt, "startedAt by se mělo nastavit po prvním bodu");
  const { durationMs } = computeStats(s);
  assert.ok(durationMs >= 0, "délka zápasu by měla být měřitelná i za běhu");
  console.log("Test 10 OK: neplatný důvod ignorován, délka zápasu se měří");
}

// Test 11: střídání podání v tiebreaku (po 1. bodu, pak po každých 2 bodech)
{
  const s = initialState();
  const winGameFor = (state, winner) => play(state, [winner, winner, winner, winner]);
  for (let i = 0; i < 6; i++) { winGameFor(s, "A"); winGameFor(s, "B"); }
  assert.ok(s.tiebreak, "tiebreak by měl běžet po 6:6");

  const serverAtStart = s.server; // kdo podává 1. bod tiebreaku
  addPoint(s, "A"); // bod 1 -> po něm se podání střídá
  const serverAfter1 = s.server;
  assert.notStrictEqual(serverAfter1, serverAtStart, "po 1. bodu tiebreaku se má podání střídat");

  addPoint(s, "A"); // bod 2 -> podání zůstává
  assert.strictEqual(s.server, serverAfter1, "po 2. bodu se podání ještě nemění");

  addPoint(s, "A"); // bod 3 -> podání se střídá
  assert.notStrictEqual(s.server, serverAfter1, "po 3. bodu (lichém) se má podání střídat");

  console.log("Test 11 OK: střídání podání v tiebreaku (1, pak po dvou)");
}

// Test 12: breakpoint detekce a proměnění (0:40 -> B bere break)
{
  const s = initialState(); // server začíná 'A'
  play(s, ["B", "B", "B"]); // 0:40, ještě žádný z bodů nebyl "break point" (0-0,0-15,0-30)
  assert.ok(s.pointLog.every((p) => p.opportunity === null), "před 0:40 by neměl být žádný breakpoint");

  addPoint(s, "B"); // B využije break point
  const last = s.pointLog[s.pointLog.length - 1];
  assert.deepStrictEqual(last.opportunity, { type: "break", player: "B" });
  assert.strictEqual(last.converted, true);
  assert.strictEqual(s.currentSet.gamesB, 1, "B měl vyhrát hru (breaknout podání)");
  console.log("Test 12 OK: breakpoint se správně detekuje a proměňuje");
}

// Test 13: gamepoint - nejdřív neproměněný, pak proměněný
{
  const s = initialState(); // server 'A'
  play(s, ["A", "A", "A"]); // 40:0 - game point pro A (podává)
  addPoint(s, "B"); // A ho nevyužije -> 40:15
  let last = s.pointLog[s.pointLog.length - 1];
  assert.deepStrictEqual(last.opportunity, { type: "game", player: "A" });
  assert.strictEqual(last.converted, false);

  addPoint(s, "A"); // teď A game point využije -> vyhrává hru
  last = s.pointLog[s.pointLog.length - 1];
  assert.strictEqual(last.converted, true);
  assert.strictEqual(s.currentSet.gamesA, 1);

  const { stats } = computeStats(s);
  assert.strictEqual(stats.A.gamePointsChances, 2);
  assert.strictEqual(stats.A.gamePointsWon, 1);
  console.log("Test 13 OK: gamepoint neproměněný i proměněný se počítá správně");
}

// Test 14: kategorie "přímý bod z podání" (service winner), dvojchyba a 1./2. servis
{
  const s = initialState(); // server 'A'
  addPoint(s, "A", "ace", 1); // eso na 1. servis
  addPoint(s, "B", "double_fault", 1); // dvojchyba (i když přišel serveNumber 1, vynutí se 2)
  addPoint(s, "A", "service_winner", 2); // přímý bod z podání na 2. servis

  const { stats } = computeStats(s);
  assert.strictEqual(stats.A.serviceWinners, 1);
  assert.strictEqual(stats.A.doubleFaults, 1, "dvojchyba se počítá hráči, který podával (A), ne tomu kdo bod vyhrál");
  assert.strictEqual(stats.A.firstServe.played, 1);
  assert.strictEqual(stats.A.firstServe.won, 1);
  assert.strictEqual(stats.A.secondServe.played, 2, "dvojchyba i service winner na 2. servis se počítají do 2. servisu");
  assert.strictEqual(stats.A.secondServe.won, 1, "z toho jen service winner byl vyhraný, dvojchyba prohraná");
  console.log("Test 14 OK: service winner, dvojchyba a 1./2. servis se počítají správně");
}

// Test 15: přerušení hry (pauza) blokuje body a jde ho ukončit
{
  const s = initialState();
  addPoint(s, "A");
  pauseMatch(s, "Déšť");
  assert.strictEqual(s.paused, true);
  assert.strictEqual(s.pauseReason, "Déšť");

  const before = gameScoreDisplay(s);
  addPoint(s, "A"); // během pauzy se bod nemá připsat
  assert.deepStrictEqual(gameScoreDisplay(s), before, "bod zadaný během pauzy se neměl započítat");

  resumeMatch(s);
  assert.strictEqual(s.paused, false);
  assert.strictEqual(s.pauses.length, 1);
  assert.ok(s.pauses[0].endedAt, "pauza by měla mít zaznamenaný konec po resumeMatch");

  addPoint(s, "A"); // teď už by se bod měl připsat
  assert.notDeepStrictEqual(gameScoreDisplay(s), before);
  console.log("Test 15 OK: přerušení hry blokuje body a jde ukončit");
}

// Test 16: skreč (retire) ukončí zápas ve prospěch soupeře
{
  const s = initialState("Petra", "Jana");
  addPoint(s, "A");
  addPoint(s, "A");
  retireMatch(s, "B", "zranění kotníku"); // Jana (B) se vzdává
  assert.strictEqual(s.matchWinner, "A", "vítězem má být soupeř toho, kdo se vzdal");
  assert.strictEqual(s.retired, true);
  assert.strictEqual(s.retiredPlayer, "B");
  assert.strictEqual(s.retirementReason, "zranění kotníku");
  assert.ok(s.endedAt, "konec zápasu se má zaznamenat i při skreči");

  const beforeState = JSON.stringify(s);
  addPoint(s, "B"); // po skreči se body ignorují jako po normálním konci
  assert.strictEqual(JSON.stringify(s), beforeState);
  console.log("Test 16 OK: skreč ukončí zápas ve prospěch soupeře a další body se ignorují");
}

// Test 17: skreč automaticky uzavře probíhající pauzu
{
  const s = initialState();
  pauseMatch(s, "Ošetření");
  retireMatch(s, "A");
  assert.strictEqual(s.paused, false, "skreč má uzavřít otevřenou pauzu");
  assert.ok(s.pauses[0].endedAt, "pauza měla dostat endedAt při skreči");
  console.log("Test 17 OK: skreč automaticky uzavře probíhající pauzu");
}

console.log("\nVšechny testy prošly.");
