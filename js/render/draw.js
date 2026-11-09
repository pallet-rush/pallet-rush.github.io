// Zeichenfunktionen (Canvas 2D). Alles wird per Code gezeichnet.
// Perspektive: Draufsicht, Tiefe durch Schatten und sichtbare Seitenfläche.

import { COLORS } from '../core/constants.js';

const GREY = { hex: '#a7aeb6', dark: '#727a83', symbol: '?' };

// Farbe aufhellen (f > 0) oder abdunkeln (f < 0).
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function rr(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

// Palette mit Ladung, Draufsicht. (x,y) = Mitte, s = Kantenlänge.
export function drawPallet(ctx, x, y, s, color, { symbols = false, lift = 0, covered = false } = {}) {
  const c = covered ? { hex: '#c49a62', dark: '#8a6a3f', symbol: '?' } : COLORS[color];
  const h = s / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  rr(ctx, x - h + 1 + lift * 0.3, y - h + 3 + lift, s, s, 3);
  ctx.fill();
  const yy = y - lift;
  ctx.fillStyle = '#b98f58';
  rr(ctx, x - h, yy - h + 2, s, s, 2);
  ctx.fill();
  const b = s * 0.82;
  const bh = b / 2;
  const hgt = Math.max(2, s * 0.22);
  ctx.fillStyle = c.dark;
  rr(ctx, x - bh, yy - bh + 1 - hgt, b, b + hgt - 1, 3);
  ctx.fill();
  ctx.fillStyle = c.hex;
  rr(ctx, x - bh, yy - bh - hgt, b, b - 1, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  rr(ctx, x - bh + 2, yy - bh - hgt + 1.5, b - 4, b * 0.28, 2);
  ctx.fill();
  if (covered) {
    // Klebeband
    ctx.fillStyle = 'rgba(240,225,190,0.9)';
    ctx.fillRect(x - 1.5, yy - bh - 1, 3, b - 1);
  }
  if ((symbols || covered) && s >= 12) {
    ctx.fillStyle = covered ? 'rgba(90,60,25,0.85)' : 'rgba(255,255,255,0.92)';
    ctx.font = `bold ${Math.round(s * 0.5)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.symbol, x, yy - 1);
  }
}

// Aufteilung der Ladefläche in Abteile (lokale x-Koordinaten, +x = vorne).
export function truckSections(L, comps) {
  const cabL = Math.min(26, L * 0.3);
  const x0 = -L / 2;
  const cargoL = L - cabL - 3;
  if (comps.length === 1) return { cabL, list: [{ ci: 0, x: x0, len: cargoL }] };
  // Anhängerzug: vorderes Abteil (0) am Fahrerhaus, Anhänger (1) hinten
  const gap = 5;
  const half = (cargoL - gap) / 2;
  return { cabL, list: [{ ci: 0, x: x0 + half + gap, len: half }, { ci: 1, x: x0, len: half }] };
}

/**
 * LKW zeichnen.
 * o: { x, y, a, L, W, comps, hidden, open, door, flash, symbols, lift, highlight }
 */
export function drawTruck(ctx, o) {
  const { x, y, a, L, W } = o;
  const lift = o.lift || 0;
  const { cabL, list } = truckSections(L, o.comps);
  const cabX = L / 2 - cabL;
  const colOf = (ci) => (o.hidden ? GREY : COLORS[o.comps[ci].color]);

  // Schatten (fällt immer nach unten rechts, beim Kran weiter weg)
  ctx.save();
  ctx.translate(x + 3 + lift * 10, y + 7 + lift * 22);
  ctx.rotate(a);
  ctx.fillStyle = `rgba(0,0,0,${0.2 - lift * 0.08})`;
  rr(ctx, -L / 2, -W / 2, L, W, 6);
  ctx.fill();
  ctx.restore();

  // Seitenfläche (Tiefe): mehrere Lagen nach unten = plastischer Block
  const depth = o.depth ?? 7;
  ctx.save();
  ctx.translate(x, y + depth);
  ctx.rotate(a);
  ctx.fillStyle = '#2b3036';
  rr(ctx, -L / 2, -W / 2, L, W, 7);
  ctx.fill();
  ctx.restore();
  for (let d = depth - 1; d > 0; d -= 2) {
    ctx.save();
    ctx.translate(x, y + d);
    ctx.rotate(a);
    ctx.fillStyle = shade(colOf(0).hex, -0.45);
    rr(ctx, cabX, -W / 2, cabL, W, 7);
    ctx.fill();
    for (const s of list) {
      ctx.fillStyle = colOf(s.ci).dark;
      rr(ctx, s.x, -W / 2, s.len, W, 6);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);

  if (o.highlight > 0) {
    ctx.strokeStyle = `rgba(242,184,31,${o.highlight})`;
    ctx.lineWidth = 4;
    rr(ctx, -L / 2 - 4, -W / 2 - 4, L + 8, W + 8, 9);
    ctx.stroke();
  }

  // Fahrgestell
  ctx.fillStyle = '#4a5058';
  rr(ctx, -L / 2, -W / 2 + 1, L, W - 2, 6);
  ctx.fill();

  // Fahrerhaus in Fahrzeugfarbe, Dach heller
  const cc = colOf(0).hex;
  ctx.fillStyle = shade(cc, -0.12);
  rr(ctx, cabX, -W / 2, cabL, W, 7);
  ctx.fill();
  ctx.fillStyle = shade(cc, 0.35);
  rr(ctx, cabX + 2, -W / 2 + 3, cabL * 0.5, W - 6, 4);
  ctx.fill();
  // Frontscheibe
  ctx.fillStyle = '#25324a';
  rr(ctx, L / 2 - cabL * 0.4, -W / 2 + 2.5, cabL * 0.32, W - 5, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,210,255,0.55)';
  ctx.fillRect(L / 2 - cabL * 0.36, -W / 2 + 4, 2.5, W - 8);
  // Spiegel
  ctx.fillStyle = '#25324a';
  ctx.fillRect(L / 2 - cabL * 0.52, -W / 2 - 3, 3.5, 3.5);
  ctx.fillRect(L / 2 - cabL * 0.52, W / 2 - 0.5, 3.5, 3.5);
  // Scheinwerfer
  ctx.fillStyle = '#fff6c8';
  ctx.fillRect(L / 2 - 2, -W / 2 + 2, 2, 4);
  ctx.fillRect(L / 2 - 2, W / 2 - 6, 2, 4);

  // Kupplung beim Anhängerzug
  if (list.length > 1) {
    ctx.fillStyle = '#2b3036';
    ctx.fillRect(list[1].x + list[1].len - 1, -3, 7, 6);
  }

  // Ladeflächen
  list.forEach((s, k) => {
    const col = colOf(s.ci);
    if (o.open) {
      drawBed(ctx, o.comps[s.ci], s.x, s.len, W);
      if (o.door > 0) drawTarp(ctx, col, s.x, s.len, W, o.door, null);
    } else {
      drawTarp(ctx, col, s.x, s.len, W, 1, { arrow: k === 0, symbol: o.hidden || o.symbols, a: a });
    }
  });

  if (o.flash > 0) {
    ctx.strokeStyle = `rgba(255,90,60,${o.flash})`;
    ctx.lineWidth = 3;
    rr(ctx, -L / 2 - 2, -W / 2 - 2, L + 4, W + 4, 7);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTarp(ctx, col, x0, len, W, frac, deco) {
  const l = len * frac;
  ctx.fillStyle = col.hex;
  rr(ctx, x0, -W / 2, l, W, 5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = x0 + 7; i < x0 + l - 3; i += 7) {
    ctx.moveTo(i, -W / 2 + 2);
    ctx.lineTo(i, W / 2 - 2);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  rr(ctx, x0 + 2, -W / 2 + 2, Math.max(0, l - 4), W * 0.22, 3);
  ctx.fill();
  if (!deco) return;
  if (deco.arrow) {
    const mx = x0 + len * 0.62;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.moveTo(mx + 6, 0);
    ctx.lineTo(mx - 2, -W * 0.22);
    ctx.lineTo(mx - 2, W * 0.22);
    ctx.closePath();
    ctx.fill();
  }
  if (deco.symbol) {
    ctx.save();
    ctx.translate(x0 + len * (deco.arrow ? 0.28 : 0.5), 0);
    ctx.rotate(-deco.a);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = `bold ${Math.round(W * 0.5)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(col.symbol, 0, 1);
    ctx.restore();
  }
}

function bedGrid(len, W, cap) {
  const cols = 2;
  const rows = cap / cols;
  const pad = 3;
  return { cols, rows, pad, cw: (W - pad * 2) / cols, rh: (len - pad * 2) / rows };
}

// Offene Ladefläche mit geladenen Paletten (an der Rampe).
function drawBed(ctx, comp, x0, len, W) {
  ctx.fillStyle = '#6b5641';
  rr(ctx, x0, -W / 2, len, W, 4);
  ctx.fill();
  ctx.strokeStyle = '#584634';
  ctx.lineWidth = 2;
  rr(ctx, x0 + 1, -W / 2 + 1, len - 2, W - 2, 4);
  ctx.stroke();
  const g = bedGrid(len, W, comp.cap);
  const c = COLORS[comp.color];
  for (let i = 0; i < comp.cap; i++) {
    const row = Math.floor(i / g.cols);
    const cc = i % g.cols;
    const px = x0 + len - g.pad - (row + 1) * g.rh;
    const py = -W / 2 + g.pad + cc * g.cw;
    if (i < comp.loaded) {
      ctx.fillStyle = c.dark;
      ctx.fillRect(px + 0.5, py + 0.5, g.rh - 1, g.cw - 1);
      ctx.fillStyle = c.hex;
      ctx.fillRect(px + 0.5, py + 0.5, g.rh - 1.5, g.cw - 2.5);
    } else {
      ctx.fillStyle = c.hex + '22';
      ctx.fillRect(px + 0.5, py + 0.5, g.rh - 1, g.cw - 1);
    }
  }
}

// Position eines Ladeplatzes im lokalen LKW-Koordinatensystem (für die Flug-Animation).
export function bedSlotLocal(L, W, comps, ci, idx) {
  const s = truckSections(L, comps).list.find((q) => q.ci === ci);
  const g = bedGrid(s.len, W, comps[ci].cap);
  const row = Math.floor(idx / g.cols);
  const cc = idx % g.cols;
  return [s.x + s.len - g.pad - (row + 0.5) * g.rh, -W / 2 + g.pad + (cc + 0.5) * g.cw];
}

// Kleines rundes Abzeichen mit Text (Eilauftrag, Kette, Schranke, Tor).
export function badge(ctx, x, y, r, bg, text, fg = '#fff') {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.arc(x + 1, y + 2, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.font = `bold ${Math.round(r * 1.15)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
}

// Vorhängeschloss (Kette).
export function padlock(ctx, x, y, s, color) {
  ctx.strokeStyle = '#2d3138';
  ctx.lineWidth = s * 0.16;
  ctx.beginPath();
  ctx.arc(x, y - s * 0.12, s * 0.26, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = color;
  rr(ctx, x - s * 0.38, y - s * 0.12, s * 0.76, s * 0.6, s * 0.12);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// Schlüssel (für den LKW, der eine Kette öffnet).
export function keyIcon(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x - s * 0.2, y, s * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(x - s * 0.02, y - s * 0.07, s * 0.5, s * 0.14);
  ctx.fillRect(x + s * 0.3, y, s * 0.08, s * 0.2);
  ctx.fillRect(x + s * 0.14, y, s * 0.08, s * 0.16);
}
