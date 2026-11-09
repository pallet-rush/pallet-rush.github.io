// Spielansicht: Layout, Animationen und Eingabe.
// Die Logik (model.js) ist immer schon fertig gerechnet. Die Ansicht spielt die
// gelieferten Ereignisse zeitlich gestaffelt als Animation ab.
//
// Aufbau von oben nach unten:
//   Halle mit zwei Zulieferbändern (zeigen die nächsten Paletten)
//   vorderes Förderband (nur von hier wird geladen)
//   Laderampen
//   Straße + Hof mit den LKWs
//   Bonus-Leiste (HTML)

import { COLORS, DIRS, CLOCKWISE } from '../core/constants.js';
import { drawTruck, drawPallet, bedSlotLocal, rr, shade, badge, padlock, keyIcon } from './draw.js';
import { sfx, vibrate } from '../audio.js';

const LW = 400; // logische Breite
const DIR_ANGLE = { R: 0, D: Math.PI / 2, L: Math.PI, U: -Math.PI / 2 };
const DOCK_LEN = { S: 62, M: 92, L: 116, T: 116 };
const SPEED = 0.62; // px pro ms
const BELT_SPEED = 0.000016; // Umdrehungen pro ms
const FEED_GAP = 22; // Abstand der Paletten auf den Zulieferbändern
const FEED_SHOW = 7; // sichtbare Paletten pro Zulieferband

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class GameView {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.game = null;
    this.symbols = false;
    this.insets = { top: 60, bottom: 90 };
    this.tasks = [];
    this.flying = [];
    this.puffs = [];
    this.idleCbs = [];
    this.select = null; // 'truck' | 'dock' während ein Bonus ein Ziel braucht
    canvas.addEventListener('pointerdown', (e) => this.onPointer(e));
    window.addEventListener('resize', () => this.resize());
    this.resize();
    const loop = (t) => {
      this.frame(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  setInsets(top, bottom) {
    this.insets = { top, bottom };
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cw = this.canvas.clientWidth || window.innerWidth;
    const ch = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(cw * dpr);
    this.canvas.height = Math.round(ch * dpr);
    this.dpr = dpr;
    this.scale = Math.min(cw / LW, ch / 760);
    this.offX = (cw - LW * this.scale) / 2;
    this.LH = ch / this.scale;
    this.layout();
  }

  layout() {
    const top = this.insets.top / this.scale + 2;
    const bottom = this.insets.bottom / this.scale;
    const feedY = top + 18;
    const belt = { x: 20, y: feedY + 20, w: LW - 40, h: 100 };
    belt.r = belt.h / 2;
    const dockY = belt.y + belt.h + 16;
    const dockH = DOCK_LEN.L + 8;
    const roadY = dockY + dockH + 14;
    const L = { top, feedY, belt, dockY, dockH, roadY };
    L.feedHeads = [[LW / 2 - 40, feedY], [LW / 2 + 40, feedY]];
    if (this.game) {
      const g = this.game;
      const ringGap = 16;
      const lotTop = roadY + ringGap;
      const availH = this.LH - bottom - lotTop - ringGap - 8;
      const cell = Math.max(24, Math.min((LW - 2 * (ringGap + 22)) / g.w, availH / g.h, 50));
      const lotW = cell * g.w;
      const lotH = cell * g.h;
      L.cell = cell;
      L.lot = { x: (LW - lotW) / 2, y: lotTop, w: lotW, h: lotH };
      L.ring = { x: L.lot.x - ringGap, y: roadY, x2: L.lot.x + lotW + ringGap, y2: lotTop + lotH + ringGap };
      const n = g.ramps.length;
      const spacing = Math.min(66, (LW - 30) / n);
      L.dockW = Math.min(40, spacing - 14);
      L.dockSpacing = spacing;
      L.docks = [];
      for (let i = 0; i < n; i++) L.docks.push(LW / 2 + (i - (n - 1) / 2) * spacing);
    }
    this.L = L;
    if (this.game) this.placeStatic();
  }

  // ---------- Spiel setzen ----------
  setGame(game, { symbols = false } = {}) {
    this.game = game;
    this.symbols = symbols;
    this.tasks = [];
    this.flying = [];
    this.puffs = [];
    this.idleCbs = [];
    this.select = null;
    if (!game) return;
    this.now = performance.now();
    this.beltT0 = this.now;
    this.beltView = game.belt.slice();
    this.vsiPlanned = game.si;
    this.feedTaken = new Set();
    for (let i = 0; i < game.si; i++) this.feedTaken.add(i);
    this.feedShift = [0, 0];
    this.chainNo = {};
    let cn = 0;
    this.trucks = game.trucks.map((t) => {
      if (t.lock >= 0) { this.chainNo[t.id] = ++cn; this.chainNo['k' + t.lock] = this.chainNo['k' + t.lock] || cn; }
      return {
        id: t.id, len: t.len, size: t.size, dir: t.dir,
        comps: t.comps.map((c) => ({ ...c })),
        hidden: t.hidden, mode: t.state === 3 ? 'wait' : 'lot',
        kf: [], doorT0: 0, fullT: 0, flashT: 0, revealT: 0,
        rush: t.rush, lock: t.lock, tt: t.tt,
      };
    });
    // Drehpunkte merken (bleiben sichtbar, auch wenn der LKW weg ist)
    this.turntables = game.trucks.filter((t) => t.tt).map((t) => {
      const [dx, dy] = DIRS[t.dir];
      return { x: t.x - dx * (t.len - 1), y: t.y - dy * (t.len - 1) };
    });
    this.gateView = game.gates.map((g) => ({ left: g.queue.length - g.next }));
    this.barrierView = game.barriers.map((b) => ({ open: b.open, openT: 0 }));
    const n = game.ramps.length;
    this.dockFreeAt = new Array(n).fill(0);
    this.dockReadyAt = new Array(n).fill(0);
    this.dockCursor = new Array(n).fill(0);
    this.dockLanded = new Array(n).fill(0);
    this.dockTruck = new Array(n).fill(-1);
    this.slotTime = new Array(game.belt.length).fill(0);
    this.busyUntil = 0;
    this.layout();
  }

  lotCenter(t) {
    const { lot, cell } = this.L;
    const [dx, dy] = DIRS[t.dir];
    const tailX = t.x - dx * (t.len - 1);
    const tailY = t.y - dy * (t.len - 1);
    return [lot.x + ((t.x + tailX) / 2 + 0.5) * cell, lot.y + ((t.y + tailY) / 2 + 0.5) * cell];
  }

  cellCenter(x, y) {
    const { lot, cell } = this.L;
    return [lot.x + (x + 0.5) * cell, lot.y + (y + 0.5) * cell];
  }

  lotDims(tv) {
    return [tv.len * this.L.cell - 6, this.L.cell * 0.74];
  }

  dockDims(tv) {
    return [DOCK_LEN[tv.size], this.L.dockW];
  }

  dockPos(tv, r) {
    const [Lw] = this.dockDims(tv);
    return [this.L.docks[r], this.L.dockY + Lw / 2 + 4];
  }

  // Positionen aller ruhenden LKWs neu setzen (nach Layout-Wechsel).
  placeStatic() {
    for (const tv of this.trucks) {
      const t = this.game.trucks[tv.id];
      if (tv.mode === 'lot') {
        const [x, y] = this.lotCenter(t);
        tv.kf = [{ t: 0, x, y, a: DIR_ANGLE[t.dir], s: 0 }];
      } else if (tv.mode === 'dock' && tv.dock !== undefined) {
        const [x, y] = this.dockPos(tv, tv.dock);
        tv.kf = [{ t: 0, x, y, a: Math.PI / 2, s: 1 }];
      }
    }
  }

  // ---------- Zeitplanung ----------
  schedule(t, fn) {
    this.tasks.push({ t, fn });
    this.tasks.sort((a, b) => a.t - b.t);
    if (t > this.busyUntil) this.busyUntil = t;
  }

  isIdle() {
    return this.tasks.length === 0 && this.flying.length === 0;
  }

  whenIdle(fn) {
    if (this.isIdle()) fn();
    else this.idleCbs.push(fn);
  }

  // ---------- Pfade ----------
  pathKf(points, t0, s0, s1) {
    const kf = [];
    let t = t0;
    let total = 0;
    for (let i = 1; i < points.length; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    total = total || 1;
    let done = 0;
    const a0 = Math.atan2(points[1][1] - points[0][1], points[1][0] - points[0][0]);
    kf.push({ t, x: points[0][0], y: points[0][1], a: a0, s: s0 });
    for (let i = 1; i < points.length; i++) {
      const [px, py] = points[i - 1];
      const [qx, qy] = points[i];
      const seg = Math.hypot(qx - px, qy - py);
      if (seg < 0.01) continue;
      const a = Math.atan2(qy - py, qx - px);
      const isCorner = i < points.length - 1;
      const r = isCorner ? Math.min(16, seg / 2) : 0;
      const ux = (qx - px) / seg;
      const uy = (qy - py) / seg;
      done += seg - r;
      t += (seg - r) / SPEED;
      kf.push({ t, x: qx - ux * r, y: qy - uy * r, a, s: lerp(s0, s1, done / total) });
      if (isCorner) {
        const [nx, ny] = points[i + 1];
        const nseg = Math.hypot(nx - qx, ny - qy) || 1;
        const r2 = Math.min(16, nseg / 2);
        const na = Math.atan2(ny - qy, nx - qx);
        done += r + r2;
        t += (r + r2) / SPEED;
        const p2 = [qx + ((nx - qx) / nseg) * r2, qy + ((ny - qy) / nseg) * r2];
        kf.push({ t, x: p2[0], y: p2[1], a: na, s: lerp(s0, s1, Math.min(1, done / total)) });
        points[i] = p2;
      }
    }
    return { kf, t };
  }

  ringPerimeterPoints(from, to) {
    const R = this.L.ring;
    const corners = [[R.x, R.y], [R.x2, R.y], [R.x2, R.y2], [R.x, R.y2]];
    const W = R.x2 - R.x;
    const H = R.y2 - R.y;
    const per = 2 * (W + H);
    const param = ([x, y]) => {
      if (Math.abs(y - R.y) < 0.5) return x - R.x;
      if (Math.abs(x - R.x2) < 0.5) return W + (y - R.y);
      if (Math.abs(y - R.y2) < 0.5) return W + H + (R.x2 - x);
      return 2 * W + H + (R.y2 - y);
    };
    const cornerParam = [0, W, W + H, 2 * W + H];
    const a = param(from);
    const b = param(to);
    const fwd = (b - a + per) % per;
    const pts = [];
    if (fwd <= per - fwd) {
      for (let c = 0; c < 4; c++) {
        const d = (cornerParam[c] - a + per) % per;
        if (d > 0.5 && d < fwd - 0.5) pts.push({ d, p: corners[c] });
      }
    } else {
      const bwd = per - fwd;
      for (let c = 0; c < 4; c++) {
        const d = (a - cornerParam[c] + per) % per;
        if (d > 0.5 && d < bwd - 0.5) pts.push({ d, p: corners[c] });
      }
    }
    pts.sort((u, v) => u.d - v.d);
    return pts.map((q) => q.p);
  }

  exitPoint(t) {
    const R = this.L.ring;
    const [cx, cy] = this.lotCenter(t);
    switch (t.dir) {
      case 'U': return [cx, R.y];
      case 'D': return [cx, R.y2];
      case 'L': return [R.x, cy];
      default: return [R.x2, cy];
    }
  }

  // ---------- Ereignisse abspielen ----------
  play(events) {
    const now = performance.now();
    for (const ev of events) {
      switch (ev.type) {
        case 'exit': (ev.crane ? this.evCrane(ev, now) : this.evExit(ev, now)); break;
        case 'reveal': this.evReveal(ev, now); break;
        case 'load': this.evLoad(ev, now); break;
        case 'forkload': this.evForkload(ev, now); break;
        case 'depart': this.evDepart(ev, now); break;
        case 'refill': this.evRefill(ev, now); break;
        case 'spawn': this.evSpawn(ev, now); break;
        case 'rotate': this.evRotate(ev, now); break;
        case 'barrier': this.evBarrier(ev, now); break;
        case 'addRamp': this.evAddRamp(); break;
        case 'shuffle': this.evShuffle(ev, now); break;
        case 'won':
        case 'lost': {
          const at = Math.max(this.busyUntil, now) + 500;
          this.schedule(at, () => (ev.type === 'won' ? this.hooks.onWon?.() : this.hooks.onLost?.(ev.reason, ev.id)));
          break;
        }
        default: break;
      }
    }
  }

  // Nach dem Abfahren an die Rampe: Zeiten der Rampe setzen.
  _claimDock(tv, id, r, tArr) {
    tv.dock = r;
    this.dockTruck[r] = id;
    this.dockReadyAt[r] = tArr;
    this.dockCursor[r] = tArr;
    this.dockLanded[r] = tArr;
    this.dockFreeAt[r] = Infinity;
    this.schedule(tArr, () => {
      tv.mode = 'dock';
      this.hooks.onRampsChanged?.();
    });
  }

  evExit(ev, now) {
    const tv = this.trucks[ev.id];
    const t = this.game.trucks[ev.id];
    const r = ev.ramp;
    // Position im Hof zum Zeitpunkt der Abfahrt (aus der Ansicht, falls Drehscheibe)
    const p0 = this.posOf(tv, now);
    const start = [p0.x, p0.y];
    const fake = { ...t, dir: this.dirFromAngle(p0.a) };
    const p1 = this.exitPoint(fake);
    const dockX = this.L.docks[r];
    const E = [dockX, this.L.ring.y];
    const pts = [start, p1, ...this.ringPerimeterPoints(p1, E), E];
    const clean = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.5);
    if (clean.length < 2) clean.push([E[0], E[1] + 0.1]);
    let { kf, t: tE } = this.pathKf(clean, now, 0, 0.6);
    const last = kf[kf.length - 1];
    if (this.dockFreeAt[r] > tE) {
      kf.push({ ...last, t: this.dockFreeAt[r] });
      tE = this.dockFreeAt[r];
    }
    const tTurn = tE + 220;
    kf.push({ t: tTurn, x: dockX, y: E[1], a: Math.PI / 2, s: 0.8 });
    const D = this.dockPos(tv, r);
    const tArr = tTurn + Math.abs(D[1] - E[1]) / (SPEED * 0.55);
    kf.push({ t: tArr, x: D[0], y: D[1], a: Math.PI / 2, s: 1 });
    tv.kf = kf;
    tv.mode = 'moving';
    tv.hidden = false;
    this._claimDock(tv, ev.id, r, tArr);
    sfx.start();
  }

  dirFromAngle(a) {
    const k = Math.round(((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 2)) % 4;
    return ['R', 'D', 'L', 'U'][k];
  }

  // Kran: anheben, direkt zur Rampe schweben, absetzen.
  evCrane(ev, now) {
    const tv = this.trucks[ev.id];
    const r = ev.ramp;
    const p0 = this.posOf(tv, now);
    const D = this.dockPos(tv, r);
    const t1 = now + 300;
    const t2 = t1 + 800;
    const t3 = t2 + 300;
    tv.kf = [
      { t: now, x: p0.x, y: p0.y, a: p0.a, s: 0, lift: 0 },
      { t: t1, x: p0.x, y: p0.y - 10, a: p0.a, s: 0, lift: 1 },
      { t: t2, x: D[0], y: D[1] - 10, a: Math.PI / 2, s: 1, lift: 1 },
      { t: t3, x: D[0], y: D[1], a: Math.PI / 2, s: 1, lift: 0 },
    ];
    tv.mode = 'moving';
    tv.crane = true;
    tv.hidden = false;
    this._claimDock(tv, ev.id, r, t3);
    this.schedule(t3, () => { tv.crane = false; vibrate(20); });
    sfx.start();
  }

  evReveal(ev, now) {
    const tv = this.trucks[ev.id];
    this.schedule(now + 280, () => {
      tv.hidden = false;
      tv.revealT = performance.now();
    });
  }

  evLoad(ev, now) {
    const r = ev.ramp;
    const id = this.dockTruck[r];
    const tv = this.trucks[id];
    const T = Math.max(this.dockCursor[r], this.slotTime[ev.slot], now);
    this.dockCursor[r] = T + 40;
    this.slotTime[ev.slot] = T;
    const dur = 300;
    const comp = ev.comp;
    const idx = ev.n - 1;
    this.schedule(T, () => {
      this.beltView[ev.slot] = -1;
      const [sx, sy] = this.slotPos(ev.slot, T);
      this.flying.push({ t0: T, dur, color: ev.color, from: [sx, sy], to: () => this.bedWorld(tv, comp, idx), size0: 16, size1: 9 });
    });
    this.schedule(T + dur, () => {
      tv.comps[comp].loaded = Math.max(tv.comps[comp].loaded, ev.n);
      sfx.pallet(ev.n / tv.comps[comp].cap);
    });
    this.dockLanded[r] = Math.max(this.dockLanded[r], T + dur);
  }

  // Gabelstapler: Paletten kommen von der Seite direkt auf den LKW.
  evForkload(ev, now) {
    const r = ev.ramp;
    const tv = this.trucks[this.dockTruck[r]];
    const T = Math.max(this.dockCursor[r], now);
    const startN = ev.n - ev.count;
    const from = [this.L.docks[r] < LW / 2 ? -20 : LW + 20, this.L.dockY + 70];
    for (let k = 0; k < ev.count; k++) {
      const tk = T + k * 35;
      const idx = startN + k;
      this.schedule(tk, () => {
        this.flying.push({ t0: tk, dur: 380, color: ev.color, from, to: () => this.bedWorld(tv, ev.comp, idx), size0: 16, size1: 9 });
      });
      this.schedule(tk + 380, () => {
        tv.comps[ev.comp].loaded = Math.max(tv.comps[ev.comp].loaded, idx + 1);
        sfx.pallet((idx + 1) / tv.comps[ev.comp].cap);
      });
    }
    this.dockCursor[r] = T + ev.count * 35;
    this.dockLanded[r] = Math.max(this.dockLanded[r], T + ev.count * 35 + 380);
  }

  bedWorld(tv, comp, idx) {
    const p = this.posOf(tv, performance.now());
    const [L, W] = this.dimsAt(tv, p.s);
    const [lx, ly] = bedSlotLocal(L, W, tv.comps, comp, idx);
    const c = Math.cos(p.a);
    const s = Math.sin(p.a);
    return [p.x + lx * c - ly * s, p.y + lx * s + ly * c];
  }

  evDepart(ev, now) {
    const r = ev.ramp;
    const tv = this.trucks[ev.id];
    const T = Math.max(this.dockLanded[r], this.dockReadyAt[r], now) + 220;
    this.schedule(T, () => {
      tv.fullT = performance.now();
      tv.doorT0 = performance.now();
      sfx.full();
      vibrate(25);
    });
    const tGo = T + 640;
    const D = this.dockPos(tv, r);
    const E = [D[0], this.L.ring.y];
    const out = [D[0] < LW / 2 ? -130 : LW + 130, this.L.ring.y];
    const { kf, t: tEnd } = this.pathKf([D, E, out], tGo, 1, 1);
    this.schedule(tGo, () => {
      tv.mode = 'leaving';
      tv.kf = [{ t: tGo - 1, x: D[0], y: D[1], a: Math.PI / 2, s: 1 }, ...kf];
      sfx.horn();
      setTimeout(() => sfx.depart(), 120);
      this.hooks.onDepart?.();
    });
    const [Lw] = this.dockDims(tv);
    this.dockFreeAt[r] = tGo + (Lw + 30) / SPEED;
    this.schedule(this.dockFreeAt[r], () => this.hooks.onRampsChanged?.());
    this.schedule(tEnd, () => { tv.mode = 'gone'; });
  }

  evRefill(ev, now) {
    const T = Math.max(this.slotTime[ev.slot], now) + 50;
    const dur = 340;
    const idx = this.vsiPlanned++;
    this.slotTime[ev.slot] = T + dur;
    this.schedule(T, () => {
      this.feedTaken.add(idx);
      this.feedShift[idx % 2] = performance.now();
      this.flying.push({
        t0: T, dur, color: ev.color & 15, covered: ev.color >= 16, from: this.L.feedHeads[idx % 2],
        to: () => this.slotPos(ev.slot, performance.now()), size0: 16, size1: 16, refill: true,
      });
    });
    this.schedule(T + dur, () => { this.beltView[ev.slot] = ev.color; });
  }

  evSpawn(ev, now) {
    const tv = this.trucks[ev.id];
    const t = this.game.trucks[ev.id];
    const g = this.game.gates[t.gate];
    const [gx, gy] = this.cellCenter(g.x, g.y);
    const [x, y] = this.lotCenter(t);
    const a = DIR_ANGLE[t.dir];
    const T = Math.max(now, this.lastLotAnim || 0) + 250;
    this.schedule(T, () => {
      tv.mode = 'lot';
      this.gateView[t.gate].left = ev.left;
      tv.kf = [{ t: T, x: gx, y: gy, a, s: 0 }, { t: T + 450, x, y, a, s: 0 }];
    });
  }

  evRotate(ev, now) {
    const tv = this.trucks[ev.id];
    const t = this.game.trucks[ev.id];
    const [dx, dy] = DIRS[t.dir];
    const px = t.x - dx * (t.len - 1);
    const py = t.y - dy * (t.len - 1);
    const [cx, cy] = this.cellCenter(px, py);
    const half = ((t.len - 1) / 2) * this.L.cell;
    const k0 = CLOCKWISE.indexOf(ev.from);
    const T = now + 350;
    const kf = [];
    const steps = ev.steps * 3;
    for (let i = 0; i <= steps; i++) {
      const ang = DIR_ANGLE[ev.from] + (i / steps) * ev.steps * (Math.PI / 2);
      kf.push({ t: T + i * 70, x: cx + Math.cos(ang) * half, y: cy + Math.sin(ang) * half, a: ang, s: 0 });
    }
    void k0;
    this.lastLotAnim = T + steps * 70;
    this.schedule(T, () => { if (tv.mode === 'lot') tv.kf = kf; });
  }

  evBarrier(ev, now) {
    const bv = this.barrierView[ev.index];
    this.schedule(Math.max(now, this.busyUntil - 200), () => {
      bv.open = true;
      bv.openT = performance.now();
      sfx.full();
    });
  }

  evAddRamp() {
    for (const arr of [this.dockFreeAt, this.dockReadyAt, this.dockCursor, this.dockLanded]) arr.push(0);
    this.dockTruck.push(-1);
    this.layout();
    this.newDockT = performance.now();
  }

  evShuffle(ev, now) {
    // Alte Paletten fliegen in die Mitte, neue kommen heraus.
    const mid = [LW / 2, this.L.belt.y + this.L.belt.r];
    for (let i = 0; i < this.beltView.length; i++) {
      const c = this.beltView[i];
      if (c < 0) continue;
      const from = this.slotPos(i, now);
      this.flying.push({ t0: now, dur: 260, color: c & 15, covered: c >= 16, from, to: () => mid, size0: 16, size1: 10 });
      this.beltView[i] = -1;
    }
    this.vsiPlanned = this.game.si;
    this.feedTaken = new Set();
    for (let i = 0; i < this.game.si; i++) this.feedTaken.add(i);
    ev.belt.forEach((c, i) => {
      if (c < 0) return;
      const T = now + 280 + i * 18;
      this.slotTime[i] = T + 300;
      this.schedule(T, () => {
        this.flying.push({ t0: T, dur: 300, color: c & 15, covered: c >= 16, from: mid, to: () => this.slotPos(i, performance.now()), size0: 10, size1: 16 });
      });
      this.schedule(T + 300, () => { this.beltView[i] = c; });
    });
  }

  // ---------- Positionen ----------
  slotPos(i, t) {
    const n = this.beltView.length;
    const u = (i / n + (t - this.beltT0) * BELT_SPEED) % 1;
    return this.stadium(u);
  }

  stadium(u) {
    const b = this.L.belt;
    const inset = 12;
    const x0 = b.x + b.r;
    const x1 = b.x + b.w - b.r;
    const r = b.r - inset;
    const cy = b.y + b.r;
    const straight = x1 - x0;
    const arc = Math.PI * r;
    const per = 2 * straight + 2 * arc;
    let d = u * per;
    if (d < straight) return [x0 + d, cy - r];
    d -= straight;
    if (d < arc) { const a = -Math.PI / 2 + d / r; return [x1 + Math.cos(a) * r, cy + Math.sin(a) * r]; }
    d -= arc;
    if (d < straight) return [x1 - d, cy + r];
    d -= straight;
    const a = Math.PI / 2 + d / r;
    return [x0 + Math.cos(a) * r, cy + Math.sin(a) * r];
  }

  // Bildschirmposition (CSS-Pixel) für HTML-Einblendungen.
  warnAnchor() {
    const b = this.L.belt;
    return [this.offX + (b.x + b.w / 2) * this.scale, (b.y + b.r) * this.scale];
  }

  posOf(tv, now) {
    const kf = tv.kf;
    if (!kf.length) return { x: 0, y: 0, a: 0, s: 0, lift: 0 };
    if (now <= kf[0].t) return kf[0];
    for (let i = 1; i < kf.length; i++) {
      if (now <= kf[i].t) {
        const a = kf[i - 1];
        const b = kf[i];
        const f = (now - a.t) / Math.max(1, b.t - a.t);
        return {
          x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), a: lerpAngle(a.a, b.a, f), s: lerp(a.s, b.s, f),
          lift: lerp(a.lift || 0, b.lift || 0, f),
        };
      }
    }
    return kf[kf.length - 1];
  }

  dimsAt(tv, s) {
    const [l0, w0] = this.lotDims(tv);
    const [l1, w1] = this.dockDims(tv);
    return [lerp(l0, l1, s), lerp(w0, w1, s)];
  }

  // ---------- Eingabe ----------
  onPointer(e) {
    if (!this.game || !this.L.lot) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - this.offX) / this.scale;
    const y = (e.clientY - rect.top) / this.scale;
    if (this.select === 'dock') {
      const L = this.L;
      if (y >= L.dockY && y <= L.dockY + L.dockH) {
        for (let r = 0; r < L.docks.length; r++) {
          if (Math.abs(x - L.docks[r]) < L.dockSpacing / 2) { this.hooks.onDockTap?.(r); return; }
        }
      }
      return;
    }
    const { lot, cell } = this.L;
    const cx = Math.floor((x - lot.x) / cell);
    const cy = Math.floor((y - lot.y) / cell);
    const id = this.game.truckAt(cx, cy);
    if (id < 0) return;
    this.hooks.onTap?.(id);
  }

  // Rückmeldung, wenn ein LKW nicht fahren kann.
  nudge(id, blocker) {
    const tv = this.trucks[id];
    const now = performance.now();
    const t = this.game.trucks[id];
    const [x, y] = this.lotCenter(t);
    const [dx, dy] = DIRS[t.dir];
    const a = DIR_ANGLE[t.dir];
    tv.kf = [
      { t: now, x, y, a, s: 0 },
      { t: now + 70, x: x + dx * 5, y: y + dy * 5, a, s: 0 },
      { t: now + 220, x, y, a, s: 0 },
    ];
    if (blocker >= 0) this.trucks[blocker].flashT = now;
  }

  // ---------- Zeichnen ----------
  frame(now) {
    this.now = now;
    while (this.tasks.length && this.tasks[0].t <= now) this.tasks.shift().fn();
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#7cc35b';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.game) return;
    ctx.setTransform(this.scale * this.dpr, 0, 0, this.scale * this.dpr, this.offX * this.dpr, 0);
    this.drawScene(ctx, now);
    this.flying = this.flying.filter((f) => now - f.t0 < f.dur);
    if (this.idleCbs.length && this.isIdle()) {
      const cbs = this.idleCbs;
      this.idleCbs = [];
      cbs.forEach((fn) => fn());
    }
  }

  drawScene(ctx, now) {
    const L = this.L;
    this.left = -this.offX / this.scale;
    this.fullW = this.canvas.width / this.dpr / this.scale;

    this.drawHall(ctx, now);
    this.drawBelt(ctx, now);
    this.drawDocks(ctx);
    this.drawYard(ctx, now);

    const order = { lot: 0, dock: 1, moving: 2, leaving: 3 };
    const vis = this.trucks.filter((t) => order[t.mode] !== undefined)
      .sort((a, b) => (order[a.mode] - order[b.mode]) || ((a.crane ? 1 : 0) - (b.crane ? 1 : 0)));
    for (const tv of vis) this.drawTruckView(ctx, tv, now);

    this.drawOverlays(ctx, now);
    this.drawPuffs(ctx, now);
    this.drawFlying(ctx, now);
    this.drawChecks(ctx, now);
  }

  // Lagerhalle oben mit Zulieferbändern
  drawHall(ctx, now) {
    const L = this.L;
    const left = this.left;
    const W = this.fullW;
    const wallBottom = L.feedY + 10;
    // Hallenwand (blau, Wellblech)
    const grd = ctx.createLinearGradient(0, 0, 0, wallBottom);
    grd.addColorStop(0, '#4f9be0');
    grd.addColorStop(1, '#3d86cc');
    ctx.fillStyle = grd;
    ctx.fillRect(left, 0, W, wallBottom);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = Math.floor(left / 12) * 12; x < left + W; x += 12) { ctx.moveTo(x, 0); ctx.lineTo(x, wallBottom); }
    ctx.stroke();
    // Hallenboden
    ctx.fillStyle = '#f4e6c6';
    ctx.fillRect(left, wallBottom, W, L.dockY - wallBottom);
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(left, wallBottom, W, 4);
    // Zulieferbänder: links Richtung Mitte, rechts Richtung Mitte
    const y = L.feedY;
    const [lh, rh] = L.feedHeads;
    this.drawFeeder(ctx, left - 10, lh[0] + 12, y, now, 1);
    this.drawFeeder(ctx, rh[0] - 12, left + W + 10, y, now, -1);
    // Schütten in das Hauptband
    for (const [hx] of L.feedHeads) {
      ctx.fillStyle = '#d6a92c';
      ctx.beginPath();
      ctx.moveTo(hx - 13, y + 8);
      ctx.lineTo(hx + 13, y + 8);
      ctx.lineTo(hx + 9, L.belt.y + 8);
      ctx.lineTo(hx - 9, L.belt.y + 8);
      ctx.closePath();
      ctx.fill();
    }
    // Paletten auf den Zulieferbändern (nächste zuerst, vorne an der Schütte)
    const supply = this.game.supply;
    for (let f = 0; f < 2; f++) {
      const shiftF = Math.max(0, 1 - (now - this.feedShift[f]) / 200);
      let k = 0;
      for (let i = this.game.si - 40 < 0 ? 0 : 0; i < supply.length && k < FEED_SHOW; i++) {
        if (i % 2 !== f || this.feedTaken.has(i)) continue;
        const dist = (k + shiftF * 1) * FEED_GAP;
        const x = f === 0 ? L.feedHeads[0][0] - dist : L.feedHeads[1][0] + dist;
        const code = supply[i];
        drawPallet(ctx, x, y + 1, 16, code & 15, { symbols: this.symbols, covered: code >= 16 });
        k++;
      }
    }
  }

  drawFeeder(ctx, x0, x1, y, now, dir) {
    ctx.fillStyle = '#b8892a';
    rr(ctx, x0, y - 10, x1 - x0, 24, 6);
    ctx.fill();
    ctx.fillStyle = '#f2c230';
    rr(ctx, x0, y - 12, x1 - x0, 22, 6);
    ctx.fill();
    ctx.fillStyle = '#3a3f47';
    ctx.fillRect(x0, y - 8, x1 - x0, 14);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const off = ((now * 0.02 * dir) % 10 + 10) % 10;
    for (let x = x0 + off; x < x1; x += 10) { ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 5); }
    ctx.stroke();
  }

  drawBelt(ctx, now) {
    const b = this.L.belt;
    // 3D-Rahmen
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    rr(ctx, b.x + 3, b.y + 8, b.w, b.h, b.r);
    ctx.fill();
    ctx.fillStyle = '#c7911c';
    rr(ctx, b.x, b.y + 5, b.w, b.h, b.r);
    ctx.fill();
    ctx.fillStyle = '#f2c230';
    rr(ctx, b.x, b.y, b.w, b.h, b.r);
    ctx.fill();
    ctx.fillStyle = '#3a3f47';
    rr(ctx, b.x + 4, b.y + 3, b.w - 8, b.h - 7, b.r - 4);
    ctx.fill();
    // Innenfläche
    ctx.fillStyle = '#f2c230';
    rr(ctx, b.x + 24, b.y + 22, b.w - 48, b.h - 46, b.r - 24);
    ctx.fill();
    ctx.fillStyle = '#ffe28a';
    rr(ctx, b.x + 26, b.y + 23, b.w - 52, b.h - 52, b.r - 26);
    ctx.fill();
    // Rollen
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const n = 64;
    for (let i = 0; i < n; i++) {
      const u = (i / n + (now - this.beltT0) * BELT_SPEED) % 1;
      const [x, y] = this.stadium(u);
      const [x2, y2] = this.stadium((u + 0.001) % 1);
      const nx = -(y2 - y);
      const ny = x2 - x;
      const l = Math.hypot(nx, ny) || 1;
      ctx.moveTo(x - (nx / l) * 9, y - (ny / l) * 9);
      ctx.lineTo(x + (nx / l) * 9, y + (ny / l) * 9);
    }
    ctx.stroke();
    // Restanzeige
    const left = this.game.supply.length - this.feedTaken.size;
    ctx.fillStyle = '#8a6100';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`▸ ${Math.max(0, left)}`, b.x + 34, b.y + b.r - 1);
    for (let i = 0; i < this.beltView.length; i++) {
      const c = this.beltView[i];
      if (c < 0) continue;
      const [x, y] = this.slotPos(i, now);
      drawPallet(ctx, x, y, 16, c & 15, { symbols: this.symbols, covered: c >= 16 });
    }
  }

  drawDocks(ctx) {
    const L = this.L;
    const y = L.dockY;
    const left = this.left;
    const W = this.fullW;
    // Rampen-Gebäudekante (rot)
    ctx.fillStyle = '#c94f3d';
    ctx.fillRect(left, y - 12, W, 12);
    ctx.fillStyle = '#e8664a';
    ctx.fillRect(left, y - 12, W, 7);
    // Vorplatz
    ctx.fillStyle = '#c9d3dc';
    ctx.fillRect(left, y, W, L.dockH + 16);
    const now = performance.now();
    for (let r = 0; r < L.docks.length; r++) {
      const x = L.docks[r];
      const w = L.dockW + 12;
      const isNew = r === L.docks.length - 1 && this.newDockT && now - this.newDockT < 800;
      ctx.fillStyle = '#5a3a32';
      ctx.fillRect(x - w / 2, y - 12, w, 12);
      for (let k = 0; k < w; k += 8) {
        ctx.fillStyle = (k / 8) % 2 ? '#2b2b2b' : '#f2c230';
        ctx.fillRect(x - w / 2 + k, y, Math.min(8, w - k), 5);
      }
      ctx.strokeStyle = isNew ? '#2fa865' : '#f2c230';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y + 6);
      ctx.lineTo(x - w / 2, y + L.dockH - 4);
      ctx.moveTo(x + w / 2, y + 6);
      ctx.lineTo(x + w / 2, y + L.dockH - 4);
      ctx.stroke();
      ctx.fillStyle = '#1f1f1f';
      ctx.fillRect(x - w / 2 + 2, y, 5, 8);
      ctx.fillRect(x + w / 2 - 7, y, 5, 8);
      const tid = this.dockTruck[r];
      const free = tid < 0 || this.trucks[tid].mode === 'gone' || this.trucks[tid].mode === 'leaving';
      if (free) {
        ctx.fillStyle = 'rgba(70,85,100,0.35)';
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(r + 1), x, y + L.dockH / 2);
      }
      if (this.select === 'dock' && !free && this.trucks[tid].mode === 'dock') {
        ctx.strokeStyle = `rgba(242,184,31,${0.6 + 0.4 * Math.sin(now / 200)})`;
        ctx.lineWidth = 3;
        rr(ctx, x - w / 2 - 2, y + 2, w + 4, L.dockH - 2, 8);
        ctx.stroke();
      }
    }
  }

  drawYard(ctx, now) {
    const L = this.L;
    const R = L.ring;
    const road = 30;
    const left = this.left;
    const W = this.fullW;
    // Grünfläche ist Hintergrund; Büsche an den Seiten
    ctx.fillStyle = '#6ab34b';
    for (let i = 0; i < 6; i++) {
      const yy = R.y + 40 + i * 70;
      if (yy > this.LH - 20) break;
      for (const xx of [left + 10, left + W - 10]) {
        ctx.beginPath();
        ctx.arc(xx, yy, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // obere Straße + Ring
    ctx.fillStyle = '#4b5563';
    ctx.fillRect(left, R.y - road / 2 + 5, W, road);
    ctx.fillRect(R.x - road / 2, R.y - road / 2 + 5, R.x2 - R.x + road, R.y2 - R.y + road);
    ctx.fillStyle = '#5b6573';
    ctx.fillRect(left, R.y - road / 2, W, road);
    ctx.fillRect(R.x - road / 2, R.y - road / 2, R.x2 - R.x + road, R.y2 - R.y + road);
    const lot = L.lot;
    ctx.fillStyle = '#6b7685';
    ctx.fillRect(lot.x - 2, lot.y - 2, lot.w + 4, lot.h + 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(left, R.y);
    ctx.lineTo(R.x, R.y);
    ctx.moveTo(R.x2, R.y);
    ctx.lineTo(left + W, R.y);
    ctx.rect(R.x, R.y, R.x2 - R.x, R.y2 - R.y);
    ctx.stroke();
    ctx.setLineDash([]);
    // Parkraster
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= this.game.w; i++) {
      ctx.moveTo(lot.x + i * L.cell, lot.y);
      ctx.lineTo(lot.x + i * L.cell, lot.y + lot.h);
    }
    for (let j = 0; j <= this.game.h; j++) {
      ctx.moveTo(lot.x, lot.y + j * L.cell);
      ctx.lineTo(lot.x + lot.w, lot.y + j * L.cell);
    }
    ctx.stroke();

    // Drehscheiben
    for (const tt of this.turntables) {
      const [cx, cy] = this.cellCenter(tt.x, tt.y);
      const r = L.cell * 1.45;
      ctx.fillStyle = '#4a5260';
      ctx.beginPath();
      ctx.arc(cx, cy + 3, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8e99a8';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 6, -0.3, 1.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r - 6, Math.PI - 0.3, Math.PI + 1.2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (const ang of [1.2, Math.PI + 1.2]) {
        const ax = cx + Math.cos(ang) * (r - 6);
        const ay = cy + Math.sin(ang) * (r - 6);
        ctx.beginPath();
        ctx.arc(ax, ay, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Tore
    this.game.gates.forEach((g, gi) => {
      const [cx, cy] = this.cellCenter(g.x, g.y);
      const s = L.cell;
      ctx.fillStyle = '#2f6fae';
      rr(ctx, cx - s / 2 + 1, cy - s / 2 + 5, s - 2, s - 2, 6);
      ctx.fill();
      ctx.fillStyle = '#4f9be0';
      rr(ctx, cx - s / 2 + 1, cy - s / 2 - 1, s - 2, s - 2, 6);
      ctx.fill();
      // Öffnung zeigt in Fahrtrichtung
      const [dx, dy] = DIRS[g.d];
      ctx.fillStyle = '#1e2733';
      ctx.fillRect(cx + dx * s * 0.28 - (dy ? s * 0.32 : 4), cy + dy * s * 0.28 - (dx ? s * 0.32 : 4) - 1, dy ? s * 0.64 : 8, dx ? s * 0.64 : 8);
      const left = this.gateView[gi].left;
      if (left > 0) badge(ctx, cx - dx * 4, cy - dy * 4 - 2, 9, '#2d3138', String(left));
    });

    // Schranken
    this.game.barriers.forEach((b, bi) => {
      const bv = this.barrierView[bi];
      const fade = bv.open ? Math.max(0, 1 - (now - bv.openT) / 500) : 1;
      if (fade <= 0) return;
      ctx.globalAlpha = fade;
      for (const [x, y] of b.cells) {
        const [cx, cy] = this.cellCenter(x, y);
        const s = L.cell * 0.8;
        ctx.fillStyle = '#9b2c2c';
        rr(ctx, cx - s / 2, cy - s / 2 + 4, s, s, 6);
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        rr(ctx, cx - s / 2, cy - s / 2, s, s, 6);
        ctx.clip();
        for (let k = -s; k < s; k += 10) {
          ctx.fillStyle = (Math.round(k / 10) % 2) ? '#ffffff' : '#e5484d';
          ctx.beginPath();
          ctx.moveTo(cx - s / 2 + k, cy - s / 2);
          ctx.lineTo(cx - s / 2 + k + 10, cy - s / 2);
          ctx.lineTo(cx - s / 2 + k + 10 + s, cy + s / 2);
          ctx.lineTo(cx - s / 2 + k + s, cy + s / 2);
          ctx.fill();
        }
        ctx.restore();
      }
      const [x, y] = b.cells[0];
      const [cx, cy] = this.cellCenter(x, y);
      const remain = Math.max(0, b.n - this.departedView());
      badge(ctx, cx, cy, 10, '#2d3138', String(remain));
      ctx.globalAlpha = 1;
    });
  }

  departedView() {
    return this.trucks.filter((t) => t.mode === 'leaving' || t.mode === 'gone').length;
  }

  drawTruckView(ctx, tv, now) {
    const p = this.posOf(tv, now);
    const [Lp, Wp] = this.dimsAt(tv, p.s);
    const door = tv.doorT0 ? Math.min(1, (now - tv.doorT0) / 380) : 0;
    const flash = tv.flashT ? Math.max(0, 1 - (now - tv.flashT) / 450) : 0;
    let scale = 1;
    if (tv.revealT) {
      const f = (now - tv.revealT) / 300;
      if (f < 1) scale = 1 + Math.sin(f * Math.PI) * 0.06;
    }
    const lift = p.lift || 0;
    scale *= 1 + lift * 0.12;
    if (lift > 0) {
      // Kranseil
      ctx.strokeStyle = '#2d3138';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, -20);
      ctx.lineTo(p.x, p.y - 4);
      ctx.stroke();
      ctx.fillStyle = '#f2c230';
      ctx.fillRect(p.x - 6, p.y - 8, 12, 6);
    }
    const highlight = this.select === 'truck' && tv.mode === 'lot' ? 0.6 + 0.4 * Math.sin(now / 200) : 0;
    drawTruck(ctx, {
      x: p.x, y: p.y, a: p.a, L: Lp * scale, W: Wp * scale,
      comps: tv.comps, hidden: tv.hidden, open: tv.mode === 'dock' || tv.mode === 'leaving',
      door, flash, symbols: this.symbols, lift, highlight, depth: p.s > 0.5 ? 6 : 7,
    });
    if (tv.mode === 'dock') {
      const txt = tv.comps.map((c) => `${c.loaded}/${c.cap}`).join(' · ');
      const bx = p.x;
      const by = p.y + Lp / 2 + 11;
      ctx.font = 'bold 11px system-ui, sans-serif';
      const tw = ctx.measureText(txt).width + 10;
      ctx.fillStyle = 'rgba(30,34,40,0.8)';
      rr(ctx, bx - tw / 2, by - 8, tw, 16, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, bx, by + 0.5);
    }
    if (tv.mode === 'leaving' && Math.random() < 0.35) {
      const back = -Lp / 2;
      this.puffs.push({ x: p.x + Math.cos(p.a) * back, y: p.y + Math.sin(p.a) * back, t0: now });
    }
  }

  // Abzeichen über den LKWs im Hof: Eilauftrag, Kette, Schlüssel.
  drawOverlays(ctx, now) {
    for (const tv of this.trucks) {
      if (tv.mode !== 'lot') continue;
      const p = this.posOf(tv, now);
      if (tv.rush) {
        const left = this.game.rushLeft(this.game.trucks[tv.id]);
        if (left > 0) {
          const urgent = left <= 2;
          badge(ctx, p.x, p.y - 2, urgent ? 12 : 11, urgent ? '#e5484d' : '#f7791a', String(left));
          // Blaulicht-Punkt
          ctx.fillStyle = `rgba(59,130,246,${0.5 + 0.5 * Math.sin(now / 160)})`;
          ctx.beginPath();
          ctx.arc(p.x + 12, p.y - 12, 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Abgelaufen: rot pulsierende 0, damit klar ist, welcher LKW das Level beendet hat
          badge(ctx, p.x, p.y - 2, 12 + 2 * Math.sin(now / 120), '#e5484d', '0');
        }
      }
      if (tv.lock >= 0) {
        const keyMode = this.trucks[tv.lock].mode;
        if (keyMode === 'lot' || keyMode === 'wait') {
          const n = this.chainNo[tv.id];
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
          ctx.fill();
          padlock(ctx, p.x, p.y + 1, 18, '#8e4ec6');
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 9px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(String(n), p.x, p.y + 4);
        }
      }
      const kn = this.chainNo['k' + tv.id];
      if (kn) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
        ctx.fill();
        keyIcon(ctx, p.x - 2, p.y, 18, '#8e4ec6');
      }
    }
  }

  drawPuffs(ctx, now) {
    this.puffs = this.puffs.filter((q) => now - q.t0 < 700);
    for (const q of this.puffs) {
      const f = (now - q.t0) / 700;
      ctx.fillStyle = `rgba(150,155,160,${0.35 * (1 - f)})`;
      ctx.beginPath();
      ctx.arc(q.x, q.y - f * 6, 3 + f * 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawFlying(ctx, now) {
    for (const f of this.flying) {
      if (now < f.t0) continue;
      const k = ease(Math.min(1, (now - f.t0) / f.dur));
      const to = f.to();
      const x = lerp(f.from[0], to[0], k);
      const y = lerp(f.from[1], to[1], k);
      const lift = Math.sin(k * Math.PI) * (f.refill ? 8 : 18);
      drawPallet(ctx, x, y, lerp(f.size0, f.size1, k), f.color, { symbols: this.symbols, lift, covered: f.covered });
    }
  }

  drawChecks(ctx, now) {
    for (const tv of this.trucks) {
      if (!tv.fullT) continue;
      const f = (now - tv.fullT) / 1100;
      if (f > 1) continue;
      const p = this.posOf(tv, now);
      const a = f < 0.15 ? f / 0.15 : f > 0.75 ? (1 - f) / 0.25 : 1;
      const r = 14 * (f < 0.15 ? 0.7 + 0.3 * (f / 0.15) : 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#1a6e3f';
      ctx.beginPath();
      ctx.arc(p.x, p.y + 2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2fa865';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x - 5, p.y);
      ctx.lineTo(p.x - 1, p.y + 4);
      ctx.lineTo(p.x + 6, p.y - 4);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

// Für Farbe in HTML (Bonus-Hinweise)
export const colorHex = (c) => COLORS[c].hex;
export { shade };
