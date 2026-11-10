// Level-Generator. Erzeugt aus Parametern + Seed ein Level und prüft es.
//
// Ablauf:
//  1. Form des Staus (Herz, Kreis, Stern …) im gedrehten Raster ausstanzen.
//  2. LKWs dicht hineinsetzen, nur so, dass sich der Hof immer räumen lässt.
//  3. Mechaniken (Tore, Schranken, Ketten, Drehscheiben) einbauen.
//  4. Referenz-Partie: Der Generator SPIELT das Level mit der echten Spiellogik
//     und legt dabei die Paletten-Schlange fest. Die Schlange entsteht also aus
//     einer gültigen Lösung – jedes Level ist dadurch garantiert lösbar.
//  5. Schwierigkeit mit simulierten Spielern messen und ins Zielband einpassen.
//
// Parameter p:
//   shape, R, angle            Form, Radius in Feldern, Drehung (Grad)
//   ramps                      Rampen
//   trucks, colors             Anzahl LKWs (Ziel), Anzahl Farben
//   mix: {S, M, L, T}          Gewichtung der Größen
//   chunk: [min, max]          Paletten am Stück für einen geparkten LKW
//   stay                       Wahrscheinlichkeit, erst geparkte LKWs weiter zu beladen
//   deep                       Vorliebe für LKWs, die erst freigeräumt werden müssen
//   slack                      Rampen, die die Referenz-Partie frei lässt (Fehler-Spielraum)
//   target: [min, max]         Erfolgsquote simulierter Spieler (smart = wie umsichtig)
//   hidden, gates, gateQ, barriers, barrierN, rush, chains, covered, turntables

import { DIRS, SIZES, LOT, GONE, WAIT } from './constants.js';
import { makeRng } from './rng.js';
import { Game, validateLevel } from './model.js';
import { playoutRate } from './solver.js';

const DIR_KEYS = ['U', 'D', 'L', 'R'];

function cellsOf(x, y, d, len) {
  const [dx, dy] = DIRS[d];
  const out = [];
  for (let i = 0; i < len; i++) out.push([x - dx * i, y - dy * i]);
  return out;
}

// ---------- Formen (im Bildschirm-Raum, u/v von -1 bis 1) ----------
const SHAPES = {
  rect: (u, v) => Math.abs(u) <= 1 && Math.abs(v) <= 1,
  circle: (u, v) => u * u + v * v <= 1,
  diamond: (u, v) => Math.abs(u) + Math.abs(v) <= 1.2,
  heart: (u, v) => {
    const x = u * 1.25;
    const y = -v * 1.25 + 0.25;
    const a = x * x + y * y - 1;
    return a * a * a - x * x * y * y * y <= 0;
  },
  cross: (u, v) => (Math.abs(u) <= 0.42 || Math.abs(v) <= 0.42) && Math.abs(u) <= 1 && Math.abs(v) <= 1,
  ring: (u, v) => { const r = u * u + v * v; return r <= 1 && r >= 0.22; },
  hexagon: (u, v) => Math.abs(v) <= 0.9 && Math.abs(u) * 0.866 + Math.abs(v) * 0.5 <= 0.9,
  triangle: (u, v) => v <= 0.9 && Math.abs(u) <= (v + 1.05) * 0.58,
  star: (u, v) => {
    const r = Math.hypot(u, v);
    const a = Math.atan2(v, u) + Math.PI / 2;
    const k = Math.cos(((a % (Math.PI * 2 / 5)) + Math.PI * 2 / 5) % (Math.PI * 2 / 5) - Math.PI / 5);
    return r <= 0.55 + 0.5 * Math.pow(Math.max(0, k), 6) * 1.0 + 0.0 && r <= 1.05;
  },
  hourglass: (u, v) => Math.abs(v) <= 1 && Math.abs(u) <= 0.3 + 0.7 * Math.abs(v),
  arrow: (u, v) => (v <= 0 && Math.abs(u) <= (v + 1.0) * 1.0) || (v > 0 && Math.abs(u) <= 0.42 && v <= 1),
  blob: (u, v) => Math.pow(Math.abs(u), 2.6) + Math.pow(Math.abs(v), 2.6) <= 1,
  wave: (u, v) => Math.abs(v - 0.35 * Math.sin(u * 3.2)) <= 0.62 && Math.abs(u) <= 1,
};
export const SHAPE_NAMES = Object.keys(SHAPES);

