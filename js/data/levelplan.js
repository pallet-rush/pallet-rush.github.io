// Parameterplan für den Level-Generator (300 Level in 30 Abschnitten zu 10; im Spiel 15 Welten à 20).
// v0.7.0: alle Level ab 11 schwerer (mehr LKWs, schwächere Gewinnquote des simulierten Spielers), Level 4 und 8
// jedes Abschnitts sind lange Level (siehe makeLong).
// Wird nur von tools/levelgen.html genutzt, nicht vom Spiel selbst.
// Bedeutung der Parameter: siehe js/core/generator.js.
//
// Abwechslung: Jedes Level hat eine eigene Stau-Form (Herz, Stern, Kreis …),
// der Hof steht immer gerade (ab v0.5.1). Ab Welt 2 stehen immer mehr LKWs
// kreuz und quer (chaos = Anteil frei gestellter LKWs). Schwierigkeit steigt über
//  - mehr LKWs und Farben,
//  - dichteren Stau,
//  - kleinere Paletten-Pakete (die Schlange wechselt öfter die Farbe),
//  - target = Erfolgsquote simulierter Spieler (hoch = leicht).
//  Seit v0.3.2 liegen 3 Blöcke gleichzeitig an den Ausgabeplätzen; damit es ein
//  Rätsel bleibt, sind die Zielbänder deutlich niedriger und der Spielraum knapper.
// Das erste Level jeder Welt ist leichter (neue Mechanik lernen).

// minCell: Feldgröße im Hochformat mindestens 24 px → LKWs groß genug zum Antippen (ab v0.5.4)
const base = { ramps: 4, playouts: 60, slack: 2, minCell: 24 };

// Ab v0.5.4: höchste Gewinnquote eines simulierten Spielers, der 2 Züge vorausdenkt.
// Vorher gewann er Welt 1–2 fast immer – so leicht fühlten sich die Level auch an.
const W1_HUMAN = [1, 1, 0.75, 0.65, 0.55, 0.5, 0.45, 0.4, 0.35, 0.25];
const W1_HUMAN_LO = [0, 0, 0.25, 0.2, 0.15, 0.12, 0.1, 0.1, 0.06, 0];
const R_MAX = 5.0;

// Formen-Reihenfolge: keine zwei gleichen hintereinander
const SHAPE_CYCLE = [
  'circle', 'heart', 'diamond', 'star', 'hexagon', 'cross', 'blob', 'triangle',
  'ring', 'hourglass', 'arrow', 'wave', 'rect',
];

// Ab v0.5.0: Schwierigkeit über Fallen statt Erfolgsquote. traps = Mindestzahl an
// Stellen, an denen einer der zwei naheliegendsten Züge das Level unlösbar macht.
// Dazu mehr Farben (bis 8) und kein Spielraum (slack 0) außer in den ersten Leveln.
const W1_HARD = [
  { colors: 2, traps: 0 },
  { colors: 3, traps: 0 },
  { colors: 4, traps: 1, slack: 0 },
  { colors: 4, traps: 1, slack: 0 },
  { colors: 5, traps: 1, slack: 0 },
  { colors: 5, traps: 2, slack: 0 },
  { colors: 6, traps: 2, slack: 0 },
  { colors: 6, traps: 2, slack: 0 },
  { colors: 6, traps: 3, slack: 0 },
  { colors: 6, traps: 4, slack: 0 },
];

