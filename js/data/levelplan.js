// Parameterplan für den Level-Generator (100 Level, 10 Welten).
// Wird nur von tools/levelgen.html genutzt, nicht vom Spiel selbst.
// Bedeutung der Parameter: siehe js/core/generator.js.
//
// Schwierigkeit wird über target gesteuert = Erfolgsquote simulierter Spieler
// (hoch = leicht). Das erste Level jeder Welt ist leichter (neue Mechanik lernen).

const base = { ramps: 4, belt: 24, chunk: [2, 6], fair: 0.4 };

// Welt 1: Grundkurs (handverlesene Parameter)
const WORLD1 = [
  { ...base, w: 5, h: 5, trucks: 3, colors: 2, mix: { S: 1 }, noise: 0, target: [0.9, 1] },
  { ...base, w: 5, h: 6, trucks: 5, colors: 3, mix: { S: 1 }, noise: 1, target: [0.8, 1] },
  { ...base, w: 6, h: 6, trucks: 7, colors: 3, mix: { S: 3, M: 1 }, noise: 1.5, target: [0.6, 1] },
  { ...base, w: 6, h: 7, trucks: 9, colors: 4, mix: { S: 3, M: 2 }, noise: 2, target: [0.5, 0.95] },
  { ...base, w: 6, h: 8, trucks: 11, colors: 4, mix: { S: 3, M: 2, L: 1 }, noise: 2.5, target: [0.4, 0.9] },
  { ...base, w: 7, h: 8, trucks: 13, colors: 5, mix: { S: 3, M: 2, L: 1 }, noise: 3, target: [0.3, 0.85] },
  { ...base, w: 7, h: 9, trucks: 15, colors: 5, mix: { S: 3, M: 2, L: 1 }, noise: 3.5, target: [0.25, 0.8] },
  { ...base, w: 7, h: 9, trucks: 17, colors: 6, mix: { S: 3, M: 2, L: 1 }, noise: 4, target: [0.2, 0.75] },
  { ...base, w: 7, h: 9, trucks: 15, colors: 6, mix: { S: 3, M: 2, L: 1 }, noise: 4.5, target: [0.2, 0.7] },
  { ...base, w: 7, h: 9, trucks: 16, colors: 6, mix: { S: 3, M: 2, L: 1 }, noise: 5, target: [0.15, 0.65] },
];

// Welten 2–10: Parameter folgen einer Kurve, plus die Mechanik der Welt.
function worldLevel(w, j) {
  const intro = j === 0;
  const k = intro ? 0 : j;
  const p = {
    ...base,
    ramps: w >= 3 ? 5 : 4,
    belt: w >= 5 ? 28 : 24,
    w: 7,
    h: k < 3 ? 8 : 9,
    trucks: Math.min(17, 10 + Math.floor(w * 0.4) + Math.floor(k * 0.7) + (w >= 3 ? 1 : 0)),
    colors: Math.min(8, 4 + Math.floor(w / 3) + Math.floor(k / 4)),
    mix: { S: 3, M: 2, L: 1.2 },
    noise: 2.5 + k * 0.35 + w * 0.2,
    target: intro
      ? [0.4, 1]
      : [Math.max(0.06, 0.5 - k * 0.035 - w * 0.025), Math.min(0.95, 0.88 - k * 0.035 - w * 0.02)],
  };
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
