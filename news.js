/* Darts-News, Turnierkalender, Paarungen & Ergebnisse
   Die Inhalte kommen aus der Supabase-Datenbank (Tabellen news, events, winners, matches, site_status).
   Ein geplanter Claude-Auftrag hält sie automatisch aktuell (siehe CLAUDE-UPDATE.md).
   Ist die Datenbank nicht erreichbar, springen die Dateien in data/ als Reserve ein. */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = u => /^https?:\/\//i.test(String(u || '')) ? String(u) : '';
  const TZ = 'Europe/Berlin';
  const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
  const dayOf = iso => new Date(iso).toLocaleDateString('sv-SE', { timeZone: TZ });
  const fmtDay = iso => { const [, m, d] = iso.split('-'); return `${+d}.${+m}.`; };
  const span = (a, b) => a === b ? fmtDay(a) : (a.slice(0, 7) === b.slice(0, 7) ? `${+a.slice(8)}.–${fmtDay(b)}` : `${fmtDay(a)}–${fmtDay(b)}`);
  const load = f => fetch(f, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });

  let fileNews = [];

  /* ---------- News ---------- */
  const slugify = s => String(s).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '');
  const link = n => `<a href="/news/${n.slug || slugify(n.title) || 'news'}/">${esc(n.title)}</a>`;
  function card(n, lead) {
    const u = safeUrl(n.url);
    const src = u ? `<span class="src">Quelle: <a href="${esc(u)}" rel="noopener" target="_blank">${esc(n.source || 'Link')}</a></span>` : '';
    const meta = `<div class="meta"><span class="tag">${esc(n.tag)}</span><span class="when">${esc(n.when)}</span></div>`;
    return lead ? `${meta}<h2>${link(n)}</h2><p>${esc(n.teaser)}</p>${src}`
                : `<article class="ncard">${meta}<h3>${link(n)}</h3><p>${esc(n.teaser)}</p>${src}</article>`;
  }
  function renderNews() {
    if (!$('newsLead')) return;
    const all = [...fileNews].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!all.length) { $('newsLead').innerHTML = '<h2>News werden geladen …</h2>'; return; }
    const li = Math.max(0, all.findIndex(n => n.top));
    $('newsLead').innerHTML = card(all[li], true);
    $('newsList').innerHTML = all.filter((_, i) => i !== li).slice(0, 6).map(n => card(n, false)).join('');
  }

  /* ---------- Kalender & Sieger ---------- */
  let events = [], winners = [], showAll = false;
  function renderCalendar() {
    if (!$('calNext')) return;
    const t = today(), upcoming = events.filter(e => e.end >= t).sort((a, b) => a.start.localeCompare(b.start));
    const list = showAll ? upcoming : upcoming.slice(0, 7);
    $('calNext').innerHTML = list.map(e => {
      const live = e.start <= t && t <= e.end;
      const badge = live ? '<span class="badge live">Läuft</span>' : e.flag === 'new' ? '<span class="badge new">Neu</span>' : e.flag === 'wm' ? '<span class="badge wm">WM</span>' : '';
      const yr = e.start.slice(0, 4) !== t.slice(0, 4) ? ` <small>${e.start.slice(0, 4)}</small>` : '';
      return `<li${live ? ' class="on"' : ''}><span class="dt">${span(e.start, e.end)}${yr}</span><span><span class="nm">${esc(e.name)}</span><br><span class="ort">${esc(e.location)}</span></span>${badge}</li>`;
    }).join('') || '<li><span class="nm">Neue Termine folgen.</span></li>';
    $('calMore').hidden = upcoming.length <= 7;
    $('calMore').textContent = showAll ? 'Weniger anzeigen' : `Alle ${upcoming.length} Termine`;
    const season = winners.reduce((m, w) => Math.max(m, w.season || 0), 0);
    $('calSeason').textContent = season ? `Sieger ${season}` : 'Sieger';
    $('calWin').innerHTML = winners.filter(w => w.season === season).map(w => `<tr><td>${esc(w.tournament)}</td><td><b>${esc(w.winner)}</b></td><td>${esc(w.final || '')}</td></tr>`).join('');
  }
  if ($('calMore')) $('calMore').addEventListener('click', () => { showAll = !showAll; renderCalendar(); });

  /* ---------- Paarungen & Ergebnisse (WM) ---------- */
  let matches = [], day = null;
  function renderMatches() {
    const box = $('wmGames');
    if (!box) return;
    if (!matches.length) { box.hidden = true; return; }
    box.hidden = false;
    const days = [...new Set(matches.map(m => dayOf(m.starts_at)))].sort();
    const t = today();
    if (!day || !days.includes(day)) day = days.find(d => d >= t) || days[days.length - 1];
    $('wmDays').innerHTML = days.map(d => {
      const wd = new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short' });
      return `<button type="button" class="dchip${d === day ? ' on' : ''}" data-day="${d}" aria-pressed="${d === day}">${wd} ${fmtDay(d)}</button>`;
    }).join('');
    const rows = matches.filter(m => dayOf(m.starts_at) === day).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    let lastTime = '';
    $('wmList').innerHTML = rows.map(m => {
      const time = new Date(m.starts_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
      const head = time !== lastTime ? `<li class="sess">${time} Uhr · ${esc(m.round)} · Best of ${m.best_of}</li>` : ''; lastTime = time;
      const done = m.sets1 != null && m.sets2 != null;
      const w1 = done && m.sets1 > m.sets2, w2 = done && m.sets2 > m.sets1;
      return `${head}<li class="gm"><span class="p1${w1 ? ' win' : ''}">${esc(m.player1)}</span><span class="sc">${done ? `${m.sets1}:${m.sets2}` : '–:–'}</span><span class="p2${w2 ? ' win' : ''}">${esc(m.player2)}</span></li>`;
    }).join('');
  }
  if ($('wmDays')) $('wmDays').addEventListener('click', e => { const d = e.target.closest('[data-day]'); if (d) { day = d.dataset.day; renderMatches(); } });

  /* ---------- Laden: zuerst aus der Datenbank, sonst aus data/*.json ---------- */
  const C = window.DARTS_CONFIG;
  const sb = window.DARTS_SB || (window.supabase && C && C.supabaseUrl && C.supabaseAnonKey ? window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey) : null);
  const fromDb = async () => {
    const [n, e, w, m, s] = await Promise.all([
      sb.from('news').select('*').order('published_at', { ascending: false }).order('id', { ascending: false }).limit(30),
      sb.from('events').select('*').order('starts_on'),
      sb.from('winners').select('*').order('id'),
      sb.from('matches').select('*').order('starts_at'),
      sb.from('site_status').select('*').eq('id', 1).maybeSingle()
    ]);
    if (n.error || !n.data || !n.data.length) throw new Error('keine News in der Datenbank');
    return {
      news: n.data.map(r => ({ slug: r.slug, top: r.is_top, tag: r.tag, title: r.title, teaser: r.teaser, url: r.url, source: r.source, date: r.published_at,
        when: r.when_label || new Date(r.published_at + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }) })),
      events: (e.data || []).map(r => ({ start: r.starts_on, end: r.ends_on, name: r.name, location: r.location, flag: r.flag })),
      winners: w.data || [],
      matches: (m.data || []).map(r => ({ key: r.ext_key, round: r.round, starts_at: r.starts_at, player1: r.player1, player2: r.player2, best_of: r.best_of, sets1: r.sets1, sets2: r.sets2 })),
      updated: s.data && s.data.updated_at
    };
  };
  const fromFiles = async () => {
    const [n, e, m] = await Promise.all([load('/data/news.json'), load('/data/events.json'), load('/data/matches.json')]);
    return { news: n.items || [], events: e.upcoming || [], winners: e.winners || [], matches: m.matches || [], updated: n.updated };
  };
  const refresh = async (first) => {
    let d = null;
    if (sb) { try { d = await fromDb(); } catch (err) { d = null; } }
    if (!d && first) { try { d = await fromFiles(); } catch (err) { d = null; } }
    if (!d) { if (first && $('newsLead') && !$('newsLead').children.length) $('newsLead').innerHTML = '<h2>News konnten gerade nicht geladen werden.</h2><p>Bitte später noch einmal versuchen.</p>'; return; }
    fileNews = d.news; events = d.events; winners = d.winners; matches = d.matches;
    if (d.updated && $('newsUpdated')) $('newsUpdated').textContent = 'Aktualisiert: ' + new Date(d.updated).toLocaleString('de-DE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ }) + ' Uhr';
    renderNews(); renderCalendar(); renderMatches();
  };
  refresh(true);
  // Während des Turniers alle 5 Minuten neu laden
  setInterval(() => refresh(false), 300000);
})();
