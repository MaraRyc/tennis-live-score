// match-id.js
// Sdílená pomůcka: zjistí kód zápasu z URL (?m=KOD) a umí sestavit odkazy mezi stránkami,
// které kód zachovají. Bez zadaného kódu se používá jeden výchozí sdílený zápas ("default").

function getMatchId() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('m');
  if (!raw) return null; // null = výchozí sdílený zápas
  return raw.trim().slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '') || null;
}

function matchLink(page) {
  const id = getMatchId();
  return id ? `${page}?m=${encodeURIComponent(id)}` : page;
}

function applyMatchLinks() {
  document.querySelectorAll('[data-match-link]').forEach((el) => {
    const page = el.getAttribute('data-match-link');
    el.setAttribute('href', matchLink(page));
  });
}
