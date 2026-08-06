// matchLogic.js
// Čistá logika tenisového skóre (bez závislosti na serveru), snadno testovatelná.

const POINT_REASONS = [
  "winner",
  "ace",
  "service_winner",
  "forced_error",
  "unforced_error",
  "double_fault",
];

// Typ úderu se dá vybrat jen u winneru, vynucené a nevynucené chyby (u esa/přímého
// bodu z podání/dvojchyby jde o servis, ne o standardní úder).
const SHOT_TYPES = [
  "forehand",
  "backhand",
  "forehand_volley",
  "backhand_volley",
  "smash",
  "dropshot",
  "forehand_slice",
  "backhand_slice",
];
const SHOT_TYPE_REASONS = ["winner", "forced_error", "unforced_error"];

// Sdílená normalizace kategorizace bodu – používá jak addPoint (nový bod), tak
// editPointMeta (zpětná oprava už odehraného bodu), aby se pravidla nerozjížděla.
function normalizeReason(reason) {
  return POINT_REASONS.includes(reason) ? reason : null;
}
function normalizeShotType(normalizedReason, shotType) {
  return SHOT_TYPE_REASONS.includes(normalizedReason) && SHOT_TYPES.includes(shotType) ? shotType : null;
}
function normalizeServeNumber(normalizedReason, serveNumber) {
  // Dvojchyba je z definice o tom, že selhal i 2. servis – servisní číslo se
  // proto vždy vynutí na 2, ať scorer vybral cokoliv.
  return normalizedReason === "double_fault" ? 2 : serveNumber === 2 ? 2 : 1;
}

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
    lastPointShotType: null,
    startedAt: null, // čas prvního bodu
    endedAt: null, // čas konce zápasu
    pointLog: [], // historie bodů: {t, winner, reason, server, serveNumber, setIndex, superTiebreak, opportunity, converted}
    paused: false, // hra je právě přerušená (déšť, ošetření, ...)
    pauseReason: null,
    pauses: [], // historie přerušení: {reason, startedAt, endedAt}
    retired: false, // zápas skončil předčasně vzdáním/skrečí
    retiredPlayer: null, // kdo se vzdal (null pokud retired=false)
    retirementReason: null,
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

// Zjistí, jestli je aktuální stav hry (před odehráním bodu) pro někoho break/game point.
// Vrátí { type: 'break'|'game', player } nebo null. Platí jen pro běžné hry (ne tiebreaky).
function detectOpportunity(state, g) {
  const leader = Math.max(g.pA, g.pB);
  const diff = Math.abs(g.pA - g.pB);
  // leader < 3: nikdo ještě nemá 40. diff < 1: shoda (40:40) – tam vede až
  // výhoda, samotná shoda se za break/game point nepočítá.
  if (leader < 3 || diff < 1) return null;
  const leadingPlayer = g.pA > g.pB ? "A" : "B";
  const type = leadingPlayer === state.server ? "game" : "break";
  return { type, player: leadingPlayer };
}

// Přeruší hru (déšť, ošetření, tma...). Dokud je hra přerušená, body se nedají zadávat.
function pauseMatch(state, reason) {
  if (state.matchWinner || state.paused) return state;
  const cleanReason = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 120) : null;
  state.paused = true;
  state.pauseReason = cleanReason;
  state.pauses.push({ reason: cleanReason, startedAt: Date.now(), endedAt: null });
  return state;
}

// Ukončí aktuální přerušení a pokračuje ve hře.
function resumeMatch(state) {
  if (!state.paused) return state;
  const last = state.pauses[state.pauses.length - 1];
  if (last && last.endedAt == null) last.endedAt = Date.now();
  state.paused = false;
  state.pauseReason = null;
  return state;
}

// Předčasné ukončení zápasu (skreč/vzdání). retiringPlayer je ten, kdo končí –
// vítězem se stává automaticky ten druhý.
function retireMatch(state, retiringPlayer, reason) {
  if (state.matchWinner) return state;
  if (retiringPlayer !== "A" && retiringPlayer !== "B") return state;
  resumeMatch(state); // uzavře případné probíhající přerušení
  const cleanReason = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 120) : null;
  state.retired = true;
  state.retiredPlayer = retiringPlayer;
  state.retirementReason = cleanReason;
  state.matchWinner = retiringPlayer === "A" ? "B" : "A";
  state.endedAt = Date.now();
  return state;
}

