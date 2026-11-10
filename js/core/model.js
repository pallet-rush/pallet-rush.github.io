// Reine Spiellogik von Pallet Rush. Kein DOM, keine Grafik.
// Wird identisch vom Spiel, vom Solver und vom Generator benutzt. Dadurch prüft
// der Solver exakt die Regeln, die der Spieler erlebt.
//
// Leveldaten-Format:
// {
//   id, w, h,              Hofgröße in Feldern
//   angle                  Drehung des Hofs in Grad (nur Darstellung)
//   ramps                  Anzahl Rampen
//   trucks: [{ x, y, d, s, c, c2, h, r, k, tt }]
//       x,y Kopf-Feld (Fahrerhaus), d Richtung U/D/L/R, s Größe S/M/L/T,
//       c Farbe (c2 Farbe des Anhängers bei T), h=1 Plane (Farbe verdeckt),
//       r Eilauftrag: muss spätestens mit Zug r aus dem Hof sein,
//       k Kette: gesperrt, bis LKW Nr. k den Hof verlassen hat,
//       tt=1 steht auf einer Drehscheibe (dreht sich nach jedem Zug um 90°)
//   gates: [{ x, y, d, q: [{ s, c, c2, h }] }]   Tore mit wartenden LKWs
//   barriers: [{ cells: [[x,y],...], n }]         Schranke öffnet nach n Abfahrten
//   supply: "0120ab..."    Paletten-Schlange in fester Reihenfolge:
//                          Ziffer = Palette, Buchstabe = Karton (Farbe verdeckt)
//   sol: [ids]             (optional) eine Lösung, vom Generator mitgeliefert
// }
//
// Die Schlange besteht aus Blöcken zu BLOCK (4) gleichfarbigen Paletten. Die
// vordersten WINDOW (3) noch nicht verladenen Blöcke liegen an den drei
// Ausgabeplätzen (Mitte, links, rechts) und können verladen werden, jeweils als
// ganzer Block in einen geparkten LKW gleicher Farbe. Passt keiner davon, wartet
// die Schlange. Sind dann alle Rampen belegt, ist das Level verloren.
//
// Jede Aktion liefert eine Liste von Ereignissen. Die Darstellung spielt diese
// Ereignisse als Animation ab, die Logik ist dann schon fertig gerechnet.

import {
  DIRS, SIZES, LOT, RAMP, GONE, WAIT, EMPTY, OBST, CLOCKWISE, colorOf, parseSupply,
} from './constants.js';
import { makeRng } from './rng.js';

export const BLOCK = 4;   // Paletten pro Block (eine Reihe auf dem Band)
export const WINDOW = 3;  // gleichzeitig verladbare Blöcke (Ausgabeplätze)

function makeComps(t) {
  const caps = SIZES[t.s].caps;
  return caps.map((cap, i) => ({ color: i === 0 ? t.c : (t.c2 ?? t.c), cap, loaded: 0 }));
}

