/* Darts-News, Turnierkalender, Paarungen & Ergebnisse
   Die Inhalte kommen aus data/news.json, data/events.json und data/matches.json.
   Diese Dateien aktualisiert der geplante Claude-Auftrag automatisch (siehe CLAUDE-UPDATE.md).
   Zusätzliche News aus admin.html (Supabase) werden vorne einsortiert. */
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

  let fileNews = [], dbNews = [];

  /* ---------- News ---------- */
  function card(n, lead) {
    const u = safeUrl(n.url);
    const src = u ? `<span class="src">Quelle: <a href="${esc(u)}" rel="noopener" target="_blank">${esc(n.source || 'Link')}</a></span>` : '';
    const meta = `<div class="meta"><span class="tag">${esc(n.tag)}</span><span class="when">${esc(n.when)}</span></div>`;
    return lead ? `${meta}<h2>${esc(n.title)}</h2><p>${esc(n.teaser)}</p>${src}`
                : `<article class="ncard">${meta}<h3>${esc(n.title)}</h3><p>${esc(n.teaser)}</p>${src}</article>`;
  }
  function renderNews() {
    const fromDb = dbNews.map(r => ({ top: r.is_top, tag: r.tag, title: r.title, teaser: r.teaser, url: r.url, source: r.source, date: r.published_at,
      when: new Date(r.published_at + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }) }));
    const all = [...fromDb, ...fileNews].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!all.length) { $('newsLead').innerHTML = '<h2>News werden geladen …</h2>'; return; }
    const li = Math.max(0, all.findIndex(n => n.top));
    $('newsLead').innerHTML = card(all[li], true);
    $('newsList').innerHTML = all.filter((_, i) => i !== li).slice(0, 6).map(n => card(n, false)).join('');
  }

  /* ---------- Kalender & Sieger ---------- */
  let events = [], winners = [], showAll = false;
  function renderCalendar() {
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
  $('calMore').addEventListener('click', () => { showAll = !showAll; renderCalendar(); });

  /* ---------- Paarungen & Ergebnisse (WM) ---------- */
  let matches = [], day = null;
  function renderMatches() {
    const box = $('wmGames');
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
  $('wmDays').addEventListener('click', e => { const d = e.target.closest('[data-day]'); if (d) { day = d.dataset.day; renderMatches(); } });

  /* ---------- Laden ---------- */
  Promise.allSettled([load('data/news.json'), load('data/events.json'), load('data/matches.json')]).then(([n, e, m]) => {
    if (n.status === 'fulfilled') fileNews = n.value.items || [];
    if (e.status === 'fulfilled') { events = e.value.upcoming || []; winners = e.value.winners || []; }
    if (m.status === 'fulfilled') matches = m.value.matches || [];
    const upd = n.status === 'fulfilled' && n.value.updated;
    if (upd) $('newsUpdated').textContent = 'Aktualisiert: ' + new Date(upd).toLocaleString('de-DE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ }) + ' Uhr';
    if (n.status === 'rejected') $('newsLead').innerHTML = '<h2>News konnten gerade nicht geladen werden.</h2><p>Bitte später noch einmal versuchen.</p>';
    else renderNews();
    renderCalendar(); renderMatches();
  });

  const sb = window.DARTS_SB;
  if (sb) sb.from('news').select('*').order('published_at', { ascending: false }).limit(12)
    .then(({ data, error }) => { if (!error && data && data.length) { dbNews = data; renderNews(); } });
  // Ergebnisse während des Turniers alle 5 Minuten neu laden
  setInterval(() => load('data/matches.json').then(m => { matches = m.matches || []; renderMatches(); }).catch(() => {}), 300000);
})();
