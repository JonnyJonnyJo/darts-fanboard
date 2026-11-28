// Baut die fertige Webseite in den Ordner _site/:
//  - kopiert die statischen Dateien
//  - holt News, Termine und WM-Paarungen aus Supabase (öffentlicher Lesezugriff, anon-Key aus config.js)
//    und schreibt sie fest ins HTML, damit Google sie ohne JavaScript lesen kann
//  - erzeugt Unterseiten (News-Artikel, Spielplan, Tippspiel, Punkte-Rechner, Checkout-Rechner), sitemap.xml und robots.txt
// Aufruf: node scripts/build.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, '_site');
const SITE = 'https://dartsaktuell.com';
const TZ = 'Europe/Berlin';
const { LANGS, PATHS, applyPairs } = await import('./i18n.mjs');
// Sprachversionen derselben Seite (deutsche Adresse → en/nl), für hreflang und den Sprachumschalter
const ALT = {};
for (const de of Object.keys(PATHS.en)) ALT[de] = { de, en: PATHS.en[de], nl: PATHS.nl[de] };
const altLinks = de => ALT[de] ? ['de', 'en', 'nl'].map(l => `<link rel="alternate" hreflang="${l}" href="https://dartsaktuell.com${ALT[de][l]}">`).join('\n') + `\n<link rel="alternate" hreflang="x-default" href="https://dartsaktuell.com${de}">` : '';
const langSwitch = (de, cur) => ['de', 'en', 'nl'].map(l => { const u = (ALT[de] || ALT['/'])[l]; return l === cur ? `<b aria-current="true">${l.toUpperCase()}</b>` : `<a href="${u}" hreflang="${l}" lang="${l}">${l.toUpperCase()}</a>`; }).join('');
const CO_BASE = { de: '/checkout-rechner/', en: '/en/darts-checkout-chart/', nl: '/nl/darts-uitgooi-tabel/' };
const PL_BASE = { de: '/spieler/', en: '/en/players/', nl: '/nl/spelers/' };
for (let v = 2; v <= 170; v++) ALT[`${CO_BASE.de}${v}/`] = { de: `${CO_BASE.de}${v}/`, en: `${CO_BASE.en}${v}/`, nl: `${CO_BASE.nl}${v}/` };
const PAGERS = {};
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
data.tagesplan = [];
try { data.tagesplan = await rest(`tagesplan?select=*&day=gte.${new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10)}&order=day,starts_at.nullslast,id`); console.log(`Supabase: ${data.tagesplan.length} Tagesplan-Spiele`); } catch (err) { console.warn('Tagesplan nicht geladen:', err.message); if (process.env.TP_FILE) data.tagesplan = JSON.parse(fs.readFileSync(process.env.TP_FILE, 'utf8')); }
data.news.sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.id > a.id ? 1 : -1));

/* ---------- PDC-Weltrangliste (Order of Merit) ---------- */
let oom = [], oomMeta = null;
try {
  const [o, m] = await Promise.all([rest('order_of_merit?select=*&order=rank,player'), rest('oom_meta?select=*')]);
  oom = o; oomMeta = m[0] || null;
  if (!oom.length) throw new Error('leer');
} catch (err) {
  console.warn('Weltrangliste aus data/oom.csv:', err.message);
  const DE = ['Martin Schindler','Niko Springer','Ricardo Pietreczko','Gabriel Clemens','Max Hopp','Lukas Wenig','Kai Gotthardt','Dominik Gruellich','Arno Merk','Maximilian Czerwinski'];
  oom = rd('data/oom.csv').trim().split('\n').map(l => { const [r, n, p] = l.split(','); return { rank: +r, player: n, prize_k: +p, prev_rank: null, country: DE.includes(n) ? 'de' : null }; });
  oomMeta = { as_of: '2026-11-22', note: 'nach dem Grand Slam of Darts', source: 'dartsrankings.com', source_url: 'https://www.dartsrankings.com/' };
}
const money = k => '£' + Math.round(Number(k) * 1000).toLocaleString('de-DE');
const oomRow = (r, i) => { const mv = r.prev_rank ? r.prev_rank - r.rank : 0;
  return `<tr${r.country === 'de' ? ' class="de"' : ''}><td class="r"><b>${r.rank}</b></td><td class="mv">${mv > 0 ? `<span class="up">▲${mv}</span>` : mv < 0 ? `<span class="down">▼${-mv}</span>` : ''}</td><td><a class="pl-link" href="/spieler/${slugify(r.player)}/">${esc(r.player)}</a>${r.country === 'de' ? ' <span class="flag" title="Deutschland">DE</span>' : ''}</td><td class="r">${money(r.prize_k)}</td></tr>`; };
const oomStand = oomMeta ? `Stand: ${fmtDateLong(oomMeta.as_of)}${oomMeta.note ? ' (' + esc(oomMeta.note) + ')' : ''}` : '';
function fmtDateLong(d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' }); }

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
const nav = index.slice(navStart, navEnd).replace('</a></div>\n</div></nav>', '</a></div><span class="langsw"><!--LANGSW--></span>\n</div></nav>');
if (!nav.includes('<!--LANGSW-->')) console.warn('Sprachumschalter: Platz im Menü nicht gefunden');
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
<meta property="og:url" content="${SITE}${url}">${ALT[url] ? '\n' + altLinks(url) : ''}${ld ? `\n<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}`) + '</head>\n<body>\n';
const crumbs = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it[0], item: SITE + it[1] })) });
const enc = encodeURIComponent;
// Teilen-Leiste: reine Links (keine Fremd-Skripte), dazu „Link teilen“ über das Handy-Menü bzw. Kopieren
const shareBar = (url, text) => { const u = SITE + url; return `<div class="share" aria-label="Seite teilen"><span class="share-l">Teilen:</span>
<a class="sh sh-wa" href="https://wa.me/?text=${enc(text + ' ' + u)}" target="_blank" rel="noopener">WhatsApp</a><a class="sh sh-x" href="https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(u)}" target="_blank" rel="noopener">X</a><a class="sh sh-fb" href="https://www.facebook.com/sharer/sharer.php?u=${enc(u)}" target="_blank" rel="noopener">Facebook</a><a class="sh sh-tg" href="https://t.me/share/url?url=${enc(u)}&text=${enc(text)}" target="_blank" rel="noopener">Telegram</a><button type="button" class="sh sh-more" data-u="${esc(u)}" data-t="${esc(text)}" onclick="var b=this;(navigator.share?navigator.share({title:document.title,text:b.dataset.t,url:b.dataset.u}):navigator.clipboard.writeText(b.dataset.u).then(function(){b.textContent='Link kopiert ✓'})).catch(function(){})">Link teilen</button></div>`; };
const tippPromo = `<aside class="promo"><div><b>Tipprunde für deinen Dartclub, die Kumpels oder die Familie</b><span>Kostenlos, in einer Minute erstellt – eigene Tabelle, Tipps der anderen nach dem Anwurf, wie bei Kicktipp.</span></div><a class="btn-r" href="/darts-tippspiel/#runden">Tipprunde erstellen</a></aside>`;
const intro = (h1, text, crumbHtml = '', share = null) => `<section class="hero band"><div class="wrap">${crumbHtml}<div class="newshead"><h1>${h1}</h1><p>${text}</p></div>${share ? shareBar(share[0], share[1]) : ''}</div></section>`;
const crumbNav = items => `<nav aria-label="Brotkrumen" class="crumbs">${items.map((it, i) => i < items.length - 1 ? `<a href="${it[1]}">${esc(it[0])}</a>` : `<span>${esc(it[0])}</span>`).join(' › ')}</nav>`;
const SCRIPTS = {
  app: '<script src="/app.js"></script>',
  db: '<script src="/config.js"></script>\n<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>',
  tipp: '<script src="/tippspiel.js"></script>',
  news: '<script src="/news.js"></script>',
  live: '<script src="/live.js"></script>'
};
const pageFn = (meta, body, scripts = []) => `${headFor(meta)}${nav.replace('<!--LANGSW-->', langSwitch(meta.url, 'de'))}\n${body}\n${footer}\n${scripts.map(s => SCRIPTS[s]).join('\n')}\n</body>\n</html>\n`;

const page = pageFn;
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
for (const f of ['admin.html', 'impressum.html', 'datenschutz.html', 'teilnahmebedingungen.html', 'config.js', 'tippspiel.js', 'news.js', 'app.js', 'live.js', 'style.css', 'CNAME', 'manifest.webmanifest'])
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
// Cache-Busting: geänderte Dateien bekommen eine neue Versionsnummer, damit Browser sofort die neue Fassung laden
const crypto = await import('node:crypto');
const VER = {};
for (const f of ['style.css', 'app.js', 'news.js', 'tippspiel.js', 'live.js', 'config.js']) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) VER[f] = crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 8);
}
// Eigene, datensparsame Besucherzählung (keine Cookies, keine IP-Speicherung) – zählt nur echte Besuche auf dartsaktuell.com
fs.writeFileSync(path.join(OUT, 'track.js'), `(function(){try{if(location.hostname!=='dartsaktuell.com'||navigator.webdriver)return;var r='';try{r=document.referrer?new URL(document.referrer).hostname.replace(/^www\\./,''):''}catch(e){}fetch(${JSON.stringify(URL_ + '/rest/v1/rpc/track_view')},{method:'POST',keepalive:true,headers:{'Content-Type':'application/json',apikey:${JSON.stringify(KEY)},Authorization:'Bearer '+${JSON.stringify(KEY)}},body:JSON.stringify({p_path:location.pathname,p_ref:r})}).catch(function(){})}catch(e){}})();\n`);
VER['track.js'] = crypto.createHash('sha1').update(fs.readFileSync(path.join(OUT, 'track.js'))).digest('hex').slice(0, 8);
const localize = html => {
  if (!html.includes('/track.js') && !/<title>Admin/i.test(html) && !html.includes('id="admin')) html = html.replace('</head>', '<script defer src="/track.js"></script>\n</head>');
  html = html.split(CDN_SB).join(SB_SRC);
  for (const [f, v] of Object.entries(VER)) html = html.split(`"/${f}"`).join(`"/${f}?v=${v}"`);
  return html;
};
if (fs.existsSync(path.join(OUT, 'admin.html'))) fs.writeFileSync(path.join(OUT, 'admin.html'), localize(fs.readFileSync(path.join(OUT, 'admin.html'), 'utf8')));

// Startseite: News fest einbauen
const li = Math.max(0, data.news.findIndex(n => n.top));
const lead = data.news[li];
index = index.replace('<!--PRERENDER:oom-->', oom.slice(0, 10).map(oomRow).join('')).replace('<!--PRERENDER:oomstand-->', oomStand);
index = index.replace('<!--PRERENDER:lead-->', lead ? leadHtml(lead) : '')
  .replace('<!--PRERENDER:list-->', data.news.filter((_, i) => i !== li).slice(0, 6).map(n => cardHtml(n)).join(''));
