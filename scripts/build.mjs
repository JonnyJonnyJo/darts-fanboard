// Baut die fertige Webseite in den Ordner _site/:
//  - kopiert die statischen Dateien
//  - holt News, Termine und WM-Paarungen aus Supabase (öffentlicher Lesezugriff, anon-Key aus config.js)
//    und schreibt sie fest ins HTML, damit Google sie ohne JavaScript lesen kann
//  - erzeugt Unterseiten (News-Artikel, Spielplan, Tippspiel, Scorer, Checkout-Rechner), sitemap.xml und robots.txt
// Aufruf: node scripts/build.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, '_site');
const SITE = 'https://dartsaktuell.com';
const TZ = 'Europe/Berlin';
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => /^https?:\/\//i.test(String(u || '')) ? String(u) : '';
const write = (rel, content) => { const p = path.join(OUT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, rel.endsWith('.html') ? localize(content) : content); };

/* ---------- Daten laden ---------- */
const cfg = rd('config.js');
const URL_ = (cfg.match(/supabaseUrl:\s*'([^']+)'/) || [])[1];
const KEY = (cfg.match(/supabaseAnonKey:\s*'([^']+)'/) || [])[1];
async function rest(q) {
  const r = await fetch(`${URL_}/rest/v1/${q}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`${q}: HTTP ${r.status}`);
  return r.json();
}
const whenOf = d => new Date(d + 'T12:00:00Z').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: TZ });
let data;
try {
  const [n, e, w, m] = await Promise.all([
    rest('news?select=*&order=published_at.desc,id.desc&limit=200'),
    rest('events?select=*&order=starts_on'),
    rest('winners?select=*&order=id'),
    rest('matches?select=*&order=starts_at')
  ]);
  if (!n.length) throw new Error('keine News');
  data = {
    news: n.map(r => ({ id: r.id, slug0: r.slug, body: r.body, top: r.is_top, tag: r.tag, title: r.title, teaser: r.teaser, url: r.url, source: r.source, date: r.published_at, when: r.when_label || whenOf(r.published_at) })),
    events: e.map(r => ({ start: r.starts_on, end: r.ends_on, name: r.name, location: r.location })),
    winners: w, matches: m
  };
  console.log(`Supabase: ${data.news.length} News, ${data.events.length} Termine, ${data.matches.length} Spiele`);
} catch (err) {
  console.warn('Supabase nicht erreichbar, nehme data/*.json:', err.message);
  const n = JSON.parse(rd('data/news.json')), e = JSON.parse(rd('data/events.json')), m = JSON.parse(rd('data/matches.json'));
  data = { news: n.items || [], events: e.upcoming || [], winners: e.winners || [], matches: (m.matches || []).map(x => ({ ...x, round: x.round, best_of: x.best_of })) };
}
data.news.sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.id > a.id ? 1 : -1));

/* ---------- Slugs für News ---------- */
const slugify = s => String(s).toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '');
const used = new Set();
for (const n of data.news) {
  const base = n.slug0 || slugify(n.title) || 'news';
  let s = base, i = 2;
  while (used.has(s)) s = `${base}-${i++}`;
  used.add(s); n.slug = s; n.path = `/news/${s}/`;
}

/* ---------- Bausteine aus index.html ---------- */
let index = rd('index.html');
const headEnd = index.indexOf('</head>');
const head = index.slice(0, headEnd);
const navStart = index.indexOf('<nav>'), navEnd = index.indexOf('</nav>') + 6;
const nav = index.slice(navStart, navEnd);
const footStart = index.indexOf('<footer'), footEnd = index.indexOf('</footer>') + 9;
const footer = index.slice(footStart, footEnd);
const section = id => {
  const re = new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</div></section>`);
  const m = index.match(re); if (!m) throw new Error('Abschnitt fehlt: ' + id); return m[0];
};
// Kopf-Teil ohne die seitenspezifischen Meta-Tags der Startseite
const baseHead = head
  .replace(/<title>[\s\S]*?<\/title>\n?/, '')
  .replace(/<meta name="description"[^>]*>\n?/, '')
  .replace(/<link rel="canonical"[^>]*>\n?/, '')
  .replace(/<meta property="og:(title|description|url|type)"[^>]*>\n?/g, '')
  .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/, '');
