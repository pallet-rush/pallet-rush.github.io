# Pallet Rush – Design-Dokument

Stand: 11.11.2026 · Version 0.6.3
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
| Antippen | Der LKW fährt vorwärts in Pfeilrichtung (Fahrerhaus = vorne) aus dem Hof. Ist der Weg durch einen LKW versperrt, fährt er bis an diesen heran, stößt kurz an (der Blocker blinkt) und setzt zurück – so sieht man sofort, wer im Weg steht (ab v0.4.9). Bei anderen Hindernissen ruckelt er nur kurz. |
| Rampe nötig | Ein LKW fährt nur los, wenn eine Rampe frei ist. Sonst kommt der Hinweis „Keine Rampe frei“. |
| Zuglimit | Keins. |
| Beladen | Die Schlange besteht aus Blöcken zu 4 gleichfarbigen Paletten. Die vordersten 3 noch nicht verladenen Blöcke liegen an den Ausgabeplätzen (links, Mitte, rechts) und werden jeweils als ganzer Block in einen geparkten LKW gleicher Farbe geladen (vorderster Block zuerst). Passt keiner davon, wartet die Schlange. Bei zwei passenden LKWs bekommt der den Block, dem am wenigsten bis „voll“ fehlt. Ein frei gewordener Ausgabeplatz wird mit dem nächsten Block der Schlange gefüllt. |
| Paletten-Blöcke | Paletten kommen immer in Blöcken zu 4 gleichfarbigen Paletten, die nebeneinander auf dem breiten Band fahren. Alle Ladekapazitäten (8 / 24 / 40) sind Vielfache von 4. Farbgruppen bleiben auf einer Bandseite, die Gruppen wechseln sich links/rechts ab. |
| Schlange | Feste Reihenfolge. Sie kommt aus zwei Hallentoren über gerade Zulieferbänder, die in das runde Förderband münden; beide Spuren treffen sich unten am mittleren Auslauf (seit v0.4.4 ohne Weiche und Ladestation). Man sieht etwa 20 Paletten im Voraus. |
| Abfahrt | Ein voller LKW fährt sofort ab, die Rampe ist frei. |
| Gewonnen | Alle LKWs sind voll beladen abgefahren. |
| Verloren | Alle Rampen sind belegt und keiner der 3 Blöcke an den Ausgabeplätzen passt zu einem geparkten LKW. Dann ist keine Aktion mehr möglich. |
| Undo | Gibt es nicht. |
| Leben | Kein Leben-System. Nach einer Niederlage startet man das Level sofort neu, ohne Wartezeit. |
| Warnung | Keine Einblendung bei „nur noch 1 Rampe frei“ (ab v0.5.2 entfernt, sie hat gestört). Die Niederlage wird nur gemeldet, wenn sie laut Spiellogik wirklich feststeht, also keine falschen Meldungen. |

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

## 5. Welten und Mechaniken (300 Level)

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

### Welten 11–20 (ab v0.6.0, Level 101–200)

Keine neue Mechanik mehr. Jede Welt kombiniert zwei bekannte Mechaniken, die in
jedem ihrer Level vorkommen (ab Level 6 der Welt verstärkt). Das Boss-Level
nimmt eine Mechanik der nächsten Welt dazu. Die Schwierigkeit läuft als
Sägezahn: Jede Welt beginnt etwas leichter, Level 5 ist eine Verschnaufpause,
dann steigt sie bis zum Boss-Level. Zwei Tore in einem Level gibt es hier nicht
(zu wenig Platz), stattdessen warten mehr LKWs hinter dem Tor.