// Rastergröße und Maske: Welche Felder gehören zum Stau?
// Das Raster wird um `angle` gedreht dargestellt; die Form gilt auf dem Bildschirm.
export function makeMask(shape, R, angle) {
  const a = (angle * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const span = Math.abs(ca) + Math.abs(sa); // Ausdehnung des gedrehten Rasters
  const N = Math.ceil(2 * R * span) + 3;
  const W = N;
  const H = N;
  const f = SHAPES[shape] || SHAPES.rect;
  const Rx = R * 1.08;
  const Ry = R * 0.94;
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const gx = x + 0.5 - W / 2;
      const gy = y + 0.5 - H / 2;
      const sx = gx * ca - gy * sa;
      const sy = gx * sa + gy * ca;
      if (f(sx / Rx, sy / Ry)) mask[y * W + x] = 1;
    }
  }
  return { W, H, mask };
}

// Statischer Test: Lässt sich der Hof ohne Rampenlimit räumen? (Tore/Schranken = feste Hindernisse)
function staticClearable(w, h, trucks, blocked) {
  const grid = new Int16Array(w * h).fill(-1);
  for (const i of blocked) grid[i] = -2;
  trucks.forEach((t, i) => {
    for (const [x, y] of cellsOf(t.x, t.y, t.d, SIZES[t.s].len)) grid[y * w + x] = i;
  });
  const alive = new Set(trucks.map((_, i) => i));
  let changed = true;
  while (alive.size && changed) {
    changed = false;
    for (const i of [...alive]) {
      const t = trucks[i];
      const [dx, dy] = DIRS[t.d];
      let x = t.x + dx;
      let y = t.y + dy;
      let free = true;
      while (x >= 0 && y >= 0 && x < w && y < h) {
        const o = grid[y * w + x];
        if (o !== -1 && o !== i) { free = false; break; }
        x += dx;
        y += dy;
      }
      if (free) {
        alive.delete(i);
        for (const [cx, cy] of cellsOf(t.x, t.y, t.d, SIZES[t.s].len)) grid[cy * w + cx] = -1;
        changed = true;
      }
    }
  }
  return alive.size === 0;
}

function pickWeighted(rng, weights) {
  const keys = Object.keys(weights).filter((k) => weights[k] > 0);
  const total = keys.reduce((s, k) => s + weights[k], 0);
  let r = rng.next() * total;
  for (const k of keys) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return keys[keys.length - 1];
}

