# Živé tenisové skóre

Jednoduchá webová aplikace: jeden člověk zadává skóre zápasu, ostatní ho sledují na svém telefonu
nebo počítači živě (v reálném čase přes websockety).

## Co je uvnitř

- `server.js` – Node.js server (Express + Socket.io), drží stav zápasu a rozesílá změny všem připojeným.
- `matchLogic.js` – čistá logika tenisového skóre (0-15-30-40, shoda/výhoda, sety, tiebreak při 6:6).
- `public/index.html` – úvodní stránka s odkazy.
- `public/scorer.html` – ovládací panel pro zadávání bodů.
- `public/viewer.html` – stránka pro diváky, jen ke čtení, aktualizuje se sama.
- `test-logic.js`, `test-live.js` – automatické testy (logika skóre + reálná websocket synchronizace).

Podporováno: 0-15-30-40, shoda a výhoda, tiebreak při 6:6 (do 7, rozdíl 2), zápas na 2 nebo 3
vítězné sety, undo posledního bodu, reset zápasu, vlastní jména hráčů.

Záměrně **není** řešeno: více zápasů najednou (na to jste se ptali, že to teď nepotřebujete),
historie uložená mezi restarty serveru (stav žije jen v paměti běžícího serveru), přihlašování uživatelů.

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

### Poznámka k více zápasům

Aktuální verze drží jeden sdílený zápas pro všechny připojené. Pokud byste později chtěli více
souběžných zápasů (např. turnaj s více kurty), dá se to rozšířit – dejte vědět.

## Jak to funguje technicky

Prohlížeč diváka i toho, kdo zadává skóre, se připojí na server přes websocket (Socket.io).
Když scorer klikne na "Bod pro A/B", pošle se na server zpráva, server přepočítá skóre podle
tenisových pravidel a výsledek rozešle úplně všem připojeným prohlížečům najednou – proto je
skóre "živé" bez nutnosti obnovovat stránku.
