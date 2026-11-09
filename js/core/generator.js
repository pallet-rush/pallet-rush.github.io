// Level-Generator. Erzeugt aus Parametern + Seed ein Level und prüft es.
// Nur Level, die alle Prüfungen bestehen, werden ausgeliefert.
//
// Parameter p:
//   w, h, ramps, belt          Hof, Rampen, Bandplätze
//   trucks, colors             Anzahl LKWs im Hof, Anzahl Farben
//   mix: {S, M, L, T}          Gewichtung der Größen
//   noise, chunk:[min,max]     Durchmischung des Nachschubs
//   target: [min, max]         Erfolgsquote simulierter Spieler
//   fair                       Mindestanteil fairer Start-Paletten
//   hidden                     Anteil verdeckter (blockierter) LKWs
//   gates, gateQ:[min,max]     Tore und LKWs pro Tor
//   barriers, barrierN:[a,b]   Schranken und nötige Abfahrten
//   rush                       Anzahl Eilaufträge
//   chains                     Anzahl Ketten
//   covered                    Anteil Kartonpaletten
//   turntables                 Anzahl Drehscheiben

import { DIRS, SIZES, LOT, GONE } from './constants.js';
import { makeRng } from './rng.js';
import { Game, validateLevel } from './model.js';
import { solve, playoutRate } from './solver.js';

const DIR_KEYS = ['U', 'D', 'L', 'R'];

