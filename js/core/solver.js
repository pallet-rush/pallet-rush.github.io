// Solver: prüft, ob ein Level ohne Boni lösbar ist, und misst die Schwierigkeit.
// Benutzt exakt die Spiellogik aus model.js.

import { Game } from './model.js';
import { LOT } from './constants.js';
import { makeRng } from './rng.js';

const LIMIT = Symbol('limit');

// Bewertet einen Zug: Wie bald und wie viele Paletten seiner Farbe kommen in der
// Schlange? Die vorderste zählt am meisten. Dazu: wie viele LKWs hängen hinter ihm?
const LOOK = 24;
function moveScore(g, id, dependents) {
  const t = g.trucks[id];
  let s = 0;
  for (const comp of t.comps) {
    let w = 0;
    let n = 0;
    const end = Math.min(g.supply.length, g.si + LOOK);
    for (let i = g.si; i < end && n < comp.cap; i++) {
      if (g.used[(i / 4) | 0]) continue;
      if ((g.supply[i] & 15) === comp.color) {
        w += 1 - (i - g.si) / LOOK;
        n++;
      }
    }
    for (const b of g.openBlocks()) if ((g.supply[b * 4] & 15) === comp.color) w += 3;
    s += w / Math.sqrt(comp.cap);
  }
  // Eilaufträge zuerst, wenn es knapp wird
  if (t.rush) s += Math.max(0, 6 - (t.rush - g.moves)) * 2;
  return s * 10 + (dependents[id] || 0);
}

// Wie viele LKWs stehen (direkt) hinter diesem LKW im Weg?
function countDependents(g) {
  const dep = {};
  for (const t of g.trucks) {
    if (t.state !== LOT) continue;
    const b = g.blockerOf(t);
    if (b >= 0) dep[b] = (dep[b] || 0) + 1;
    if (t.lock >= 0) dep[t.lock] = (dep[t.lock] || 0) + 1;
  }
  return dep;
}

/**
 * Tiefensuche mit Zustands-Cache.
 * @returns {{solvable:boolean, path:number[]|null, nodes:number, limit?:boolean}}
 */
export function solve(level, { maxNodes = 300000, fromGame = false } = {}) {
  const root = fromGame ? level.clone() : new Game(level);
  const seen = new Set();
  let nodes = 0;

  function dfs(g) {
    if (g.status === 'won') return [];
    if (g.status !== 'playing') return null;
    const k = g.key();
    if (seen.has(k)) return null;
    seen.add(k);
    if (++nodes > maxNodes) throw LIMIT;
    const dep = countDependents(g);
    const moves = g.legalMoves().sort((a, b) => moveScore(g, b, dep) - moveScore(g, a, dep));
    for (const m of moves) {
      const c = g.clone();
      c.tap(m);
      const r = dfs(c);
      if (r) {
        r.unshift(m);
        return r;
      }
    }
    return null;
  }

  try {
    const path = dfs(root);
    return { solvable: !!path, path, nodes };
  } catch (e) {
    if (e === LIMIT) return { solvable: false, path: null, nodes, limit: true };
    throw e;
  }
}

// Spielt ein Level mit zufälligen (erlaubten) Zügen. Liefert die Erfolgsquote.
// Ein „halbwegs aufmerksamer“ Spieler: bevorzugt LKWs, deren Farbe auf dem Band liegt.
export function playoutRate(level, n = 200, seed = 1, smart = 0.6) {
  const rng = makeRng(seed);
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const g = new Game(level);
    while (g.status === 'playing') {
      const moves = g.legalMoves();
      if (!moves.length) break;
      let m;
      if (rng.next() < smart) {
        let best = -1;
        for (const id of moves) {
          const s = moveScore(g, id, {}) + rng.next() * 2;
          if (s > best) { best = s; m = id; }
        }
      } else {
        m = rng.pick(moves);
      }
      g.tap(m);
    }
    if (g.status === 'won') wins++;
  }
  return wins / n;
}

// Menschlicher Testspieler: nimmt den naheliegenden LKW (Farbe am Auslauf / bald auf
// dem Band, Blocker zuerst), vermeidet aber Züge, die innerhalb von `look` Zügen
// sicher verlieren. Gewinnt dieser Spieler fast immer, ist das Level zu leicht –
// ein echter Spieler schafft es dann „first try“ ohne nachzudenken.
function losesSoon(g, d) {
  if (g.status === 'lost') return true;
  if (g.status === 'won' || d <= 0) return false;
  for (const m of g.legalMoves()) {
    const c = g.clone();
    c.tap(m);
    if (!losesSoon(c, d - 1)) return false;
  }
  return true;
}
export function humanRate(level, n = 24, seed = 1, look = 2, noise = 2) {
  const rng = makeRng(seed * 7919 + 13);
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const g = new Game(level);
    for (let guard = 0; guard < 400 && g.status === 'playing'; guard++) {
      const moves = g.legalMoves();
      if (!moves.length) break;
      const dep = countDependents(g);
      const sc = new Map(moves.map((id) => [id, moveScore(g, id, dep) + rng.next() * noise]));
      moves.sort((a, b) => sc.get(b) - sc.get(a));
      let pick = moves[0];
      for (const m of moves) {
        const c = g.clone();
        c.tap(m);
        if (!losesSoon(c, look - 1)) { pick = m; break; }
      }
      g.tap(pick);
    }
    if (g.status === 'won') wins++;
  }
  return wins / n;
}

// Fallen zählen: Entlang einer Lösung wird an jeder Stelle geprüft, ob der
// naheliegende Zug (höchste Bewertung = was ein Spieler „nach Gefühl“ tippt)
// das Level unlösbar macht. Jede solche Stelle ist eine Falle, bei der man
// vorausdenken muss. fatal = Anteil aller erlaubten Züge, die verlieren.
export function trapStats(level, path = level.sol, { maxNodes = 4000, top = 2 } = {}) {
  const g = new Game(level);
  let traps = 0, fatal = 0, total = 0, unknown = 0;
  const memo = new Map();
  const dead = (c) => {
    const k = c.key();
    if (memo.has(k)) return memo.get(k);
    const r = solve(c, { maxNodes, fromGame: true });
    const v = r.limit ? null : !r.solvable;
    memo.set(k, v);
    return v;
  };
  for (const step of path) {
    if (g.status !== 'playing') break;
    const moves = g.legalMoves();
    const dep = countDependents(g);
    moves.sort((a, b) => moveScore(g, b, dep) - moveScore(g, a, dep));
    let trapHere = false;
    moves.forEach((m, i) => {
      const c = g.clone();
      c.tap(m);
      const d = dead(c);
      if (d === null) { unknown++; return; }
      total++;
      if (d) { fatal++; if (i < top) trapHere = true; }
    });
    if (trapHere) traps++;
    g.tap(step);
  }
  return { traps, fatal: total ? fatal / total : 0, unknown, won: g.status === 'won' };
}
