// Fahrzeuge und Paletten für Pallet Rush – alles per Canvas 2D, keine Bilder.
// Ansicht: Draufsicht, Kamera ca. 45° von vorn-oben (Schrägprojektion). Eine Höhe z
// (in Zellen) wird im Bildschirm nach unten verschoben: Bildschirm-y = y + (ZT - z) * cell.
// Das Dach der Ladung (z = ZT) liegt genau auf (o.x, o.y), Seitenflächen hängen nach unten.
// Lokale Koordinaten: Nase zeigt nach +x (u), rechts = +y (v), Einheit = Zelle.
// Licht kommt von oben links (Bildschirm); Flächen werden nach ihrer Normalen schattiert.

import { COLORS, SIZES } from '../core/constants.js';

const ZT = 0.4;             // Dachhöhe der Ladung (= Überhang nach unten in Zellen)
const HW = 0.42;            // halbe Fahrzeugbreite (0.84 * cell)
const PAL_H = 0.43;         // Palettenhöhe (Holz + Ware) relativ zur Kante s
const PAL_WOOD = 0.13;      // Höhe der Holzpalette relativ zu s
const FRONT_M = 0.13;       // Platz vorn im Laderaum (Stirnwand + Planenpaket)
const REAR_M = 0.05;        // Platz hinten (Portal)
const COL_Y = 0.19;         // Querversatz der beiden Palettenspalten
const SLOT_MAX = 0.34;      // maximale Palettenkante (Zellen)
const WR = 0.1;             // Radradius
const WO = 0.45;            // Außenkante der Räder (quer)
const GREY_TARP = '#a3abb4';
const GREY_CAB = '#8b939c';
const CARTON = '#cf9d5f';
const TIRE = '#202328';
const SIDES = [-1, 1];
const Q8 = Math.PI / 4;
const TAU = Math.PI * 2;

// Welt-Stil der Fahrzeuge (ab v0.7.0, gesetzt von der Szene, siehe themes.js):
//   snow    Schnee auf Fahrerhaus und an den Dachkanten   dust  Staub/Schlamm unten (Farbe)
//   stripe  Zierstreifen an der Seite (Farbe)             rims  Felgenfarbe
//   beacon  orange Rundumleuchte auf dem Fahrerhaus       glow  Unterbodenleuchte (Farbe, nicht im Sprite)
//   lights  Scheinwerfer an (0..1, Abend/Nacht, nicht im Sprite)
// Die Farbe des Aufbaus bleibt immer die Spielfarbe.
export const VSTYLE = {};
let VKEY = '';
export function setVehicleStyle(st = {}) {
  for (const k of Object.keys(VSTYLE)) delete VSTYLE[k];
  Object.assign(VSTYLE, st);
  VKEY = `|${st.snow ? 1 : 0}${st.dust || ''}${st.stripe || ''}${st.rims || ''}${st.beacon ? 1 : 0}`;
}

// ---------- Farben ----------
const RGB = new Map();
function rgbOf(hex) {
  let v = RGB.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    RGB.set(hex, v);
  }
  return v;
}
const SHADE = new Map();
const h2 = (v) => (v < 16 ? '0' : '') + v.toString(16);
// Aufhellen (f > 0) bzw. abdunkeln (f < 0); Ergebnis '#rrggbb'.
function shade(hex, f) {
  const q = Math.round(f * 100);
  const key = hex + q;
  let s = SHADE.get(key);
  if (s) return s;
  const [r, g, b] = rgbOf(hex);
  const t = q / 100;
  // Aufhellen ohne auszubleichen: danach Sättigung wieder anheben (bleibt knallig statt pastell).
  let v = [r, g, b].map((c) => (t < 0 ? c * (1 + t) : c + (255 - c) * t));
  const L = (v[0] + v[1] + v[2]) / 3, k = 1 + Math.abs(t) * 0.9;
  v = v.map((c) => L + (c - L) * k);
  const m = (c) => Math.max(0, Math.min(255, Math.round(c)));
  s = '#' + h2(m(v[0])) + h2(m(v[1])) + h2(m(v[2]));
  SHADE.set(key, s);
  return s;
}

// Beleuchtung einer Fläche mit Welt-Normale (nx rechts, ny Richtung Betrachter, nz oben)
const LX = -0.45, LY = -0.28, LZ = 0.85;
function lit(hex, nx, ny, nz, k = 0.27) {
  return shade(hex, (nx * LX + ny * LY + nz * LZ - LZ) * k);
}

// Farbindex oder Hex-String → Hex
function hexOf(c, fallback = 0) {
  if (typeof c === 'string') return c;
  const e = COLORS[c] || COLORS[fallback] || COLORS[0];
  return e.hex;
}
function indexOf(c) {
  if (typeof c === 'number') return c & 15;
  const i = COLORS.findIndex((e) => e.hex === c);
  return i < 0 ? 0 : i;
}

// Verläufe in lokalen Koordinaten sind wiederverwendbar → pro Kontext cachen
const GRAD = new WeakMap();
function grad(ctx, key, make) {
  let m = GRAD.get(ctx);
  if (!m) { m = new Map(); GRAD.set(ctx, m); }
  let g = m.get(key);
  if (!g) { g = make(); m.set(key, g); }
  return g;
}
function lin(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [t, c] of stops) g.addColorStop(t, c);
  return g;
}
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

