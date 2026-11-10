// Spielansicht: Layout, Szene, Verkehr, Animationen und Eingabe.
// Die Logik (model.js) ist immer schon fertig gerechnet. Die Ansicht spielt die
// gelieferten Ereignisse als Animation ab und hält dabei die Reihenfolge ein:
//  - Paletten verlassen die Schlange streng der Reihe nach,
//  - eine Palette startet erst, wenn ihr LKW wirklich an der Rampe steht,
//  - ein LKW fährt erst ab, wenn seine letzte Palette gelandet ist.
//
// Aufbau (virtuelle Breite 390, Hochformat), von oben nach unten:
//   Halle mit zwei Toren → zwei gerade Zulieferbänder → rundes Förderband
//   → Weiche → Ladestation → Rollenbahn an den Rampen → Parkbuchten
//   → Ringstraße (Einbahn im Uhrzeigersinn) → Stau im Inneren des Rings.
//
// Verkehr: Jeder fahrende LKW folgt einem geglätteten Pfad. Vor jedem Schritt
// prüft er, ob sein Umriss ein Stück weiter vorne einen anderen LKW berührt,
// und wartet dann. Wer zuerst losgefahren ist, hat Vorfahrt; so gibt es weder
// Zusammenstöße noch Verklemmungen. In eine Bucht setzt ein LKW erst zurück,
// wenn sie wirklich frei ist.

import { COLORS, DIRS, SIZES, COVER, LOT, WAIT, GONE } from '../core/constants.js';
import { t as tr } from '../i18n.js';
import { drawVehicle, drawPallet, vehicleSlot, vehicleLength, vehicleWidth } from './vehicles.js';
import * as P from './props.js';
import { sfx, vibrate } from '../audio.js';

const FW = 390; // Breite der Fabrik (Hochformat: ganze Szene)
const LOT_W = 372; // Querformat: Breite des Hofs rechts neben der Fabrik
const LAND_H = 434; // Querformat: Höhe der Szene (Halle bis Rampenstraße)
const DIR_ANGLE = { R: 0, D: Math.PI / 2, L: Math.PI, U: -Math.PI / 2 };
const LOT_K = 0.77;      // Maßstab der LKWs im Hof relativ zum Raster (Abstand zueinander)
const ROAD_W = 30;
const CORNER = 26;
const REV_R = 30; // Radius beim Rückwärts-Einparken
const PALLET = 12; // Palettengröße auf den Bändern
const GAP = 18; // (alt) Abstand der Paletten auf einer Spur
const COLS = 4; // Paletten nebeneinander auf einem Band (= ein Block)
const WINDOW = 3; // Ausgabeplätze: links, Mitte, rechts
const SLOT_CLEAR = 20; // Mindestabstand seitlicher Auslauf ↔ mittlerer Auslauf (Palettenmitten)
const CHUTE_W = 16; // Breite der Rollenrutschen (Auslauf → Rollenbahn → Bucht)
const COL_GAP = 13.5; // Querabstand der Spalten
const ROW_GAP = 15; // Abstand der Reihen
const BELT_W = 60; // Breite der Zulieferbänder
const VMAX = 0.5; // px/ms vorwärts
const VREV = 0.16; // px/ms rückwärts
const ACC = 0.0012; // px/ms²
const LOAD_EVERY = 90; // ms zwischen zwei Paletten

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * t;
}

// ---------- Pfade mit abgerundeten Ecken ----------
function makePath(pts, radius = 18) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const A = pts[i - 1];
    const B = pts[i];
    const C = pts[i + 1];
    const l1 = Math.hypot(B.x - A.x, B.y - A.y);
    const l2 = Math.hypot(C.x - B.x, C.y - B.y);
    if (l1 < 0.01 || l2 < 0.01) continue;
    const d1 = { x: (B.x - A.x) / l1, y: (B.y - A.y) / l1 };
    const d2 = { x: (C.x - B.x) / l2, y: (C.y - B.y) / l2 };
    const cos = clamp(d1.x * d2.x + d1.y * d2.y, -1, 1);
    const th = Math.acos(cos);
    if (th < 0.02) { out.push(B); continue; }
    const cut = Math.min(radius * Math.tan(th / 2), l1 * 0.5, l2 * 0.5);
    const p0 = { x: B.x - d1.x * cut, y: B.y - d1.y * cut };
    const p1 = { x: B.x + d2.x * cut, y: B.y + d2.y * cut };
    const n = Math.max(4, Math.ceil(th * 8));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const u = 1 - t;
      out.push({ x: u * u * p0.x + 2 * u * t * B.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * B.y + t * t * p1.y });
    }
  }
  out.push(pts[pts.length - 1]);
  const s = [0];
  for (let i = 1; i < out.length; i++) s.push(s[i - 1] + Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y));
  const length = s[s.length - 1];
  return {
    pts: out,
    s,
    length,
    at(d) {
      d = clamp(d, 0, length);
      let lo = 0;
      let hi = s.length - 1;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (s[m] <= d) lo = m; else hi = m;
      }
      const A = out[lo];
      const B = out[hi];
      const seg = s[hi] - s[lo] || 1;
      const t = (d - s[lo]) / seg;
      return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, a: Math.atan2(B.y - A.y, B.x - A.x) };
    },
  };
}

// ---------- Rechteck-Kollision (SAT) ----------
function corners(x, y, a, l, w) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const hl = l / 2;
  const hw = w / 2;
  return [
    [x + c * hl - s * hw, y + s * hl + c * hw],
    [x + c * hl + s * hw, y + s * hl - c * hw],
    [x - c * hl + s * hw, y - s * hl - c * hw],
    [x - c * hl - s * hw, y - s * hl + c * hw],
  ];
}
function overlap(A, B) {
  for (const poly of [A, B]) {
    for (let i = 0; i < 4; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % 4];
      const nx = q[1] - p[1];
      const ny = p[0] - q[0];
      let a0 = Infinity; let a1 = -Infinity; let b0 = Infinity; let b1 = -Infinity;
      for (const v of A) { const d = v[0] * nx + v[1] * ny; if (d < a0) a0 = d; if (d > a1) a1 = d; }
      for (const v of B) { const d = v[0] * nx + v[1] * ny; if (d < b0) b0 = d; if (d > b1) b1 = d; }
      if (a1 < b0 || b1 < a0) return false;
    }
  }
  return true;
}