| Welt | Level | Name | Mechaniken |
|---|---|---|---|
| 11 | 101–110 | Abendlager | Plane + Tor |
| 12 | 111–120 | Abendhafen | Schranke + Eilauftrag |
| 13 | 121–130 | Canyon-Depot | Anhängerzug + Kette |
| 14 | 131–140 | Gletscherpass | Kartonpaletten + Drehscheibe |
| 15 | 141–150 | Neonufer | Tor + Schranke |
| 16 | 151–160 | Herbstwald | Kette + Drehscheibe |
| 17 | 161–170 | Palmenbucht | Plane + Anhängerzug |
| 18 | 171–180 | Hüttenwerk | Eilauftrag + Kartonpaletten |
| 19 | 181–190 | Frachtflughafen | Tor + Kette |
| 20 | 191–200 | Kronlager | Schranke + Drehscheibe |

### Welten 21–30 (ab v0.6.1, Level 201–300)

Gleiches Prinzip, eine Stufe schwerer (dichter, mehr Fallen, der simulierte
Spieler gewinnt im Schnitt nur noch rund 10 %). Boss-Level hier mit 6 Fallen
(drei Mechaniken und viele LKWs, 7 ließen sich nicht erzeugen).

| Welt | Level | Name | Mechaniken |
|---|---|---|---|
| 21 | 201–210 | Nachtlager | Plane + Schranke |
| 22 | 211–220 | Mondhafen | Tor + Eilauftrag |
| 23 | 221–230 | Sternenwüste | Anhängerzug + Kartonpaletten |
| 24 | 231–240 | Polarnacht | Kette + Plane |
| 25 | 241–250 | Neonnacht | Drehscheibe + Tor |
| 26 | 251–260 | Mitternachtswald | Eilauftrag + Anhängerzug |
| 27 | 261–270 | Lagunenhafen | Kartonpaletten + Schranke |
| 28 | 271–280 | Nachtschicht | Kette + Eilauftrag |
| 29 | 281–290 | Nachtflug | Drehscheibe + Plane |
| 30 | 291–300 | Schatzkammer | Tor + Kartonpaletten |

Simulierter Spieler (Gewinnquote Ø): Welten 11–20 zwischen 9 und 17 %,
Welten 21–30 zwischen 7 und 14 %. Erzeugt parallel in Web Workern
(`tools/levelgen-worker.js`, `lg.generateParallel(von, bis, worker, versuche)`).

Weltbanner 11–30 sind Farbvarianten der Banner 1–10: Welten 11–20 in
Abendstimmung, Welten 21–30 bei Nacht (warme Lichter bleiben hell). Erzeugt mit
Pillow, ohne neue Grafiken.

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
  (gratis) oder für 250 Münzen – so viel wie die Extra-Rampe im Bonus-Laden
  (ab v0.6.2; vorher 100–250 je nach Level, also billiger als der Bonus).
- Keine Werbung, keine Echtgeld-Käufe, keine Leben, keine Wartezeiten.

## 7b. Duell (ab v0.3.8)

- Menü-Kachel „Duell“: zufälliges Level aus den letzten 15 freigeschalteten.
  Die Uhr startet beim ersten LKW (Erklärfenster zählen nicht), stoppt beim Sieg.
  Keine Boni, kein Weiterspielen; „Nochmal“ setzt die Uhr zurück. Pause stoppt die Uhr nicht.
- Herausfordern per Link ohne Server: `?duel=<base64url JSON {v,l,t,m,n}>`
  (Level, Zeit in ms, Züge, Name). Teilen über das System-Teilen-Menü,
  sonst Zwischenablage, sonst Link-Feld zum Markieren.
- Link öffnen: Fenster „X hat Level N in Zeit geschafft“ → Annehmen spielt das
  Level (auch wenn noch nicht freigeschaltet), danach Vergleich und „Zurückfordern“.
- Name einmalig abfragen (max. 14 Zeichen, gespeichert in `save.nick`);
  Namen aus Links werden bereinigt und HTML-escaped.
- Sieg im Duell: +40 Münzen, pro Herausforderung nur einmal (`save.duels`, letzte 50).
  Duelle ändern keinen Level-Fortschritt, keine Sterne, keine Fehlversuche.

## 7c. Querformat (ab v0.3.9)

