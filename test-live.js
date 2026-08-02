// Ověří, že scorer klient odesílá body a viewer klient je vidí živě přes websocket.
const { io } = require("socket.io-client");
const http = require("http");

const URL = "http://localhost:3000";

function httpGet(pathname) {
  return new Promise((resolve, reject) => {
    http.get(URL + pathname, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on("error", reject);
  });
}

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

  // test kategorizace bodu (reason) a promítnutí do stats payloadu
  scorer.emit("action", { type: "point", player: "A", reason: "ace" });
  await wait(200);
  const afterAce = viewerStates[viewerStates.length - 1];
  if (afterAce.state.lastPointReason !== "ace") {
    throw new Error("Důvod bodu (ace) se nepropsal do stavu");
  }
  if (!afterAce.stats || afterAce.stats.stats.A.aces !== 1) {
    throw new Error("Statistika es se nespočítala správně, dostal jsem " + JSON.stringify(afterAce.stats));
  }

  // test formátu: zapnutí supertiebreaku jako rozhodující sady
  scorer.emit("action", { type: "setFormat", setsToWin: 2, deciderSuperTiebreak: true });
  await wait(150);
  const afterFormat = viewerStates[viewerStates.length - 1];
  if (afterFormat.state.deciderSuperTiebreak !== true) {
    throw new Error("Nastavení supertiebreaku jako rozhodující sady se nepropsalo");
  }

  // test ručního přehození podávajícího
  const serverBefore = afterFormat.state.server;
  const expectedNext = serverBefore === "A" ? "B" : "A";
  scorer.emit("action", { type: "setServer", player: expectedNext });
  await wait(150);
  const afterSwap = viewerStates[viewerStates.length - 1];
  if (afterSwap.state.server !== expectedNext) {
    throw new Error(`Ruční přehození podávajícího selhalo, čekal jsem ${expectedNext}, dostal jsem ${afterSwap.state.server}`);
  }
  console.log("Test ručního přehození podávajícího OK.");

  // test izolace více zápasů: dva různé kódy zápasu se nesmí ovlivňovat
  const matchAlpha = io(URL, { transports: ["websocket"], query: { matchId: "ALPHA1" } });
  const matchBeta = io(URL, { transports: ["websocket"], query: { matchId: "BETA1" } });
  await new Promise((resolve) => matchAlpha.on("connect", resolve));
  await new Promise((resolve) => matchBeta.on("connect", resolve));

  let alphaLast = null;
  let betaLast = null;
  matchAlpha.on("state", (p) => { alphaLast = p; });
  matchBeta.on("state", (p) => { betaLast = p; });

  matchAlpha.emit("action", { type: "reset" });
  matchBeta.emit("action", { type: "reset" });
  await wait(150);

  matchAlpha.emit("action", { type: "point", player: "A" });
  matchAlpha.emit("action", { type: "point", player: "A" });
  await wait(200);

  if (!alphaLast || alphaLast.display.a !== 30) {
    throw new Error("Zápas ALPHA1 nemá očekávané skóre 30:0");
  }
  if (!betaLast || betaLast.display.a !== 0 || betaLast.display.b !== 0) {
    throw new Error("Zápas BETA1 by měl zůstat na 0:0, ale ovlivnily ho body ze zápasu ALPHA1: " + JSON.stringify(betaLast && betaLast.display));
  }
  console.log("Test izolace zápasů OK: ALPHA1 a BETA1 se navzájem neovlivňují.");

  matchAlpha.close();
  matchBeta.close();

  // test statických souborů (PWA manifest, ikona, match-id.js)
  const staticChecks = ["/manifest.json", "/icon.svg", "/match-id.js", "/stats.html"];
  for (const p of staticChecks) {
    const status = await httpGet(p);
    if (status !== 200) throw new Error(`Statický soubor ${p} vrátil status ${status}, čekal jsem 200`);
  }
  console.log("Test statických souborů OK:", staticChecks.join(", "));

  console.log("\nŽIVÝ TEST OK: scorer -> viewer synchronizace, jména, undo, kategorizace bodů, formát zápasu, izolace více zápasů i statické soubory fungují.");
  process.exit(0);
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

main().catch((err) => {
  console.error("ŽIVÝ TEST SELHAL:", err.message);
  process.exit(1);
});