// ---------- Aufbau des Hofs ----------
function buildLot(p, rng) {
  const { W, H, mask } = makeMask(p.shape, p.R, p.angle || 0);
  const used = new Int8Array(W * H);
  const obst = [];
  const trucks = [];
  const gates = [];
  const barriers = [];
  const inMask = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x];
  const free = (x, y) => inMask(x, y) && !used[y * W + x];

  // Drehscheiben (Transporter auf Drehpunkt, Kreuz drumherum reserviert)
  for (let n = 0; n < (p.turntables || 0); n++) {
    for (let a = 0; a < 300; a++) {
      const px = 1 + rng.int(W - 2);
      const py = 1 + rng.int(H - 2);
      const around = [[px, py], [px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]];
      if (!around.every(([x, y]) => free(x, y))) continue;
      for (const [x, y] of around) used[y * W + x] = 1;
      const d = rng.pick(DIR_KEYS);
      const [dx, dy] = DIRS[d];
      trucks.push({ x: px + dx, y: py + dy, d, s: 'S', c: 0, tt: 1 });
      break;
    }
  }

  // Tore (Garagen) im Stau, Ausfahrt mit mindestens 3 freien Feldern davor
  for (let n = 0; n < (p.gates || 0); n++) {
    for (let a = 0; a < 400; a++) {
      const x = rng.int(W);
      const y = rng.int(H);
      const d = rng.pick(DIR_KEYS);
      const [dx, dy] = DIRS[d];
      if (!free(x, y) || !free(x + dx, y + dy) || !free(x + dx * 2, y + dy * 2) || !free(x + dx * 3, y + dy * 3)) continue;
      used[y * W + x] = 1;
      obst.push(y * W + x);
      const [qmin, qmax] = p.gateQ || [2, 3];
      const qn = qmin + rng.int(qmax - qmin + 1);
      const q = [];
      for (let i = 0; i < qn; i++) q.push({ s: rng.next() < 0.6 ? 'S' : 'M', c: 0 });
      gates.push({ x, y, d, q });
      // Ausfahrt der Garage frei halten, bis die LKWs gesetzt sind
      for (let i = 1; i <= 3; i++) used[(y + dy * i) * W + x + dx * i] = 2;
      break;
    }
  }

  // Anzahl LKWs aus der Fläche der Form (Dichte) oder fest vorgegeben
  let area = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] && !used[i]) area++;
  const mixW = Object.entries(p.mix);
  const sumW = mixW.reduce((a, [, w]) => a + w, 0);
  const avgLen = mixW.reduce((a, [s, w]) => a + SIZES[s].len * w, 0) / sumW;
  const want = p.density ? Math.min(p.maxTrucks || 40, Math.round((area * p.density) / avgLen)) : p.trucks;
  // Normale LKWs: viele Versuche, damit der Stau dicht wird
  const mix = { ...p.mix };
  let attempts = 0;
  const maxAttempts = 9000;
  while (trucks.length < want && attempts < maxAttempts) {
    attempts++;
    const s = pickWeighted(rng, mix);
    const len = SIZES[s].len;
    const d = rng.pick(DIR_KEYS);
    const x = rng.int(W);
    const y = rng.int(H);
    const cells = cellsOf(x, y, d, len);
    if (!cells.every(([cx, cy]) => free(cx, cy))) continue;
    const t = { x, y, d, s, c: 0 };
    trucks.push(t);
    if (!staticClearable(W, H, trucks, obst)) {
      trucks.pop();
      continue;
    }
    for (const [cx, cy] of cells) used[cy * W + cx] = 1;
  }
  if (trucks.length < Math.max(3, Math.floor(want * 0.85))) return null;
  for (let i = 0; i < used.length; i++) if (used[i] === 2) used[i] = 0;

  // Schranken auf freien Feldern im Weg von LKWs
  for (let n = 0; n < (p.barriers || 0); n++) {
    const cand = [];
    for (const t of trucks) {
      const [dx, dy] = DIRS[t.d];
      let x = t.x + dx;
      let y = t.y + dy;
      while (x >= 0 && y >= 0 && x < W && y < H) {
        if (free(x, y)) cand.push([x, y]);
        x += dx;
        y += dy;
      }
    }
    if (!cand.length) break;
    const [bx, by] = rng.pick(cand);
    used[by * W + bx] = 1;
    const [nmin, nmax] = p.barrierN || [2, 4];
    barriers.push({ cells: [[bx, by]], n: nmin + rng.int(nmax - nmin + 1) });
  }

  // Farben: gleichmäßig verteilt, Anhänger mit zweiter Farbe
  const all = [...trucks, ...gates.flatMap((g) => g.q)];
  const palette = rng.shuffle([...Array(8).keys()]).slice(0, p.colors);
  const pool = [];
  for (let i = 0; i < all.length; i++) pool.push(i % p.colors);
  rng.shuffle(pool);
  all.forEach((t, i) => {
    t.c = palette[pool[i]];
    if (t.s === 'T') t.c2 = palette[rng.int(p.colors)];
  });

  const level = { w: W, h: H, angle: p.angle || 0, ramps: p.ramps, trucks, supply: '' };
  if (gates.length) level.gates = gates;
  if (barriers.length) level.barriers = barriers;

  // Ketten: gesperrter LKW + Schlüssel-LKW
  for (let n = 0; n < (p.chains || 0); n++) {
    for (let a = 0; a < 20; a++) {
      const i = rng.int(trucks.length);
      const k = rng.int(trucks.length);
      if (i === k || trucks[i].k !== undefined || trucks[k].k === i || trucks[i].tt) continue;
      trucks[i].k = k;
      break;
    }
  }
  return level;
}