index = index.replace(navStart >= 0 ? index.slice(navStart, navEnd) : '', nav.replace('<!--LANGSW-->', langSwitch('/', 'de'))).replace('<link rel="canonical" href="https://dartsaktuell.com/">', '<link rel="canonical" href="https://dartsaktuell.com/">\n' + altLinks('/'));
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
${shareBar(n.path, n.title + ' – Darts aktuell')}<div class="row"><a class="btn-y" href="/darts-wm-spielplan/">WM-Spielplan</a><a class="btn-y" href="/darts-tippspiel/">Zum Tippspiel</a></div></article>
${tippPromo}
</div></section>
<section class="band"><div class="wrap"><h2>Weitere Darts-News</h2><div class="newslist">${more.map(x => cardHtml(x)).join('')}</div><p style="margin:18px 0 0"><a class="btn-y" href="/news/">Alle News</a></p></div></section>`
  ));
  pages.push({ url: n.path, pri: '0.7', freq: 'weekly', mod: n.date });
}

// WM-Spielplan (inkl. Turnierkalender) – Paarungen fest eingebaut, news.js aktualisiert live
const dayOf = iso => new Date(iso).toLocaleDateString('sv-SE', { timeZone: TZ });
const timeOf = iso => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
// Deutsche Spieler (für Hervorhebung in Spielplan/Startseite)
const GER = new Set([...oom.filter(r => r.country === 'de').map(r => r.player), 'Martin Schindler', 'Niko Springer', 'Ricardo Pietreczko', 'Gabriel Clemens', 'Max Hopp', 'Lukas Wenig', 'Kai Gotthardt', 'Dominik Gruellich', 'Arno Merk', 'Maximilian Czerwinski', 'Florian Hempel', 'Dragutin Horvat', 'Pascal Rupprecht', 'Leon Weber']);
let staticMatches = '';
const TV_DE = 'Sport1 (Free-TV) & DAZN';
const SESS_L = { Nachmittag: 'Nachmittags-Session', Abend: 'Abend-Session' };
const sessOf = iso => (+new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', hour12: false, timeZone: TZ }).slice(0, 2)) < 17 ? 'Nachmittag' : 'Abend';
const plLink = n => { const de = GER.has(n) ? ' <span class="flag" title="Deutschland">DE</span>' : ''; return (n && !/^(tbd|tba)$/i.test(n) ? `<a class="pl-link" href="/spieler/${slugify(n)}/">${esc(n)}</a>` : esc(n || 'offen')) + de; };
const dayLabel = d => new Date(d + 'T12:00:00Z').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const matchRow = m => { const done = m.sets1 != null && m.sets2 != null, de = GER.has(m.player1) || GER.has(m.player2);
  return `<tr${de ? ' class="de"' : ''}><td>${timeOf(m.starts_at)}</td><td>${esc(m.round)}</td><td>${plLink(m.player1)}</td><td>${done ? `${m.sets1}:${m.sets2}` : '–:–'}</td><td>${plLink(m.player2)}</td></tr>`; };
const sessTable = rows => `<table class="stack"><thead><tr><th>Zeit</th><th>Runde</th><th>Spieler 1</th><th>Ergebnis</th><th>Spieler 2</th></tr></thead><tbody>${rows.map(matchRow).join('')}</tbody></table>`;
if (data.matches.length) {
  const days = [...new Set(data.matches.map(m => dayOf(m.starts_at)))].sort();
  const gerM = data.matches.filter(m => GER.has(m.player1) || GER.has(m.player2));
  const gerBox = gerM.length ? `<div class="wm-ger"><h2>Die Deutschen bei der WM</h2><table class="stack"><thead><tr><th>Tag</th><th>Zeit</th><th>Runde</th><th>Spieler 1</th><th>Ergebnis</th><th>Spieler 2</th></tr></thead><tbody>${gerM.map(m => matchRow(m).replace('<td>', `<td>${new Date(m.starts_at).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: TZ })}</td><td>`)).join('')}</tbody></table><p class="wm-tv">TV: ${TV_DE}</p></div>` : '';
  const nav = `<nav class="wm-days" aria-label="Spieltage">${days.map(d => `<a href="#tag-${d}">${new Date(d + 'T12:00:00Z').toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}</a>`).join('')}</nav>`;
  staticMatches = `<div class="wrap">${gerBox}<h2>Alle Paarungen nach Sessions</h2><p>Alle Zeiten in deutscher Zeit. Live im TV: <b>${TV_DE}</b>. Deutsche Spieler sind markiert.</p>${nav}${days.map(d => {
    const rows = data.matches.filter(m => dayOf(m.starts_at) === d).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const sess = ['Nachmittag', 'Abend'].map(S => [S, rows.filter(m => sessOf(m.starts_at) === S)]).filter(([, r]) => r.length);
    return `<h3 id="tag-${d}">${dayLabel(d)}</h3>${sess.map(([S, r]) => `<h4 class="wm-sess">${SESS_L[S]} ab ${timeOf(r[0].starts_at)} Uhr · ${TV_DE}</h4>${sessTable(r)}`).join('')}`;
  }).join('')}</div>`;
}
write('darts-wm-spielplan/index.html', page(
  { title: 'Darts-WM 2026/27 Spielplan: alle Termine, Uhrzeiten & Ergebnisse | Darts aktuell', desc: 'Der komplette Spielplan der PDC Darts-WM 2026/27 im Ally Pally (11.12.2026 – 3.1.2027): alle Runden, Sessions mit deutschen Uhrzeiten, Paarungen und Ergebnisse.', url: '/darts-wm-spielplan/',
    ld: [crumbs([['Darts aktuell', '/'], ['Darts-WM Spielplan', '/darts-wm-spielplan/']]),
      { '@context': 'https://schema.org', '@type': 'SportsEvent', name: 'PDC World Darts Championship 2026/27', startDate: '2026-12-11', endDate: '2027-01-03', eventStatus: 'https://schema.org/EventScheduled', sport: 'Darts',
        location: { '@type': 'Place', name: 'Alexandra Palace', address: { '@type': 'PostalAddress', addressLocality: 'London', addressCountry: 'GB' } }, organizer: { '@type': 'Organization', name: 'Professional Darts Corporation', url: 'https://www.pdc.tv' } }] },
  intro('Darts-WM 2026/27 <span>Spielplan</span>', 'Alle Runden, Sessions und Uhrzeiten (deutsche Zeit) der Weltmeisterschaft im Alexandra Palace – mit Paarungen und Ergebnissen, sobald sie feststehen.', crumbNav([['Startseite', '/'], ['Darts-WM Spielplan', '/darts-wm-spielplan/']]), ['/darts-wm-spielplan/', 'Darts-WM 2026/27: kompletter Spielplan mit deutschen Uhrzeiten und Ergebnissen 🎯'])
  + section('spielplan') + `<section class="band"><div class="wrap">${tippPromo}</div></section>` + (staticMatches ? `<section class="band">${staticMatches}</section>` : '') + section('turniere'),
  ['app', 'db', 'news']
));
pages.push({ url: '/darts-wm-spielplan/', pri: '0.9', freq: 'hourly' });

// Tippspiel
write('darts-tippspiel/index.html', page(
  { title: 'Darts-WM Tippspiel 2026/27 – kostenlos mittippen | Darts aktuell', desc: 'Kostenloses Tippspiel zur Darts-WM 2026/27: Ergebnisse tippen, Bonusfragen beantworten und in der Rangliste mit anderen Darts-Fans messen. Ohne Einsatz, ohne Gewinne.', url: '/darts-tippspiel/',
    ld: crumbs([['Darts aktuell', '/'], ['Darts-Tippspiel', '/darts-tippspiel/']]) },
  intro('Darts-WM <span>Tippspiel</span>', 'Kostenlos und ohne Einsatz: Tipp die Spiele der WM 2026/27, beantworte die Bonusfragen und kletter in der Rangliste nach oben. Anmeldung per E-Mail-Link, ganz ohne Passwort.', crumbNav([['Startseite', '/'], ['Darts-Tippspiel', '/darts-tippspiel/']]), ['/darts-tippspiel/', 'Tipp mit mir die Darts-WM 2026/27 – kostenloses Tippspiel mit eigener Tipprunde 🎯'])
  + section('tippspiel'),
  ['db', 'tipp']
));
pages.push({ url: '/darts-tippspiel/', pri: '0.8', freq: 'daily' });

// Scorer
write('darts-punkte-rechner/index.html', page(
  { title: 'Darts Punkte-Rechner online: 501 & 301 zählen mit Checkout-Hilfe | Darts aktuell', desc: 'Kostenloser Darts Punkte-Rechner (Scorer) im Browser: 501 oder 301 für zwei Spieler zählen, Würfe direkt auf der Scheibe antippen, mit Average und Checkout-Vorschlägen. Ohne Anmeldung.', url: '/darts-punkte-rechner/',
    ld: [crumbs([['Darts aktuell', '/'], ['Punkte-Rechner', '/darts-punkte-rechner/']]),
      { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Darts Punkte-Rechner', url: SITE + '/darts-punkte-rechner/', applicationCategory: 'SportsApplication', operatingSystem: 'Browser', inLanguage: 'de-DE', offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' } }] },
  intro('Darts Punkte-Rechner <span>online</span>', 'Zähl deine Legs direkt im Browser: Spielmodus wählen, Würfe auf der Scheibe antippen – Rest, Average und der passende Checkout werden automatisch angezeigt.', crumbNav([['Startseite', '/'], ['Punkte-Rechner', '/darts-punkte-rechner/']]), ['/darts-punkte-rechner/', 'Kostenloser Darts Punkte-Rechner fürs Handy: 501/301 zählen mit Checkout-Hilfe 🎯'])
  + section('spiel'),
  ['app']
));
// alte Adresse leitet weiter
write('darts-scorer/index.html', '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Weitergeleitet – Punkte-Rechner | Darts aktuell</title><meta name="robots" content="noindex"><link rel="canonical" href="https://dartsaktuell.com/darts-punkte-rechner/"><meta http-equiv="refresh" content="0; url=/darts-punkte-rechner/"><script>location.replace(\'/darts-punkte-rechner/\'+location.search+location.hash)</script></head><body><p><a href="/darts-punkte-rechner/">Zum Punkte-Rechner</a></p></body></html>');
pages.push({ url: '/darts-punkte-rechner/', pri: '0.8', freq: 'monthly' });

// Checkout-Rechner + feste Tabelle 2–170 (gleicher Algorithmus wie app.js)
const appSrc = rd('app.js');
const coSrc = appSrc.slice(appSrc.indexOf('const TH=[];'), appSrc.indexOf('const chip='));
const suggest = new Function(coSrc + '; return suggest;')();
const kind = l => l.startsWith('D') || l === 'Bull' ? 'dbl' : l.startsWith('T') ? 'tr' : '';
const rows = [];
for (let v = 170; v >= 2; v--) {
  const r = suggest(v);
  rows.push(`<tr id="finish-${v}"><td><b><a href="/checkout-rechner/${v}/">${v}</a></b></td><td>${r ? r.map(d => `<span class="${kind(d.l)}">${d.l}</span>`).join(' ') : 'kein Finish'}</td><td>${r ? r.length : '–'}</td></tr>`);
}
const bogeys = [169, 168, 166, 165, 163, 162, 159].filter(v => !suggest(v));
write('checkout-rechner/index.html', page(
  { title: 'Darts Checkout-Rechner & Checkout-Tabelle 170 bis 2 | Darts aktuell', desc: 'Darts Checkout-Rechner: für jede Restzahl von 170 bis 2 der beste Weg zum Doppel. Mit kompletter Checkout-Tabelle, Bogey-Numbers und Profi-Finishes wie 170, 167 und 121.', url: '/checkout-rechner/',
    ld: [crumbs([['Darts aktuell', '/'], ['Checkout-Rechner', '/checkout-rechner/']]),
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
        { '@type': 'Question', name: 'Was ist das höchste Finish im Darts?', acceptedAnswer: { '@type': 'Answer', text: 'Das höchste Finish ist 170: Triple 20, Triple 20 und Bull (T20 T20 Bull).' } },
        { '@type': 'Question', name: 'Welche Zahlen kann man nicht mit drei Darts checken?', acceptedAnswer: { '@type': 'Answer', text: `Unter 170 lassen sich diese Restzahlen nicht mit drei Darts beenden (Bogey-Numbers): ${bogeys.join(', ')}.` } },
        { '@type': 'Question', name: 'Wie checkt man 121?', acceptedAnswer: { '@type': 'Answer', text: `Ein bewährter Weg für 121 ist ${(suggest(121) || []).map(d => d.l).join(' ')}.` } }] }] },
  intro('Darts <span>Checkout-Rechner</span>', 'Gib deinen Rest ein und sieh sofort den besten Weg zum Doppel. Darunter steht die komplette Checkout-Tabelle von 170 bis 2.', crumbNav([['Startseite', '/'], ['Checkout-Rechner', '/checkout-rechner/']]), ['/checkout-rechner/', 'Darts-Checkout-Rechner: für jeden Rest von 170 bis 2 der beste Weg 🎯'])
  + section('checkout')
  + `<section class="band"><div class="wrap"><h2>Checkout-Tabelle 170 bis 2</h2><p>Empfohlene Wege mit drei Darts. Bevorzugt werden Doppel, die Profis am liebsten spielen (D20, D16, D18) und Wege, bei denen ein Fehlwurf noch ein Finish übrig lässt. Bogey-Numbers ohne Finish: ${bogeys.join(', ')}.</p>
