# CLAUDE.md – Zeitplan Kletterwettkampf

Notizen für KI-Sitzungen an diesem Projekt: Regeln, Festlegungen mit dem Auftraggeber, Arbeitsweise.
Bei neuen Festlegungen oder Erkenntnissen diese Datei aktuell halten.

## Projekt

- Statische Webanwendung (HTML/CSS/Vanilla-JS, kein Build) zum Erstellen und Prüfen von Zeitplänen
  für Kletterwettkämpfe in Lead, Bouldern und Speed.
- Live: https://jannikweiser.github.io/kletter-zeitplan/ · Repo: `JannikWeiser/kletter-zeitplan` (GitHub Pages, Branch `main`, Root).
- Eine Subdomain unter comptools.cloud (CNAME) kommt später – noch nicht anlegen.
- Dateien:
  - `js/calc.js` – gesamte Rechenlogik (auch per Node testbar: `require('./js/calc.js')`).
  - `js/app.js` – Oberfläche, Speicherung (localStorage `zeitplan.v3`), Export/Import JSON, Beispiel.
  - `css/style.css`, `index.html`, `impressum.html`, `datenschutz.html` (vom TI-Rechner übernommen und angepasst).
- Lokale Vorschau: `.claude/launch.json` → `python3 -m http.server 8765`.

## Arbeitsweise

- Bei Unklarheiten im Regelwerk oder bei Formaten **erst nachfragen**, nicht auf Verdacht bauen.
- Regel-Hierarchie: **nationales Regelwerk 27.1 gilt**. Nur wo es nichts sagt, die internationalen Dokumente
  (World Climbing Event Regulations, Competition Rules, Judge Guide 2026) heranziehen – und das kenntlich machen.
- Regelwerke und Running Orders liegen in `Rules/` und werden **nie** hochgeladen (`.gitignore`: `Rules/`, `*.pdf`).
- Weiteres Format-Wissen des Auftraggebers: Projekt `~/Desktop/CallZonemanagement` (ARCHITECTURE.md §5.5–5.7,
  6.12 verschränkte Speed-Finals, 6.17 Boulder-Finalformate) und der TI-Rechner (`~/Desktop/Claude/TI Rechner`).
- Nach Änderungen: Logik per Node prüfen, im Browser testen, dann committen, pushen und den Pages-Build abwarten.
- Eingabe soll knapp und übersichtlich bleiben: nur zeigen, was man wirklich ändern muss; Formate unter „Format anpassen“.

## Allgemeine Regeln (für jede Runde)

- Aufwärmbereich öffnet spätestens 90 min vor dem Start (sollte), nie später als 60 min (muss) – Allg. 6.4 A.
- Isolation nur bei **On-Sight**-Runden; schließt spätestens 30 min vor dem Start – Allg. 6.4 B.
  Flash-Runden: keine Isolation (Meldung in der Call Zone). Isolation wird als Zeile von–bis eingetragen.
- Präsentation der Finalisten → mindestens 2 min bis zum ersten Versuch – Allg. 6.4 C.
- Weniger als 4 Registrierte → kein Wettkampf in der Kategorie (Hinweis) – Allg. 6.2.
- Ende der Runde → offizielles Ergebnis: Standard 15 min (einstellbar).
- **Nicht** berücksichtigen: Routendemonstration (läuft online vorab), Jugend-/20-Uhr-Regel.

## Lead

- DM: Quali 2 Routen Flash · Halbfinale 1 Route On Sight (24) · Finale 1 Route On Sight (8). Jugendcup: Quali + Finale (6/10).
- Versuchsdauer: Standard 5 min (Regel max. 6 min, einstellbar).
- Quali 2 Routen, Startreihenfolge Route 2 um ⌊n/2⌋ versetzt (Lead 2.1).
  - **parallel (Standard):** Feld wird immer halbiert – erste Hälfte auf Route 1, zweite auf Route 2,
    dann Tausch. Reichen die **50 min Ruhezeit** (Lead 4.4) nicht, wird automatisch eine Pause vor dem
    Routentausch eingefügt (5-min-Raster) und als Hinweis „Ruhezeit automatisch eingefügt“ angezeigt.
    Beispiel 10 Starter: 5/5 parallel, 30 min Pause, Routentausch.
  - **nacheinander:** Route 1 komplett, dann Route 2; Pause davor ebenfalls automatisch.
  - Optional **2 Startgruppen**, jede auf eigenem Routenpaar parallel.
