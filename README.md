# Živé tenisové skóre

Webová aplikace: jeden člověk zadává skóre zápasu, ostatní ho sledují na svém telefonu nebo
počítači živě (v reálném čase přes websockety). Podporuje více souběžných zápasů, statistiky bodů
a instalaci jako appku na plochu telefonu.

## Co je uvnitř

- `server.js` – Node.js server (Express + Socket.io). Drží stav libovolného počtu zápasů (podle
  kódu v URL), rozesílá změny všem připojeným a ukládá stav každého zápasu do souboru v `data/`.
- `matchLogic.js` – čistá logika tenisového skóre (0-15-30-40, shoda/výhoda, sety, tiebreak,
  supertiebreak, střídání podání, statistiky).
- `public/index.html` – úvodní stránka: vytvoření nového zápasu, otevření podle kódu.
- `public/scorer.html` – ovládací panel pro zadávání bodů (včetně výběru, jak byl bod vyhrán).
- `public/viewer.html` – stránka pro diváky, jen ke čtení, aktualizuje se sama.
- `public/stats.html` – statistiky zápasu (délka, winnery, esa, chyby), stažení CSV/TXT, sdílení výsledku.
- `public/match-id.js` – sdílená pomůcka pro práci s kódem zápasu v URL.
- `public/manifest.json`, `public/icon.svg` – aby šla appka přidat na plochu telefonu (PWA).
- `test-logic.js`, `test-live.js` – automatické testy (logika skóre + reálná websocket synchronizace).

### Pravidla skóre

0-15-30-40, shoda a výhoda, tiebreak při 6:6 (do 7, rozdíl 2) se správným střídáním podání
(po 1. bodu, pak po každých 2), zápas na 2 nebo 3 vítězné sety, volitelný supertiebreak do 10
místo rozhodující (poslední) sady, undo posledního bodu, reset zápasu, vlastní jména hráčů.
Na scoreru je vidět, kdo zrovna podává (míček u jména), a jde to ručně přehodit tlačítkem
"🔄 Vyměnit podání", kdyby appka podání netrefila.

### Kategorizace bodů a statistiky

U každého bodu si scorer může (nepovinně) vybrat servis (1. nebo 2.) a jak byl bod vyhrán:
Winner, Eso, Přímý bod z podání (soupeř se podání dotkl, ale nevrátil ho do hry), Vynucená chyba,
Nevynucená chyba, Dvojchyba soupeře, nebo bez upřesnění. Eso a Přímý bod z podání jdou vybrat jen
když daný hráč zrovna podává, Dvojchyba soupeře jen když podává ten druhý.

Break pointy a game pointy (proměněné i nevyužité) appka sleduje automaticky podle skóre hry –
scorer u nich nic nevybírá. Na stránce statistik se počítá délka zápasu, součty za oba hráče
(včetně % bodů vyhraných po 1. a po 2. servisu), s možností stáhnout podrobný log bodů (CSV),
textové shrnutí (TXT), nebo rovnou sdílet krátký výsledek (tlačítko Sdílet – použije nativní sdílení
na mobilu, jinak zkopíruje text do schránky).

### Displej diváka nezhasíná

Na `viewer.html` appka standardně drží displej zapnutý (Screen Wake Lock API), aby sledující nemuseli
telefon pořád znovu odemykat. Jde to vypnout zaškrtávátkem "Nenechat zhasnout displej". Funguje na
většině moderních prohlížečů (Safari 16.4+, Chrome, Edge); pokud prohlížeč funkci nepodporuje, appka
to napíše a jinak normálně funguje dál.

### Více zápasů najednou

Na úvodní stránce lze tlačítkem "Nový zápas" vytvořit zápas s unikátním kódem (např. `K7X9QP`).
Odkazy `scorer.html?m=K7X9QP`, `viewer.html?m=K7X9QP`, `stats.html?m=K7X9QP` pak vedou jen na tenhle
zápas – ostatní zápasy s jiným kódem běží nezávisle vedle sebe. Bez kódu v odkazu appka používá
jeden výchozí sdílený zápas (staré odkazy bez `?m=` dál fungují).

### Instalace na plochu telefonu (PWA)

V mobilním prohlížeči lze appku přidat na plochu (Safari: Sdílet → Přidat na plochu; Chrome:
nabídne se automaticky nebo přes nabídku ⋮ → Přidat na plochu). Na iOSu se kvůli technickému
omezení může místo naší ikony zobrazit univerzální náhradní ikona – funkčnost appky to neovlivní.

## Vyzkoušení na vlastním počítači

Vyžaduje Node.js (verze 18+).

```bash
npm install
npm start
```

Pak otevřete `http://localhost:3000` v prohlížeči.

## Nasazení zdarma online (Render.com)

Vybral jsem Render, protože nabízí bezplatný plán bez nutnosti zadávat platební kartu (někdy si
Render kartu vyžádá jako ověření identity – jde jen o dočasnou autorizaci ~1 USD, hned vrácenou,
samotný Free plán zůstává 0 USD/měsíc).

### ⚠️ Důležité omezení free plánu, které je potřeba znát

Free instance na Renderu má **efemérní (dočasný) souborový systém**: po 15 minutách neaktivity
server usne, a jakmile se probudí (nebo je znovu nasazen), veškeré soubory zapsané na disk se
ztratí – včetně toho, co jsme si teď přidali (ukládání zápasu na disk). To znamená, že perzistence
zápasu, kterou appka nově umí, **na free Renderu reálně nezabrání ztrátě rozehraného zápasu po delší
pauze** – pomůže jen při běžném restartu procesu (např. pádu aplikace), ne při uspání kvůli
neaktivitě.

Pro hraní s kamarády, kde zápas typicky netrvá s pauzami déle než 15 minut, to nevadí. Pokud ale
chcete mít jistotu, že appka nikdy neusne (např. u delšího turnaje s přestávkami), máte dvě reálné
možnosti:

1. **Bezplatný "keep-alive" ping** – nastavte si na [cron-job.org](https://cron-job.org) nebo
   [UptimeRobot](https://uptimerobot.com) pravidelný požadavek na vaši adresu (např. každých
   10 minut). Dokud appka dostává provoz, neusne a soubory na disku zůstanou.
2. **Placený Starter plán** (7 USD/měsíc) – běží bez uspávání a navíc podporuje opravdu trvalý
   disk.

### Postup nasazení

1. Založte si zdarma účet na [render.com](https://render.com).
2. Nahrajte tuto složku (`tennis-live-score`) do repozitáře na GitHubu – Render z něj bude nasazovat.
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

Nahraďte v GitHub repozitáři změněné soubory (přes "Add file → Upload files" – přepíše stejnojmenné
soubory) a potvrďte commit. Render u free plánu nový commit sám automaticky nenasadí vždy hned –
pokud se do minuty nic nezačne dít, jděte do Render dashboardu na service → **Manual Deploy** →
**Deploy latest commit**.

## Jak to funguje technicky

Prohlížeč diváka i toho, kdo zadává skóre, se připojí na server přes websocket (Socket.io), podle
kódu zápasu v URL se zařadí do odpovídající "místnosti". Když scorer klikne na bod, pošle se na
server zpráva, server přepočítá skóre podle tenisových pravidel, uloží stav zápasu do souboru a
výsledek rozešle všem připojeným v dané místnosti najednou – proto je skóre "živé" bez nutnosti
obnovovat stránku.