<table class="stack cotable"><thead><tr><th>Rest</th><th>Weg</th><th>Darts</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></section>`,
  ['app']
));
pages.push({ url: '/checkout-rechner/', pri: '0.8', freq: 'monthly' });

// PDC-Weltrangliste
const deTop = oom.filter(r => r.country === 'de');
write('pdc-weltrangliste/index.html', page(
  { title: 'Darts-Weltrangliste aktuell: PDC Order of Merit nach Preisgeld | Darts aktuell', desc: `Die aktuelle PDC-Weltrangliste (Order of Merit): alle Top-128-Spieler mit Preisgeld der letzten zwei Jahre, Auf- und Absteiger und die besten Deutschen. ${oomStand}.`, url: '/pdc-weltrangliste/',
    ld: [crumbs([['Darts aktuell', '/'], ['PDC-Weltrangliste', '/pdc-weltrangliste/']]),
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
        { '@type': 'Question', name: 'Wer ist die Nummer 1 der Darts-Weltrangliste?', acceptedAnswer: { '@type': 'Answer', text: oom[0] ? `${oom[0].player} führt die PDC Order of Merit mit ${money(oom[0].prize_k)} Preisgeld an (${oomStand}).` : '' } },
        { '@type': 'Question', name: 'Wie wird die Darts-Weltrangliste berechnet?', acceptedAnswer: { '@type': 'Answer', text: 'Die PDC Order of Merit zählt das Preisgeld aller Ranglistenturniere der letzten zwei Jahre. Jedes gewonnene Pfund zählt, nach zwei Jahren fällt das Preisgeld wieder heraus. Die Top 32 sind bei der WM gesetzt.' } },
        { '@type': 'Question', name: 'Wer ist der beste deutsche Darts-Spieler in der Weltrangliste?', acceptedAnswer: { '@type': 'Answer', text: deTop[0] ? `${deTop[0].player} ist als Nummer ${deTop[0].rank} der bestplatzierte Deutsche (${money(deTop[0].prize_k)}).` : '' } }] }] },
  intro('PDC-Weltrangliste <span>aktuell</span>', `Die Order of Merit nach Preisgeld der letzten zwei Jahre – die offizielle Darts-Weltrangliste. ${oomStand}.`, crumbNav([['Startseite', '/'], ['PDC-Weltrangliste', '/pdc-weltrangliste/']]), ['/pdc-weltrangliste/', 'Die aktuelle Darts-Weltrangliste (PDC Order of Merit) mit allen Preisgeldern 🎯'])
  + `<section class="band"><div class="wrap">
${deTop.length ? `<p class="oom-de"><b>Beste Deutsche:</b> ${deTop.slice(0, 6).map(r => `${esc(r.player)} (${r.rank}.)`).join(' · ')}</p>` : ''}
<div class="oom-wrap"><table class="oom" id="oomTable"><thead><tr><th class="r">Platz</th><th></th><th>Spieler</th><th class="r">Preisgeld</th></tr></thead><tbody id="oomBody">${oom.map(oomRow).join('')}</tbody></table></div>
<p class="note" id="oomStand">${oomStand}. Quelle: <a href="${esc((oomMeta && oomMeta.source_url) || 'https://www.pdc.tv/order-merit')}" rel="noopener" target="_blank">${esc((oomMeta && oomMeta.source) || 'PDC')}</a>. Die Liste wird nach jedem Turnier automatisch aktualisiert.</p>
<h2>So funktioniert die Weltrangliste</h2>
<p>Die PDC rechnet nicht mit Punkten, sondern mit Preisgeld: Alles, was ein Spieler in den letzten zwei Jahren bei Ranglistenturnieren gewonnen hat, zählt – jedes Pfund ist ein Punkt. Nach zwei Jahren fällt das Geld wieder heraus, deshalb muss jeder Spieler seine Ergebnisse vom Vorjahr verteidigen. Die Weltmeisterschaft zahlt mit Abstand am meisten und kann die Rangliste kräftig durcheinanderwirbeln.</p>
<p>Für die <a href="/darts-wm-spielplan/">Darts-WM</a> sind die Top 32 der Order of Merit gesetzt; dazu kommen die besten Spieler der Pro-Tour-Rangliste und internationale Qualifikanten. Wer am Jahresende außerhalb der Top 64 steht, verliert seine Tour Card.</p>
${tippPromo}
</div></section>`,
  ['db', 'news']
));
pages.push({ url: '/pdc-weltrangliste/', pri: '0.9', freq: 'daily' });

/* ---------- Internationale Version: /en/ und /nl/ ---------- */
let intlNews = [];
try { intlNews = await rest('news_intl?select=*&order=published_at.desc,id.desc&limit=300'); console.log(`Supabase: ${intlNews.length} internationale News`); }
catch (err) { console.warn('Internationale News nicht geladen:', err.message); }
for (const L of Object.values(LANGS)) {
  const C = L.code, T = L.t, P = T.pages, MAP = PATHS[C];
  const loc = (d, o) => new Date(d + 'T12:00:00Z').toLocaleDateString(L.locale, { timeZone: L.tz, ...o });
  const dLong = d => loc(d, { day: 'numeric', month: 'long', year: 'numeric' });
  const mapLinks = html => html.replace(/href="(\/[^"#?]*)([#?][^"]*)?"/g, (m, p, rest_ = '') => MAP[p] ? `href="${MAP[p]}${rest_}"` : m);
  // Vorlage übersetzen
  let tpl = applyPairs(rd('index.html'), L.tpl, `${C}/index.html`);
  const tHead = tpl.slice(0, tpl.indexOf('</head>'));
  const ns = tpl.indexOf('<nav>'), ne = tpl.indexOf('</nav>') + 6;
  const tNav = tpl.slice(ns, ne).replace('</a></div>\n</div></nav>', '</a></div><span class="langsw"><!--LANGSW--></span>\n</div></nav>').replace('href="/"', `href="/${C}/"`);
  const tFooter = tpl.slice(tpl.indexOf('<footer'), tpl.indexOf('</footer>') + 9);
  const tSection = id => { const m = tpl.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</div></section>`)); if (!m) throw new Error(`${C}: Abschnitt fehlt: ${id}`); return m[0]; };
  const tBase = tHead.replace(/<title>[\s\S]*?<\/title>\n?/, '').replace(/<meta name="description"[^>]*>\n?/, '').replace(/<link rel="canonical"[^>]*>\n?/, '')
    .replace(/<meta property="og:(title|description|url|type)"[^>]*>\n?/g, '').replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/, '');
  const RTS = `<script>window.DARTS_RT=${JSON.stringify(L.rt)};window.DARTS_LANG='${C}';</script>`;
  const tScripts = { app: `<script src="/${C}/app.js"></script>`, db: SCRIPTS.db, tipp: `<script src="/${C}/tippspiel.js"></script>`, news: `<script src="/${C}/news.js"></script>`, live: SCRIPTS.live };
  const tHeadFor = ({ title, desc, url, de, type = 'website', ld }) => tBase.replace('<meta charset="utf-8">', `<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${url}">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${url}">${de && ALT[de] ? '\n' + altLinks(de) : ''}${ld ? `\n<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}`) + '</head>\n<body>\n';
  const tPage = (meta, body, scripts = []) => mapLinks(`${tHeadFor(meta)}${tNav.replace('<!--LANGSW-->', langSwitch(meta.de || '/', C))}\n${body}\n${tFooter}\n${RTS}\n${scripts.map(s => tScripts[s]).join('\n')}\n</body>\n</html>\n`);
  const tCrumbNav = items => `<nav aria-label="${T.crumbs}" class="crumbs">${items.map((it, i) => i < items.length - 1 ? `<a href="${it[1]}">${esc(it[0])}</a>` : `<span>${esc(it[0])}</span>`).join(' › ')}</nav>`;
  const tShare = (url, text) => shareBar(url, text).replace('aria-label="Seite teilen"', `aria-label="${T.shareAria}"`).replace('>Teilen:<', `>${T.share}<`).replace(">Link teilen</button>", `>${T.shareLink}</button>`).replace("'Link kopiert ✓'", `'${T.copied}'`);
  const tIntro = (h1, text, crumbHtml, share) => `<section class="hero band"><div class="wrap">${crumbHtml}<div class="newshead"><h1>${h1}</h1><p>${text}</p></div>${share ? tShare(share[0], share[1]) : ''}</div></section>`;
  const tPromo = `<aside class="promo"><div><b>${T.promoB}</b><span>${T.promoS}</span></div><a class="btn-r" href="${MAP['/darts-tippspiel/']}#runden">${T.promoBtn}</a></aside>`;
  const home = MAP['/'];
  // News dieser Sprache
  const news = intlNews.filter(n => n.lang === C).map(r => ({ ...r, when: r.when_label || loc(r.published_at, { weekday: 'short', day: 'numeric', month: 'short' }), path: `${MAP['/news/']}${r.slug || slugify(r.title)}/`, date: r.published_at, top: r.is_top }));
  const tMeta = n => `<div class="meta"><span class="tag">${esc(n.tag)}</span><span class="when">${esc(n.when)}</span></div>`;
  const tSrc = n => { const u = safeUrl(n.url); return u ? `<span class="src">${T.source} <a href="${esc(u)}" rel="noopener" target="_blank">${esc(n.source || 'Link')}</a></span>` : ''; };
  const tLead = n => `${tMeta(n)}<h2><a href="${n.path}">${esc(n.title)}</a></h2><p>${esc(n.teaser)}</p>${tSrc(n)}`;
  const tCard = (n, h = 'h3') => `<article class="ncard">${tMeta(n)}<${h}><a href="${n.path}">${esc(n.title)}</a></${h}><p>${esc(n.teaser)}</p>${tSrc(n)}</article>`;
  const tOomRow = r => oomRow(r).replace('title="Deutschland">DE<', `title="${T.germany}">${C === 'en' ? 'GER' : 'DU'}<`).replace('href="/spieler/', `href="${PL_BASE[C]}`);
  PAGERS[C] = { page: tPage, intro: tIntro, crumbs: tCrumbNav, promo: tPromo, home, T, L, news, dLong };
  const tMoney = k => '£' + Math.round(Number(k) * 1000).toLocaleString(L.locale);
  const tStand = oomMeta ? `${T.asOf}: ${dLong(oomMeta.as_of)}` : '';
  const out = (rel, html) => { write(`${C}/${rel}`, html); };
  // JavaScript in der Sprache
  for (const f of ['app.js', 'tippspiel.js', 'news.js']) {
    const js = applyPairs(rd(f), L.js[f] || [], `${C}/${f}`);
    fs.mkdirSync(path.join(OUT, C), { recursive: true });
    fs.writeFileSync(path.join(OUT, C, f), js);
    VER[`${C}/${f}`] = crypto.createHash('sha1').update(js).digest('hex').slice(0, 8);
  }

  // Startseite
  const li2 = Math.max(0, news.findIndex(n => n.top));
  let h = tpl.replace('<!--PRERENDER:oom-->', oom.slice(0, 10).map(tOomRow).join('')).replace('<!--PRERENDER:oomstand-->', tStand)
    .replace('<!--PRERENDER:lead-->', news[li2] ? tLead(news[li2]) : '').replace('<!--PRERENDER:list-->', news.filter((_, i) => i !== li2).slice(0, 6).map(n => tCard(n)).join(''));
  h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(P.home.title)}</title>`).replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(P.home.desc)}">`)
    .replace('<link rel="canonical" href="https://dartsaktuell.com/">', `<link rel="canonical" href="${SITE}${home}">\n${altLinks('/')}`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(P.home.title)}">`).replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(P.home.desc)}">`)
    .replace('<meta property="og:url" content="https://dartsaktuell.com/">', `<meta property="og:url" content="${SITE}${home}">`)
    .replace(tpl.slice(ns, ne), tNav.replace('<!--LANGSW-->', langSwitch('/', C)))
    .replace('<script src="/app.js"></script>', `${RTS}\n<script src="/${C}/app.js"></script>`).replace('<script src="/tippspiel.js"></script>', `<script src="/${C}/tippspiel.js"></script>`).replace('<script src="/news.js"></script>', `<script src="/${C}/news.js"></script>`);
  out('index.html', mapLinks(h));
  pages.push({ url: home, pri: '0.9', freq: 'hourly' });

  // News
  out(`${MAP['/news/'].slice(4)}index.html`, tPage({ title: P.news.title, desc: P.news.desc, url: MAP['/news/'], de: '/news/', ld: crumbs([['Darts aktuell', home], ['News', MAP['/news/']]]) },
    tIntro(P.news.h1, P.news.intro, tCrumbNav([[T.home, home], ['News', MAP['/news/']]])) + `<section class="band"><div class="wrap"><div class="newslist">${news.map(n => tCard(n, 'h2')).join('')}</div></div></section>`));
  pages.push({ url: MAP['/news/'], pri: '0.7', freq: 'hourly' });
  for (const n of news) {
    const u = safeUrl(n.url), more = news.filter(x => x !== n).slice(0, 3);
    const ld = [{ '@context': 'https://schema.org', '@type': 'NewsArticle', headline: n.title, description: n.teaser, datePublished: n.date, dateModified: n.date, inLanguage: L.locale, mainEntityOfPage: SITE + n.path,
      author: { '@type': 'Organization', name: 'Darts aktuell', url: SITE + home }, publisher: { '@type': 'Organization', name: 'Darts aktuell', url: SITE + home } }, crumbs([['Darts aktuell', home], ['News', MAP['/news/']], [n.title, n.path]])];
    out(`${n.path.slice(4)}index.html`, tPage({ title: `${n.title} | Darts aktuell`, desc: String(n.teaser || n.title).slice(0, 158), url: n.path, type: 'article', ld },
      `<section class="hero band"><div class="wrap">${tCrumbNav([[T.home, home], ['News', MAP['/news/']], [n.title, n.path]])}
