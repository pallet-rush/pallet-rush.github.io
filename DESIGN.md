# Pallet Rush – Design-Dokument

Stand: 09.11.2026 · Version 0.1 (Prototyp)
Autor: Nino Bernhardt · Technik: Claude Code

Dieses Dokument hält alle abgestimmten Entscheidungen fest. Bei Änderungen
wird es mitgepflegt.

---

## 1. Kurzbeschreibung

Pallet Rush ist ein Stau- und Lade-Rätsel für das Handy. Auf einem Logistikhof
stehen farbige LKWs dicht an dicht. Der Spieler tippt LKWs an, die dann
vorwärts aus dem Stau fahren, aber nur wenn der Weg frei ist. Jeder LKW, der
rauskommt, stellt sich an eine der wenigen **Laderampen**. Auf einem
**Förderband** laufen farbige **Paletten** im Kreis. Eine Palette wird nur in
einen LKW derselben Farbe geladen. Ist ein LKW voll, fährt er ab und die Rampe
wird frei.

Das Spielprinzip entspricht dem bekannten Genre-Vorbild. Name, Grafik, Sounds,
Level und Optik sind vollständig eigenständig, es werden keine fremden
Inhalte übernommen.

## 2. Grundregeln

| Regel | Festlegung |
|---|---|
| Antippen | Der LKW fährt vorwärts in Pfeilrichtung (Fahrerhaus = vorne) aus dem Hof. Ist der Weg versperrt, ruckelt er kurz und bleibt stehen. |
| Rampe nötig | Ein LKW fährt nur los, wenn eine Rampe frei ist. Sonst kommt der Hinweis „Keine Rampe frei“. |
| Zuglimit | Keins. |
| Beladen | Nur Paletten auf dem vorderen Förderband (dem Rundlauf direkt an den Rampen) werden automatisch in einen geparkten LKW gleicher Farbe geladen. Bei zwei passenden LKWs bekommt der zuerst die Palette, dem am wenigsten bis „voll“ fehlt. |
| Förderband | Das vordere Band hat feste Plätze (24 bzw. 28). Freie Plätze werden sofort aus dem Nachschub aufgefüllt, in fester Reihenfolge. |
| Zulieferbänder | Zwei Zulieferbänder (links und rechts) zeigen die nächsten Paletten des Nachschubs, abwechselnd verteilt. Von ihnen wird nie direkt geladen, sie dienen nur der Vorausschau. |
| Abfahrt | Ein voller LKW fährt sofort ab, die Rampe ist frei. |
| Gewonnen | Alle LKWs sind voll beladen abgefahren. |
| Verloren | Alle Rampen sind belegt und keine Palette auf dem Band passt mehr zu einem geparkten LKW. Dann ist keine Aktion mehr möglich. |
| Undo | Gibt es nicht. |
| Leben | Kein Leben-System. Nach einer Niederlage startet man das Level sofort neu, ohne Wartezeit. |
| Warnung | Ist nur noch 1 Rampe frei, erscheint ruhig „Nur noch 1 Rampe frei!“. Die Niederlage wird nur gemeldet, wenn sie laut Spiellogik wirklich feststeht, also keine falschen Meldungen. |

Die Palettenzahl jeder Farbe entspricht exakt der Ladekapazität aller LKWs
dieser Farbe.

## 3. Fahrzeuge

| Typ | Länge im Hof | Paletten |
|---|---|---|
| Transporter | 2 Felder | 8 |
| LKW | 3 Felder | 24 |
| Sattelzug | 4 Felder | 40 |
| Anhängerzug (ab Welt 6) | 5 Felder | 2 Abteile, je 8, auch zweifarbig |

## 4. Rampen

- Level 1–30: 4 Rampen
- ab Level 31: 5 Rampen
- Bonus „Extra-Rampe“: +1 für den Rest des Levels

## 5. Welten und Mechaniken (100 Level)

Alle 10 Level beginnt eine neue Welt mit einer neuen Mechanik. Die erste
Begegnung wird mit einem kurzen Hinweis-Fenster erklärt. Es gibt keine
Echtzeit-Uhren, alles läuft zug- oder abfahrtsbasiert, damit der Solver
jedes Level garantiert prüfen kann.

| Level | Welt | Neue Mechanik |
|---|---|---|
| 1–10 | Grundkurs | Transporter, LKW, Sattelzug, 4 Rampen |
| 11–20 | Plane | Die Farbe einiger LKWs ist unter einer grauen Plane verdeckt, bis ihr Weg frei ist. |
| 21–30 | Tor | Aus einem Hallentor fahren neue LKWs nach, sobald der Platz davor frei ist. Die Anzahl wartender LKWs steht am Tor. |
| 31–40 | Schranke | Eine Schranke sperrt Felder und öffnet sich nach X Abfahrten. Ab hier 5 Rampen. |
| 41–50 | Eilauftrag | Ein markierter LKW muss innerhalb von X Zügen aus dem Hof gefahren sein, sonst ist das Level verloren. |
| 51–60 | Anhängerzug | Lange Züge mit 2 Abteilen, die beide voll sein müssen. |
| 61–70 | Kette | Ein LKW ist angekettet, bis ein bestimmter Nachbar-LKW (gleiches Schloss-Symbol) den Hof verlassen hat. |
| 71–80 | Kartonpaletten | Manche Paletten auf dem Band sind verpackt, ihre Farbe ist nicht sichtbar. |
| 81–90 | Drehscheibe | Ein LKW auf einer Drehscheibe dreht sich bei jedem Zug um 90°. |
| 91–100 | Meisterwelt | Alle Mechaniken gemischt. |

## 6. Bonus-Items