// ---------- Referenz-Partie ----------
// Plant auf einer Kopie, welche LKWs (in welcher Reihenfolge) losfahren müssen,
// damit LKW x an eine Rampe kommt. Liefert die Liste oder null.
function planFor(g, x, budget) {
  const c = g.clone();
  const plan = [];
  for (let guard = 0; guard < 40; guard++) {
    if (c.trucks[x].state !== LOT) return plan.length ? plan : null;
    if (plan.length >= budget) return null;
    // Ersten fahrbereiten LKW in der Kette vor x finden
    let target = x;
    const seen = new Set();
    for (;;) {
      if (seen.has(target)) return null;
      seen.add(target);
      const t = c.trucks[target];
      if (t.state === WAIT) return null;
      if (c.isLocked(t)) { target = t.lock; continue; }
      const b = c.blockerOf(t);
      if (b === -1) break;
      if (b < 0) return null; // Tor oder Schranke
      target = b;
    }
    const r = c.tap(target);
    if (!r.ok) return null;
    plan.push(target);
  }
  return null;
}

// Paletten gleicher Farbe kommen immer als Block (4 nebeneinander auf dem Band)
export const BLOCK = 4;

function referencePlay(level, p, rng) {
  const g = new Game(level, { noEnd: true });
  g.supply = [];
  const path = [];
  const [cmin, cmax] = p.chunk || [2, 6];
  const stay = p.stay ?? 0.5;
  const ev = [];
  const emit = (color) => {
    g.supply.push(color);
    g._resolve(ev);
    g._settle(ev);
  };
  for (let guard = 0; guard < 5000; guard++) {
    if (g.trucks.every((t) => t.state === GONE)) break;
    // Bedarf der geparkten LKWs
    const need = {};
    let anyDocked = false;
    for (const id of g.ramps) {
      if (id < 0) continue;
      anyDocked = true;
      for (const cp of g.trucks[id].comps) if (cp.loaded < cp.cap) need[cp.color] = (need[cp.color] || 0) + cp.cap - cp.loaded;
    }
    // Spielraum: Die Referenz-Partie lässt `slack` Rampen frei, damit der
    // Spieler Fehler machen darf (leicht = viel Spielraum).
    const freeR = Math.max(0, g.freeRampCount() - (p.slack ?? 1));
    let goLoad = anyDocked && (freeR === 0 || rng.next() < stay);
    let choice = null;
    if (!goLoad) {
      // Ziel-LKW wählen, der mit den freien Rampen erreichbar ist
      const cands = [];
      for (const t of g.trucks) {
        if (t.state !== LOT) continue;
        const plan = planFor(g, t.id, freeR);
        if (plan) cands.push({ t, plan });
      }
      if (cands.length) {
        // „deep“: lieber LKWs, für die erst andere weg müssen
        cands.sort((a, b) => a.plan.length - b.plan.length);
        if (rng.next() < (p.deep ?? 0.3)) choice = cands[cands.length - 1 - rng.int(Math.min(3, cands.length))];
        else choice = cands[rng.int(cands.length)];
      } else if (anyDocked) {
        goLoad = true;
      } else {
        return null; // festgefahren
      }
    }
    if (goLoad) {
      const colors = Object.keys(need).map(Number);
      if (!colors.length) return null;
      const c = rng.pick(colors);
      // Paletten kommen immer in Blöcken zu BLOCK (alle LKW-Kapazitäten sind Vielfache davon)
      const want = cmin + rng.int(cmax - cmin + 1);
      const n = Math.min(need[c], Math.max(BLOCK, Math.round(want / BLOCK) * BLOCK));
      for (let i = 0; i < n; i++) emit(c);
      continue;
    }
    // Erste Palette des Ziel-LKWs nach vorne, dann die Kette abfahren,
    // bis die Palette verladen ist (genau wie ein Spieler es tun müsste).
    const tgt = choice.t;
    const comp = tgt.comps.length > 1 ? tgt.comps[rng.int(tgt.comps.length)] : tgt.comps[0];
    const si0 = g.supply.length;
    for (let i = 0; i < BLOCK; i++) emit(comp.color);
    for (const id of choice.plan) {
      if (g.si > si0) break;
      const r = g.tap(id);
      if (!r.ok) return null;
      path.push(id);
    }
    if (g.si <= si0) return null;
  }
  if (!g.trucks.every((t) => t.state === GONE)) return null;
  return { supply: g.supply, path };
}

