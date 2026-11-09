// Solver: prüft, ob ein Level ohne Boni lösbar ist, und misst die Schwierigkeit.
// Benutzt exakt die Spiellogik aus model.js.

import { Game } from './model.js';
import { LOT } from './constants.js';
import { makeRng } from './rng.js';

const LIMIT = Symbol('limit');

// Bewertet einen Zug: Wie viele Paletten seiner Farbe liegen schon auf dem Band?
// Und wie viele LKWs hängen hinter ihm fest?
function moveScore(g, id, dependents) {
  const t = g.trucks[id];
  let s = 0;
  for (const comp of t.comps) {
    let onBelt = 0;
    for (const b of g.belt) if (b >= 0 && (b & 15) === comp.color) onBelt++;
    s += Math.min(onBelt, comp.cap) / comp.cap;
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
export function solve(level, { maxNodes = 300000 } = {}) {
  const root = new Game(level);
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