// ---------- Geometrie-Helfer ----------
// Abgerundetes Rechteck als Punktliste (im Uhrzeigersinn auf dem Bildschirm).
// Immer 16 Punkte: je Ecke 4; Kante 3 = vorn (+x), 7 = rechts (+y), 11 = hinten, 15 = links.
function rrPts(x0, x1, y0, y1, rf, rb) {
  const out = [];
  const corner = (cx, cy, a0, r) => {
    for (let i = 0; i <= 3; i++) {
      const a = a0 + (i * Math.PI) / 6;
      out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  };
  corner(x1 - rf, y0 + rf, -Math.PI / 2, rf);
  corner(x1 - rf, y1 - rf, 0, rf);
  corner(x0 + rb, y1 - rb, Math.PI / 2, rb);
  corner(x0 + rb, y0 + rb, Math.PI, rb);
  return out;
}
function box(k, x0, x1, y0, y1, z0, z1, rf = 0.03, rb = rf, extra) {
  const p = { k, x0, x1, y0, y1, z0, z1, rf, rb, pts: rrPts(x0, x1, y0, y1, rf, rb), pin: null, _k: 0 };
  return extra ? Object.assign(p, extra) : p;
}
// Deckfläche etwas eingerückt (der Rand wird zur hellen Glanzkante)
const INSET = 0.026;
function inset(p) {
  if (!p.pin) {
    const i = Math.min(INSET, (p.x1 - p.x0) * 0.2, (p.y1 - p.y0) * 0.2);
    p.pin = rrPts(p.x0 + i, p.x1 - i, p.y0 + i, p.y1 - i, Math.max(0.006, p.rf - i * 0.5), Math.max(0.006, p.rb - i * 0.5));
  }
  return p.pin;
}
function path(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}
function rrect(ctx, x, y, w, h, r) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

// ---------- Projektion ----------
// V = { m: Basis-Matrix, cx, cy, ca, sa, cell }
let PX = 0, PY = 0;
function pp(V, u, v, z) {
  PX = V.cx + (V.ca * u - V.sa * v) * V.cell;
  PY = V.cy + (V.sa * u + V.ca * v + ZT - z) * V.cell;
}
function setWorld(ctx, V) {
  const m = V.m;
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
}
// Lokales System (Einheit Zelle) auf Höhe z, optional mit Welt-Versatz
function setLocal(ctx, V, z, ox = 0, oy = 0) {
  const m = V.m, A = V.cell * V.ca, B = V.cell * V.sa;
  const E = V.cx + ox, F = V.cy + (ZT - z) * V.cell + oy;
  ctx.setTransform(m.a * A + m.c * B, m.b * A + m.d * B, m.c * A - m.a * B, m.d * A - m.b * B,
    m.a * E + m.c * F + m.e, m.b * E + m.d * F + m.f);
}
// Beliebige Abbildung (a,b,c,d,e,f) in Weltkoordinaten
function setAffine(ctx, V, a, b, c, d, e, f) {
  const m = V.m;
  ctx.setTransform(m.a * a + m.c * b, m.b * a + m.d * b, m.a * c + m.c * d, m.b * c + m.d * d,
    m.a * e + m.c * f + m.e, m.b * e + m.d * f + m.f);
}
// Senkrechte Seitenebene v = const, Koordinaten (u, z) mit z nach oben
function planeU(ctx, V, v) {
  pp(V, 0, v, 0);
  setAffine(ctx, V, V.ca * V.cell, V.sa * V.cell, 0, -V.cell, PX, PY);
}
// Senkrechte Stirnebene u = const, Koordinaten (v, z) mit z nach oben
function planeV(ctx, V, u) {
  pp(V, u, 0, 0);
  setAffine(ctx, V, -V.sa * V.cell, V.ca * V.cell, 0, -V.cell, PX, PY);
}

const WX = new Float64Array(64), WY = new Float64Array(64);
const CHX = new Float64Array(64), CHY = new Float64Array(64);
let CH_N = 0;

function projW(ctx, V, pts, z) {
  setWorld(ctx, V);
  return proj(V, pts, z);
}
function proj(V, pts, z) {
  const n = pts.length >> 1, c = V.ca * V.cell, s = V.sa * V.cell, oy = V.cy + (ZT - z) * V.cell;
  for (let i = 0; i < n; i++) {
    const u = pts[2 * i], v = pts[2 * i + 1];
    WX[i] = V.cx + c * u - s * v;
    WY[i] = oy + s * u + c * v;
  }
  return n;
}

// Hülle aus Polygon (WX/WY) und dem um d nach unten verschobenen Polygon.
// Merkt sich die sichtbare Unterkante (CHX/CHY, rechts → links).
function hullPath(ctx, n, d) {
  let iMin = 0, iMax = 0;
  for (let i = 1; i < n; i++) {
    const x = WX[i], y = WY[i];
    if (x < WX[iMin] - 1e-6 || (x <= WX[iMin] + 1e-6 && y > WY[iMin])) iMin = i;
    if (x > WX[iMax] + 1e-6 || (x >= WX[iMax] - 1e-6 && y > WY[iMax])) iMax = i;
  }
  ctx.beginPath();
  let i = iMin;
  ctx.moveTo(WX[i], WY[i]);
  while (i !== iMax) { i = (i + 1) % n; ctx.lineTo(WX[i], WY[i]); }
  CH_N = 0;
  i = iMax;
  for (;;) {
    CHX[CH_N] = WX[i]; CHY[CH_N] = WY[i]; CH_N++;
    ctx.lineTo(WX[i], WY[i] + d);
    if (i === iMin) break;
    i = (i + 1) % n;
  }
  ctx.closePath();
}

// Seitenband füllen: ein horizontaler Verlauf mit harten Stopps je Fläche ergibt
// korrekte Schattierung bei jedem Winkel (abgerundete Ecken → weicher Übergang).
function sideFill(ctx, n, d, hex, k = 0.27) {
  hullPath(ctx, n, d);
  const xa = CHX[CH_N - 1], xb = CHX[0], span = xb - xa;
  if (span < 1e-6) { ctx.fillStyle = lit(hex, 0, 1, 0, k); ctx.fill(); return; }
  const gr = ctx.createLinearGradient(xa, 0, xb, 0);
  for (let j = CH_N - 1; j > 0; j--) {
    const ex = CHX[j] - CHX[j - 1], ey = CHY[j] - CHY[j - 1];
    const L = Math.hypot(ex, ey);
    if (L < 1e-6) continue;
    const c = lit(hex, ey / L, -ex / L, 0, k);
    gr.addColorStop(clamp01((CHX[j] - xa) / span), c);
    gr.addColorStop(clamp01((CHX[j - 1] - xa) / span), c);
  }
  ctx.fillStyle = gr;
  ctx.fill();
}

// Lack-Glanz auf dem Seitenband (nach sideFill): helle Oberkante, dunklere Unterseite.
// Nur auf flachen Kettenstücken, damit nichts über die Silhouette hinausragt (kein clip nötig).
function sideGloss(ctx, d, cell, a = 1) {
  chainStrokeH(ctx, d * 0.78, d * 0.44, 'rgba(0,0,0,0.13)');
  chainStrokeH(ctx, Math.max(0.012 * cell, d * 0.07), Math.max(0.018 * cell, d * 0.1), `rgba(255,255,255,${Math.min(0.5, 0.3 * a)})`);
}
function chainStrokeH(ctx, dy, lw, col) {
  if (CH_N < 2) return;
  ctx.beginPath();
  let pen = false;
  for (let k = 1; k < CH_N; k++) {
    const ex = CHX[k] - CHX[k - 1], ey = CHY[k] - CHY[k - 1];
    if (Math.abs(ey) > 2 * Math.abs(ex) || Math.abs(ex) < 1e-6) { pen = false; continue; }
    if (!pen) ctx.moveTo(CHX[k - 1], CHY[k - 1] + dy);
    ctx.lineTo(CHX[k], CHY[k] + dy);
    pen = true;
  }
  ctx.lineWidth = lw;
  ctx.strokeStyle = col;
  ctx.stroke();
}

// Linie entlang der sichtbaren Unterkante, um dy nach unten versetzt
function chainStroke(ctx, dy, lw, col) {
  if (CH_N < 2) return;
  ctx.beginPath();
  ctx.moveTo(CHX[0], CHY[0] + dy);
  for (let k = 1; k < CH_N; k++) ctx.lineTo(CHX[k], CHY[k] + dy);
  ctx.lineWidth = lw;
  ctx.strokeStyle = col;
  ctx.stroke();
}

// Deckfläche: helle Glanzkante + weicher Querverlauf (Licht von oben links)
function topFace(ctx, V, p, hex, rim = 0.3, flat = false) {
  setLocal(ctx, V, p.z1);
  path(ctx, p.pts);
  ctx.fillStyle = shade(hex, rim);
  ctx.fill();
  const lv = (V.sa - V.ca) * 0.7071;
  const q = Math.round(Math.abs(lv) * 6), sg = lv < 0 ? -1 : 1;
  if (flat || q === 0) ctx.fillStyle = shade(hex, 0.04);
  else {
    const y0 = p.y0, y1 = p.y1, w = q / 6;
    ctx.fillStyle = grad(ctx, 'tf' + hex + y0 + '|' + y1 + '|' + q * sg, () => lin(ctx, 0, sg > 0 ? y1 : y0, 0, sg > 0 ? y0 : y1,
      [[0, shade(hex, 0.04 + 0.12 * w)], [0.45, shade(hex, 0.04)], [1, shade(hex, -0.07 * w)]]));
  }
  path(ctx, inset(p));
  ctx.fill();
}

// Dezente Silhouettenkante in einer dunkleren Variante der eigenen Farbe
// (direkt nach sideFill: der aktuelle Pfad ist noch die Hülle)
function edgeStroke(ctx, cell, hex, k = -0.45) {
  ctx.lineWidth = 0.013 * cell;
  ctx.strokeStyle = shade(hex, k);
  ctx.stroke();
}

// Quader mit Licht, Glanz und Deckel
function solid(ctx, V, p, hex, o = {}) {
  const d = (p.z1 - p.z0) * V.cell;
  const n = projW(ctx, V, p.pts, p.z1);
  sideFill(ctx, n, d, hex, o.k);
  if (o.edge !== false) edgeStroke(ctx, V.cell, hex, o.edge || -0.45);
  if (o.gloss !== false && d > 2) sideGloss(ctx, d, V.cell, o.gloss || 1);
  topFace(ctx, V, p, o.top || hex, o.rim ?? 0.25, o.flat);
}

// Kegelstumpf zwischen zwei Ringen gleicher Punktzahl (bot auf z0, top auf z1).
// Sichtbare Flächen einzeln nach Normale schattiert; deco(i, Q) für Fenster usw.
const FQ = new Float64Array(8);
function frustum(ctx, V, bot, top, z0, z1, hex, deco) {
  const cell = V.cell, n = bot.length >> 1, c = V.ca * cell, s = V.sa * cell;
  const ob = V.cy + (ZT - z0) * cell, ot = V.cy + (ZT - z1) * cell, dz = z1 - z0;
  setWorld(ctx, V);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const bu = bot[2 * i], bv = bot[2 * i + 1], bu2 = bot[2 * j], bv2 = bot[2 * j + 1];
    const tu = top[2 * i], tv = top[2 * i + 1], tu2 = top[2 * j], tv2 = top[2 * j + 1];
    FQ[0] = V.cx + c * bu - s * bv; FQ[1] = ob + s * bu + c * bv;
    FQ[2] = V.cx + c * bu2 - s * bv2; FQ[3] = ob + s * bu2 + c * bv2;
    FQ[4] = V.cx + c * tu2 - s * tv2; FQ[5] = ot + s * tu2 + c * tv2;
    FQ[6] = V.cx + c * tu - s * tv; FQ[7] = ot + s * tu + c * tv;
    const area = (FQ[0] * FQ[3] - FQ[2] * FQ[1]) + (FQ[2] * FQ[5] - FQ[4] * FQ[3]) +
      (FQ[4] * FQ[7] - FQ[6] * FQ[5]) + (FQ[6] * FQ[1] - FQ[0] * FQ[7]);
    if (area <= 0.02) continue;
    const du1 = bu2 - bu, dv1 = bv2 - bv, du2 = tu - bu, dv2 = tv - bv;
    let nu = dv1 * dz, nv = -du1 * dz, nz = du1 * dv2 - dv1 * du2;
    const L = Math.hypot(nu, nv, nz) || 1;
    nu /= L; nv /= L; nz /= L;
    const col = lit(hex, V.ca * nu - V.sa * nv, V.sa * nu + V.ca * nv, nz);
    ctx.beginPath();
    ctx.moveTo(FQ[0], FQ[1]); ctx.lineTo(FQ[2], FQ[3]); ctx.lineTo(FQ[4], FQ[5]); ctx.lineTo(FQ[6], FQ[7]);
    ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    if (deco) deco(ctx, i, FQ, cell);
  }
}
// Punkt in der Fläche FQ: s entlang der Unterkante, t von unten (0) nach oben (1)
function qpt(Q, s, t) {
  const ax = Q[0] + (Q[2] - Q[0]) * s, ay = Q[1] + (Q[3] - Q[1]) * s;
  const bx = Q[6] + (Q[4] - Q[6]) * s, by = Q[7] + (Q[5] - Q[7]) * s;
  PX = ax + (bx - ax) * t; PY = ay + (by - ay) * t;
}
function quad(ctx, Q, s0, s1, t0, t1) {
  ctx.beginPath();
  qpt(Q, s0, t0); ctx.moveTo(PX, PY);
  qpt(Q, s1, t0); ctx.lineTo(PX, PY);
  qpt(Q, s1, t1); ctx.lineTo(PX, PY);
  qpt(Q, s0, t1); ctx.lineTo(PX, PY);
  ctx.closePath();
}

// ---------- Fahrzeug-Geometrie ----------
const GEOM = {};
function geom(size) {
  return GEOM[size] || (GEOM[size] = buildGeom(size));
}

