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
//   hall    Fabrikhalle (ab v0.7.0): roof/cap/wall [c0, c1], bands [oben, Mitte, unten],
//           sign [Rand, hell, dunkel], wallFx 'brick'|'planks'|'glass', roofFx
//           'snow'|'sand'|'neon'|'chimney'|'moss'|'gold'|'containers'|'thatch'|'radar'
//   belt    Farbe der Förderband-Wände
//   truck   Fahrzeug-Details (siehe VSTYLE in vehicles.js); Abend/Nacht schalten das Licht an

const BASE = [
  { key: 'city' },
  { key: 'harbor', hall: { roof: ['#5f7d8f', '#7b98aa'], cap: ['#1d4f7a', '#0d2a4a'], wall: ['#eaf4f9', '#cfe1ec'],
      bands: ['#ff5a36', '#14375e', '#ffffff'], sign: ['#0d2a4a', '#2a7cbf', '#0f4a80'], roofFx: 'containers' },
    belt: '#ff5a36', truck: { stripe: '#ffffff', rims: '#f1f4f7' } , ground: ['#59b9f0', '#2f8fd8'], groundFx: 'water', concrete: ['#e6edf4', '#d3dde8'] },
  { key: 'desert', hall: { roof: ['#d9b98a', '#ead2a8'], cap: ['#d0703f', '#9c4424'], wall: ['#f7e6c6', '#e9cba0'],
      bands: ['#c8643a', '#7a3b1e', '#2fa6a0'], sign: ['#6a3016', '#d97a45', '#a0481f'], roofFx: 'sand' },
    belt: '#d0703f', truck: { dust: '#c79a5a', rims: '#d9b98a' } , ground: ['#f7dea6', '#ecc47c'], groundFx: 'sand', concrete: ['#f5ead3', '#e8d8b6'],
    lawn: ['#f3c873', '#e0a650'], curb: '#d9b98a', tree: 'cactus', bushPal: ['#6d7a2a', '#8f9c35', '#b4bf55', '#dfe69a'] },
  { key: 'snow', hall: { roof: ['#f4f8fd', '#e1ebf6'], cap: ['#d6342b', '#a51f18'], wall: ['#9a6644', '#76492e'],
      bands: ['#ffffff', '#a51f18', '#ffcc00'], sign: ['#6a120e', '#e0392f', '#b0221a'], wallFx: 'planks', roofFx: 'snow' },
    belt: '#e0392f', truck: { snow: true } , ground: ['#f4f8fd', '#dfe9f5'], groundFx: 'snow', concrete: ['#eef3fa', '#dfe7f2'],
    lawn: ['#ffffff', '#dfeaf7'], tree: 'pine', snow: true, bushPal: ['#1d6a45', '#2c8a5a', '#4fae76', '#a6e0bb'] },
  { key: 'neon', hall: { roof: ['#2a2550', '#3a3368'], cap: ['#ff2fd0', '#a10f95'], wall: ['#34306a', '#211d48'],
      bands: ['#22e0ff', '#ff2fd0', '#ffe000'], sign: ['#160b33', '#ff2fd0', '#7a1fd6'], wallFx: 'glass', roofFx: 'neon' },
    belt: '#b92fd6', truck: { stripe: '#22e0ff', glow: '#22e0ff', rims: '#2a2550' } , ground: ['#2b2350', '#17132f'], groundFx: 'grid', concrete: ['#3d3768', '#2e2953'],
    lawn: ['#5a3fb0', '#30227a'], curb: '#22e0ff', tree: 'neon', bushPal: ['#7a1d9e', '#b92fd6', '#ef6cff', '#ffd0ff'] },
  { key: 'forest', hall: { roof: ['#5d7a4a', '#738f5c'], cap: ['#7a4a28', '#55301a'], wall: ['#c99a6b', '#a8774a'],
      bands: ['#55301a', '#2f8f34', '#ffcc00'], sign: ['#33200e', '#3aa040', '#1f6a26'], wallFx: 'planks', roofFx: 'moss' },
    belt: '#8a5a2c', truck: { dust: '#6b4a2a' } , ground: ['#cfe5bf', '#b2d39f'], groundFx: 'moss', concrete: ['#efece4', '#e1ddd2'],
    lawn: ['#5cc04a', '#2f8f34'], tree: 'pine' },
  { key: 'tropic', hall: { roof: ['#e3c27a', '#f0d9a2'], cap: ['#19c3b4', '#0d8f86'], wall: ['#fff3df', '#f4dfc0'],
      bands: ['#ff7a59', '#19c3b4', '#ffd23a'], sign: ['#0b5f59', '#22d1c2', '#0d8f86'], roofFx: 'thatch' },
    belt: '#19c3b4', truck: { stripe: '#ffd23a', rims: '#ffffff' } , ground: ['#fbecc4', '#f2d89c'], groundFx: 'sand', concrete: ['#f6f0e2', '#ebe1c9'],
    lawn: ['#62e47a', '#1fb35c'], tree: 'palm' },
  { key: 'factory', hall: { roof: ['#7d6a5a', '#948170'], cap: ['#4a4f57', '#2b2f35'], wall: ['#b5523b', '#8f3c2a'],
      bands: ['#ffcc00', '#2f343b', '#ffcc00'], sign: ['#16191d', '#5a616b', '#2f343b'], wallFx: 'brick', roofFx: 'chimney' },
    belt: '#ffb300', truck: { dust: '#4a4a4a', rims: '#ffcc00' } , ground: ['#cbc6be', '#aea79d'], groundFx: 'gravel', concrete: ['#e6e4e0', '#d4d1cb'],
    lawn: ['#a5ab78', '#7d8457'], treePal: ['#4f6a2a', '#6a8636', '#8ea54a', '#c3d27e'] },
  { key: 'airport', hall: { roof: ['#c9d2dc', '#dde4ec'], cap: ['#f4f6f9', '#c9d2dc'], wall: ['#d4e9f8', '#a9cdea'],
      bands: ['#e52b2b', '#1f3b70', '#ffffff'], sign: ['#0f2244', '#2a55a0', '#15305c'], wallFx: 'glass', roofFx: 'radar' },
    belt: '#e52b2b', truck: { beacon: true, stripe: '#ff9a10' } , ground: ['#b9c4d1', '#a1aebe'], groundFx: 'tarmac', concrete: ['#eef1f5', '#e0e5ec'] },
  { key: 'gold', hall: { roof: ['#c99a2e', '#e6bb4c'], cap: ['#ffd23a', '#d39a00'], wall: ['#fff8e1', '#f6e7bd'],
      bands: ['#d39a00', '#7a1f9e', '#ffe07a'], sign: ['#4a2f00', '#f2b51c', '#b07a00'], roofFx: 'gold' },
    belt: '#e0a800', truck: { stripe: '#ffd23a', rims: '#ffd23a' } , ground: ['#f6e7bd', '#ebd393'], groundFx: 'sparkle', concrete: ['#fbf4de', '#f1e4bf'],
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
  hall: null, belt: '#ff8a00', truck: {},
};

// Fahrzeug-Stil inkl. Tageszeit (Scheinwerfer an)
export function truckStyle(theme) {
  const lights = theme.time === 'night' ? 1 : theme.time === 'dusk' ? 0.55 : 0;
  return { ...(theme.truck || {}), lights };
}

export function worldTheme(levelId) {
  if (!levelId) return { ...DEFAULT_THEME };
  const w = Math.floor((levelId - 1) / WORLD_SIZE) + 1;
  const look = WORLD_LOOK[Math.min(w, WORLD_LOOK.length) - 1];
  return { ...DEFAULT_THEME, ...BASE[look.base], ...(look.extra || {}), time: look.time, world: w };
}