const headFor = ({ title, desc, url, type = 'website', ld }) => baseHead.replace('<meta charset="utf-8">', `<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${url}">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${url}">${ld ? `\n<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}`) + '</head>\n<body>\n';
const crumbs = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it[0], item: SITE + it[1] })) });
const intro = (h1, text, crumbHtml = '') => `<section class="hero band"><div class="wrap">${crumbHtml}<div class="newshead"><h1>${h1}</h1><p>${text}</p></div></div></section>`;
const crumbNav = items => `<nav aria-label="Brotkrumen" class="crumbs">${items.map((it, i) => i < items.length - 1 ? `<a href="${it[1]}">${esc(it[0])}</a>` : `<span>${esc(it[0])}</span>`).join(' › ')}</nav>`;
const SCRIPTS = {
  app: '<script src="/app.js"></script>',
  db: '<script src="/config.js"></script>\n<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>',
  tipp: '<script src="/tippspiel.js"></script>',
  news: '<script src="/news.js"></script>'
};
const page = (meta, body, scripts = []) => `${headFor(meta)}${nav}\n${body}\n${footer}\n${scripts.map(s => SCRIPTS[s]).join('\n')}\n</body>\n</html>\n`;

/* ---------- News-HTML ---------- */
const fmtDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
// Artikeltext: Absätze durch Leerzeilen, "## " = Zwischenüberschrift, "- " = Aufzählung, [Text](https://…) = Link, **fett**
const inline = t => esc(t).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, a, u) => `<a href="${u}" rel="noopener" target="_blank">${a}</a>`).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const bodyHtml = s => String(s || '').trim().split(/\n\s*\n/).map(bl => {
  bl = bl.trim();
  if (bl.startsWith('## ')) return `<h2>${inline(bl.slice(3))}</h2>`;
  if (bl.startsWith('### ')) return `<h3>${inline(bl.slice(4))}</h3>`;
  const lines = bl.split('\n');
  if (lines.every(l => /^\s*- /.test(l))) return `<ul>${lines.map(l => `<li>${inline(l.replace(/^\s*- /, ''))}</li>`).join('')}</ul>`;
  return `<p>${lines.map(inline).join('<br>')}</p>`;
}).join('\n');
const meta = n => `<div class="meta"><span class="tag">${esc(n.tag)}</span><span class="when">${esc(n.when)}</span></div>`;
const src = n => { const u = safeUrl(n.url); return u ? `<span class="src">Quelle: <a href="${esc(u)}" rel="noopener" target="_blank">${esc(n.source || 'Link')}</a></span>` : ''; };
const leadHtml = n => `${meta(n)}<h2><a href="${n.path}">${esc(n.title)}</a></h2><p>${esc(n.teaser)}</p>${src(n)}`;
const cardHtml = (n, h = 'h3') => `<article class="ncard">${meta(n)}<${h}><a href="${n.path}">${esc(n.title)}</a></${h}><p>${esc(n.teaser)}</p>${src(n)}</article>`;

/* ---------- Ausgabe ---------- */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const f of ['admin.html', 'impressum.html', 'datenschutz.html', 'teilnahmebedingungen.html', 'config.js', 'tippspiel.js', 'news.js', 'app.js', 'style.css', 'CNAME', 'manifest.webmanifest'])
  if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
fs.cpSync(path.join(ROOT, 'data'), path.join(OUT, 'data'), { recursive: true });
if (fs.existsSync(path.join(ROOT, 'img'))) fs.cpSync(path.join(ROOT, 'img'), path.join(OUT, 'img'), { recursive: true });

/* ---------- Schriften & Bibliothek selbst ausliefern (keine Verbindung zu Google/jsDelivr beim Besuch) ---------- */
const CDN_SB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });
let fontCss = '/* Systemschriften als Ersatz */\n';
try {
  const css = await (await fetch('https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Barlow:wght@400;500;700&display=swap', { headers: { 'User-Agent': UA } })).text();
  const blocks = css.split('/* ').filter(x => x.startsWith('latin */'));
  if (!blocks.length) throw new Error('keine latin-Schriften');
  const out = [];
  for (const bl of blocks) {
    const fam = bl.match(/font-family: '([^']+)'/)[1], w = bl.match(/font-weight: (\d+)/)[1], u = bl.match(/url\((https:[^)]+)\)/)[1], ur = bl.match(/unicode-range: ([^;]+)/)[1];
    const file = `${fam.toLowerCase()}-${w}.woff2`;
    const r = await fetch(u); if (!r.ok) throw new Error('Schrift ' + r.status);
    fs.writeFileSync(path.join(OUT, 'fonts', file), Buffer.from(await r.arrayBuffer()));
    out.push(`@font-face{font-family:'${fam}';font-style:normal;font-weight:${w};font-display:swap;src:url(/fonts/${file}) format('woff2');unicode-range:${ur}}`);
  }
  fontCss = out.join('\n') + '\n';
  console.log(`Schriften lokal: ${out.length}`);
} catch (err) { console.warn('Schriften nicht geladen, nutze Systemschriften:', err.message); }
fs.writeFileSync(path.join(OUT, 'fonts', 'fonts.css'), fontCss);
let SB_SRC = CDN_SB;
try {
  const r = await fetch(CDN_SB); if (!r.ok) throw new Error(r.status);
  const js = await r.text(); if (js.length < 50000) throw new Error('zu klein');
  fs.mkdirSync(path.join(OUT, 'vendor'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'vendor', 'supabase.js'), js);
  SB_SRC = '/vendor/supabase.js';
  console.log('supabase-js lokal');
} catch (err) {
  if (process.env.CI) { console.error('supabase-js konnte nicht geladen werden – Abbruch, die alte Version bleibt online:', err.message); process.exit(1); }
  console.warn('supabase-js bleibt auf jsDelivr:', err.message);
}
const localize = html => html.split(CDN_SB).join(SB_SRC);
if (fs.existsSync(path.join(OUT, 'admin.html'))) fs.writeFileSync(path.join(OUT, 'admin.html'), localize(fs.readFileSync(path.join(OUT, 'admin.html'), 'utf8')));

// Startseite: News fest einbauen
const li = Math.max(0, data.news.findIndex(n => n.top));
const lead = data.news[li];
index = index.replace('<!--PRERENDER:lead-->', lead ? leadHtml(lead) : '')
  .replace('<!--PRERENDER:list-->', data.news.filter((_, i) => i !== li).slice(0, 6).map(n => cardHtml(n)).join(''));
write('index.html', index);

const pages = [{ url: '/', pri: '1.0', freq: 'hourly' }];

// News-Übersicht
write('news/index.html', page(
  { title: 'Darts-News aktuell – WM 2026/27, Premier League & PDC-Turniere | Darts aktuell', desc: 'Aktuelle Darts-News auf Deutsch: Darts-WM 2026/27, Auslosung, Ergebnisse, Premier League und alle großen PDC-Turniere – täglich aktualisiert.', url: '/news/',
    ld: crumbs([['Darts aktuell', '/'], ['News', '/news/']]) },
  intro('Darts-News <span>aktuell</span>', 'Alle Meldungen rund um die Darts-WM 2026/27 und die großen PDC-Turniere, neueste zuerst.', crumbNav([['Startseite', '/'], ['News', '/news/']]))
  + `<section class="band"><div class="wrap"><div class="newslist">${data.news.map(n => cardHtml(n, 'h2')).join('')}</div></div></section>`
));
pages.push({ url: '/news/', pri: '0.9', freq: 'hourly' });

// News-Artikel
for (const [i, n] of data.news.entries()) {
  const u = safeUrl(n.url);
  const more = data.news.filter(x => x !== n).slice(0, 3);
  const ld = [{ '@context': 'https://schema.org', '@type': 'NewsArticle', headline: n.title, description: n.teaser, ...(n.body ? { wordCount: String(n.body).split(/\s+/).length } : {}), datePublished: n.date, dateModified: n.date, inLanguage: 'de-DE', mainEntityOfPage: SITE + n.path,
    author: { '@type': 'Organization', name: 'Darts aktuell', url: SITE + '/' }, publisher: { '@type': 'Organization', name: 'Darts aktuell', url: SITE + '/' } },
    crumbs([['Darts aktuell', '/'], ['News', '/news/'], [n.title, n.path]])];
  write(`news/${n.slug}/index.html`, page(
    { title: `${n.title} | Darts aktuell`, desc: String(n.teaser || n.title).slice(0, 158), url: n.path, type: 'article', ld },
    `<section class="hero band"><div class="wrap">${crumbNav([['Startseite', '/'], ['News', '/news/'], [n.title, n.path]])}