function buildGeom(size) {
  const def = SIZES[size] || SIZES.M;
  const hl = (def.len - 0.16) / 2;
  const fx = hl - 0.035;
  const g = { size, hl, low: [], parts: [], wheels: [], cargo: [], cab: null };
  const wheel = (x, dual) => {
    const tw = dual ? 0.15 : 0.1;
    for (const sd of SIDES) g.wheels.push({ x, sd, vo: sd * WO, vi: sd * (WO - tw), dual, av: 0, az: -1, _k: 0 });
  };
  // Fahrerhaus: Unterbau (bis zb) + Fensteraufbau (Kegelstumpf bis zt) + optional Spoiler
  const cab = (x0, o) => {
    const hw = 0.4;
    const p = box('cab', x0, fx, -hw, hw, 0.11, o.zb, o.rf, 0.05, { van: !!o.van });
    const gx1 = fx - o.hood, tx1 = gx1 - o.slope;
    p.ghB = rrPts(x0 + 0.012, gx1, -hw + 0.014, hw - 0.014, o.rg, 0.035);
    p.roof = box('roof', x0 + 0.03, tx1, -hw + 0.055, hw - 0.055, o.zb, o.zt, o.rg * 0.75, 0.03);
    if (o.dz) {
      const r = p.roof, back = r.x0 + 0.015, len = r.x1 - back;
      p.defB = rrPts(back, r.x1 - 0.015, r.y0 + 0.03, r.y1 - 0.03, 0.04, 0.025);
      p.defl = box('defl', back, back + len * 0.42, r.y0 + 0.012, r.y1 - 0.012, o.zt, o.dz, 0.035, 0.025);
    }
    // Spiegel: Arm + Gehäuse seitlich an der A-Säule
    const mx = gx1 - 0.03;
    p.mirror = {};
    for (const sd of SIDES) {
      p.mirror[sd] = box('mirror', mx - 0.035, mx + 0.02, sd < 0 ? -hw - 0.065 : hw + 0.02, sd < 0 ? -hw - 0.02 : hw + 0.065,
        o.zb + 0.015, o.zb + 0.1, 0.012);
    }
    g.cab = p;
    g.parts.push(p);
  };
  const bumper = (hw) => g.parts.push(box('bumper', hl - 0.06, hl, -hw, hw, 0.05, 0.13, 0.03, 0.01));
  const cargo = (x0, x1, z0, comp, style) => {
    const p = box('cargo', x0, x1, -HW, HW, z0, ZT, 0.05, 0.04, { comp, style });
    g.cargo.push(p);
    g.parts.push(p);
  };
  const chassis = (x0, x1, hw) => g.low.push(box('chassis', x0, x1, -hw, hw, 0.06, 0.135, 0.02));

  switch (size) {
    case 'S':
      chassis(-0.86, 0.80, 0.25);
      wheel(0.60, false); wheel(-0.52, false);
      cab(0.30, { zb: 0.235, zt: 0.36, rf: 0.13, rg: 0.1, hood: 0.11, slope: 0.15, van: true });
      bumper(0.33);
      cargo(-hl, 0.27, 0.14, 0, 'tarp');
      break;
    case 'L':
      chassis(0.78, 1.82, 0.26);
      g.low.push({ k: 'fifth', x: 1.24, r: 0.12, z: 0.135 });
      wheel(1.66, false); wheel(1.06, true);
      wheel(-1.20, true); wheel(-1.44, true); wheel(-1.68, true);
      cab(1.36, { zb: 0.25, zt: 0.375, rf: 0.06, rg: 0.05, hood: 0.045, slope: 0.09, dz: 0.445 });
      bumper(0.4);
      for (const sd of SIDES) {
        g.parts.push(box('tank', 1.18, 1.345, sd < 0 ? -0.405 : 0.27, sd < 0 ? -0.27 : 0.405, 0.05, 0.155, 0.055));
        g.parts.push(box('stack', 1.3, 1.35, sd * 0.335 - 0.022, sd * 0.335 + 0.022, 0.12, 0.47, 0.022));
      }
      cargo(-hl, 1.16, 0.17, 0, 'tarp');
      break;
    case 'T':
      chassis(-0.02, 2.34, 0.27);
      chassis(-2.36, -0.56, 0.27);
      g.low.push({ k: 'drawbar', x0: -0.54, x1: -0.04, z: 0.1 });
      wheel(2.16, false); wheel(0.24, true); wheel(-0.80, true); wheel(-2.04, true);
      cab(1.86, { zb: 0.25, zt: 0.375, rf: 0.06, rg: 0.05, hood: 0.045, slope: 0.09, dz: 0.44 });
      bumper(0.4);
      cargo(-0.08, 1.80, 0.15, 0, 'box');
      cargo(-hl, -0.50, 0.15, 1, 'box');
      break;
    default: // M
      chassis(-1.32, 1.30, 0.27);
      wheel(1.10, false); wheel(-0.88, true);
      cab(0.80, { zb: 0.25, zt: 0.37, rf: 0.06, rg: 0.05, hood: 0.05, slope: 0.1 });
      bumper(0.4);
      cargo(-hl, 0.73, 0.15, 0, 'box');
  }
  // Radkästen: auf welchem Aufbau sitzt das Rad?
  for (const w of g.wheels) {
    const p = [g.cab, ...g.cargo].find((q) => w.x - 0.08 > q.x0 && w.x + 0.08 < q.x1);
    if (p) { w.av = w.sd * p.y1; w.az = p.z0; }
  }
  g.rear = g.cargo.reduce((a, b) => (a.x0 < b.x0 ? a : b));
  g.outline = rrPts(-hl, hl, -0.45, 0.45, 0.08, 0.08);
  g.slots = g.cargo.map((p) => slotLayout(p, def.caps[p.comp] ?? def.cap));
  return g;
}

// ---------- Ladeplätze ----------
function slotLayout(p, cap) {
  const rows = Math.max(1, Math.ceil(cap / 4));
  const xa = p.x1 - FRONT_M, xb = p.x0 + REAR_M, pitch = (xa - xb) / rows;
  return { rows, xa, pitch, s: Math.min(pitch * 0.9, SLOT_MAX), cap, z0: p.z0 };
}
function slotLocal(sl, n) {
  const half = Math.max(1, sl.cap / 2);
  const layer = n > half ? 1 : 0;
  const k = (n - 1) % half;
  const row = Math.floor(k / 2), col = k % 2;
  return { u: sl.xa - sl.pitch * (row + 0.5), v: col ? COL_Y : -COL_Y, layer };
}

// Ladeplatz n (1-basiert) im Abteil comp, lokal (Nase +x, vor Drehung, relativ zur
// Fahrzeugmitte) in px. dy = Bildschirm-Versatz nach der Drehung, damit die Palette
// (Anker = Oberseite der Ware, wie drawPallet) genau auf dem Ladeboden steht.
export function vehicleSlot(size, cell, comp, n) {
  const g = geom(size);
  const sl = g.slots[comp] || g.slots[0];
  const q = slotLocal(sl, n);
  const s = sl.s * cell;
  return {
    x: q.u * cell, y: q.v * cell, layer: q.layer, w: s, h: s,
    dy: (ZT - sl.z0) * cell - (q.layer + 1) * PAL_H * s,
  };
}

// Komfort: Bildschirmposition eines Ladeplatzes für ein drawVehicle-Optionsobjekt
export function vehicleSlotScreen(o, comp, n) {
  const sl = vehicleSlot(o.size, o.cell, comp, n);
  const a = o.angle || 0, c = Math.cos(a), s = Math.sin(a);
  const y = o.y - (o.lift || 0) * 0.42 * o.cell;
  return { x: o.x + sl.x * c - sl.y * s, y: y + sl.x * s + sl.y * c + sl.dy, s: sl.w, angle: a, layer: sl.layer };
}

export function vehicleLength(size, cell) {
  return ((SIZES[size] || SIZES.M).len - 0.16) * cell;
}
export function vehicleWidth(cell) {
  return 0.84 * cell;
}
export function palletHeight(s) {
  return PAL_H * s;
}

// ---------- Räder ----------
// Reifen als Zylinder (Achse quer): Lauffläche als Hülle zweier Ellipsen, außen Felge.
function drawWheel(ctx, V, w, near) {
  const cell = V.cell, r = WR * cell;
  const ax = V.ca * r, ay = V.sa * r;            // Halbachse entlang u
  const dv = w.vo - w.vi;
  const Dx = -V.sa * dv * cell, Dy = V.ca * dv * cell;
  pp(V, w.x, w.vi, WR);
  const ix = PX, iy = PY;
  if (near && w.az >= 0) {
    // Radkasten im Aufbau
    planeU(ctx, V, w.av);
    const R = WR + 0.018, s0 = Math.max(-1, Math.min(1, (w.az - WR) / R)), a0 = Math.asin(s0);
    ctx.beginPath();
    ctx.arc(w.x, WR, R, a0, Math.PI - a0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(10,12,16,0.62)';
    ctx.fill();
  }
  const t0 = Math.atan2(-r * Dx, ax * Dy - ay * Dx);
  const px = ax * Math.cos(t0), py = ay * Math.cos(t0) + r * Math.sin(t0);
  setWorld(ctx, V);
  ctx.beginPath();
  ctx.moveTo(ix + px, iy + py); ctx.lineTo(ix + px + Dx, iy + py + Dy);
  ctx.lineTo(ix - px + Dx, iy - py + Dy); ctx.lineTo(ix - px, iy - py);
  ctx.closePath();
  ctx.fillStyle = TIRE;
  ctx.fill();
  if (Math.abs(V.ca) < 0.02) return; // Ellipse entartet → nur Lauffläche sichtbar
  setAffine(ctx, V, ax, ay, 0, r, ix, iy);
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
  setAffine(ctx, V, ax, ay, 0, r, ix + Dx, iy + Dy);
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU);
  ctx.fillStyle = near ? '#33373e' : TIRE;
  ctx.fill();
  if (!near || cell < 9) return;
  ctx.lineWidth = 0.1;
  ctx.beginPath(); ctx.arc(0, 0, 0.86, -2.7, -1.0);
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, w.dual ? 0.58 : 0.62, 0, TAU);
  ctx.fillStyle = VSTYLE.rims || '#e3e8ed'; ctx.fill();
  ctx.lineWidth = 0.09; ctx.strokeStyle = '#97a1ab'; ctx.stroke();
  if (cell >= 16) {
    ctx.beginPath(); ctx.arc(0, 0, w.dual ? 0.42 : 0.44, 0, TAU);
    ctx.fillStyle = '#c3cad2'; ctx.fill();
  }
  ctx.beginPath(); ctx.arc(0, 0, 0.2, 0, TAU);
  ctx.fillStyle = '#5c646d'; ctx.fill();
  ctx.beginPath(); ctx.arc(-0.12, -0.2, 0.13, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
}

// ---------- Fahrzeugteile ----------
function drawLow(ctx, V, p) {
  if (p.k === 'chassis') {
    solid(ctx, V, p, '#2e3338', { top: '#3b4148', rim: 0.05, gloss: false, edge: false });
  } else if (p.k === 'fifth') {
    // Sattelkupplung
    setLocal(ctx, V, p.z);
    ctx.fillStyle = '#41474e';
    ctx.fillRect(p.x - 0.17, -0.2, 0.34, 0.4);
    ctx.beginPath(); ctx.arc(p.x, 0, p.r, 0, TAU);
    ctx.fillStyle = '#2b2f34'; ctx.fill();
    ctx.lineWidth = 0.022; ctx.strokeStyle = '#6a727a'; ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, 0, p.r * 0.62, -2.2, -0.6);
    ctx.lineWidth = 0.014; ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - p.r - 0.01, -0.075); ctx.lineTo(p.x - 0.015, -0.018);
    ctx.lineTo(p.x - 0.015, 0.018); ctx.lineTo(p.x - p.r - 0.01, 0.075);
    ctx.closePath(); ctx.fillStyle = '#121416'; ctx.fill();
  } else if (p.k === 'drawbar') {
    // Deichsel (A-Rahmen) mit Zugöse
    setLocal(ctx, V, p.z - 0.07, 0, 0);
    const tip = p.x1 - 0.04;
    ctx.beginPath();
    ctx.moveTo(p.x0, -0.25); ctx.lineTo(tip, 0); ctx.lineTo(p.x0, 0.25);
    ctx.lineJoin = 'round'; ctx.lineWidth = 0.05; ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.stroke();
    setLocal(ctx, V, p.z);
    ctx.beginPath();
    ctx.moveTo(p.x0, -0.25); ctx.lineTo(tip, 0); ctx.lineTo(p.x0, 0.25);
    ctx.lineWidth = 0.05; ctx.strokeStyle = '#2b2f35'; ctx.stroke();
    ctx.lineWidth = 0.014; ctx.strokeStyle = '#717981'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tip, 0); ctx.lineTo(p.x1 + 0.02, 0);
    ctx.lineWidth = 0.04; ctx.strokeStyle = '#2b2f35'; ctx.stroke();
    ctx.beginPath(); ctx.arc(tip + 0.01, 0, 0.03, 0, TAU);
    ctx.lineWidth = 0.016; ctx.strokeStyle = '#8b939b'; ctx.stroke();
    // Bremsleitungen
    ctx.beginPath(); ctx.moveTo(p.x0 + 0.04, 0.06); ctx.quadraticCurveTo((p.x0 + tip) / 2, 0.16, p.x1, 0.05);
    ctx.lineWidth = 0.012; ctx.strokeStyle = '#d23a2a'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x0 + 0.04, -0.06); ctx.quadraticCurveTo((p.x0 + tip) / 2, -0.16, p.x1, -0.05);
    ctx.strokeStyle = '#e6c21e'; ctx.stroke();
  }
}