- Der Spieler dreht einfach das Gerät (Manifest `orientation: any`); umgeschaltet
  wird, sobald Breite > 1,15 × Höhe (`body.land`, `view.land`).
- Szene quer: Fabrik (390 breit) links, Hof mit Ringstraße (372 breit) rechts
  daneben. Die Unterseite des Rings ist die Rampenstraße; Verkehr im
  Uhrzeigersinn, LKWs fahren nach links an den Buchten vorbei, setzen nach rechts
  zurück ein und verlassen das Bild links. Stapler kommt von links.
- Boni als Spalte am rechten Rand, HUD oben flacher; Menü: Logo links, Buttons
  rechts; Dialoge breiter und flacher, Buttons nebeneinander.
- Nach dem Drehen (ab v0.4.8): Die Leinwand wird per ResizeObserver bei jeder echten
  Größenänderung neu vermessen (iOS ändert die Höhe teils erst nach dem resize-Ereignis);
  Tipps werden zusätzlich auf die tatsächlich angezeigte Größe umgerechnet.
- Drehen während eines Levels: Abfahrende sind sofort weg, Ankommende stehen
  direkt an ihrer Rampe (oder fahren neu los, wenn sie noch belegt ist).

## 7d. Live-Duell in Echtzeit (ab v0.4.0)

- Duell-Menü: „Raum erstellen“, „Mit Code beitreten“, „Zeit-Duell per Link“ (7b).
- Raum-Code aus 4 Zeichen (ohne I/O/0/1); Link `?live=CODE` tritt direkt bei.
- Verbindung: WebRTC-Datenkanal direkt von Gerät zu Gerät. Nur der Aufbau
  (Angebot/Antwort/ICE) läuft über den öffentlichen PeerJS-Server
  (`js/net/live.js`, exaktes PeerJS-Nachrichtenformat). Kein TURN-Server:
  klappt keine direkte Verbindung in 15 s, Meldung „nicht direkt verbinden“.
- Ablauf: beide verbunden → Host wählt Level (≤ kleinerer Fortschritt beider,
  aus den letzten 15) → Countdown 3-2-1-Los, Uhr startet bei „Los“.
- HUD zeigt Name und Fortschrittsbalken des Gegners live. Neustart nach
  Verlust ist möglich, die Uhr läuft weiter. Wer zuerst fertig ist (kleinere
  Zeit), gewinnt: +30 Münzen. Danach „Revanche“ (neues Level) oder Menü.
- Verlässt der Gegner das Duell oder bricht die Verbindung ab, gibt es eine Meldung.
  Keine Boni, kein Einfluss auf Level-Fortschritt oder Sterne.

## 8. Fairness-Garantien (Level-Pipeline)

1. **Generator** stanzt eine Stau-Form (Kreis, Herz, Stern, Raute, Ring, Kreuz,
   Sanduhr, Pfeil, Welle …) und füllt sie dicht mit LKWs – nur so, dass sich
   der Hof immer räumen lässt. Der Hof steht immer gerade (ab v0.5.1; früher um
   45° gedreht, das machte die LKWs nur kleiner). Ab Welt 2 stehen zusätzlich
   LKWs **kreuz und quer** in beliebigem Winkel (Anteil `chaos`: Welt 2 bis
   knapp 20 %, dann pro Welt rund +10 %, in Welt 10 bis 85 %).
   Wer wen blockiert, wird geometrisch berechnet (`js/core/geom.js`): Ein LKW
   kommt raus, wenn der Streifen vor ihm, so breit wie er selbst, frei ist.
   Für LKWs im Raster ist das genau die alte Regel (Nachbarspuren stören nie).
2. **Referenz-Partie**: Der Generator spielt das Level mit der echten
   Spiellogik und legt dabei die Paletten-Schlange fest. Die gespielte Lösung
   wird mitgespeichert (`sol`) und beim Prüfen nachgespielt. Jedes Level ist
   damit garantiert ohne Boni lösbar.