// Welt 1: Grundkurs (handverlesen)
const WORLD1 = [
  { shape: 'rect', angle: 0, R: 2.6, density: 0.55, colors: 2, mix: { S: 1 }, chunk: [4, 8], stay: 0.7, deep: 0, target: [0.85, 1], slack: 2 },
  { shape: 'circle', angle: 0, R: 3.2, density: 0.6, colors: 3, mix: { S: 3, M: 1 }, chunk: [4, 8], stay: 0.6, deep: 0.1, target: [0.7, 0.95], slack: 2 },
  { shape: 'diamond', angle: 0, R: 3.4, density: 0.62, colors: 3, mix: { S: 3, M: 1 }, chunk: [3, 7], stay: 0.6, deep: 0.15, target: [0.5, 0.8], slack: 1 },
  { shape: 'heart', angle: 0, R: 3.8, density: 0.64, colors: 3, mix: { S: 3, M: 2 }, chunk: [3, 7], stay: 0.55, deep: 0.2, target: [0.4, 0.7], slack: 1 },
  { shape: 'hexagon', angle: 0, R: 4.0, density: 0.66, colors: 4, mix: { S: 3, M: 2, L: 0.5 }, chunk: [3, 6], stay: 0.5, deep: 0.25, target: [0.35, 0.6], slack: 1 },
  { shape: 'star', angle: 0, R: 4.4, density: 0.66, colors: 4, mix: { S: 3, M: 2, L: 1 }, chunk: [3, 6], stay: 0.5, deep: 0.3, target: [0.3, 0.55], slack: 1 },
  { shape: 'cross', angle: 0, R: 4.6, density: 0.68, colors: 4, mix: { S: 3, M: 2, L: 1 }, chunk: [2, 6], stay: 0.5, deep: 0.3, target: [0.25, 0.5], slack: 1 },
  { shape: 'blob', angle: 0, R: 4.8, density: 0.7, colors: 5, mix: { S: 3, M: 2, L: 1 }, chunk: [2, 6], stay: 0.45, deep: 0.35, target: [0.22, 0.45], slack: 1 },
  { shape: 'triangle', angle: 0, R: 5.0, density: 0.7, colors: 5, mix: { S: 3, M: 2, L: 1 }, chunk: [2, 5], stay: 0.45, deep: 0.35, target: [0.2, 0.42], slack: 1 },
  { shape: 'ring', angle: 0, R: 5.2, density: 0.7, colors: 5, mix: { S: 3, M: 2, L: 1 }, chunk: [2, 5], stay: 0.4, deep: 0.4, target: [0.12, 0.35], slack: 0 },
].map((p, i) => ({ ...base, ...p, ...W1_HARD[i], human: W1_HUMAN[i], humanLo: W1_HUMAN_LO[i], R: Math.min(R_MAX, p.R) }));

// Ab v0.7.0: Lange Level (je Zehnerblock Level 4 und 8): mehr und größere LKWs
// (mehr Paletten) und – sobald Tore bekannt sind – ein Tor mit 4–6 wartenden LKWs.
const isLong = (j) => j === 3 || j === 7;
function makeLong(p, gateOk, trailerOk) {
  p.long = true;
  p.mix = { ...p.mix, L: (p.mix.L || 1) + 0.8 };
  if (trailerOk) p.mix.T = (p.mix.T || 0) + 0.8;
  p.minTrucks += 2;
  if (p.gates) p.gateQ = [Math.max(p.gateQ[0], 4), Math.max(p.gateQ[1], 6)];
  else if (gateOk && !(p.barriers >= 2)) { p.gates = 1; p.gateQ = [4, 6]; }
}