function drawBumper(ctx, V, p) {
  const d = (p.z1 - p.z0) * V.cell;
  const n = projW(ctx, V, p.pts, p.z1);
  sideFill(ctx, n, d, '#4a5059');
  sideGloss(ctx, d, V.cell, 1.3);
  if (V.sa > 0.08) {
    planeV(ctx, V, p.x1);
    ctx.fillStyle = '#f4f4ee';
    rrect(ctx, -0.075, p.z0 + 0.018, 0.15, 0.045, 0.008); ctx.fill();
    ctx.fillStyle = '#1d4fb8';
    ctx.fillRect(-0.075, p.z0 + 0.018, 0.018, 0.045);
  }
  topFace(ctx, V, p, '#5d646d', 0.25, true);
}

function drawTank(ctx, V, p) {
  const n = projW(ctx, V, p.pts, p.z1);
  sideFill(ctx, n, (p.z1 - p.z0) * V.cell, '#b9c1c9');
  sideGloss(ctx, (p.z1 - p.z0) * V.cell, V.cell, 1.5);
  setLocal(ctx, V, p.z1);
  ctx.fillStyle = grad(ctx, 'tank' + p.y0, () => lin(ctx, 0, p.y0, 0, p.y1,
    [[0, '#8a939c'], [0.42, '#f6f8fa'], [0.6, '#e1e6eb'], [1, '#848d97']]));
  path(ctx, p.pts); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(p.x0 + 0.04, p.y0); ctx.lineTo(p.x0 + 0.04, p.y1);
  ctx.moveTo(p.x1 - 0.04, p.y0); ctx.lineTo(p.x1 - 0.04, p.y1);
  ctx.lineWidth = 0.014; ctx.strokeStyle = '#59616a'; ctx.stroke();
}