export class GameView {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.game = null;
    this.symbols = false;
    this.insets = { top: 60, bottom: 90, left: 0, right: 0 };
    this.VW = FW;
    this.land = false;
    this.select = null; // 'truck' | 'dock' während ein Bonus ein Ziel braucht
    this.idleCbs = [];
    this.timers = [];
    this.demoLevel = null;
    this.last = performance.now();
    canvas.addEventListener('pointerdown', (e) => this.onPointer(e));
    window.addEventListener('resize', () => this.resize());
    this.resetState();
    this.resize();
    const loop = (t) => {
      this.frame(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  resetState() {
    this.tvs = [];
    this.loads = []; // wartende Lade-Ereignisse (in Reihenfolge)
    this.flights = []; // fliegende Paletten
    this.fx = []; // Staubwolken, Funken, Häkchen, Konfetti, Lob-Texte
    this.shakeT = 0; this.shakeA = 0; // Bildschirmwackeln
    this.combo = 0; this.lastFull = 0;
    this.forklifts = [];
    this.cranes = [];
    this.endEv = null;
    this.order = 0;
    this.vGone = new Set(); // Paletten, die (sichtbar) schon weg sind
    this.vHead = 0;
    this.pp = new Map(); // aktuelle Position jeder sichtbaren Palette
    this._slotOf = new Map();
    this.qMoving = false;
    this.frameDt = 16;
    this.nextLoadAt = 0;
    this.beltPhase = 0;
    this.dockPhase = 0;
    this.popAt = -1e9;
    this.bayOcc = [];
    this.barrierAnim = [];
    this.rampFlash = -1e9;
    this.lotDirty = true;
    this.pulse = 0;
  }

  setInsets(top, bottom, left = 0, right = 0) {
    this.insets = { top, bottom, left, right };
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cw = this.canvas.clientWidth || window.innerWidth;
    const ch = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(cw * dpr);
    this.canvas.height = Math.round(ch * dpr);
    this.dpr = dpr;
    this.cw = cw;
    this.ch = ch;
    const ins = this.insets;
    // Querformat: Fabrik links, Hof rechts daneben
    this.land = cw > ch * 1.15;
    let scale;
    if (this.land) {
      this.VW = FW + LOT_W;
      const aw = Math.max(100, cw - (ins.left || 0) - (ins.right || 0));
      const ah = Math.max(100, ch - ins.top - ins.bottom);
      scale = Math.min(aw / this.VW, ah / LAND_H);
      this.offX = (ins.left || 0) + (aw - this.VW * scale) / 2;
      this.extraY = Math.max(0, ah / scale - LAND_H);
    } else {
      this.VW = FW;
      // Breite füllen; wird es zu niedrig, nach Höhe skalieren (Ränder mit Rasen)
      scale = cw / FW;
      const need = 760; // Mindesthöhe der Szene in virtuellen Einheiten (ohne Leisten)
      const avail = (ch - ins.top - ins.bottom) / scale;
      if (avail < need - 120) scale = (ch - ins.top - ins.bottom) / (need - 120);
      this.offX = (cw - FW * scale) / 2;
      this.extraY = 0;
    }
    this.scale = scale;
    this.VH = ch / scale;
    this.layout();
  }

  // ---------- Layout ----------
  layout() {
    const s = this.scale;
    const land = this.land;
    const T = this.insets.top / s + 2 + (land ? this.extraY * 0.45 : 0);
    const B = this.VH - this.insets.bottom / s;
    const L = { T, B, land };
    L.vx0 = -this.offX / s;
    L.vx1 = (this.cw - this.offX) / s;
    const changed = this.L && this.L.land !== land;
    L.hall = { y: T - 4, h: 50 };
    const gateY = T + 42;
    L.gateY = gateY;
    // Kreisbogen (rx = ry): gleiche Krümmung überall → gleiche Abstände der Reihen in der Kurve
    L.ell = { cx: FW / 2, cy: T + 85, rx: 85, ry: 85 };
    const { cx, cy, rx, ry } = L.ell;
    L.M = { x: cx, y: cy + ry };
    L.S = { x: cx, y: cy + ry + 20 };
    L.D = L.M.y + 76; // Rollenbahn (darüber: Rutschen von den drei Ausläufen)
    L.wallY = L.D + 18;
    L.bayTop = L.D + 28;
    L.bayH = 116;
    L.RY = L.bayTop + L.bayH + 17; // Mittellinie obere Ringstraße
    if (land) {
      // Ring rechts neben der Fabrik; seine Unterseite ist die Rampenstraße
      L.x1 = FW + 10;
      L.x2 = this.VW - 22;
      L.rT = T + 14;
      L.rB = L.RY;
      L.RB = L.RY;
    } else {
      L.RB = Math.max(L.RY + 250, B - ROAD_W / 2 - 6);
      L.x1 = 22;
      L.x2 = FW - 22;
      L.rT = L.RY;
      L.rB = L.RB;
    }
    L.ring = { x: L.x1, y: L.rT, w: L.x2 - L.x1, h: L.rB - L.rT };
    // Zulieferspuren: Tor → gerade nach unten → unterer Ellipsenbogen → Weiche → Station
    L.lanes = [0, 1].map((side) => {
      const x = side === 0 ? cx - rx : cx + rx;
      const pts = [{ x, y: gateY - 10 }, { x, y: cy }];
      const arc = side === 0 ? P.arcPoints(cx, cy, rx, ry, Math.PI, Math.PI / 2, 28) : P.arcPoints(cx, cy, rx, ry, 0, Math.PI / 2, 28);
      for (const p of arc.slice(1)) pts.push(p);
      return makePath(pts, 4);
    });
    // Rampen / Buchten
    const n = this.game ? this.game.ramps.length : 4;
    L.nBays = n;
    L.bayW = (FW - 60) / n;
    L.bays = [];
    for (let i = 0; i < n; i++) L.bays.push(30 + (i + 0.5) * L.bayW);
    L.cd = Math.min(22, (L.bayH - 6) / 5.15); // Fahrzeug-Maßstab an den Rampen
    L.slotW = Math.min(L.bayW - 8, L.cd * 0.84 + 16); // sichtbare Buchtbreite: knapp LKW-Breite
    // Hof (Stau) im Inneren des Rings
    const inner = { x: L.x1 + ROAD_W / 2 + 8, y: L.rT + ROAD_W / 2 + 8, x2: L.x2 - ROAD_W / 2 - 8, y2: L.rB - ROAD_W / 2 - 8 };
    L.inner = inner;
    L.lotC = { x: (inner.x + inner.x2) / 2, y: (inner.y + inner.y2) / 2 };
    const g = this.game || this.demo;
    if (g) {
      const ang = ((g.level.angle || 0) * Math.PI) / 180;
      L.ang = ang;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      // Ausdehnung aller belegbaren Felder (LKWs, Tore, Schranken) auf dem Bildschirm
      let mx = 0.5;
      let my = 0.5;
      const cells = [];
      for (const t of g.trucks) if (t.state === LOT || t.state === WAIT) for (const c of g.cells(t)) cells.push(c);
      for (const gt of g.gates) cells.push([gt.x, gt.y]);
      for (const b of g.barriers) for (const c of b.cells) cells.push(c);
      const ext = (Math.abs(ca) + Math.abs(sa)) / 2;
      for (const [x, y] of cells) {
        const gx = x + 0.5 - g.w / 2;
        const gy = y + 0.5 - g.h / 2;
        mx = Math.max(mx, Math.abs(gx * ca - gy * sa) + ext);
        my = Math.max(my, Math.abs(gx * sa + gy * ca) + ext);
      }
      const iw = inner.x2 - inner.x;
      const ih = inner.y2 - inner.y;
      L.cl = Math.min(30, iw / (2 * mx), ih / (2 * my));
      L.ca = ca;
      L.sa = sa;
    }
    this.L = L;
    this.sceneDirty = true;
    this.lotDirty = true;
    for (const tv of this.tvs) if (tv.state === 'lot') this.placeLot(tv);
    if (changed && (this.game || this.demo)) this.relocateMovers();
  }

  // Ausrichtung gewechselt, während LKWs unterwegs sind: Wege passen nicht mehr.
  // Abfahrende sind sofort weg, Ankommende stehen direkt an ihrer Rampe
  // (oder fahren neu los, wenn die Rampe noch belegt ist).
  relocateMovers() {
    const L = this.L;
    const now = performance.now();
    const dockY = (tv) => L.bayTop + vehicleLength(tv.size, L.cd) / 2 + 3;
    for (const tv of this.tvs) {
      if (tv.state === 'leave') {
        tv.state = 'gone';
        if (this.bayOcc[tv.bay] === tv) this.bayOcc[tv.bay] = null;
      }
    }
    for (const tv of this.tvs) {
      if (tv.state === 'dock') {
        tv.dockX = L.bays[tv.bay];
        tv.x = tv.dockX;
        tv.y = dockY(tv);
        tv.a = Math.PI / 2;
        tv.cell = L.cd;
      } else if (tv.state === 'crane') {
        const c = tv.crane;
        c.to.x = L.bays[c.r];
        c.to.y = dockY(tv);
        c.from = { x: c.to.x, y: c.to.y - 40, a: c.to.a, cell: L.cd };
      }
    }
    for (const tv of this.tvs) {
      if (tv.state !== 'drive') continue;
      const occ = this.bayOcc[tv.bay];
      if (!occ || occ === tv || occ.state === 'gone') {
        this.bayOcc[tv.bay] = tv;
        tv.x = L.bays[tv.bay];
        tv.y = dockY(tv);
        this.dock(tv, now);
      } else {
        tv.x = L.lotC.x;
        tv.y = L.lotC.y;
        tv.a = L.land ? Math.PI / 2 : -Math.PI / 2;
        tv.cell = L.cl * LOT_K;
        this.planApproach(tv, tv.bay);
        tv.s = 0;
        tv.v = 0;
        tv.phase = 'approach';
      }
    }
    this.lotDirty = true;
  }

  // Feld (Raster) → Bildschirm (virtuell)
  gridToScreen(gx, gy) {
    const L = this.L;
    const g = this.game || this.demo;
    const x = (gx - g.w / 2) * L.cl;
    const y = (gy - g.h / 2) * L.cl;
    return { x: L.lotC.x + x * L.ca - y * L.sa, y: L.lotC.y + x * L.sa + y * L.ca };
  }
  screenToGrid(x, y) {
    const L = this.L;
    const g = this.game || this.demo;
    const dx = x - L.lotC.x;
    const dy = y - L.lotC.y;
    return { gx: (dx * L.ca + dy * L.sa) / L.cl + g.w / 2, gy: (-dx * L.sa + dy * L.ca) / L.cl + g.h / 2 };
  }
  truckPose(t) {
    // Mitte des LKWs: Kopf-Feld minus halbe Länge
    const [dx, dy] = DIRS[t.dir];
    const hx = t.x + 0.5 - dx * (t.len - 1) / 2;
    const hy = t.y + 0.5 - dy * (t.len - 1) / 2;
    const p = this.gridToScreen(hx, hy);
    return { x: p.x, y: p.y, a: DIR_ANGLE[t.dir] + this.L.ang };
  }
  placeLot(tv) {
    const p = this.truckPose(tv.t);
    tv.x = p.x;
    tv.y = p.y;
    tv.a = p.a;
    tv.cell = this.L.cl * LOT_K; // etwas kleiner als das Raster: LKWs berühren sich nie
  }

  // ---------- Spiel setzen ----------
  setGame(game, { symbols = false } = {}) {
    this.game = game;
    this.symbols = symbols;
    this.resetState();
    this.timers = [];
    this.idleCbs = [];
    if (!game) {
      this.startDemo();
      return;
    }
    this.demo = null;
    this.layout();
    this.initTrucks(game);
    for (let i = 0; i < game.supply.length; i++) if (i < game.si || game.used[(i / COLS) | 0]) this.vGone.add(i);
    if (game.startEvents?.length) this.play(game.startEvents.filter((e) => e.type !== 'spawn' && e.type !== 'reveal'));
  }

  initTrucks(g) {
    this.tvs = g.trucks.map((t) => {
      const tv = {
        id: t.id, t, size: t.size, state: t.state === WAIT ? 'wait' : 'lot', len: 0, cell: 0,
        x: 0, y: 0, a: 0, v: 0, vis: t.comps.map(() => 0), pending: 0, hidden: t.hidden,
        flash: -1e9, nudge: null, squash: -1e9, alpha: 1, order: 0,
      };
      if (tv.state === 'lot') this.placeLot(tv);
      return tv;
    });
    this.bayOcc = new Array(g.ramps.length).fill(null);
    this.barrierAnim = g.barriers.map(() => -1);
    this.lotDirty = true;
  }

  // Menü: im Hintergrund spielt ein Level von selbst (Lösung aus den Leveldaten).
  setDemo(level) {
    this.demoLevel = level;
    if (!this.game) this.startDemo();
  }
  async startDemo() {
    this.demo = null;
    if (!this.demoLevel) { this.layout(); return; }
    const { Game } = await import('../core/model.js');
    if (this.game) return;
    this.resetState();
    this.demo = new Game(this.demoLevel);
    this.demoStep = 0;
    this.demoNext = performance.now() + 1500;
    this.layout();
    this.initTrucks(this.demo);
  }
  demoTick(now) {
    const g = this.demo;
    if (!g || now < this.demoNext) return;
    if (g.status !== 'playing') {
      if (this.isIdle()) this.startDemo();
      return;
    }
    const sol = g.level.sol || [];
    if (!this.canDispatch() || this.loads.length > 6) { this.demoNext = now + 300; return; }
    const id = sol[this.demoStep];
    if (id === undefined) return;
    const r = g.tap(id);
    if (r.ok) { this.demoStep++; this.play(r.events, true); }
    this.demoNext = now + 1100;
  }

  // ---------- Zeitsteuerung ----------
  after(ms, fn) {
    this.timers.push({ at: performance.now() + ms, fn });
  }
  isIdle() {
    if (this.timers.length || this.loads.length || this.flights.length || this.forklifts.length || this.cranes.length) return false;
    for (const tv of this.tvs) {
      if (tv.state === 'drive' || tv.state === 'leave' || tv.state === 'crane' || tv.state === 'spawn' || tv.state === 'rotate') return false;
      if (tv.pendingDepart) return false;
    }
    return true;
  }
  whenIdle(fn) {
    if (this.isIdle()) fn();
    else this.idleCbs.push(fn);
  }

  // ---------- Ereignisse ----------
  play(events, quiet = false) {
    const now = performance.now();
    this.quiet = quiet;
    for (const ev of events) {
      switch (ev.type) {
        case 'exit': this.evExit(ev, now); break;
        case 'reveal': { const tv = this.tvs[ev.id]; tv.revealAt = now; tv.hidden = false; this.lotDirty = true; break; }
        case 'load': this.loads.push(ev); this.tvs[ev.id].pending++; break;
        case 'depart': this.tvs[ev.id].pendingDepart = ev; break;
        case 'spawn': this.evSpawn(ev, now); break;
        case 'rotate': this.evRotate(ev, now); break;
        case 'barrier': this.barrierAnim[ev.index] = now; if (!quiet) sfx.full(); this.lotDirty = true; break;
        case 'addRamp': this.layout(); this.bayOcc.push(null); this.after(0, () => this.hooks.onRampsChanged?.()); break;
        case 'shuffle': this.popAt = now; break;
        case 'requeue': this.popAt = now; break;
        case 'forkload': this.evForkload(ev, now); break;
        case 'won':
        case 'lost':
          this.endEv = ev;
          break;
        default: break;
      }
    }
    if (this.endEv && !quiet) {
      const ev = this.endEv;
      // Ende erst melden, wenn alle Animationen fertig sind
      const check = () => this.whenIdle(() => setTimeout(() => {
        if (this.endEv !== ev) return;
        this.endEv = null;
        if (ev.type === 'won') this.hooks.onWon?.(); else this.hooks.onLost?.(ev.reason, ev.id);
      }, ev.type === 'won' ? 350 : 500));
      check();
    }
  }

  evExit(ev, now) {
    const tv = this.tvs[ev.id];
    tv.hidden = false;
    tv.ramp = ev.ramp;
    tv.bay = this.chooseBay(tv);
    tv.order = ++this.order;
    this.lotDirty = true;
    if (ev.crane) {
      this.startCrane(tv, tv.bay, now);
    } else {
      this.planApproach(tv, tv.bay);
      tv.state = 'drive';
      tv.v = 0;
      tv.s = 0;
      tv.phase = 'approach';
      if (!this.quiet) sfx.start();
    }
  }

  // Sind alle Buchten sichtbar belegt (geparkt oder angesteuert), darf kein
  // weiterer LKW losfahren – auch wenn die Logik schon weiter ist.
  canDispatch() {
    let busy = 0;
    for (const o of this.tvs) {
      if (o.bay === undefined || o.bay < 0) continue;
      if ((o.state === 'drive' && o.phase !== 'leave') || o.state === 'crane' || o.state === 'dock') busy++;
    }
    return busy < this.L.bays.length;
  }

  // Logische Rampe ≠ sichtbare Bucht: Der LKW nimmt eine Bucht, die gerade frei
  // ist oder deren LKW schon fertig beladen ist (und die noch kein anderer
  // ansteuert). Laut Spiellogik reicht das immer.
  chooseBay(tv) {
    const n = this.L.bays.length;
    let best = -1;
    let bestScore = Infinity;
    for (let b = 0; b < n; b++) {
      let score = 0;
      for (const o of this.tvs) {
        if (o === tv || o.bay !== b) continue;
        if (o.state === 'drive' && o.phase !== 'leave') score += 100; // schon reserviert
        else if (o.state === 'crane') score += 100;
        else if (o.state === 'dock') score += o.pendingDepart || o.fullAt ? 2 : 100;
        else if (o.state === 'leave' && this.bayOcc[b] === o) score += 1;
      }
      score += b * 0.01;
      if (score < bestScore) { bestScore = score; best = b; }
    }
    return best;
  }

  // Weg vom Stau über die Ringstraße bis vor die Bucht.
  planApproach(tv, r) {
    const L = this.L;
    const ux = Math.cos(tv.a);
    const uy = Math.sin(tv.a);
    // Schnittpunkt des Fahrstrahls mit der Ring-Mittellinie
    let best = Infinity;
    let edge = 0;
    const tryT = (t, e) => { if (t > 0 && t < best) { best = t; edge = e; } };
    const top = L.rT, bot = L.rB;
    if (uy < -1e-6) tryT((top - tv.y) / uy, 0); // oben
    if (ux > 1e-6) tryT((L.x2 - tv.x) / ux, 1); // rechts
    if (uy > 1e-6) tryT((bot - tv.y) / uy, 2); // unten
    if (ux < -1e-6) tryT((L.x1 - tv.x) / ux, 3); // links
    const E = { x: clamp(tv.x + ux * best, L.x1, L.x2), y: clamp(tv.y + uy * best, top, bot) };
    const bx = L.bays[r];
    // Hochformat: Rampenstraße = Oberseite des Rings, Fahrt nach rechts.
    // Querformat: Rampenstraße = Unterseite des Rings, Fahrt nach links.
    const A = L.land ? { x: bx - REV_R - 6, y: L.RY } : { x: bx + REV_R + 6, y: L.RY };
    const goal = L.land ? 2 : 0;
    const direct = L.land ? edge === 2 : edge === 0 && E.x < A.x - 24;
    const pts = [{ x: tv.x, y: tv.y }, E];
    const corner = [{ x: L.x2, y: top }, { x: L.x2, y: bot }, { x: L.x1, y: bot }, { x: L.x1, y: top }];
    // Im Uhrzeigersinn Seite um Seite weiter, bis wir auf der Rampenstraße sind
    let e = edge;
    if (!direct) {
      for (let k = 0; k < 4; k++) {
        pts.push(corner[e]);
        e = (e + 1) % 4;
        if (e === goal) break;
      }
    }
    pts.push(A);
    // Zusätzliche Punkte entfernen, die zu nah beieinander liegen
    const clean = [pts[0]];
    for (const p of pts.slice(1)) {
      const q = clean[clean.length - 1];
      if (Math.hypot(p.x - q.x, p.y - q.y) > 2) clean.push(p);
    }
    tv.path = makePath(clean, CORNER);
    tv.sJoin = Math.hypot(E.x - tv.x, E.y - tv.y);
    // Haltepunkt, falls die Bucht noch belegt ist: nie auf der Rampenstraße
    // (dort fahren die abfahrenden LKWs), sondern vor der Kurve links unten
    // bzw. noch im Hof, bevor er auf die Straße fährt.
    const len = vehicleLength(tv.size, L.cd);
    if (direct) tv.sHold = Math.max(0, tv.sJoin - ROAD_W / 2 - len / 2 - 8);
    else {
      // ungefähr die letzte Ecke vor der Rampenstraße (hoch: oben links, quer: unten rechts)
      const sTop = tv.path.length - (L.land ? L.x2 - A.x : A.x - L.x1);
      tv.sHold = Math.max(Math.min(tv.sJoin, sTop), sTop - CORNER - len / 2 - 10);
    }
    tv.cell0 = tv.cell || L.cl;
  }
  planReverse(tv, r) {
    const L = this.L;
    const bx = L.bays[r];
    const len = vehicleLength(tv.size, L.cd);
    const F = { x: bx, y: L.bayTop + len / 2 + 3 };
    tv.path = makePath([{ x: bx + (L.land ? -1 : 1) * (REV_R + 6), y: L.RY }, { x: bx, y: L.RY }, F], REV_R);
    tv.s = 0;
    tv.v = 0;
    tv.phase = 'reverse';
  }
  planLeave(tv) {
    const L = this.L;
    const bx = L.bays[tv.bay];
    const end = L.land ? [{ x: L.vx0 - 120, y: L.RY }] : [{ x: L.x2, y: L.RY }, { x: Math.max(FW, L.vx1) + 120, y: L.RY }];
    tv.path = makePath([{ x: tv.x, y: tv.y }, { x: bx, y: L.RY }, ...end], REV_R);
    tv.s = 0;
    tv.v = 0;
    tv.phase = 'leave';
    tv.state = 'leave';
    tv.order = ++this.order;
    tv.leaveFree = vehicleLength(tv.size, L.cd) * 0.5 + (L.RY - tv.y) + 8;
  }

  startCrane(tv, r, now) {
    const L = this.L;
    const len = vehicleLength(tv.size, L.cd);
    tv.state = 'crane';
    tv.crane = { t0: now, from: { x: tv.x, y: tv.y, a: tv.a, cell: tv.cell }, to: { x: L.bays[r], y: L.bayTop + len / 2 + 3, a: Math.PI / 2, cell: L.cd }, r, dur: 2100 };
    this.cranes.push(tv);
    if (!this.quiet) sfx.start();
  }

  evSpawn(ev, now) {
    const tv = this.tvs[ev.id];
    const g = this.game || this.demo;
    const gate = g.gates[ev.gate];
    const from = this.gridToScreen(gate.x + 0.5, gate.y + 0.5);
    this.placeLot(tv);
    tv.spawn = { t0: now, from, to: { x: tv.x, y: tv.y } };
    tv.state = 'spawn';
    tv.x = from.x;
    tv.y = from.y;
    this.lotDirty = true;
  }

  evRotate(ev, now) {
    const tv = this.tvs[ev.id];
    const t = tv.t;
    const [dx, dy] = DIRS[t.dir];
    const px = t.x - dx * (t.len - 1) + 0.5;
    const py = t.y - dy * (t.len - 1) + 0.5;
    const pivot = this.gridToScreen(px, py);
    const a0 = DIR_ANGLE[ev.from] + this.L.ang;
    const a1 = a0 + (Math.PI / 2) * ev.steps;
    tv.rot = { t0: now, pivot, a0, a1, r: ((t.len - 1) / 2) * this.L.cl };
    tv.state = 'rotate';
    this.lotDirty = true;
  }

  evForkload(ev, now) {
    const tv = this.tvs[ev.id];
    for (const b of ev.blocks || []) {
      for (let k = 0; k < COLS; k++) {
        const q = b * COLS + k;
        const p = this.pp.get(q);
        if (p && k === 0) this.fx.push({ type: 'puff', x: p.x, y: p.y, t0: now, s: 10 });
        this.vGone.add(q);
        this.pp.delete(q);
      }
    }
    tv.pending += ev.count;
    this.forklifts.push({ t0: now, tv, ev, done: 0 });
    if (!this.quiet) sfx.start();
  }

  // ---------- Eingabe ----------
  toVirtual(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - this.offX) / this.scale, y: (e.clientY - r.top) / this.scale };
  }
  onPointer(e) {
    if (!this.game) return;
    const { x, y } = this.toVirtual(e);
    const L = this.L;
    if (this.select === 'dock' || (y > L.D - 10 && y < L.bayTop + L.bayH)) {
      if (y > L.D - 14 && y < L.bayTop + L.bayH + 8) {
        for (let r = 0; r < L.bays.length; r++) {
          if (Math.abs(x - L.bays[r]) < L.bayW / 2) {
            const tv = this.tvs.find((v) => v.state === 'dock' && v.bay === r && !v.pendingDepart && !v.fullAt);
            if (tv) this.hooks.onDockTap?.(tv.ramp);
            return;
          }
        }
      }
      if (this.select === 'dock') return;
    }
    // LKW im Stau: Umriss (etwas vergrößert) treffen, sonst nächstgelegener
    let best = -1;
    let bestD = Infinity;
    for (const tv of this.tvs) {
      if (tv.state !== 'lot') continue;
      const c = Math.cos(tv.a);
      const s = Math.sin(tv.a);
      const dx = x - tv.x;
      const dy = y - tv.y;
      const u = dx * c + dy * s;
      const v = -dx * s + dy * c;
      const hl = vehicleLength(tv.size, tv.cell) / 2 + 3;
      const hw = vehicleWidth(tv.cell) / 2 + 4;
      if (Math.abs(u) <= hl && Math.abs(v) <= hw) {
        const d = Math.abs(v) / hw + Math.abs(u) / hl * 0.5;
        if (d < bestD) { bestD = d; best = tv.id; }
      }
    }
    if (best >= 0) this.hooks.onTap?.(best);
  }

