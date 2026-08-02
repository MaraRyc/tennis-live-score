// server.js
// Jednoduchý živý tenisový skórovač: Express + Socket.io
// Jeden zápas najednou, stav drží server v paměti, klienti se synchronizují přes websockety.

const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { initialState, addPoint, gameScoreDisplay, computeStats } = require("./matchLogic");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

let state = initialState();
let history = []; // zásobník předchozích stavů pro Undo (max 50)

function cloneState(s) {
  return JSON.parse(JSON.stringify(s));
}

function pushHistory() {
  history.push(cloneState(state));
  if (history.length > 50) history.shift();
}

function publicPayload() {
  return { state, display: gameScoreDisplay(state), stats: computeStats(state) };
}

function broadcast() {
  io.emit("state", publicPayload());
}

io.on("connection", (socket) => {
  // Nově připojený klient (scorer i divák) dostane aktuální stav ihned.
  socket.emit("state", publicPayload());

  socket.on("action", (action) => {
    if (!action || typeof action.type !== "string") return;

    switch (action.type) {
      case "point": {
        if (action.player !== "A" && action.player !== "B") return;
        pushHistory();
        addPoint(state, action.player, action.reason);
        break;
      }
      case "undo": {
        const prev = history.pop();
        if (prev) state = prev;
        break;
      }
      case "reset": {
        pushHistory();
        state = initialState(
          state.playerA,
          state.playerB,
          state.setsToWin,
          state.deciderSuperTiebreak
        );
        break;
      }
      case "setNames": {
        pushHistory();
        if (typeof action.playerA === "string" && action.playerA.trim()) {
          state.playerA = action.playerA.trim().slice(0, 40);
        }
        if (typeof action.playerB === "string" && action.playerB.trim()) {
          state.playerB = action.playerB.trim().slice(0, 40);
        }
        break;
      }
      case "setFormat": {
        // 2 = best of 3, 3 = best of 5; deciderSuperTiebreak = rozhodující sada jako supertiebreak do 10
        pushHistory();
        if (action.setsToWin === 2 || action.setsToWin === 3) {
          state.setsToWin = action.setsToWin;
        }
        if (typeof action.deciderSuperTiebreak === "boolean") {
          state.deciderSuperTiebreak = action.deciderSuperTiebreak;
        }
        break;
      }
      default:
        return;
    }

    broadcast();
  });
});

server.listen(PORT, () => {
  console.log(`Tennis live score server running on port ${PORT}`);
});
