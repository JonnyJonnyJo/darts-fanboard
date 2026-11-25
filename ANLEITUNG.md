# Ally Pally Fanboard – Darts-WM 2026/27 mit Tippspiel

So bringst du die Seite mit öffentlichem Tippspiel online. Dauer: etwa 45–60 Minuten, Kosten: 0 € (die kostenlosen Tarife von GitHub und Supabase reichen für eine Fanseite).

**Was danach automatisch läuft:** Ein geplanter Claude-Auftrag recherchiert zweimal täglich News, Turniertermine, WM-Paarungen und Ergebnisse, schreibt eigene Texte und speichert sie im GitHub-Repository. GitHub prüft die Daten, überträgt Paarungen und Ergebnisse ins Tippspiel und veröffentlicht die Seite – ohne dass du etwas tun musst.

## Was ist drin?

| Datei | Wofür |
|---|---|
| `index.html` | Die Webseite: News, WM kompakt, Turnierkalender, Spielplan, Tippspiel, 501-Scorer, Checkout-Rechner, Weltmeister |
| `news.js` | Lädt News, Turnierkalender, Sieger und WM-Ergebnisse aus `data/` |
| `data/news.json`, `data/events.json`, `data/matches.json` | Die Inhalte – werden automatisch aktualisiert |
| `CLAUDE-UPDATE.md` | Redaktionsregeln für den automatischen Claude-Auftrag |
| `scripts/validate.mjs` | Prüft die Daten vor jeder Veröffentlichung |
| `scripts/sync-supabase.mjs` | Überträgt Paarungen und Ergebnisse ins Tippspiel |
| `.github/workflows/veroeffentlichen.yml` | Veröffentlicht die Seite bei jeder Änderung automatisch |
| `tippspiel.js` | Logik für Login, Tipps und Rangliste |
| `config.js` | Hier trägst du deine Supabase-Zugangsdaten ein |
| `admin.html` | Verwaltung für dich: Spiele anlegen, Ergebnisse eintragen, Langzeit-Tipps auflösen |
| `supabase/schema.sql` | Datenbank, Sicherheitsregeln und Punkteberechnung |
| `impressum.html`, `datenschutz.html`, `teilnahmebedingungen.html` | Vorlagen – gelb markierte Stellen ausfüllen |

Solange `config.js` leer ist, läuft das Tippspiel im **Demo-Modus** (Tipps nur im eigenen Browser). So kannst du alles vorher anschauen.

---

## 1. Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) kostenlos registrieren und **New project** wählen.
2. Als Region **Central EU (Frankfurt)** wählen – wichtig für den Datenschutz.
3. Ein sicheres Datenbank-Passwort vergeben (brauchst du später nicht mehr, aber gut aufheben).

## 2. Datenbank einrichten

1. Im Projekt links **SQL Editor** öffnen, **New query**.
2. Den kompletten Inhalt von `supabase/schema.sql` hineinkopieren und **Run** klicken.
3. Unter **Table Editor** siehst du jetzt die Tabellen `profiles`, `matches`, `match_tips`, `bonus_questions` (mit 5 Langzeit-Fragen) und `bonus_tips`.

## 3. Login per E-Mail-Link einstellen

1. **Authentication → URL Configuration**:
   - *Site URL*: deine spätere Adresse, z. B. `https://dein-name.github.io/darts-fanboard/`
   - *Redirect URLs*: dieselbe Adresse mit `**` dahinter, z. B. `https://dein-name.github.io/darts-fanboard/**`
2. **Wichtig für eine öffentliche Seite:** Der eingebaute Mailversand von Supabase verschickt nur sehr wenige E-Mails pro Stunde. Richte unter **Authentication → Emails → SMTP Settings** einen eigenen Mailversand ein (z. B. Brevo oder den SMTP-Zugang deines E-Mail-Anbieters). Sonst kommen bei vielen Anmeldungen keine Login-Links an.
3. Optional: Unter **Authentication → Emails → Templates** den Text der Login-Mail auf Deutsch ändern.

