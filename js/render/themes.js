// Optik je Welt (ab v0.6.5): Boden, Betonfläche, Beete, Pflanzen und Tageszeit.
// Welten 1–10 haben je ein eigenes Thema passend zum Namen; Welten 11–20 nutzen
// dieselben Themen in Abendstimmung, Welten 21–30 bei Nacht (mit leuchtenden
// Laternen). LKWs, Paletten und Bänder werden nie eingefärbt, damit die Farben
// im Spiel eindeutig bleiben – nur die feste Szene im Hintergrund.
//
// Felder:
//   ground  [c0, c1]  Boden außerhalb aller Flächen;  groundFx: Muster darauf
//   concrete [c0, c1] Betonflächen (Hof, Platz vor den Rampen)
//   lawn    [c0, c1]  Grünflächen/Beete (Rasen, Sand, Schnee …), curb: Bordsteinfarbe
//   tree    'leaf' | 'pine' | 'palm' | 'cactus' | 'neon'
//   treePal Kronenfarben (dunkel → hell) statt der Standardbäume, bushPal ebenso
//   snow    Schneehauben auf Bäumen und Büschen

const BASE = [
  { key: 'city' },
  { key: 'harbor', ground: ['#59b9f0', '#2f8fd8'], groundFx: 'water', concrete: ['#e6edf4', '#d3dde8'] },
  { key: 'desert', ground: ['#f7dea6', '#ecc47c'], groundFx: 'sand', concrete: ['#f5ead3', '#e8d8b6'],
    lawn: ['#f3c873', '#e0a650'], curb: '#d9b98a', tree: 'cactus', bushPal: ['#6d7a2a', '#8f9c35', '#b4bf55', '#dfe69a'] },
  { key: 'snow', ground: ['#f4f8fd', '#dfe9f5'], groundFx: 'snow', concrete: ['#eef3fa', '#dfe7f2'],
    lawn: ['#ffffff', '#dfeaf7'], tree: 'pine', snow: true, bushPal: ['#1d6a45', '#2c8a5a', '#4fae76', '#a6e0bb'] },
  { key: 'neon', ground: ['#2b2350', '#17132f'], groundFx: 'grid', concrete: ['#3d3768', '#2e2953'],
    lawn: ['#5a3fb0', '#30227a'], curb: '#22e0ff', tree: 'neon', bushPal: ['#7a1d9e', '#b92fd6', '#ef6cff', '#ffd0ff'] },
  { key: 'forest', ground: ['#cfe5bf', '#b2d39f'], groundFx: 'moss', concrete: ['#efece4', '#e1ddd2'],
    lawn: ['#5cc04a', '#2f8f34'], tree: 'pine' },
  { key: 'tropic', ground: ['#fbecc4', '#f2d89c'], groundFx: 'sand', concrete: ['#f6f0e2', '#ebe1c9'],
    lawn: ['#62e47a', '#1fb35c'], tree: 'palm' },
  { key: 'factory', ground: ['#cbc6be', '#aea79d'], groundFx: 'gravel', concrete: ['#e6e4e0', '#d4d1cb'],
    lawn: ['#a5ab78', '#7d8457'], treePal: ['#4f6a2a', '#6a8636', '#8ea54a', '#c3d27e'] },
  { key: 'airport', ground: ['#b9c4d1', '#a1aebe'], groundFx: 'tarmac', concrete: ['#eef1f5', '#e0e5ec'] },
  { key: 'gold', ground: ['#f6e7bd', '#ebd393'], groundFx: 'sparkle', concrete: ['#fbf4de', '#f1e4bf'],
    lawn: ['#ffe07a', '#f2b51c'], curb: '#fff3c4', treePal: ['#b07a00', '#e0a800', '#ffd23a', '#fff3a6'] },
];

// Abweichungen einzelner Welten (Name passt sonst nicht)
const EXTRA = {
  16: { treePal: ['#a8410f', '#d9631a', '#f59a2e', '#ffd27a'], tree: 'leaf', lawn: ['#b8c95a', '#8aa63c'] }, // Herbstwald
};

export const DEFAULT_THEME = {
  key: 'city', ground: null, groundFx: null, concrete: null, lawn: null, curb: null,
  tree: 'leaf', treePal: null, bushPal: null, snow: false, time: 'day',
};

export function worldTheme(levelId) {
  if (!levelId) return { ...DEFAULT_THEME };
  const w = Math.floor((levelId - 1) / 10) + 1;
  const base = BASE[(w - 1) % 10];
  const time = w <= 10 ? 'day' : w <= 20 ? 'dusk' : 'night';
  return { ...DEFAULT_THEME, ...base, ...(EXTRA[w] || {}), time, world: w };
}