<article class="lead article">${meta(n)}<h1>${esc(n.title)}</h1><p class="date">Veröffentlicht am <time datetime="${esc(n.date)}">${fmtDate(n.date)}</time></p><p>${esc(n.teaser)}</p>${n.body ? `<div class="body">${bodyHtml(n.body)}</div>` : ''}${u ? `<p>Mehr dazu bei der Quelle: <a href="${esc(u)}" rel="noopener" target="_blank">${esc(n.source || u)}</a></p>` : ''}
<div class="row"><a class="btn-y" href="/darts-wm-spielplan/">WM-Spielplan</a><a class="btn-y" href="/darts-tippspiel/">Zum Tippspiel</a></div></article>
</div></section>
<section class="band"><div class="wrap"><h2>Weitere Darts-News</h2><div class="newslist">${more.map(x => cardHtml(x)).join('')}</div><p style="margin:18px 0 0"><a class="btn-y" href="/news/">Alle News</a></p></div></section>`
  ));
  pages.push({ url: n.path, pri: '0.7', freq: 'weekly', mod: n.date });
}

// WM-Spielplan (inkl. Turnierkalender) – Paarungen fest eingebaut, news.js aktualisiert live
const dayOf = iso => new Date(iso).toLocaleDateString('sv-SE', { timeZone: TZ });
const timeOf = iso => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
let staticMatches = '';
if (data.matches.length) {
  const days = [...new Set(data.matches.map(m => dayOf(m.starts_at)))].sort();
  staticMatches = `<div class="wrap"><h2>Alle Paarungen und Ergebnisse</h2>${days.map(d => {
    const rows = data.matches.filter(m => dayOf(m.starts_at) === d);
    const label = new Date(d + 'T12:00:00Z').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return `<h3>${label}</h3><table class="stack"><thead><tr><th>Zeit</th><th>Runde</th><th>Spieler 1</th><th>Ergebnis</th><th>Spieler 2</th></tr></thead><tbody>${rows.map(m => {
      const done = m.sets1 != null && m.sets2 != null;
      return `<tr><td>${timeOf(m.starts_at)}</td><td>${esc(m.round)}</td><td>${esc(m.player1)}</td><td>${done ? `${m.sets1}:${m.sets2}` : '–:–'}</td><td>${esc(m.player2)}</td></tr>`;
    }).join('')}</tbody></table>`;
  }).join('')}</div>`;
}
write('darts-wm-spielplan/index.html', page(
  { title: 'Darts-WM 2026/27 Spielplan: alle Termine, Uhrzeiten & Ergebnisse | Darts aktuell', desc: 'Der komplette Spielplan der PDC Darts-WM 2026/27 im Ally Pally (11.12.2026 – 3.1.2027): alle Runden, Sessions mit deutschen Uhrzeiten, Paarungen und Ergebnisse.', url: '/darts-wm-spielplan/',
    ld: [crumbs([['Darts aktuell', '/'], ['Darts-WM Spielplan', '/darts-wm-spielplan/']]),
      { '@context': 'https://schema.org', '@type': 'SportsEvent', name: 'PDC World Darts Championship 2026/27', startDate: '2026-12-11', endDate: '2027-01-03', eventStatus: 'https://schema.org/EventScheduled', sport: 'Darts',
        location: { '@type': 'Place', name: 'Alexandra Palace', address: { '@type': 'PostalAddress', addressLocality: 'London', addressCountry: 'GB' } }, organizer: { '@type': 'Organization', name: 'Professional Darts Corporation', url: 'https://www.pdc.tv' } }] },
  intro('Darts-WM 2026/27 <span>Spielplan</span>', 'Alle Runden, Sessions und Uhrzeiten (deutsche Zeit) der Weltmeisterschaft im Alexandra Palace – mit Paarungen und Ergebnissen, sobald sie feststehen.', crumbNav([['Startseite', '/'], ['Darts-WM Spielplan', '/darts-wm-spielplan/']]))
  + section('spielplan') + (staticMatches ? `<section class="band">${staticMatches}</section>` : '') + section('turniere'),
  ['app', 'db', 'news']
));
pages.push({ url: '/darts-wm-spielplan/', pri: '0.9', freq: 'hourly' });

// Tippspiel
write('darts-tippspiel/index.html', page(
  { title: 'Darts-WM Tippspiel 2026/27 – kostenlos mittippen | Darts aktuell', desc: 'Kostenloses Tippspiel zur Darts-WM 2026/27: Ergebnisse tippen, Bonusfragen beantworten und in der Rangliste mit anderen Darts-Fans messen. Ohne Einsatz, ohne Gewinne.', url: '/darts-tippspiel/',
    ld: crumbs([['Darts aktuell', '/'], ['Darts-Tippspiel', '/darts-tippspiel/']]) },
  intro('Darts-WM <span>Tippspiel</span>', 'Kostenlos und ohne Einsatz: Tipp die Spiele der WM 2026/27, beantworte die Bonusfragen und kletter in der Rangliste nach oben. Anmeldung per E-Mail-Link, ganz ohne Passwort.', crumbNav([['Startseite', '/'], ['Darts-Tippspiel', '/darts-tippspiel/']]))
  + section('tippspiel'),
  ['db', 'tipp']
));
pages.push({ url: '/darts-tippspiel/', pri: '0.8', freq: 'daily' });

// Scorer
write('darts-scorer/index.html', page(
  { title: 'Darts-Scorer online: 501 & 301 zählen mit Checkout-Hilfe | Darts aktuell', desc: 'Kostenloser Darts-Scorer im Browser: 501 oder 301 für zwei Spieler zählen, Würfe direkt auf der Scheibe antippen, mit Average und Checkout-Vorschlägen. Ohne Anmeldung.', url: '/darts-scorer/',
    ld: [crumbs([['Darts aktuell', '/'], ['Darts-Scorer', '/darts-scorer/']]),
      { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Darts-Scorer', url: SITE + '/darts-scorer/', applicationCategory: 'SportsApplication', operatingSystem: 'Browser', inLanguage: 'de-DE', offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' } }] },
  intro('Darts-Scorer <span>online</span>', 'Zähl deine Legs direkt im Browser: Spielmodus wählen, Würfe auf der Scheibe antippen – Rest, Average und der passende Checkout werden automatisch angezeigt.', crumbNav([['Startseite', '/'], ['Darts-Scorer', '/darts-scorer/']]))
  + section('spiel'),
  ['app']
));
pages.push({ url: '/darts-scorer/', pri: '0.8', freq: 'monthly' });

// Checkout-Rechner + feste Tabelle 2–170 (gleicher Algorithmus wie app.js)
const appSrc = rd('app.js');
const coSrc = appSrc.slice(appSrc.indexOf('const TH=[];'), appSrc.indexOf('const chip='));
const suggest = new Function(coSrc + '; return suggest;')();
const kind = l => l.startsWith('D') || l === 'Bull' ? 'dbl' : l.startsWith('T') ? 'tr' : '';
const rows = [];
for (let v = 170; v >= 2; v--) {
  const r = suggest(v);
  rows.push(`<tr id="finish-${v}"><td><b>${v}</b></td><td>${r ? r.map(d => `<span class="${kind(d.l)}">${d.l}</span>`).join(' ') : 'kein Finish'}</td><td>${r ? r.length : '–'}</td></tr>`);
}
const bogeys = [169, 168, 166, 165, 163, 162, 159].filter(v => !suggest(v));
write('checkout-rechner/index.html', page(
  { title: 'Darts Checkout-Rechner & Checkout-Tabelle 170 bis 2 | Darts aktuell', desc: 'Darts Checkout-Rechner: für jede Restzahl von 170 bis 2 der beste Weg zum Doppel. Mit kompletter Checkout-Tabelle, Bogey-Numbers und Profi-Finishes wie 170, 167 und 121.', url: '/checkout-rechner/',
    ld: [crumbs([['Darts aktuell', '/'], ['Checkout-Rechner', '/checkout-rechner/']]),
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
        { '@type': 'Question', name: 'Was ist das höchste Finish im Darts?', acceptedAnswer: { '@type': 'Answer', text: 'Das höchste Finish ist 170: Triple 20, Triple 20 und Bull (T20 T20 Bull).' } },
        { '@type': 'Question', name: 'Welche Zahlen kann man nicht mit drei Darts checken?', acceptedAnswer: { '@type': 'Answer', text: `Unter 170 lassen sich diese Restzahlen nicht mit drei Darts beenden (Bogey-Numbers): ${bogeys.join(', ')}.` } },
        { '@type': 'Question', name: 'Wie checkt man 121?', acceptedAnswer: { '@type': 'Answer', text: `Ein bewährter Weg für 121 ist ${(suggest(121) || []).map(d => d.l).join(' ')}.` } }] }] },
  intro('Darts <span>Checkout-Rechner</span>', 'Gib deinen Rest ein und sieh sofort den besten Weg zum Doppel. Darunter steht die komplette Checkout-Tabelle von 170 bis 2.', crumbNav([['Startseite', '/'], ['Checkout-Rechner', '/checkout-rechner/']]))
  + section('checkout')
  + `<section class="band"><div class="wrap"><h2>Checkout-Tabelle 170 bis 2</h2><p>Empfohlene Wege mit drei Darts. Bevorzugt werden Doppel, die Profis am liebsten spielen (D20, D16, D18) und Wege, bei denen ein Fehlwurf noch ein Finish übrig lässt. Bogey-Numbers ohne Finish: ${bogeys.join(', ')}.</p>
<table class="stack cotable"><thead><tr><th>Rest</th><th>Weg</th><th>Darts</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></section>`,
  ['app']
));
pages.push({ url: '/checkout-rechner/', pri: '0.8', freq: 'monthly' });

/* ---------- sitemap.xml & robots.txt ---------- */
const now = new Date().toISOString().slice(0, 10);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url><loc>${SITE}${p.url}</loc><lastmod>${p.mod || now}</lastmod><changefreq>${p.freq}</changefreq><priority>${p.pri}</priority></url>`).join('\n')}
</urlset>
`);
write('robots.txt', `User-agent: *\nDisallow: /admin.html\n\nSitemap: ${SITE}/sitemap.xml\n`);
write('404.html', page({ title: 'Seite nicht gefunden | Darts aktuell', desc: 'Diese Seite gibt es nicht (mehr).', url: '/404.html' },
  intro('Daneben <span>geworfen</span>', 'Diese Seite gibt es nicht (mehr). <a href="/">Zur Startseite</a> · <a href="/news/">Alle News</a>')).replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex">'));
console.log(`Fertig: ${pages.length} Seiten in der Sitemap.`);