<article class="lead article">${tMeta(n)}<h1>${esc(n.title)}</h1><p class="date">${T.published} <time datetime="${esc(n.date)}">${dLong(n.date)}</time></p><p>${esc(n.teaser)}</p>${n.body ? `<div class="body">${bodyHtml(n.body)}</div>` : ''}${u ? `<p>${T.moreAt} <a href="${esc(u)}" rel="noopener" target="_blank">${esc(n.source || u)}</a></p>` : ''}
${tShare(n.path, n.title + ' – Darts aktuell')}<div class="row"><a class="btn-y" href="${MAP['/darts-wm-spielplan/']}">${T.toSchedule}</a><a class="btn-y" href="${MAP['/darts-tippspiel/']}">${T.toPredictor}</a></div></article>
${tPromo}
</div></section>
<section class="band"><div class="wrap"><h2>${T.moreNews}</h2><div class="newslist">${more.map(x => tCard(x)).join('')}</div><p style="margin:18px 0 0"><a class="btn-y" href="${MAP['/news/']}">${T.allNews}</a></p></div></section>`));
    pages.push({ url: n.path, pri: '0.6', freq: 'weekly', mod: n.date });
  }

  // Spielplan
  const tDay = iso => new Date(iso).toLocaleDateString('sv-SE', { timeZone: L.tz });
  const tTime = iso => new Date(iso).toLocaleTimeString(L.locale, { hour: '2-digit', minute: '2-digit', timeZone: L.tz });
  let tMatches = '';
  if (data.matches.length) {
    const days = [...new Set(data.matches.map(m => tDay(m.starts_at)))].sort();
    tMatches = `<div class="wrap"><h2>${T.matchesH}</h2>${days.map(d => `<h3>${loc(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3><table class="stack"><thead><tr><th>${T.time}</th><th>${T.round}</th><th>${T.p1}</th><th>${T.result}</th><th>${T.p2}</th></tr></thead><tbody>${data.matches.filter(m => tDay(m.starts_at) === d).map(m => {
      const done = m.sets1 != null && m.sets2 != null;
      return `<tr><td>${tTime(m.starts_at)}</td><td>${esc(L.rt[m.round] || m.round)}</td><td>${esc(m.player1)}</td><td>${done ? `${m.sets1}-${m.sets2}` : '–'}</td><td>${esc(m.player2)}</td></tr>`; }).join('')}</tbody></table>`).join('')}</div>`;
  }
  const S = P.schedule, sUrl = MAP['/darts-wm-spielplan/'];
  out(`${sUrl.slice(4)}index.html`, tPage({ title: S.title, desc: S.desc, url: sUrl, de: '/darts-wm-spielplan/', ld: [crumbs([['Darts aktuell', home], [S.crumb, sUrl]]),
    { '@context': 'https://schema.org', '@type': 'SportsEvent', name: 'PDC World Darts Championship 2026/27', startDate: '2026-12-11', endDate: '2027-01-03', eventStatus: 'https://schema.org/EventScheduled', sport: 'Darts',
      location: { '@type': 'Place', name: 'Alexandra Palace', address: { '@type': 'PostalAddress', addressLocality: 'London', addressCountry: 'GB' } }, organizer: { '@type': 'Organization', name: 'Professional Darts Corporation', url: 'https://www.pdc.tv' } }] },
    tIntro(S.h1, S.intro, tCrumbNav([[T.home, home], [S.crumb, sUrl]]), [sUrl, S.share]) + tSection('spielplan') + `<section class="band"><div class="wrap">${tPromo}</div></section>` + (tMatches ? `<section class="band">${tMatches}</section>` : '') + tSection('turniere'),
    ['app', 'db', 'news']));
  pages.push({ url: sUrl, pri: '0.9', freq: 'hourly' });

  // Tippspiel
  const Pr = P.predictor, pUrl = MAP['/darts-tippspiel/'];
  out(`${pUrl.slice(4)}index.html`, tPage({ title: Pr.title, desc: Pr.desc, url: pUrl, de: '/darts-tippspiel/', ld: crumbs([['Darts aktuell', home], [Pr.crumb, pUrl]]) },
    tIntro(Pr.h1, Pr.intro, tCrumbNav([[T.home, home], [Pr.crumb, pUrl]]), [pUrl, Pr.share]) + tSection('tippspiel'), ['db', 'tipp']));
  pages.push({ url: pUrl, pri: '0.8', freq: 'daily' });

  // Punkte-Rechner
  const Sc = P.scorer, scUrl = MAP['/darts-punkte-rechner/'];
  out(`${scUrl.slice(4)}index.html`, tPage({ title: Sc.title, desc: Sc.desc, url: scUrl, de: '/darts-punkte-rechner/', ld: [crumbs([['Darts aktuell', home], [Sc.crumb, scUrl]]),
    { '@context': 'https://schema.org', '@type': 'WebApplication', name: Sc.app, url: SITE + scUrl, applicationCategory: 'SportsApplication', operatingSystem: 'Browser', inLanguage: L.locale, offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' } }] },
    tIntro(Sc.h1, Sc.intro, tCrumbNav([[T.home, home], [Sc.crumb, scUrl]]), [scUrl, Sc.share]) + tSection('spiel'), ['app']));
  pages.push({ url: scUrl, pri: '0.8', freq: 'monthly' });

  // Checkout
  const Co = P.checkout, coUrl = MAP['/checkout-rechner/'];
  const coRows = [];
  for (let v = 170; v >= 2; v--) { const r = suggest(v); coRows.push(`<tr id="finish-${v}"><td><b><a href="${CO_BASE[C]}${v}/">${v}</a></b></td><td>${r ? r.map(d => `<span class="${kind(d.l)}">${d.l}</span>`).join(' ') : T.noCheckout}</td><td>${r ? r.length : '–'}</td></tr>`); }
  out(`${coUrl.slice(4)}index.html`, tPage({ title: Co.title, desc: Co.desc, url: coUrl, de: '/checkout-rechner/', ld: [crumbs([['Darts aktuell', home], [Co.crumb, coUrl]]),
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
      { '@type': 'Question', name: Co.faq[0][0], acceptedAnswer: { '@type': 'Answer', text: Co.faq[0][1] } },
      { '@type': 'Question', name: Co.faq[1][0], acceptedAnswer: { '@type': 'Answer', text: Co.faq[1][1] + bogeys.join(', ') + '.' } },
      { '@type': 'Question', name: Co.faq[2][0], acceptedAnswer: { '@type': 'Answer', text: Co.faq[2][1] + (suggest(121) || []).map(d => d.l).join(' ') + '.' } }] }] },
    tIntro(Co.h1, Co.intro, tCrumbNav([[T.home, home], [Co.crumb, coUrl]]), [coUrl, Co.share]) + tSection('checkout')
    + `<section class="band"><div class="wrap"><h2>${Co.tableH}</h2><p>${Co.tableP} ${bogeys.join(', ')}.</p>
<table class="stack cotable"><thead><tr><th>${Co.thRest}</th><th>${Co.thWay}</th><th>${Co.thDarts}</th></tr></thead><tbody>${coRows.join('')}</tbody></table></div></section>`, ['app']));
  pages.push({ url: coUrl, pri: '0.8', freq: 'monthly' });

  // Weltrangliste
  const O = P.oom, oUrl = MAP['/pdc-weltrangliste/'];
  out(`${oUrl.slice(4)}index.html`, tPage({ title: O.title, desc: `${O.desc} ${tStand}.`, url: oUrl, de: '/pdc-weltrangliste/', ld: [crumbs([['Darts aktuell', home], [O.crumb, oUrl]]),
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
      { '@type': 'Question', name: O.faq[0][0], acceptedAnswer: { '@type': 'Answer', text: oom[0] ? `${oom[0].player}${O.faq[0][1]}${tMoney(oom[0].prize_k)} (${tStand}).` : '' } },
      { '@type': 'Question', name: O.faq[1][0], acceptedAnswer: { '@type': 'Answer', text: O.faq[1][1] } }] }] },
    tIntro(O.h1, `${O.intro} ${tStand}.`, tCrumbNav([[T.home, home], [O.crumb, oUrl]]), [oUrl, O.share])
    + `<section class="band"><div class="wrap">
