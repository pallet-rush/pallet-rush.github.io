// Geometrie des Hofs (in Feld-Einheiten). Wird von Spiellogik, Generator und
// Darstellung gemeinsam benutzt, damit "wer blockiert wen" überall gleich ist.
//
// LKWs sind Rechtecke mit beliebigem Winkel. Ein LKW kommt raus, wenn der
// Streifen vor ihm (so breit wie er selbst) bis zum Hofrand frei ist.
// LKWs im Raster (Richtung U/D/L/R) verhalten sich dabei genau wie früher:
// Nachbarspuren berühren den Streifen nie.

import { DIRS, SIZES } from './constants.js';

export const LOT_K = 0.77;                         // LKW-Maßstab im Hof relativ zum Raster
export const bodyLen = (len) => (len - 0.16) * LOT_K;
export const BODY_W = 0.84 * LOT_K;
export const GATE_W = 1.2;                         // Breite der Torhalle
export const GATE_BACK = 1.6;                      // Tiefe der Halle hinter dem Torfeld
export const BAR_S = 0.9;                          // Schranke (Quadrat)

export const DIR_RAD = { R: 0, D: Math.PI / 2, L: Math.PI, U: -Math.PI / 2 };

// Mitte und Winkel eines Raster-LKWs (Kopf-Feld x,y)
export function gridPose(x, y, d, len) {
  const [dx, dy] = DIRS[d];
  return { cx: x + 0.5 - (dx * (len - 1)) / 2, cy: y + 0.5 - (dy * (len - 1)) / 2, a: DIR_RAD[d] };
}

export function rectPoly(cx, cy, a, L, W) {
  const c = Math.cos(a), s = Math.sin(a);
  const hl = L / 2, hw = W / 2;
  return [
    [cx + c * hl - s * hw, cy + s * hl + c * hw],
    [cx + c * hl + s * hw, cy + s * hl - c * hw],
    [cx - c * hl + s * hw, cy - s * hl - c * hw],
    [cx - c * hl - s * hw, cy - s * hl + c * hw],
  ];
}

// Torhalle: Torfeld + Halle dahinter (Tür zeigt in Richtung d)
export function gatePoly(g) {
  const [dx, dy] = DIRS[g.d];
  const L = 1 + GATE_BACK - 0.08;
  const cx = g.x + 0.5 - (dx * GATE_BACK) / 2, cy = g.y + 0.5 - (dy * GATE_BACK) / 2;
  return rectPoly(cx, cy, DIR_RAD[g.d], L, GATE_W);
}
export const cellPoly = (x, y, s = BAR_S) => rectPoly(x + 0.5, y + 0.5, 0, s, s);

// Überlappen sich zwei konvexe Vielecke? (Trennachsen)
export function polyOverlap(A, B, eps = 1e-6) {
  for (const P of [A, B]) {
    for (let i = 0; i < P.length; i++) {
      const [x1, y1] = P[i];
      const [x2, y2] = P[(i + 1) % P.length];
      const nx = y1 - y2, ny = x2 - x1;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const [x, y] of A) { const d = x * nx + y * ny; if (d < a0) a0 = d; if (d > a1) a1 = d; }
      for (const [x, y] of B) { const d = x * nx + y * ny; if (d < b0) b0 = d; if (d > b1) b1 = d; }
      const n = Math.hypot(nx, ny) * eps;
      if (a1 <= b0 + n || b1 <= a0 + n) return false;
    }
  }
  return true;
}

// Abstand (vor der Mitte), ab dem ein LKW mit Mitte cx,cy, Winkel a, Breite W
// beim Vorwärtsfahren das Vieleck berührt – oder null, wenn er es nie berührt.
export function sweepDist(cx, cy, a, W, poly) {
  const c = Math.cos(a), s = Math.sin(a);
  const hw = W / 2 - 1e-6;
  let pts = poly.map(([x, y]) => [(x - cx) * c + (y - cy) * s, -(x - cx) * s + (y - cy) * c]);
  // Auf den Streifen |v| <= hw, u >= 0 zuschneiden
  const clip = (f) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const fp = f(p), fq = f(q);
      if (fp >= 0) out.push(p);
      if ((fp >= 0) !== (fq >= 0)) {
        const t = fp / (fp - fq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    pts = out;
  };
  clip((p) => hw - p[1]);
  if (!pts.length) return null;
  clip((p) => p[1] + hw);
  if (!pts.length) return null;
  clip((p) => p[0]);
  if (!pts.length) return null;
  let m = Infinity;
  for (const p of pts) if (p[0] < m) m = p[0];
  return m;
}

// Felder, die ein Vieleck berührt (für Torausfahrt, Drehscheiben, Hof-Umriss)
export function rasterCells(poly, w, h) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const out = [];
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(h - 1, Math.floor(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(w - 1, Math.floor(x1)); x++) {
      if (polyOverlap(poly, rectPoly(x + 0.5, y + 0.5, 0, 0.98, 0.98))) out.push([x, y]);
    }
  }
  return out;
}

// Körper eines LKWs aus den Leveldaten (frei: a in Grad, x/y = Mitte)
export function truckPoly(t, d = t.d) {
  const len = SIZES[t.s].len;
  if (t.a !== undefined) return rectPoly(t.x, t.y, (t.a * Math.PI) / 180, bodyLen(len), BODY_W);
  const p = gridPose(t.x, t.y, d, len);
  return rectPoly(p.cx, p.cy, p.a, bodyLen(len), BODY_W);
}
