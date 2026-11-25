/* Darts-WM 2026/27 – Tippspiel & Rangliste (Supabase oder Demo-Modus) */
(() => {
  const CFG = window.DARTS_CONFIG || {};
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // Ältere Login-Links: ".../#tippspiel#access_token=..." → Token-Teil freilegen, damit die Anmeldung erkannt wird
  const AUTH_RE = /(access_token|error_description|error)=/;
  if (/#[^#]*#/.test(location.hash) && AUTH_RE.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + '#' + location.hash.split('#').pop());
  const authError = AUTH_RE.test(location.hash) && /error/.test(location.hash) ? new URLSearchParams(location.hash.slice(1)) : null;
  const cameFromLink = /access_token=/.test(location.hash);
  const LIVE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase);
  const sb = LIVE ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey) : null;
  window.DARTS_SB = sb;
  const fmt = d => new Date(d).toLocaleString('de-DE', {weekday:'short', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', timeZone:'Europe/Berlin'});
  const isOpen = d => Date.now() < new Date(d).getTime();

  let user = null, profile = null, questions = [], matches = [], board = [], myM = {}, myB = {}, busy = false;
  let groups = [], groupsOk = true, view = '', viewBoard = null, invite = null;
  const INVITE_URL = c => `${location.origin}/darts-tippspiel/?runde=${c}`;
  const pend = { get(){ try { return localStorage.getItem('tippRunde') || ''; } catch(e){ return ''; } }, set(v){ try { v ? localStorage.setItem('tippRunde', v) : localStorage.removeItem('tippRunde'); } catch(e){} } };
  { const c = new URLSearchParams(location.search).get('runde'); if (c && /^[A-Za-z2-9]{8}$/.test(c)) pend.set(c.toUpperCase()); }

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
  const DEMO_BOARD = [
    {rank:1, display_name:'Bullseye_Bine', points:0, exact_hits:0, winner_hits:0, bonus_points:0, tips:5},
    {rank:1, display_name:'Treble20Tom', points:0, exact_hits:0, winner_hits:0, bonus_points:0, tips:4},
    {rank:1, display_name:'AllyPallyAndi', points:0, exact_hits:0, winner_hits:0, bonus_points:0, tips:5}
  ];
  const store = {
    get(){ try { return JSON.parse(localStorage.getItem('tippDemo')) || {}; } catch(e){ return {}; } },
    set(v){ try { localStorage.setItem('tippDemo', JSON.stringify(v)); } catch(e){} }
  };

  const say = (t, bad) => { const m = $('tMsg'); m.textContent = t; m.style.color = bad ? 'var(--red)' : 'var(--green)'; };

  /* ---------- Laden ---------- */
  async function loadPublic() {
    if (!LIVE) { questions = DEMO_Q; matches = []; board = DEMO_BOARD.slice(); const d = store.get(); if (d.name) board.push({rank:1, display_name:d.name+' (du)', points:0, exact_hits:0, winner_hits:0, bonus_points:0, tips:Object.keys(d.b||{}).length}); return; }
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
    if (!user) { profile = null; return; }
    const [p, mt, bt] = await Promise.all([
      sb.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      sb.from('match_tips').select('*').eq('user_id', user.id),
      sb.from('bonus_tips').select('*').eq('user_id', user.id)
    ]);
    profile = p.data || null;
    if (profile) {
      const pc = pend.get();
      if (pc) { const j = await sb.rpc('join_tip_group', { p_code: pc }); pend.set(''); if (!j.error) { say(`Du bist jetzt in der Tipprunde „${j.data}“.`); view = pc; } else say(j.error.message, true); }
      const g = await sb.rpc('my_tip_groups'); groupsOk = !g.error; groups = g.data || [];
    } else groups = [];
    (mt.data || []).forEach(t => myM[t.match_id] = t);
    (bt.data || []).forEach(t => myB[t.question_id] = t.value);
  }
  async function loadInvite() {
    const pc = pend.get(); invite = null;
    if (!LIVE || !pc || profile) return;
    const r = await sb.rpc('tip_group_info', { p_code: pc });
    if (!r.error && r.data && r.data[0]) invite = { code: pc, ...r.data[0] }; else pend.set('');
  }
  async function loadView() {
    viewBoard = null;
    if (!LIVE || !view) return;
    if (!groups.some(g => g.code === view)) { view = ''; return; }
    const r = await sb.rpc('group_leaderboard', { p_code: view });
    if (!r.error) viewBoard = r.data;
  }
  async function refresh() {
    try { await loadPublic(); await loadMine(); await loadInvite(); await loadView(); } catch (e) { say('Daten konnten nicht geladen werden: ' + (e.message || e), true); }
    render();
  }

  /* ---------- Anzeige ---------- */
  function renderAccount() {
    const a = $('tAccount');
    if (!LIVE && !profile) {
      a.innerHTML = `<form id="tName" class="trow"><label for="tN">Dein Spielername</label><input id="tN" maxlength="24" minlength="2" required placeholder="z. B. Treble20Tom"><button class="btn-r" type="submit">Mitspielen</button></form>`;
      return;
    }
    if (LIVE && !user) {
      a.innerHTML = `<form id="tLogin" class="trow"><label for="tE">E-Mail für deinen Login-Link</label><input id="tE" type="email" required autocomplete="email" placeholder="name@beispiel.de"><button class="btn-r" type="submit">Link senden</button></form><p class="note">Kein Passwort nötig: Du bekommst einen Link per E-Mail. Mit der Anmeldung akzeptierst du die <a href="/teilnahmebedingungen.html">Teilnahmebedingungen</a> und die <a href="/datenschutz.html">Datenschutzerklärung</a>.</p>`;
      return;
    }
    if (LIVE && !profile) {
      a.innerHTML = `<form id="tName" class="trow"><label for="tN">Wähle deinen Spielernamen für die Rangliste</label><input id="tN" maxlength="24" minlength="2" required><button class="btn-r" type="submit">Speichern</button></form>`;
      return;
    }
    a.innerHTML = `<div class="trow" style="justify-content:space-between"><span>Angemeldet als <b>${esc(profile.display_name)}</b></span><button class="tbtn" id="tOut" type="button">${LIVE ? 'Abmelden' : 'Name ändern'}</button></div>`;
  }

  const needLogin = () => !profile ? `<p class="tneed">${LIVE && user ? 'Wähle oben noch deinen Spielernamen, dann kannst du tippen.' : 'Zum Tippen bitte oben <a href="#tAccount">anmelden</a> – kostenlos, ohne Passwort.'}</p>` : '';
  function renderBonus() {
    const can = !!profile;
    $('tBonus').innerHTML = needLogin() + questions.map(q => {
      const open = isOpen(q.locks_at), v = myB[q.id] ?? '', dis = (!can || !open) ? 'disabled' : '';
      let input;
      const opts = Array.isArray(q.options) ? q.options : [];
      if (q.kind === 'select') input = `<select id="bq${q.id}" ${dis}><option value="">Bitte wählen</option>${opts.map(o => `<option${o===v?' selected':''}>${esc(o)}</option>`).join('')}</select>`;
      else input = `<input id="bq${q.id}" ${q.kind==='number'?'type="number" min="0" max="99" inputmode="numeric"':'maxlength="60" list="tPlayers"'} value="${esc(v)}" ${dis}>`;
      const res = q.answer ? `<span class="tres">Lösung: ${esc(q.answer.split('|')[0])}</span>` : '';
      return `<div class="tq"><label for="bq${q.id}">${esc(q.question)} <span class="tpts">${q.points} P.</span></label>${input}<span class="note">${open ? 'Tippschluss ' + fmt(q.locks_at) : 'Tippschluss vorbei'}</span>${res}</div>`;
    }).join('');
    $('tBonusSave').disabled = !can || !questions.some(q => isOpen(q.locks_at));
  }

  function renderMatches() {
    const box = $('tMatches');
    if (!matches.length) { box.innerHTML = `<p class="note">Die Paarungen werden nach der Auslosung eingetragen. Dann tippst du hier jedes Spiel: richtiger Sieger 2 Punkte, exaktes Satzergebnis 4 Punkte.</p>`; return; }
    let last = '';
    box.innerHTML = needLogin() + matches.map(m => {
      const need = (m.best_of + 1) / 2, t = myM[m.id], open = isOpen(m.starts_at), dis = (!profile || !open) ? 'disabled' : '';
      const head = m.round !== last ? `<h4>${esc(m.round)} · Best of ${m.best_of}</h4>` : ''; last = m.round;
      const res = m.sets1 != null ? `<span class="tres">${m.sets1}:${m.sets2}${t ? ' · ' + pts(t, m) + ' P.' : ''}</span>` : `<span class="note">${fmt(m.starts_at)}</span>`;
      return `${head}<div class="tm"><span class="tp">${esc(m.player1)}</span>
        <input aria-label="Sätze ${esc(m.player1)}" data-m="${m.id}" data-s="1" type="number" min="0" max="${need}" value="${t ? t.sets1 : ''}" ${dis}>
        <span>:</span>
        <input aria-label="Sätze ${esc(m.player2)}" data-m="${m.id}" data-s="2" type="number" min="0" max="${need}" value="${t ? t.sets2 : ''}" ${dis}>
        <span class="tp">${esc(m.player2)}</span>${res}</div>`;
    }).join('');
  }
  const pts = (t, m) => (t.sets1 === m.sets1 && t.sets2 === m.sets2) ? 4 : (Math.sign(t.sets1 - t.sets2) === Math.sign(m.sets1 - m.sets2) ? 2 : 0);

  function renderBoard() {
    const pick = $('tBoardPick');
    if (pick) {
      pick.hidden = !groups.length;
      $('tBoardSel').innerHTML = `<option value="">Alle Mitspieler</option>` + groups.map(g => `<option value="${esc(g.code)}"${g.code === view ? ' selected' : ''}>${esc(g.name)}</option>`).join('');
    }
    const list = view && viewBoard ? viewBoard : board;
    $('tBoardNote').textContent = LIVE ? `${list.length} Mitspieler` : 'Beispiel-Rangliste im Demo-Modus';
    $('tBoard').innerHTML = list.length ? list.map(r => {
      const me = profile && (r.display_name === profile.display_name || r.display_name === profile.display_name + ' (du)');
      return `<tr${me ? ' class="me"' : ''}><td class="r">${r.rank}.</td><td>${esc(r.display_name)}</td><td class="r">${r.exact_hits}</td><td class="r">${r.bonus_points}</td><td class="r"><b>${r.points}</b></td></tr>`;
    }).join('') : `<tr><td colspan="5" class="note">Noch keine Mitspieler – sei die oder der Erste!</td></tr>`;
  }

  function renderGroups() {
    const box = $('tGroups'); if (!box) return;
    if (!LIVE) { box.innerHTML = '<p class="note">Im Demo-Modus nicht verfügbar.</p>'; return; }
    if (!groupsOk) { $('tGroupsCard').hidden = true; return; }
    if (!profile) {
      box.innerHTML = invite
        ? `<p class="tinvite">Du bist zur Tipprunde <b>${esc(invite.name)}</b> eingeladen (${invite.members} ${invite.members === 1 ? 'Mitspieler' : 'Mitspieler'}). Melde dich oben an – danach bist du automatisch dabei.</p>`
        : '<p class="note">Melde dich oben an, um eine Tipprunde zu erstellen oder einer beizutreten.</p>';
      return;
    }
    const share = !!navigator.share;
    box.innerHTML = (groups.length ? `<ul class="tglist">${groups.map(g => `<li><div><b>${esc(g.name)}</b><span class="note"> · ${g.members} Mitspieler · Code ${esc(g.code)}</span></div>
      <div class="trow"><button class="tbtn" type="button" data-gshare="${esc(g.code)}" data-gname="${esc(g.name)}">${share ? 'Einladen' : 'Link kopieren'}</button><button class="tbtn" type="button" data-gview="${esc(g.code)}">Rangliste</button><button class="tbtn" type="button" data-gleave="${esc(g.code)}">Verlassen</button></div></li>`).join('')}</ul>` : '')
      + `<form id="tgNew" class="trow"><label for="tgName" class="note" style="flex-basis:100%">Neue Tipprunde</label><input id="tgName" maxlength="40" minlength="3" required placeholder="z. B. Dartclub Oelde"><button class="btn-r" type="submit">Erstellen</button></form>
         <form id="tgJoin" class="trow"><label for="tgCode" class="note" style="flex-basis:100%">Code einer Tipprunde</label><input id="tgCode" maxlength="8" minlength="8" required placeholder="8 Zeichen" style="text-transform:uppercase"><button class="tbtn" type="submit">Beitreten</button></form>`;
  }

  function render() {
    $('tMode').hidden = LIVE;
    renderAccount(); renderBonus(); renderMatches(); renderBoard(); renderGroups();
  }
  async function shareGroup(code, name) {
    const url = INVITE_URL(code), text = `Tipp mit mir die Darts-WM 2026/27 in unserer Tipprunde „${name}“ – kostenlos:`;
    if (navigator.share) { try { await navigator.share({ title: 'Darts-WM Tipprunde', text, url }); } catch (e) {} return; }
    try { await navigator.clipboard.writeText(`${text} ${url}`); say('Einladungslink kopiert – jetzt z. B. in WhatsApp einfügen.'); }
    catch (e) { prompt('Diesen Link teilen:', url); }
  }

  /* ---------- Aktionen ---------- */
  async function saveBonus() {
    if (busy) return; busy = true; say('Speichere …');
    const rows = questions.filter(q => isOpen(q.locks_at)).map(q => ({ q, v: $('bq' + q.id).value.trim() })).filter(x => x.v !== '');
    try {
      if (!LIVE) { const d = store.get(); d.b = d.b || {}; rows.forEach(x => d.b[x.q.id] = x.v); store.set(d); }
      else if (rows.length) {
        const { error } = await sb.from('bonus_tips').upsert(rows.map(x => ({ user_id: user.id, question_id: x.q.id, value: x.v })), { onConflict: 'user_id,question_id' });
        if (error) throw error;
      }
      say(rows.length ? `${rows.length} Bonus-Tipps gespeichert.` : 'Noch nichts ausgefüllt.');
      await refresh();
    } catch (e) { say('Speichern fehlgeschlagen: ' + (e.message || e), true); }
    busy = false;
  }

  async function saveMatch(mid) {
    const m = matches.find(x => x.id === mid); if (!m) return;
    const a = $('tMatches').querySelector(`input[data-m="${mid}"][data-s="1"]`).value, b = $('tMatches').querySelector(`input[data-m="${mid}"][data-s="2"]`).value;
    if (a === '' || b === '') return;
    const s1 = +a, s2 = +b, need = (m.best_of + 1) / 2;
    if (!((s1 === need && s2 < need) || (s2 === need && s1 < need))) { say(`${m.player1} – ${m.player2}: Ein Spieler braucht genau ${need} Sätze.`, true); return; }
    try {
      if (!LIVE) { const d = store.get(); d.m = d.m || {}; d.m[mid] = { sets1: s1, sets2: s2 }; store.set(d); myM[mid] = d.m[mid]; }
      else {
        const { error } = await sb.from('match_tips').upsert({ user_id: user.id, match_id: mid, sets1: s1, sets2: s2 }, { onConflict: 'user_id,match_id' });
        if (error) throw error;
        myM[mid] = { sets1: s1, sets2: s2 };
      }
      say(`Tipp ${m.player1} ${s1}:${s2} ${m.player2} gespeichert.`);
    } catch (e) { say('Tipp nicht gespeichert: ' + (e.message || e), true); }
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
      say(`Tipprunde „${n}“ erstellt. Jetzt Link teilen!`); view = r.data; await refresh(); shareGroup(r.data, n);
    }
    if (e.target.id === 'tgJoin') {
      e.preventDefault();
      const c = $('tgCode').value.trim().toUpperCase();
      const r = await sb.rpc('join_tip_group', { p_code: c });
      if (r.error) { say(r.error.message, true); return; }
      say(`Du bist jetzt in der Tipprunde „${r.data}“.`); view = c; await refresh();
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
    if (e.target.id === 'tOut') {
      if (LIVE) await sb.auth.signOut(); else { const d = store.get(); delete d.name; store.set(d); }
      await refresh();
    }
    if (e.target.id === 'tBonusSave') saveBonus();
    const d = e.target.dataset || {};
    if (d.gshare) shareGroup(d.gshare, d.gname);
    if (d.gview) { view = d.gview; await loadView(); renderBoard(); $('tBoard').closest('.tcard').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    if (d.gleave && confirm('Tipprunde wirklich verlassen? Deine Tipps bleiben erhalten.')) {
      const r = await sb.rpc('leave_tip_group', { p_code: d.gleave });
      if (r.error) say(r.error.message, true); else { if (view === d.gleave) view = ''; say('Tipprunde verlassen.'); await refresh(); }
    }
  });
  document.addEventListener('change', async e => { if (e.target.id === 'tBoardSel') { view = e.target.value; await loadView(); renderBoard(); } });
  $('tMatches').addEventListener('change', e => { const m = e.target.dataset.m; if (m) saveMatch(+m); });

  /* ---------- Start ---------- */
  if (authError) say(/expired|invalid/i.test(authError.get('error_code') || authError.get('error_description') || '') ? 'Der Login-Link ist abgelaufen oder wurde schon benutzt. Bitte fordere oben einen neuen an.' : 'Anmeldung fehlgeschlagen: ' + (authError.get('error_description') || 'unbekannter Fehler'), true);
  if (cameFromLink || authError) setTimeout(() => { const s = $('tAccount'); if (s) s.scrollIntoView({ block: 'center' }); }, 1200);
  if (LIVE) {
    sb.auth.onAuthStateChange((_ev, session) => { const u = session?.user || null; if ((u && u.id) !== (user && user.id)) { user = u; refresh(); } });
    sb.auth.getSession().then(({ data }) => { user = data.session?.user || null; refresh(); });
    setInterval(() => loadPublic().then(loadView).then(renderBoard).catch(() => {}), 60000);
  } else refresh();
})();
