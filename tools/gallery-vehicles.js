// Galerie zur Sichtprüfung von js/render/vehicles.js
import { drawVehicle, drawPallet, vehicleSlotScreen } from '../js/render/vehicles.js';
import { SIZES } from '../js/core/constants.js';

const DPR = window.devicePixelRatio || 1;
const out = document.getElementById('out');
const panels = [];

function panel(title, w, h, fn) {
  const hd = document.createElement('h2');
  hd.textContent = title;
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  out.append(hd, cv);
  const p = { cv, w, h, fn };
  panels.push(p);
  render(p);
}

function render(p) {
  const ctx = p.cv.getContext('2d');
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  asphalt(ctx, p.w, p.h);
  p.fn(ctx);
}

// heller Asphalt mit feiner Körnung
function asphalt(ctx, w, h) {
  ctx.fillStyle = '#b8bcc1';
  ctx.fillRect(0, 0, w, h);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < w * h / 40; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)';
    ctx.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
  }
}
function label(ctx, t, x, y) {
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = '#333'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(t, x, y);
}

const ANG = [0, 45, 90, 135, 200];
const TYPES = ['S', 'M', 'L', 'T'];

function typeGrid(cell) {
  const slotW = (5 + 0.4) * cell;
  const rowH = TYPES.map((t) => (SIZES[t].len + 0.4) * cell);
  const H = rowH.reduce((a, b) => a + b, 0) + 30;
  panel(`Typen × Winkel (cell ${cell})`, slotW * ANG.length + 70, H, (ctx) => {
    let y = 20;
    TYPES.forEach((t, r) => {
      label(ctx, t, 6, y + rowH[r] / 2 - 6);
      ANG.forEach((a, i) => {
        const col = (r * 3 + i) % 8;
        drawVehicle(ctx, {
          x: 70 + slotW * i + slotW / 2, y: y + rowH[r] / 2 - 0.12 * cell, angle: (a * Math.PI) / 180, cell, size: t,
          color: col, color2: (col + 3) % 8,
        });
        if (r === 0) label(ctx, a + '°', 70 + slotW * i + 4, 2);
      });
      y += rowH[r];
    });
  });
}

const Z = new URLSearchParams(location.search).get('zoom');
if (Z) {
  const c = +Z || 110;
  panel(`Zoom (cell ${c})`, 1300, c * 4.2, (ctx) => {
    drawVehicle(ctx, { x: 20 + 1.5 * c, y: 0.8 * c, angle: 0, cell: c, size: 'M', color: 0 });
    drawVehicle(ctx, { x: 40 + 5 * c, y: 0.8 * c, angle: 0, cell: c, size: 'S', color: 1, symbols: true });
    drawVehicle(ctx, { x: 20 + 2 * c, y: 2.2 * c, angle: 0, cell: c, size: 'L', color: 3, open: 1, load: [{ color: 4, loaded: 31 }] });
    drawVehicle(ctx, { x: 20 + 2.5 * c, y: 3.5 * c, angle: Math.PI, cell: c, size: 'T', color: 5, color2: 6, brake: true });
    drawVehicle(ctx, { x: 9 * c, y: 2.2 * c, angle: Math.PI / 2, cell: c, size: 'M', color: 2, open: 1, load: [{ color: 1, loaded: 15 }] });
    drawVehicle(ctx, { x: 10.6 * c, y: 2.2 * c, angle: -Math.PI / 2, cell: c, size: 'S', color: 7 });
    drawVehicle(ctx, { x: 8 * c, y: 0.6 * c, angle: 0, cell: c, size: 'S', color: 7, hidden: true });
    drawPallet(ctx, 6.2 * c, 3.0 * c, c * 0.8, 1, { symbols: true });
    drawPallet(ctx, 7.4 * c, 3.0 * c, c * 0.8, 18);
    drawPallet(ctx, 8.6 * c, 3.0 * c, c * 0.8, 5, { angle: 0.5 });
  });
}
typeGrid(22);
typeGrid(48);

panel('Sonderfälle (cell 36): verdeckt, Symbole, ohne Pfeil, Licht', 1300, 470, (ctx) => {
  const c = 36;
  label(ctx, 'hidden', 8, 4);
  drawVehicle(ctx, { x: 90, y: 70, angle: 0, cell: c, size: 'S', color: 0, hidden: true });
  drawVehicle(ctx, { x: 320, y: 70, angle: 0, cell: c, size: 'M', color: 1, hidden: true });
  drawVehicle(ctx, { x: 620, y: 70, angle: 0, cell: c, size: 'L', color: 2, hidden: true });
  drawVehicle(ctx, { x: 1040, y: 70, angle: 0, cell: c, size: 'T', color: 3, color2: 4, hidden: true });
  label(ctx, 'symbols', 8, 130);
  drawVehicle(ctx, { x: 90, y: 190, angle: 0, cell: c, size: 'S', color: 5, symbols: true });
  drawVehicle(ctx, { x: 320, y: 190, angle: 0, cell: c, size: 'M', color: 6, symbols: true });
  drawVehicle(ctx, { x: 620, y: 190, angle: 0, cell: c, size: 'L', color: 7, symbols: true });
  drawVehicle(ctx, { x: 1040, y: 190, angle: 0, cell: c, size: 'T', color: 1, color2: 2, symbols: true });
  label(ctx, 'arrow:false / brake / indicator / reverse', 8, 250);
  drawVehicle(ctx, { x: 120, y: 330, angle: 0, cell: c, size: 'M', color: 4, arrow: false });
  drawVehicle(ctx, { x: 360, y: 340, angle: -Math.PI / 2, cell: c, size: 'M', color: 0, brake: true });
  drawVehicle(ctx, { x: 500, y: 340, angle: Math.PI / 2, cell: c, size: 'M', color: 3, indicator: 1 });
  drawVehicle(ctx, { x: 640, y: 340, angle: -Math.PI / 2, cell: c, size: 'S', color: 6, reverse: true });
  drawVehicle(ctx, { x: 900, y: 340, angle: Math.PI, cell: c, size: 'L', color: 5, brake: true, indicator: -1 });
});

