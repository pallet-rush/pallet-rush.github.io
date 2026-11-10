# Pallet Rush – Design-Dokument

Stand: 10.11.2026 · Version 0.3.3
Autor: Nino Bernhardt · Technik: Claude Code

Dieses Dokument hält alle abgestimmten Entscheidungen fest. Bei Änderungen
wird es mitgepflegt.

---

## 1. Kurzbeschreibung

Pallet Rush ist ein Stau- und Lade-Rätsel für das Handy. Auf einem Logistikhof
stehen farbige LKWs dicht an dicht. Der Spieler tippt LKWs an, die dann
vorwärts aus dem Stau fahren, aber nur wenn der Weg frei ist. Jeder LKW, der
rauskommt, fährt über die Ringstraße und parkt rückwärts an einer der 4
**Laderampen**. Aus der Halle kommt eine lange **Schlange farbiger Paletten**
über zwei Zulieferbänder und ein rundes Förderband. Unten im U liegen drei
**Ausgabeplätze** (links, Mitte, rechts) mit je einem Block aus 4 Paletten.
Diese drei Blöcke können verladen werden, jeder nur in einen LKW derselben
Farbe. Ist ein LKW voll, fährt er ab und die Rampe wird frei.

Das Spielprinzip entspricht dem bekannten Genre-Vorbild. Name, Grafik, Sounds,
Level und Optik sind vollständig eigenständig, es werden keine fremden
Inhalte übernommen.

## 2. Grundregeln

| Regel | Festlegung |
|---|---|
| Antippen | Der LKW fährt vorwärts in Pfeilrichtung (Fahrerhaus = vorne) aus dem Hof. Ist der Weg versperrt, ruckelt er kurz und bleibt stehen. |
| Rampe nötig | Ein LKW fährt nur los, wenn eine Rampe frei ist. Sonst kommt der Hinweis „Keine Rampe frei“. |
| Zuglimit | Keins. |
| Beladen | Die Schlange besteht aus Blöcken zu 4 gleichfarbigen Paletten. Die vordersten 3 noch nicht verladenen Blöcke liegen an den Ausgabeplätzen (links, Mitte, rechts) und werden jeweils als ganzer Block in einen geparkten LKW gleicher Farbe geladen (vorderster Block zuerst). Passt keiner davon, wartet die Schlange. Bei zwei passenden LKWs bekommt der den Block, dem am wenigsten bis „voll“ fehlt. Ein frei gewordener Ausgabeplatz wird mit dem nächsten Block der Schlange gefüllt. |
| Paletten-Blöcke | Paletten kommen immer in Blöcken zu 4 gleichfarbigen Paletten, die nebeneinander auf dem breiten Band fahren. Alle Ladekapazitäten (8 / 24 / 40) sind Vielfache von 4. Farbgruppen bleiben auf einer Bandseite, die Gruppen wechseln sich links/rechts ab. |
| Schlange | Feste Reihenfolge. Sie kommt aus zwei Hallentoren über gerade Zulieferbänder, die in das runde Förderband münden; an der Weiche laufen beide Spuren abwechselnd zusammen. Man sieht etwa 20 Paletten im Voraus. |
| Abfahrt | Ein voller LKW fährt sofort ab, die Rampe ist frei. |
| Gewonnen | Alle LKWs sind voll beladen abgefahren. |
| Verloren | Alle Rampen sind belegt und keiner der 3 Blöcke an den Ausgabeplätzen passt zu einem geparkten LKW. Dann ist keine Aktion mehr möglich. |
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

- Immer 4 Rampen (Parkbuchten nebeneinander). Sind alle 4 belegt, kann kein
  weiterer LKW losfahren.
- Bonus „Extra-Rampe“: +1 für den Rest des Levels
- Ein LKW setzt erst rückwärts in die Bucht, wenn sie wirklich frei ist; sonst
  wartet er davor. LKWs fahren nie ineinander.

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
| 31–40 | Schranke | Eine Schranke sperrt Felder und öffnet sich nach X Abfahrten. |
| 41–50 | Eilauftrag | Ein markierter LKW muss innerhalb von X Zügen aus dem Hof gefahren sein, sonst ist das Level verloren. |
| 51–60 | Anhängerzug | Lange Züge mit 2 Abteilen, die beide voll sein müssen. |
| 61–70 | Kette | Ein LKW ist angekettet, bis ein bestimmter Nachbar-LKW (gleiches Schloss-Symbol) den Hof verlassen hat. |
| 71–80 | Kartonpaletten | Manche Paletten in der Schlange sind verpackt, ihre Farbe sieht man erst an der Ladestation. |
| 81–90 | Drehscheibe | Ein LKW auf einer Drehscheibe dreht sich bei jedem Zug um 90°. |
| 91–100 | Meisterwelt | Alle Mechaniken gemischt. |