  nudge(id, blocker) {
    const now = performance.now();
    const tv = this.tvs[id];
    if (tv) tv.nudge = now;
    this.shake(now, 3);
    if (blocker >= 0 && this.tvs[blocker]) this.tvs[blocker].flash = now;
    if (blocker === -1) this.rampFlash = now;
  }

  warnAnchor() {
    const L = this.L;
    return [this.offX + (FW / 2) * this.scale, (L.bayTop + L.bayH * 0.5) * this.scale];
  }

  // ---------- Bewegung ----------
  bodyOf(tv, x = tv.x, y = tv.y, a = tv.a) {
    const cell = tv.cell || this.L.cd;
    return corners(x, y, a, vehicleLength(tv.size, cell) + 2, vehicleWidth(cell) + 2);
  }

  updateTraffic(dt, now) {
    const L = this.L;
    const movers = this.tvs.filter((v) => v.state === 'drive' || v.state === 'leave');
    const others = this.tvs.filter((v) => v.state === 'drive' || v.state === 'leave' || v.state === 'dock' || v.state === 'crane');
    // Bucht reservieren, sobald sie frei ist; sonst am Haltepunkt davor warten
    // Pro Bucht bekommt der älteste wartende LKW den Vortritt.
    const first = new Map();
    for (const tv of movers) {
      if (tv.phase !== 'approach') continue;
      const f = first.get(tv.bay);
      if (!f || tv.order < f.order) first.set(tv.bay, tv);
    }
    for (const tv of movers) {
      tv.limit = tv.path.length;
      if (tv.phase !== 'approach') continue;
      const occ = this.bayOcc[tv.bay];
      if (first.get(tv.bay) === tv && (!occ || occ === tv || occ.state === 'gone')) this.bayOcc[tv.bay] = tv;
      if (this.bayOcc[tv.bay] !== tv) tv.limit = Math.max(0, Math.min(tv.path.length, tv.sHold));
    }
    // 1. Wer würde wen berühren?
    const blockedBy = new Map();
    for (const tv of movers) {
      const list = [];
      if (tv.ghost > tv.s) { blockedBy.set(tv, list); continue; }
      const look = 8 + tv.v * 50;
      const p = tv.path.at(tv.s + look);
      const ahead = this.bodyOf(tv, p.x, p.y, tv.phase === 'reverse' ? p.a + Math.PI : p.a);
      for (const o of others) {
        if (o === tv) continue;
        if (overlap(ahead, this.bodyOf(o))) list.push(o);
      }
      blockedBy.set(tv, list);
    }
    // 2. Warten, wenn ein älterer im Weg ist, oder ein jüngerer, der nicht auf mich wartet.
    //    Steht einer zu lange (seltene Verklemmung), darf er sich vorsichtig durchschieben.
    // Ist das Warten „berechtigt“? Ja, wenn die Kette der Vordermänner bei einem
    // fahrenden LKW endet oder bei einem älteren, der vor seiner Bucht wartet.
    // Nur bei einer echten Verklemmung (Kreis, oder ein Jüngerer blockiert einen
    // Älteren, dessen Paletten zuerst dran sind) darf sich einer vorbeischieben.
    const holding = (o) => o.phase === 'approach' && o.limit < o.path.length && o.s >= o.limit - 1;
    const legit = (tv, seen = new Set()) => {
      if (seen.has(tv)) return false;
      seen.add(tv);
      for (const o of blockedBy.get(tv) || []) {
        if (o.state === 'dock' || o.state === 'crane') return true;
        if (!movers.includes(o)) continue;
        if (o.v > 0.02) return true;
        if (holding(o) && o.order < tv.order) return true;
        if (legit(o, seen)) return true;
      }
      return false;
    };
    for (const tv of movers) {
      const list = blockedBy.get(tv);
      let stop = false;
      for (const o of list) {
        if (o.state === 'dock' || o.state === 'crane') { stop = true; break; }
        const oList = blockedBy.get(o) || [];
        if (o.order < tv.order || !oList.includes(tv)) { stop = true; break; }
      }
      if (stop && !legit(tv)) {
        tv.stuck = (tv.stuck || 0) + dt;
        if (tv.stuck > 2200) { stop = false; tv.ghost = tv.s + 70; tv.stuck = 0; }
      } else if (!stop || tv.v > 0.05) tv.stuck = 0;
      const vmax = tv.phase === 'reverse' ? VREV : VMAX;
      const remain = tv.limit - tv.s;
      const brake = Math.sqrt(2 * ACC * Math.max(0, remain)) + (remain > 0.5 ? 0.02 : 0);
      const target = stop ? 0 : Math.min(vmax, tv.phase === 'leave' ? vmax : brake);
      tv.v = tv.v < target ? Math.min(target, tv.v + ACC * dt) : Math.max(target, tv.v - ACC * 3 * dt);
      tv.braking = stop || target < tv.v || remain < 30;
      tv.s = Math.min(tv.limit, tv.s + tv.v * dt);
      const p = tv.path.at(tv.s);
      tv.x = p.x;
      tv.y = p.y;
      const a = tv.phase === 'reverse' ? p.a + Math.PI : p.a;
      tv.a = lerpAngle(tv.a, a, Math.min(1, dt * 0.025));
      if (tv.phase === 'approach') {
        tv.cell = lerp(tv.cell0, L.cd, clamp(tv.s / Math.max(1, tv.sJoin), 0, 1));
        const ahead = tv.path.at(tv.s + 25);
        const turn = lerpAngle(0, ahead.a - p.a, 1);
        tv.indicator = Math.abs(turn) > 0.3 ? Math.sign(turn) : 0;
      } else tv.indicator = false;
      if (tv.s >= tv.path.length - 0.01) this.arrive(tv, now);
      if (tv.phase === 'leave' && tv.s > tv.leaveFree && this.bayOcc[tv.bay] === tv) {
        this.bayOcc[tv.bay] = null;
        this.hooks.onRampsChanged?.();
      }
    }
  }

