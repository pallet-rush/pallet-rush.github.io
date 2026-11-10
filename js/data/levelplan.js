// Parameterplan für den Level-Generator (100 Level, 10 Welten).
// Wird nur von tools/levelgen.html genutzt, nicht vom Spiel selbst.
// Bedeutung der Parameter: siehe js/core/generator.js.
//
// Abwechslung: Jedes Level hat eine eigene Stau-Form (Herz, Stern, Kreis …),
// mal gerade, mal schräg (45°). Schwierigkeit steigt über
//  - mehr LKWs und Farben,
//  - dichteren Stau,
//  - kleinere Paletten-Pakete (die Schlange wechselt öfter die Farbe),
//  - target = Erfolgsquote simulierter Spieler (hoch = leicht).
//  Seit v0.3.2 liegen 3 Blöcke gleichzeitig an den Ausgabeplätzen; damit es ein
//  Rätsel bleibt, sind die Zielbänder deutlich niedriger und der Spielraum knapper.
// Das erste Level jeder Welt ist leichter (neue Mechanik lernen).

const base = { ramps: 4, playouts: 60, slack: 2 };

// Formen-Reihenfolge: keine zwei gleichen hintereinander
const SHAPE_CYCLE = [
  'circle', 'heart', 'diamond', 'star', 'hexagon', 'cross', 'blob', 'triangle',
  'ring', 'hourglass', 'arrow', 'wave', 'rect',
];

// Welt 1: Grundkurs (handverlesen)
const WORLD1 = [
  { shape: 'rect', angle: 0, R: 2.6, density: 0.55, colors: 2, mix: { S: 1 }, chunk: [4, 8], stay: 0.7, deep: 0, target: [0.85, 1], slack: 2 },
  { shape: 'circle', angle: 0, R: 3.2, density: 0.6, colors: 3, mix: { S: 3, M: 1 }, chunk: [4, 8], stay: 0.6, deep: 0.1, target: [0.7, 0.95], slack: 2 },
  { shape: 'diamond', angle: 45, R: 3.4, density: 0.62, colors: 3, mix: { S: 3, M: 1 }, chunk: [3, 7], stay: 0.6, deep: 0.15, target: [0.5, 0.8], slack: 1 },
  { shape: 'heart', angle: 0, R: 3.8, density: 0.64, colors: 3, mix: { S: 3, M: 2 }, chunk: [3, 7], stay: 0.55, deep: 0.2, target: [0.4, 0.7], slack: 1 },
  { shape: 'hexagon', angle: 45, R: 4.0, density: 0.66, colors: 4, mix: { S: 3, M: 2, L: 0.5 }, chunk: [3, 6], stay: 0.5, deep: 0.25, target: [0.35, 0.6], slack: 1 },
  { shape: 'star', angle: 0, R: 4.4, density: 0.66, colors: 4, mix: { S: 3, M: 2, L: 1 }, chunk: [3, 6], stay: 0.5, deep: 0.3, target: [0.3, 0.55], slack: 1 },
  { shape: 'cross', angle: 45, R: 4.6, density: 0.68, colors: 4, mix: { S: 3, M: 2, L: 1 }, chunk: [2, 6], stay: 0.5, deep: 0.3, target: [0.25, 0.5], slack: 1 },
  { shape: 'blob', angle: 0, R: 4.8, density: 0.7, colors: 5, mix: { S: 3, M: 2, L: 1 }, chunk: [2, 6], stay: 0.45, deep: 0.35, target: [0.22, 0.45], slack: 1 },
  { shape: 'triangle', angle: 0, R: 5.0, density: 0.7, colors: 5, mix: { S: 3, M: 2, L: 1 }, chunk: [2, 5], stay: 0.45, deep: 0.35, target: [0.2, 0.42], slack: 1 },
  { shape: 'ring', angle: 45, R: 5.2, density: 0.7, colors: 5, mix: { S: 3, M: 2, L: 1 }, chunk: [2, 5], stay: 0.4, deep: 0.4, target: [0.12, 0.35], slack: 0 },
].map((p) => ({ ...base, ...p }));