// Welten 2–10: Parameter folgen einer Kurve, plus die Mechanik der Welt.
function worldLevel(w, j) {
  const n = 10 + w * 10 + j; // Index 0-basiert
  const intro = j === 0;
  const k = intro ? 0 : j;
  const lvl = w + k * 0.1; // grobe Stufe 1 … 10
  // Spätere Welten dürfen etwas kleinere Felder haben (mehr LKWs passen hinein)
  const minCell = w <= 2 ? 24 : w <= 5 ? 23 : 22;
  const rMax = (R_MAX * 24) / minCell;
  const p = {
    ...base,
    minCell,
    // Mindestens so viele LKWs, damit späte Level nicht dünn wirken
    minTrucks: intro ? 9 + w : 10 + w + Math.floor(k / 4),
    shape: SHAPE_CYCLE[(n * 5) % SHAPE_CYCLE.length],
    angle: 0,
    // Kreuz und quer: Anteil schräg gestellter LKWs steigt Welt für Welt
    chaos: intro ? Math.max(0, 0.1 * (w - 2)) : Math.min(0.85, Math.max(0, 0.1 * w + 0.02 * k - 0.1)),
    R: Math.min(rMax, 4.3 + lvl * 0.17 + (intro ? -0.2 : 0)),
    density: Math.min(0.82, 0.66 + lvl * 0.018),
    maxTrucks: 34,
    colors: Math.min(8, 6 + Math.floor(lvl / 3) - (intro ? 1 : 0)),
    mix: { S: 3, M: 2, L: 1 + lvl * 0.08 },
    chunk: [Math.max(1, 3 - Math.floor(lvl / 4)), Math.max(3, 6 - Math.floor(lvl / 3))],
    stay: Math.max(0.15, 0.45 - lvl * 0.03),
    deep: Math.min(0.75, 0.35 + lvl * 0.04),
    // Jedes 3. Level ist knackiger (weniger Spielraum), das 10. ist ein Boss-Level.
    slack: 0,
    // Fallen: steigen pro Welt; jedes 3. Level eine mehr, Boss-Level (10.) drei mehr
    traps: intro ? 2 : Math.min(7, 2 + Math.floor(w / 2) + (j % 3 === 2 ? 1 : 0) + (j === 9 ? 3 : 0)),
    // Simulierter Spieler (2 Züge Vorausschau) darf höchstens so oft gewinnen
    human: intro
      ? Math.max(0.25, 0.5 - w * 0.03)
      : j === 9
        ? 0.07
        : Math.max(0.08, 0.36 - w * 0.03 - k * 0.015),
    humanLo: intro ? 0.1 : j === 9 ? 0 : Math.max(0, 0.08 - w * 0.015),
    target: intro
      ? [0.4, 0.75]
      : j === 9
        ? [Math.max(0.03, 0.15 - w * 0.01), Math.max(0.15, 0.3 - w * 0.015)]
        : [Math.max(0.08, 0.38 - k * 0.02 - w * 0.02), Math.max(0.25, 0.7 - k * 0.025 - w * 0.03)],
  };
  // Dreiecke bieten zu wenig Platz für die schweren späten Level
  if (w >= 5 && p.shape === 'triangle') p.shape = 'blob';
  // Ringe und Kreuze haben wenig Fläche: etwas größer
  if (p.shape === 'ring' || p.shape === 'cross' || p.shape === 'star') p.R = Math.min(rMax + 0.4, p.R + 0.4);
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
  if (isLong(j)) makeLong(p, w >= 2, w >= 5);
  return p;
}