<div class="oom-wrap"><table class="oom" id="oomTable"><thead><tr><th class="r">${T.rank}</th><th></th><th>${T.player}</th><th class="r">${T.prize}</th></tr></thead><tbody id="oomBody">${oom.map(tOomRow).join('')}</tbody></table></div>
<p class="note" id="oomStand">${tStand}. ${T.source} <a href="${esc((oomMeta && oomMeta.source_url) || 'https://www.pdc.tv/order-merit')}" rel="noopener" target="_blank">${esc((oomMeta && oomMeta.source) || 'PDC')}</a>. ${T.oomNoteTail}</p>
<h2>${O.howH}</h2><p>${O.how[0]}</p><p>${O.how[1]}</p>
${tPromo}
</div></section>`, ['db', 'news']));
  pages.push({ url: oUrl, pri: '0.8', freq: 'daily' });
  console.log(`${C}: ${news.length} News, ${pages.filter(p => p.url.startsWith('/' + C + '/')).length} Seiten`);
}
/* ---------- Zusatzseiten: Finish-Seiten 170–2, Spielerseiten, Liveticker (DE/EN/NL) ---------- */
PAGERS.de = { page: pageFn, intro, crumbs: crumbNav, promo: tippPromo, home: '/', T: { home: 'Startseite' }, L: { code: 'de', locale: 'de-DE', tz: TZ, rt: {} }, news: data.news.map(n => ({ ...n, slug: n.slug })), dLong: fmtDateLong };
const co = new Function(coSrc + '; return { TH, FIN, suggest };')();
const routeCost = d => d.reduce((a, x, i) => a + (i === d.length - 1 ? (x.r ?? x.c) : x.c), 0);
const lbl = d => d.map(x => x.l).join(' ');
function alternatives(v) {
  const best = co.suggest(v), out = [], seen = new Set(best ? [lbl(best)] : []);
  const add = d => { const k = lbl(d); if (!seen.has(k)) { seen.add(k); out.push({ d, c: routeCost(d) }); } };
  for (const f of co.FIN) if (f.v === v) add([f]);
  for (const a of co.TH) for (const f of co.FIN) if (a.v + f.v === v) add([a, f]);
  if (out.length < 6) for (const a of co.TH) for (const b of co.TH) { if (a.v < b.v) continue; const rest = v - a.v - b.v; if (rest < 2) continue; for (const f of co.FIN) if (f.v === rest) add([a, b, f]); }
  return out.sort((x, y) => x.d.length - y.d.length || x.c - y.c).slice(0, 3).map(x => x.d);
}
function setupFor(v) { // Bogey/kein Finish: womit stellt man sich ein gutes Doppel?
  const PREF = [40, 32, 36, 24, 16, 20, 8, 50];
  let best = null;
  for (const d of co.TH) { const left = v - d.v; const p = PREF.indexOf(left); if (p < 0) continue; const score = p * 3 + d.c; if (!best || score < best.s) best = { d: [d], left, s: score }; }
  if (!best) for (const a of co.TH) for (const b of co.TH) { if (a.v < b.v) continue; const left = v - a.v - b.v; const p = PREF.indexOf(left); if (p < 0) continue; const score = p * 3 + a.c + b.c; if (!best || score < best.s) best = { d: [a, b], left, s: score }; }
  if (!best) for (const a of co.TH) for (const b of co.TH) for (const c of co.TH) { if (a.v < b.v || b.v < c.v) continue; const left = v - a.v - b.v - c.v; const p = PREF.indexOf(left); if (p < 0) continue; const score = p * 3 + a.c + b.c + c.c; if (!best || score < best.s) best = { d: [a, b, c], left, s: score }; }
  return best;
}
const chips = d => d.map(x => `<span class="${kind(x.l)}">${x.l}</span>`).join(' ');
const XT = {
  de: { coTitle: (v, r) => r ? `${v} checken: ${lbl(r)} – bester Checkout-Weg | Darts aktuell` : `${v} Rest im Darts: kein Checkout möglich | Darts aktuell`,
        coDesc: (v, r) => r ? `So checkst du ${v} Rest im Darts: ${lbl(r)} (${r.length} ${r.length === 1 ? 'Dart' : 'Darts'}). Mit Alternativen und Plan B, wenn der erste Dart danebengeht.` : `${v} lässt sich mit drei Darts nicht auf einem Doppel beenden. So stellst du dir stattdessen ein gutes Finish.`,
        coH1: v => `${v} <span>checken</span>`, coLead: (v, r) => r ? `Der beste Weg für <b>${v} Rest</b>: ${chips(r)} – ${r.length} ${r.length === 1 ? 'Dart' : 'Darts'} bis zum Leg.` : `<b>${v}</b> ist eine Bogey-Number: Mit drei Darts lässt sich diese Zahl nicht auf einem Doppel beenden.`,
        crumb: 'Checkout-Rechner', best: 'Der empfohlene Weg', why: 'Der Weg nutzt möglichst wenige Darts, die Doppel, die Profis am liebsten spielen, und lässt nach einem Fehlwurf möglichst noch ein Finish übrig.',
        alts: 'Alternativen', planB: 'Wenn der erste Dart danebengeht', planBtxt: (f, n, left, r2) => `Landet ${f} nur in der einfachen ${n}, bleiben <b>${left}</b> Rest. ${r2 ? `Dann geht es mit ${chips(r2)} weiter.` : 'Mit zwei Darts ist das kein Finish mehr – stell dir mit dem zweiten Dart ein gutes Doppel.'}`,
        setup: 'So stellst du dir ein Finish', setupTxt: (s) => `Wirf ${chips(s.d)} und lass dir <b>${s.left}</b> stehen – das checkst du in der nächsten Aufnahme mit ${chips(co.suggest(s.left, 3))}.`,
        near: 'Weitere Restzahlen', calc: 'Zum Checkout-Rechner', faqQ: v => `Wie checkt man ${v} im Darts?`, faqA: (v, r) => r ? `Der beste Weg für ${v} ist ${lbl(r)}.` : `${v} kann man mit drei Darts nicht checken (Bogey-Number).`,
        plTitle: n => `${n}: Weltrangliste, Preisgeld & Darts-WM 2027 | Darts aktuell`, plDesc: (n, r) => r ? `${n} ist die Nummer ${r.rank} der PDC Order of Merit (${money(r.prize_k)}). Alle WM-Spiele, Gegner, Uhrzeiten und Ergebnisse bei der Darts-WM 2026/27.` : `${n} bei der Darts-WM 2026/27: Gegner, Uhrzeiten und Ergebnisse.`,
        plLead: (n, r) => r ? `${n} steht auf <b>Platz ${r.rank}</b> der PDC-Weltrangliste mit ${money(r.prize_k)} Preisgeld aus den letzten zwei Jahren.` : `${n} ist bei der Darts-WM 2026/27 dabei.`, plCrumb: 'Spieler', mv: (m) => m > 0 ? ` Seit dem letzten Stand ${m} ${m === 1 ? 'Platz' : 'Plätze'} nach oben.` : m < 0 ? ` Seit dem letzten Stand ${-m} ${-m === 1 ? 'Platz' : 'Plätze'} nach unten.` : '',
        wm: 'Bei der Darts-WM 2026/27', wmNone: 'Die WM-Paarungen stehen nach der Auslosung am Montag, 30. November, fest. Dann erscheinen hier Gegner, Termin und Uhrzeit.', next: 'Nächstes Spiel', out: r => `Ausgeschieden in der ${r}.`, th: ['Datum', 'Zeit', 'Runde', 'Gegner', 'Ergebnis'], vs: 'gegen', story: 'Mehr zu', neigh: 'In der Weltrangliste daneben', toOom: 'Komplette Weltrangliste', toTipp: 'Tipp seine Spiele im Tippspiel', pro: 'Darts-Profi',
        ltTitle: 'Darts Live-Ticker heute: Darts-WM 2026/27 live – Ergebnisse & Spielstände | Darts aktuell', ltDesc: 'Darts-WM 2026/27 im Liveticker: alle Spiele des Tages mit Zwischenständen nach Sätzen und Legs, Ergebnissen und Uhrzeiten – aktualisiert sich von selbst.', ltH1: 'Darts-WM <span>Liveticker</span>', ltIntro: 'Alle Spiele des Tages mit Zwischenstand nach Sätzen und Legs. Die Seite lädt alle 30 Sekunden neu – einfach offen lassen.', ltCrumb: 'Liveticker', ltShare: 'Darts-WM Liveticker: alle Spielstände live 🎯' },
  en: { coTitle: (v, r) => r ? `${v} checkout in darts: ${lbl(r)} – best way out | Darts aktuell` : `${v} in darts: no checkout possible | Darts aktuell`,
        coDesc: (v, r) => r ? `How to check out ${v} in darts: ${lbl(r)} (${r.length} ${r.length === 1 ? 'dart' : 'darts'}). With alternatives and a plan B if the first dart misses.` : `${v} cannot be finished on a double with three darts. Here is how to set up a finish instead.`,
        coH1: v => `${v} <span>checkout</span>`, coLead: (v, r) => r ? `The best way to check out <b>${v}</b>: ${chips(r)} – ${r.length} ${r.length === 1 ? 'dart' : 'darts'} to win the leg.` : `<b>${v}</b> is a bogey number: it cannot be finished on a double with three darts.`,
        crumb: 'Checkout chart', best: 'Recommended route', why: 'The route uses as few darts as possible, the doubles the pros prefer, and where possible still leaves a finish after a miss.',
        alts: 'Alternatives', planB: 'If the first dart misses', planBtxt: (f, n, left, r2) => `If ${f} only finds the single ${n}, you are left on <b>${left}</b>. ${r2 ? `Then go ${chips(r2)}.` : 'That is no longer a two-dart finish – use your second dart to leave a good double.'}`,
        setup: 'How to set up a finish', setupTxt: (s) => `Throw ${chips(s.d)} and leave yourself <b>${s.left}</b> – next visit you check it out with ${chips(co.suggest(s.left, 3))}.`,
        near: 'Other scores', calc: 'Checkout calculator', faqQ: v => `How do you check out ${v} in darts?`, faqA: (v, r) => r ? `The best way to check out ${v} is ${lbl(r)}.` : `${v} cannot be checked out with three darts (bogey number).`,
        plTitle: n => `${n}: Order of Merit, prize money & World Darts Championship 2027 | Darts aktuell`, plDesc: (n, r) => r ? `${n} is number ${r.rank} on the PDC Order of Merit (${tm('en', r.prize_k)}). Every World Championship match, opponent, start time and result at the 2026/27 World Darts Championship.` : `${n} at the 2026/27 World Darts Championship: opponents, start times and results.`,
        plLead: (n, r) => r ? `${n} is <b>number ${r.rank}</b> on the PDC Order of Merit with ${tm('en', r.prize_k)} in prize money from the last two years.` : `${n} is in the field for the 2026/27 World Darts Championship.`, plCrumb: 'Players', mv: m => m > 0 ? ` Up ${m} ${m === 1 ? 'place' : 'places'} since the last update.` : m < 0 ? ` Down ${-m} ${-m === 1 ? 'place' : 'places'} since the last update.` : '',
        wm: 'At the 2026/27 World Darts Championship', wmNone: 'The match-ups are decided at the draw on Monday 30 November. Opponent, date and start time will appear here afterwards.', next: 'Next match', out: r => `Knocked out in ${r.toLowerCase()}.`, th: ['Date', 'Time (UK)', 'Round', 'Opponent', 'Result'], vs: 'vs', story: 'More on', neigh: 'Next to him in the rankings', toOom: 'Full Order of Merit', toTipp: 'Predict his matches', pro: 'Professional darts player',
        ltTitle: 'World Darts Championship live scores 2026/27 | Darts aktuell', ltDesc: 'World Darts Championship 2026/27 live: every match of the day with live set and leg scores, results and UK start times – updates automatically.', ltH1: 'World Championship <span>live scores</span>', ltIntro: 'Every match of the day with the live score in sets and legs. The page reloads every 30 seconds – just leave it open.', ltCrumb: 'Live scores', ltShare: 'World Darts Championship live scores 🎯' },
  nl: { coTitle: (v, r) => r ? `${v} uitgooien: ${lbl(r)} – beste route | Darts aktuell` : `${v} in darts: geen finish mogelijk | Darts aktuell`,
        coDesc: (v, r) => r ? `Zo gooi je ${v} uit in darts: ${lbl(r)} (${r.length} ${r.length === 1 ? 'pijl' : 'pijlen'}). Met alternatieven en een plan B als de eerste pijl mist.` : `${v} kun je met drie pijlen niet op een dubbel uitgooien. Zo zet je in plaats daarvan een goede finish klaar.`,
        coH1: v => `${v} <span>uitgooien</span>`, coLead: (v, r) => r ? `De beste route voor <b>${v}</b>: ${chips(r)} – ${r.length} ${r.length === 1 ? 'pijl' : 'pijlen'} tot de leg-winst.` : `<b>${v}</b> is een bogey number: deze score kun je met drie pijlen niet op een dubbel uitgooien.`,
        crumb: 'Uitgooi-tabel', best: 'Aanbevolen route', why: 'De route gebruikt zo weinig mogelijk pijlen, de dubbels die profs het liefst gooien en laat na een misser zo mogelijk nog een finish over.',
        alts: 'Alternatieven', planB: 'Als de eerste pijl mist', planBtxt: (f, n, left, r2) => `Komt ${f} alleen in de enkele ${n}, dan blijft er <b>${left}</b> over. ${r2 ? `Ga dan verder met ${chips(r2)}.` : 'Met twee pijlen is dat geen finish meer – zet met je tweede pijl een goede dubbel klaar.'}`,
        setup: 'Zo zet je een finish klaar', setupTxt: (s) => `Gooi ${chips(s.d)} en laat <b>${s.left}</b> staan – die gooi je de volgende beurt uit met ${chips(co.suggest(s.left, 3))}.`,
        near: 'Andere scores', calc: 'Uitgooi-calculator', faqQ: v => `Hoe gooi je ${v} uit in darts?`, faqA: (v, r) => r ? `De beste route voor ${v} is ${lbl(r)}.` : `${v} kun je met drie pijlen niet uitgooien (bogey number).`,
        plTitle: n => `${n}: wereldranglijst, prijzengeld & WK darts 2027 | Darts aktuell`, plDesc: (n, r) => r ? `${n} is de nummer ${r.rank} van de PDC Order of Merit (${tm('nl', r.prize_k)}). Alle WK-partijen, tegenstanders, aanvangstijden en uitslagen op het WK darts 2026/27.` : `${n} op het WK darts 2026/27: tegenstanders, aanvangstijden en uitslagen.`,
        plLead: (n, r) => r ? `${n} staat op <b>plaats ${r.rank}</b> van de PDC-wereldranglijst met ${tm('nl', r.prize_k)} prijzengeld uit de laatste twee jaar.` : `${n} doet mee aan het WK darts 2026/27.`, plCrumb: 'Spelers', mv: m => m > 0 ? ` Sinds de vorige stand ${m} ${m === 1 ? 'plaats' : 'plaatsen'} gestegen.` : m < 0 ? ` Sinds de vorige stand ${-m} ${-m === 1 ? 'plaats' : 'plaatsen'} gezakt.` : '',
        wm: 'Op het WK darts 2026/27', wmNone: 'De partijen worden bekend bij de loting op maandag 30 november. Tegenstander, datum en aanvangstijd verschijnen daarna hier.', next: 'Volgende partij', out: r => `Uitgeschakeld in de ${r.toLowerCase()}.`, th: ['Datum', 'Tijd', 'Ronde', 'Tegenstander', 'Uitslag'], vs: 'tegen', story: 'Meer over', neigh: 'Ernaast in de ranglijst', toOom: 'Complete wereldranglijst', toTipp: 'Voorspel zijn partijen', pro: 'Profdarter',
        ltTitle: 'WK darts liveticker 2026/27: live-uitslagen & standen | Darts aktuell', ltDesc: 'WK darts 2026/27 live: alle partijen van de dag met tussenstanden in sets en legs, uitslagen en aanvangstijden – ververst vanzelf.', ltH1: 'WK darts <span>live</span>', ltIntro: 'Alle partijen van de dag met de tussenstand in sets en legs. De pagina ververst elke 30 seconden – laat hem gewoon openstaan.', ltCrumb: 'Live-uitslagen', ltShare: 'WK darts live-uitslagen 🎯' }
};
function tm(c, k) { return '£' + Math.round(Number(k) * 1000).toLocaleString(c === 'en' ? 'en-GB' : 'nl-NL'); }
const POPULAR = [170, 167, 164, 161, 160, 141, 121, 100, 81, 60, 40, 32];
// Spieler: Weltrangliste + alle WM-Teilnehmer aus den Paarungen
const plMap = new Map();
for (const r of oom) plMap.set(r.player, { name: r.player, r });
for (const m of data.matches) for (const n of [m.player1, m.player2]) if (n && !/^(tbd|tba|n\.?\s?n\.?)$/i.test(n) && !plMap.has(n)) plMap.set(n, { name: n, r: null });
const players = [...plMap.values()].map(p => ({ ...p, slug: slugify(p.name) })).filter(p => p.slug);
for (const p of players) ALT[`${PL_BASE.de}${p.slug}/`] = { de: `${PL_BASE.de}${p.slug}/`, en: `${PL_BASE.en}${p.slug}/`, nl: `${PL_BASE.nl}${p.slug}/` };
ALT['/erinnerung-abmelden/'] = { de: '/erinnerung-abmelden/', en: '/en/unsubscribe/', nl: '/nl/afmelden/' };
ALT['/liveticker/'] = ALT['/liveticker/'] || { de: '/liveticker/', en: PATHS.en['/liveticker/'], nl: PATHS.nl['/liveticker/'] };

for (const C of ['de', 'en', 'nl']) {
  const PG = PAGERS[C]; if (!PG) continue;
  const X = XT[C], home = PG.home, coBase = CO_BASE[C], plBase = PL_BASE[C];
  const loc = PG.L.locale, tz = PG.L.tz, rt = PG.L.rt || {};
  const out = (url, html) => write(url.replace(/^\//, '') + 'index.html', html);
  const P = (meta, body, scripts) => C === 'de' ? PG.page(meta, body, scripts) : PG.page({ ...meta, de: meta.de }, body, scripts);
  // Finish-Seiten
  for (let v = 170; v >= 2; v--) {
    const r = co.suggest(v), url = `${coBase}${v}/`, de = `${CO_BASE.de}${v}/`;
    let body = `<section class="band"><div class="wrap co-page">`;
    if (r) {
      body += `<h2>${X.best}</h2><p class="route big">${chips(r)}</p><p>${X.why}</p>`;
      const al = alternatives(v);
      if (al.length) body += `<h2>${X.alts}</h2><ul class="co-alts">${al.map(d => `<li>${chips(d)}</li>`).join('')}</ul>`;
      const f = r[0];
      if (r.length >= 2 && f.k === 't') { const n = f.v / 3, left = v - n, r2 = co.suggest(left, 2); body += `<h2>${X.planB}</h2><p>${X.planBtxt(`<b>${f.l}</b>`, n, left, r2)}</p>`; }
    } else {
      const s = setupFor(v);
      if (s && co.suggest(s.left, 3)) body += `<h2>${X.setup}</h2><p>${X.setupTxt(s)}</p>`;
    }
    const near = [...new Set([v + 1, v - 1, ...POPULAR])].filter(x => x >= 2 && x <= 170 && x !== v).slice(0, 14);
    body += `<h2>${X.near}</h2><p class="co-near">${near.map(x => `<a href="${coBase}${x}/">${x}</a>`).join(' ')}</p><p><a class="btn-y" href="${PATHS[C] ? PATHS[C]['/checkout-rechner/'] : '/checkout-rechner/'}">${X.calc}</a></p>${PG.promo}</div></section>`;
    const ld = [crumbs([['Darts aktuell', home], [X.crumb, C === 'de' ? '/checkout-rechner/' : PATHS[C]['/checkout-rechner/']], [String(v), url]]),
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: X.faqQ(v), acceptedAnswer: { '@type': 'Answer', text: X.faqA(v, r) } }] }];
    out(url, P({ title: X.coTitle(v, r), desc: X.coDesc(v, r), url, de, ld },
      PG.intro(X.coH1(v), X.coLead(v, r), PG.crumbs([[PG.T.home, home], [X.crumb, C === 'de' ? '/checkout-rechner/' : PATHS[C]['/checkout-rechner/']], [String(v), url]]), null) + body, []));
    pages.push({ url, pri: '0.6', freq: 'yearly' });
  }
  // Spielerseiten
  const dOf = iso => new Date(iso).toLocaleDateString(loc, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' });
  const tOf = iso => new Date(iso).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const sorted = [...players].sort((a, b) => (a.r ? a.r.rank : 999) - (b.r ? b.r.rank : 999) || a.name.localeCompare(b.name));
  for (const [i, p] of sorted.entries()) {
    const url = `${plBase}${p.slug}/`, de = `${PL_BASE.de}${p.slug}/`, r = p.r;
    const ms = data.matches.filter(m => m.player1 === p.name || m.player2 === p.name).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const rows = ms.map(m => { const me1 = m.player1 === p.name, opp = me1 ? m.player2 : m.player1, done = m.sets1 != null && m.sets2 != null;
      const my = me1 ? m.sets1 : m.sets2, th = me1 ? m.sets2 : m.sets1, oppP = plMap.get(opp) ? `<a href="${plBase}${slugify(opp)}/">${esc(opp)}</a>` : esc(opp);
      return `<tr${done ? (my > th ? ' class="win"' : ' class="loss"') : ''}><td>${dOf(m.starts_at)}</td><td>${tOf(m.starts_at)}</td><td>${esc(rt[m.round] || m.round)}</td><td>${oppP}</td><td>${done ? `${my}:${th}` : '–'}</td></tr>`; }).join('');
    const lost = ms.find(m => m.sets1 != null && m.sets2 != null && ((m.player1 === p.name) ? m.sets1 < m.sets2 : m.sets2 < m.sets1));
    const nextM = ms.find(m => m.sets1 == null && new Date(m.starts_at) > new Date());
    const mvN = r && r.prev_rank ? r.prev_rank - r.rank : 0;
    const story = (PG.news || []).find(n => (n.slug0 || n.slug) === `${p.slug}-darts-wm-2027`);
    const storyUrl = story ? (C === 'de' ? `/news/${story.slug}/` : story.path) : '';
    const neigh = r ? sorted.filter(x => x.r && Math.abs(x.r.rank - r.rank) <= 2 && x !== p) : [];
    const body = `<section class="band"><div class="wrap pl-page">
