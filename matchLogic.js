// matchLogic.js
// Čistá logika tenisového skóre (bez závislosti na serveru), snadno testovatelná.

const POINT_REASONS = ["winner", "ace", "forced_error", "unforced_error", "double_fault"];

function freshGame() {
  return { pA: 0, pB: 0 }; // syrové body ve hře (mimo tiebreak)
}

function freshTiebreak() {
  return { pA: 0, pB: 0 };
}

function initialState(
  playerA = "Hráč A",
  playerB = "Hráč B",
  setsToWin = 2,
  deciderSuperTiebreak = false
) {
  return {
    playerA,
    playerB,
    setsToWin, // best of 3 => 2, best of 5 => 3
    deciderSuperTiebreak, // rozhodující sada se hraje jako supertiebreak do 10
    sets: [], // dokončené sety: {a: 6, b: 4} nebo {a: 10, b: 7, superTiebreak: true}
    currentSet: { gamesA: 0, gamesB: 0 },
    currentGame: freshGame(),
    tiebreak: null, // pokud probíhá běžný tiebreak (do 7): {pA, pB}
    isSuperTiebreakSet: false, // právě se hraje rozhodující supertiebreak místo sady
    superTiebreak: null, // {pA, pB} pro rozhodující supertiebreak (do 10)
    server: "A", // kdo podává (informativní)
    matchWinner: null, // null | 'A' | 'B'
    lastPointWinner: null,
    lastPointReason: null,
    startedAt: null, // čas prvního bodu
    endedAt: null, // čas konce zápasu
    pointLog: [], // historie bodů pro statistiky: {t, winner, reason, server, setIndex, superTiebreak}
  };
}

function pointLabel(p) {
  return [0, 15, 30, 40][p] ?? 40;
}

// Vrátí popis aktuálního skóre hry pro zobrazení
function gameScoreDisplay(state) {
  if (state.matchWinner) return null;

  if (state.isSuperTiebreakSet) {
    return { type: "superTiebreak", a: state.superTiebreak.pA, b: state.superTiebreak.pB };
  }

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

// Po dohrání jakékoliv sady (běžné i supertiebreak) zkontroluje konec zápasu
// nebo nastartuje rozhodující supertiebreak místo poslední sady.
function afterSetFinished(state) {
  const setsWonA = state.sets.filter((s) => s.a > s.b).length;
  const setsWonB = state.sets.filter((s) => s.b > s.a).length;

  if (setsWonA >= state.setsToWin) {
    state.matchWinner = "A";
    state.endedAt = Date.now();
    return;
  }
  if (setsWonB >= state.setsToWin) {
    state.matchWinner = "B";
    state.endedAt = Date.now();
    return;
  }

  // Rozhodující sada (např. 1:1 na sety u best of 3) jako supertiebreak do 10
  if (
    state.deciderSuperTiebreak &&
    setsWonA === state.setsToWin - 1 &&
    setsWonB === state.setsToWin - 1
  ) {
    state.isSuperTiebreakSet = true;
    state.superTiebreak = freshTiebreak();
  }
}

function finishSet(state) {
  state.sets.push({ a: state.currentSet.gamesA, b: state.currentSet.gamesB });
  state.currentSet = { gamesA: 0, gamesB: 0 };
  state.currentGame = freshGame();
  state.tiebreak = null;
  afterSetFinished(state);
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
    finishSet(state);
  }
}

function winTiebreak(state, winner) {
  // Vítěz tiebreaku bere set 7:6. Podání se během tiebreaku už střídalo po bodech
  // (viz addPoint), takže tady se už nepřehazuje – server je správně nastavený
  // na toho, kdo má podávat první game příští sady.
  if (winner === "A") state.currentSet.gamesA = 7;
  else state.currentSet.gamesB = 7;
  finishSet(state);
}

function winSuperTiebreak(state, winner) {
  const tb = state.superTiebreak;
  state.sets.push({ a: tb.pA, b: tb.pB, superTiebreak: true });
  state.superTiebreak = null;
  state.isSuperTiebreakSet = false;
  afterSetFinished(state);
}

// V (super)tiebreaku se podání střídá po 1. bodu a pak po každých 2 bodech.
function maybeSwitchServerInBreaker(state, tb) {
  const totalPoints = tb.pA + tb.pB;
  if (totalPoints % 2 === 1) switchServer(state);
}

function addPoint(state, player, reason) {
  if (state.matchWinner) return state; // zápas už skončil, ignorovat
  if (player !== "A" && player !== "B") return state;

  const normalizedReason = POINT_REASONS.includes(reason) ? reason : null;

  if (!state.startedAt) state.startedAt = Date.now();

  state.lastPointWinner = player;
  state.lastPointReason = normalizedReason;

  state.pointLog.push({
    t: Date.now(),
    winner: player,
    reason: normalizedReason,
    server: state.server,
    setIndex: state.sets.length,
    superTiebreak: !!state.isSuperTiebreakSet,
  });

  if (state.isSuperTiebreakSet) {
    const tb = state.superTiebreak;
    if (player === "A") tb.pA += 1;
    else tb.pB += 1;
    maybeSwitchServerInBreaker(state, tb);

    const leader = Math.max(tb.pA, tb.pB);
    const diff = Math.abs(tb.pA - tb.pB);
    if (leader >= 10 && diff >= 2) {
      winSuperTiebreak(state, tb.pA > tb.pB ? "A" : "B");
    }
    return state;
  }

  if (state.tiebreak) {
    const tb = state.tiebreak;
    if (player === "A") tb.pA += 1;
    else tb.pB += 1;
    maybeSwitchServerInBreaker(state, tb);

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

function formatDuration(ms) {
  if (ms == null) return null;
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts = [];
  if (h) parts.push(`${h} h`);
  if (h || m) parts.push(`${m} min`);
  parts.push(`${s} s`);
  return parts.join(" ");
}

// Spočítá agregované statistiky z point logu (winnery, esa, chyby, délku zápasu atd.)
function computeStats(state) {
  const stats = {
    A: { pointsWon: 0, winners: 0, aces: 0, forcedErrors: 0, unforcedErrors: 0, doubleFaults: 0 },
    B: { pointsWon: 0, winners: 0, aces: 0, forcedErrors: 0, unforcedErrors: 0, doubleFaults: 0 },
  };

  for (const p of state.pointLog) {
    const winner = p.winner;
    const loser = winner === "A" ? "B" : "A";
    stats[winner].pointsWon += 1;
    switch (p.reason) {
      case "winner":
        stats[winner].winners += 1;
        break;
      case "ace":
        stats[winner].aces += 1;
        break;
      case "forced_error":
        stats[loser].forcedErrors += 1;
        break;
      case "unforced_error":
        stats[loser].unforcedErrors += 1;
        break;
      case "double_fault":
        stats[loser].doubleFaults += 1;
        break;
      default:
        break;
    }
  }

  const durationMs = state.startedAt ? (state.endedAt || Date.now()) - state.startedAt : null;

  return {
    stats,
    totalPoints: state.pointLog.length,
    durationMs,
    durationLabel: formatDuration(durationMs),
  };
}

module.exports = {
  initialState,
  addPoint,
  gameScoreDisplay,
  computeStats,
  formatDuration,
  POINT_REASONS,
};