function cellsOf(x, y, d, len) {
  const [dx, dy] = DIRS[d];
  const out = [];
  for (let i = 0; i < len; i++) out.push([x - dx * i, y - dy * i]);
  return out;
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

// Räum-Reihenfolge mit der echten Spiellogik (Sandbox: ohne Rampen/Band).
function sandboxOrder(level, rng) {
  const g = new Game(level, { sandbox: true });
  const order = [];
  let guard = 0;
  while (g.status === 'playing' && guard++ < 500) {
    const moves = g.legalMoves();
    if (!moves.length) return null;
    const m = rng.pick(moves);
    order.push(m);
    g.tap(m);
  }
  return g.status === 'won' ? { order, game: g } : null;
}

/** Baut einen Level-Rohling. Liefert null, wenn es nicht klappt. */
export function buildLevel(p, seed) {
  const rng = makeRng(seed);
  const W = p.w;
  const H = p.h;
  const used = new Int8Array(W * H); // 1 = belegt/reserviert
  const obst = []; // feste Hindernisse (Tore)
  const trucks = [];
  const gates = [];
  const barriers = [];
  const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !used[y * W + x];

  // 1) Drehscheiben (Transporter auf Drehpunkt, Kreuz drumherum reserviert)
  for (let n = 0; n < (p.turntables || 0); n++) {
    for (let a = 0; a < 200; a++) {
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

  // 2) Tore am Rand, Blick nach innen
  for (let n = 0; n < (p.gates || 0); n++) {
    for (let a = 0; a < 200; a++) {
      const side = rng.int(4);
      let x;
      let y;
      let d;
      if (side === 0) { x = rng.int(W); y = 0; d = 'D'; }
      else if (side === 1) { x = rng.int(W); y = H - 1; d = 'U'; }
      else if (side === 2) { x = 0; y = rng.int(H); d = 'R'; }
      else { x = W - 1; y = rng.int(H); d = 'L'; }
      const [dx, dy] = DIRS[d];
      // Gerade Linie bis zum Rand muss reichen, vorderste 3 Felder müssen im Hof liegen
      if (!free(x, y) || !free(x + dx, y + dy) || !free(x + dx * 3, y + dy * 3) || !free(x + dx * 2, y + dy * 2)) continue;
      used[y * W + x] = 1;
      obst.push(y * W + x);
      const [qmin, qmax] = p.gateQ || [2, 3];
      const qn = qmin + rng.int(qmax - qmin + 1);
      const q = [];
      for (let i = 0; i < qn; i++) q.push({ s: rng.next() < 0.6 ? 'S' : 'M', c: 0 });
      gates.push({ x, y, d, q });
      break;
    }
  }

  // 3) Normale LKWs
  const mix = { ...p.mix };
  let attempts = 0;
  while (trucks.length < p.trucks && attempts < 4000) {
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
  if (trucks.length < p.trucks) return null;

  // 4) Schranken auf freien Feldern, die im Weg von LKWs liegen
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
    const cells = [[bx, by]];
    // evtl. zweites Feld daneben
    const nb = [[bx + 1, by], [bx - 1, by], [bx, by + 1], [bx, by - 1]].filter(([x, y]) => free(x, y));
    if (nb.length && rng.next() < 0.5) {
      const c2 = rng.pick(nb);
      used[c2[1] * W + c2[0]] = 1;
      cells.push(c2);
    }
    const [nmin, nmax] = p.barrierN || [2, 4];
    barriers.push({ cells, n: nmin + rng.int(nmax - nmin + 1) });
  }

  // 5) Farben gleichmäßig verteilen (Hof + Tore, Anhänger mit zweiter Farbe)
  const all = [...trucks, ...gates.flatMap((g) => g.q)];
  const palette = rng.shuffle([...Array(8).keys()]).slice(0, p.colors);
  const slots = [];
  for (const t of all) slots.push(t);
  const pool = [];
  for (let i = 0; i < slots.length; i++) pool.push(i % p.colors);
  rng.shuffle(pool);
  slots.forEach((t, i) => {
    t.c = palette[pool[i]];
    if (t.s === 'T') t.c2 = palette[rng.int(p.colors)];
  });

  const level = { w: W, h: H, ramps: p.ramps, belt: p.belt, trucks, supply: '' };
  if (gates.length) level.gates = gates;
  if (barriers.length) level.barriers = barriers;

  // 6) Ketten: gesperrter LKW + Schlüssel-LKW
  for (let n = 0; n < (p.chains || 0); n++) {
    const a = rng.int(trucks.length);
    const b = rng.int(trucks.length);
    if (a === b || trucks[a].k !== undefined || trucks[b].k === a || trucks[a].tt) continue;
    trucks[a].k = b;
  }

  // 7) Räum-Reihenfolge mit echter Logik (inkl. Toren, Schranken, Ketten, Drehscheiben)
  const so = sandboxOrder({ ...level, supply: '' }, rng);
  if (!so) return null;
  const sg = so.game;

  // 8) Nachschub in Stücken, leicht gemischt nach der Räum-Reihenfolge
  const [cmin, cmax] = p.chunk || [2, 6];
  const chunks = [];
  so.order.forEach((ti, k) => {
    for (const comp of sg.trucks[ti].comps) {
      let left = comp.cap;
      while (left > 0) {
        const n = Math.min(left, cmin + rng.int(cmax - cmin + 1));
        left -= n;
        chunks.push({ key: k + rng.next() * p.noise, color: comp.color, n });
      }
    }
  });
  chunks.sort((a, b) => a.key - b.key);
  let supply = '';
  for (const ch of chunks) {
    for (let i = 0; i < ch.n; i++) {
      const covered = p.covered && supply.length >= 4 && rng.next() < p.covered;
      supply += covered ? String.fromCharCode(97 + ch.color) : String(ch.color);
    }
  }
  level.supply = supply;

  // 9) Planen für blockierte LKWs
  if (p.hidden) {
    const g = new Game(level);
    for (const t of g.trucks) {
      if (t.id < trucks.length && g.blockerOf(t) !== -1 && rng.next() < p.hidden) trucks[t.id].h = 1;
    }
  }
  return level;
}

// Fairer Start: Anteil der Start-Band-Paletten, deren LKW sofort oder nach einem Zug frei ist.
export function fairStartRatio(level) {
  const g = new Game(level);
  const reachable = new Set();
  const addColors = (t) => t.comps.forEach((c) => reachable.add(c.color));
  for (const t of g.trucks) {
    if (g.canExit(t)) {
      addColors(t);
      const c = g.clone();
      c.tap(t.id);
      for (const u of c.trucks) if (c.canExit(u)) addColors(u);
    }
  }
  const belt = g.belt.filter((b) => b >= 0);
  let ok = 0;
  for (const code of belt) if (reachable.has(code & 15)) ok++;
  return belt.length ? ok / belt.length : 1;
}

// Eilauftrag nachträglich setzen: anhand der Solver-Lösung, mit etwas Spielraum.
function addRush(level, path, rng, count) {
  const nBase = level.trucks.length;
  const cand = path.map((id, i) => ({ id, i })).filter((q) => q.id < nBase && q.i >= 2 && !level.trucks[q.id].tt);
  rng.shuffle(cand);
  for (let n = 0; n < count && n < cand.length; n++) {
    const { id, i } = cand[n];
    level.trucks[id].r = i + 1 + 2 + rng.int(3);
  }
}

/**
 * Sucht einen Seed, der alle Prüfungen besteht.
 */
// Enthält das Level die geforderte Mechanik wirklich? (Welt-Mechanik muss sichtbar sein)
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

export function findLevel(p, startSeed, { maxTries = 400 } = {}) {
  let [lo, hi] = p.target || [0, 1];
  for (let i = 0; i < maxTries; i++) {
    // Nach der Hälfte der Versuche das Zielband langsam aufweiten
    if (i > maxTries / 2 && i % 40 === 0) { lo = Math.max(0, lo - 0.05); hi = Math.min(1, hi + 0.05); }
    const seed = startSeed + i;
    const lv = buildLevel(p, seed);
    if (!lv) continue;
    if (validateLevel(lv).length) continue;
    if (p.require && p.require !== 'rush' && !hasMechanic(lv, p.require)) continue; // Eilauftrag kommt erst nach dem Lösen dazu
    const fair = fairStartRatio(lv);
    if (fair < (p.fair ?? 0.4)) continue;
    let sol = solve(lv, { maxNodes: p.maxNodes || 60000 });
    if (!sol.solvable) continue;
    if (p.rush) {
      addRush(lv, sol.path, makeRng(seed * 31), p.rush);
      sol = solve(lv, { maxNodes: p.maxNodes || 60000 });
      if (!sol.solvable) continue;
    }
    const rate = playoutRate(lv, p.playouts || 120, seed);
    if (rate < lo || rate > hi) continue;
    return { level: lv, seed, stats: { fair: +fair.toFixed(2), rate: +rate.toFixed(2), nodes: sol.nodes, solution: sol.path } };
  }
  return null;
}
