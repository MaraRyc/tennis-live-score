// Ověří, že scorer klient odesílá body a viewer klient je vidí živě přes websocket.
const { io } = require("socket.io-client");
const http = require("http");
const fs = require("fs");
const path = require("path");

const URL = "http://localhost:3000";

// Simulace zápasu uloženého starší verzí appky (bez polí paused/pauses/retired...),
// aby se ověřilo, že appka na starých datech po upgradu nepadá.
function writeOldSchemaFixture() {
  const dataDir = path.join(__dirname, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const oldShapeState = {
    playerA: "Stará A",
    playerB: "Stará B",
    setsToWin: 2,
    deciderSuperTiebreak: false,
    sets: [],
    currentSet: { gamesA: 1, gamesB: 0 },
    currentGame: { pA: 1, pB: 0 },
    tiebreak: null,
    isSuperTiebreakSet: false,
    superTiebreak: null,
    server: "A",
    matchWinner: null,
    lastPointWinner: "A",
    lastPointReason: null,
    startedAt: Date.now() - 1000,
    endedAt: null,
    pointLog: [{ t: Date.now() - 1000, winner: "A", reason: null, server: "A", setIndex: 0 }],
    // záměrně chybí: paused, pauseReason, pauses, retired, retiredPlayer, retirementReason
  };
  fs.writeFileSync(path.join(dataDir, "OLDSCHEMA.json"), JSON.stringify(oldShapeState));
}

function httpGet(pathname) {
  return new Promise((resolve, reject) => {
    http.get(URL + pathname, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on("error", reject);
  });
}

async function main() {
  // Zpětná kompatibilita: appka nesmí spadnout, když se připojí k zápasu
  // uloženému starší verzí (bez novějších polí paused/pauses/retired...).
  writeOldSchemaFixture();
  const oldSchemaClient = io(URL, { transports: ["websocket"], query: { matchId: "OLDSCHEMA" } });
  const oldSchemaPayload = await new Promise((resolve, reject) => {
    oldSchemaClient.on("state", resolve);
    oldSchemaClient.on("connect_error", reject);
    setTimeout(() => reject(new Error("timeout při čekání na stav starého zápasu")), 3000);
  });
  if (!oldSchemaPayload.stats || !Array.isArray(oldSchemaPayload.stats.interruptions)) {
    throw new Error("Zápas se starým schématem se nenačetl správně: " + JSON.stringify(oldSchemaPayload.stats));
  }
  if (oldSchemaPayload.state.playerA !== "Stará A" || oldSchemaPayload.display.a !== 15) {
    throw new Error("Stará data zápasu se nenačetla správně: " + JSON.stringify(oldSchemaPayload.state));
  }
  oldSchemaClient.close();
  console.log("Test zpětné kompatibility se starým schématem OK.");

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

  // test kategorie "přímý bod z podání" + servisní číslo se promítne do stats payloadu
  scorer.emit("action", { type: "reset" });
  await wait(150);
  scorer.emit("action", { type: "point", player: "A", reason: "service_winner", serveNumber: 2 });
  await wait(200);
  const afterServiceWinner = viewerStates[viewerStates.length - 1];
  if (afterServiceWinner.state.lastPointReason !== "service_winner") {
    throw new Error("Kategorie 'přímý bod z podání' se nepropsala do stavu");
  }
  if (afterServiceWinner.stats.stats.A.serviceWinners !== 1) {
    throw new Error("Statistika 'přímý bod z podání' se nespočítala, dostal jsem " + JSON.stringify(afterServiceWinner.stats.stats.A));
  }
  if (afterServiceWinner.stats.stats.A.secondServe.played !== 1 || afterServiceWinner.stats.stats.A.secondServe.won !== 1) {
    throw new Error("Statistika 2. servisu se nespočítala správně: " + JSON.stringify(afterServiceWinner.stats.stats.A.secondServe));
  }
  console.log("Test 'přímý bod z podání' + servisní statistiky OK.");
  console.log("Test ručního přehození podávajícího OK.");

  // test přerušení hry: body se během pauzy nemají počítat, po pokračování zase ano
  scorer.emit("action", { type: "reset" });
  await wait(150);
  scorer.emit("action", { type: "pause", reason: "Déšť" });
  await wait(150);
  const afterPause = viewerStates[viewerStates.length - 1];
  if (afterPause.state.paused !== true || afterPause.state.pauseReason !== "Déšť") {
    throw new Error("Přerušení hry se nepropsalo do stavu: " + JSON.stringify(afterPause.state.paused) + " / " + afterPause.state.pauseReason);
  }
  scorer.emit("action", { type: "point", player: "A" }); // během pauzy by se neměl počítat
  await wait(200);
  const duringPause = viewerStates[viewerStates.length - 1];
  if (duringPause.display.a !== 0) {
    throw new Error("Bod zadaný během pauzy se neměl počítat, dostal jsem " + JSON.stringify(duringPause.display));
  }
  scorer.emit("action", { type: "resume" });
  await wait(150);
  const afterResume = viewerStates[viewerStates.length - 1];
  if (afterResume.state.paused !== false) {
    throw new Error("Hra se po 'resume' neměla vrátit do stavu paused=false");
  }
  scorer.emit("action", { type: "point", player: "A" }); // teď už se má počítat
  await wait(200);
  const afterResumePoint = viewerStates[viewerStates.length - 1];
  if (afterResumePoint.display.a !== 15) {
    throw new Error("Bod po 'resume' se neměl ignorovat, dostal jsem " + JSON.stringify(afterResumePoint.display));
  }
  console.log("Test přerušení hry (pauza/pokračování) OK.");

  // test předčasného ukončení zápasu (skreč)
  scorer.emit("action", { type: "retire", player: "B", reason: "zranění kolena" });
  await wait(200);
  const afterRetire = viewerStates[viewerStates.length - 1];
  if (afterRetire.state.matchWinner !== "A" || afterRetire.state.retired !== true) {
    throw new Error("Skreč se nepropsala správně: " + JSON.stringify({ winner: afterRetire.state.matchWinner, retired: afterRetire.state.retired }));
  }
  if (afterRetire.state.retirementReason !== "zranění kolena") {
    throw new Error("Důvod skreče se nepropsal správně: " + afterRetire.state.retirementReason);
  }
  console.log("Test předčasného ukončení zápasu (skreč) OK.");

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