- Reinigung bei > 22 Startern, Intervall ≤ 20 (sollte) bzw. ≤ 22 (muss) – Lead 4.3.
- On Sight: 6 min gemeinsame Besichtigung (Lead 4.8).
- Zwischen Ergebnis einer Runde und Start der nächsten am selben Tag ≥ 1 h (Lead 4.5).
- Bezeichnungen im Plan: „Start Route 1 + 2“, „Routentausch“, „Start Route 2“ (nicht „Start of Play“).

## Bouldern

Grundmechanik (vom Auftraggeber bestätigt, identisch mit TI-Rechner und Judge Guide 5.2):
Startplatz s (0-basiert) klettert Boulder j im Intervall **s + gap·j**; jedes Intervall beginnt ein neuer Starter.
Beispiel Intervall: I1 A1@B1 · I2 A2@B1, A1 Pause · I3 A1@B2, A2 Pause, A3@B1.

| Format | gap | Intervall/Rotation |
|---|---|---|
| Intervall (Quali 5 B., Halbfinale 4 B.) | 2 (immer mit Pausen-Rotation) | fix 5 min + 15 s Wechsel |
| 2 Kurse (Flash, z. B. Jugendcup 2×3, BWJC 3+2) | 2 im Kurs, Gruppen um ⌊n/2⌋ versetzt, tauschen | fix 4 min + 15 s |
| Finale Intervall (Jugendcup) | 2 | fix 4 min + 15 s, 8 min gemeinsame Besichtigung |
| Finale World Series (DM) | ⌈n/2⌉ (halbes Finalfeld, max. 2 Boulder gleichzeitig) | frei eingeben |
| Finale Classic | 2 | frei (max. 4 min) |
| Finale One by one | n (Boulder für Boulder) | frei |
| JAM | – | feste Gesamtdauer |

- Rotationen gesamt = (n−1) + gap·(B−1) + 1; Ende = Start + Rotationen·Zyklus − 15 s (bei fixem Intervall).
- Call Zone = 3 Intervalle vor dem ersten Boulder (wie Running Order BWJC).
- 2 Kurse: ≥ 3 Rotationen Erholung zwischen den Kursen (Boulder 4.7 C) → fehlende Leer-Rotationen automatisch
  an der Gruppengrenze. **Sekundengenau geprüft** gegen `Rules/Running Order Bouldern Quali.pdf`
  (U17m/U21m, 27 Starter, 09:00: 401 B1 09:00:00 … B5 10:08:00, Call Zone 08:47:15, letzter Versuch 11:07:30).
- Optional 2 Startgruppen (Intervall) parallel auf eigenen Bouldern.
- Finals: 2 min Besichtigung je Boulder (World Series/Classic/One by one) bzw. 8 min gemeinsam (Intervall).

## Speed

- Quali: jeder Athlet einmal je Lane, Lane B um ⌊n/2⌋ (Speed 4: ⌊n/4⌋ je Lane) versetzt → **n Starter = n Races**.
  Zeit pro Race „mit allem drum und dran“ je Runde einstellbar (Standard 1 min).
- ≥ 5 min zwischen zwei Races eines Athleten (Speed 4.2 C): in der Quali wird bei kleinen Feldern automatisch eine
  Pause eingefügt, im Finale die Pause vor der Phase verlängert (Hinweis „automatisch eingefügt“).
- Training: Speed 2 im Quali-Format direkt vor der Quali; Speed 4 **nicht** im Quali-Format → feste Dauer.
  Ein Training für mehrere Kategorien reicht.
- Finalquote aus der Quali derselben Kategorie (Wettkampfbaum „auto“): 4–7 → 4, 8–15 → 8, ≥ 16 → 16, Speed 4 ≥ 32 → 32 (Speed 2.3).
- Speed 2: … → Viertelfinale → Halbfinale → kleines + großes Finale.
  Speed 4 (bestätigt): Races à 4, die besten 2 kommen weiter, am Ende **ein** Medal Race.
- Präsentation vor den Medal Races, alternativ der Halbfinalisten vor dem Halbfinale (Speed 4.5).
- **Verschränkte Finals** zweier Kategorien: Phasen abwechselnd, am Finale ausgerichtet
  (z. B. H 1/8, D 1/4, H 1/4, D 1/2, H 1/2, Präsentation, D Medal Races, H Medal Races);
  die verschränkte Runde übernimmt die Startzeit der gewählten Runde; gemeinsame Präsentation.

## Eingabe (v3, seit 2026-10-26): Zeitplan selbst eintippen, Tool rechnet und prüft