function drawStack(ctx, V, p) {
  const n = projW(ctx, V, p.pts, p.z1);
  sideFill(ctx, n, (p.z1 - p.z0) * V.cell, '#dfe4e8', 0.45);
  setLocal(ctx, V, p.z1);
  path(ctx, p.pts); ctx.fillStyle = '#eef1f3'; ctx.fill();
  ctx.beginPath(); ctx.arc((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, 0.012, 0, TAU);
  ctx.fillStyle = '#25282c'; ctx.fill();
}

// Fenster im Fensteraufbau: 3 = Frontscheibe, 7 / 15 = Seitenfenster rechts / links
function cabGlass(ctx, i, Q, cell) {
  if (i === 3) {
    quad(ctx, Q, 0.05, 0.95, 0.1, 0.9);
    ctx.fillStyle = '#20384f'; ctx.fill();
    quad(ctx, Q, 0.05, 0.95, 0.55, 0.9);
    ctx.fillStyle = 'rgba(120,175,220,0.35)'; ctx.fill();
    ctx.beginPath();
    qpt(Q, 0.2, 0.1); ctx.moveTo(PX, PY); qpt(Q, 0.34, 0.1); ctx.lineTo(PX, PY);
    qpt(Q, 0.5, 0.9); ctx.lineTo(PX, PY); qpt(Q, 0.36, 0.9); ctx.lineTo(PX, PY);
    ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.fill();
    ctx.beginPath();
    qpt(Q, 0.4, 0.1); ctx.moveTo(PX, PY); qpt(Q, 0.45, 0.1); ctx.lineTo(PX, PY);
    qpt(Q, 0.61, 0.9); ctx.lineTo(PX, PY); qpt(Q, 0.56, 0.9); ctx.lineTo(PX, PY);
    ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fill();
  } else if (i === 7 || i === 15) {
    const s0 = i === 7 ? 0.04 : 0.36, s1 = i === 7 ? 0.64 : 0.96;
    quad(ctx, Q, s0, s1, 0.14, 0.86);
    ctx.fillStyle = '#243f58'; ctx.fill();
    quad(ctx, Q, s0, s1, 0.55, 0.86);
    ctx.fillStyle = 'rgba(130,185,230,0.3)'; ctx.fill();
    ctx.beginPath();
    const a = i === 7 ? 0.14 : 0.62;
    qpt(Q, a, 0.14); ctx.moveTo(PX, PY); qpt(Q, a + 0.1, 0.14); ctx.lineTo(PX, PY);
    qpt(Q, a + 0.18, 0.86); ctx.lineTo(PX, PY); qpt(Q, a + 0.08, 0.86); ctx.lineTo(PX, PY);
    ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
  }
}
// Spoiler: Vorderfläche mit Zierstreifen
function deflDeco(ctx, i, Q) {
  if (i !== 3) return;
  quad(ctx, Q, 0.06, 0.94, 0.3, 0.42);
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
  quad(ctx, Q, 0.06, 0.94, 0.5, 0.56);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
}

function drawMirror(ctx, V, p, sd) {
  const m = p.mirror[sd];
  // Arm
  setLocal(ctx, V, m.z0 + 0.04);
  ctx.fillStyle = '#2a2e34';
  ctx.fillRect(m.x0 + 0.02, sd < 0 ? m.y1 : p.y1 - 0.01, 0.014, sd < 0 ? p.y0 + 0.01 - m.y1 : m.y0 - p.y1 + 0.01);
  const n = projW(ctx, V, m.pts, m.z1);
  sideFill(ctx, n, (m.z1 - m.z0) * V.cell, '#2c3036');
  setLocal(ctx, V, m.z1);
  path(ctx, m.pts); ctx.fillStyle = '#4a5058'; ctx.fill();
}

function drawCab(ctx, V, p, c) {
  const cell = V.cell, hex = c.cab;
  const nearSd = V.ca >= 0 ? 1 : -1;
  drawMirror(ctx, V, p, -nearSd);
  // Unterbau
  const d = (p.z1 - p.z0) * cell;
  const n = projW(ctx, V, p.pts, p.z1);
  sideFill(ctx, n, d, hex);
  edgeStroke(ctx, cell, hex);
  sideGloss(ctx, d, cell);
  for (const sd of SIDES) {
    if (sd * V.ca < 0.1) continue;
    planeU(ctx, V, sd * p.y1);
    const z0 = p.z0, z1 = p.z1;
    const fu = p.x1 - (p.van ? 0.2 : 0.11), bu = p.x0 + 0.06;
    ctx.fillStyle = shade(hex, -0.42);
    ctx.fillRect(bu, z0 + 0.02, 0.008, z1 - z0 - 0.02);
    ctx.fillRect(fu, z0 + 0.02, 0.008, z1 - z0 - 0.02);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    rrect(ctx, bu + 0.03, z1 - 0.045, 0.06, 0.016, 0.008); ctx.fill();
    // Trittstufe vorn
    ctx.fillStyle = '#2a2e34';
    rrect(ctx, p.x1 - 0.17, z0 + 0.004, 0.12, 0.03, 0.006); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(p.x1 - 0.165, z0 + 0.026, 0.11, 0.006);
    // Seitenblinker
    ctx.fillStyle = '#ffa31a';
    rrect(ctx, p.x1 - 0.055, z1 - 0.06, 0.032, 0.02, 0.008); ctx.fill();
    if (VSTYLE.dust) dustBand(ctx, p.x0, p.x1, z0, z1);
  }
  if (V.sa > 0.06) {
    // Front: Grill, Scheinwerfer
    planeV(ctx, V, p.x1);
    const z0 = p.z0, sv = p.y1 - p.rf;
    const gw = p.van ? 0.13 : 0.19, lw = p.van ? 0.09 : 0.1;
    ctx.fillStyle = '#272b31';
    rrect(ctx, -gw, z0 + 0.035, 2 * gw, p.van ? 0.05 : 0.085, 0.018); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    for (let k = 0; k < (p.van ? 2 : 3); k++) ctx.fillRect(-gw + 0.02, z0 + 0.05 + k * 0.024, 2 * gw - 0.04, 0.007);
    for (const sd of SIDES) {
      const v0 = sd > 0 ? sv - lw - 0.005 : -sv + 0.005;
      ctx.fillStyle = '#c9d0d7';
      rrect(ctx, v0 - 0.006, z0 + 0.029, lw + 0.012, 0.062, 0.02); ctx.fill();
      ctx.fillStyle = '#fff6cf';
      rrect(ctx, v0, z0 + 0.035, lw, 0.05, 0.016); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      rrect(ctx, v0 + 0.01, z0 + 0.06, lw * 0.4, 0.016, 0.008); ctx.fill();
    }
  }
  topFace(ctx, V, p, hex, 0.28);
  // Fensteraufbau
  const r = p.roof;
  frustum(ctx, V, p.ghB, r.pts, p.z1, r.z1, hex, cabGlass);
  topFace(ctx, V, r, hex, 0.3);
  setLocal(ctx, V, r.z1);
  if (p.van) {
    ctx.beginPath();
    for (let u = r.x0 + 0.07; u < r.x1 - 0.04; u += 0.07) { ctx.moveTo(u, r.y0 + 0.05); ctx.lineTo(u, r.y1 - 0.05); }
    ctx.lineWidth = 0.012; ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.stroke();
  } else if (!p.defl) {
    // Sonnenblende mit Positionsleuchten, Dachluke
    ctx.fillStyle = shade(hex, -0.3);
    rrect(ctx, r.x1 - 0.045, r.y0 + 0.04, 0.035, r.y1 - r.y0 - 0.08, 0.012); ctx.fill();
    ctx.fillStyle = '#ffb726';
    for (const v of [-0.2, -0.07, 0.07, 0.2]) { rrect(ctx, r.x1 - 0.04, v - 0.018, 0.025, 0.036, 0.01); ctx.fill(); }
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    rrect(ctx, r.x0 + 0.06, -0.09, 0.12, 0.18, 0.03); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    rrect(ctx, r.x0 + 0.075, -0.075, 0.09, 0.05, 0.02); ctx.fill();
  }
  if (p.defl) {
    const f = p.defl;
    frustum(ctx, V, p.defB, f.pts, r.z1, f.z1, hex, deflDeco);
    topFace(ctx, V, f, hex, 0.32);
    setLocal(ctx, V, f.z1);
    ctx.fillStyle = '#ffb726';
    for (const v of [-0.18, 0, 0.18]) { rrect(ctx, f.x1 - 0.035, v - 0.016, 0.022, 0.032, 0.01); ctx.fill(); }
  }
  if (VSTYLE.snow || VSTYLE.beacon) {
    const top = p.defl || r;
    setLocal(ctx, V, top.z1);
    if (VSTYLE.snow) snowCap(ctx, top.x0 + 0.03, top.x1 - 0.05, top.y0 + 0.03, top.y1 - 0.03);
    if (VSTYLE.beacon) {
      const bu = (top.x0 + top.x1) / 2 - 0.02;
      ctx.fillStyle = '#7a3c00';
      rrect(ctx, bu - 0.05, -0.05, 0.1, 0.1, 0.03); ctx.fill();
      ctx.fillStyle = '#ff9a10';
      ctx.beginPath(); ctx.arc(bu, 0, 0.042, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffe9a0';
      ctx.beginPath(); ctx.arc(bu - 0.012, -0.012, 0.016, 0, TAU); ctx.fill();
    }
  }
  drawMirror(ctx, V, p, nearSd);
}

// Schneehaube (lokale Dachkoordinaten u, v)
function snowCap(ctx, u0, u1, v0, v1) {
  ctx.fillStyle = '#c9dcef';
  rrect(ctx, u0 + 0.01, v0 + 0.015, u1 - u0, v1 - v0, 0.07); ctx.fill();
  ctx.fillStyle = '#ffffff';
  rrect(ctx, u0, v0, u1 - u0, v1 - v0, 0.07); ctx.fill();
  ctx.fillStyle = 'rgba(160,190,225,0.35)';
  rrect(ctx, u0 + 0.03, v0 + (v1 - v0) * 0.55, u1 - u0 - 0.06, (v1 - v0) * 0.3, 0.05); ctx.fill();
}
// Staub/Schlamm am unteren Rand einer Seitenwand (Koordinaten u, z)
function dustBand(ctx, u0, u1, z0, z1) {
  const h = (z1 - z0) * 0.45;
  const g = ctx.createLinearGradient(0, z0, 0, z0 + h);
  g.addColorStop(0, VSTYLE.dust);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha *= 0.55;
  ctx.fillStyle = g;
  ctx.fillRect(u0 + 0.02, z0, u1 - u0 - 0.04, h);
  ctx.globalAlpha /= 0.55;
}

function arrowPath(ctx, ax, av, la, wa) {
  const t = ax + la / 2, b = ax - la / 2, hb = t - Math.min(la * 0.48, wa * 0.95), sw = wa * 0.21;
  ctx.beginPath();
  ctx.moveTo(t, av);
  ctx.lineTo(hb, av - wa / 2); ctx.lineTo(hb, av - sw); ctx.lineTo(b, av - sw);
  ctx.lineTo(b, av + sw); ctx.lineTo(hb, av + sw); ctx.lineTo(hb, av + wa / 2);
  ctx.closePath();
}

function drawBadge(ctx, V, u, z, ci) {
  setWorld(ctx, V);
  pp(V, u, 0, z);
  const cell = V.cell;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (ci < 0) {
    const r = 0.25 * cell;
    ctx.beginPath(); ctx.arc(PX, PY, r, 0, TAU);
    ctx.fillStyle = 'rgba(45,50,58,0.55)'; ctx.fill();
    ctx.font = `900 ${Math.round(0.46 * cell)}px system-ui, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText('?', PX, PY + 0.02 * cell);
  } else {
    const col = COLORS[ci] || COLORS[0], r = 0.16 * cell;
    ctx.beginPath(); ctx.arc(PX, PY + 0.025 * cell, r, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill();
    ctx.beginPath(); ctx.arc(PX, PY, r, 0, TAU);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = Math.max(1, 0.025 * cell); ctx.strokeStyle = col.dark; ctx.stroke();
    ctx.font = `bold ${Math.round(0.22 * cell)}px system-ui, "Segoe UI Symbol", sans-serif`;
    ctx.fillStyle = col.dark;
    ctx.fillText(col.symbol, PX, PY + 0.01 * cell);
  }
}

// Seitenwand des Aufbaus (Koordinaten u, z): Koffer mit Paneelfugen bzw. Plane mit Gurten
function cargoSide(ctx, p, hex, isBox) {
  const z0 = p.z0, z1 = p.z1, a = p.x0 + 0.05, b = p.x1 - 0.05, h = z1 - z0;
  if (isBox) {
    // Paneelfugen
    const k = Math.max(2, Math.round((b - a) / 0.26)), st = (b - a) / k;
    ctx.fillStyle = shade(hex, -0.3);
    for (let i = 1; i < k; i++) ctx.fillRect(a + i * st - 0.004, z0 + 0.04, 0.008, h - 0.065);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    for (let i = 1; i < k; i++) ctx.fillRect(a + i * st + 0.004, z0 + 0.04, 0.007, h - 0.065);
    // Zierstreifen
    ctx.fillStyle = VSTYLE.stripe || 'rgba(255,255,255,0.85)';
    ctx.fillRect(a, z0 + h * 0.62, b - a, VSTYLE.stripe ? 0.03 : 0.014);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(a, z0 + h * 0.62 - 0.022, b - a, 0.007);
  } else {
    // Planengurte mit Spannschlössern
    const k = Math.max(2, Math.round((b - a) / 0.19)), st = (b - a) / k;
    ctx.fillStyle = shade(hex, -0.32);
    for (let i = 0; i < k; i++) ctx.fillRect(a + (i + 0.5) * st - 0.011, z0 + 0.03, 0.022, h - 0.045);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < k; i++) ctx.fillRect(a + (i + 0.5) * st + 0.011, z0 + 0.03, 0.006, h - 0.045);
    ctx.fillStyle = '#dfe4e9';
    for (let i = 0; i < k; i++) { rrect(ctx, a + (i + 0.5) * st - 0.015, z0 + 0.038, 0.03, 0.03, 0.006); ctx.fill(); }
    // Planenkante oben
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(a - 0.02, z1 - 0.034, b - a + 0.04, 0.008);
    if (VSTYLE.stripe) {
      ctx.fillStyle = VSTYLE.stripe;
      ctx.fillRect(a, z0 + h * 0.2, b - a, 0.03);
    }
  }
  if (VSTYLE.dust) dustBand(ctx, p.x0, p.x1, z0, z1);
  // Unterfahrschutz / Alu-Rahmen unten mit Seitenmarkierung
  ctx.fillStyle = '#c9d0d7';
  ctx.fillRect(p.x0 + 0.03, z0, p.x1 - p.x0 - 0.06, 0.03);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(p.x0 + 0.03, z0 + 0.03, p.x1 - p.x0 - 0.06, 0.005);
  ctx.fillStyle = '#ffa31a';
  for (let u = p.x0 + 0.25; u < p.x1 - 0.15; u += 0.55) { rrect(ctx, u, z0 + 0.007, 0.035, 0.016, 0.006); ctx.fill(); }
}

// Rückwand (Koordinaten v, z): Türen, Verschlussstangen, Leuchten
function cargoRear(ctx, p, hex, isRear) {
  const z0 = p.z0, z1 = p.z1, hw = p.y1 - p.rb;
  ctx.fillStyle = '#d3d9df';
  ctx.fillRect(-hw, z0, 2 * hw, 0.03);
  ctx.fillRect(-hw, z1 - 0.03, 2 * hw, 0.03);
  ctx.fillStyle = shade(hex, -0.35);
  ctx.fillRect(-0.005, z0 + 0.03, 0.01, z1 - z0 - 0.06);
  ctx.fillStyle = '#e4e8ec';
  for (const v of [-0.27, -0.1, 0.1, 0.27]) ctx.fillRect(v - 0.008, z0 + 0.035, 0.016, z1 - z0 - 0.07);
  ctx.fillStyle = '#8f98a2';
  for (const v of [-0.27, -0.1, 0.1, 0.27]) ctx.fillRect(v - 0.02, z0 + (z1 - z0) * 0.45, 0.04, 0.014);
  if (isRear) tailLights(ctx, p);
}
// Rückleuchten und Unterfahrschutz unter dem Heck (Koordinaten v, z)
function tailLights(ctx, p) {
  const z0 = p.z0, hw = p.y1 - p.rb;
  for (const sd of SIDES) {
    const v0 = sd > 0 ? hw - 0.1 : -hw + 0.01;
    ctx.fillStyle = '#8c0d18';
    rrect(ctx, v0 - 0.004, z0 - 0.034, 0.098, 0.05, 0.012); ctx.fill();
    ctx.fillStyle = '#ff2a2a';
    rrect(ctx, v0, z0 - 0.03, 0.055, 0.042, 0.01); ctx.fill();
    ctx.fillStyle = '#ffa31a';
    rrect(ctx, v0 + 0.06, z0 - 0.03, 0.03, 0.042, 0.008); ctx.fill();
  }
  ctx.fillStyle = '#353a41';
  ctx.fillRect(-hw + 0.12, z0 - 0.06, 2 * hw - 0.24, 0.03);
}

// Plane/Koffer geschlossen
function drawCargo(ctx, V, p, c, o, g) {
  const cell = V.cell, hex = c.tarp[p.comp], hw = p.y1, d = (p.z1 - p.z0) * cell, isBox = p.style === 'box';
  const len = p.x1 - p.x0;
  const n = projW(ctx, V, p.pts, p.z1);
  sideFill(ctx, n, d, hex);
  edgeStroke(ctx, cell, hex);
  sideGloss(ctx, d, cell);
  for (const sd of SIDES) {
    if (sd * V.ca < 0.08) continue;
    planeU(ctx, V, sd * hw);
    cargoSide(ctx, p, hex, isBox);
  }
  if (-V.sa > 0.08) { planeV(ctx, V, p.x0); cargoRear(ctx, p, hex, p === g.rear); }
  // Dach
  topFace(ctx, V, p, hex, 0.32);
  const rs = isBox ? 0.26 : 0.19;
  ctx.beginPath();
  for (let u = p.x0 + rs * 0.7; u < p.x1 - 0.06; u += rs) { ctx.moveTo(u, -hw + 0.03); ctx.lineTo(u, hw - 0.03); }
  ctx.lineWidth = isBox ? 0.01 : 0.022; ctx.strokeStyle = isBox ? 'rgba(0,0,0,0.07)' : shade(hex, -0.1); ctx.stroke();
  // Glanz
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  rrect(ctx, p.x0 + 0.08, -hw * 0.72, len - 0.16, hw * 0.2, 0.04); ctx.fill();
  if (VSTYLE.snow) {
    snowCap(ctx, p.x0 + 0.04, p.x1 - 0.04, -hw + 0.02, -hw + 0.12);
    snowCap(ctx, p.x0 + 0.04, p.x1 - 0.04, hw - 0.12, hw - 0.02);
  }
  // Markierungsleuchten
  if (p === g.rear) {
    ctx.fillStyle = '#e01b2e';
    rrect(ctx, p.x0 + 0.012, -hw + 0.03, 0.026, 0.05, 0.01); ctx.fill();
    rrect(ctx, p.x0 + 0.012, hw - 0.08, 0.026, 0.05, 0.01); ctx.fill();
  }
  // Pfeil und Abzeichen
  const badge = c.hidden || o.symbols;
  const arrow = o.arrow !== false;
  if (arrow) {
    const avail = len - 0.2 - (badge ? (c.hidden ? 0.52 : 0.42) : 0);
    const la = Math.min(1.05, Math.max(0.3, avail)), wa = Math.min(0.48, la * 0.85);
    const ax = badge ? p.x1 - 0.1 - la / 2 : (p.x0 + p.x1) / 2;
    ctx.lineJoin = 'round';
    arrowPath(ctx, ax + V.sa * 0.03, V.ca * 0.03, la, wa);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fill();
    ctx.lineWidth = 0.035; ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.stroke();
    arrowPath(ctx, ax, 0, la, wa);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.stroke();
  }
  if (badge) drawBadge(ctx, V, arrow ? p.x0 + (c.hidden ? 0.29 : 0.24) : (p.x0 + p.x1) / 2, p.z1, c.hidden ? -1 : c.sym[p.comp]);
}

// Rahmenteile des offenen Aufbaus (einmal pro Teil berechnet)
function openParts(p) {
  if (p._op) return p._op;
  const L = [], hw = HW, z0 = p.z0, z1 = p.z1, xr = p.x0 + 0.04, xh = p.x1 - 0.045;
  L.push(box('head', xh, p.x1, -hw, hw, z0, z1 + 0.006, 0.02, 0.01));
  L.push(box('alu', p.x0, xr, -hw, -hw + 0.045, z0, z1, 0.01));
  L.push(box('alu', p.x0, xr, hw - 0.045, hw, z0, z1, 0.01));
  L.push(box('alu', p.x0, xr, -hw, hw, z1 - 0.03, z1, 0.01));
  const span = xh - xr, k = Math.max(1, Math.round(span / 0.5));
  for (let i = 1; i < k; i++) {
    const x = xr + (span * i) / k;
    for (const sd of SIDES) {
      L.push(box('alu', x - 0.018, x + 0.018, sd < 0 ? -hw : hw - 0.034, sd < 0 ? -hw + 0.034 : hw, z0, z1 - 0.004, 0.008));
    }
  }
  for (const sd of SIDES) {
    L.push(box('alu', xr, xh, sd < 0 ? -hw : hw - 0.03, sd < 0 ? -hw + 0.03 : hw, z1 - 0.022, z1, 0.008));
  }
  return (p._op = L);
}

const OPEN_ITEMS = [];
// Plane offen: Ladeboden, Rungen, Paletten
function drawCargoOpen(ctx, V, p, c, o, g) {
  const cell = V.cell, hex = c.tarp[p.comp], hw = p.y1, z0 = p.z0, z1 = p.z1;
  const open = Math.min(1, Math.max(0, +o.open || 0));
  const sl = g.slots[p.comp];
  // Ladeboden
  const n = projW(ctx, V, p.pts, z0);
  const fd = 0.05 * cell;
  sideFill(ctx, n, fd, '#6a737d');
  sideGloss(ctx, fd, cell, 1.4);
  if (-V.sa > 0.08 && p === g.rear) { planeV(ctx, V, p.x0); tailLights(ctx, p); }
  setLocal(ctx, V, z0);
  path(ctx, p.pts);
  ctx.fillStyle = '#d5dbe1'; ctx.fill();
  const pw = (2 * hw - 0.06) / 9;
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = i % 2 ? '#b07f4f' : '#bd8d5c';
    ctx.fillRect(p.x0 + 0.03, -hw + 0.03 + i * pw + 0.004, p.x1 - p.x0 - 0.06, pw - 0.008);
  }
  ctx.beginPath();
  for (let u = p.x0 + 0.25; u < p.x1 - 0.1; u += 0.5) { ctx.moveTo(u, -hw + 0.03); ctx.lineTo(u, hw - 0.03); }
  ctx.lineWidth = 0.008; ctx.strokeStyle = 'rgba(70,40,15,0.3)'; ctx.stroke();
  // Elemente sammeln und nach Bildschirmtiefe sortieren
  const items = OPEN_ITEMS;
  items.length = 0;
  for (const q of openParts(p)) { q._k = V.sa * (q.x0 + q.x1) * 0.5 + V.ca * (q.y0 + q.y1) * 0.5; items.push(q); }
  const xh = p.x1 - 0.045;
  const xb = xh - Math.max(0.08, (1 - open) * (xh - p.x0));
  const tarp = box('tarp', xb, xh, -hw + 0.006, hw - 0.006, z0, z1 + 0.012, 0.02, 0.025);
  tarp._k = V.sa * (xb + xh) * 0.5;
  items.push(tarp);
  const ld = o.load && o.load[p.comp];
  const loaded = ld ? Math.min(sl.cap, ld.loaded ?? ld.n ?? 0) : 0;
  if (loaded > 0) {
    const half = sl.cap / 2;
    for (let k = 0; k < half && k < loaded; k++) {
      const q = slotLocal(sl, k + 1);
      if (q.u + sl.s / 2 > xb + 0.01) continue; // unter der Plane
      items.push({ k: 'stack', u: q.u, v: q.v, two: half + k + 1 <= loaded, _k: V.sa * q.u + V.ca * q.v });
    }
  }
  items.sort((a, b) => a._k - b._k);
  const pc = ld ? ld.color : 0;
  const pcov = ld ? !!ld.covered : false;
  const spx = sl.s * cell;
  for (const it of items) {
    if (it.k === 'stack') {
      setWorld(ctx, V);
      pp(V, it.u, it.v, z0);
      const x = PX, y = PY - PAL_H * spx;
      palletBody(ctx, x, y, spx, pc, V.ang, pcov, !!o.symbols, false);
      if (it.two) palletBody(ctx, x, y - PAL_H * spx, spx, pc, V.ang, pcov, !!o.symbols, true);
    } else if (it.k === 'tarp') {
      drawBunch(ctx, V, it, hex);
    } else if (it.k === 'head') {
      solid(ctx, V, it, hex, { rim: 0.3 });
    } else {
      solid(ctx, V, it, '#c4ccd4', { top: '#e9edf1', rim: 0.2, gloss: 1.2, edge: -0.3 });
    }
  }
}

// Zusammengeschobene Plane (Falten)
function drawBunch(ctx, V, t, hex) {
  const d = (t.z1 - t.z0) * V.cell;
  const n = projW(ctx, V, t.pts, t.z1);
  sideFill(ctx, n, d, hex);
  edgeStroke(ctx, V.cell, hex);
  sideGloss(ctx, d, V.cell);
  setLocal(ctx, V, t.z1);
  const hw = t.y1;
  path(ctx, t.pts); ctx.fillStyle = shade(hex, 0.25); ctx.fill();
  path(ctx, inset(t)); ctx.fillStyle = shade(hex, 0.04); ctx.fill();
  const fold = Math.min(0.14, t.x1 - t.x0);
  ctx.beginPath();
  for (let u = t.x0 + 0.012; u < t.x0 + fold; u += 0.026) { ctx.moveTo(u, -hw + 0.01); ctx.lineTo(u, hw - 0.01); }
  ctx.lineWidth = 0.012; ctx.strokeStyle = shade(hex, -0.25); ctx.stroke();
  ctx.beginPath();
  for (let u = t.x0 + 0.024; u < t.x0 + fold; u += 0.026) { ctx.moveTo(u, -hw + 0.01); ctx.lineTo(u, hw - 0.01); }
  ctx.lineWidth = 0.008; ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.stroke();
  if (t.x1 - t.x0 > 0.25) {
    ctx.beginPath();
    for (let u = t.x0 + fold + 0.15; u < t.x1 - 0.05; u += 0.3) { ctx.moveTo(u, -hw + 0.025); ctx.lineTo(u, hw - 0.025); }
    ctx.lineWidth = 0.014; ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.stroke();
  }
}

// ---------- Gesamtfahrzeug ----------
const W_FAR = [], W_NEAR = [], P_ORDER = [];
const byK = (a, b) => a._k - b._k;
function sorted(list, V, out) {
  out.length = 0;
  for (const p of list) { p._k = V.sa * (p.x0 + p.x1) * 0.5 + V.ca * (p.y0 + p.y1) * 0.5; out.push(p); }
  out.sort(byK);
  return out;
}

function renderBody(ctx, V, g, o, c) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  // Räder: abgewandte zuerst, zugewandte (seitlich sichtbare) nach dem Aufbau
  W_FAR.length = 0; W_NEAR.length = 0;
  for (const w of g.wheels) {
    const vis = w.sd * V.ca;
    w._k = V.sa * w.x + V.ca * w.vo;
    if (vis > 0.35) W_NEAR.push(w);
    else if (vis > -0.3) W_FAR.push(w);
  }
  W_FAR.sort(byK);
  for (const w of W_FAR) drawWheel(ctx, V, w, w.sd * V.ca > 0.05);
  for (const p of g.low) drawLow(ctx, V, p);
  const open = +o.open || 0;
  for (const p of sorted(g.parts, V, P_ORDER)) {
    switch (p.k) {
      case 'cab': drawCab(ctx, V, p, c); break;
      case 'cargo': if (open > 0) drawCargoOpen(ctx, V, p, c, o, g); else drawCargo(ctx, V, p, c, o, g); break;
      case 'bumper': drawBumper(ctx, V, p); break;
      case 'tank': drawTank(ctx, V, p); break;
      case 'stack': drawStack(ctx, V, p); break;
    }
  }
  W_NEAR.sort(byK);
  for (const w of W_NEAR) drawWheel(ctx, V, w, true);
  setWorld(ctx, V);
}

function drawVehShadow(ctx, V, g, lift) {
  const cell = V.cell;
  // Kontaktschatten direkt unter dem Fahrzeug, leicht nach rechts unten (Licht oben links).
  // Weiche Kante durch gestaffelte, wachsende Flächen (kein shadowBlur).
  const a = 0.2 * (1 - 0.55 * lift), sp = 1 + 2.5 * lift, hl = g.hl;
  const n = lift > 0.02 ? 9 : 4;
  ctx.fillStyle = `rgba(0,0,0,${1 - Math.pow(1 - a, 1 / n)})`;
  for (let i = 0; i < n; i++) {
    const k = (-0.035 + (0.09 * i) / (n - 1)) * sp;
    setLocal(ctx, V, 0, (0.025 + lift * 0.3) * cell, (0.03 + lift * 0.4) * cell);
    ctx.scale((hl + k) / hl, (0.45 + k) / 0.45);
    path(ctx, g.outline);
    ctx.fill();
  }
}

function drawUnderGlow(ctx, V, g, col) {
  setLocal(ctx, V, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = col;
  for (const [k, a] of [[0.34, 0.16], [0.2, 0.22], [0.08, 0.3]]) {
    ctx.globalAlpha = a;
    ctx.save();
    ctx.scale((g.hl + k) / g.hl, (0.45 + k) / 0.45);
    path(ctx, g.outline);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawGlow(ctx, V, g, h, front) {
  const n = projW(ctx, V, g.outline, ZT);
  setWorld(ctx, V);
  hullPath(ctx, n, ZT * V.cell);
  ctx.lineJoin = 'round';
  if (!front) {
    ctx.lineWidth = 0.36 * V.cell; ctx.strokeStyle = `rgba(255,214,60,${0.35 * h})`; ctx.stroke();
    ctx.lineWidth = 0.18 * V.cell; ctx.strokeStyle = `rgba(255,240,150,${0.6 * h})`; ctx.stroke();
  } else {
    ctx.lineWidth = Math.max(1, 0.05 * V.cell); ctx.strokeStyle = `rgba(255,255,255,${0.9 * h})`; ctx.stroke();
  }
}

function glow(ctx, V, u, v, z, rgb, rad, a) {
  pp(V, u, v, z);
  const gr = ctx.createRadialGradient(PX, PY, 0, PX, PY, rad);
  gr.addColorStop(0, `rgba(${rgb},${a})`);
  gr.addColorStop(0.2, `rgba(${rgb},${a * 0.7})`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = gr;
  ctx.fillRect(PX - rad, PY - rad, 2 * rad, 2 * rad);
  ctx.beginPath(); ctx.arc(PX, PY, rad * 0.16, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,240,0.95)'; ctx.fill();
}

function drawLights(ctx, V, g, o) {
  const ind = o.indicator || 0;
  const blink = ind !== 0 && performance.now() % 760 < 400;
  const head = VSTYLE.lights || 0;
  if (!o.brake && !o.reverse && !blink && !head) return;
  setWorld(ctx, V);
  const cell = V.cell, r = g.rear, cab = g.cab;
  if (head) {
    // Lichtkegel vor dem Fahrzeug und leuchtende Scheinwerfer
    ctx.globalCompositeOperation = 'lighter';
    for (const sd of SIDES) {
      pp(V, cab.x1 + 0.55, sd * 0.22, 0);
      const bx = PX, by = PY;
      const gr = ctx.createRadialGradient(bx, by, 0, bx, by, 0.75 * cell);
      gr.addColorStop(0, `rgba(255,236,170,${0.32 * head})`);
      gr.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(bx - cell, by - cell, 2 * cell, 2 * cell);
    }
    if (V.sa > 0.05) for (const sd of SIDES) glow(ctx, V, cab.x1, sd * (cab.y1 - 0.1), cab.z0 + 0.06, '255,246,210', 0.2 * cell, 0.8 * head);
    ctx.globalCompositeOperation = 'source-over';
  }
  const rearVis = -V.sa > 0.05;
  const rz = rearVis ? r.z0 - 0.01 : ZT - 0.004, rx = rearVis ? r.x0 : r.x0 + 0.03;
  ctx.globalCompositeOperation = 'lighter';
  if (o.brake) for (const sd of SIDES) glow(ctx, V, rx, sd * (HW - 0.08), rz, '255,30,25', 0.26 * cell, 0.95);
  if (o.reverse) for (const sd of SIDES) glow(ctx, V, rx, sd * (HW - 0.16), rz, '255,255,235', 0.22 * cell, 0.85);
  if (blink) {
    const sd = ind > 0 ? 1 : -1;
    glow(ctx, V, rx, sd * (HW - 0.03), rz, '255,160,10', 0.24 * cell, 0.95);
    const frontVis = V.sa > 0.05;
    glow(ctx, V, cab.x1 - (frontVis ? 0 : 0.02), sd * (cab.y1 - 0.04), frontVis ? cab.z0 + 0.06 : cab.z1 - 0.004, '255,160,10', 0.24 * cell, 0.95);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function colorsFor(o) {
  const hidden = !!o.hidden;
  const i0 = o.colorIndex ?? indexOf(o.color ?? 0);
  const i1 = o.color2Index ?? (o.color2 != null ? indexOf(o.color2) : i0);
  const h0 = hexOf(o.color ?? 0), h1 = o.color2 != null ? hexOf(o.color2) : h0;
  return {
    hidden,
    cab: hidden ? GREY_CAB : shade(h0, -0.06),
    tarp: hidden ? [GREY_TARP, GREY_TARP] : [h0, h1],
    sym: [i0, i1],
  };
}

// ---------- Sprite-Cache ----------
function newCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const SPRITES = new Map();
const SPRITE_MAX = 72;
const SCR = [null, null];
const SPR_TOP = 0.12;       // Platz über dem Dach (Auspuff, Spoiler)
const SPR_BOT = 0.06;       // Platz unter dem Boden
function scratch(i, w, h) {
  let cv = SCR[i];
  if (!cv || cv.width < w || cv.height < h) {
    cv = SCR[i] = newCanvas(Math.max(w, cv ? cv.width : 0), Math.max(h, cv ? cv.height : 0));
  }
  const x = cv.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.clearRect(0, 0, cv.width, cv.height);
  return cv;
}
function spriteSize(g, cell, scale) {
  const R = (g.hl + 0.18) * cell;
  return [Math.ceil(2 * R * scale) + 2, Math.ceil((2 * R + (SPR_TOP + ZT + SPR_BOT) * cell) * scale) + 2];
}

function renderSprite(cv, o, g, c, scale, ang) {
  const cell = o.cell, R = (g.hl + 0.18) * cell, top = R + SPR_TOP * cell;
  const [w, h] = spriteSize(g, cell, scale);
  if (!cv) cv = newCanvas(w, h);
  else if (cv.width < w || cv.height < h) cv = scratch(0, w, h);
  const x = cv.getContext('2d');
  const V = {
    m: { a: scale, b: 0, c: 0, d: scale, e: 0, f: 0 },
    cx: R + 1 / scale, cy: top + 1 / scale, ca: Math.cos(ang), sa: Math.sin(ang), ang, cell,
  };
  renderBody(x, V, g, o, c);
  return { cv, ox: V.cx * scale, oy: V.cy * scale, w, h };
}

function blit(ctx, spr, V, M, squash, flash) {
  let src = spr.cv;
  if (flash > 0) {
    const cv = scratch(1, spr.w, spr.h), x = cv.getContext('2d');
    x.drawImage(spr.cv, 0, 0, spr.w, spr.h, 0, 0, spr.w, spr.h);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = `rgba(255,25,25,${Math.min(1, flash) * 0.72})`;
    x.fillRect(0, 0, spr.w, spr.h);
    x.globalCompositeOperation = 'source-over';
    src = cv;
  }
  const dx = M.a * V.cx + M.e, dy = M.d * V.cy + M.f;
  if (squash) {
    const sx = 1 + 0.07 * squash, sy = 1 - 0.1 * squash, gy = dy + ZT * V.cell * M.d;
    ctx.setTransform(sx, 0, 0, sy, dx - sx * dx, gy - sy * gy);
  } else ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(src, 0, 0, spr.w, spr.h, Math.round(dx - spr.ox), Math.round(dy - spr.oy), spr.w, spr.h);
}

function loadKey(load) {
  let k = '|open';
  if (load) for (const l of load) k += l ? `|${l.color}.${l.loaded ?? l.n ?? 0}.${l.covered ? 1 : 0}` : '|-';
  return k;
}

// ---------- Öffentlich: Fahrzeug ----------
export function drawVehicle(ctx, o) {
  const g = geom(o.size || 'M');
  const cell = o.cell;
  const alpha = o.alpha ?? 1;
  if (!(alpha > 0) || !(cell > 0)) return;
  const lift = o.lift || 0, squash = o.squash || 0, flash = o.flash || 0;
  const open = o.open === true ? 1 : +o.open || 0;
  const ang = o.angle || 0;
  const oo = open === o.open ? o : Object.assign({}, o, { open });
  const M = ctx.getTransform();
  const ga = ctx.globalAlpha;
  const V = {
    m: { a: M.a, b: M.b, c: M.c, d: M.d, e: M.e, f: M.f },
    cx: o.x, cy: o.y, ca: Math.cos(ang), sa: Math.sin(ang), ang, cell,
  };
  ctx.globalAlpha = ga * alpha;
  drawVehShadow(ctx, V, g, lift);
  if (VSTYLE.glow && !o.hidden) drawUnderGlow(ctx, V, g, VSTYLE.glow);
  const hl = o.highlight || 0;
  const pulse = hl > 0 ? Math.min(1, hl) * (0.8 + 0.2 * Math.sin(performance.now() * 0.008)) : 0;
  if (pulse > 0) drawGlow(ctx, V, g, pulse, false);
  V.cy = o.y - lift * 0.42 * cell;
  const c = colorsFor(oo);
  const axis = Math.abs(M.b) < 1e-9 && Math.abs(M.c) < 1e-9 && Math.abs(M.a - M.d) < 1e-9 && M.a > 0;
  let done = false;
  if (axis) {
    const q = Math.round(ang / Q8);
    // geschlossen oder ganz offen (Dock) auf 45°-Raster → Sprite; offen inkl. Ladungszustand im Schlüssel
    const cacheable = (open <= 0 || open >= 1) && Math.abs(ang - q * Q8) < 1e-4;
    if (cacheable || flash > 0 || alpha < 1) {
      let spr;
      if (cacheable) {
        const key = `${g.size}|${c.tarp[0]}|${c.tarp[1]}|${c.sym[0]}|${c.sym[1]}|${c.hidden}|${o.arrow !== false}|${!!o.symbols}|${cell}|${((q % 8) + 8) % 8}|${M.a}${VKEY}${open > 0 ? loadKey(o.load) : ''}`;
        spr = SPRITES.get(key);
        if (spr) { SPRITES.delete(key); SPRITES.set(key, spr); }
        else {
          spr = renderSprite(null, oo, g, c, M.a, ang);
          SPRITES.set(key, spr);
          if (SPRITES.size > SPRITE_MAX) SPRITES.delete(SPRITES.keys().next().value);
        }
      } else {
        const [w, h] = spriteSize(g, cell, M.a);
        spr = renderSprite(scratch(0, w, h), oo, g, c, M.a, ang);
      }
      blit(ctx, spr, V, M, squash, flash);
      ctx.setTransform(M);
      done = true;
    }
  }
  if (!done) {
    if (squash) {
      const gx = o.x, gy = V.cy + ZT * cell, sx = 1 + 0.07 * squash, sy = 1 - 0.1 * squash, m = V.m;
      const ex = gx - sx * gx, ey = gy - sy * gy;
      V.m = { a: m.a * sx, b: m.b * sx, c: m.c * sy, d: m.d * sy, e: m.a * ex + m.c * ey + m.e, f: m.b * ex + m.d * ey + m.f };
    }
    renderBody(ctx, V, g, oo, c);
    V.m = { a: M.a, b: M.b, c: M.c, d: M.d, e: M.e, f: M.f };
  }
  drawLights(ctx, V, g, o);
  if (pulse > 0) drawGlow(ctx, V, g, pulse, true);
  ctx.setTransform(M);
  ctx.globalAlpha = ga;
}

// ---------- Paletten ----------
const DECK = rrPts(-0.5, 0.5, -0.5, 0.5, 0.03, 0.03);
const GOODS = rrPts(-0.45, 0.45, -0.45, 0.45, 0.07, 0.07);
const GOODS_IN = rrPts(-0.415, 0.415, -0.415, 0.415, 0.05, 0.05);
const WOOD = '#d9a466';
function projS(x, y, s, ca, sa, pts, zoff) {
  const n = pts.length >> 1;
  for (let i = 0; i < n; i++) {
    const u = pts[2 * i], v = pts[2 * i + 1];
    WX[i] = x + s * (ca * u - sa * v);
    WY[i] = y + zoff + s * (sa * u + ca * v);
  }
  return n;
}

let SHADOW_SPR = null;
function shadowSprite() {
  if (SHADOW_SPR) return SHADOW_SPR;
  const N = 64, cv = newCanvas(N, N), x = cv.getContext('2d');
  const gr = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  gr.addColorStop(0, 'rgba(0,0,0,0.5)');
  gr.addColorStop(0.5, 'rgba(0,0,0,0.38)');
  gr.addColorStop(0.78, 'rgba(0,0,0,0.12)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, N, N);
  return (SHADOW_SPR = cv);
}

// Weicher Bodenschatten einer Palette, (x, y) wie bei drawPallet (Ruheposition)
export function drawPalletShadow(ctx, x, y, s, lift = 0) {
  const w = s * (1.4 + 0.6 * lift);
  const gx = x + s * (0.08 + 0.35 * lift), gy = y + PAL_H * s + s * (0.04 + 0.3 * lift);
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * (1 - 0.5 * lift);
  ctx.drawImage(shadowSprite(), gx - w / 2, gy - w * 0.45, w, w * 0.9);
  ctx.globalAlpha = ga;
}

function palletRaw(ctx, x, y, s, color, angle, covered, symbols, light) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const base = covered ? CARTON : (COLORS[color] || COLORS[0]).hex;
  const hex = light ? shade(base, 0.08) : base;
  const gH = (PAL_H - PAL_WOOD) * s, wH = PAL_WOOD * s;
  const big = s >= 10;
  ctx.lineJoin = 'round';
  // Holzpalette: Seiten mit Klötzen und Einfahröffnungen
  let n = projS(x, y, s, ca, sa, DECK, gH);
  sideFill(ctx, n, wH, WOOD, 0.3);
  if (s >= 9) {
    ctx.fillStyle = '#5e3c1c';
    ctx.beginPath();
    for (let k = CH_N - 1; k > 0; k--) {
      const ax = CHX[k], ay = CHY[k], ex = CHX[k - 1] - ax, ey = CHY[k - 1] - ay;
      if (Math.abs(ex) < s * 0.3) continue;
      for (const [t0, t1] of [[0.16, 0.42], [0.58, 0.84]]) {
        ctx.moveTo(ax + ex * t0, ay + ey * t0 + wH * 0.36);
        ctx.lineTo(ax + ex * t1, ay + ey * t1 + wH * 0.36);
        ctx.lineTo(ax + ex * t1, ay + ey * t1 + wH * 0.82);
        ctx.lineTo(ax + ex * t0, ay + ey * t0 + wH * 0.82);
        ctx.closePath();
      }
    }
    ctx.fill();
    chainStroke(ctx, wH * 0.08, Math.max(0.5, wH * 0.14), 'rgba(255,240,215,0.45)');
  }
  // Holzpalette: Deckbretter (Rand um die Ware)
  ctx.save();
  ctx.translate(x, y + gH);
  ctx.rotate(angle);
  ctx.scale(s, s);
  path(ctx, DECK);
  ctx.fillStyle = '#ecc185';
  ctx.fill();
  if (s >= 9) {
    ctx.fillStyle = 'rgba(120,72,30,0.5)';
    for (const u of [-0.3, -0.1, 0.1, 0.3]) ctx.fillRect(u - 0.012, -0.5, 0.024, 1);
  }
  ctx.restore();
  // Ware: Seiten
  n = projS(x, y, s, ca, sa, GOODS, 0);
  sideFill(ctx, n, gH, hex, 0.3);
  if (big) {
    ctx.save();
    ctx.clip();
    chainStroke(ctx, gH, gH * 0.7, 'rgba(0,0,0,0.1)');
    chainStroke(ctx, gH * 0.1, gH * 0.2, 'rgba(255,255,255,0.18)');
    // Kistenfugen: waagerecht in der Mitte, senkrecht je Fläche
    chainStroke(ctx, gH * 0.5, Math.max(0.6, s * 0.022), covered ? 'rgba(110,70,25,0.35)' : shade(hex, -0.38));
    ctx.beginPath();
    for (let k = CH_N - 1; k > 0; k--) {
      const ex = CHX[k - 1] - CHX[k];
      if (ex < s * 0.3) continue;
      const mx = (CHX[k] + CHX[k - 1]) / 2, my = (CHY[k] + CHY[k - 1]) / 2;
      ctx.moveTo(mx, my); ctx.lineTo(mx, my + gH);
    }
    ctx.lineWidth = covered ? s * 0.11 : Math.max(0.6, s * 0.022);
    ctx.strokeStyle = covered ? '#ecd9a8' : shade(hex, -0.38);
    ctx.stroke();
    // Folienglanz
    if (CH_N > 1) {
      const k = CH_N - 1, ax = CHX[k], ay = CHY[k], bx = CHX[0], by = CHY[0];
      const t0 = 0.16, t1 = 0.26;
      ctx.beginPath();
      ctx.moveTo(ax + (bx - ax) * t0, ay + (by - ay) * t0);
      ctx.lineTo(ax + (bx - ax) * t1, ay + (by - ay) * t1);
      ctx.lineTo(ax + (bx - ax) * (t1 - 0.05), ay + (by - ay) * t1 + gH);
      ctx.lineTo(ax + (bx - ax) * (t0 - 0.05), ay + (by - ay) * t0 + gH);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fill();
    }
    ctx.restore();
  }
  // Ware: Oberseite mit Glanzkante
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(s, s);
  path(ctx, GOODS);
  ctx.fillStyle = shade(hex, 0.32);
  ctx.fill();
  path(ctx, big ? GOODS_IN : GOODS);
  ctx.fillStyle = shade(hex, 0.05);
  ctx.fill();
  if (covered) {
    ctx.fillStyle = '#efdcab';
    ctx.fillRect(-0.42, -0.075, 0.84, 0.15);
    ctx.fillRect(-0.075, -0.42, 0.15, 0.84);
  } else if (s >= 9) {
    ctx.fillStyle = shade(hex, -0.3);
    ctx.fillRect(-0.415, -0.014, 0.83, 0.028);
    ctx.fillRect(-0.014, -0.415, 0.028, 0.83);
    if (s >= 18) {
      ctx.fillStyle = '#f6f6f1';
      ctx.fillRect(0.08, 0.1, 0.13, 0.17);
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.fillRect(0.1, 0.13, 0.09, 0.015);
      ctx.fillRect(0.1, 0.16, 0.06, 0.015);
      ctx.fillRect(0.1, 0.2, 0.09, 0.04);
    }
  }
  // Stretchfolie: weicher Glanz von oben links (Bildschirm)
  ctx.rotate(-angle);
  ctx.fillStyle = grad(ctx, 'film', () => lin(ctx, -0.45, -0.45, 0.45, 0.45,
    [[0, 'rgba(255,255,255,0.3)'], [0.5, 'rgba(255,255,255,0.04)'], [1, 'rgba(255,255,255,0)']]));
  ctx.rotate(angle);
  path(ctx, GOODS); ctx.fill();
  if (big) {
    ctx.rotate(-angle);
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.beginPath();
    ctx.moveTo(-0.36, -0.05); ctx.lineTo(-0.05, -0.36); ctx.lineTo(0.05, -0.36); ctx.lineTo(-0.36, 0.05);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // dezente Kontur in eigener Farbe
  if (s >= 7) {
    n = projS(x, y, s, ca, sa, GOODS, 0);
    hullPath(ctx, n, gH);
    ctx.lineWidth = Math.max(0.5, s * 0.022);
    ctx.strokeStyle = shade(hex, -0.5);
    ctx.stroke();
  }
  // Symbol bzw. Fragezeichen (aufrecht)
  if ((symbols || covered) && s >= 9) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = Math.round(s * (covered ? 0.5 : 0.46));
    ctx.font = `900 ${fs}px system-ui, "Segoe UI Symbol", sans-serif`;
    const t = covered ? '?' : (COLORS[color] || COLORS[0]).symbol;
    ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.strokeStyle = covered ? 'rgba(255,240,210,0.8)' : 'rgba(0,0,0,0.4)';
    ctx.strokeText(t, x, y + s * 0.03);
    ctx.fillStyle = covered ? '#5e3f1c' : '#ffffff';
    ctx.fillText(t, x, y + s * 0.03);
  }
}

const PSPR = new Map();
const PSPR_MAX = 400;
// Palette ohne Schatten; nutzt Sprites bei achsparallelem Kontext und 45°-Winkeln
function palletBody(ctx, x, y, s, color, angle, covered, symbols, light) {
  const M = ctx.getTransform();
  const q = Math.round(angle / Q8);
  if (Math.abs(M.b) < 1e-9 && Math.abs(M.c) < 1e-9 && Math.abs(M.a - M.d) < 1e-9 && M.a > 0 &&
      Math.abs(angle - q * Q8) < 1e-4 && s * M.a < 200) {
    const sd = Math.round(s * M.a * 4) / 4;
    const key = `${color}|${covered}|${symbols}|${light}|${sd}|${((q % 8) + 8) % 8}`;
    let spr = PSPR.get(key);
    if (!spr) {
      const w = Math.ceil(sd * 1.6) + 4, top = Math.ceil(sd * 0.8) + 2, h = top + Math.ceil(sd * (0.8 + PAL_H)) + 2;
      const cv = newCanvas(w, h), x2 = cv.getContext('2d');
      palletRaw(x2, w / 2, top, sd, color, q * Q8, covered, symbols, light);
      spr = { cv, ox: w / 2, oy: top };
      PSPR.set(key, spr);
      if (PSPR.size > PSPR_MAX) PSPR.delete(PSPR.keys().next().value);
    }
    const dx = M.a * x + M.e, dy = M.d * y + M.f;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(spr.cv, Math.round(dx - spr.ox), Math.round(dy - spr.oy));
    ctx.setTransform(M);
    return;
  }
  palletRaw(ctx, x, y, s, color, angle, covered, symbols, light);
}

// Palette mit Ware. (x, y) = Mitte der Oberseite der Ware; die Palette reicht
// palletHeight(s) nach unten. color: 0–7 (≥ 16 = Karton/verdeckt).
export function drawPallet(ctx, x, y, s, color, o = {}) {
  let covered = !!o.covered;
  let c = color | 0;
  if (c >= 16) { covered = true; c &= 15; }
  const ss = s * (o.scale ?? 1), lift = o.lift || 0, alpha = o.alpha ?? 1;
  if (!(ss > 0.5) || !(alpha > 0)) return;
  const ga = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = ga * alpha;
  if (o.shadow !== false) drawPalletShadow(ctx, x, y, ss, lift);
  palletBody(ctx, x, y - lift * 0.8 * ss, ss, c, o.angle || 0, covered, !!o.symbols, !!o.light);
  ctx.globalAlpha = ga;
}