/** Baut ein Level. Liefert null, wenn es nicht klappt. */
export function buildLevel(p, seed) {
  const rng = makeRng(seed);
  const level = buildLot(p, rng);
  if (!level) return null;
  const ref = referencePlay(level, p, rng);
  if (!ref) return null;
  // Kartonpaletten: zufällige Stellen, nicht ganz vorne
  let supply = '';
  // Kartonpaletten: immer ein ganzer Block, nicht ganz vorne
  let coverBlock = false;
  ref.supply.forEach((c, i) => {
    if (i % BLOCK === 0) coverBlock = p.covered && i >= BLOCK && rng.next() < p.covered;
    supply += coverBlock ? String.fromCharCode(97 + c) : String(c);
  });
  level.supply = supply;
  level.sol = ref.path;
  // Planen für LKWs, die zu Beginn blockiert sind
  if (p.hidden) {
    const g = new Game(level);
    for (const t of g.trucks) {
      if (t.id < level.trucks.length && t.state === LOT && g.blockerOf(t) !== -1 && rng.next() < p.hidden) level.trucks[t.id].h = 1;
    }
  }
  return level;
}

// Spielt die mitgelieferte Lösung nach. true = Level gewonnen.
export function replaySolution(level, path = level.sol) {
  if (!path) return false;
  const g = new Game(level);
  for (const id of path) {
    if (g.status !== 'playing') break;
    const r = g.tap(id);
    if (!r.ok) return false;
  }
  return g.status === 'won';
}

// Eilauftrag nachträglich setzen: anhand der Lösung, mit etwas Spielraum.
function addRush(level, path, rng, count) {
  const nBase = level.trucks.length;
  const cand = path.map((id, i) => ({ id, i })).filter((q) => q.id < nBase && q.i >= 2 && !level.trucks[q.id].tt);
  rng.shuffle(cand);
  for (let n = 0; n < count && n < cand.length; n++) {
    const { id, i } = cand[n];
    level.trucks[id].r = i + 1 + 2 + rng.int(3);
  }
}

// Enthält das Level die geforderte Mechanik wirklich?
export function hasMechanic(lv, m) {
  const T = lv.trucks;
  switch (m) {
    case 'hidden': return T.some((t) => t.h);
    case 'gate': return !!lv.gates?.length;
    case 'barrier': return !!lv.barriers?.length;
    case 'rush': return T.some((t) => t.r);
    case 'trailer': return T.some((t) => t.s === 'T');
    case 'chain': return T.some((t) => t.k !== undefined);
    case 'covered': return /[a-h]/.test(lv.supply);
    case 'turntable': return T.some((t) => t.tt);
    default: return true;
  }
}

/** Sucht einen Seed, der alle Prüfungen besteht. */
export function findLevel(p, startSeed, { maxTries = 300 } = {}) {
  let [lo, hi] = p.target || [0, 1];
  let best = null;
  for (let i = 0; i < maxTries; i++) {
    if (i > maxTries / 2 && i % 30 === 0) { lo = Math.max(0, lo - 0.05); hi = Math.min(1, hi + 0.05); }
    const seed = startSeed + i;
    const lv = buildLevel(p, seed);
    if (!lv) continue;
    if (validateLevel(lv).length) continue;
    if (p.require && p.require !== 'rush' && !hasMechanic(lv, p.require)) continue;
    if (p.rush) addRush(lv, lv.sol, makeRng(seed * 31), p.rush);
    if (!replaySolution(lv)) continue;
    const rate = playoutRate(lv, p.playouts || 60, seed, p.smart ?? 0.85);
    const res = { level: lv, seed, stats: { rate: +rate.toFixed(2), moves: lv.sol.length } };
    if (rate >= lo && rate <= hi) return res;
    // Notfalls das Level, das dem Zielband am nächsten kommt
    const dist = rate < lo ? lo - rate : rate - hi;
    if (!best || dist < best.dist) best = { ...res, dist };
  }
  return best && best.dist < 0.2 ? best : null;
}