Auftraggeber-Wunsch: „Nur ändern, was ich wirklich ändern muss“, Zeiten wie in der Ausschreibung selbst eintragen,
das Tool berechnet nur Rundenenden und gibt Hinweise. Grundlage: Ausschreibungen DM Lead Darmstadt, SDM Bouldern
Rosenheim (+ Running Order), DJC Braunschweig, BWJC Renningen, LM Speed NRW (in `~/Downloads`, nicht im Repo).

1. **Kategorien und Format** je Disziplin: Vorlage (`C.TEMPLATES`: Bouldern `regional` (wie SDM), `dm`, `djc`, `bwjc`;
   Lead `dm`, `djc`, `one`; Speed `s2`, `s4`), Kategorien-Tabelle (Starter, Quote HF/Finale). „Format anpassen“ klappt
   Formate je Runde und allgemeine Werte auf (Ende → Ergebnis 15 min, Wechsel bei „nacheinander“ 10/10/5 min,
   Präsentation dauert 5 min, Call Zone 5 min vor Start, Speed: Pause Training → Quali → Finale 10 min).
2. **Zeitplan** je Tag als Zeilen: Uhrzeit, optional „bis“, Bezeichnung (leer = automatisch), Art:
   Hallenöffnung, Registrierung, Technical Meeting, Runde, Isolation (von–bis), Präsentation, Besichtigung,
   Siegerehrung, eigener Punkt. Zeile ohne Uhrzeit = „im Anschluss“. Zeilen sortieren sich nach Uhrzeit.
   Runde: Phase, Kategorien (Chips, standardmäßig alle), **mehrere Kategorien standardmäßig parallel**
   (umschaltbar nacheinander; Speed-Finale zusätzlich verschränkt). Speed: „Training + Quali + Finale“ als eine Zeile.
3. **„Zeitplan vorschlagen“** füllt einmalig einen regelkonformen Plan (Hallenöffnung −120, Registrierung −90…−60,
   TM −45, Folgerunde = Ergebnis + Abstand (Lead 60, Bouldern 90, Speed 30, On Sight ≥ 90 wegen Isolation),
   Isolation −90…−30, Bouldern-Finale Präsentation −15 / Besichtigung −10, Lead Besichtigung −20 / Präsentation −10,
   DM/Regional: Halbfinale + Finale am zweiten Tag ab 10:00).
- Ausgabe wie Ausschreibung, Runden **immer mit Ende** („11:30 bis ca. 17:09 Uhr“); „Startzeiten anhängen“ druckt
  die Running Order mit.
- Code: `compileSchedule()` (Zeilen → Runden, `noPre` = keine eigenen Öffnungs-/Iso-Ereignisse),
  `computeAll(..., { plain: true })`, `checkSchedule()` (Prüfungen je Rundenzeile), `suggestSchedule()`.
  Speicherung `localStorage` `zeitplan.v3`.

### Prüfungen an jeder Rundenzeile (`checkSchedule`)
- Aufwärmen (Allg. 6.4 A): On Sight → gegen die **Isoöffnung** (vom Auftraggeber bestätigt), sonst gegen die
  letzte Hallenöffnung des Tages; < 90 min Empfehlung, < 60 min Regelverstoß; fehlt sie → Hinweis.
- Isolation schließt ≥ 30 min vorher (6.4 B); darf nicht vor Ende der Vorrunde schließen (Fehler) und sollte
  nicht vor deren Ergebnis öffnen (Empfehlung).
- Besichtigung (Lead 6 min, Bouldern 8 min bzw. 2 min je Boulder) muss vor dem Start enden.
- Präsentation (Finale): danach ≥ 2 min bis zum Start (6.4 C), Dauer aus „bis“ oder Standard 5 min.
- Reihenfolge je Kategorie: nicht vor Ende der Vorrunde (Fehler); Lead ≥ 1 h nach Ergebnis (Lead 4.5);
  sonst vor dem Ergebnis → Empfehlung.
- Plus Rechenhinweise: 50-min-Pause Lead, 5-min Speed, Erholung zwischen Boulder-Gruppen, < 4 Starter.
- Geprüft gegen echte Ausschreibungen: DJC Braunschweig (Iso 16:30 für Finale 17:45 = 75 min → Empfehlung).

### Abgeglichen
- Running Order SDM Rosenheim (Damen 61, 2 Gruppen B1–B3/B4–B6, 4 min + 15 s): sekundengenau gleich,
  Ende 16:06; Call Zone dort 5 min vor Start.

## Offen / zu klären

- Wände/Bereiche sind in v3 entfallen (Parallel/Nacheinander je Zeile) – bei Bedarf als optionales Ort-Feld je Zeile wieder ergänzen.