3. **Spielraum**: Nur Level 1–2 lassen Rampen frei; alle anderen Level keine
   (ab v0.5.4 auch die Welt-Einstiegslevel nicht mehr).
4. **Schwierigkeit über Fallen** (ab v0.5.0): Die alte Messung (Erfolgsquote
   simulierter Spieler) passte nicht – Spieler schafften alles beim ersten Versuch,
   und der Solver löste jedes Level ohne einen einzigen Rückschritt. Jetzt wird entlang
   der Lösung an jeder Stelle geprüft, ob einer der zwei naheliegendsten Züge (Farbe am
   Auslauf / bald auf dem Band) das Level unlösbar macht. Jede solche Stelle ist eine
   Falle. Mindestzahl: Level 1–2: 0, Level 3–5: 1, 6–8: 2, 9: 3, 10: 4; danach je
   Welt 2 + ⌊Welt/2⌋, jedes 3. Level +1, Boss-Level +3 (höchstens 7).
   Farben: Level 1: 2, Level 2: 3, Level 3–4: 4, Level 5–6: 5, ab Level 7 sechs, ab Welt 4 sieben, ab Welt 7 alle acht.
   **Zusätzlich ab v0.5.4: simulierter Spieler.** Ein Testspieler, der den
   naheliegenden LKW nimmt, aber Züge meidet, die innerhalb von 2 Zügen sicher
   verlieren, spielt jedes Level 16-mal. Seine Gewinnquote muss in einem Band
   liegen: Level 3: 25–75 %, dann sinkend bis Level 10: 0–25 %; Welt 2: höchstens
   42 %, danach pro Welt rund 3 Punkte weniger (mindestens 12 %), Boss-Level
   höchstens 10 %. Eine Untergrenze verhindert unfair schwere Level. Vorher gewann
   dieser Spieler Welt 1–2 fast immer – genau so leicht fühlten sie sich an.
   Ergebnis v0.5.4 (Gewinnquote Ø je Welt): W1 56 %, W2 32 %, W3 15 %, W4 20 %,
   W5 18 %, W6 23 %, W7 13 %, W8 9 %, W9 5 %, W10 4 %. Mindest-LKW-Zahl je Welt
   (`minTrucks`), Dreiecke ab Welt 6 werden zum Blob (zu wenig Platz). Die
   Mindest-Feldgröße sinkt in späten Welten leicht (Welt 1–3: 24 px, 4–6: 23 px,
   7–10: 22 px), damit genug LKWs hineinpassen.
5. Ausgeliefert werden nur Level, die alle Prüfungen bestehen. Ein Prüf-Tool
   kann jederzeit den gesamten Levelbestand neu verifizieren.

## 9. Optik und Präsentation

- Orientierung an der Spielweise von Bus Traffic Fever (Aufbau, Ablauf,
  Lesbarkeit), aber mit eigener Grafik, eigenem Namen und eigenen Leveln.
- Hochformat, hohe Auflösung (bis 3× Pixeldichte), farbenfrohe 3D-Optik in
  Draufsicht. Von oben nach unten: Halle mit zwei Toren → gerade
  Zulieferbänder → rundes Förderband mit 3 gleich aussehenden, gelb markierten
  Ausläufen (je eine Reihe aus 4 Paletten; Mitte = Bandende unten, links/rechts
  direkt daneben). Jede Rutsche tritt radial genau unter ihrem Auslauf durch eine
  sichtbare Öffnung in der orangen Bandwand aus und biegt dann senkrecht zur
  Rollenbahn ab. Palettenreihen werden so dicht wie
  möglich gelegt, überschneiden sich aber auch in der Kurve nie. Die Kurve ist ein
  Halbkreis (gleicher Radius überall), daher haben die Reihen dort überall den
  gleichen Abstand → je eine Rollenrutsche hinunter zur Rollenbahn (läuft von der Mitte
  nach links und rechts) → je eine Rutsche in jede Parkbucht → Parkbuchten → Ringstraße (Einbahn im Uhrzeigersinn) → Stau im Inneren.
