// Überträgt Paarungen und Ergebnisse aus data/matches.json ins Tippspiel (Supabase-Tabelle "matches").
// Läuft automatisch in GitHub Actions. Braucht die Secrets SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY.
import { readFileSync } from 'node:fs';

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.log('Supabase-Secrets nicht gesetzt – Sync übersprungen.'); process.exit(0); }

const { matches = [] } = JSON.parse(readFileSync('data/matches.json', 'utf8'));
if (!matches.length) { console.log('Noch keine Spiele in data/matches.json.'); process.exit(0); }

const rows = matches.map(m => ({
  ext_key: m.key, round: m.round, starts_at: m.starts_at,
  player1: m.player1, player2: m.player2, best_of: m.best_of,
  sets1: m.sets1 ?? null, sets2: m.sets2 ?? null
}));

const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/matches?on_conflict=ext_key`, {
  method: 'POST',
  headers: {
    apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal'
  },
  body: JSON.stringify(rows)
});
if (!res.ok) { console.error('Sync fehlgeschlagen:', res.status, await res.text()); process.exit(1); }
console.log(`✓ ${rows.length} Spiele mit dem Tippspiel abgeglichen.`);