export class Game {
  constructor(level, opts = {}) {
    this.level = level;
    this.w = level.w;
    this.h = level.h;
    this.sandbox = !!opts.sandbox;
    this.noEnd = !!opts.noEnd; // Generator: nie gewinnen/verlieren
    this.trucks = level.trucks.map((t, i) => ({
      id: i, x: t.x, y: t.y, dir: t.d, size: t.s, len: SIZES[t.s].len,
      comps: makeComps(t), hidden: !!t.h, state: LOT, ramp: -1,
      rush: t.r || 0, lock: t.k ?? -1, tt: !!t.tt, gate: -1,
    }));
    // Wartende LKWs in Toren bekommen fortlaufende Nummern hinter den Hof-LKWs.
    this.gates = (level.gates || []).map((g, gi) => {
      const queue = g.q.map((q) => {
        const id = this.trucks.length;
        const len = SIZES[q.s].len;
        const [dx, dy] = DIRS[g.d];
        this.trucks.push({
          id, x: g.x + dx * len, y: g.y + dy * len, dir: g.d, size: q.s, len,
          comps: makeComps(q), hidden: !!q.h, state: WAIT, ramp: -1,
          rush: 0, lock: -1, tt: false, gate: gi,
        });
        return id;
      });
      return { x: g.x, y: g.y, d: g.d, queue, next: 0 };
    });
    this.barriers = (level.barriers || []).map((b) => ({ cells: b.cells, n: b.n, open: false }));
    this.ramps = new Array(level.ramps + (opts.extraRamps || 0)).fill(-1);
    this.supply = parseSupply(level.supply);
    this.si = 0;        // erste Palette des vordersten noch nicht verladenen Blocks
    this.used = [];     // verladene Blöcke (1 = weg)
    this.moves = 0;
    this.departed = 0;
    this.extraUsed = false;
    this.status = 'playing';
    this.grid = new Int16Array(this.w * this.h).fill(EMPTY);
    for (const t of this.trucks) {
      if (t.state === LOT) for (const [x, y] of this.cells(t)) this.grid[y * this.w + x] = t.id;
    }
    for (const g of this.gates) this.grid[g.y * this.w + g.x] = OBST;
    for (const b of this.barriers) for (const [x, y] of b.cells) this.grid[y * this.w + x] = OBST;
    const ev = [];
    this._spawn(ev);
    this._reveal(ev);
    this.startEvents = ev;
  }

  // Schnelle Kopie für den Solver.
  clone() {
    const g = Object.create(Game.prototype);
    g.level = this.level;
    g.w = this.w;
    g.h = this.h;
    g.sandbox = this.sandbox;
    g.noEnd = this.noEnd;
    g.trucks = this.trucks.map((t) => ({ ...t, comps: t.comps.map((c) => ({ ...c })) }));
    g.gates = this.gates.map((x) => ({ ...x }));
    g.barriers = this.barriers.map((b) => ({ ...b }));
    g.ramps = this.ramps.slice();
    g.supply = this.supply; // wird nur von Boni verändert, dann vorher kopiert
    g.si = this.si;
    g.used = this.used.slice();
    g.moves = this.moves;
    g.departed = this.departed;
    g.extraUsed = this.extraUsed;
    g.status = this.status;
    g.grid = this.grid.slice();
    return g;
  }

