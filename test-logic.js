const assert = require("assert");
const { initialState, addPoint, gameScoreDisplay } = require("./matchLogic");

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

console.log("\nVšechny testy prošly.");
