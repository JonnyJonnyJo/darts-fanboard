// Prüft die Datendateien, bevor sie veröffentlicht werden.
// Aufruf: node scripts/validate.mjs   → Exit-Code 1 bei Fehlern (dann wird nichts veröffentlicht)
import { readFileSync } from 'node:fs';

const errors = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);
const read = f => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch (e) { err(f, 'kein gültiges JSON – ' + e.message); return null; } };
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T12:00:00Z'));
const isTime = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/.test(s) && !isNaN(new Date(s));
const isUrl = s => typeof s === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(s);
const str = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.length <= max;
const BO = { '1. Runde': 5, '2. Runde': 5, '3. Runde': 7, 'Achtelfinale': 7, 'Viertelfinale': 9, 'Halbfinale': 11, 'Finale': 13 };

// news.json
const n = read('data/news.json');
if (n) {
  if (!isTime(n.updated)) err('news.json', '"updated" fehlt oder ist kein Zeitstempel');
  if (!Array.isArray(n.items) || n.items.length < 3) err('news.json', 'mindestens 3 Meldungen nötig');
  else {
    if (n.items.length > 40) err('news.json', 'mehr als 40 Meldungen – ältere bitte entfernen');
    const ids = new Set();
    if (n.items.filter(i => i.top).length !== 1) err('news.json', 'genau eine Meldung braucht "top": true');
    n.items.forEach((i, k) => {
      const at = `Meldung ${k + 1} (${i.id || 'ohne id'})`;
      if (!str(i.id, 1, 40) || ids.has(i.id)) err('news.json', `${at}: id fehlt oder doppelt`); ids.add(i.id);
      if (!isDate(i.date)) err('news.json', `${at}: date muss JJJJ-MM-TT sein`);
      if (!str(i.when, 2, 40)) err('news.json', `${at}: when fehlt (max. 40 Zeichen)`);
      if (!str(i.tag, 2, 40)) err('news.json', `${at}: tag fehlt (max. 40 Zeichen)`);
      if (!str(i.title, 5, 110)) err('news.json', `${at}: title 5–110 Zeichen`);
      if (!str(i.teaser, 20, 420)) err('news.json', `${at}: teaser 20–420 Zeichen`);
      if (!isUrl(i.url)) err('news.json', `${at}: url muss mit https:// beginnen`);
      if (!str(i.source, 2, 60)) err('news.json', `${at}: source fehlt`);
    });
  }
}

// events.json
const e = read('data/events.json');
if (e) {
  if (!isTime(e.updated)) err('events.json', '"updated" fehlt');
  (e.upcoming || []).forEach((v, k) => {
    const at = `Termin ${k + 1} (${v.name || '?'})`;
    if (!isDate(v.start) || !isDate(v.end) || v.end < v.start) err('events.json', `${at}: start/end ungültig`);
    if (!str(v.name, 2, 60) || !str(v.location, 2, 60)) err('events.json', `${at}: name/location fehlt`);
    if (v.flag && !['wm', 'new'].includes(v.flag)) err('events.json', `${at}: flag nur "wm" oder "new"`);
  });
  (e.winners || []).forEach((w, k) => {
    if (!Number.isInteger(w.season) || !str(w.tournament, 2, 60) || !str(w.winner, 2, 60)) err('events.json', `Sieger ${k + 1}: season/tournament/winner fehlt`);
  });
}

// matches.json
const m = read('data/matches.json');
if (m) {
  if (!isTime(m.updated)) err('matches.json', '"updated" fehlt');
  const keys = new Set();
  (m.matches || []).forEach((x, k) => {
    const at = `Spiel ${k + 1} (${x.key || '?'})`;
    if (!/^[A-Z0-9-]{4,30}$/.test(x.key || '') || keys.has(x.key)) err('matches.json', `${at}: key fehlt, falsches Format oder doppelt`); keys.add(x.key);
    if (!(x.round in BO)) err('matches.json', `${at}: round unbekannt`);
    else if (x.best_of !== BO[x.round]) err('matches.json', `${at}: best_of passt nicht zur Runde (${BO[x.round]})`);
    if (!isTime(x.starts_at)) err('matches.json', `${at}: starts_at muss z. B. 2026-12-11T20:00:00+01:00 sein`);
    if (!str(x.player1, 2, 60) || !str(x.player2, 2, 60)) err('matches.json', `${at}: Spielername fehlt`);
    const has = x.sets1 != null || x.sets2 != null;
    if (has) {
      const need = (x.best_of + 1) / 2;
      if (!((x.sets1 === need && x.sets2 < need && x.sets2 >= 0) || (x.sets2 === need && x.sets1 < need && x.sets1 >= 0)))
        err('matches.json', `${at}: Ergebnis ${x.sets1}:${x.sets2} unmöglich bei Best of ${x.best_of}`);
    }
  });
}

if (errors.length) { console.error('✗ ' + errors.length + ' Fehler:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('✓ Datendateien in Ordnung');