const LOADS = [
  { size: 'S', color: 0, load: [{ color: 2, cap: 8, loaded: 5 }] },
  { size: 'M', color: 1, load: [{ color: 5, cap: 24, loaded: 13 }] },
  { size: 'L', color: 3, load: [{ color: 4, cap: 40, loaded: 31 }] },
  { size: 'T', color: 7, color2: 6, load: [{ color: 7, cap: 8, loaded: 8 }, { color: 6, cap: 8, loaded: 3 }] },
];

panel('Offen beladen (cell 48, open 1) + Slot-Markierungen', 1300, 560, (ctx) => {
  const c = 48;
  let y = 50;
  for (const L of LOADS) {
    const o = { x: 40 + (SIZES[L.size].len * c) / 2, y, angle: 0, cell: c, open: 1, ...L };
    drawVehicle(ctx, o);
    // Markierung: nächster freier Platz
    L.load.forEach((ld, comp) => {
      if (ld.loaded < ld.cap) {
        const p = vehicleSlotScreen(o, comp, ld.loaded + 1);
        drawPallet(ctx, p.x, p.y, p.s, ld.color, { angle: p.angle, alpha: 0.45, shadow: false });
      }
    });
    y += 130;
  }
  const o2 = { x: 900, y: 80, angle: 0, cell: 40, size: 'M', color: 2, open: 0.5, load: [{ color: 1, cap: 24, loaded: 20 }] };
  label(ctx, 'open 0.5', 760, 30);
  drawVehicle(ctx, o2);
});

panel('Offen bei 90° / 270° / 45° (cell 28) – Docksituation', 1300, 330, (ctx) => {
  const c = 28;
  LOADS.forEach((L, i) => {
    drawVehicle(ctx, { x: 70 + i * 110, y: 160, angle: Math.PI / 2, cell: c, open: 1, ...L });
  });
  LOADS.forEach((L, i) => {
    drawVehicle(ctx, { x: 560 + i * 110, y: 160, angle: -Math.PI / 2, cell: c, open: 1, symbols: true, ...L });
  });
  drawVehicle(ctx, { x: 1120, y: 160, angle: Math.PI / 4, cell: c, open: 1, ...LOADS[2] });
});

panel('Effekte (cell 40): highlight, flash, lift, squash, alpha 0.5', 1300, 200, (ctx) => {
  const c = 40, y = 80;
  drawVehicle(ctx, { x: 110, y, angle: 0, cell: c, size: 'M', color: 1, highlight: 1 });
  drawVehicle(ctx, { x: 360, y, angle: 0, cell: c, size: 'M', color: 3, flash: 1 });
  drawVehicle(ctx, { x: 610, y, angle: 0, cell: c, size: 'M', color: 5, lift: 0.7 });
  drawVehicle(ctx, { x: 860, y, angle: 0, cell: c, size: 'M', color: 6, squash: 1 });
  drawVehicle(ctx, { x: 1110, y, angle: 0, cell: c, size: 'M', color: 0, alpha: 0.5 });
});

panel('Paletten: Größen 8 / 13 / 24 / 36, alle Farben, verdeckt, gehoben, gedreht', 1300, 300, (ctx) => {
  const sizes = [8, 13, 24, 36];
  let y = 20;
  sizes.forEach((s) => {
    for (let c = 0; c < 10; c++) {
      const x = 40 + c * Math.max(30, s * 2.2);
      if (c < 8) drawPallet(ctx, x, y, s, c, { symbols: s >= 13 && c % 2 === 1 });
      else if (c === 8) drawPallet(ctx, x, y, s, 2, { covered: true });
      else drawPallet(ctx, x, y + s * 0.3, s, 4, { lift: 0.8 });
    }
    const x0 = 40 + 10 * Math.max(30, s * 2.2) + 20;
    drawPallet(ctx, x0, y, s, 0, { angle: Math.PI / 6 });
    drawPallet(ctx, x0 + s * 2.2, y, s, 1, { angle: Math.PI / 4 });
    drawPallet(ctx, x0 + s * 4.4, y, s, 3, { angle: Math.PI / 2, symbols: true });
    y += s * 2.2 + 12;
  });
});

// Animation (Blinker / Puls)
const anim = document.getElementById('anim');
function loop() {
  if (!anim.checked) return;
  for (const p of panels) render(p);
  requestAnimationFrame(loop);
}
anim.addEventListener('change', loop);