## 6. Bonus-Items

Es gibt genau 4 Boni. Jeder wird zu Beginn des Freischalt-Levels mit einem
kurzen Tutorial vorgestellt, man bekommt 3 Stück gratis. Danach kann man sie
mit Münzen kaufen.

| Bonus | Wirkung | Freigeschaltet | Preis |
|---|---|---|---|
| Extra-Rampe | +1 Rampe für den Rest des Levels (max. 1× pro Level) | Level 10 | 250 |
| Umsortieren | Holt die Blöcke für die geparkten LKWs aus der ganzen Schlange nach vorne und mischt die nächsten 10 übrigen Blöcke | Level 20 | 200 |
| Kran | Hebt einen beliebigen LKW aus dem Stau direkt an eine freie Rampe | Level 30 | 300 |
| Gabelstapler | Füllt einen geparkten LKW sofort mit passenden Blöcken vom Ende der Schlange | Level 40 | 400 |

## 7. Wirtschaft

- Pro geschafftem Level: **50 Münzen**, **+25** wenn es beim ersten Versuch
  klappt.
- Bereits geschaffte Level nochmal spielen: 10 Münzen.
- Ein Bonus kostet also etwa 4–8 Level Spielzeit.
- **Sterne** pro Level: 3 Sterne ohne Bonus beim ersten Versuch, je −1 für
  Bonus-Einsatz bzw. weiteren Versuch (mindestens 1). Der beste Wert zählt;
  Sterne pro Welt stehen auf dem Welt-Banner der Levelauswahl (max. 30).
- **Tagesbonus**: 7-Tage-Serie 30 / 40 / 50 / 60 / 80 / 100 / 150 Münzen.
  Ein ausgelassener Tag setzt die Serie zurück.
- **Schwere Level**: Level 10 und jedes x6-Level ab 16 sind „Schwer“ (Münzen ×1,5),
  jedes 10. Level ab 20 ist „Sehr schwer“ (×2). Kennzeichnung im Start-Banner,
  im HUD und in der Levelauswahl.
- **Weiterspielen** nach „Alle Rampen belegt“: +1 Rampe aus dem Bonus-Vorrat
  (gratis) oder für 100–250 Münzen (steigt mit dem Level).
- Keine Werbung, keine Echtgeld-Käufe, keine Leben, keine Wartezeiten.

## 8. Fairness-Garantien (Level-Pipeline)

1. **Generator** stanzt eine Stau-Form (Kreis, Herz, Stern, Raute, Ring, Kreuz,
   Sanduhr, Pfeil, Welle …), gerade oder um 45° gedreht, und füllt sie dicht
   mit LKWs – nur so, dass sich der Hof immer räumen lässt.
2. **Referenz-Partie**: Der Generator spielt das Level mit der echten
   Spiellogik und legt dabei die Paletten-Schlange fest. Die gespielte Lösung
   wird mitgespeichert (`sol`) und beim Prüfen nachgespielt. Jedes Level ist
   damit garantiert ohne Boni lösbar.
3. **Spielraum**: Die Referenz-Partie lässt in Level 1–2 zwei Rampen frei,
   sonst meist eine; jedes 3. Level und die Boss-Level (x0) keine.
   Seit v0.3.2 (3 Ausgabeplätze) sind die Zielbänder deutlich niedriger, damit
   jedes Level ein echtes Rätsel bleibt (Level 1 ≈ 85–100 %, Level 10 ≈ 12–35 %,
   späte Boss-Level unter 15 %).
4. **Schwierigkeitskurve**: Für jedes Level werden 60 Partien eines
   simulierten, umsichtigen Spielers gespielt. Die Erfolgsquote muss in einem
   Zielband liegen (früh leicht, später anspruchsvoll, Verschnauf-Level nach
   jeder neuen Mechanik). Mehr LKWs, mehr Farben, dichterer Stau und
   kleinere Farb-Pakete in der Schlange machen es schwerer.
