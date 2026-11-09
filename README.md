# Pallet Rush

Ein Stau- und Lade-Rätsel für iPhone und Android, das direkt im Browser läuft.
Tippe LKWs aus dem Stau, stell sie an die Laderampen und lass die passenden
Paletten vom Förderband einladen.

created by Nino Bernhardt

- Kostenlos, keine Werbung, keine Käufe
- Jedes Level ist vom Solver geprüft und ohne Boni lösbar
- Spielstand wird lokal im Browser gespeichert

Alle Spielregeln und Entscheidungen stehen in [DESIGN.md](DESIGN.md).

## Projektstruktur

```
index.html            Einstieg, Menüs (HTML)
css/style.css         Gestaltung der Menüs
js/version.js         Versionsnummer (bei jedem Update erhöhen!)
js/main.js            Start, Menüs, Dialoge, Boni
js/save.js            Spielstand + Migrationen
js/i18n.js            Texte Deutsch/Englisch
js/core/              Spiellogik, Solver, Generator (ohne Grafik)
js/render/            Zeichnen und Animation (Canvas)
js/data/levelplan.js  Bauplan der 100 Level (Welten, Mechaniken, Schwierigkeit)
js/data/levels.js     Level (generiert, vom Solver geprüft)
tools/                Dev-Server, Level-Generator und Prüf-Tool
```

## Lokal starten

Voraussetzung: Python 3 (ist installiert).

```bash
python tools/devserver.py
```

Dann im Browser http://localhost:8080 öffnen. Mit `?dev` in der Adresse
(http://localhost:8080/?dev) sind alle Level freigeschaltet.

Level-Generator und Prüf-Tool: http://localhost:8080/tools/levelgen.html

## Online stellen (GitHub Pages)

GitHub-Benutzer: `54fdndddz4-cloud`

### Einmalig: Repository anlegen und hochladen

1. Auf github.com ein neues, **öffentliches** Repository `pallet-rush` anlegen
   (ohne README, ohne .gitignore, das Projekt hat beides schon).
2. Im Projektordner:

   ```bash
   git add .
   git commit -m "Pallet Rush 0.2.0"
   git branch -M main
   git remote add origin https://github.com/54fdndddz4-cloud/pallet-rush.git
   git push -u origin main
   ```

3. Auf GitHub im Repository: **Settings → Pages → Build and deployment**,
   Source „Deploy from a branch“, Branch `main`, Ordner `/ (root)`, Save.
4. Nach 1–2 Minuten läuft das Spiel unter
   `https://54fdndddz4-cloud.github.io/pallet-rush/`

Auf dem Handy die Seite öffnen und „Zum Home-Bildschirm hinzufügen“ wählen
(iPhone: Teilen-Knopf in Safari, Android: Menü in Chrome). Dann startet das
Spiel wie eine App im Vollbild.

### Updates ausrollen

1. Änderungen machen und lokal testen (`python tools/devserver.py`).
2. In `js/version.js` die Versionsnummer erhöhen (z. B. 0.2.0 → 0.2.1).
3. Hochladen:

   ```bash
   git add .
   git commit -m "Version 0.2.1: kurze Beschreibung"
   git push
   ```

4. GitHub Pages veröffentlicht automatisch in 1–2 Minuten. Am Handy die Seite
   neu laden. Im Hauptmenü unten steht die Version, daran siehst du, ob die
   neue Version angekommen ist (GitHub speichert Dateien bis zu 10 Minuten
   zwischen).

### Spielstand bleibt erhalten

Der Spielstand liegt im Browser des Spielers (localStorage) und wird von einem
Update nie gelöscht. Ändert sich der Aufbau des Spielstands, wird in
`js/save.js` die `SCHEMA`-Nummer erhöht und eine Migration ergänzt. Vorher wird
automatisch eine Sicherung angelegt. Wichtig: Adresse (Benutzername und
Repository-Name) nicht ändern, sonst sieht der Browser eine neue Seite mit
leerem Spielstand.

### Level ändern

`js/data/levelplan.js` anpassen, dann im Level-Generator
(http://localhost:8080/tools/levelgen.html) die betroffenen Level neu erzeugen,
„Speichern“ und „Prüfen“. Achtung: Neu erzeugte Level ersetzen die alten. Bei
schon veröffentlichten Leveln nur ändern, wenn nötig.