- Der Stau ist ein freier, dichter Haufen ohne Rasterlinien auf hellem Beton,
  in wechselnden Formen; in späteren Welten stehen viele LKWs schräg und
  durcheinander. Der Hof wird mittig und so groß wie möglich eingepasst.
- Torhallen (ab v0.5.1) stehen ganz außen am Stau, das Tor zeigt in den Hof.
  Die Halle ist 1,2 Spuren breit und 2,5 Felder tief (ein LKW passt hinein),
  graues Dach mit Oberlicht, orange Kante, offenes Tor mit Warnstreifen; die
  Zahl der wartenden LKWs steht auf dem Dach. Neue LKWs fahren unter dem
  Hallendach hervor.
- Schranken (ab v0.5.3) sehen aus wie echte Schranken: hohe rote Antriebssäule
  mit Signallicht (rot/grün), dicker rot-weißer Schlagbaum über die ganze Spur,
  gelber Auflagepfosten, Warnstreifen und Haltelinie am Boden; in der Höhe
  passend zu den LKWs. Die orange Zahl zeigt die noch nötigen Abfahrten.
- Verkehr: LKWs fahren vorwärts aus dem Stau, ordnen sich auf der Ringstraße
  ein, setzen rückwärts in ihre Bucht und fahren nach rechts ab. Vorfahrt hat,
  wer zuerst losgefahren ist; niemand fährt ineinander.
- Die drei Ausläufe arbeiten gleichzeitig (ab v0.4.9): Jeder schickt seine Paletten der
  Reihe nach über seine eigene Rutsche, mehrere Rutschen laufen parallel.
- Seitenregel (ab v0.6.3): Das linke Zulieferband beliefert nur den linken und den
  mittleren Auslauf, das rechte nur den rechten und den mittleren. Kein Block fährt
  quer über die Mitte. Sind eigener und mittlerer Auslauf belegt, wartet der dritte
  Block derselben Seite spielbar (gelb markiert) in der Reihe direkt hinter seinem
  Auslauf und läuft über dieselbe Rutsche; wird vorne etwas frei, rückt er nach.
- Paletten sehen aus wie echte Holzpaletten mit farbiger Ladung. Beim Laden
  rutschen sie von ihrem eigenen Auslauf über die Rutsche auf die Rollenbahn,
  von dort über die Rutsche der Bucht und hüpfen auf ihren Platz im LKW.
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
- LKWs im Hof berühren sich nie (Maßstab 0,9 des Rasters, ab v0.5.4; vorher 0,77).
- Damit die LKWs gut antippbar bleiben, ist ein Feld im Hochformat mindestens
  24 px groß (iPhone-Maß, Hof 300 × 204 px). Der Generator verwirft Level, deren
  Stau dafür zu breit oder zu hoch ist. Ein Tipp zählt auch knapp neben einem
  LKW (bis ein gutes halbes Feld); dann gilt der nächstgelegene LKW.
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
- Homescreen-App im Modus `standalone` (ab v0.4.2). `fullscreen` ließ unter iOS 26
  unten einen Streifen in Höhe der Statusleiste (62 px): Die Webansicht war nur
  894 statt 956 px hoch, CSS kann darunter nicht zeichnen.
- Ab v0.4.3: Statusleiste `black` (nicht durchscheinend). iOS 26 gibt der App
  ohnehin nur Bildschirm minus Statusleiste; so liegt die Ansicht darunter und
  reicht bis ganz unten. Kein Auffüllen per `screen.height` mehr (rutschte ins
  Unsichtbare).
- Auto-Update (ab v0.4.1): beim Start, bei Rückkehr in die App und alle 5 Min.
  wird `js/version.js` online geprüft; ist sie neuer, lädt die App neu – nur im
  Menü (nie im Level, Duell oder Dialog), höchstens einmal pro Version und Sitzung.
- Vorbereitet für einen späteren Store-Release (PWA-Manifest; später z. B.
  mit Capacitor verpackbar).
