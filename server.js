// server.js
// Živý tenisový skórovač: Express + Socket.io
// Podporuje více souběžných zápasů (podle kódu v URL ?m=KOD) a ukládá stav na disk,
// aby restart/spánek serveru (např. na Renderu po neaktivitě) nevynuloval rozehraný zápas.

const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const {
  initialState,
  addPoint,
  gameScoreDisplay,
  computeStats,
  computeMomentum,
  pauseMatch,
  resumeMatch,
  retireMatch,
} = require("./matchLogic");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DEFAULT_MATCH_ID = "default";

fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.static(path.join(__dirname, "public")));

// V paměti: matchId -> { state, history }. Historie (pro Undo) se na disk neukládá,
// je jen pro běžící proces – po restartu serveru se Undo prostě "zapomene", ale
// samotné skóre zápasu zůstává zachované.
const matches = new Map();

function sanitizeMatchId(raw) {
  if (typeof raw !== "string") return DEFAULT_MATCH_ID;
  const cleaned = raw.trim().slice(0, 32).replace(/[^A-Za-z0-9_-]/g, "");
  return cleaned || DEFAULT_MATCH_ID;
}

function matchFilePath(matchId) {
  return path.join(DATA_DIR, `${matchId}.json`);
}

function cloneState(s) {
  return JSON.parse(JSON.stringify(s));
}

function loadStateFromDisk(matchId) {
  try {
    const raw = fs.readFileSync(matchFilePath(matchId), "utf8");
    const parsed = JSON.parse(raw);
    // Základní kontrola, že soubor obsahuje rozumný stav zápasu.
    if (parsed && typeof parsed === "object" && parsed.playerA && parsed.playerB) {
      // Zpětná kompatibilita: zápas uložený starší verzí appky nemusí mít
      // novější pole (paused, pauses, retired...). Doplníme je výchozími
      // hodnotami, aby appka na starých datech nepadala.
      const base = initialState(
        parsed.playerA,
        parsed.playerB,
        parsed.setsToWin,
        parsed.deciderSuperTiebreak
      );
      return { ...base, ...parsed };
    }
  } catch (err) {
    // Soubor neexistuje nebo je poškozený – začneme s čistým zápasem.
  }
  return null;
}

function saveStateToDisk(matchId, state) {
  try {
    fs.writeFileSync(matchFilePath(matchId), JSON.stringify(state));
  } catch (err) {
    console.error(`Nepodařilo se uložit zápas ${matchId} na disk:`, err.message);
  }
}

function getOrCreateMatch(matchId) {
  if (matches.has(matchId)) return matches.get(matchId);

  const loaded = loadStateFromDisk(matchId);
  const match = { state: loaded || initialState(), history: [] };
  matches.set(matchId, match);
  return match;
}

function payloadFor(match) {
  return {
    state: match.state,
    display: gameScoreDisplay(match.state),
    stats: computeStats(match.state),
    momentum: computeMomentum(match.state),
  };
}

function pushHistory(match) {
  match.history.push(cloneState(match.state));
  if (match.history.length > 50) match.history.shift();
}

io.on("connection", (socket) => {
  const matchId = sanitizeMatchId(socket.handshake.query.matchId);
  socket.data.matchId = matchId;
  socket.join(matchId);

  const match = getOrCreateMatch(matchId);
  socket.emit("state", payloadFor(match));

  socket.on("action", (action) => {
    if (!action || typeof action.type !== "string") return;
    const match = getOrCreateMatch(matchId);

    switch (action.type) {
      case "point": {
        if (action.player !== "A" && action.player !== "B") return;
        pushHistory(match);
        addPoint(match.state, action.player, action.reason, action.serveNumber, action.shotType);
        break;
      }
      case "undo": {
        const prev = match.history.pop();
        if (prev) match.state = prev;
        break;
      }
      case "reset": {
        pushHistory(match);
        match.state = initialState(
          match.state.playerA,
          match.state.playerB,
          match.state.setsToWin,
          match.state.deciderSuperTiebreak
        );
        break;
      }
      case "setNames": {
        pushHistory(match);
        if (typeof action.playerA === "string" && action.playerA.trim()) {
          match.state.playerA = action.playerA.trim().slice(0, 40);
        }
        if (typeof action.playerB === "string" && action.playerB.trim()) {
          match.state.playerB = action.playerB.trim().slice(0, 40);
        }
        break;
      }
      case "setFormat": {
        // 2 = best of 3, 3 = best of 5; deciderSuperTiebreak = rozhodující sada jako supertiebreak do 10
        pushHistory(match);
        if (action.setsToWin === 2 || action.setsToWin === 3) {
          match.state.setsToWin = action.setsToWin;
        }
        if (typeof action.deciderSuperTiebreak === "boolean") {
          match.state.deciderSuperTiebreak = action.deciderSuperTiebreak;
        }
        break;
      }
      case "setServer": {
        // Ruční přehození podávajícího (např. když appka podání netrefila,
        // nebo si ho scorer chce jen opravit).
        if (action.player !== "A" && action.player !== "B") return;
        if (match.state.matchWinner) return;
        pushHistory(match);
        match.state.server = action.player;
        break;
      }
      case "pause": {
        pushHistory(match);
        pauseMatch(match.state, action.reason);
        break;
      }
      case "resume": {
        pushHistory(match);
        resumeMatch(match.state);
        break;
      }
      case "retire": {
        if (action.player !== "A" && action.player !== "B") return;
        pushHistory(match);
        retireMatch(match.state, action.player, action.reason);
        break;
      }
      default:
        return;
    }

    saveStateToDisk(matchId, match.state);
    io.to(matchId).emit("state", payloadFor(match));
  });
});

server.listen(PORT, () => {
  console.log(`Tennis live score server running on port ${PORT}`);
});
