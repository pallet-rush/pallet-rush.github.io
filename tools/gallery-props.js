// Galerie zur Sichtprüfung von js/render/props.js.
import * as P from '../js/render/props.js';

const W = 390, H = 844;
// ?dpr=3 erzwingt hohe Auflösung (zum Heranzoomen), ?zoom=2 vergrößert per CSS.
const qs = new URLSearchParams(location.search);
const dpr = Number(qs.get('dpr')) || Math.min(3, window.devicePixelRatio || 1);
if (qs.get('zoom')) document.body.style.zoom = qs.get('zoom');

function setup(cv, w, h) {
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  cv.style.width = w + 'px';
  cv.style.height = h + 'px';
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

// ---------- Szene ----------
const scene = document.getElementById('scene');
const sctx = setup(scene, W, H);

const gates = [{ cx: 110, w: 44 }, { cx: 280, w: 44 }];
const ELL = { cx: 195, cy: 170, rx: 85, ry: 70 };
const leftPath = P.conveyorPath([{ x: 110, y: 90 }, ...P.arcPoints(ELL.cx, ELL.cy, ELL.rx, ELL.ry, Math.PI, Math.PI / 2, 28)]);
const rightPath = P.conveyorPath([{ x: 280, y: 90 }, ...P.arcPoints(ELL.cx, ELL.cy, ELL.rx, ELL.ry, 0, Math.PI / 2, 28)]);
const dropPath = P.conveyorPath([{ x: 195, y: 240 }, { x: 195, y: 266 }]);
const ring = { x: 20, y: 416, w: 350, h: 336 };
const bays = 4, bx1 = 30, bx2 = 360, bw = (bx2 - bx1) / bays;
const BELT = 16;

// Statischer Hintergrund (in echt nur bei Größenänderung neu gezeichnet)
const bg = document.createElement('canvas');
const bctx = setup(bg, W, H);
function drawStatic(ctx) {
  P.drawGrass(ctx, 0, 0, W, H, 1);
  P.drawConcrete(ctx, 0, 100, W, 300, 2, { slab: 48 });
  // Grasinsel im U
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(122, 100);
  ctx.lineTo(268, 100);
  ctx.lineTo(268, 170);
  ctx.ellipse(195, 170, 73, 58, 0, 0, Math.PI);
  ctx.closePath();
  ctx.clip();
  P.drawGrass(ctx, 100, 100, 190, 140, 5);
  ctx.restore();
  // Parkplatz
  P.drawConcrete(ctx, 30, 426, 330, 316, 3, { joints: false, slab: 70 });
  P.drawRingRoad(ctx, ring, 30, 46, { exitRight: true });
  // Bäume hinter der Halle
  for (let i = 0; i < 9; i++) P.drawTree(ctx, 12 + i * 46, 44, 17 + (i % 3) * 2, i % 2 ? 1 : (i % 3 ? 0 : 4));
  P.drawHallFacade(ctx, 0, 50, W, 50, { gates, sign: 'PALLET RUSH' });
  // Bänder (statischer Teil), nach der Fassade, damit sie aus den Toren kommen
  P.drawConveyor(ctx, leftPath, BELT, 0, { color: '#ff8a00', layer: 'base' });
  P.drawConveyor(ctx, rightPath, BELT, 0, { color: '#ff8a00', layer: 'base' });
  P.drawConveyor(ctx, dropPath, BELT, 0, { color: '#ff8a00', layer: 'base' });
  // Grasinsel-Deko
  P.drawFlowerBed(ctx, 150, 118, 90, 26, 3);
  P.drawTree(ctx, 165, 190, 14, 2);
  P.drawTree(ctx, 228, 188, 13, 3);
  P.drawBush(ctx, 196, 196, 9, 4);
  // Hof links/rechts
  P.drawPalletStack(ctx, 26, 140, 20, 5);
  P.drawPalletStack(ctx, 52, 132, 20, 3);
  P.drawBarrels(ctx, 40, 186, 11);
  P.drawCone(ctx, 76, 226, 10);
  P.drawCone(ctx, 88, 236, 10);
  P.drawLamp(ctx, 16, 250, 12);
  P.drawPalletStack(ctx, 362, 128, 20, 4);
  P.drawBarrels(ctx, 350, 230, 10);
  P.drawLamp(ctx, 372, 250, 12);
  P.drawDockConveyor(ctx, 30, 360, 266, 12, 0, { layer: 'base' });
  P.drawDockWall(ctx, 22, 276, 346, 8);
  // Unten: Grünanlage
  P.drawFence(ctx, 6, 836, 384, 836);
  const trees = [[30, 800, 18, 0], [90, 812, 15, 2], [150, 798, 17, 5], [300, 806, 18, 3], [358, 796, 15, 1]];
  for (const [x, y, r, v] of trees) P.drawTree(ctx, x, y, r, v);
  P.drawFlowerBed(ctx, 190, 788, 70, 22, 9);
  P.drawBench(ctx, 225, 828, 26);
  P.drawBush(ctx, 270, 820, 9, 2);
  P.drawBush(ctx, 120, 828, 8, 7);
  P.drawLamp(ctx, 178, 830, 11);
  // Parkplatz-Objekte
  P.drawGarage(ctx, 67, 479, 0, 32, { count: 3 });
  P.drawGarage(ctx, 323, 607, Math.PI / 2, 32, { count: 2 });
  P.drawBarrier(ctx, 291, 479, 32, { open: 0, count: 4 });
  P.drawBarrier(ctx, 99, 703, 32, { open: 0.7, count: 1 });
}
drawStatic(bctx);

function frame(t) {
  const ctx = sctx;
  ctx.drawImage(bg, 0, 0, W, H);
  const ph = t * 30;
  P.drawConveyor(ctx, leftPath, BELT, ph, { layer: 'belt' });
  P.drawConveyor(ctx, rightPath, BELT, ph, { layer: 'belt' });
  P.drawConveyor(ctx, dropPath, BELT, ph, { layer: 'belt' });
  P.drawDockConveyor(ctx, 30, 360, 266, 12, ph, { layer: 'belt' });
  P.drawMergeSwitch(ctx, 195, 236, 18, Math.sin(t * 1.5) > 0 ? 1 : -1);
  P.drawLoadingStation(ctx, 195, 265, 28, t, true);
  for (let i = 0; i < bays; i++) {
    P.drawDockBay(ctx, bx1 + bw * (i + 0.5), 284, bw, 116, {
      index: i, occupied: i === 1, highlight: i === 2 ? 0.6 + 0.4 * Math.sin(t * 5) : 0,
    });
  }
  P.drawForklift(ctx, 330 + Math.sin(t * 0.8) * 14, 180, Math.PI * 0.75, 30, { carrying: true, forkLift: 0.3 + 0.3 * Math.sin(t * 2) });
  P.drawForklift(ctx, 70, 108 + 0 * t, Math.PI / 2 + 0.2, 26, { carrying: false, forkLift: 0 });
  P.drawTurntable(ctx, 195, 600, 16, t * 0.8);
  P.drawCrane(ctx, { baseX: 270, baseY: 700, hookX: 200, hookY: 540 + Math.sin(t * 1.3) * 4, s: 1 });
  P.drawBadge(ctx, 140, 690, 9, '#1f7bff', '12');
  P.drawPadlock(ctx, 170, 690, 16);
  P.drawKey(ctx, 200, 694, 18);
  P.drawCheck(ctx, 325, 520, 24);
  P.drawPuff(ctx, 100 + (t * 10) % 20, 520 - (t * 10) % 20, 6 + (t * 4) % 8, 1 - ((t * 0.5) % 1));
  P.drawSparkle(ctx, 337, 507, 6, t);
}

// ---------- Einzelstreifen ----------
const strip = document.getElementById('strip');
const CW = 130, CH = 112, COLS = 4;
const items = [
  ['Baum 0/1', (c, x, y, k) => P.drawTree(c, x, y + 8 * k, 9 * k, k > 1 ? 1 : 0)],
  ['Baum 2/3 Blüte/Obst', (c, x, y, k) => P.drawTree(c, x, y + 8 * k, 9 * k, k > 1 ? 3 : 2)],
  ['Baum 4/5', (c, x, y, k) => P.drawTree(c, x, y + 8 * k, 9 * k, k > 1 ? 5 : 4)],
  ['Busch', (c, x, y, k) => P.drawBush(c, x, y + 5, 8 * k, 3 + k)],
  ['Blumenbeet', (c, x, y, k) => P.drawFlowerBed(c, x - 13 * k, y - 6 * k, 26 * k, 14 * k, k)],
  ['Laterne', (c, x, y, k) => P.drawLamp(c, x - 4, y + 12 * k, 9 * k)],
  ['Leitkegel', (c, x, y, k) => P.drawCone(c, x, y + 5 * k, 9 * k)],
  ['Fässer', (c, x, y, k) => P.drawBarrels(c, x, y + 4 * k, 8 * k)],
  ['Palettenstapel', (c, x, y, k) => P.drawPalletStack(c, x, y + 8 * k, 14 * k, 2 + k)],
  ['Bank', (c, x, y, k) => P.drawBench(c, x, y + 4, 16 * k)],
  ['Zaun', (c, x, y, k) => P.drawFence(c, x - 12 * k, y + 8 + k * 2, x + 12 * k, y + 2 + k * 6, { h: 6 * k + 4 })],
  ['Gabelstapler', (c, x, y, k, t) => P.drawForklift(c, x, y + 4, k > 1 ? -0.5 : 0, 20 * k, { carrying: k > 1, forkLift: 0.5 + 0.5 * Math.sin(t * 2) })],
  ['Kran', (c, x, y, k, t) => P.drawCrane(c, { baseX: x + 8 * k, baseY: y + 16 * k, hookX: x - 14 * k, hookY: y - 4 * k + Math.sin(t) * 2, s: 0.45 * k, cable: 16 * k })],
  ['Garage (rechts/unten)', (c, x, y, k) => P.drawGarage(c, x, y, k > 1 ? Math.PI / 2 : 0, 20 * k, { count: k * 2 })],
  ['Garage (oben/links)', (c, x, y, k) => P.drawGarage(c, x, y, k > 1 ? Math.PI : -Math.PI / 2, 20 * k, { count: 5 })],
  ['Schranke zu/offen', (c, x, y, k, t) => P.drawBarrier(c, x, y, 20 * k, { open: k > 1 ? 0.5 + 0.5 * Math.sin(t) : 0, count: 3 })],
  ['Drehscheibe', (c, x, y, k, t) => P.drawTurntable(c, x, y, 10 * k, t)],
  ['Weiche', (c, x, y, k, t) => P.drawMergeSwitch(c, x, y, 14 * k, Math.sin(t * 2) > 0 ? 1 : -1)],
  ['Ladestation', (c, x, y, k, t) => P.drawLoadingStation(c, x, y + 8 * k, 22 * k, t, k < 2)],
  ['Badge', (c, x, y, k) => P.drawBadge(c, x, y, 7 * k, k > 1 ? '#a64bff' : '#ff2d3d', k > 1 ? '24' : '3')],
  ['Schloss', (c, x, y, k) => P.drawPadlock(c, x, y, 13 * k)],
  ['Schlüssel', (c, x, y, k) => P.drawKey(c, x, y, 14 * k)],
  ['Haken', (c, x, y, k) => P.drawCheck(c, x, y, 16 * k)],
  ['Puff / Funkeln', (c, x, y, k, t) => { if (k > 1) P.drawSparkle(c, x, y, 10, t); else P.drawPuff(c, x, y, 8, 1); }],
];
const rows = Math.ceil(items.length / COLS) + 2;
const SW = CW * COLS, SH = rows * CH;
const tctx = setup(strip, SW, SH);
const beltDemo = P.conveyorPath([{ x: 20, y: 30 }, { x: 140, y: 30 }, ...P.arcPoints(140, 60, 30, 30, -Math.PI / 2, Math.PI / 2, 16), { x: 20, y: 90 }]);

function drawStrip(t) {
  const c = tctx;
  c.fillStyle = '#e9ecef';
  c.fillRect(0, 0, SW, SH);
  items.forEach(([name, fn], i) => {
    const cx = (i % COLS) * CW, cy = Math.floor(i / COLS) * CH;
    c.fillStyle = (i + Math.floor(i / COLS)) % 2 ? '#dfe7d6' : '#e8ece4';
    c.fillRect(cx, cy, CW, CH);
    c.fillStyle = '#333';
    c.font = '11px system-ui';
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillText(name, cx + 5, cy + 13);
    fn(c, cx + 30, cy + 62, 1, t);
    fn(c, cx + 88, cy + 62, 2, t);
  });
  // Band- und Rampenmuster
  const y0 = Math.ceil(items.length / COLS) * CH;
  c.fillStyle = '#e8ece4';
  c.fillRect(0, y0, SW, CH * 2);
  c.save();
  c.translate(10, y0 + 6);
  P.drawConveyor(c, beltDemo, 14, t * 30, { color: '#22d36b' });
  c.restore();
  P.drawDockConveyor(c, 220, 500, y0 + 24, 12, t * 30);
  P.drawDockWall(c, 214, y0 + 34, 292, 8, { bumpersAt: [] });
  for (let i = 0; i < 3; i++) {
    P.drawDockBay(c, 262 + i * 94, y0 + 42, 94, 120, { index: i + 3, extra: i === 2, occupied: i === 0, highlight: i === 1 ? 0.7 + 0.3 * Math.sin(t * 5) : 0 });
  }
  P.drawRoadArrow(c, 60, y0 + 160, 0, 30);
  c.fillStyle = '#555b66';
  c.fillRect(100, y0 + 140, 100, 44);
  P.drawRoadArrow(c, 150, y0 + 162, -Math.PI / 2, 26);
}

let t0 = performance.now();
function loop(now) {
  const t = (now - t0) / 1000;
  frame(t);
  drawStrip(t);
  requestAnimationFrame(loop);
}
frame(0);
drawStrip(0);
requestAnimationFrame(loop);
