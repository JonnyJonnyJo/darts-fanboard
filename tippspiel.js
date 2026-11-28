/* Darts-WM 2026/27 – Tippspiel im Kicktipp-Stil (Supabase oder Demo-Modus)
   Reiter: Tippabgabe · Tippübersicht · Tabelle · Bonusfragen · Tipprunden · Regeln */
(() => {
  const CFG = window.DARTS_CONFIG || {};
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // Ältere Login-Links: ".../#tippspiel#access_token=..." → Token-Teil freilegen, damit die Anmeldung erkannt wird
  const AUTH_RE = /(access_token|error_description|error)=/;
  if (/#[^#]*#/.test(location.hash) && AUTH_RE.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + '#' + location.hash.split('#').pop());
  const authError = AUTH_RE.test(location.hash) && /error/.test(location.hash) ? new URLSearchParams(location.hash.slice(1)) : null;
  const cameFromLink = /access_token=/.test(location.hash) || /[?&]code=/.test(location.search);
  const LIVE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase);
  const sb = LIVE ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey) : null;
  window.DARTS_SB = sb;
  if (!$('ktPanel')) return;

  const TZ = 'Europe/Berlin';
  const dayOf = iso => new Date(iso).toLocaleDateString('sv-SE', { timeZone: TZ });
  const dayLabel = (d, long) => new Date(d + 'T12:00:00').toLocaleDateString('de-DE', long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'numeric' });
  const timeOf = iso => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  const fmt = d => new Date(d).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ });
  const isOpen = d => Date.now() < new Date(d).getTime();
  const last = n => String(n || '').trim().split(/\s+/).pop();
  // Punkte wie in der Datenbank (public.tip_points): exakt 4, Sieger + Satzdifferenz knapp daneben 3, Sieger 2
  const pts = (t1, t2, r1, r2) => {
    if ([t1, t2, r1, r2].some(v => v == null)) return null;
    if (t1 === r1 && t2 === r2) return 4;
    if (Math.sign(t1 - t2) !== Math.sign(r1 - r2)) return 0;
    return Math.abs((t1 - t2) - (r1 - r2)) === 1 ? 3 : 2;
  };

  let user = null, profile = null, questions = [], matches = [], board = [], myM = {}, myB = {}, busy = false;
  let remind = null, groups = [], groupsOk = true, view = '', viewBoard = null, invite = null, overview = [];
  const TAB_KEYS = ['tipp','uebersicht','tabelle','bonus','runden','regeln'];
  let tab = TAB_KEYS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'tipp', tipDay = null, ovDay = null;
  const INVITE_URL = c => `${location.origin}/darts-tippspiel/?runde=${c}`;
  const pend = { get(){ try { return localStorage.getItem('tippRunde') || ''; } catch(e){ return ''; } }, set(v){ try { v ? localStorage.setItem('tippRunde', v) : localStorage.removeItem('tippRunde'); } catch(e){} } };
  { const c = new URLSearchParams(location.search).get('runde'); if (c && /^[A-Za-z2-9]{8}$/.test(c)) pend.set(c.toUpperCase()); }
  try { view = localStorage.getItem('tippView') || ''; } catch (e) {}

  /* ---------- Demo-Modus ---------- */
  const DEMO_LOCK = '2026-12-11T20:00:00+01:00';
  const ROUNDS = ['1. Runde','2. Runde','3. Runde','Achtelfinale','Viertelfinale','Halbfinale','Finale','Weltmeister'];
  const DEMO_Q = [
    {id:1, question:'Wer wird Weltmeister?', points:10, kind:'text', locks_at:DEMO_LOCK},
    {id:2, question:'Wer wird Vize-Weltmeister?', points:6, kind:'text', locks_at:DEMO_LOCK},
    {id:3, question:'Wie weit kommt Titelverteidiger Luke Littler?', points:5, kind:'select', options:ROUNDS, locks_at:DEMO_LOCK},
    {id:4, question:'Wie weit kommt der beste deutsche Spieler?', points:5, kind:'select', options:ROUNDS, locks_at:DEMO_LOCK},
    {id:5, question:'Wie viele 9-Darter fallen im ganzen Turnier?', points:5, kind:'number', locks_at:DEMO_LOCK}
  ];
  const store = {
    get(){ try { return JSON.parse(localStorage.getItem('tippDemo')) || {}; } catch(e){ return {}; } },
    set(v){ try { localStorage.setItem('tippDemo', JSON.stringify(v)); } catch(e){} }
  };
  const say = (t, bad) => { const m = $('tMsg'); if (!m) return; m.textContent = t; m.style.color = bad ? 'var(--red)' : 'var(--green)'; };

  /* ---------- Laden ---------- */
  async function loadPublic() {
    if (!LIVE) { questions = DEMO_Q; matches = []; const d = store.get(); board = d.name ? [{rank:1, display_name:d.name, points:0, exact_hits:0, winner_hits:0, bonus_points:0, tips:Object.keys(d.b||{}).length}] : []; return; }
    const [q, m, l] = await Promise.all([
      sb.from('bonus_questions').select('*').order('sort'),
      sb.from('matches').select('*').order('starts_at'),
      sb.rpc('leaderboard')
    ]);
    if (q.error || m.error || l.error) throw (q.error || m.error || l.error);
    questions = q.data; matches = m.data; board = l.data;
  }
  async function loadMine() {
    myM = {}; myB = {};
    if (!LIVE) { const d = store.get(); profile = d.name ? {display_name:d.name} : null; myB = d.b || {}; myM = d.m || {}; return; }
    if (!user) { profile = null; groups = []; return; }
    const [p, mt, bt] = await Promise.all([
      sb.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      sb.from('match_tips').select('*').eq('user_id', user.id),
      sb.from('bonus_tips').select('*').eq('user_id', user.id)
    ]);
    profile = p.data || null;
    try { const rp = await sb.from('reminder_prefs').select('enabled').eq('user_id', user.id).maybeSingle(); remind = rp.data ? rp.data.enabled : false; } catch (e) { remind = null; }
    (mt.data || []).forEach(t => myM[t.match_id] = { sets1: t.sets1, sets2: t.sets2 });
    (bt.data || []).forEach(t => myB[t.question_id] = t.value);
    if (profile) {
      const pc = pend.get();
      if (pc) { const j = await sb.rpc('join_tip_group', { p_code: pc }); pend.set(''); if (!j.error) { say(`Du bist jetzt in der Tipprunde „${j.data}“.`); setView(pc); } else say(j.error.message, true); }
      const g = await sb.rpc('my_tip_groups'); groupsOk = !g.error; groups = g.data || [];
    } else groups = [];
  }
  async function loadInvite() {
    const pc = pend.get(); invite = null;
    if (!LIVE || !pc || profile) return;
    const r = await sb.rpc('tip_group_info', { p_code: pc });
    if (!r.error && r.data && r.data[0]) invite = { code: pc, ...r.data[0] }; else pend.set('');
  }
  async function loadView() {
    viewBoard = null;
    if (!LIVE) return;
    if (view && !groups.some(g => g.code === view)) setView('');
    if (view) { const r = await sb.rpc('group_leaderboard', { p_code: view }); if (!r.error) viewBoard = r.data; }
    if (matches.some(m => !isOpen(m.starts_at))) {
      const o = await sb.rpc('tip_overview', view ? { p_code: view } : {});
      if (!o.error) overview = o.data || [];
    } else overview = [];
  }
  async function refresh() {
    try { await loadPublic(); await loadMine(); await loadInvite(); await loadView(); }
    catch (e) { say('Daten konnten nicht geladen werden: ' + (e.message || e), true); }
    render();
  }
  function setView(v) { view = v || ''; try { localStorage.setItem('tippView', view); } catch (e) {} }

  /* ---------- Hilfen ---------- */
  const days = () => [...new Set(matches.map(m => dayOf(m.starts_at)))].sort();
  const startedDays = () => days().filter(d => matches.some(m => dayOf(m.starts_at) === d && !isOpen(m.starts_at)));
  const viewName = () => view ? (groups.find(g => g.code === view) || {}).name || 'Tipprunde' : 'Alle Mitspieler';
  const myName = () => profile && profile.display_name;
  const dayChips = (list, cur, attr) => list.length > 1 ? `<div class="kt-days">${list.map(d => `<button type="button" class="dchip${d === cur ? ' on' : ''}" ${attr}="${d}" aria-pressed="${d === cur}">${dayLabel(d)}</button>`).join('')}</div>` : '';
  const needLogin = () => !profile ? `<p class="tneed">${LIVE && user ? 'Wähle oben noch deinen Spielernamen, dann kannst du tippen.' : 'Zum Tippen bitte oben <a href="#tAccount">anmelden</a> – kostenlos, ohne Passwort.'}</p>` : '';
  const pcls = p => p == null ? '' : ` p${p}`;
  const G_ICON = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  const A_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.7-1-2.7-4.1zM13.9 5c.7-.9 1.2-2 1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5z"/></svg>';

  /* ---------- Konto ---------- */
  function renderAccount() {
    const a = $('tAccount');
    if (!LIVE && !profile) {
      a.innerHTML = `<form id="tName" class="trow"><label for="tN">Dein Spielername</label><input id="tN" maxlength="24" minlength="2" required placeholder="z. B. Treble20Tom"><button class="btn-r" type="submit">Mitspielen</button></form>`;
    } else if (LIVE && !user) {
      const prov = (CFG.oauth || []).map(p => `<button class="tsocial tsocial-${p}" type="button" data-oauth="${p}">${p === 'google' ? G_ICON + 'Mit Google anmelden' : A_ICON + 'Mit Apple anmelden'}</button>`).join('');
      a.innerHTML = (invite ? `<p class="tinvite">Du bist zur Tipprunde <b>${esc(invite.name)}</b> eingeladen (${invite.members} Mitspieler). Melde dich an – danach bist du automatisch dabei.</p>` : '')
        + (prov ? `<div class="tsocials">${prov}</div><p class="note tor">oder per E-Mail-Link:</p>` : '')
        + `<form id="tLogin" class="trow"><label for="tE">E-Mail für deinen Login-Link</label><input id="tE" type="email" required autocomplete="email" placeholder="name@beispiel.de"><button class="btn-r" type="submit">Link senden</button></form><p class="note">Kein Passwort nötig. Mit der Anmeldung akzeptierst du die <a href="/teilnahmebedingungen.html">Teilnahmebedingungen</a> und die <a href="/datenschutz.html">Datenschutzerklärung</a>.</p>`;
    } else if (LIVE && !profile) {
      a.innerHTML = `<form id="tName" class="trow"><label for="tN">Wähle deinen Spielernamen für die Tabelle</label><input id="tN" maxlength="24" minlength="2" required><button class="btn-r" type="submit">Speichern</button></form>`;
    } else {
      const open = matches.filter(m => isOpen(m.starts_at)), missing = open.filter(m => !myM[m.id]).length;
      const me = (view && viewBoard ? viewBoard : board).find(r => r.display_name === myName());
      a.innerHTML = `<div class="kt-me"><div class="kt-who"><span class="note">Angemeldet als</span><b>${esc(profile.display_name)}</b></div>
        ${me ? `<div class="kt-stat"><b>${me.rank}.</b><span>Platz</span></div><div class="kt-stat"><b>${me.points}</b><span>Punkte</span></div>` : ''}
        ${open.length ? `<div class="kt-stat${missing ? ' warn' : ''}"><b>${missing}</b><span>ohne Tipp</span></div>` : ''}
        ${me ? '<button class="tbtn" id="tShareImg" type="button">📸 Platz teilen</button>' : ''}
        <button class="tbtn" id="tOut" type="button">${LIVE ? 'Abmelden' : 'Name ändern'}</button></div>
        ${LIVE && user && remind !== null ? `<label class="kt-remind"><input type="checkbox" id="tRemind"${remind ? ' checked' : ''}> E-Mail-Erinnerung am Morgen jedes WM-Spieltags, falls noch Tipps fehlen</label>` : ''}`;
    }
    const box = $('tRundeBox');
    if (box) {
      box.hidden = !groups.length;
      $('tRunde').innerHTML = `<option value="">Alle Mitspieler</option>` + groups.map(g => `<option value="${esc(g.code)}"${g.code === view ? ' selected' : ''}>${esc(g.name)} (${g.members})</option>`).join('');
    }
  }

  /* ---------- Reiter ---------- */
  const TABS = [['tipp', 'Tippabgabe'], ['uebersicht', 'Tippübersicht'], ['tabelle', 'Tabelle'], ['bonus', 'Bonusfragen'], ['runden', 'Tipprunden'], ['regeln', 'Regeln']];
  function renderTabs() {
    $('ktTabs').innerHTML = TABS.map(([k, l]) => `<button type="button" role="tab" class="kt-tab${k === tab ? ' on' : ''}" data-tab="${k}" aria-selected="${k === tab}">${l}</button>`).join('');
  }

  function panelTipp() {
    if (!matches.length) return needLogin() + `<p class="note">Die Paarungen werden nach der Auslosung (Mo 30.11.) eingetragen. Dann tippst du hier Spieltag für Spieltag: exakt 4 Punkte, knapp daneben 3, richtiger Sieger 2.</p><p><button class="tbtn" type="button" data-tab="bonus">Jetzt schon die Bonusfragen tippen →</button></p>`;
    const ds = days();
    if (!tipDay || !ds.includes(tipDay)) tipDay = ds.find(d => matches.some(m => dayOf(m.starts_at) === d && isOpen(m.starts_at))) || ds[ds.length - 1];
    const rows = matches.filter(m => dayOf(m.starts_at) === tipDay);
    let lastHead = '';
    const body = rows.map(m => {
      const need = (m.best_of + 1) / 2, t = myM[m.id], open = isOpen(m.starts_at), dis = (!profile || !open) ? 'disabled' : '';
      const head = `${timeOf(m.starts_at)} Uhr · ${m.round} · Best of ${m.best_of} Sätze`;
      const h = head !== lastHead ? `<div class="kt-sess">${esc(head)}</div>` : ''; lastHead = head;
      const done = m.sets1 != null && m.sets2 != null, p = done && t ? pts(t.sets1, t.sets2, m.sets1, m.sets2) : null;
      const status = done ? `<span class="kt-res">${m.sets1}:${m.sets2}</span>${t ? `<span class="kt-pts${pcls(p)}">+${p}</span>` : ''}` : open ? `<span class="kt-saved" id="ok${m.id}">${t ? '✓' : ''}</span>` : '<span class="note">läuft</span>';
      return `${h}<div class="kt-row${open ? '' : ' closed'}"><span class="kt-p1">${esc(m.player1)}</span>
        <span class="kt-in"><input aria-label="Sätze ${esc(m.player1)}" data-m="${m.id}" data-s="1" type="number" inputmode="numeric" min="0" max="${need}" value="${t ? t.sets1 : ''}" ${dis}><b>:</b><input aria-label="Sätze ${esc(m.player2)}" data-m="${m.id}" data-s="2" type="number" inputmode="numeric" min="0" max="${need}" value="${t ? t.sets2 : ''}" ${dis}></span>
        <span class="kt-p2">${esc(m.player2)}</span><span class="kt-st">${status}</span></div>`;
    }).join('');
    const anyOpen = rows.some(m => isOpen(m.starts_at));
    return needLogin() + dayChips(ds, tipDay, 'data-tday') + `<h3 class="kt-h">${dayLabel(tipDay, true)}</h3><div class="kt-list">${body}</div>`
      + (profile && anyOpen ? `<div class="kt-save"><button class="btn-r" id="ktSave" type="button">Tipps speichern</button><span class="note">Tippschluss ist jeweils der Anwurf.</span></div>` : '');
  }

  function panelUebersicht() {
    const sd = startedDays();
    if (!sd.length) return `<p class="note">Hier siehst du die Tipps aller Mitspieler – sichtbar, sobald das jeweilige Spiel angepfiffen ist. Spieltag für Spieltag, wie bei Kicktipp.</p>`;
    if (!ovDay || !sd.includes(ovDay)) ovDay = sd[sd.length - 1];
    const ms = matches.filter(m => dayOf(m.starts_at) === ovDay && !isOpen(m.starts_at));
    const names = [...new Set(overview.map(o => o.display_name))];
    const by = {}; overview.forEach(o => { (by[o.display_name] = by[o.display_name] || {})[o.match_id] = o; });
    const rows = names.map(n => {
      let sum = 0;
      const cells = ms.map(m => { const o = (by[n] || {})[m.id]; if (o && o.points != null) sum += o.points; return `<td class="c${o ? pcls(o.points) : ''}">${o ? `${o.sets1}:${o.sets2}${o.points != null ? `<sup>${o.points}</sup>` : ''}` : '–'}</td>`; }).join('');
      return { n, sum, html: cells };
    }).filter(r => ms.some(m => (by[r.n] || {})[m.id])).sort((a, b) => b.sum - a.sum || a.n.localeCompare(b.n));
    return `<p class="note">${esc(viewName())}${view ? '' : ' (Top 50)'} · Tipps werden mit dem Anwurf sichtbar.</p>` + dayChips(sd, ovDay, 'data-oday')
      + `<div class="kt-scroll"><table class="kt-ov"><thead><tr><th class="sticky">Spieler</th>${ms.map(m => `<th title="${esc(m.player1)} – ${esc(m.player2)}">${esc(last(m.player1))}<br>${esc(last(m.player2))}<br><span class="kt-res">${m.sets1 != null ? `${m.sets1}:${m.sets2}` : 'live'}</span></th>`).join('')}<th>Pkt</th></tr></thead>
      <tbody>${rows.map(r => `<tr${r.n === myName() ? ' class="me"' : ''}><td class="sticky">${esc(r.n)}</td>${r.html}<td class="sum">${r.sum}</td></tr>`).join('') || `<tr><td class="note" colspan="${ms.length + 2}">Noch keine Tipps für diesen Spieltag.</td></tr>`}</tbody></table></div>
      <p class="note kt-legend"><span class="c p4">4</span> exakt <span class="c p3">3</span> knapp <span class="c p2">2</span> Sieger <span class="c p0">0</span> daneben</p>`;
  }

  function panelTabelle() {
    const list = view && viewBoard ? viewBoard : board;
    if (!list.length) return `<p class="note">Noch keine Mitspieler – sei die oder der Erste!</p>`;
    // Spieltagspunkte aus der Tippübersicht: Spieltagssieger, Punkte am letzten Spieltag, Bewegung gegenüber vorher
    const done = days().filter(d => matches.some(m => dayOf(m.starts_at) === d && m.sets1 != null));
    const dayPts = {};
    overview.forEach(o => { if (o.points == null) return; const m = matches.find(x => x.id === o.match_id); if (!m) return; const d = dayOf(m.starts_at); const x = dayPts[o.display_name] = dayPts[o.display_name] || {}; x[d] = (x[d] || 0) + o.points; });
    const wins = {};
    done.forEach(d => { const best = Math.max(0, ...Object.values(dayPts).map(x => x[d] || 0)); if (best > 0) Object.entries(dayPts).forEach(([n, x]) => { if ((x[d] || 0) === best) wins[n] = (wins[n] || 0) + 1; }); });
    const lastD = done[done.length - 1];
    const before = list.map(r => ({ n: r.display_name, p: r.points - ((dayPts[r.display_name] || {})[lastD] || 0) })).sort((a, b) => b.p - a.p);
    const prevRank = {}; before.forEach((r, i) => { prevRank[r.n] = i === 0 || r.p !== before[i - 1].p ? i + 1 : prevRank[before[i - 1].n]; });
    const known = n => !view ? Object.prototype.hasOwnProperty.call(dayPts, n) : true;
    return `<p class="note">${esc(viewName())} · ${list.length} Mitspieler${lastD ? ` · letzter Spieltag: ${dayLabel(lastD)}` : ''}</p>
      <div class="kt-scroll"><table class="kt-tab-t"><thead><tr><th class="r">Pl.</th>${lastD ? '<th></th>' : ''}<th>Spieler</th>${lastD ? '<th class="r" title="Punkte am letzten Spieltag">Spieltag</th><th class="r" title="Spieltagssiege">Siege</th>' : ''}<th class="r" title="Exakte Treffer">Exakt</th><th class="r">Bonus</th><th class="r">Punkte</th></tr></thead><tbody>${list.map(r => {
        const mv = lastD && known(r.display_name) ? prevRank[r.display_name] - r.rank : 0;
        const arrow = mv > 0 ? `<span class="up" title="${mv} Plätze besser">▲${mv}</span>` : mv < 0 ? `<span class="down" title="${-mv} Plätze schlechter">▼${-mv}</span>` : '<span class="same">•</span>';
        return `<tr${r.display_name === myName() ? ' class="me"' : ''}><td class="r">${r.rank}.</td>${lastD ? `<td class="mv">${arrow}</td>` : ''}<td>${esc(r.display_name)}</td>${lastD ? `<td class="r">${known(r.display_name) ? (dayPts[r.display_name] || {})[lastD] || 0 : '–'}</td><td class="r">${wins[r.display_name] || ''}</td>` : ''}<td class="r">${r.exact_hits}</td><td class="r">${r.bonus_points}</td><td class="r"><b>${r.points}</b></td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function panelBonus() {
    const can = !!profile;
    const html = questions.map(q => {
      const open = isOpen(q.locks_at), v = myB[q.id] ?? '', dis = (!can || !open) ? 'disabled' : '';
      const opts = Array.isArray(q.options) ? q.options : [];
      const input = q.kind === 'select'
        ? `<select id="bq${q.id}" ${dis}><option value="">Bitte wählen</option>${opts.map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`
        : (() => { // Dropdown auch für Spieler- und Zahlenfragen
            let list = q.kind === 'number' ? Array.from({ length: 16 }, (_, i) => String(i)).concat(['16+'])
              : [...new Set([...matches.flatMap(m => [m.player1, m.player2]), ...[...document.querySelectorAll('#tPlayers option')].map(o => o.value || o.textContent)].filter(n => n && !/^(tbd|tba|offen)$/i.test(n)))];
            if (q.kind !== 'number') list = list.sort((a, b) => a.localeCompare(b, 'de'));
            if (v && !list.includes(v)) list.unshift(v);
            return `<select id="bq${q.id}" ${dis}><option value="">${q.kind === 'number' ? 'Anzahl wählen' : 'Spieler wählen'}</option>${list.map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
          })();
      const res = q.answer ? `<span class="tres">Lösung: ${esc(q.answer.split('|')[0])}</span>` : '';
      return `<div class="tq"><label for="bq${q.id}">${esc(q.question)} <span class="tpts">${q.points} P.</span></label>${input}<span class="note">${open ? 'Tippschluss ' + fmt(q.locks_at) : 'Tippschluss vorbei'}</span>${res}</div>`;
    }).join('');
    return needLogin() + html + `<div class="kt-save"><button class="btn-r" id="tBonusSave" type="button"${!can || !questions.some(q => isOpen(q.locks_at)) ? ' disabled' : ''}>Bonus-Tipps speichern</button></div>`;
  }

  function panelRunden() {
    if (!LIVE) return '<p class="note">Im Demo-Modus nicht verfügbar.</p>';
    if (!groupsOk) return '<p class="note">Tipprunden sind gerade nicht erreichbar.</p>';
    const intro = '<p class="note" style="margin:0 0 12px">Eigene Tabelle mit Freunden, Familie, Kollegen oder Verein: Runde erstellen, Link per WhatsApp teilen, fertig. Alle tippen ganz normal – Tippübersicht und Tabelle zeigen dann nur eure Runde.</p>';
    if (!profile) return intro + (invite ? `<p class="tinvite">Du bist zur Tipprunde <b>${esc(invite.name)}</b> eingeladen. Melde dich oben an – danach bist du automatisch dabei.</p>` : needLogin());
    const share = !!navigator.share;
    return intro + (groups.length ? `<ul class="tglist">${groups.map(g => `<li><div><b>${esc(g.name)}</b><span class="note"> · ${g.members} Mitspieler · Code ${esc(g.code)}</span></div>
      <div class="trow"><button class="tbtn" type="button" data-gshare="${esc(g.code)}" data-gname="${esc(g.name)}">${share ? 'Einladen' : 'Link kopieren'}</button><button class="tbtn" type="button" data-gview="${esc(g.code)}">Tabelle</button><button class="tbtn" type="button" data-gleave="${esc(g.code)}">Verlassen</button></div></li>`).join('')}</ul>` : '')
      + `<form id="tgNew" class="trow"><label for="tgName" class="note" style="flex-basis:100%">Neue Tipprunde</label><input id="tgName" maxlength="40" minlength="3" required placeholder="z. B. Dartclub Oelde"><button class="btn-r" type="submit">Erstellen</button></form>
         <form id="tgJoin" class="trow"><label for="tgCode" class="note" style="flex-basis:100%">Code einer Tipprunde</label><input id="tgCode" maxlength="8" minlength="8" required placeholder="8 Zeichen" style="text-transform:uppercase"><button class="tbtn" type="submit">Beitreten</button></form>`;
  }

  function panelRegeln() {
    return `<ul class="trules">
      <li><b>4 Punkte</b> – exaktes Satzergebnis (Tipp 3:1, Ergebnis 3:1)</li>
      <li><b>3 Punkte</b> – richtiger Sieger, Satzdifferenz nur um 1 daneben (Tipp 3:1, Ergebnis 3:2 oder 3:0)</li>
      <li><b>2 Punkte</b> – richtiger Sieger (Tipp 3:0, Ergebnis 3:2)</li>
      <li><b>0 Punkte</b> – falscher Sieger</li>
      <li><b>Bonusfragen</b> – Punkte laut Frage, Tippschluss zum Turnierstart am 11.12. um 20:00 Uhr</li>
      <li><b>Tippschluss</b> – bei jedem Spiel der Anwurf. Danach sind alle Tipps in der Tippübersicht sichtbar.</li>
      <li><b>Gleichstand</b> – mehr exakte Treffer liegen vorne</li>
      <li><b>Spieltagssieger</b> – wer an einem WM-Tag die meisten Punkte holt</li></ul>
      <p class="note" style="margin:0">Teilnahme kostenlos, kein Einsatz, keine Gewinne. <a href="/teilnahmebedingungen.html">Teilnahmebedingungen</a></p>`;
  }

  function renderPanel() {
    const P = { tipp: panelTipp, uebersicht: panelUebersicht, tabelle: panelTabelle, bonus: panelBonus, runden: panelRunden, regeln: panelRegeln };
    $('ktPanel').innerHTML = (P[tab] || panelTipp)();
  }
  function render() { $('tMode').hidden = LIVE; renderAccount(); renderTabs(); renderPanel(); }

  /* ---------- Aktionen ---------- */
  async function shareGroup(code, name) {
    const url = INVITE_URL(code), text = `Tipp mit mir die Darts-WM 2026/27 in unserer Tipprunde „${name}“ – kostenlos:`;
    if (navigator.share) { try { await navigator.share({ title: 'Darts-WM Tipprunde', text, url }); } catch (e) {} return; }
    try { await navigator.clipboard.writeText(`${text} ${url}`); say('Einladungslink kopiert – jetzt z. B. in WhatsApp einfügen.'); }
    catch (e) { prompt('Diesen Link teilen:', url); }
  }

  async function shareImage() {
    const me = (view && viewBoard ? viewBoard : board).find(r => r.display_name === myName()); if (!me) return;
    const total = (view && viewBoard ? viewBoard : board).length, league = viewName();
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 1350); g.addColorStop(0, '#0b4426'); g.addColorStop(1, '#06301b'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
    [[540, 470, 360, '#0b4426'], [540, 470, 300, '#efe3c4'], [540, 470, 230, '#0b4426'], [540, 470, 170, '#efe3c4']].forEach(([cx, cy, r, f]) => { x.globalAlpha = .12; x.fillStyle = f; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); });
    x.globalAlpha = 1; x.textAlign = 'center'; const F = 'Oswald, Impact, Arial Narrow, sans-serif';
    x.fillStyle = '#f3c63f'; x.font = `700 46px ${F}`; x.fillText('MEIN PLATZ IM DARTS-WM TIPPSPIEL', 540, 130);
    x.fillStyle = '#ffffff'; x.font = `600 40px ${F}`; x.fillText(league.length > 34 ? league.slice(0, 33) + '…' : league, 540, 200);
    x.fillStyle = '#ffffff'; x.font = `700 300px ${F}`; x.fillText(me.rank + '.', 540, 570);
    x.fillStyle = '#efe3c4'; x.font = `500 44px ${F}`; x.fillText(`von ${total} Tippern`, 540, 650);
    x.fillStyle = '#e1262f'; x.beginPath(); x.roundRect ? x.roundRect(300, 720, 480, 130, 65) : x.rect(300, 720, 480, 130); x.fill();
    x.fillStyle = '#fff'; x.font = `700 76px ${F}`; x.fillText(`${me.points} Punkte`, 540, 812);
    x.fillStyle = '#ffffff'; x.font = `600 52px ${F}`; x.fillText(me.display_name, 540, 960);
    x.fillStyle = '#efe3c4'; x.font = `400 36px ${F}`; x.fillText(`${me.exact_hits} exakte Treffer · ${me.bonus_points} Bonuspunkte`, 540, 1020);
    x.fillStyle = '#f3c63f'; x.font = `700 44px ${F}`; x.fillText('Tipp mit: dartsaktuell.com/darts-tippspiel', 540, 1220);
    x.fillStyle = 'rgba(255,255,255,.6)'; x.font = `400 26px ${F}`; x.fillText('Darts-WM 2026/27 · inoffizielle Fanseite', 540, 1280);
    const blob = await new Promise(r => c.toBlob(r, 'image/png')); if (!blob) return;
    const file = new File([blob], 'mein-platz-darts-tippspiel.png', { type: 'image/png' });
    const text = `Ich bin ${me.rank}. von ${total} im Darts-WM Tippspiel (${league}) – tipp mit:`, url = location.origin + '/darts-tippspiel/';
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], text: `${text} ${url}` }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say('Bild gespeichert – jetzt z. B. in WhatsApp oder Instagram teilen.');
  }
  async function saveRemind(on) {
    const lang = 'de';
    const { error } = await sb.from('reminder_prefs').upsert({ user_id: user.id, enabled: on, lang }, { onConflict: 'user_id' });
    if (error) { say('Speichern fehlgeschlagen: ' + error.message, true); return; }
    remind = on; say(on ? 'Erinnerung an: Du bekommst an WM-Spieltagen morgens eine Mail, wenn Tipps fehlen.' : 'Erinnerung aus.');
  }

  async function saveBonus() {
    if (busy) return; busy = true; say('Speichere …');
    const rows = questions.filter(q => isOpen(q.locks_at)).map(q => ({ q, v: (($('bq' + q.id) || {}).value || '').trim() })).filter(x => x.v !== '');
    try {
      if (!LIVE) { const d = store.get(); d.b = d.b || {}; rows.forEach(x => d.b[x.q.id] = x.v); store.set(d); }
      else if (rows.length) {
        const { error } = await sb.from('bonus_tips').upsert(rows.map(x => ({ user_id: user.id, question_id: x.q.id, value: x.v })), { onConflict: 'user_id,question_id' });
        if (error) throw error;
      }
      busy = false;
      say(rows.length ? `${rows.length} Bonus-Tipps gespeichert.` : 'Noch nichts ausgefüllt.');
      await refresh(); return;
    } catch (e) { say('Speichern fehlgeschlagen: ' + (e.message || e), true); }
    busy = false;
  }

  // Tipps sammeln und prüfen (ein Spiel oder der ganze Spieltag)
  function collectTips(onlyMid) {
    const ok = [], bad = [];
    matches.filter(m => isOpen(m.starts_at) && (onlyMid ? m.id === onlyMid : dayOf(m.starts_at) === tipDay)).forEach(m => {
      const i1 = $('ktPanel').querySelector(`input[data-m="${m.id}"][data-s="1"]`), i2 = $('ktPanel').querySelector(`input[data-m="${m.id}"][data-s="2"]`);
      if (!i1 || !i2 || i1.value === '' || i2.value === '') return;
      const s1 = +i1.value, s2 = +i2.value, need = (m.best_of + 1) / 2;
      const t = myM[m.id]; if (t && t.sets1 === s1 && t.sets2 === s2) return;
      if ((s1 === need && s2 < need) || (s2 === need && s1 < need)) ok.push({ m, s1, s2 });
      else bad.push(`${last(m.player1)} – ${last(m.player2)}: ein Spieler braucht genau ${need} Sätze`);
    });
    return { ok, bad };
  }
  async function saveTips(onlyMid, silent) {
    if (busy || !profile) return;
    const { ok, bad } = collectTips(onlyMid);
    if (bad.length) say(bad.join(' · '), true);
    if (!ok.length) { if (!onlyMid && !bad.length && !silent) say('Keine neuen Tipps zum Speichern.'); return; }
    busy = true;
    try {
      if (!LIVE) { const d = store.get(); d.m = d.m || {}; ok.forEach(x => d.m[x.m.id] = { sets1: x.s1, sets2: x.s2 }); store.set(d); }
      else {
        const { error } = await sb.from('match_tips').upsert(ok.map(x => ({ user_id: user.id, match_id: x.m.id, sets1: x.s1, sets2: x.s2 })), { onConflict: 'user_id,match_id' });
        if (error) throw error;
      }
      ok.forEach(x => { myM[x.m.id] = { sets1: x.s1, sets2: x.s2 }; const s = $('ok' + x.m.id); if (s) s.textContent = '✓'; });
      if (!bad.length) say(ok.length === 1 ? `Tipp ${last(ok[0].m.player1)} ${ok[0].s1}:${ok[0].s2} ${last(ok[0].m.player2)} gespeichert.` : `${ok.length} Tipps gespeichert.`);
      renderAccount();
    } catch (e) { say('Tipps nicht gespeichert: ' + (e.message || e), true); }
    busy = false;
  }

  document.addEventListener('submit', async e => {
    if (e.target.id === 'tLogin') {
      e.preventDefault();
      const email = $('tE').value.trim();
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + '/darts-tippspiel/' } });
      say(error ? 'Link konnte nicht gesendet werden: ' + error.message : `Check dein Postfach: Der Login-Link ist an ${email} unterwegs.`, !!error);
    }
    if (e.target.id === 'tgNew') {
      e.preventDefault();
      const n = $('tgName').value.trim();
      const r = await sb.rpc('create_tip_group', { p_name: n });
      if (r.error) { say(r.error.message, true); return; }
      say(`Tipprunde „${n}“ erstellt. Jetzt Link teilen!`); setView(r.data); await refresh(); shareGroup(r.data, n);
    }
    if (e.target.id === 'tgJoin') {
      e.preventDefault();
      const c = $('tgCode').value.trim().toUpperCase();
      const r = await sb.rpc('join_tip_group', { p_code: c });
      if (r.error) { say(r.error.message, true); return; }
      say(`Du bist jetzt in der Tipprunde „${r.data}“.`); setView(c); tab = 'tabelle'; await refresh();
    }
    if (e.target.id === 'tName') {
      e.preventDefault();
      const n = $('tN').value.trim();
      if (n.length < 2) return;
      if (!LIVE) { const d = store.get(); d.name = n; store.set(d); await refresh(); return; }
      const { error } = await sb.from('profiles').insert({ id: user.id, display_name: n });
      if (error) say(error.code === '23505' ? 'Dieser Name ist schon vergeben.' : 'Fehler: ' + error.message, true);
      await refresh();
    }
  });
  document.addEventListener('click', async e => {
    const t = e.target.closest ? e.target.closest('button') : null; if (!t) return;
    const d = t.dataset || {};
    if (t.id === 'tOut') { if (LIVE) await sb.auth.signOut(); else { const s = store.get(); delete s.name; store.set(s); } await refresh(); return; }
    if (t.id === 'tBonusSave') return saveBonus();
    if (t.id === 'tShareImg') return shareImage();
    if (t.id === 'ktSave') return saveTips();
    if (d.tab) { tab = d.tab; renderTabs(); renderPanel(); if (t.classList.contains('tbtn')) $('ktTabs').scrollIntoView({ block: 'nearest' }); return; }
    if (d.tday) { await saveTips(null, true); tipDay = d.tday; renderPanel(); return; }
    if (d.oday) { ovDay = d.oday; renderPanel(); return; }
    if (d.oauth && LIVE) {
      const { error } = await sb.auth.signInWithOAuth({ provider: d.oauth, options: { redirectTo: location.origin + '/darts-tippspiel/' } });
      if (error) say('Anmeldung nicht möglich: ' + error.message, true);
      return;
    }
    if (d.gshare) return shareGroup(d.gshare, d.gname);
    if (d.gview) { setView(d.gview); tab = 'tabelle'; await loadView(); render(); return; }
    if (d.gleave && confirm('Tipprunde wirklich verlassen? Deine Tipps bleiben erhalten.')) {
      const r = await sb.rpc('leave_tip_group', { p_code: d.gleave });
      if (r.error) say(r.error.message, true); else { if (view === d.gleave) setView(''); say('Tipprunde verlassen.'); await refresh(); }
    }
  });
  document.addEventListener('change', async e => {
    if (e.target.id === 'tRemind' && LIVE && user) { await saveRemind(e.target.checked); return; }
    if (e.target.id === 'tRunde') { setView(e.target.value); await loadView(); render(); return; }
    const m = e.target.dataset && e.target.dataset.m;
    if (m) { // automatisch speichern, sobald beide Felder eines Spiels ausgefüllt sind
      const mid = +m, i1 = $('ktPanel').querySelector(`input[data-m="${mid}"][data-s="1"]`), i2 = $('ktPanel').querySelector(`input[data-m="${mid}"][data-s="2"]`);
      if (i1 && i2 && i1.value !== '' && i2.value !== '') saveTips(mid);
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset && e.target.dataset.m) { e.preventDefault(); saveTips(); } });

  /* ---------- Start ---------- */
  if (authError) say(/expired|invalid/i.test(authError.get('error_code') || authError.get('error_description') || '') ? 'Der Login-Link ist abgelaufen oder wurde schon benutzt. Bitte fordere oben einen neuen an.' : 'Anmeldung fehlgeschlagen: ' + (authError.get('error_description') || 'unbekannter Fehler'), true);
  if (TAB_KEYS.includes(location.hash.slice(1))) setTimeout(() => { const s = $('ktTabs'); if (s) s.scrollIntoView({ block: 'start' }); }, 600);
  if (cameFromLink || authError) setTimeout(() => { const s = $('tAccount'); if (s) s.scrollIntoView({ block: 'center' }); }, 1200);
  if (LIVE) {
    sb.auth.onAuthStateChange((_ev, session) => { const u = session?.user || null; if ((u && u.id) !== (user && user.id)) { user = u; refresh(); } });
    sb.auth.getSession().then(({ data }) => { user = data.session?.user || null; refresh(); });
    setInterval(() => { if (document.hidden) return; loadPublic().then(loadView).then(() => { renderAccount(); if (tab !== 'tipp' && tab !== 'bonus') renderPanel(); }).catch(() => {}); }, 60000);
  } else refresh();
})();
