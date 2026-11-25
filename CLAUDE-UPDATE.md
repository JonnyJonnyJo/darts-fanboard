# Redaktionsregeln für das automatische Update

Diese Datei steuert den geplanten Claude-Auftrag, der die Fanseite „Ally Pally Fanboard“ aktuell hält.
Jeder Lauf hält sich genau an diesen Ablauf. Die Seite ist deutschsprachig und eine **inoffizielle Fanseite**.

## Was der Auftrag ändern darf

Ausschließlich diese drei Dateien – nichts anderes im Repository:

| Datei | Inhalt |
|---|---|
| `data/news.json` | Meldungen auf der Startseite |
| `data/events.json` | Turnierkalender (`upcoming`) und Sieger (`winners`) |
| `data/matches.json` | WM-Paarungen und Ergebnisse – werden automatisch ins Tippspiel übertragen |

Jeder Push auf `main` prüft die Dateien (`scripts/validate.mjs`) und veröffentlicht die Seite automatisch.

## Ablauf jedes Laufs

1. `git pull`, dann alle drei Dateien lesen. Merken, wann zuletzt aktualisiert wurde (`updated`).
2. **Recherchieren**, was seit dem letzten Update passiert ist (WebSearch/WebFetch):
   - PDC-Majors und TV-Turniere: Ergebnisse, Finals, Sieger, Auslosungen, Spielpläne
   - Darts-WM: Teilnehmerfeld, Auslosung, Spielplan nach Sessions, Ergebnisse, Ausfälle
   - Deutsche Spieler (Schindler, Clemens, Springer, Hopp, Pietreczko …) besonders beachten
   - Neue offizielle Turniertermine für die nächsten 12 Monate
   - Gute Quellen: pdc.tv (offiziell), sportschau.de, sport1.de, ran.de, kicker.de, skysports.com, sportinglife.com, flashscore, dartsnews.com
3. **Prüfen:** Ergebnisse, Spielstände, Termine und Namen nur übernehmen, wenn sie von pdc.tv oder von zwei unabhängigen Quellen bestätigt sind. Gerüchte, Spekulationen und Wettquoten nie übernehmen. Im Zweifel weglassen.
4. Dateien aktualisieren (Regeln unten), bei jeder geänderten Datei `updated` auf die aktuelle Zeit setzen (Format `2026-12-12T08:17:00+01:00`).
5. `node scripts/validate.mjs` ausführen. Bei Fehlern korrigieren, bis es „✓“ meldet.
6. Gab es keine echten Neuigkeiten: **nichts committen**. Sonst committen mit einer Nachricht wie
   `Automatisches Update: Grand-Slam-Sieger, 2 News` und auf `main` pushen.
7. Am Ende in 2–3 Sätzen berichten, was geändert wurde (oder dass es nichts Neues gab).

## Regeln für `data/news.json`

- **Immer eigene Worte.** Niemals Sätze oder Absätze aus Artikeln übernehmen, keine wörtlichen Zitate. Fakten zusammenfassen, nicht nacherzählen.
- `title`: deutsch, max. 110 Zeichen, sachlich-sportlich, keine Clickbait-Fragen außer bei Vorschauen.
- `teaser`: 1–3 Sätze, max. 420 Zeichen, mit dem Wichtigsten (wer, was, Ergebnis).
- `url`: https-Link zum Artikel, auf dem die Meldung beruht; `source`: Name der Seite.
- `tag`: Turnier oder Thema (z. B. „WM 2026/27“, „Grand Slam“, „European Tour“).
- `when`: kurze Zeitangabe für die Anzeige, z. B. `So 22.11.` oder `Vorschau · 27.–29.11.`
- `date`: JJJJ-MM-TT, bestimmt die Reihenfolge (neueste zuerst).
- `id`: fortlaufend `n001`, `n002` … – nie eine vergebene id erneut verwenden.
- Genau **eine** Meldung hat `"top": true` – die wichtigste aktuelle Geschichte (während der WM fast immer WM-Thema).
- Pro Lauf höchstens 5 neue Meldungen. Entwickelt sich eine Geschichte weiter, die bestehende Meldung aktualisieren statt eine zweite anzulegen.
- Höchstens 30 Meldungen behalten – die ältesten löschen.
- Keine Wettanbieter, Quoten oder Werbung, keine Privatleben-Themen, keine Fotos.

## Regeln für `data/events.json`

- `upcoming`: große Turniere der nächsten 12 Monate (Majors, World Series, Bahrain/Saudi Masters, WM, Auslosungen). Einträge, die mehr als 60 Tage vorbei sind, löschen.
  Felder: `start`, `end` (JJJJ-MM-TT), `name`, `location`, optional `flag`: `"wm"` für WM-Termine, `"new"` für neue Turniere.
- `winners`: Ist ein Turnier beendet, den Sieger eintragen: `season` (Jahr), `tournament`, `winner`, `final` (z. B. `16:11 gegen Gian van Veen`). Die WM zählt zur Saison des Finaljahres. Die Seite zeigt automatisch die neueste Saison.

## Regeln für `data/matches.json` (WM & Tippspiel)

- Erst nach der offiziellen Auslosung eintragen. Spielzeiten aus dem offiziellen Spielplan nach Sessions (pdc.tv „schedule of play“); mehrere Spiele einer Session bekommen den Session-Beginn.
- `key`: `WM27-R1-001` … (`R1`, `R2`, `R3`, `AF`, `VF`, `HF`, `F`), fortlaufend je Runde, **nie ändern**, sonst entsteht im Tippspiel ein doppeltes Spiel.
- `round` exakt: `1. Runde`, `2. Runde`, `3. Runde`, `Achtelfinale`, `Viertelfinale`, `Halbfinale`, `Finale`; `best_of` passend (5, 5, 7, 7, 9, 11, 13).
- `starts_at` mit Zeitzone, z. B. `2026-12-11T20:00:00+01:00`.
- Paarungen späterer Runden eintragen, sobald beide Spieler feststehen.
- `sets1`/`sets2` **nur bei beendeten Spielen** und nur aus bestätigter Quelle; sonst `null`. Spielernamen genau wie bei der PDC schreiben, Reihenfolge wie im offiziellen Spielplan.
- Steht die Startzeit eines Spiels fest, sie nachträglich nicht nach hinten verschieben (sonst könnte nach Anwurf noch getippt werden). Wird ein Spiel offiziell verlegt, die Zeit nur vorziehen oder in der Meldung erwähnen.

## Ton

Fan-nah, aber faktentreu und fair zu allen Spielern. Deutsch, kurze Sätze, englische Fachbegriffe wie im deutschen Darts-TV üblich (Leg, Set, Average, Checkout).