Es gibt genau 4 Boni. Jeder wird zu Beginn des Freischalt-Levels mit einem
kurzen Tutorial vorgestellt, man bekommt 3 Stück gratis. Danach kann man sie
mit Münzen kaufen.

| Bonus | Wirkung | Freigeschaltet | Preis |
|---|---|---|---|
| Extra-Rampe | +1 Rampe für den Rest des Levels (max. 1× pro Level) | Level 10 | 250 |
| Umsortieren | Holt die Paletten für die geparkten LKWs aus dem gesamten Nachschub nach vorne und mischt den Rest von Band und nächstem Nachschub | Level 20 | 200 |
| Kran | Hebt einen beliebigen LKW aus dem Stau direkt an eine freie Rampe | Level 30 | 300 |
| Gabelstapler | Füllt einen geparkten LKW sofort mit passenden Paletten aus dem Nachschub | Level 40 | 400 |

## 7. Wirtschaft

- Pro geschafftem Level: **50 Münzen**, **+25** wenn es beim ersten Versuch
  klappt.
- Bereits geschaffte Level nochmal spielen: 10 Münzen.
- Ein Bonus kostet also etwa 4–8 Level Spielzeit.
- Keine Werbung, keine Echtgeld-Käufe, keine Leben, keine Wartezeiten.

## 8. Fairness-Garantien (Level-Pipeline)

1. **Generator** erzeugt Level aus einem Parameterplan (Hofgröße, Anzahl LKWs,
   Farben, Größen-Mix, Durchmischung des Nachschubs, Mechaniken) und einem Seed.
2. **Solver** (Tiefensuche mit Zustands-Cache) prüft jedes Level mit exakt
   derselben Spiellogik, die auch im Spiel läuft. Kann er es nicht ohne Boni
   lösen, wird das Level verworfen.
3. **Fairer Start**: Mindestens 40 % der Paletten auf dem Start-Band gehören zu
   LKWs, die sofort oder nach einem Zug ausfahren können.
4. **Schwierigkeitskurve**: Für jedes Level werden 200 Zufallsspiele simuliert.
   Die Erfolgsquote muss in einem Zielband liegen (früh leicht, später
   anspruchsvoll, mit Verschnauf-Leveln nach jeder neuen Mechanik).
5. Ausgeliefert werden nur Level, die alle Prüfungen bestehen. Ein Prüf-Tool
   kann jederzeit den gesamten Levelbestand neu verifizieren.

## 9. Optik und Präsentation

- Orientierung an der Spielweise von Bus Traffic Fever (Aufbau, Ablauf,
  Lesbarkeit), aber mit eigener Grafik, eigenem Namen und eigenen Leveln.
- Hochformat, farbenfrohe 3D-Optik in schräger Draufsicht: oben die Halle mit
  zwei Zulieferbändern, darunter das vordere Förderband (Rundlauf), dann die
  Rampen, die Zufahrt und unten der Hof mit dem Stau. Bonus-Leiste ganz unten.
- Logistikhof bei Tag: blaue Hallenwand, gelbe Bänder, rote Rampenkante,
  Asphalt mit Markierungen, grüner Rasen mit Büschen. Kräftige, klare Farben.
- LKWs mit sichtbarer Seitenfläche (Extrusion), Fahrerhaus in LKW-Farbe,
  Plane mit Fahrtrichtungs-Pfeil. Paletten als kleine 3D-Kisten.
- Alles wird per Code gezeichnet (Canvas 2D), keine Bilddateien.
- Ruhig: keine hektischen Dauer-Animationen. Bewegung als Reaktion auf
  Aktionen, die Bänder laufen gleichmäßig.
- Befriedigende Abfahrt: das Rolltor schließt, ein grüner Haken erscheint,
  Hupe, der LKW fährt mit Abgaswölkchen davon.
- Menüs in hellem Himmelblau mit Rasen, gelbe Haupt-Knöpfe.
- Farbsymbole (● ▲ ■ ★ …) für Farbenblinde lassen sich in den Einstellungen
  einschalten (Standard: aus).

## 10. Audio und Haptik

- Soundeffekte und Musik werden per Web Audio erzeugt, ohne Audiodateien und
  damit ohne Lizenzfragen.
- Standard: Sounds an, Musik an, Vibration an. Alles einzeln schaltbar.
- Vibration funktioniert nur auf Android. iPhone-Browser unterstützen das
  technisch nicht.

## 11. Sprache

Deutsch und Englisch, standardmäßig nach Gerätesprache, in den Einstellungen
umschaltbar.

## 12. Technik

- Reines HTML5/JavaScript (ES-Module), kein Build-Schritt, keine Abhängigkeiten.
- Hosting: GitHub Pages, Repository `pallet-rush`.
- Strikte Trennung:
  - `js/core/` reine Spiellogik (keine Grafik, kein DOM), genutzt von Spiel,
    Solver und Generator
  - `js/render/` Canvas-Darstellung und Animation
  - `js/ui/` Menüs und Dialoge (HTML/CSS)
  - `js/data/` Leveldaten (generiert und geprüft)
  - `tools/` Level-Generator, Solver-Oberfläche, Dev-Server
- Spielstand in `localStorage` mit Schema-Version und Migrationskette. Vor
  jeder Migration wird eine Sicherung angelegt, ein unlesbarer Spielstand
  wird nie überschrieben, sondern gesichert.
- Versionsnummer in `js/version.js`, sichtbar im Hauptmenü.
- Credit „created by Nino Bernhardt“ im Hauptmenü.
- Vorbereitet für einen späteren Store-Release (PWA-Manifest; später z. B.
  mit Capacitor verpackbar).