function addPoint(state, player, reason, serveNumber, shotType) {
  if (state.matchWinner || state.paused) return state; // zápas skončil nebo je přerušený, ignorovat
  if (player !== "A" && player !== "B") return state;

  const normalizedReason = normalizeReason(reason);
  const normalizedServeNumber = normalizeServeNumber(normalizedReason, serveNumber);
  const normalizedShotType = normalizeShotType(normalizedReason, shotType);

  if (!state.startedAt) state.startedAt = Date.now();

  state.lastPointWinner = player;
  state.lastPointReason = normalizedReason;
  state.lastPointShotType = normalizedShotType;

  // Break/game point se sleduje jen v běžné hře (ne v tiebreaku) – musí se
  // spočítat PŘED přičtením tohoto bodu, protože zjišťujeme, jestli tenhle
  // bod byl příležitostí k výhře hry.
  const opportunity =
    !state.tiebreak && !state.isSuperTiebreakSet ? detectOpportunity(state, state.currentGame) : null;
  const converted = opportunity ? opportunity.player === player : null;

  state.pointLog.push({
    t: Date.now(),
    winner: player,
    reason: normalizedReason,
    shotType: normalizedShotType,
    server: state.server,
    serveNumber: normalizedServeNumber,
    setIndex: state.sets.length,
    superTiebreak: !!state.isSuperTiebreakSet,
    opportunity,
    converted,
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

// Opraví zpětně kategorizaci (důvod / typ úderu / servisní číslo) u už odehraného bodu
// v pointLogu podle jeho indexu. Nemění, kdo bod vyhrál, ani průběžné skóre hry/setu –
// vítěz bodu a jeho pořadí zůstávají netknuté, mění se jen metadata použitá pro
// statistiky. Díky tomu je oprava bezpečná i pro už dohraný zápas.
function editPointMeta(state, index, updates) {
  if (!Array.isArray(state.pointLog) || !Number.isInteger(index) || index < 0 || index >= state.pointLog.length) {
    return state;
  }
  const p = state.pointLog[index];
  const normalizedReason = normalizeReason(updates.reason);
  p.reason = normalizedReason;
  p.shotType = normalizeShotType(normalizedReason, updates.shotType);
  p.serveNumber = normalizeServeNumber(normalizedReason, updates.serveNumber);

  // Pokud jde o poslední odehraný bod, ať je "poslední bod" v hlavním stavu
  // (viditelný na scoreru/viewer.html) v souladu s tím, co jsme právě opravili.
  if (index === state.pointLog.length - 1) {
    state.lastPointReason = normalizedReason;
    state.lastPointShotType = p.shotType;
  }
  return state;
}

// Zpětná změna VÍTĚZE už odehraného bodu (scorer se spletl, kdo bod vyhrál).
// Na rozdíl od editPointMeta se tohle nedá jen "opravit na místě" – kdo vyhraje
// jednotlivé body ovlivňuje, kdy končí hry/sady/tiebreaky a tedy i střídání
// podání pro všechny další body. Proto se celý zápas přehraje znovu od začátku
// s opraveným vítězem u daného bodu (ostatní body i jejich metadata zůstávají).
//
// Pojistka: pokud by oprava způsobila, že zápas skončí dřív, než kolik bodů bylo
// doopravdy odehráno (novější body by "zmizely"), appka opravu odmítne a vrátí
// { applied: false, state: <původní nezměněný stav> } – bezpečnější než tiše
// zahodit reálně odehrané body. Ruční přehození podávajícího (tlačítko "Vyměnit
// podání") se v pointLogu nezaznamenává, takže takové korekce se při přehrání
// nedají obnovit - u čerstvých bodů (viz omezení na posledních 10 v UI) je to
// ale málo pravděpodobné.
function editPointWinner(state, index, newWinner) {
  if (!Array.isArray(state.pointLog) || index < 0 || index >= state.pointLog.length) {
    return { applied: false, state };
  }
  if (newWinner !== "A" && newWinner !== "B") {
    return { applied: false, state };
  }
  if (state.pointLog[index].winner === newWinner) {
    return { applied: true, state }; // není co měnit
  }

  // U opraveného bodu se zároveň vynuluje důvod/typ úderu – ten se vázal na
  // původního (špatného) vítěze a po přehození by dával nesmysl (např. "eso",
  // které najednou "hraje" hráč, co ve skutečnosti nepodával).
  const correctedLog = state.pointLog.map((p, i) =>
    i === index ? { ...p, winner: newWinner, reason: null, shotType: null } : p
  );

  const fresh = initialState(state.playerA, state.playerB, state.setsToWin, state.deciderSuperTiebreak);
  for (const p of correctedLog) {
    addPoint(fresh, p.winner, p.reason, p.serveNumber, p.shotType);
  }

  if (fresh.pointLog.length !== correctedLog.length) {
    // zápas by touhle opravou skončil dřív, než kolik bodů bylo odehráno -> odmítnout
    return { applied: false, state };
  }

  // zachovat původní časy bodů (jinak by "přehráním" appka tvářila, že se všechny
  // odehrály najednou, což by rozbilo délku zápasu i graf vývoje)
  fresh.pointLog.forEach((p, i) => { p.t = correctedLog[i].t; });
  fresh.startedAt = correctedLog[0].t;

  // pauzy appka z jednotlivých bodů odvodit neumí, přenesou se tak, jak byly
  fresh.paused = state.paused;
  fresh.pauseReason = state.pauseReason;
  fresh.pauses = state.pauses;

  if (state.retired) {
    // zápas skončil skrečí, ne doehráním - to se ze samotných bodů nedá poznat,
    // aplikuje se to navrch stejně jako předtím
    retireMatch(fresh, state.retiredPlayer, state.retirementReason);
  }

  if (fresh.matchWinner && state.matchWinner === fresh.matchWinner) {
    // výsledek zápasu zůstal stejný jako předtím -> zachovat původní čas konce
    fresh.endedAt = state.endedAt;
  }

  return { applied: true, state: fresh };
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

function freshPlayerStats() {
  return {
    pointsWon: 0,
    winners: 0,
    aces: 0,
    serviceWinners: 0,
    forcedErrors: 0,
    unforcedErrors: 0,
    doubleFaults: 0,
    breakPointsChances: 0,
    breakPointsWon: 0,
    gamePointsChances: 0,
    gamePointsWon: 0,
    firstServe: { played: 0, won: 0 },
    secondServe: { played: 0, won: 0 },
    // Rozpad podle typu úderu – klíč je hodnota ze SHOT_TYPES, hodnota počet výskytů.
    winnersByShot: {},
    forcedErrorsByShot: {},
    unforcedErrorsByShot: {},
  };
}

function bumpShotCount(bucket, shotType) {
  if (!shotType) return;
  bucket[shotType] = (bucket[shotType] || 0) + 1;
}

// Spočítá agregované statistiky z point logu (winnery, esa, chyby, break/game pointy,
// úspěšnost po 1./2. servisu, délku zápasu atd.)
function computeStats(state) {
  const stats = { A: freshPlayerStats(), B: freshPlayerStats() };

  for (const p of state.pointLog) {
    const winner = p.winner;
    const loser = winner === "A" ? "B" : "A";
    stats[winner].pointsWon += 1;
    switch (p.reason) {
      case "winner":
        stats[winner].winners += 1;
        bumpShotCount(stats[winner].winnersByShot, p.shotType);
        break;
      case "ace":
        stats[winner].aces += 1;
        break;
      case "service_winner":
        stats[winner].serviceWinners += 1;
        break;
      case "forced_error":
        stats[loser].forcedErrors += 1;
        bumpShotCount(stats[loser].forcedErrorsByShot, p.shotType);
        break;
      case "unforced_error":
        stats[loser].unforcedErrors += 1;
        bumpShotCount(stats[loser].unforcedErrorsByShot, p.shotType);
        break;
      case "double_fault":
        stats[loser].doubleFaults += 1;
        break;
      default:
        break;
    }

    if (p.opportunity) {
      const key = p.opportunity.type === "break" ? "breakPoints" : "gamePoints";
      stats[p.opportunity.player][`${key}Chances`] += 1;
      if (p.converted) stats[p.opportunity.player][`${key}Won`] += 1;
    }

    // Statistika servisu se počítá vždy podle toho, kdo v daném bodě podával.
    const serverPlayer = p.server;
    if (serverPlayer === "A" || serverPlayer === "B") {
      const bucket = p.serveNumber === 2 ? "secondServe" : "firstServe";
      stats[serverPlayer][bucket].played += 1;
      if (p.winner === serverPlayer) stats[serverPlayer][bucket].won += 1;
    }
  }

  const durationMs = state.startedAt ? (state.endedAt || Date.now()) - state.startedAt : null;

  const pausedMs = state.pauses.reduce((sum, p) => sum + ((p.endedAt || Date.now()) - p.startedAt), 0);

  return {
    stats,
    totalPoints: state.pointLog.length,
    durationMs,
    durationLabel: formatDuration(durationMs),
    interruptions: state.pauses.map((p) => ({
      reason: p.reason,
      durationMs: (p.endedAt || Date.now()) - p.startedAt,
      durationLabel: formatDuration((p.endedAt || Date.now()) - p.startedAt),
      ongoing: p.endedAt == null,
    })),
    pausedMsTotal: pausedMs,
  };
}

// Data pro graf vývoje zápasu (podobně jako eval graf na chess.com): pro každý
// odehraný bod vrátí kumulativní rozdíl vyhraných bodů (A mínus B) a jestli tím
// bodem skončil set, aby šly na grafu vyznačit hranice setů.
function computeMomentum(state) {
  let diff = 0;
  return state.pointLog.map((p, i) => {
    diff += p.winner === "A" ? 1 : -1;
    const nextSetIndex = state.pointLog[i + 1] ? state.pointLog[i + 1].setIndex : p.setIndex;
    return {
      index: i + 1,
      diff,
      setIndex: p.setIndex,
      setEnd: nextSetIndex !== p.setIndex,
    };
  });
}

module.exports = {
  initialState,
  addPoint,
  editPointMeta,
  editPointWinner,
  gameScoreDisplay,
  computeStats,
  computeMomentum,
  formatDuration,
  pauseMatch,
  resumeMatch,
  retireMatch,
  POINT_REASONS,
  SHOT_TYPES,
  SHOT_TYPE_REASONS,
};
