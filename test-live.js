// Ověří, že scorer klient odesílá body a viewer klient je vidí živě přes websocket.
const { io } = require("socket.io-client");

const URL = "http://localhost:3000";

async function main() {
  const scorer = io(URL, { transports: ["websocket"] });
  const viewer = io(URL, { transports: ["websocket"] });

  let viewerStates = [];
  viewer.on("state", (payload) => viewerStates.push(payload));

  await new Promise((resolve) => scorer.on("connect", resolve));
  await new Promise((resolve) => viewer.on("connect", resolve));

  // reset pro čistý stav
  scorer.emit("action", { type: "reset" });
  await wait(150);
  viewerStates = [];

  // nastavit jména
  scorer.emit("action", { type: "setNames", playerA: "Petra", playerB: "Jana" });
  await wait(150);

  // 3 body pro Petru
  scorer.emit("action", { type: "point", player: "A" });
  scorer.emit("action", { type: "point", player: "A" });
  scorer.emit("action", { type: "point", player: "A" });
  await wait(300);

  const last = viewerStates[viewerStates.length - 1];
  console.log("Viewer poslední stav:", JSON.stringify(last.display), last.state.playerA, last.state.playerB);

  if (last.state.playerA !== "Petra" || last.state.playerB !== "Jana") {
    throw new Error("Jména se nesynchronizovala na viewer klienta");
  }
  if (last.display.type !== "points" || last.display.a !== 40) {
    throw new Error("Skóre se nesynchronizovalo správně (očekáváno 40:0)");
  }
  if (viewerStates.length < 4) {
    throw new Error("Viewer nedostal očekávaný počet živých aktualizací (reset+jména+3 body)");
  }

  // test undo
  scorer.emit("action", { type: "undo" });
  await wait(200);
  const afterUndo = viewerStates[viewerStates.length - 1];
  if (afterUndo.display.a !== 30) {
    throw new Error("Undo nefungovalo správně, očekáváno 30:0, dostal jsem " + JSON.stringify(afterUndo.display));
  }

  console.log("\nŽIVÝ TEST OK: scorer -> viewer synchronizace, jména i undo fungují přes websocket.");
  process.exit(0);
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

main().catch((err) => {
  console.error("ŽIVÝ TEST SELHAL:", err.message);
  process.exit(1);
});