  // Alle Felder, die ein LKW belegt (Kopf zuerst).
  cells(t) {
    const [dx, dy] = DIRS[t.dir];
    const out = [];
    for (let i = 0; i < t.len; i++) out.push([t.x - dx * i, t.y - dy * i]);
    return out;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  truckAt(x, y) {
    if (!this.inBounds(x, y)) return EMPTY;
    return this.grid[y * this.w + x];
  }

  // Erstes Hindernis auf dem Weg nach vorne (LKW-Nummer oder OBST), sonst EMPTY.
  blockerOf(t) {
    const [dx, dy] = DIRS[t.dir];
    let x = t.x + dx;
    let y = t.y + dy;
    while (this.inBounds(x, y)) {
      const o = this.grid[y * this.w + x];
      if (o !== EMPTY) return o;
      x += dx;
      y += dy;
    }
    return EMPTY;
  }

  isLocked(t) {
    if (t.lock < 0) return false;
    const k = this.trucks[t.lock].state;
    return k === LOT || k === WAIT;
  }

  canExit(t) {
    return t.state === LOT && !this.isLocked(t) && this.blockerOf(t) === EMPTY;
  }

  freeRampCount() {
    let n = 0;
    for (const r of this.ramps) if (r < 0) n++;
    return n;
  }

  lotCount() {
    let n = 0;
    for (const t of this.trucks) if (t.state === LOT || t.state === WAIT) n++;
    return n;
  }

  rushLeft(t) {
    return t.rush ? t.rush - this.moves : 0;
  }

  legalMoves() {
    if (this.status !== 'playing') return [];
    if (!this.sandbox && this.ramps.indexOf(-1) < 0) return [];
    const out = [];
    for (const t of this.trucks) if (this.canExit(t)) out.push(t.id);
    return out;
  }

  // ---------- Spieler-Aktionen ----------

  // Spieler tippt einen LKW an.
  tap(id) {
    if (this.status !== 'playing') return { ok: false, reason: 'over' };
    const t = this.trucks[id];
    if (!t || t.state !== LOT) return { ok: false, reason: 'invalid' };
    if (this.isLocked(t)) return { ok: false, reason: 'locked', key: t.lock };
    const b = this.blockerOf(t);
    if (b !== EMPTY) return { ok: false, reason: 'blocked', blocker: b };
    if (this.sandbox) {
      this._removeFromLot(t);
      t.state = GONE;
      this.departed++;
      this.moves++;
      const ev = [];
      this._afterLotChange(ev);
      return { ok: true, events: ev };
    }
    const r = this.ramps.indexOf(-1);
    if (r < 0) return { ok: false, reason: 'noRamp' };
    const ev = [];
    this._sendToRamp(t, r, ev, false);
    return { ok: true, events: ev };
  }

  // Bonus: Extra-Rampe (1× pro Level).
  useExtraRamp() {
    if (this.status !== 'playing' || this.extraUsed) return null;
    this.extraUsed = true;
    this.ramps.push(-1);
    return [{ type: 'addRamp', ramp: this.ramps.length - 1 }];
  }

  // Bonus: Kran hebt einen beliebigen LKW aus dem Hof an eine freie Rampe.
  useCrane(id) {
    if (this.status !== 'playing') return null;
    const t = this.trucks[id];
    if (!t || t.state !== LOT) return null;
    const r = this.ramps.indexOf(-1);
    if (r < 0) return null;
    const ev = [];
    this._sendToRamp(t, r, ev, true);
    return ev;
  }

  // Bonus: Umsortieren. Paletten für die LKWs an den Rampen kommen aus der
  // ganzen Schlange nach vorne, die nächsten anderen werden gemischt.
  useShuffle(seed = 1) {
    if (this.status !== 'playing') return null;
    const rng = makeRng(seed + this.moves * 7919);
    const need = {};
    for (const id of this.ramps) {
      if (id < 0) continue;
      for (const c of this.trucks[id].comps) need[c.color] = (need[c.color] || 0) + c.cap - c.loaded;
    }
    // Nur ganze Blöcke umsortieren, damit gleiche Farben zusammen bleiben.
    // Blöcke für die geparkten LKWs kommen nach vorne, die nächsten 10 übrigen werden gemischt.
    const slots = [];
    const fb = [];
    const rb = [];
    const nb = Math.floor(this.supply.length / BLOCK);
    for (let b = this.si / BLOCK; b < nb; b++) {
      if (this.used[b]) continue;
      slots.push(b);
      const blk = this.supply.slice(b * BLOCK, b * BLOCK + BLOCK);
      const c = colorOf(blk[0]);
      if (need[c] >= BLOCK) { need[c] -= BLOCK; fb.push(blk); } else rb.push(blk);
    }
    rng.shuffle(fb);
    const mixN = Math.min(10, rb.length);
    const mb = rb.slice(0, mixN);
    rng.shuffle(mb);
    const order = fb.concat(mb, rb.slice(mixN));
    this.supply = this.supply.slice();
    slots.forEach((b, k) => { for (let i = 0; i < BLOCK; i++) this.supply[b * BLOCK + i] = order[k][i]; });
    const ev = [{ type: 'shuffle' }];
    this._resolve(ev);
    this._afterResolve(ev);
    return ev;
  }

  // Bonus: Gabelstapler belädt einen LKW an Rampe r sofort voll
  // (passende Paletten werden irgendwo aus der Schlange geholt).
  useForklift(r) {
    if (this.status !== 'playing') return null;
    const id = this.ramps[r];
    if (id === undefined || id < 0) return null;
    const t = this.trucks[id];
    const ev = [];
    const nb = Math.floor(this.supply.length / BLOCK);
    t.comps.forEach((comp, ci) => {
      let need = comp.cap - comp.loaded;
      let got = 0;
      const blocks = [];
      for (let b = nb - 1; b >= this.si / BLOCK && need >= BLOCK; b--) {
        if (this.used[b] || colorOf(this.supply[b * BLOCK]) !== comp.color) continue;
        this.used[b] = 1;
        blocks.push(b);
        need -= BLOCK;
        got += BLOCK;
      }
      if (got) {
        comp.loaded += got;
        ev.push({ type: 'forkload', ramp: r, id, comp: ci, color: comp.color, count: got, n: comp.loaded, blocks });
      }
    });
    this._advance();
    const t2 = this.trucks[id];
    if (t2.comps.every((cp) => cp.loaded >= cp.cap)) {
      this.ramps[r] = -1;
      t2.state = GONE;
      t2.ramp = -1;
      this.departed++;
      ev.push({ type: 'depart', ramp: r, id });
    }
    ev.push({ type: 'requeue' });
    this._resolve(ev);
    this._afterResolve(ev);
    return ev;
  }

  // ---------- intern ----------

  _removeFromLot(t) {
    for (const [x, y] of this.cells(t)) this.grid[y * this.w + x] = EMPTY;
  }

  _sendToRamp(t, r, ev, crane) {
    this._removeFromLot(t);
    t.state = RAMP;
    t.ramp = r;
    t.hidden = false;
    this.ramps[r] = t.id;
    this.moves++;
    ev.push({ type: 'exit', id: t.id, ramp: r, crane });
    this._afterLotChange(ev);
  }

  // Nach jedem Zug: Drehscheiben, Tore, Beladen, Schranken, Planen, Eilaufträge.
  _afterLotChange(ev) {
    this._rotate(ev);
    this._spawn(ev);
    if (!this.sandbox) this._resolve(ev);
    this._afterResolve(ev);
  }

  _afterResolve(ev) {
    if (this._settle(ev)) return;
    if (this.noEnd) return;
    if (this.sandbox) {
      if (this.trucks.every((t) => t.state === GONE)) this.status = 'won';
      return;
    }
    this._checkEnd(ev);
  }

  // Schranken, Tore, Planen, Eilaufträge. Liefert true, wenn ein Eilauftrag verpasst wurde.
  _settle(ev) {
    this._openBarriers(ev);
    this._spawn(ev);
    this._reveal(ev);
    if (this.sandbox) return false;
    for (const t of this.trucks) {
      if (t.rush && (t.state === LOT || t.state === WAIT) && this.moves >= t.rush) {
        this.status = 'lost';
        ev.push({ type: 'lost', reason: 'rush', id: t.id });
        return true;
      }
    }
    return false;
  }

  // Die verladbaren Blöcke (Nummern) an den Ausgabeplätzen, vorderster zuerst.
  openBlocks() {
    const out = [];
    const nb = Math.floor(this.supply.length / BLOCK);
    for (let b = this.si / BLOCK; b < nb && out.length < WINDOW; b++) if (!this.used[b]) out.push(b);
    return out;
  }

  // Vorderste Palette der Schlange (oder -1, wenn leer).
  front() {
    const o = this.openBlocks();
    return o.length ? this.supply[o[0] * BLOCK] : -1;
  }

  // Passt irgendein Block an den Ausgabeplätzen zu einem geparkten LKW?
  canLoadNow() {
    for (const b of this.openBlocks()) if (this._findTarget(colorOf(this.supply[b * BLOCK]))) return true;
    return false;
  }

  _advance() {
    while (this.si < this.supply.length && this.used[this.si / BLOCK]) this.si += BLOCK;
  }

  // Drehscheiben drehen sich nach jedem Zug um 90° im Uhrzeigersinn (falls Platz).
  _rotate(ev) {
    for (const t of this.trucks) {
      if (!t.tt || t.state !== LOT) continue;
      const [dx, dy] = DIRS[t.dir];
      const px = t.x - dx * (t.len - 1);
      const py = t.y - dy * (t.len - 1);
      let k = CLOCKWISE.indexOf(t.dir);
      for (let step = 1; step <= 3; step++) {
        const nd = CLOCKWISE[(k + step) % 4];
        const [ex, ey] = DIRS[nd];
        let ok = true;
        for (let i = 1; i < t.len; i++) {
          const x = px + ex * i;
          const y = py + ey * i;
          if (!this.inBounds(x, y) || this.grid[y * this.w + x] !== EMPTY) { ok = false; break; }
        }
        if (!ok) continue;
        this._removeFromLot(t);
        const from = t.dir;
        t.dir = nd;
        t.x = px + ex * (t.len - 1);
        t.y = py + ey * (t.len - 1);
        for (const [x, y] of this.cells(t)) this.grid[y * this.w + x] = t.id;
        ev.push({ type: 'rotate', id: t.id, from, to: nd, steps: step });
        break;
      }
    }
  }

  // Tore schicken den nächsten LKW, sobald der Platz davor frei ist.
  _spawn(ev) {
    for (let gi = 0; gi < this.gates.length; gi++) {
      const g = this.gates[gi];
      if (g.next >= g.queue.length) continue;
      const t = this.trucks[g.queue[g.next]];
      const [dx, dy] = DIRS[g.d];
      let ok = true;
      for (let i = 1; i <= t.len; i++) {
        const x = g.x + dx * i;
        const y = g.y + dy * i;
        if (!this.inBounds(x, y) || this.grid[y * this.w + x] !== EMPTY) { ok = false; break; }
      }
      if (!ok) continue;
      t.state = LOT;
      for (const [x, y] of this.cells(t)) this.grid[y * this.w + x] = t.id;
      g.next++;
      ev.push({ type: 'spawn', id: t.id, gate: gi, left: g.queue.length - g.next });
    }
  }

  _openBarriers(ev) {
    for (let bi = 0; bi < this.barriers.length; bi++) {
      const b = this.barriers[bi];
      if (b.open || this.departed < b.n) continue;
      b.open = true;
      for (const [x, y] of b.cells) this.grid[y * this.w + x] = EMPTY;
      ev.push({ type: 'barrier', index: bi });
    }
  }

  // Planen werden aufgedeckt, sobald der Weg des LKWs frei ist.
  _reveal(ev) {
    for (const t of this.trucks) {
      if (t.state === LOT && t.hidden && this.blockerOf(t) === EMPTY) {
        t.hidden = false;
        ev.push({ type: 'reveal', id: t.id });
      }
    }
  }

  // Beladen und Abfahren: Die vorderste Palette geht in einen passenden LKW,
  // so lange das klappt. Ein voller LKW fährt sofort ab.
  _resolve(ev) {
    for (let guard = 0; guard < 10000; guard++) {
      let done = false;
      for (const b of this.openBlocks()) {
        const c = colorOf(this.supply[b * BLOCK]);
        const tg = this._findTarget(c);
        if (!tg) continue;
        const id = this.ramps[tg.r];
        for (let k = 0; k < BLOCK; k++) {
          const q = b * BLOCK + k;
          tg.comp.loaded++;
          ev.push({ type: 'load', q, code: this.supply[q], ramp: tg.r, id, comp: tg.ci, color: c, n: tg.comp.loaded });
        }
        this.used[b] = 1;
        this._advance();
        const t = this.trucks[id];
        if (t.comps.every((cp) => cp.loaded >= cp.cap)) {
          this.ramps[tg.r] = -1;
          t.state = GONE;
          t.ramp = -1;
          this.departed++;
          ev.push({ type: 'depart', ramp: tg.r, id });
        }
        done = true;
        break;
      }
      if (!done) return;
    }
  }

  // Passender geparkter LKW für eine Palette: der, dem am wenigsten fehlt.
  _findTarget(color) {
    let best = null;
    let bestRemain = Infinity;
    for (let r = 0; r < this.ramps.length; r++) {
      const id = this.ramps[r];
      if (id < 0) continue;
      const t = this.trucks[id];
      for (let ci = 0; ci < t.comps.length; ci++) {
        const comp = t.comps[ci];
        if (comp.color !== color || comp.cap - comp.loaded < BLOCK) continue;
        const remain = comp.cap - comp.loaded;
        if (remain < bestRemain) {
          bestRemain = remain;
          best = { r, ci, comp };
        }
      }
    }
    return best;
  }

  _checkEnd(ev) {
    if (this.trucks.every((t) => t.state === GONE)) {
      this.status = 'won';
      ev.push({ type: 'won' });
      return;
    }
    // Nichts geht mehr: kein LKW kann losfahren (Rampen voll oder alle blockiert),
    // und die vorderste Palette passt zu keinem geparkten LKW.
    if (this.legalMoves().length === 0) {
      this.status = 'lost';
      ev.push({ type: 'lost', reason: this.freeRampCount() === 0 ? 'ramps' : 'stuck' });
    }
  }

  // Eindeutiger Schlüssel des Spielzustands für den Solver-Cache.
  key() {
    let s = '';
    for (const t of this.trucks) s += t.state;
    for (const t of this.trucks) if (t.tt && t.state === LOT) s += t.dir;
    const rs = [];
    for (const id of this.ramps) {
      if (id >= 0) rs.push(id + ':' + this.trucks[id].comps.map((c) => c.loaded).join(','));
    }
    rs.sort();
    let u = '';
    for (let b = this.si / BLOCK, n = b + 12; b < n; b++) u += this.used[b] ? 1 : 0;
    return s + '|' + rs.join(';') + '|' + this.si + u + '|' + this.ramps.length;
  }
}

// Prüft, ob ein Level formal stimmig ist (Palettenzahl = Kapazität je Farbe usw.).
export function validateLevel(level) {
  const errors = [];
  const need = {};
  const addNeed = (t) => {
    const sz = SIZES[t.s];
    if (!sz) { errors.push(`unbekannte Größe ${t.s}`); return; }
    sz.caps.forEach((cap, i) => {
      const c = i === 0 ? t.c : (t.c2 ?? t.c);
      need[c] = (need[c] || 0) + cap;
    });
  };
  const grid = new Int16Array(level.w * level.h).fill(-1);
  const occupy = (x, y, what) => {
    if (x < 0 || y < 0 || x >= level.w || y >= level.h) { errors.push(`${what} ragt aus dem Hof`); return; }
    if (grid[y * level.w + x] >= 0) errors.push(`${what} überlappt etwas`);
    grid[y * level.w + x] = 1;
  };
  level.trucks.forEach((t, i) => {
    addNeed(t);
    const sz = SIZES[t.s];
    if (!sz) return;
    const [dx, dy] = DIRS[t.d];
    for (let k = 0; k < sz.len; k++) occupy(t.x - dx * k, t.y - dy * k, `LKW ${i}`);
    if (t.k !== undefined && (t.k < 0 || t.k >= level.trucks.length || t.k === i)) errors.push(`LKW ${i}: ungültige Kette`);
  });
  (level.gates || []).forEach((g, gi) => {
    occupy(g.x, g.y, `Tor ${gi}`);
    g.q.forEach(addNeed);
  });
  (level.barriers || []).forEach((b, bi) => b.cells.forEach(([x, y]) => occupy(x, y, `Schranke ${bi}`)));
  const have = {};
  for (const code of parseSupply(level.supply)) {
    const c = colorOf(code);
    have[c] = (have[c] || 0) + 1;
  }
  const colors = new Set([...Object.keys(need), ...Object.keys(have)]);
  for (const c of colors) {
    if ((need[c] || 0) !== (have[c] || 0)) {
      errors.push(`Farbe ${c}: ${have[c] || 0} Paletten, aber ${need[c] || 0} Ladeplätze`);
    }
  }
  return errors;
}