// Welten 11–30 (ab v0.6.0): Jede Welt kombiniert zwei Mechaniken. Die Schwierigkeit
// läuft als Sägezahn: Jede Welt beginnt etwas leichter und steigt bis zum Boss-Level.
// Welten 21–30 liegen eine Stufe höher. Level 5 jeder Welt ist eine Verschnaufpause.
const COMBOS = [
  ['hidden', 'gate'], ['barrier', 'rush'], ['trailer', 'chain'], ['covered', 'turntable'], ['gate', 'barrier'],
  ['chain', 'turntable'], ['hidden', 'trailer'], ['rush', 'covered'], ['gate', 'chain'], ['barrier', 'turntable'],
  ['hidden', 'barrier'], ['gate', 'rush'], ['trailer', 'covered'], ['chain', 'hidden'], ['turntable', 'gate'],
  ['rush', 'trailer'], ['covered', 'barrier'], ['chain', 'rush'], ['turntable', 'hidden'], ['gate', 'covered'],
];
function addMech(p, m, strong) {
  if (m === 'hidden') p.hidden = strong ? 0.4 : 0.25;
  if (m === 'gate') { p.gates = 1; p.gateQ = strong ? [3, 4] : [2, 3]; } // 2 Tore lassen zu wenig Platz
  if (m === 'barrier') { p.barriers = strong ? 2 : 1; p.barrierN = [2, 4]; }
  if (m === 'rush') p.rush = strong ? 2 : 1;
  if (m === 'trailer') p.mix.T = strong ? 2 : 1.5;
  if (m === 'chain') p.chains = strong ? 2 : 1;
  if (m === 'covered') p.covered = strong ? 0.3 : 0.2;
  if (m === 'turntable') p.turntables = strong ? 2 : 1;
}
function lateLevel(w, j) {
  const n = 10 + w * 10 + j;
  const intro = j === 0;
  const boss = j === 9;
  const rest = j === 4;
  const tier = w >= 20 ? 1 : 0;
  const k = intro ? 0 : j;
  const lvl = Math.min(11, 7 + k * 0.3 + tier * 0.6 + (rest ? -1 : 0));
  const minCell = 22;
  const rMax = (R_MAX * 24) / minCell;
  const p = {
    ...base,
    minCell,
    minTrucks: intro || rest ? 13 + tier : 15 + tier + Math.floor(k / 3),
    shape: SHAPE_CYCLE[(n * 5) % SHAPE_CYCLE.length],
    angle: 0,
    chaos: Math.min(0.85, 0.55 + k * 0.03 + tier * 0.05),
    R: rMax,
    density: Math.min(0.82, 0.66 + lvl * 0.018),
    maxTrucks: 34,
    colors: intro ? 7 : 8,
    mix: { S: 3, M: 2, L: 1 + lvl * 0.08, T: 0.6 },
    chunk: [lvl >= 8 ? 1 : 2, lvl >= 9 ? 3 : 4],
    stay: Math.max(0.15, 0.45 - lvl * 0.03),
    deep: Math.min(0.75, 0.35 + lvl * 0.04),
    slack: 0,
    traps: intro || rest ? 2 + tier : Math.min(7, 3 + tier + Math.floor(k / 3) + (boss ? 2 : 0)),
    human: intro || rest ? 0.38 - tier * 0.05 : boss ? 0.07 : Math.max(0.07, 0.3 - k * 0.025 - tier * 0.04),
    humanLo: intro || rest ? 0.08 : boss ? 0 : 0.02,
    target: [0.05, 0.6],
  };
  if (p.shape === 'triangle') p.shape = 'blob';
  if (p.shape === 'ring' || p.shape === 'cross' || p.shape === 'star') p.R = rMax + 0.4;
  // Die beiden Mechaniken der Welt kommen in jedem Level vor (ab Level 6 verstärkt),
  // im Boss-Level zusätzlich die Mechaniken der nächsten Welt.
  const [a, b] = COMBOS[w - 10];
  addMech(p, a, k >= 6);
  addMech(p, b, k >= 6);
  p.require = [a, b];
  // Tor + Schranke brauchen schon viel Platz: dann im Boss-Level keine dritte Mechanik
  // und eine Falle weniger
  const crowded = p.require.includes('gate') && p.require.includes('barrier');
  if (crowded) p.traps = Math.min(p.traps, 6);
  // Boss-Level ab Welt 21 haben schon drei Mechaniken und mehr LKWs: 6 Fallen reichen
  if (boss && tier) p.traps = 6;
  if (boss && !crowded) {
    const [c] = COMBOS[(w - 9) % COMBOS.length].filter((m) => m !== a && m !== b);
    if (c) addMech(p, c, false);
  }
  if (isLong(j)) makeLong(p, !p.require.includes('barrier'), true);
  return p;
}

export const LEVEL_PLAN = [...WORLD1];
for (let w = 1; w <= 9; w++) for (let j = 0; j < 10; j++) LEVEL_PLAN.push(worldLevel(w, j));
for (let w = 10; w <= 29; w++) for (let j = 0; j < 10; j++) LEVEL_PLAN.push(lateLevel(w, j));

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
  ...COMBOS.map((mech, i) => ({ from: 101 + i * 10, mech })),
];