<h2>${X.wm}</h2>${ms.length ? `${nextM ? `<p class="pl-next"><b>${X.next}:</b> ${dOf(nextM.starts_at)}, ${tOf(nextM.starts_at)} – ${X.vs} ${esc(nextM.player1 === p.name ? nextM.player2 : nextM.player1)} (${esc(rt[nextM.round] || nextM.round)})${C === 'de' ? ` · ${SESS_L[sessOf(nextM.starts_at)]} · TV: ${TV_DE}` : ''}</p>` : ''}${lost ? `<p class="pl-out">${X.out(rt[lost.round] || lost.round)}</p>` : ''}
<table class="stack"><thead><tr>${X.th.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>` : `<p>${X.wmNone}</p>`}
${storyUrl ? `<p><a class="btn-y" href="${storyUrl}">${X.story} ${esc(p.name)}</a></p>` : ''}
${neigh.length ? `<h2>${X.neigh}</h2><p class="co-near">${neigh.map(x => `<a href="${plBase}${x.slug}/">${x.r.rank}. ${esc(x.name)}</a>`).join(' ')}</p>` : ''}
<p><a class="btn-y" href="${C === 'de' ? '/pdc-weltrangliste/' : PATHS[C]['/pdc-weltrangliste/']}">${X.toOom}</a> <a class="btn-r" href="${C === 'de' ? '/darts-tippspiel/' : PATHS[C]['/darts-tippspiel/']}">${X.toTipp}</a></p>
${PG.promo}</div></section>`;
    const ld = [crumbs([['Darts aktuell', home], [X.plCrumb, C === 'de' ? '/pdc-weltrangliste/' : PATHS[C]['/pdc-weltrangliste/']], [p.name, url]]), { '@context': 'https://schema.org', '@type': 'Person', name: p.name, jobTitle: X.pro, url: SITE + url }];
    out(url, P({ title: X.plTitle(p.name), desc: X.plDesc(p.name, r), url, de, ld },
      PG.intro(esc(p.name), X.plLead(esc(p.name), r) + X.mv(mvN), PG.crumbs([[PG.T.home, home], [X.plCrumb, C === 'de' ? '/pdc-weltrangliste/' : PATHS[C]['/pdc-weltrangliste/']], [p.name, url]]), null) + body, []));
    pages.push({ url, pri: '0.6', freq: 'daily' });
  }
  // Liveticker
  const lUrl = C === 'de' ? '/liveticker/' : PATHS[C]['/liveticker/'];
  out(lUrl, P({ title: X.ltTitle, desc: X.ltDesc, url: lUrl, de: '/liveticker/', ld: crumbs([['Darts aktuell', home], [X.ltCrumb, lUrl]]) },
    PG.intro(X.ltH1, X.ltIntro, PG.crumbs([[PG.T.home, home], [X.ltCrumb, lUrl]]), C === 'de' ? [lUrl, X.ltShare] : null) + `<section class="band"><div class="wrap"><div id="live" class="live" aria-live="polite"></div></div></section>`, ['db', 'live']));
  pages.push({ url: lUrl, pri: '0.9', freq: 'always' });
  // Abmeldung von der Tipp-Erinnerung (Link aus der Mail)
  const UN = { de: ['/erinnerung-abmelden/', 'Tipp-Erinnerung abbestellen', 'Erinnerung <span>abbestellen</span>', 'Einen Moment …', 'Erledigt: Du bekommst keine Tipp-Erinnerungen mehr. Einschalten kannst du sie jederzeit wieder im Tippspiel.', 'Der Link ist ungültig oder schon benutzt. Du kannst die Erinnerung im Tippspiel unter deinem Spielernamen ausschalten.', 'Zum Tippspiel', '/darts-tippspiel/'],
    en: ['/en/unsubscribe/', 'Unsubscribe from reminders', 'Stop <span>reminders</span>', 'One moment …', 'Done: you will not get any more reminders. You can switch them back on in the predictor at any time.', 'This link is invalid or was already used. You can switch reminders off in the predictor below your player name.', 'Go to the predictor', '/en/darts-predictor/'],
    nl: ['/nl/afmelden/', 'Afmelden voor herinneringen', 'Herinneringen <span>uitzetten</span>', 'Een moment …', 'Gelukt: je krijgt geen herinneringen meer. Je kunt ze in de poule altijd weer aanzetten.', 'Deze link is ongeldig of al gebruikt. Je kunt herinneringen in de poule onder je spelersnaam uitzetten.', 'Naar de poule', '/nl/wk-darts-poule/'] }[C];
  out(UN[0], P({ title: UN[1] + ' | Darts aktuell', desc: UN[1], url: UN[0], de: '/erinnerung-abmelden/', noindex: true },
    PG.intro(UN[2], '', '', null) + `<section class="band"><div class="wrap"><p id="unsub" class="lt-empty">${UN[3]}</p><p><a class="btn-r" href="${UN[7]}" style="display:inline-block;padding:10px 18px;text-decoration:none;font-weight:700">${UN[6]}</a></p></div></section>