// Welten 2–10: Parameter folgen einer Kurve, plus die Mechanik der Welt.
function worldLevel(w, j) {
  const n = 10 + w * 10 + j; // Index 0-basiert
  const intro = j === 0;
  const k = intro ? 0 : j;
  const lvl = w + k * 0.1; // grobe Stufe 1 … 10
  const p = {
    ...base,
    shape: SHAPE_CYCLE[(n * 5) % SHAPE_CYCLE.length],
    angle: (n % 3 === 1) ? 0 : 45,
    R: Math.min(6.4, 4.4 + lvl * 0.22 + (intro ? -0.4 : 0)),
    density: Math.min(0.82, 0.66 + lvl * 0.018),
    maxTrucks: 34,
    colors: Math.min(8, 4 + Math.floor(lvl / 2.2)),
    mix: { S: 3, M: 2, L: 1 + lvl * 0.08 },
    chunk: [Math.max(1, 3 - Math.floor(lvl / 4)), Math.max(3, 6 - Math.floor(lvl / 3))],
    stay: Math.max(0.15, 0.45 - lvl * 0.03),
    deep: Math.min(0.75, 0.35 + lvl * 0.04),
    // Jedes 3. Level ist knackiger (weniger Spielraum), das 10. ist ein Boss-Level.
    slack: intro ? 1 : j === 9 || j % 3 === 2 ? 0 : 1,
    target: intro
      ? [0.4, 0.75]
      : j === 9
        ? [Math.max(0.03, 0.15 - w * 0.01), Math.max(0.15, 0.3 - w * 0.015)]
        : [Math.max(0.08, 0.38 - k * 0.02 - w * 0.02), Math.max(0.25, 0.7 - k * 0.025 - w * 0.03)],
  };
  // Ringe und Kreuze haben wenig Fläche: etwas größer
  if (p.shape === 'ring' || p.shape === 'cross' || p.shape === 'star') p.R = Math.min(6.6, p.R + 0.5);
  // Mechanik der Welt (stark) und frühere Mechaniken (gelegentlich)
  if (w === 1) p.hidden = 0.35 + k * 0.03; else if (w > 1 && j % 3 === 1) p.hidden = 0.25;
  if (w === 2) { p.gates = k >= 5 ? 2 : 1; p.gateQ = [2, 3]; } else if (w > 2 && j % 3 === 2) { p.gates = 1; p.gateQ = [2, 2]; }
  if (w === 3) { p.barriers = k >= 5 ? 2 : 1; p.barrierN = [2, 4]; } else if (w > 3 && j % 3 === 0 && !intro) { p.barriers = 1; p.barrierN = [2, 3]; }
  if (w === 4) p.rush = k >= 6 ? 2 : 1; else if (w > 4 && j % 4 === 3) p.rush = 1;
  if (w === 5) p.mix.T = 1.5; else if (w > 5) p.mix.T = 0.6;
  if (w === 6) p.chains = k >= 5 ? 2 : 1; else if (w > 6 && j % 4 === 1) p.chains = 1;
  if (w === 7) p.covered = 0.2 + k * 0.02; else if (w > 7 && j % 3 === 2) p.covered = 0.15;
  if (w === 8) p.turntables = k >= 6 ? 2 : 1; else if (w > 8 && j % 2 === 1) p.turntables = 1;
  // Die Welt-Mechanik muss in jedem Level der Welt wirklich vorkommen.
  const req = [null, 'hidden', 'gate', 'barrier', 'rush', 'trailer', 'chain', 'covered', 'turntable', null][w];
  if (req) p.require = req;
  return p;
}

export const LEVEL_PLAN = [...WORLD1];
for (let w = 1; w <= 9; w++) for (let j = 0; j < 10; j++) LEVEL_PLAN.push(worldLevel(w, j));

// Welt-Infos (Level-Nummer, an der die Mechanik eingeführt wird)
export const WORLDS = [
  { from: 1, mech: null },
  { from: 11, mech: 'hidden' },
  { from: 21, mech: 'gate' },
  { from: 31, mech: 'barrier' },
  { from: 41, mech: 'rush' },
  { from: 51, mech: 'trailer' },
  { from: 61, mech: 'chain' },
  { from: 71, mech: 'covered' },
  { from: 81, mech: 'turntable' },
  { from: 91, mech: 'master' },
];
