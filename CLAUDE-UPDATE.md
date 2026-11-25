# Redaktionsregeln für das automatische Update

Diese Datei steuert den geplanten Claude-Auftrag, der die Fanseite „Ally Pally Fanboard“
(https://jonnyjonnyjo.github.io/darts-fanboard/) aktuell hält. Die Seite ist deutschsprachig und eine **inoffizielle Fanseite**.

## Wo die Inhalte stehen

Alle Inhalte liegen in der Supabase-Datenbank, Projekt-ID **`puxtqvnafzrbmynaefza`** (Name „darts-fanboard“).
Geändert wird ausschließlich mit dem Supabase-Connector (`execute_sql`) und nur in diesen Tabellen:

| Tabelle | Inhalt | Spalten |
|---|---|---|
| `news` | Meldungen auf der Startseite | `published_at` (date), `when_label`, `tag`, `title`, `teaser`, `url`, `source`, `is_top` |
| `events` | Turnierkalender | `starts_on`, `ends_on` (date), `name`, `location`, `flag` (`'wm'`, `'new'` oder null) |
| `winners` | Sieger | `season` (int), `tournament`, `winner`, `final` |
| `matches` | WM-Paarungen & Ergebnisse (= Tippspiel!) | `ext_key`, `round`, `starts_at` (timestamptz), `player1`, `player2`, `best_of`, `sets1`, `sets2` |
| `site_status` | Zeitstempel „Aktualisiert“ (eine Zeile, id = 1) | `updated_at`, `note` |

Niemals ändern: `profiles`, `match_tips`, `bonus_tips`, `bonus_questions` (Tipps der Mitspieler), Rechte, Policies oder das Schema.
Nie `drop`, `truncate` oder `delete` ohne `where`.

## Ablauf jedes Laufs

1. Aktuellen Stand lesen: `select * from news order by published_at desc;`, `select * from events order by starts_on;`, `select * from winners;`, `select ext_key, round, starts_at, player1, player2, sets1, sets2 from matches order by starts_at;`, `select * from site_status;`
2. **Recherchieren**, was seit `site_status.updated_at` passiert ist (WebSearch/WebFetch):
   - PDC-Majors und TV-Turniere: Ergebnisse, Finals, Sieger, Auslosungen, Spielpläne
   - Darts-WM: Teilnehmerfeld, Auslosung, Spielplan nach Sessions, Ergebnisse, Ausfälle
   - Deutsche Spieler (Schindler, Clemens, Springer, Hopp, Pietreczko …) besonders beachten
   - Neue offizielle Turniertermine für die nächsten 12 Monate
   - Gute Quellen: pdc.tv (offiziell), sportschau.de, sport1.de, ran.de, kicker.de, skysports.com, sportinglife.com, flashscore, dartsnews.com
3. **Prüfen:** Ergebnisse, Spielstände, Termine und Namen nur übernehmen, wenn pdc.tv oder zwei unabhängige Quellen sie bestätigen. Keine Gerüchte, Spekulationen oder Wettquoten. Im Zweifel weglassen.
4. Tabellen aktualisieren (Regeln unten).
5. Immer am Ende: `update site_status set updated_at = now(), note = '<kurz, was geändert wurde>' where id = 1;` – auch wenn es nichts Neues gab (dann `note = 'keine Neuigkeiten'`).
6. In 2–3 Sätzen berichten, was geändert wurde.

## Regeln für `news`

- **Immer eigene Worte.** Niemals Sätze aus Artikeln übernehmen, keine wörtlichen Zitate. Fakten zusammenfassen.
- `title`: deutsch, max. 110 Zeichen, sachlich-sportlich. `teaser`: 1–3 Sätze, max. 420 Zeichen (wer, was, Ergebnis).
- `url`: https-Link zum Artikel, auf dem die Meldung beruht; `source`: Name der Seite.
- `tag`: Turnier oder Thema (z. B. „WM 2026/27“, „Grand Slam“, „European Tour“). `when_label`: kurze Anzeige wie `So 22.11.` oder `Vorschau · 27.–29.11.` (max. 40 Zeichen).
- Genau **eine** Meldung hat `is_top = true` – die wichtigste aktuelle Geschichte (während der WM fast immer WM). Vor dem Setzen einer neuen Top-Meldung: `update news set is_top = false where is_top;`
- Pro Lauf höchstens 5 neue Meldungen. Entwickelt sich eine Geschichte weiter, die bestehende Zeile aktualisieren statt eine zweite anzulegen.
- Höchstens 30 Meldungen behalten: `delete from news where id not in (select id from news order by published_at desc, id desc limit 30);`
- Keine Wettanbieter, Quoten, Werbung, Privatleben-Themen oder Fotos. Bei Texten in SQL einfache Anführungszeichen verdoppeln (`''`).

## Regeln für `events` und `winners`

- `events`: große Turniere der nächsten 12 Monate (Majors, World Series, Bahrain/Saudi Masters, WM, Auslosungen). Einträge löschen, deren `ends_on` mehr als 60 Tage zurückliegt. Keine Duplikate (vorher nach `name` und `starts_on` prüfen).
- `winners`: Ist ein Turnier beendet, Sieger eintragen: `season` = Jahr, `tournament`, `winner`, `final` (z. B. `16:11 gegen Gian van Veen`). Die WM zählt zur Saison des Finaljahres. Die Seite zeigt automatisch die neueste Saison.

## Regeln für `matches` (WM & Tippspiel)

- Erst nach der offiziellen Auslosung eintragen. Spielzeiten aus dem offiziellen Spielplan nach Sessions (pdc.tv „schedule of play“); alle Spiele einer Session bekommen den Session-Beginn – ab dann ist das Tippen gesperrt.
- Immer als Upsert:
  `insert into matches (ext_key, round, starts_at, player1, player2, best_of, sets1, sets2) values (...) on conflict (ext_key) do update set round = excluded.round, starts_at = excluded.starts_at, player1 = excluded.player1, player2 = excluded.player2, best_of = excluded.best_of, sets1 = excluded.sets1, sets2 = excluded.sets2;`
- `ext_key`: `WM27-R1-001` … (`R1`, `R2`, `R3`, `AF`, `VF`, `HF`, `F`), fortlaufend je Runde, **nie ändern**.
- `round` exakt: `1. Runde`, `2. Runde`, `3. Runde`, `Achtelfinale`, `Viertelfinale`, `Halbfinale`, `Finale`; `best_of` 5, 5, 7, 7, 9, 11, 13. Die Datenbank lehnt unmögliche Ergebnisse ab.
- `starts_at` mit Zeitzone, z. B. `'2026-12-11 20:00+01'`.
- Paarungen späterer Runden eintragen, sobald beide Spieler feststehen.
- `sets1`/`sets2` **nur bei beendeten Spielen** und nur aus bestätigter Quelle, sonst null. Spielernamen wie bei der PDC, Reihenfolge wie im offiziellen Spielplan.
- Eine bereits eingetragene Startzeit nie nach hinten verschieben (sonst könnte nach Anwurf noch getippt werden).
- Nach dem WM-Finale die richtigen Antworten der Langzeit-Tipps **nicht** selbst eintragen – das macht Jonas in admin.html. Stattdessen im Bericht die Ergebnisse nennen (Weltmeister, Vize, Littlers Runde, beste deutsche Runde, Zahl der 9-Darter).

## Ton

Fan-nah, aber faktentreu und fair zu allen Spielern. Deutsch, kurze Sätze, Fachbegriffe wie im deutschen Darts-TV (Leg, Set, Average, Checkout).
