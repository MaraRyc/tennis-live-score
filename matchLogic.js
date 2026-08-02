// matchLogic.js
// Čistá logika tenisového skóre (bez závislosti na serveru), snadno testovatelná.

function freshGame() {
  return { pA: 0, pB: 0 }; // syrové body ve hře (mimo tiebreak)
}

function freshTiebreak() {
  return { pA: 0, pB: 0 };
}

function initialState(playerA = "Hráč A", playerB = "Hráč B", setsToWin = 2) {
  return {
    playerA,
    playerB,
    setsToWin, // best of 3 => 2, best of 5 => 3
    sets: [], // dokončené sety: {a: 6, b: 4}
    currentSet: { gamesA: 0, gamesB: 0 },
    currentGame: freshGame(),
    tiebreak: null, // pokud probíhá tiebreak: {pA, pB}
    server: "A", // kdo podává (informativní)
    matchWinner: null, // null | 'A' | 'B'
    lastPointWinner: null,
  };
}

function pointLabel(p) {
  return [0, 15, 30, 40][p] ?? 40;
}

// Vrátí popis aktuálního skóre hry pro zobrazení
function gameScoreDisplay(state) {
  if (state.matchWinner) return null;
  if (state.tiebreak) {
    return { type: "tiebreak", a: state.tiebreak.pA, b: state.tiebreak.pB };
  }
  const { pA, pB } = state.currentGame;
  if (pA >= 3 && pB >= 3) {
    if (pA === pB) return { type: "deuce", label: "40:40" };
    if (pA - pB === 1) return { type: "advantage", side: "A" };
    if (pB - pA === 1) return { type: "advantage", side: "B" };
  }
  return { type: "points", a: pointLabel(pA), b: pointLabel(pB) };
}

function switchServer(state) {
  state.server = state.server === "A" ? "B" : "A";
}

function finishSet(state, winner) {
  state.sets.push({ a: state.currentSet.gamesA, b: state.currentSet.gamesB });
  state.currentSet = { gamesA: 0, gamesB: 0 };
  state.currentGame = freshGame();
  state.tiebreak = null;

  const setsWonA = state.sets.filter((s) => s.a > s.b).length;
  const setsWonB = state.sets.filter((s) => s.b > s.a).length;

  if (setsWonA >= state.setsToWin) state.matchWinner = "A";
  else if (setsWonB >= state.setsToWin) state.matchWinner = "B";
}

function winGame(state, winner) {
  if (winner === "A") state.currentSet.gamesA += 1;
  else state.currentSet.gamesB += 1;

  state.currentGame = freshGame();
  state.tiebreak = null;
  switchServer(state);

  const { gamesA, gamesB } = state.currentSet;

  // Tiebreak při 6:6
  if (gamesA === 6 && gamesB === 6) {
    state.tiebreak = freshTiebreak();
    return;
  }

  // Standardní výhra setu (6 her s rozdílem 2, nebo 7:5)
  const leaderGames = Math.max(gamesA, gamesB);
  const diff = Math.abs(gamesA - gamesB);
  if (leaderGames >= 6 && diff >= 2) {
    finishSet(state, gamesA > gamesB ? "A" : "B");
  }
}

function winTiebreak(state, winner) {
  // Vítěz tiebreaku bere set 7:6
  if (winner === "A") state.currentSet.gamesA = 7;
  else state.currentSet.gamesB = 7;
  switchServer(state);
  finishSet(state, winner);
}

function addPoint(state, player) {
  if (state.matchWinner) return state; // zápas už skončil, ignorovat

  state.lastPointWinner = player;

  if (state.tiebreak) {
    const tb = state.tiebreak;
    if (player === "A") tb.pA += 1;
    else tb.pB += 1;

    const leader = Math.max(tb.pA, tb.pB);
    const diff = Math.abs(tb.pA - tb.pB);
    if (leader >= 7 && diff >= 2) {
      winTiebreak(state, tb.pA > tb.pB ? "A" : "B");
    }
    return state;
  }

  const g = state.currentGame;
  if (player === "A") g.pA += 1;
  else g.pB += 1;

  const leader = Math.max(g.pA, g.pB);
  const diff = Math.abs(g.pA - g.pB);
  if (leader >= 4 && diff >= 2) {
    winGame(state, g.pA > g.pB ? "A" : "B");
  }

  return state;
}

module.exports = {
  initialState,
  addPoint,
  gameScoreDisplay,
};