5. Ausgeliefert werden nur Level, die alle Prüfungen bestehen. Ein Prüf-Tool
   kann jederzeit den gesamten Levelbestand neu verifizieren.

## 9. Optik und Präsentation

- Orientierung an der Spielweise von Bus Traffic Fever (Aufbau, Ablauf,
  Lesbarkeit), aber mit eigener Grafik, eigenem Namen und eigenen Leveln.
- Hochformat, hohe Auflösung (bis 3× Pixeldichte), farbenfrohe 3D-Optik in
  Draufsicht. Von oben nach unten: Halle mit zwei Toren → gerade
  Zulieferbänder → rundes Förderband mit 3 gelb markierten Ausgabeplätzen →
  Ladestation → Rollenbahn (läuft von der Station aus nach links und rechts) →
  4 Parkbuchten → Ringstraße (Einbahn im Uhrzeigersinn) → Stau im Inneren.
- Der Stau ist ein freier, dichter Haufen ohne Rasterlinien auf hellem Beton,
  in wechselnden Formen und auch schräg.
- Verkehr: LKWs fahren vorwärts aus dem Stau, ordnen sich auf der Ringstraße
  ein, setzen rückwärts in ihre Bucht und fahren nach rechts ab. Vorfahrt hat,
  wer zuerst losgefahren ist; niemand fährt ineinander.
- Paletten sehen aus wie echte Holzpaletten mit farbiger Ladung. Beim Laden
  gleiten sie über die Rollenbahn und hüpfen auf ihren Platz im LKW.
- Transporter, LKW, Sattelzug und Anhängerzug unterscheiden sich deutlich.
- Hauptmenü wie bei einem großen Mobile-Spiel: 3D-Logo, glänzende Knöpfe; im
  Hintergrund spielt sich ein Level von selbst.
- Spielszene, LKWs und Paletten werden per Code gezeichnet (Canvas 2D, in
  voller Geräteauflösung). Logo, Menühintergrund, Booster-Icons,
  Sieg/Niederlage-Bilder und die 10 Welt-Banner sind eigene, per KI
  (ChatGPT) erzeugte Bilder in `assets/`; Originale liegen außerhalb des
  Repos in `pallet-rush-quellbilder/`.
- Einheitlicher, cleaner Stil: ruhige, helle Flächen, sehr kräftige reine
  Farben, plastische 3D-Objekte mit Licht von oben links und weichen
  Schatten nach rechts unten; keine Rausch-Texturen.
- LKWs im Hof berühren sich nie (Maßstab 0,77 des Rasters).
- Boni als runde, glänzende Medaillen-Buttons; alle Buttons metallisch
  glänzend mit Lichtreflex.
- Spielgefühl: Bildschirmwackeln bei Ruck/Abfahrt, Konfetti bei vollem LKW,
  Combo-Lob („Super!“, „Klasse!“ …) bei schnell hintereinander vollen LKWs,
  Konfetti-Regen beim Sieg, fliegende Münzen.
- Lebendiges Hauptmenü: atmender Hintergrund, rotierende Lichtstrahlen,
  ziehende Wolken, Funkeln, einfliegende Buttons.
- Ruhig: keine hektischen Dauer-Animationen. Bewegung als Reaktion auf
  Aktionen, die Bänder laufen gleichmäßig.
- Befriedigende Abfahrt: das Rolltor schließt, ein grüner Haken erscheint,
  Hupe, der LKW fährt mit Abgaswölkchen davon.
- Hauptmenü mit Bild-Hintergrund und Logo, grüner Haupt-Knopf „Spielen“.
- Farbsymbole (● ▲ ■ ★ …) für Farbenblinde lassen sich in den Einstellungen
  einschalten (Standard: aus).

- Tutorial: In Level 1–2 zeigt eine animierte Hand auf den nächsten LKW der
  Referenzlösung, bis das Level einmal geschafft ist.
- Ladebildschirm mit Logo, Level-Start-Banner, Fortschrittsleiste im HUD,
  Ladezähler („12/24“) unter jedem angedockten LKW, Rampenampeln.

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
- Offline spielbar: Service Worker `sw.js` (Code network-first, Bilder
  cache-first, Cache-Version = `VERSION`; auf localhost nur mit `?sw`).
- Vorbereitet für einen späteren Store-Release (PWA-Manifest; später z. B.
  mit Capacitor verpackbar).