  arrive(tv, now) {
    if (tv.phase === 'approach') {
      this.planReverse(tv, tv.bay);
    } else if (tv.phase === 'reverse') {
      this.dock(tv, now);
    } else if (tv.phase === 'leave') {
      tv.state = 'gone';
    }
  }

  dock(tv, now) {
    tv.state = 'dock';
    tv.v = 0;
    tv.a = Math.PI / 2;
    tv.cell = this.L.cd;
    tv.dockAt = now;
    tv.squash = now;
    tv.dockX = tv.x;
    if (!this.quiet) vibrate(10);
  }

  updateCranes(now) {
    for (const tv of this.cranes.slice()) {
      const c = tv.crane;
      const k = clamp((now - c.t0) / c.dur, 0, 1);
      // 0–0.2 Haken senkt sich, 0.2–0.8 Flug, 0.8–1 absetzen
      const m = ease(clamp((k - 0.2) / 0.6, 0, 1));
      tv.x = lerp(c.from.x, c.to.x, m);
      tv.y = lerp(c.from.y, c.to.y, m);
      tv.a = lerpAngle(c.from.a, c.to.a, m);
      tv.cell = lerp(c.from.cell, c.to.cell, m);
      tv.lift = k < 0.2 ? k / 0.2 * 0.3 : k < 0.8 ? 0.3 + Math.sin(m * Math.PI) * 0.7 : (1 - k) / 0.2 * 0.3;
      c.k = k;
      if (k >= 1) {
        this.cranes.splice(this.cranes.indexOf(tv), 1);
        tv.lift = 0;
        tv.bay = c.r;
        this.bayOcc[c.r] = tv;
        this.dock(tv, now);
        if (!this.quiet) vibrate(20);
      }
    }
  }

  // Paletten: in Reihenfolge, nur zu geparkten LKWs
  updateLoads(now) {
    const L = this.L;
    while (this.loads.length && now >= this.nextLoadAt) {
      const ev = this.loads[0];
      const tv = this.tvs[ev.id];
      if (tv.state !== 'dock' || now - tv.dockAt < 160) break;
      this.loads.shift();
      const st = this.pp.get(ev.q) || { x: L.S.x, y: L.S.y };
      this.vGone.add(ev.q);
      this.pp.delete(ev.q);
      const bx = tv.dockX ?? L.bays[tv.bay];
      const slot = vehicleSlot(tv.size, tv.cell, ev.comp, ev.n);
      const sl = this._slotOf.get(Math.floor(ev.q / COLS)) || 'C';
      const sc = this.slotPos(sl, 1.5);
      const pts = [{ x: st.x, y: st.y }];
      if (Math.hypot(st.x - sc.x, st.y - sc.y) > 3) pts.push({ x: sc.x, y: sc.y });
      const cp = this.chutePts(sl);
      pts.push(...cp, { x: bx, y: L.D }, { x: bx, y: L.bayTop + 4 });
      const path = makePath(pts, 10);
      this.flights.push({ t0: now, slide: 120 + path.length * 1.0, hop: 260, path, tv, ev, slot, code: ev.code });
      this.nextLoadAt = now + LOAD_EVERY;
    }
    for (const f of this.flights.slice()) {
      const k = (now - f.t0) / (f.slide + f.hop);
      if (k < 1) continue;
      this.flights.splice(this.flights.indexOf(f), 1);
      const tv = f.tv;
      tv.vis[f.ev.comp] = Math.max(tv.vis[f.ev.comp], f.ev.n);
      tv.pending--;
      tv.squash = now;
      const w = this.slotWorld(tv, f.slot);
      this.fx.push({ type: 'puff', x: w.x, y: w.y, t0: now, s: 8 });
      if (!this.quiet) sfx.pallet(f.ev.n / tv.t.comps[f.ev.comp].cap);
    }
    // Abfahrt, wenn alles geladen ist
    for (const tv of this.tvs) {
      if (!tv.pendingDepart || tv.pending > 0 || tv.state !== 'dock') continue;
      if (!tv.fullAt) {
        tv.fullAt = now;
        this.fx.push({ type: 'check', x: tv.x, y: tv.y, t0: now });
        // Combo: mehrere volle LKWs kurz hintereinander
        this.combo = now - this.lastFull < 2600 ? this.combo + 1 : 1;
        this.lastFull = now;
        this.burst(tv.x, tv.y - 6, 14, now, tv.t.comps.map((c) => COLORS[c.color].hex));
        if (this.combo >= 2) {
          const words = String(tr('praise')).split('|');
          const word = words[Math.min(words.length - 1, this.combo - 2)];
          this.fx.push({ type: 'text', x: tv.x, y: tv.y - 18, t0: now, dur: 1300, text: word, sub: `${tr('combo')} x${this.combo}` });
          this.shake(now, 2.2);
          if (!this.quiet && sfx.combo) setTimeout(() => sfx.combo(this.combo), 260);
        }
        if (!this.quiet) { sfx.full(); vibrate(25); }
      }
      if (now - tv.fullAt > 420) {
        tv.pendingDepart = null;
        this.planLeave(tv);
        this.shake(now, 1.2);
        if (!this.quiet) { sfx.horn(); setTimeout(() => sfx.depart(), 120); }
        this.hooks.onDepart?.();
      }
    }
  }

  slotWorld(tv, slot) {
    const c = Math.cos(tv.a);
    const s = Math.sin(tv.a);
    return { x: tv.x + slot.x * c - slot.y * s, y: tv.y + slot.x * s + slot.y * c + (slot.dy || 0) };
  }

