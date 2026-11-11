// Optik je Welt (ab v0.6.5): Boden, Betonfläche, Beete, Pflanzen und Tageszeit.
// Welten 1–10 haben je ein eigenes Thema passend zum Namen; Welten 11–15 nutzen
// ausgewählte Themen in Abendstimmung bzw. bei Nacht (mit leuchtenden
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

// Herbstlaub statt Tannen (Welt „Herbstwald“)
const AUTUMN = { treePal: ['#a8410f', '#d9631a', '#f59a2e', '#ffd27a'], tree: 'leaf', lawn: ['#b8c95a', '#8aa63c'] };

// Ab v0.6.6: 20 Level je Welt → 15 Welten. Welten 1–10 bei Tag (je ein Grundthema),
// 11–15 die schönsten Abend-/Nachtvarianten. Index = Welt-1, base = Index in BASE.
export const WORLD_SIZE = 20;
const WORLD_LOOK = [
  ...BASE.map((_, i) => ({ base: i, time: 'day' })),
  { base: 1, time: 'dusk' },                 // 11 Abendhafen
  { base: 5, time: 'dusk', extra: AUTUMN },  // 12 Herbstwald
  { base: 2, time: 'night' },                // 13 Sternenwüste
  { base: 4, time: 'night' },                // 14 Neonnacht
  { base: 9, time: 'night' },                // 15 Schatzkammer
];

export const DEFAULT_THEME = {
  key: 'city', ground: null, groundFx: null, concrete: null, lawn: null, curb: null,
  tree: 'leaf', treePal: null, bushPal: null, snow: false, time: 'day',
};

export function worldTheme(levelId) {
  if (!levelId) return { ...DEFAULT_THEME };
  const w = Math.floor((levelId - 1) / WORLD_SIZE) + 1;
  const look = WORLD_LOOK[Math.min(w, WORLD_LOOK.length) - 1];
  return { ...DEFAULT_THEME, ...BASE[look.base], ...(look.extra || {}), time: look.time, world: w };
}