<script>addEventListener('load',async()=>{const o=document.getElementById('unsub'),t=new URLSearchParams(location.search).get('t'),C=window.DARTS_CONFIG||{};let ok=false;try{if(t&&/^[0-9a-f-]{36}$/i.test(t)&&window.supabase){const sb=window.DARTS_SB||window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey);const r=await sb.rpc('reminder_unsubscribe',{p_token:t});ok=!r.error&&r.data===true}}catch(e){}o.textContent=ok?${JSON.stringify(UN[4])}:${JSON.stringify(UN[5])}})</script>`, ['db']).replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex">'));
  console.log(`${C}: ${170 - 1} Finish-Seiten, ${players.length} Spielerseiten, Liveticker`);
}

// Versionsnummern auch für die Sprach-Skripte (die Seiten oben sind schon geschrieben → nachträglich ersetzen)
for (const C of Object.keys(LANGS)) {
  const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith('.html')) { let h = fs.readFileSync(p, 'utf8'); for (const n of ['app.js', 'tippspiel.js', 'news.js']) h = h.split(`"/${C}/${n}"`).join(`"/${C}/${n}?v=${VER[C + '/' + n]}"`); fs.writeFileSync(p, h); } } };
  walk(path.join(OUT, C));
}

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
/* ---------- „Darts heute“: Seiten für die häufigsten Tages-Suchanfragen ---------- */
{
  const dayStr = off => new Date(Date.now() + off * 864e5).toLocaleDateString('sv-SE', { timeZone: TZ });
  const D0 = dayStr(0), D1 = dayStr(-1), DP = dayStr(1);
  const dLbl = d => new Date(d + 'T12:00:00Z').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
  const dShort = d => new Date(d + 'T12:00:00Z').toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: TZ });
  const tOf = iso => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  const bOf = iso => new Date(iso).toLocaleDateString('sv-SE', { timeZone: TZ });
  const WMTV = 'SPORT1 (Free-TV und kostenloser Stream) und DAZN';
  const rowsFor = d => {
    const wm = data.matches.filter(m => m.starts_at && bOf(m.starts_at) === d).map(m => ({ event: 'Darts-WM 2026/27', starts_at: m.starts_at, round: m.round, player1: m.player1, player2: m.player2, s1: m.sets1, s2: m.sets2, ls1: m.live_s1, ls2: m.live_s2, fmt: m.best_of ? `Best of ${m.best_of} Sätze` : '', tv: WMTV, note: m.live_note, wm: 1 }));
    return [...wm, ...data.tagesplan.filter(r => r.day === d)];
  };
  const evOn = d => data.events.filter(e => e.start <= d && (e.end || e.start) >= d);
  const nextEv = d => data.events.filter(e => e.start > d).sort((a, b) => a.start.localeCompare(b.start))[0];
  const pl = n => { const p = plMap.get(n); return p ? `<a href="/spieler/${slugify(n)}/">${esc(n)}</a>` : esc(n || 'N.N.'); };
  const done = r => r.s1 != null && r.s2 != null;
  const table = (rows, withRes) => {
    if (!rows.length) return '';
    const by = {}; rows.forEach(r => (by[r.event] = by[r.event] || []).push(r));
    return Object.entries(by).map(([ev, rs]) => `<h3>${esc(ev)}</h3><table class="stack dh-t"><thead><tr><th>Zeit</th><th>Runde</th><th>Spiel</th><th>${withRes ? 'Ergebnis' : 'Stand'}</th></tr></thead><tbody>${rs.map(r => {
      const w1 = done(r) && r.s1 > r.s2, w2 = done(r) && r.s2 > r.s1;
      const res = done(r) ? `<b>${r.s1}:${r.s2}</b>` : (r.ls1 != null ? `live ${r.ls1}:${r.ls2}` : 'offen');
      return `<tr><td>${r.starts_at ? tOf(r.starts_at) + ' Uhr' : (r.note && /Abend/.test(r.note) ? 'Abend' : r.note && /Nachmittag/.test(r.note) ? 'Nachmittag' : '–')}</td><td>${esc(r.round || '')}${r.fmt ? `<small> · ${esc(r.fmt)}</small>` : ''}</td><td>${w1 ? '<b>' : ''}${pl(r.player1)}${w1 ? '</b>' : ''} – ${w2 ? '<b>' : ''}${pl(r.player2)}${w2 ? '</b>' : ''}</td><td>${res}</td></tr>`; }).join('')}</tbody></table>`).join('');
  };
  const evInfo = d => { const ev = evOn(d); if (!ev.length) { const n = nextEv(d); return `<p>${d === D0 ? 'Heute' : 'An diesem Tag'} steht kein großes PDC-Turnier an.${n ? ` Weiter geht es mit <b>${esc(n.name)}</b> (${esc(n.location || '')}) ab ${dLbl(n.start)}.` : ''}</p>`; }
    return `<ul class="dh-ev">${ev.map(e => `<li><b>${esc(e.name)}</b>${e.location ? ` – ${esc(e.location)}` : ''} <span class="note">(${dShort(e.start)}${e.end && e.end !== e.start ? ' bis ' + dShort(e.end) : ''})</span></li>`).join('')}</ul>`; };
  const tvInfo = d => { const ev = evOn(d), rows = rowsFor(d); if (!ev.length && !rows.length) return '<p>Heute gibt es kein großes PDC-Turnier im Fernsehen.</p>';
    const tv = {}; rows.forEach(r => { if (r.tv) tv[r.event] = r.tv; });
    return `<ul class="dh-ev">${[...new Set([...ev.map(e => e.name), ...rows.map(r => r.event)])].filter(n => n !== 'WM-Auslosung' || true).map(n => `<li><b>${esc(n)}</b>: ${tv[n] ? esc(tv[n]) : /WM/.test(n) ? WMTV : 'Übertragung bei DAZN; ob und wann zusätzlich das Free-TV (SPORT1) zeigt, steht im aktuellen Programm des Senders'}</li>`).join('')}</ul>`; };
  const newsOn = d => data.news.filter(n => String(n.date).slice(0, 10) === d).slice(0, 8);
  const newsList = ns => ns.length ? `<ul class="dh-news">${ns.map(n => `<li><a href="/news/${n.slug}/">${esc(n.title)}</a></li>`).join('')}</ul>` : '';
  const stand = `<p class="note dh-stand">Stand: ${new Date().toLocaleString('de-DE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ })} Uhr – die Seite wird alle 30 Minuten aktualisiert.</p>`;
  const links = cur => `<div class="dh-links" role="navigation" aria-label="Darts heute">${[['/darts-heute/', 'Darts heute'], ['/darts-ergebnisse-heute/', 'Ergebnisse heute'], ['/darts-ergebnisse-gestern/', 'Ergebnisse gestern'], ['/darts-heute-im-tv/', 'Darts heute im TV'], ['/darts-spielplan-heute/', 'Spielplan heute'], ['/liveticker/', 'Live-Ticker'], ['/darts-fragen/', 'Darts-Fragen']].map(([u, l]) => u === cur ? `<span>${l}</span>` : `<a href="${u}">${l}</a>`).join('')}</div>`;
  const evLD = rows => rows.slice(0, 40).map(r => ({ '@context': 'https://schema.org', '@type': 'SportsEvent', name: `${r.player1} vs ${r.player2} – ${r.event}${r.round ? ' (' + r.round + ')' : ''}`, startDate: r.starts_at || r.day, sport: 'Darts', eventStatus: 'https://schema.org/EventScheduled', location: { '@type': 'Place', name: r.wm ? 'Alexandra Palace, London' : (evOn(r.day || D0)[0] || {}).location || r.event }, competitor: [{ '@type': 'Person', name: r.player1 }, { '@type': 'Person', name: r.player2 }] }));
  const faq = qs => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
  const r0 = rowsFor(D0), r1 = rowsFor(D1), rp = rowsFor(DP);
  const evNames = d => evOn(d).map(e => e.name).join(', ');
  const sum0 = r0.length ? `${r0.length} Spiele (${[...new Set(r0.map(r => r.event))].join(', ')}), davon ${r0.filter(done).length} beendet` : (evNames(D0) ? `heute läuft: ${evNames(D0)}` : 'heute kein großes PDC-Turnier');
  const DH = [
    { url: '/darts-heute/', title: `Darts heute (${dShort(D0)}): Spiele, Ergebnisse, TV & Live-Ticker | Darts aktuell`, desc: `Darts heute, ${dLbl(D0)}: ${sum0}. Alle Spiele mit Uhrzeit, Ergebnisse, wer überträgt (TV & Stream) und der Live-Ticker.`, h1: 'Darts <span>heute</span>',
      lead: `${dLbl(D0)}: alle Darts-Spiele des Tages mit Uhrzeit und Ergebnis, die TV-Übertragung und der Live-Ticker – auf einen Blick.`,
      body: `<h2>Was läuft heute?</h2>${evInfo(D0)}<h2>Spiele und Ergebnisse heute</h2>${table(r0, false) || '<p>Für heute sind keine Spiele eingetragen.</p>'}<p><a class="btn-r" href="/liveticker/">Zum Live-Ticker</a></p><h2>Darts heute im TV</h2>${tvInfo(D0)}${rp.length ? `<h2>Morgen, ${dLbl(DP)}</h2>${table(rp, false)}` : ''}${r1.length ? `<h2>Gestern</h2><p><a href="/darts-ergebnisse-gestern/">Alle Ergebnisse von gestern</a></p>` : ''}${newsOn(D0).length ? `<h2>Darts-News von heute</h2>${newsList(newsOn(D0))}` : ''}`,
      ld: [faq([['Wo läuft Darts heute im TV?', tvInfo(D0).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()], ['Welche Darts-Spiele sind heute?', sum0 + '.']]), ...evLD(r0)] },
    { url: '/darts-ergebnisse-heute/', title: `Darts Ergebnisse heute (${dShort(D0)}): alle Spiele & Resultate | Darts aktuell`, desc: `Darts-Ergebnisse von heute, ${dLbl(D0)}: ${r0.filter(done).length} von ${r0.length || 0} Spielen beendet. Alle Resultate, Sieger und laufende Spiele – aktualisiert alle 30 Minuten.`, h1: 'Darts Ergebnisse <span>heute</span>',
      lead: `Alle Darts-Ergebnisse von ${dLbl(D0)}. Sieger sind fett markiert, laufende Spiele siehst du im Live-Ticker.`,
      body: `${table(r0, true) || `<p>Heute gibt es noch keine Ergebnisse.</p>${evInfo(D0)}`}<p><a class="btn-r" href="/liveticker/">Live-Ticker</a> <a class="btn-y" href="/darts-ergebnisse-gestern/">Ergebnisse von gestern</a></p>`,
      ld: [faq([['Wie sind die Darts-Ergebnisse heute?', r0.filter(done).length ? r0.filter(done).map(r => `${r.player1} ${r.s1}:${r.s2} ${r.player2}`).slice(0, 12).join(', ') + '.' : 'Heute sind noch keine Spiele beendet.']]), ...evLD(r0)] },
    { url: '/darts-ergebnisse-gestern/', title: `Darts Ergebnisse von gestern (${dShort(D1)}) & gestern Abend | Darts aktuell`, desc: `Darts gestern Abend: alle Ergebnisse von ${dLbl(D1)}${r1.length ? ` – ${r1.filter(done).length} Spiele` : ''}. Sieger, Resultate und was heute folgt.`, h1: 'Darts Ergebnisse <span>gestern</span>',
      lead: `Alle Ergebnisse von ${dLbl(D1)} – auch vom Abend. Sieger sind fett markiert.`,
      body: `${table(r1, true) || `<p>Gestern wurden keine großen PDC-Spiele gespielt.</p>`}${newsOn(D1).length ? `<h2>Berichte von gestern</h2>${newsList(newsOn(D1))}` : ''}<p><a class="btn-r" href="/darts-heute/">Was läuft heute?</a></p>`,
      ld: [faq([['Wie hat Darts gestern Abend geendet?', r1.filter(done).length ? r1.filter(done).map(r => `${r.player1} ${r.s1}:${r.s2} ${r.player2}`).slice(0, 12).join(', ') + '.' : 'Gestern fanden keine großen PDC-Spiele statt.']])] },
    { url: '/darts-heute-im-tv/', title: `Darts heute live im TV & Stream (${dShort(D0)}): Wer überträgt? | Darts aktuell`, desc: `Darts-Live-Übertragung heute, ${dLbl(D0)}: welche Turniere laufen, wann die Sessions beginnen und wo du sie im Free-TV oder Stream siehst.`, h1: 'Darts heute <span>im TV</span>',
      lead: `Wo läuft Darts heute live? Turniere, Sessions und Sender für ${dLbl(D0)}.`,
      body: `<h2>Übertragung heute</h2>${tvInfo(D0)}<h2>Was läuft heute?</h2>${evInfo(D0)}${table(r0, false)}<p class="note">Angaben zu Sendern ohne Gewähr – maßgeblich ist das aktuelle Programm von SPORT1 und DAZN.</p>`,
      ld: [faq([['Wo kann man Darts heute live sehen?', tvInfo(D0).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()]])] },
    { url: '/darts-spielplan-heute/', title: `Darts Spielplan heute & morgen (${dShort(D0)}) | Darts aktuell`, desc: `Darts-Spielplan für heute, ${dLbl(D0)}, und morgen: alle Partien mit Uhrzeit, Runde und Turnier.`, h1: 'Darts Spielplan <span>heute</span>',
      lead: `Alle Partien von heute und morgen mit Uhrzeit (deutsche Zeit), Runde und Turnier.`,
      body: `<h2>Heute, ${dLbl(D0)}</h2>${table(r0, false) || evInfo(D0)}<h2>Morgen, ${dLbl(DP)}</h2>${table(rp, false) || evInfo(DP)}<p><a class="btn-y" href="/darts-wm-spielplan/">Kompletter WM-Spielplan</a></p>`,
      ld: [...evLD([...r0, ...rp])] },
  ];
  for (const P of DH) {
    write(P.url.slice(1) + 'index.html', pageFn({ title: P.title, desc: P.desc, url: P.url, ld: [crumbs([['Darts aktuell', '/'], [P.h1.replace(/<[^>]+>/g, ''), P.url]]), ...P.ld] },
      intro(P.h1, P.lead, crumbNav([['Startseite', '/'], [P.h1.replace(/<[^>]+>/g, ''), P.url]]), [P.url, P.title.replace(' | Darts aktuell', '') + ' 🎯']) + `<section class="band"><div class="wrap dh">${links(P.url)}${stand}${P.body}${tippPromo}</div></section>`, []));
    pages.push({ url: P.url, pri: '0.9', freq: 'hourly' });
  }
  // Startseite: Block „Heute bei der WM“
  function wmToday() {
    const today = dayOf(new Date().toISOString());
    const li = m => { const done = m.sets1 != null && m.sets2 != null, de = GER.has(m.player1) || GER.has(m.player2);
      return `<li${de ? ' class="de"' : ''}><span class="t">${timeOf(m.starts_at)}</span> ${plLink(m.player1)} <b>${done ? `${m.sets1}:${m.sets2}` : '–'}</b> ${plLink(m.player2)}</li>`; };
    const sessList = rows => ['Nachmittag', 'Abend'].map(S => [S, rows.filter(m => sessOf(m.starts_at) === S)]).filter(([, r]) => r.length)
      .map(([S, r]) => `<h3>${S} · ab ${timeOf(r[0].starts_at)} Uhr</h3><ul>${r.map(li).join('')}</ul>`).join('');
    const all = [...data.matches].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const todays = all.filter(m => dayOf(m.starts_at) === today);
    let head, body;
    if (todays.length) { head = 'Heute bei der <span>WM</span>'; body = sessList(todays); }
    else { const next = all.find(m => dayOf(m.starts_at) > today);
      if (next) { const d = dayOf(next.starts_at); head = 'Nächste <span>WM-Spiele</span>'; body = `<p class="wt-day">${dayLabel(d)}</p>` + sessList(all.filter(m => dayOf(m.starts_at) === d)); }
      else if (today <= '2026-11-30') { head = 'WM-<span>Auslosung</span>'; body = `<p>Am <b>Montag, 30. November</b> wird das 128er-Feld der Darts-WM ausgelost. Danach stehen hier und im Spielplan alle Paarungen mit Session, deutscher Uhrzeit und TV-Sender.</p>`; }
      else if (today <= '2027-01-03') { head = 'Darts-<span>WM</span>'; body = `<p>Die Paarungen werden gerade eingetragen – schau gleich noch mal rein.</p>`; }
      else return ''; }
    return `<div class="wm-today"><h2>${head}</h2>${body}<p class="wt-foot">TV: ${TV_DE} · <a href="/darts-wm-spielplan/">Kompletter Spielplan</a> · <a href="/darts-tippspiel/">Jetzt tippen</a></p></div>`;
  }
  // Startseite: Schnellzugriff auf die Tagesseiten
  const ip = path.join(OUT, 'index.html');
  if (fs.existsSync(ip)) { const h = fs.readFileSync(ip, 'utf8'); const hook = '<section class="hero band" id="news"><div class="wrap">';
    if (h.includes(hook)) fs.writeFileSync(ip, h.replace(hook, hook + links('') + wmToday()));
  }
}

/* ---------- Darts-Fragen (häufige Google-Fragen) ---------- */
{
  const QA = [
    ['Wer ist der reichste Dartspieler?', 'Gemessen am Preisgeld ist Michael van Gerwen der erfolgreichste Dartspieler aller Zeiten: Im Januar 2026 hat er als Erster die Marke von 12 Millionen Pfund Karriere-Preisgeld geknackt. Zu den Top-Verdienern gehören außerdem Legenden wie Phil Taylor (16 WM-Titel), Gary Anderson und Peter Wright. Luke Littler ist nach nur wenigen Profijahren schon in den Top 10. Wie viel die Profis zusätzlich mit Sponsoren, Dart-Equipment und Showauftritten verdienen, ist nicht öffentlich – deshalb ist das Preisgeld der beste vergleichbare Maßstab.', [['Aktuelle PDC-Weltrangliste', '/pdc-weltrangliste/'], ['Michael van Gerwen', '/spieler/michael-van-gerwen/'], ['Luke Littler', '/spieler/luke-littler/']]],
    ['Was kostet ein Tisch im Ally Pally?', 'Bei der Darts-WM 2026/27 kostet ein Tischplatz im Alexandra Palace ab 75 Pfund in den ersten Runden, zum Finale 110 Pfund. Tribünenplätze gibt es ab 55 Pfund, die Hospitality im „501 Club“ ab 399 Pfund. Die Preise gelten pro Person und Session. Die Tickets wurden 2026 erstmals per Verlosung vergeben; die WM zieht dafür in die größere Great Hall mit über 5.000 Plätzen pro Session. Auf Zweitmarkt-Seiten werden Karten oft für ein Vielfaches angeboten – dort ist Vorsicht geboten.', [['WM-Spielplan mit allen Sessions', '/darts-wm-spielplan/']]],
    ['Warum sind so viele Dartspieler übergewichtig?', 'Darts ist traditionell ein Kneipensport und körperlich wenig anstrengend: Gewonnen wird mit Präzision und Nerven, nicht mit Ausdauer oder Kraft. Dazu kommen lange Reisen, späte Sessions und viel Zeit am Trainingsboard. Inzwischen achten aber immer mehr Profis auf Fitness und Ernährung, weil lange Turniertage und Reisen Kondition verlangen – das Bild vom übergewichtigen Kneipenspieler passt längst nicht mehr auf alle.', []],
    ['Wann ist die Darts-WM 2026/27?', 'Die PDC Darts-WM 2026/27 läuft vom 11. Dezember 2026 bis zum 3. Januar 2027 im Alexandra Palace in London. Die Auslosung ist am 30. November 2026.', [['WM-Spielplan', '/darts-wm-spielplan/'], ['Tippspiel', '/darts-tippspiel/']]],
    ['Wo läuft Darts heute im TV?', 'Die großen PDC-Turniere zeigt in Deutschland DAZN; die Darts-WM 2026/27 läuft außerdem ein letztes Mal im Free-TV und kostenlosen Stream bei SPORT1. Was heute konkret läuft, steht tagesaktuell auf unserer Seite „Darts heute im TV“.', [['Darts heute im TV', '/darts-heute-im-tv/'], ['Darts heute', '/darts-heute/']]],
    ['Was ist Darts aktuell?', 'Darts aktuell (dartsaktuell.com) ist eine inoffizielle Fanseite zur Darts-WM und den großen PDC-Turnieren: News, WM-Spielplan mit deutschen Uhrzeiten, Ergebnisse von heute und gestern, Live-Ticker, ein kostenloses Tippspiel mit eigenen Tipprunden, Checkout-Rechner und Punkte-Rechner mit Statistik.', [['Startseite', '/']]],
  ];
  const url = '/darts-fragen/';
  const body = `<section class="band"><div class="wrap dh faq">${QA.map(([q, a, l]) => `<h2>${esc(q)}</h2><p>${esc(a)}</p>${l.length ? `<p class="co-near">${l.map(([t, u]) => `<a href="${u}">${esc(t)}</a>`).join(' ')}</p>` : ''}`).join('')}<p class="note">Quellen: Sporting Life (Preisgeld-Rangliste, Januar 2026), dartsnews.com und dartsworld.com (Ticketpreise WM 2026/27), SPORT1 (TV-Rechte). Stand: November 2026.</p>${tippPromo}</div></section>`;
  write('darts-fragen/index.html', pageFn({ title: 'Darts-Fragen: Reichster Dartspieler, Ally-Pally-Tisch, WM-Termin & mehr | Darts aktuell', desc: 'Antworten auf die häufigsten Darts-Fragen: Wer ist der reichste Dartspieler? Was kostet ein Tisch im Ally Pally? Wann ist die Darts-WM 2026/27 und wo läuft Darts heute im TV?', url,
    ld: [crumbs([['Darts aktuell', '/'], ['Darts-Fragen', url]]), { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: QA.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }] },
    intro('Darts-<span>Fragen</span>', 'Kurze, belegte Antworten auf die Fragen, die Darts-Fans am häufigsten googeln.', crumbNav([['Startseite', '/'], ['Darts-Fragen', url]])) + body, []));
  pages.push({ url, pri: '0.7', freq: 'weekly' });
}

/* ---------- IndexNow: neue/geänderte Seiten sofort an Bing, Yandex, Seznam … melden (nur auf GitHub) ---------- */
const INDEXNOW_KEY = 'c688bc4ac501d6b8a3510cda87c3f894';
if (fs.existsSync(path.join(ROOT, INDEXNOW_KEY + '.txt'))) fs.copyFileSync(path.join(ROOT, INDEXNOW_KEY + '.txt'), path.join(OUT, INDEXNOW_KEY + '.txt'));
// Die Meldung selbst passiert erst NACH dem Veröffentlichen (scripts/indexnow.mjs), damit Bing die neuen Seiten nicht als 404 sieht.
if (process.env.CI) {
  try {
    let changed;
    if (process.env.INDEXNOW_ALL === 'true') changed = pages.map(p => SITE + p.url);
    else {
      const live = await (await fetch(SITE + '/sitemap.xml', { headers: { 'Cache-Control': 'no-cache' } })).text();
      const seen = new Set([...live.matchAll(/<loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/g)].map(m => m[1] + '|' + m[2]));
      changed = pages.filter(p => !seen.has(SITE + p.url + '|' + (p.mod || now)) && !(p.freq === 'hourly' && seen.has(SITE + p.url + '|' + now))).map(p => SITE + p.url);
    }
    fs.writeFileSync(path.join(ROOT, 'indexnow-urls.json'), JSON.stringify(changed.slice(0, 10000)));
    console.log(`IndexNow: ${changed.length} neue/geänderte URLs vorgemerkt (Meldung nach dem Veröffentlichen)`);
  } catch (err) { console.warn('IndexNow-Liste übersprungen:', err.message); }
}
console.log(`Fertig: ${pages.length} Seiten in der Sitemap.`);