  updateMisc(now) {
    for (const tv of this.tvs) {
      if (tv.state === 'spawn') {
        const k = clamp((now - tv.spawn.t0) / 520, 0, 1);
        const e = easeOut(k);
        tv.x = lerp(tv.spawn.from.x, tv.spawn.to.x, e);
        tv.y = lerp(tv.spawn.from.y, tv.spawn.to.y, e);
        tv.alpha = clamp(k * 2, 0, 1);
        if (k >= 1) { tv.state = 'lot'; tv.alpha = 1; this.placeLot(tv); this.lotDirty = true; }
      } else if (tv.state === 'rotate') {
        const k = clamp((now - tv.rot.t0) / 450, 0, 1);
        const a = lerp(tv.rot.a0, tv.rot.a1, ease(k));
        tv.a = a;
        tv.x = tv.rot.pivot.x + Math.cos(a) * tv.rot.r;
        tv.y = tv.rot.pivot.y + Math.sin(a) * tv.rot.r;
        if (k >= 1) { tv.state = 'lot'; this.placeLot(tv); this.lotDirty = true; }
      } else if (tv.state === 'dock') {
        // Rampen verschoben (Extra-Rampe): sanft nachrücken
        const bx = this.L.bays[tv.bay];
        tv.dockX = lerp(tv.dockX ?? bx, bx, 0.15);
        tv.x = tv.dockX;
      }
    }
    // Gabelstapler: fährt über die Rampe zum LKW und lädt in Stapeln
    for (const f of this.forklifts.slice()) {
      const tv = f.tv;
      if (tv.state !== 'dock') { f.t0 = now; continue; }
      const k = now - f.t0;
      const per = Math.max(35, Math.min(120, 1400 / f.ev.count));
      const tLoad = 700;
      const n = clamp(Math.floor((k - tLoad) / per) + 1, 0, f.ev.count);
      while (f.done < n) {
        f.done++;
        const idx = f.ev.n - f.ev.count + f.done;
        tv.vis[f.ev.comp] = Math.max(tv.vis[f.ev.comp], idx);
        tv.pending--;
        tv.squash = now;
        if (!this.quiet && f.done % 3 === 1) sfx.pallet(idx / tv.t.comps[f.ev.comp].cap);
      }
      if (f.done >= f.ev.count && k > tLoad + per * f.ev.count + 700) this.forklifts.splice(this.forklifts.indexOf(f), 1);
    }
    for (const f of this.fx.slice()) if (now - f.t0 > (f.dur || 900)) this.fx.splice(this.fx.indexOf(f), 1);
    for (const tm of this.timers.slice()) {
      if (now >= tm.at) {
        this.timers.splice(this.timers.indexOf(tm), 1);
        tm.fn();
      }
    }
  }

  // ---------- Frame ----------
  frame(now) {
    const dt = Math.min(50, now - this.last);
    this.last = now;
    this.pulse = now;
    if (this.demo) this.demoTick(now);
    if (this.game || this.demo) {
      this.updateTraffic(dt, now);
      this.updateCranes(now);
      this.updateLoads(now);
      this.updateMisc(now);
      this.frameDt = dt;
      this.beltPhase += dt * (this.qMoving ? 0.09 : 0.012);
      this.dockPhase += dt * (this.flights.length ? 0.12 : 0.0);
    }
    if (this.idleCbs.length && this.isIdle()) {
      const cbs = this.idleCbs;
      this.idleCbs = [];
      for (const fn of cbs) fn();
    }
    this.draw(now);
  }

