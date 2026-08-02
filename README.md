# Živé tenisové skóre

Jednoduchá webová aplikace: jeden člověk zadává skóre zápasu, ostatní ho sledují na svém telefonu
nebo počítači živě (v reálném čase přes websockety).

## Co je uvnitř

- `server.js` – Node.js server (Express + Socket.io), drží stav zápasu a rozesílá změny všem připojeným.
- `matchLogic.js` – čistá logika tenisového skóre (0-15-30-40, shoda/výhoda, sety, tiebreak při 6:6).
- `public/index.html` – úvodní stránka s odkazy.
- `public/scorer.html` – ovládací panel pro zadávání bodů (včetně výběru, jak byl bod vyhrán).
- `public/viewer.html` – stránka pro diváky, jen ke čtení, aktualizuje se sama.
- `public/stats.html` – statistiky zápasu (délka, winnery, esa, chyby) + stažení CSV/TXT.
- `test-logic.js`, `test-live.js` – automatické testy (logika skóre + reálná websocket synchronizace).

Podporováno: 0-15-30-40, shoda a výhoda, tiebreak při 6:6 (do 7, rozdíl 2), zápas na 2 nebo 3
vítězné sety, volitelný supertiebreak do 10 místo rozhodující (poslední) sady, undo posledního
bodu, reset zápasu, vlastní jména hráčů.

U každého bodu si scorer může (nepovinně) vybrat, jak byl vyhrán: Winner, Eso, Vynucená chyba
soupeře, Nevynucená chyba soupeře, Dvojchyba soupeře, nebo bez upřesnění. Eso jde vybrat jen když
daný hráč zrovna podává, Dvojchyba soupeře jen když podává ten druhý – aplikace nabídne jen
možnosti, které v dané situaci dávají smysl. Ze zaznamenaných bodů se pak na stránce statistik
počítá délka zápasu a součty za oba hráče, s možností stáhnout podrobný log bodů (CSV) nebo textové
shrnutí (TXT).

Záměrně **není** řešeno: více zápasů najednou (na to jste se ptali, že to teď nepotřebujete),
historie uložená mezi restarty serveru (stav i statistiky žijí jen v paměti běžícího serveru,
při restartu serveru na Renderu např. po delší neaktivitě se ztratí), přihlašování uživatelů.
Pokud budete chtít statistiky uchovat trvale, stáhněte si je (CSV/TXT) hned po skončení zápasu.

## Vyzkoušení na vlastním počítači

Vyžaduje Node.js (verze 18+).

```bash
npm install
npm start
```

Pak otevřete `http://localhost:3000` v prohlížeči.

## Nasazení zdarma online (Render.com)

Vybral jsem Render, protože nabízí bezplatný plán bez nutnosti zadávat platební kartu. Ověřil jsem
aktuální podmínky (srpen 2026): free plán má 750 hodin běhu měsíčně, 512 MB RAM, a **server po 15
minutách neaktivity usne** – první požadavek po probuzení může trvat 30–60 sekund, než se stránka
načte. Pro rekreační sledování zápasu je to v pořádku, jen o tom vězte předem.

### Postup

1. Založte si zdarma účet na [render.com](https://render.com) (stačí e-mail, karta se nevyžaduje).
2. Nahrajte tuto složku (`tennis-live-score`) do repozitáře na GitHubu (nebo GitLabu) – Render z něj bude nasazovat.
   - Nejjednodušší cesta: na GitHubu vytvořte nový repozitář, nahrajte do něj obsah této složky.
3. V Renderu klikněte na **New +** → **Web Service** a propojte daný repozitář.
4. Nastavte:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. Klikněte na **Create Web Service**. Render aplikaci nasadí a přidělí adresu typu
   `https://vas-nazev.onrender.com`.
6. Až se nasazení dokončí, pošlete divákům odkaz `https://vas-nazev.onrender.com/viewer.html`
   a sami použijte `https://vas-nazev.onrender.com/scorer.html`.

### Aktualizace už nasazené aplikace

Pokud už máte repozitář na GitHubu propojený s Renderem, stačí v repozitáři nahradit změněné
soubory (nejjednodušeji přes GitHub web: otevřete soubor → tužka "Edit" → vložte nový obsah →
Commit; nebo smažte starý a nahrajte nový přes "Add file → Upload files"). Jakmile commit proběhne
na sledované větvi (obvykle `main`), Render automaticky spustí nový deploy během minuty.

### Poznámka k více zápasům

Aktuální verze drží jeden sdílený zápas pro všechny připojené. Pokud byste později chtěli více
souběžných zápasů (např. turnaj s více kurty), dá se to rozšířit – dejte vědět.

## Jak to funguje technicky

Prohlížeč diváka i toho, kdo zadává skóre, se připojí na server přes websocket (Socket.io).
Když scorer klikne na "Bod pro A/B", pošle se na server zpráva, server přepočítá skóre podle
tenisových pravidel a výsledek rozešle úplně všem připojeným prohlížečům najednou – proto je
skóre "živé" bez nutnosti obnovovat stránku.