## 4. config.js ausfüllen

Unter **Project Settings → API** findest du:
- **Project URL** → in `supabaseUrl`
- **anon public** Key → in `supabaseAnonKey`

Der anon-Key darf öffentlich sein, die Sicherheitsregeln in der Datenbank schützen die Daten. Den **service_role**-Key niemals in die Seite eintragen!

## 5. Seite auf GitHub veröffentlichen

1. Auf [github.com](https://github.com) kostenlos registrieren.
2. **New repository** → Name z. B. `darts-fanboard`, Sichtbarkeit **Public** (GitHub Pages ist für öffentliche Repositories kostenlos) → **Create repository**.
3. **Add file → Upload files** und den **Inhalt** des Ordners `darts-site` hineinziehen (alle Dateien und Ordner, auch `.github`, `data`, `scripts`, `supabase`) → **Commit changes**.
   - Falls der versteckte Ordner `.github` nicht mit hochgeladen wird (passiert auf manchen Rechnern): **Add file → Create new file**, als Namen `.github/workflows/veroeffentlichen.yml` eintippen, den Inhalt der Datei hineinkopieren und speichern.
4. **Settings → Pages** → bei *Source* **GitHub Actions** wählen.
5. **Settings → Secrets and variables → Actions → New repository secret**, zweimal:
   - `SUPABASE_URL` = deine Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = der **service_role**-Key aus Supabase (Project Settings → API). Dieser Schlüssel ist geheim und gehört **nur** hierher, niemals in eine Datei!
6. Unter **Actions** siehst du den Lauf „Seite veröffentlichen“. Wenn er grün ist, ist die Seite unter `https://dein-name.github.io/darts-fanboard/` online. Diese Adresse in Schritt 3 bei Supabase eintragen.

Eigene Domain (z. B. `darts-fanboard.de`): unter **Settings → Pages → Custom domain** eintragen und beim Domain-Anbieter den angezeigten DNS-Eintrag setzen.

## 6. Automatische Updates durch Claude einschalten

1. In Claude unter **Einstellungen → Connectors** GitHub verbinden und der Claude-App Zugriff auf dein Repository geben.
2. Claude im Chat Bescheid geben, z. B. „GitHub ist verbunden, das Repo heißt dein-name/darts-fanboard“.
3. Claude richtet dann den geplanten Auftrag ein: zweimal täglich (8:17 und 18:17 Uhr) recherchieren, `data/*.json` aktualisieren, prüfen und veröffentlichen. Die Regeln dafür stehen in `CLAUDE-UPDATE.md` – dort kannst du Ton, Quellen oder Häufigkeit jederzeit anpassen.
4. Jede Änderung siehst du im Repository unter **Commits**. Gefällt dir etwas nicht, kannst du die Datei direkt auf GitHub bearbeiten oder den Commit rückgängig machen.

## 7. Admin werden

1. Auf deiner Seite beim Tippspiel mit deiner E-Mail anmelden und einen Spielernamen wählen.
2. In Supabase im **SQL Editor** ausführen (Namen anpassen):
   ```sql
   update public.profiles set is_admin = true where display_name = 'DeinSpielername';
   ```
3. Jetzt funktioniert `https://deine-adresse/admin.html`.

## 8. Spiele & Ergebnisse im Tippspiel

**Automatisch:** Sobald der Claude-Auftrag Paarungen und Ergebnisse in `data/matches.json` einträgt, überträgt GitHub sie ins Tippspiel. Die Rangliste rechnet sofort neu. Du musst nichts tun.

- Korrekturen bitte in `data/matches.json` auf GitHub machen (Datei öffnen → Stift-Symbol). Was du in `admin.html` an diesen Spielen änderst, wird beim nächsten Update wieder überschrieben.
- Fehlt mal ein Ergebnis, holt der nächste Lauf es nach – oder du trägst es selbst in `data/matches.json` ein.

**Von Hand (falls du die Automatik nicht nutzt):** In `admin.html` unter **Spiele importieren** eine Zeile pro Spiel einfügen:

```
1. Runde;11.12.2026 20:00;Spieler A;Spieler B
1. Runde;11.12.2026 20:00;Spieler C;Spieler D
```

- Erlaubte Runden: `1. Runde`, `2. Runde`, `3. Runde`, `Achtelfinale`, `Viertelfinale`, `Halbfinale`, `Finale` (die Satzdistanz wird automatisch gesetzt).
- Als Zeit am besten den Session-Beginn nehmen – ab dann ist das Tippen für alle Spiele der Session gesperrt.
- Die 2. Runde usw. trägst du ein, sobald die Paarungen feststehen.

Ergebnisse trägst du in der Tabelle darunter ein und klickst **Speichern** – die Rangliste rechnet sofort neu.

## 9. Langzeit-Tipps auflösen

Nach dem Finale (bzw. sobald es feststeht) die richtigen Antworten in `admin.html` eintragen. Für Namen mehrere Schreibweisen mit `|` erlauben, z. B. `Luke Littler|Littler`. Die Fragen selbst kannst du vor dem Start im **Table Editor** bei `bonus_questions` ändern.

## 10. News, Kalender & Sieger

- **Automatisch:** News, Turnierkalender und Sieger aktualisiert der Claude-Auftrag in `data/news.json` und `data/events.json`. Vergangene Turniere verschwinden von selbst aus „Als Nächstes“.
- **Eigene Meldung zwischendurch:** In `admin.html` unter **News veröffentlichen** – sie erscheint sofort und wird nach Datum einsortiert. Mit **Top-Meldung** landet sie ganz oben.
- **Texte immer in eigenen Worten** und mit Link zur Quelle – keine Artikel oder Absätze kopieren (Urheberrecht). Das gilt auch für den Claude-Auftrag und steht in `CLAUDE-UPDATE.md`.
- Wenn eine Datei fehlerhaft ist, veröffentlicht GitHub nichts und die alte Seite bleibt online. Den Fehler zeigt der rote Lauf unter **Actions**.

## 11. Rechtliches – vor dem Start erledigen

- `impressum.html`, `datenschutz.html`, `teilnahmebedingungen.html`: alle gelb markierten Stellen ausfüllen und die Markierungen entfernen.
- Bei Supabase den Auftragsverarbeitungsvertrag (DPA) abschließen (im Dashboard unter *Legal Documents* bzw. auf der Supabase-Website).
- Teilnahme bleibt kostenlos – kein Einsatz, keine Gebühr, keine Wettanbieter-Werbung.
- **Empfohlen:** Schriften lokal einbinden statt von Google laden (z. B. mit dem „google-webfonts-helper“), dann entfällt die IP-Übertragung an Google. Dazu die `<link … fonts.googleapis.com …>`-Zeile in `index.html` durch eine lokale CSS-Datei ersetzen.
- Bei echten Preisen oder großer Reichweite: einmal kurz anwaltlich prüfen lassen.

## 12. Testen

1. Mit zwei verschiedenen E-Mail-Adressen anmelden.
2. In `admin.html` ein Testspiel in der Zukunft anlegen, beide Konten tippen lassen.
3. Ergebnis eintragen → Rangliste prüfen.
4. Testspiel wieder löschen.

## Punkteregeln (in `supabase/schema.sql`, Funktion `leaderboard`)

- Exaktes Satzergebnis: 4 Punkte
- Richtiger Sieger: 2 Punkte
- Langzeit-Tipps: Punkte laut Frage (Weltmeister 10, Vize 6, sonst 5)
- Gleichstand: mehr exakte Treffer liegen vorne

Fremde Tipps sind erst nach dem Anwurf sichtbar, nach Tippschluss lässt die Datenbank keine Änderungen mehr zu, und niemand kann sich selbst zum Admin machen.