  // ---------- Zeichnen ----------
  draw(now) {
    const ctx = this.ctx;
    const d = this.dpr;
    // Bildschirmwackeln (klingt schnell ab)
    const sk = this.shakeA * Math.max(0, 1 - (now - this.shakeT) / 380);
    const shx = sk ? Math.sin(now * 0.09) * sk * d : 0, shy = sk ? Math.cos(now * 0.11) * sk * 0.6 * d : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (shx || shy) { ctx.fillStyle = '#c9cde0'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    if (this.sceneDirty || !this.sceneCanvas) this.renderScene();
    ctx.drawImage(this.sceneCanvas, shx, shy);
    ctx.setTransform(d * this.scale, 0, 0, d * this.scale, d * this.offX + shx, shy);
    const g = this.game || this.demo;
    this.drawBelts(ctx, now);
    this.drawClouds(ctx, now);
    if (!g) return;
    this.drawLotObjects(ctx, now);
    this.drawLotTrucks(ctx, now);
    this.drawQueue(ctx, now, g);
    this.drawBayOverlays(ctx, now);
    // Fahrende und geparkte LKWs
    const vis = this.tvs.filter((v) => v.state === 'drive' || v.state === 'leave' || v.state === 'dock' || v.state === 'spawn' || v.state === 'rotate');
    vis.sort((a, b) => a.y - b.y);
    for (const tv of vis) this.drawTv(ctx, tv, now);
    this.drawFlights(ctx, now);
    this.drawForklifts(ctx, now);
    for (const tv of this.cranes) this.drawTv(ctx, tv, now);
    this.drawCranes(ctx, now);
    this.drawDockPills(ctx, now);
    this.drawFx(ctx, now);
    this.drawGuide(ctx, now);
  }

  // Tutorial-Hand: tippt animiert auf den empfohlenen LKW (guideId)
  drawGuide(ctx, now) {
    if (this.guideId == null) return;
    const tv = this.tvs.find((v) => v.id === this.guideId);
    if (!tv || tv.state !== 'lot') return;
    const t = (now % 1300) / 1300;
    const press = t < 0.35 ? t / 0.35 : t < 0.5 ? 1 - (t - 0.35) / 0.15 : 0;
    const x = tv.x, y = tv.y;
    ctx.save();
    // Tipp-Ring
    if (t > 0.3 && t < 0.9) {
      const k = (t - 0.3) / 0.6;
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(x, y, 6 + k * 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Hand (Zeigefinger zeigt nach oben links auf den LKW)
    const hx = x + 8 - press * 5, hy = y + 10 - press * 5, sc = 1.35 - press * 0.1;
    ctx.translate(hx, hy);
    ctx.rotate(-0.45);
    ctx.scale(sc, sc);
    ctx.shadowColor = 'rgba(10,30,80,0.35)';
    ctx.shadowBlur = 6; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 3;
    const rr = (x0, y0, w, h, r) => { ctx.beginPath(); ctx.roundRect(x0, y0, w, h, r); };
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1b2b55';
    ctx.lineWidth = 2;
    // Zeigefinger
    rr(-4, -2, 8, 22, 4); ctx.fill();
    // Handfläche mit eingeklappten Fingern
    rr(-6, 14, 21, 20, 7); ctx.fill();
    ctx.shadowColor = 'transparent';
    rr(-4, -2, 8, 22, 4); ctx.stroke();
    rr(-6, 14, 21, 20, 7); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-2.5, 13, 5, 4);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(4, 19); ctx.lineTo(4, 24);
    ctx.moveTo(9, 19); ctx.lineTo(9, 24);
    ctx.stroke();
    // Daumen
    ctx.lineWidth = 2;
    rr(-11, 20, 9, 7, 3.5); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // Wolkenschatten: wenige große, weiche Flecken ziehen langsam über die Szene
  // (ein vorgerendertes Sprite, pro Frame nur drei drawImage-Aufrufe).
  drawClouds(ctx, now) {
    if (!this._cloud) {
      const W = 192, H = 120, cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const x = cv.getContext('2d');
      for (const [bx, by, r] of [[62, 64, 44], [104, 52, 52], [146, 68, 38], [96, 80, 40]]) {
        const gr = x.createRadialGradient(bx, by, 0, bx, by, r);
        gr.addColorStop(0, 'rgba(30,40,100,0.55)');
        gr.addColorStop(0.55, 'rgba(30,40,100,0.35)');
        gr.addColorStop(1, 'rgba(30,40,100,0)');
        x.fillStyle = gr;
        x.fillRect(0, 0, W, H);
      }
      this._cloud = cv;
    }
    const ex = this.offX / this.scale;
    const x0 = -ex - 260, span = this.VW + 2 * ex + 260;
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = 0.19;
    const t = now * 0.0075; // ~7 px/s
    const C = [[0, 0.22, 1.25], [0.45, 0.58, 1.05], [0.78, 0.9, 1.4]];
    for (const [ph, fy, sc] of C) {
      const x = x0 + ((t + ph * span) % span);
      const y = fy * this.VH - 60 * sc;
      ctx.drawImage(this._cloud, x, y, 192 * sc * 1.2, 120 * sc);
    }
    ctx.globalAlpha = ga;
  }

  // Fortschritts-Pille unter jedem angedockten LKW: „12/24“ mit Füllbalken in LKW-Farbe.
  drawDockPills(ctx, now) {
    const L = this.L;
    for (const tv of this.tvs) {
      if (tv.state !== 'dock' && !(tv.state === 'leave' && tv.s < 30)) continue;
      const comps = tv.t.comps;
      let n = 0;
      let cap = 0;
      for (let i = 0; i < comps.length; i++) { n += tv.vis[i] || 0; cap += comps[i].cap; }
      const full = n >= cap;
      const len = vehicleLength(tv.size, tv.cell || L.cd);
      const x = tv.x;
      const y = Math.min(tv.y + len / 2 + 9, L.bayTop + L.bayH + 3);
      const pop = clamp(1 - (now - tv.squash) / 240, 0, 1);
      const sc = 1 + 0.16 * Math.sin(pop * Math.PI) + (tv.state === 'leave' ? -clamp(tv.s / 30, 0, 1) : 0);
      if (sc <= 0.05) continue;
      const text = full ? '✓' : `${n}/${cap}`;
      const w = full ? 22 : 36;
      const h = 14;
      const hex = full ? '#22c55e' : COLORS[comps[0].color].hex;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sc, sc);
      // Schatten, Rahmen, Hintergrund
      ctx.fillStyle = 'rgba(20,24,60,0.28)';
      ctx.beginPath(); P.roundRectPath(ctx, -w / 2 + 1, -h / 2 + 2, w, h, h / 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); P.roundRectPath(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fill();
      ctx.fillStyle = '#26304f';
      ctx.beginPath(); P.roundRectPath(ctx, -w / 2 + 1.5, -h / 2 + 1.5, w - 3, h - 3, h / 2 - 1.5); ctx.fill();
      // Füllstand
      const fw = (w - 3) * (cap ? n / cap : 0);
      if (fw > 0.5) {
        ctx.save();
        ctx.beginPath(); P.roundRectPath(ctx, -w / 2 + 1.5, -h / 2 + 1.5, w - 3, h - 3, h / 2 - 1.5); ctx.clip();
        ctx.fillStyle = hex;
        ctx.fillRect(-w / 2 + 1.5, -h / 2 + 1.5, fw, h - 3);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(-w / 2 + 1.5, -h / 2 + 1.5, fw, (h - 3) * 0.4);
        ctx.restore();
      }
      ctx.font = '900 9.5px system-ui, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = 'rgba(15,20,45,0.85)';
      ctx.strokeText(text, 0, 0.6);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, 0, 0.6);
      ctx.restore();
    }
  }

  // Statischer Hintergrund (einmal pro Layout)
  renderScene() {
    const L = this.L;
    const c = this.sceneCanvas || document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const ctx = c.getContext('2d');
    const d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    // Rasen über die ganze Fläche (auch Ränder)
    P.drawGrass(ctx, 0, 0, this.cw, this.ch, 7);
    ctx.setTransform(d * this.scale, 0, 0, d * this.scale, d * this.offX, 0);
    const vx0 = -this.offX / this.scale;
    const vw = this.cw / this.scale;
    // Platz vor den Rampen: Beton
    const fw = L.land ? L.x1 - vx0 : vw; // Breite des Fabrikbereichs
    P.drawConcrete(ctx, vx0, L.hall.y + L.hall.h - 4, fw, L.RY - (L.hall.y + L.hall.h) + 4, 3, { slab: 48 });
    // Innenfläche des Rings: heller Beton, Stau-Fläche dezent markiert
    const r = L.ring;
    P.drawConcrete(ctx, r.x + ROAD_W / 2, r.y + ROAD_W / 2, r.w - ROAD_W, r.h - ROAD_W, 11, { slab: 60, joints: false });
    this.drawLotShape(ctx);
    // Ringstraße
    if (L.land) {
      // Ring um 180° gedreht zeichnen: die Ausfahrt liegt dann unten links
      // und führt als Rampenstraße unter den Buchten nach links hinaus.
      const rcx = r.x + r.w / 2, rcy = r.y + r.h / 2;
      ctx.save();
      ctx.translate(rcx, rcy);
      ctx.rotate(Math.PI);
      ctx.translate(-rcx, -rcy);
      P.drawRingRoad(ctx, L.ring, ROAD_W, CORNER, { exitRight: true, exitLen: L.x1 - vx0 + 30, seed: 5 });
      ctx.restore();
    } else {
      P.drawRingRoad(ctx, L.ring, ROAD_W, CORNER, { exitRight: true, exitLen: Math.max(200, L.vx1 - FW + 40), seed: 5 });
    }
    // Halle
    // Dach liegt unter der HUD-Leiste, die Wand mit den Toren beginnt genau an
    // der HUD-Unterkante und ist damit vollständig sichtbar.
    const hy = Math.min(L.hall.y, 0);
    const capH = 6;
    const wallTop = Math.max(hy + 20, L.T - 3);
    P.drawHallFacade(ctx, vx0, hy, L.land ? L.x1 - ROAD_W / 2 - 8 - vx0 : vw, L.hall.y + L.hall.h - hy, {
      gates: [{ cx: L.ell.cx - L.ell.rx, w: BELT_W + 4 }, { cx: L.ell.cx + L.ell.rx, w: BELT_W + 4 }], sign: 'PALLET RUSH', signX: FW / 2,
      roofH: wallTop - capH - hy, capH,
    });
    // Deko neben dem Förderband (nach der Halle: Baumkronen dürfen vor der Wand stehen)
    this.drawDecor(ctx);
    // Förderband: statischer Teil
    for (const p of this.beltPaths()) P.drawConveyor(ctx, p, BELT_W, 0, { layer: 'base', color: '#ff8a00' });
    // Rampenwand und Buchten
    P.drawDockWall(ctx, 14, L.wallY, FW - 28, 10, { bumpersAt: L.bays.flatMap((x) => [x - 16, x + 16]) });
    L.bays.forEach((x, i) => P.drawDockBay(ctx, x, L.bayTop, L.slotW, L.bayH, { index: i, extra: i >= 4, floor: true }));
    // Rutschen von der Rollenbahn in jede Bucht
    for (const x of L.bays) P.drawChute(ctx, x, L.D, L.bayTop + 10, CHUTE_W - 2);
    // Rollenbahn: statischer Rahmen (Rollen laufen pro Frame)
    P.drawDockConveyor(ctx, 22, FW - 22, L.D, 14, 0, { layer: 'base' });
    // Einheitlich knallige Farben: Szene einmalig kräftiger und klarer machen
    if ('filter' in ctx) {
      const tmp = document.createElement('canvas');
      tmp.width = c.width; tmp.height = c.height;
      tmp.getContext('2d').drawImage(c, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.filter = 'saturate(1.25) contrast(1.04)';
      ctx.drawImage(tmp, 0, 0);
      ctx.filter = 'none';
    }
    this.sceneCanvas = c;
    this.sceneDirty = false;
  }

  beltPaths() {
    if (this._beltKey === this.L && this._belts) return this._belts;
    const { cx, cy, rx, ry } = this.L.ell;
    const L = this.L;
    const mk = (pts) => P.conveyorPath(pts);
    const paths = [
      // gerade Zulieferbänder aus den Toren
      mk([{ x: cx - rx, y: L.gateY - 8 }, { x: cx - rx, y: cy }]),
      mk([{ x: cx + rx, y: L.gateY - 8 }, { x: cx + rx, y: cy }]),
      // breites U-Band unten (zur Station)
      mk(P.arcPoints(cx, cy, rx, ry, Math.PI, Math.PI / 2, 28)),
      mk(P.arcPoints(cx, cy, rx, ry, 0, Math.PI / 2, 28)),
    ];
    this._beltKey = this.L;
    this._belts = paths;
    return paths;
  }

  drawLotShape(ctx) {
    const g = this.game || this.demo;
    if (!g) return;
    const L = this.L;
    const cells = new Set();
    for (const t of g.trucks) for (const [x, y] of g.cells(t)) cells.add(x + ',' + y);
    for (const gt of g.gates) cells.add(gt.x + ',' + gt.y);
    for (const b of g.barriers) for (const [x, y] of b.cells) cells.add(x + ',' + y);
    if (!cells.size || !L.cl) return;
    // Parkfläche: ruhiges Rechteck um alle belegbaren Felder (keine Level-Silhouette,
    // die nach dem Abfahren als Fleck stehen bliebe), mit aufgemalten Parkfeld-Kreuzen.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of cells) {
      const i = k.indexOf(',');
      const x = +k.slice(0, i), y = +k.slice(i + 1);
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x + 1 > x1) x1 = x + 1; if (y + 1 > y1) y1 = y + 1;
    }
    const c = L.cl, px = 1 / c; // px = ein virtueller Pixel in Feld-Einheiten
    const m = 0.32;
    ctx.save();
    ctx.translate(L.lotC.x, L.lotC.y);
    ctx.rotate(L.ang || 0);
    ctx.scale(c, c);
    ctx.translate(-g.w / 2, -g.h / 2);
    const bx = x0 - m, by = y0 - m, bw = x1 - x0 + 2 * m, bh = y1 - y0 + 2 * m, br = 0.45;
    const path = () => { ctx.beginPath(); P.roundRectPath(ctx, bx, by, bw, bh, br); };
    // leicht vertiefte, etwas dunklere Fläche
    path();
    ctx.fillStyle = 'rgba(70,78,130,0.07)';
    ctx.fill();
    ctx.save();
    path();
    ctx.clip();
    ctx.lineWidth = 7 * px;
    ctx.strokeStyle = 'rgba(50,56,110,0.07)';
    ctx.beginPath(); P.roundRectPath(ctx, bx - 3 * px, by - 3 * px, bw + 6 * px, bh + 6 * px, br); ctx.stroke();
    ctx.restore();
    // weiße Randlinie mit heller Unterkante (Licht oben links)
    ctx.lineWidth = 1.6 * px;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    path(); ctx.stroke();
    // Parkfeld-Kreuze an den Rasterpunkten
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.3 * px;
    ctx.lineCap = 'round';
    const a = 0.13;
    ctx.beginPath();
    for (let y = y0 + 1; y < y1; y++) {
      for (let x = x0 + 1; x < x1; x++) {
        ctx.moveTo(x, y - a); ctx.lineTo(x, y + a);
        ctx.moveTo(x - a, y); ctx.lineTo(x + a, y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  drawDecor(ctx) {
    const L = this.L;
    const { cx, cy, rx, ry } = L.ell;
    const hb = L.hall.y + L.hall.h;
    const bottom = L.D - 12;
    const ex = this.offX / this.scale; // sichtbarer Rand links/rechts außerhalb von 0..FW
    // Seitenflächen links und rechts der Zulieferbänder: Rasen mit Bordstein,
    // großer Baum, Laterne; darunter Arbeitsbereich mit Paletten bzw. Kübeln.
    const side = (x0, x1, left) => {
      if (x1 - x0 < 40) return;
      const lh = Math.min(100, bottom - hb - 58);
      const ly = hb + 7;
      // Breite Bildschirme: Rasen bleibt kompakt am Band, außen ein zusätzlicher Baum
      const extra = x1 - x0 - 92;
      if (extra > 0) {
        if (extra > 40) P.drawTree(ctx, left ? x0 + extra / 2 : x1 - extra / 2, ly + lh * 0.75, 20, left ? 5 : 1);
        if (left) x0 = x1 - 92; else x1 = x0 + 92;
      }
      const w = x1 - x0;
      P.drawLawn(ctx, x0, ly, w, lh, 12);
      if (left) {
        P.drawBush(ctx, x0 + w * 0.8, ly + lh - 14, 8, 3);
        P.drawTree(ctx, x0 + w * 0.42, ly + lh * 0.66, 24, 0);
        P.drawLamp(ctx, x0 + 9, ly + lh - 8, 11);
        // Arbeitsbereich: Palettenstapel und geparkter Stapler
        P.drawPalletStack(ctx, x0 + 12, bottom - 10, 15, 4);
        P.drawPalletStack(ctx, x0 + 30, bottom - 6, 15, 2);
        P.drawForklift(ctx, x0 + w - 14, bottom - 26, -Math.PI / 2 - 0.25, 24, { forkLift: 0 });
      } else {
        P.drawFlowerBed(ctx, x0 + 8, ly + lh - 22, w * 0.42, 13, 5);
        P.drawTree(ctx, x0 + w * 0.56, ly + lh * 0.62, 22, 2);
        P.drawBush(ctx, x0 + w - 12, ly + 18, 7, 8);
        P.drawLamp(ctx, x0 + w - 16, ly + lh - 8, 11);
        P.drawPlanter(ctx, x0 + 14, bottom - 22, 7, 2);
        P.drawPlanter(ctx, x0 + 34, bottom - 12, 7, 6);
        P.drawCone(ctx, x0 + w - 18, bottom - 18, 9);
        P.drawCone(ctx, x0 + w - 8, bottom - 8, 9);
      }
    };
    side(-ex + 3, cx - rx - BELT_W / 2 - 4, true);
    side(cx + rx + BELT_W / 2 + 4, L.land ? L.x1 - ROAD_W / 2 - 8 : FW + ex - 3, false);
    // Inneres des Rundbands: Grüninsel mit Baum
    const ix0 = cx - rx + BELT_W / 2 + 5, ix1 = cx + rx - BELT_W / 2 - 5;
    const iy0 = hb + 7, iy1 = cy + ry - BELT_W / 2 - 8;
    if (ix1 - ix0 > 40 && iy1 - iy0 > 30) {
      P.drawLawn(ctx, ix0, iy0, ix1 - ix0, iy1 - iy0, Math.min(26, (iy1 - iy0) / 2));
      P.drawBush(ctx, ix0 + 16, iy0 + 18, 8, 11);
      P.drawBush(ctx, ix1 - 15, iy0 + 22, 7, 2);
      P.drawTree(ctx, cx + 2, iy1 - 10, 20, 4);
    }
  }

  drawBelts(ctx, now) {
    const paths = this.beltPaths();
    const ph = this.beltPhase;
    for (const p of paths) P.drawConveyor(ctx, p, BELT_W, ph, { layer: 'belt', color: '#ff8a00' });
    const L = this.L;
    // Rutschen der drei Ausläufe: treten radial durch eine Öffnung in der Bandwand aus
    // und biegen dann senkrecht zur Rollenbahn ab (über dem Band gezeichnet = Öffnung)
    for (const sl of ['L', 'C', 'R']) P.drawChutePath(ctx, this.chutePts(sl), CHUTE_W);
    // Rollenbahn läuft von der Station aus nach außen: links nach links, rechts nach rechts
    P.drawDockConveyor(ctx, 22, L.S.x, L.D, 14, -this.dockPhase, { layer: 'belt' });
    P.drawDockConveyor(ctx, L.S.x, FW - 22, L.D, 14, this.dockPhase, { layer: 'belt' });
  }

  // Lage der drei Ausgabeplätze: L/R = vorderste Reihe der linken/rechten Spur, C = 2×2 an der Station
  slotPos(slot, k) {
    const L = this.L;
    // Alle drei gleich: eine Reihe aus 4 Paletten quer zum Band; Mitte = Bandende unten
    if (slot === 'C') return this.lanePos(0, 0, k);
    return this.lanePos(slot === 'L' ? 0 : 1, this.rowDists(slot === 'L' ? 0 : 1)[0], k);
  }
  // Abstände der Palettenreihen je Spur (vom Bandende gemessen). [0] = seitlicher Auslauf,
  // so nah an der Mitte wie möglich ohne Überschneidung mit dem mittleren Auslauf;
  // danach so dicht wie möglich, aber auch in der engen Kurve ohne Überschneidung.
  rowDists(lane) {
    if (this._rdKey !== this.L) { this._rdKey = this.L; this._rd = []; }
    if (this._rd[lane]) return this._rd[lane];
    const ln = this.L.lanes[lane];
    const row = (d) => { const r = []; for (let k = 0; k < COLS; k++) r.push(this.lanePos(lane, d, k)); return r; };
    const minD = (a, b) => { let m = Infinity; for (const p of a) for (const q of b) m = Math.min(m, Math.hypot(p.x - q.x, p.y - q.y)); return m; };
    const center = row(0);
    let d = 8;
    while (d < 80 && minD(row(d), center) < SLOT_CLEAR) d += 0.5;
    const out = [d];
    let prev = row(d);
    while (d < ln.length - 6) {
      let nd = d + ROW_GAP - 2;
      while (nd < ln.length && minD(row(nd), prev) < PALLET + 1.4) nd += 0.25;
      if (nd >= ln.length - 6) break;
      out.push(nd);
      prev = row(nd);
      d = nd;
    }
    this._rd[lane] = out;
    return out;
  }
  // Weg der Rutsche eines Auslaufs: von innerhalb der Bandwand radial nach außen,
  // dann im Bogen senkrecht hinunter zur Rollenbahn.
  chutePts(sl) {
    if (this._cpKey !== this.L) { this._cpKey = this.L; this._cp = {}; }
    if (this._cp[sl]) return this._cp[sl];
    const L = this.L, { cx, cy } = L.ell;
    const c = this.slotPos(sl, 1.5);
    const R = Math.hypot(c.x - cx, c.y - cy) || 1;
    const ux = (c.x - cx) / R, uy = (c.y - cy) / R;
    const hw = BELT_W / 2;
    const at = (r) => ({ x: cx + ux * r, y: cy + uy * r });
    const p0 = at(R + hw - 7), p1 = at(R + hw + 5);
    const q = { x: p1.x + ux * 11, y: p1.y + uy * 11 };
    const e = { x: q.x, y: q.y + 11 };
    const pts = [p0, p1];
    for (let i = 1; i <= 10; i++) {
      const t = i / 10, m = 1 - t;
      pts.push({ x: m * m * p1.x + 2 * m * t * q.x + t * t * e.x, y: m * m * p1.y + 2 * m * t * q.y + t * t * e.y });
    }
    pts.push({ x: e.x, y: L.D });
    this._cp[sl] = pts;
    return pts;
  }
  lanePos(lane, dist, k) {
    const ln = this.L.lanes[lane];
    const p = ln.at(ln.length - dist);
    const off = (k - (COLS - 1) / 2) * COL_GAP;
    return { x: p.x - Math.sin(p.a) * off, y: p.y + Math.cos(p.a) * off, a: p.a };
  }

  drawQueue(ctx, now, g) {
    const pop = clamp((now - this.popAt) / 450, 0, 1);
    const sup = g.supply, nb = Math.floor(sup.length / COLS);
    // Farbgruppen (aufeinanderfolgende gleiche Blöcke) bleiben auf einer Bandseite
    if (this._qSup !== sup || this._qLen !== sup.length) {
      this._qSup = sup; this._qLen = sup.length;
      const laneOf = new Int8Array(nb + 1);
      let run = 0;
      for (let b = 0; b < nb; b++) {
        if (b > 0 && sup[b * COLS] !== sup[(b - 1) * COLS]) run++;
        laneOf[b] = run & 1;
      }
      this._qLane = laneOf;
    }
    const laneOf = this._qLane;
    const gone = this.vGone;
    const blockGone = (b) => { for (let k = 0; k < COLS; k++) if (!gone.has(b * COLS + k)) return false; return true; };
    let b0 = this.vHead;
    while (b0 < nb && blockGone(b0)) b0++;
    this.vHead = b0;
    const open = [];
    const rest = [];
    for (let b = b0; b < nb && rest.length < 50; b++) {
      if (blockGone(b)) continue;
      if (open.length < WINDOW) open.push(b); else rest.push(b);
    }
    this._frontLane = open.length ? laneOf[open[0]] : 0;
    // Plätze vergeben: bisherige behalten, sonst eigene Spur, dann Mitte, dann andere Seite
    const prev = this._slotOf;
    const slotOf = new Map();
    const taken = {};
    for (const b of open) {
      const sl = prev.get(b);
      if (sl && !taken[sl]) { taken[sl] = 1; slotOf.set(b, sl); }
    }
    for (const b of open) {
      if (slotOf.has(b)) continue;
      const own = laneOf[b] === 0 ? 'L' : 'R';
      const sl = !taken[own] ? own : !taken.C ? 'C' : own === 'L' ? 'R' : 'L';
      taken[sl] = 1;
      slotOf.set(b, sl);
    }
    this._slotOf = slotOf;
    // Ausgabeplätze markieren (Fläche darunter, Rahmen später darüber)
    const busySlots = new Set(slotOf.values());
    for (const sl of ['L', 'C', 'R']) this.drawSlotPad(ctx, sl, busySlots.has(sl), now, 'fill');
    // Zielpositionen
    const target = [];
    for (const b of open) {
      const sl = slotOf.get(b);
      for (let k = 0; k < COLS; k++) target.push([b * COLS + k, this.slotPos(sl, k), true]);
    }
    const cnt = [1, 1];
    for (const b of rest) {
      const ln = laneOf[b];
      const dist = this.rowDists(ln)[cnt[ln]++];
      if (dist === undefined) continue;
      for (let k = 0; k < COLS; k++) target.push([b * COLS + k, this.lanePos(ln, dist, k), false]);
    }
    // Weich nachrücken
    const kk = Math.min(1, this.frameDt * 0.012);
    let moving = false;
    const pp = this.pp;
    for (const [i, t] of target) {
      let p = pp.get(i);
      if (!p) { p = { x: t.x, y: t.y, a: t.a }; pp.set(i, p); continue; }
      const dx = t.x - p.x, dy = t.y - p.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.05) moving = true;
      p.x += dx * kk; p.y += dy * kk;
      let da = t.a - p.a;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      p.a += da * kk;
    }
    this.qMoving = moving;
    // Zeichnen: hinten zuerst
    const first = b0 * COLS;
    for (let n = target.length - 1; n >= 0; n--) {
      const [i, , isOpen] = target[n];
      const p = pp.get(i);
      const code = sup[i];
      const stagger = clamp(pop * 2 - (i - first) * 0.02, 0, 1);
      const sc = pop < 1 ? 0.5 + 0.5 * easeOut(stagger) : 1;
      const covered = code >= COVER && !isOpen;
      drawPallet(ctx, p.x, p.y, PALLET, code & 15, { angle: p.a, covered, symbols: this.symbols, scale: sc });
    }
    for (const sl of ['L', 'C', 'R']) this.drawSlotPad(ctx, sl, busySlots.has(sl), now, 'stroke');
  }

  // Leuchtende Bodenmarkierung eines Ausgabeplatzes
  drawSlotPad(ctx, sl, busy, now, part) {
    const c = this.slotPos(sl, 1.5);
    const cx = c.x, cy = c.y, a = c.a + Math.PI / 2, w = COLS * COL_GAP + 5, h = 18;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 5);
    if (part === 'fill') {
      ctx.fillStyle = 'rgba(255,214,0,0.35)';
      ctx.fill();
    } else {
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = 'rgba(120,70,0,0.35)';
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = busy ? '#ffe03c' : `rgba(255,224,60,${0.5 + 0.35 * Math.sin(now / 260)})`;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawFlights(ctx, now) {
    for (const f of this.flights) {
      const t = now - f.t0;
      let x;
      let y;
      let lift = 0;
      let scale = 1;
      let angle = 0;
      if (t < f.slide) {
        const p = f.path.at(f.path.length * ease(t / f.slide));
        x = p.x; y = p.y;
      } else {
        const k = clamp((t - f.slide) / f.hop, 0, 1);
        const p0 = f.path.at(f.path.length);
        const w = this.slotWorld(f.tv, f.slot);
        const e = ease(k);
        x = lerp(p0.x, w.x, e);
        y = lerp(p0.y, w.y, e);
        // Bogen mit etwas Strecken im Flug und kurzem Stauchen beim Aufsetzen
        lift = Math.sin(k * Math.PI) * 1.5;
        scale = 1 + Math.sin(k * Math.PI) * 0.22 - (k > 0.85 ? Math.sin((k - 0.85) / 0.15 * Math.PI) * 0.12 : 0);
        angle = f.tv.a * e;
      }
      const sz = t < f.slide ? PALLET : lerp(PALLET, f.slot.w || PALLET, clamp((t - f.slide) / f.hop, 0, 1));
      drawPallet(ctx, x, y, sz, f.code & 15, { angle, symbols: this.symbols, lift, scale });
    }
  }

  drawForklifts(ctx, now) {
    const L = this.L;
    for (const f of this.forklifts) {
      const tv = f.tv;
      const k = now - f.t0;
      const bx = tv.x;
      // Kommt von der Seite, auf der keine LKWs fahren (hoch: rechts, quer: links)
      const sg = L.land ? -1 : 1;
      const from = L.land ? L.vx0 - 30 : FW + 30;
      const y = L.D - 2;
      const per = Math.max(35, Math.min(120, 1400 / f.ev.count));
      const tEnd = 700 + per * f.ev.count;
      let x;
      let ang = L.land ? 0 : Math.PI;
      if (k < 700) x = lerp(from, bx + 18 * sg, easeOut(k / 700));
      else if (k < tEnd) x = bx + 18 * sg + Math.sin(k / 60) * 2;
      else { x = lerp(bx + 18 * sg, from, ease(clamp((k - tEnd) / 700, 0, 1))); ang = L.land ? Math.PI : 0; }
      P.drawForklift(ctx, x, y, ang, 30, { carrying: k < tEnd, cargo: COLORS[f.ev.color].hex, forkLift: k < tEnd ? 0.6 : 0 });
    }
  }

  drawCranes(ctx, now) {
    const L = this.L;
    for (const tv of this.cranes) {
      const c = tv.crane;
      const k = c.k ?? 0;
      const hookY = tv.y - 6 - (tv.lift || 0) * 10;
      P.drawCrane(ctx, { baseX: FW - 40, baseY: L.RY - 30, hookX: tv.x, hookY, s: 1, cable: 30 + (1 - (tv.lift || 0)) * 10 + k * 0 });
    }
  }

  drawBayOverlays(ctx, now) {
    const L = this.L;
    const flash = clamp(1 - (now - this.rampFlash) / 700, 0, 1);
    // Rampenampel an der Wand: grün = frei, gelb blinkend = LKW setzt zurück, rot = belegt
    const st = new Array(L.bays.length).fill(0);
    for (const tv of this.tvs) {
      if (tv.bay === undefined || tv.bay < 0 || tv.bay >= st.length) continue;
      if (tv.state === 'dock') st[tv.bay] = Math.max(st[tv.bay], 3);
      else if ((tv.state === 'drive' && tv.phase === 'reverse') || tv.state === 'crane') st[tv.bay] = Math.max(st[tv.bay], 2);
      else if (tv.state === 'drive' && tv.phase === 'approach' && this.bayOcc[tv.bay] === tv) st[tv.bay] = Math.max(st[tv.bay], 1);
    }
    const blink = Math.sin(now / 110) > 0;
    L.bays.forEach((x, r) => {
      const lx = x - L.slotW / 2 - 7, ly = L.wallY + 4.5;
      const s = st[r];
      const col = s === 3 ? '#ff2d3d' : s >= 1 ? '#ffb300' : '#22e06b';
      const on = s !== 2 || blink;
      ctx.fillStyle = '#1d2027';
      ctx.beginPath(); P.roundRectPath(ctx, lx - 3.2, ly - 3.2, 6.4, 6.4, 1.8); ctx.fill();
      if (on) {
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(lx, ly, 5.6, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = on ? col : '#4a3a1a';
      ctx.beginPath(); ctx.arc(lx, ly, 2.2, 0, TAU); ctx.fill();
      if (on) { ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(lx - 1.2, ly - 1.3, 1, 1); }
      let hl = 0;
      if (this.select === 'dock' && this.tvs.some((v) => v.state === 'dock' && v.bay === r && !v.pendingDepart && !v.fullAt)) hl = 0.5 + 0.5 * Math.sin(now / 150);
      if (hl > 0 || flash > 0) {
        ctx.save();
        ctx.globalAlpha = Math.max(hl * 0.5, flash * 0.45 * (0.5 + 0.5 * Math.sin(now / 50)));
        ctx.fillStyle = flash > 0 ? '#ff2d3d' : '#ffd400';
        ctx.fillRect(x - L.slotW / 2 + 1, L.bayTop + 3, L.slotW - 2, L.bayH - 5);
        ctx.restore();
      }
    });
  }

  // Tore, Schranken, Drehscheiben
  drawLotObjects(ctx, now) {
    const g = this.game || this.demo;
    const L = this.L;
    const c = L.cl;
    g.gates.forEach((gt, gi) => {
      const p = this.gridToScreen(gt.x + 0.5, gt.y + 0.5);
      const left = gt.queue.length - gt.next;
      P.drawGarage(ctx, p.x, p.y, DIR_ANGLE[gt.d] + L.ang, c, { count: left });
    });
    g.barriers.forEach((b, bi) => {
      for (const [x, y] of b.cells) {
        const p = this.gridToScreen(x + 0.5, y + 0.5);
        const at = this.barrierAnim[bi];
        const open = at >= 0 ? clamp((now - at) / 500, 0, 1) : 0;
        const left = Math.max(0, b.n - this.departedShown());
        P.drawBarrier(ctx, p.x, p.y, c, { open, count: left });
      }
    });
    for (const tv of this.tvs) {
      if (!tv.t.tt || tv.t.state === GONE && tv.state !== 'rotate' && tv.state !== 'lot') continue;
      if (tv.state === 'wait') continue;
      const t = tv.t;
      if (t.state !== LOT && tv.state !== 'rotate') continue;
      const [dx, dy] = DIRS[t.dir];
      const p = this.gridToScreen(t.x - dx * (t.len - 1) + 0.5, t.y - dy * (t.len - 1) + 0.5);
      P.drawTurntable(ctx, p.x, p.y, c * 0.62, tv.a);
    }
  }

  departedShown() {
    let n = 0;
    for (const tv of this.tvs) if (tv.state === 'leave' || tv.state === 'gone') n++;
    return n;
  }

  drawLotTrucks(ctx, now) {
    const g = this.game || this.demo;
    const lot = this.tvs.filter((v) => v.state === 'lot');
    lot.sort((a, b) => a.y - b.y);
    const selecting = this.select === 'truck';
    for (const tv of lot) this.drawTv(ctx, tv, now, true);
    // Marker: Eilaufträge, Ketten
    for (const tv of lot) {
      const t = tv.t;
      if (t.rush && g.status !== undefined) {
        const left = Math.max(0, t.rush - g.moves);
        const urgent = left <= 2;
        const sc = urgent ? 1 + 0.12 * Math.sin(now / 90) : 1;
        P.drawBadge(ctx, tv.x, tv.y - L_OFF(tv), 8 * sc, urgent ? '#ff2d3d' : '#ff8a00', String(left));
      }
      if (t.lock >= 0 && g.isLocked(t)) {
        P.drawPadlock(ctx, tv.x, tv.y, tv.cell * 0.55);
        const k = this.tvs[t.lock];
        if (k && k.state === 'lot') P.drawKey(ctx, k.x, k.y, k.cell * 0.5, '#ffc21a');
      }
    }
    void selecting;
  }

  drawTv(ctx, tv, now, inLot = false) {
    const t = tv.t;
    const nud = tv.nudge ? clamp((now - tv.nudge) / 380, 0, 1) : 1;
    let x = tv.x;
    let y = tv.y;
    if (nud < 1) {
      const off = Math.sin(nud * Math.PI * 3) * (1 - nud) * 4;
      x += Math.cos(tv.a) * off;
      y += Math.sin(tv.a) * off;
    }
    const flash = clamp(1 - (now - tv.flash) / 600, 0, 1);
    const sq = clamp(1 - (now - tv.squash) / 260, 0, 1);
    const hl = this.select === 'truck' && inLot ? 1 : 0;
    const comps = t.comps;
    drawVehicle(ctx, {
      x, y, angle: tv.a, cell: tv.cell || this.L.cd, size: tv.size,
      color: COLORS[comps[0].color].hex, color2: comps[1] ? COLORS[comps[1].color].hex : undefined,
      colorIndex: comps[0].color, color2Index: comps[1]?.color,
      hidden: tv.hidden && inLot, arrow: inLot, open: tv.state === 'dock',
      load: tv.vis.map((n, i) => ({ n, color: comps[i].color })),
      lift: tv.lift || 0, squash: sq * 0.6, highlight: hl, flash: flash > 0 ? flash * (0.5 + 0.5 * Math.sin(now / 45)) : 0,
      alpha: tv.alpha ?? 1, symbols: this.symbols,
      brake: !!tv.braking && (tv.state === 'drive' || tv.state === 'leave'),
      indicator: tv.indicator || 0,
      reverse: tv.phase === 'reverse' && tv.state === 'drive',
    });
  }

  // ---------- Effekte für Spielgefühl ----------
  shake(now, a) {
    if (now - this.shakeT < 380 && this.shakeA * (1 - (now - this.shakeT) / 380) > a) return;
    this.shakeT = now; this.shakeA = a;
  }
  burst(x, y, n, now, cols) {
    const pal = cols && cols.length ? cols : ['#ff0a1e', '#ffe000', '#14d200', '#0a5cff', '#ff0aa0', '#00c8ff'];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, v = 0.06 + Math.random() * 0.1;
      this.fx.push({ type: 'conf', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: now, dur: 900 + Math.random() * 500,
        c: Math.random() < 0.7 ? pal[i % pal.length] : '#ffffff', r: Math.random() * 6, s: 2 + Math.random() * 2.5 });
    }
  }
  // Großer Konfetti-Regen beim Sieg
  celebrate() {
    const now = performance.now();
    const top = this.L ? this.L.T : 0;
    for (let i = 0; i < 90; i++) {
      this.fx.push({ type: 'conf', x: Math.random() * this.VW, y: top - 20 - Math.random() * 120, vx: (Math.random() - 0.5) * 0.05, vy: 0.05 + Math.random() * 0.08,
        t0: now + Math.random() * 400, dur: 2600, c: ['#ff0a1e', '#ffe000', '#14d200', '#0a5cff', '#ff0aa0', '#00c8ff', '#9410ff', '#ffffff'][i % 8], r: Math.random() * 6, s: 3 + Math.random() * 3 });
    }
    this.shake(now, 2.5);
  }

  drawFx(ctx, now) {
    for (const f of this.fx) {
      if (f.type === 'conf') {
        const tt = now - f.t0;
        if (tt < 0) continue;
        const k = tt / (f.dur || 900);
        const x = f.x + f.vx * tt + Math.sin(tt * 0.008 + f.r) * 3, y = f.y + f.vy * tt + 0.00012 * tt * tt;
        ctx.save();
        ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
        ctx.translate(x, y);
        ctx.rotate(f.r + tt * 0.01);
        ctx.scale(1, Math.cos(tt * 0.012 + f.r));
        ctx.fillStyle = f.c;
        ctx.fillRect(-f.s / 2, -f.s * 0.35, f.s, f.s * 0.7);
        ctx.restore();
        continue;
      }
      if (f.type === 'text') {
        const k = clamp((now - f.t0) / f.dur, 0, 1);
        const pop = k < 0.15 ? easeOut(k / 0.15) * 1.25 : k < 0.25 ? 1.25 - (k - 0.15) * 2.5 : 1;
        ctx.save();
        ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
        ctx.translate(clamp(f.x, 60, this.VW - 60), f.y - easeOut(k) * 26);
        ctx.scale(pop, pop);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.font = '900 22px system-ui, sans-serif';
        ctx.lineWidth = 6; ctx.strokeStyle = '#8a3a00'; ctx.strokeText(f.text, 0, 0);
        const g = ctx.createLinearGradient(0, -10, 0, 10);
        g.addColorStop(0, '#fff6a0'); g.addColorStop(1, '#ff9d00');
        ctx.fillStyle = g; ctx.fillText(f.text, 0, 0);
        ctx.font = '900 13px system-ui, sans-serif';
        ctx.lineWidth = 4; ctx.strokeStyle = '#0b3f8f'; ctx.strokeText(f.sub, 0, 17);
        ctx.fillStyle = '#ffffff'; ctx.fillText(f.sub, 0, 17);
        ctx.restore();
        continue;
      }
      const k = clamp((now - f.t0) / 900, 0, 1);
      if (f.type === 'puff') P.drawPuff(ctx, f.x, f.y, f.s * (0.6 + k * 1.2), (1 - k) * 0.8);
      else if (f.type === 'check') {
        ctx.save();
        ctx.globalAlpha = k < 0.75 ? 1 : (1 - k) / 0.25;
        P.drawCheck(ctx, f.x, f.y - 6 - easeOut(k) * 16, 20 * (k < 0.15 ? k / 0.15 : 1));
        ctx.restore();
        P.drawSparkle(ctx, f.x, f.y, 24, k, '#ffd400');
      }
    }
  }
}

// Abstand des Abzeichens über dem LKW
function L_OFF(tv) {
  return vehicleWidth(tv.cell) * 0.2;
}

export const colorHex = (c) => COLORS[c].hex;
export const shade = P.shade;
