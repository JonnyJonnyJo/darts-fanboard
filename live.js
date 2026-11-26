/* Darts aktuell – Liveticker: Spiele des Tages mit Zwischenständen, aktualisiert sich alle 30 Sekunden.
   Daten: Tabelle matches (sets1/sets2 = Endstand, live_s1/live_s2/live_l1/live_l2 = Zwischenstand). */
(() => {
  const box = document.getElementById('live');
  if (!box) return;
  const LANG = window.DARTS_LANG || 'de';
  const RT = window.DARTS_RT || {};
  const tr = s => RT[s] || s;
  const TX = {
    de: { tz: 'Europe/Berlin', loc: 'de-DE', live: 'LIVE', done: 'Beendet', next: 'Später', sets: 'Sätze', legs: 'Legs im Satz', upd: 'Aktualisiert', none: 'Der Liveticker startet am Freitag, 11. Dezember, um 20:00 Uhr mit dem Eröffnungsabend im Alexandra Palace. Ab dann siehst du hier alle Spiele des Tages mit Zwischenständen und Ergebnissen – die Seite aktualisiert sich von selbst.', noDay: 'An diesem Tag wird nicht gespielt.', err: 'Die Spielstände konnten gerade nicht geladen werden. Neuer Versuch in 30 Sekunden.', session: 'Session', uhr: ' Uhr', today: 'Heute', bo: 'Best of', sched: '/darts-wm-spielplan/', schedT: 'Zum kompletten Spielplan', tipp: '/darts-tippspiel/', tippT: 'Jetzt mittippen' },
    en: { tz: 'Europe/London', loc: 'en-GB', live: 'LIVE', done: 'Finished', next: 'Later', sets: 'Sets', legs: 'Legs in set', upd: 'Updated', none: 'The live ticker starts on Friday 11 December at 7pm UK time with the opening night at Alexandra Palace. From then on you will see every match of the day here with live scores and results – the page updates itself.', noDay: 'No matches on this day.', err: 'The scores could not be loaded right now. Trying again in 30 seconds.', session: 'Session', uhr: '', today: 'Today', bo: 'Best of', sched: '/en/darts-world-championship-schedule/', schedT: 'Full schedule', tipp: '/en/darts-predictor/', tippT: 'Make your picks' },
    nl: { tz: 'Europe/Amsterdam', loc: 'nl-NL', live: 'LIVE', done: 'Afgelopen', next: 'Later', sets: 'Sets', legs: 'Legs in de set', upd: 'Bijgewerkt', none: 'De liveticker start op vrijdag 11 december om 20:00 uur met de openingsavond in Alexandra Palace. Vanaf dan zie je hier alle partijen van de dag met tussenstanden en uitslagen – de pagina ververst vanzelf.', noDay: 'Op deze dag wordt niet gespeeld.', err: 'De standen konden nu niet worden geladen. Nieuwe poging over 30 seconden.', session: 'Sessie', uhr: ' uur', today: 'Vandaag', bo: 'Best of', sched: '/nl/wk-darts-speelschema/', schedT: 'Compleet speelschema', tipp: '/nl/wk-darts-poule/', tippT: 'Nu voorspellen' }
  }[LANG] || {};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dayOf = iso => new Date(iso).toLocaleDateString('sv-SE', { timeZone: TX.tz });
  const timeOf = iso => new Date(iso).toLocaleTimeString(TX.loc, { hour: '2-digit', minute: '2-digit', timeZone: TX.tz });
  const dayLabel = d => new Date(d + 'T12:00:00Z').toLocaleDateString(TX.loc, { weekday: 'short', day: 'numeric', month: 'short' });
  const C = window.DARTS_CONFIG || {};
  const sb = window.DARTS_SB || (window.supabase && C.supabaseUrl ? window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey) : null);
  let matches = [], day = null, picked = false;

  const state = m => {
    if (m.sets1 != null && m.sets2 != null) return 'done';
    if (Date.now() >= new Date(m.starts_at).getTime() && (m.live_at || Date.now() - new Date(m.starts_at).getTime() < 5 * 3600e3)) return 'live';
    return 'next';
  };
  function render() {
    if (!matches.length) { box.innerHTML = `<p class="lt-empty">${TX.none}</p><p><a class="btn-y" href="${TX.sched}">${TX.schedT}</a> <a class="btn-r" href="${TX.tipp}">${TX.tippT}</a></p>`; return; }
    const days = [...new Set(matches.map(m => dayOf(m.starts_at)))].sort();
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: TX.tz });
    if (!picked || !days.includes(day)) day = days.includes(today) ? today : (days.find(d => d > today) || days[days.length - 1]);
    const rows = matches.filter(m => dayOf(m.starts_at) === day);
    const liveCount = matches.filter(m => state(m) === 'live').length;
    let last = '';
    const list = rows.map(m => {
      const st = state(m), t = timeOf(m.starts_at);
      const head = t !== last ? `<li class="lt-sess">${TX.session} ${t}${TX.uhr} · ${esc(tr(m.round))} · ${TX.bo} ${m.best_of}</li>` : ''; last = t;
      const s1 = st === 'done' ? m.sets1 : m.live_s1, s2 = st === 'done' ? m.sets2 : m.live_s2;
      const w1 = st === 'done' && m.sets1 > m.sets2, w2 = st === 'done' && m.sets2 > m.sets1;
      const score = s1 != null && s2 != null ? `${s1}:${s2}` : st === 'live' ? '0:0' : '–:–';
      const legs = st === 'live' && m.live_l1 != null && m.live_l2 != null ? `<span class="lt-legs" title="${TX.legs}">${m.live_l1}:${m.live_l2}</span>` : '';
      const badge = st === 'live' ? `<span class="lt-badge live">${TX.live}</span>` : st === 'done' ? `<span class="lt-badge done">${TX.done}</span>` : `<span class="lt-badge next">${t}</span>`;
      const note = st === 'live' && m.live_note ? `<span class="lt-note">${esc(m.live_note)}</span>` : '';
      return `${head}<li class="lt-m ${st}"><span class="lt-p1${w1 ? ' win' : ''}">${esc(m.player1)}</span><span class="lt-sc">${score}${legs}</span><span class="lt-p2${w2 ? ' win' : ''}">${esc(m.player2)}</span>${badge}${note}</li>`;
    }).join('');
    const upd = matches.reduce((a, m) => m.live_at && m.live_at > a ? m.live_at : a, '');
    box.innerHTML = `<div class="days scroll lt-days" role="group">${days.map(d => `<button type="button" class="dchip${d === day ? ' on' : ''}" data-d="${d}">${d === today ? TX.today : dayLabel(d)}</button>`).join('')}</div>`
      + (liveCount ? `<p class="lt-livecount"><span class="lt-dot"></span>${liveCount} ${TX.live}</p>` : '')
      + `<ol class="lt-list">${list || `<li class="lt-sess">${TX.noDay}</li>`}</ol>`
      + (upd ? `<p class="note">${TX.upd}: ${new Date(upd).toLocaleString(TX.loc, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TX.tz })}${TX.uhr}</p>` : '');
  }
  box.addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) { day = b.dataset.d; picked = true; render(); } });
  async function load() {
    if (!sb) { render(); return; }
    const { data, error } = await sb.from('matches').select('*').order('starts_at');
    if (error) { box.insertAdjacentHTML('afterbegin', `<p class="note">${TX.err}</p>`); return; }
    matches = data || []; render();
  }
  load();
  setInterval(() => { if (!document.hidden) load(); }, 30000);
})();
