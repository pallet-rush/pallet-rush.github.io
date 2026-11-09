// Gemeinsame Konstanten für Spiellogik, Solver, Generator und Darstellung.

// Richtungen: Kopf des LKWs zeigt in diese Richtung, er fährt dorthin raus.
export const DIRS = {
  U: [0, -1],
  D: [0, 1],
  L: [-1, 0],
  R: [1, 0],
};

// Fahrzeuggrößen: Länge in Feldern und Ladekapazität in Paletten.
// T = Anhängerzug mit zwei Abteilen (caps), jedes Abteil hat eine eigene Farbe.
export const SIZES = {
  S: { len: 2, cap: 8, caps: [8], name: 'van' },
  M: { len: 3, cap: 24, caps: [24], name: 'truck' },
  L: { len: 4, cap: 40, caps: [40], name: 'semi' },
  T: { len: 5, cap: 16, caps: [8, 8], name: 'trailer' },
};

// Drehscheibe: Reihenfolge im Uhrzeigersinn.
export const CLOCKWISE = ['U', 'R', 'D', 'L'];

// Farbcode einer Palette: 0–7 Farbe, +16 = Karton (Farbe verdeckt).
export const COVER = 16;
export const colorOf = (code) => code & 15;

// Nachschub-String: '0'–'7' normale Palette, 'a'–'h' Kartonpalette.
export function parseSupply(str) {
  const out = new Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    out[i] = ch >= 97 ? ch - 97 + COVER : ch - 48;
  }
  return out;
}

// Palettenfarben. Index = Farbcode in den Leveldaten.
export const COLORS = [
  { key: 'red',    hex: '#e5484d', dark: '#a8262b', symbol: '●' },
  { key: 'blue',   hex: '#3b82f6', dark: '#1d4fb8', symbol: '▲' },
  { key: 'yellow', hex: '#f5c400', dark: '#b08a00', symbol: '■' },
  { key: 'green',  hex: '#2fa865', dark: '#1a6e3f', symbol: '★' },
  { key: 'purple', hex: '#8e4ec6', dark: '#5c2d8a', symbol: '◆' },
  { key: 'orange', hex: '#f7791a', dark: '#b4520a', symbol: '✚' },
  { key: 'teal',   hex: '#12a5a0', dark: '#0a6b68', symbol: '♥' },
  { key: 'pink',   hex: '#ef5da8', dark: '#a8306d', symbol: '✿' },
];

// Zustände eines LKWs.
export const LOT = 0;   // steht im Hof
export const RAMP = 1;  // steht an einer Rampe
export const GONE = 2;  // voll beladen abgefahren
export const WAIT = 3;  // wartet noch im Tor

// Inhalt eines Hof-Feldes.
export const EMPTY = -1;
export const OBST = -2; // Tor oder Schranke
