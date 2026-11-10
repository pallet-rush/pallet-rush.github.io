// Kulissen- und Requisiten-Bibliothek für Pallet Rush (Canvas 2D, alles per Code).
// Alle Maße in CSS-Pixeln, der Aufrufer hat devicePixelRatio bereits gesetzt.
// Perspektive: Draufsicht leicht gekippt. Höhe = nach oben verschobene Deckfläche,
// darunter sichtbare dunklere Seitenfläche, Schatten nach rechts unten (Sonne links oben).
// Pro-Frame-Pfade (Bänder, Lichter, Station) nutzen kein shadowBlur.

const TAU = Math.PI * 2;

// ---------- Hilfsfunktionen ----------

// Deterministischer Zufall (mulberry32).
function rng(seed) {
  let a = (seed | 0) ^ 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _rgbCache = new Map();
function rgbOf(hex) {
  let v = _rgbCache.get(hex);
  if (v) return v;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  _rgbCache.set(hex, v);
  return v;
}

const _shCache = new Map();
// Farbe aufhellen (f > 0) oder abdunkeln (f < 0), Ergebnis gecacht.
// Cleaner Look: ruhige, flache Flächen ohne Körnung/Flecken (moderner Spielzeug-Stil).
export const STYLE = { clean: true };

export function shade(hex, f) {
  const k = hex + '|' + f;
  let v = _shCache.get(k);
  if (v) return v;
  const [r, g, b] = rgbOf(hex);
  const t = f < 0 ? 0 : 255;
  const p = Math.abs(f);
  v = `rgb(${Math.round(r + (t - r) * p)},${Math.round(g + (t - g) * p)},${Math.round(b + (t - b) * p)})`;
  _shCache.set(k, v);
  return v;
}

function rgba(hex, a) {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// Abgerundetes Rechteck als Teilpfad (ohne beginPath).
function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function roundRectPath(ctx, x, y, w, h, r) {
  rr(ctx, x, y, w, h, r);
}

function fillRR(ctx, x, y, w, h, r, c) {
  ctx.beginPath();
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = c;
  ctx.fill();
}

function circle(ctx, x, y, r, c) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = c;
  ctx.fill();
}

function ellipse(ctx, x, y, rx, ry, c) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, TAU);
  ctx.fillStyle = c;
  ctx.fill();
}

// Weicher Schatten ohne shadowBlur (radialer Verlauf, elliptisch skaliert).
function softShadow(ctx, x, y, rx, ry, a = 0.25) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, rx * 0.2, 0, 0, rx);
  g.addColorStop(0, `rgba(20,30,20,${a})`);
  g.addColorStop(0.6, `rgba(20,30,20,${a * 0.6})`);
  g.addColorStop(1, 'rgba(20,30,20,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// Weicher Rechteck-Schatten (gestapelte Rechtecke, billig).
function boxShadow(ctx, x, y, w, h, r, a = 0.2) {
  for (let i = 0; i < 3; i++) {
    const g = (2 - i) * 1.5;
    fillRR(ctx, x - g, y - g, w + g * 2, h + g * 2, r + g, `rgba(20,25,35,${a / 3})`);
  }
}

// Weicher Wurfschatten eines Quaders (Grundfläche x,y,w,d; Höhe H), Sonne oben links.
function boxCastShadow(ctx, x, y, w, d, H, a = 0.3) {
  const sx = H * 0.75, sy = H * 0.35;
  for (let k = 0; k < 4; k++) {
    const g = k * 1.1;
    ctx.fillStyle = `rgba(40,44,80,${a * (0.34 - k * 0.07)})`;
    ctx.beginPath();
    ctx.moveTo(x + 1, y + d - 0.5);
    ctx.lineTo(x + 1 + sx - g * 0.3, y + d + sy + g);
    ctx.lineTo(x + w + sx + g, y + d + sy + g);
    ctx.lineTo(x + w + sx + g, y + sy - g * 0.3);
    ctx.lineTo(x + w - 0.5, y + 1);
    ctx.lineTo(x + w - 0.5, y + d - 0.5);
    ctx.closePath();
    ctx.fill();
  }
}

// Quader in Draufsicht: Deckfläche (x,y,w,d) und Seitenfläche darunter mit Höhe h.
function box(ctx, x, y, w, d, h, top, side, r = 1.5) {
  fillRR(ctx, x, y + h * 0.15, w, d + h * 0.85, r, side);
  fillRR(ctx, x, y, w, d, r, top);
}

// Warnstreifen (gelb/schwarz) in einem Rechteck.
function hazard(ctx, x, y, w, h, step = 6, c1 = '#ffcc00', c2 = '#1d1f24') {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = c1;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = c2;
  ctx.beginPath();
  for (let i = -h - step; i < w + h; i += step * 2) {
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + step, y + h);
    ctx.lineTo(x + i + step + h, y);
    ctx.lineTo(x + i + h, y);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

function font(px, w = 900) {
  return `${w} ${px}px "Arial Black", "Segoe UI", system-ui, sans-serif`;
}

// Text mit dunkler Kontur.
function outlinedText(ctx, text, x, y, px, fill, stroke, lw) {
  ctx.font = font(px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (stroke) {
    ctx.lineWidth = lw ?? px * 0.22;
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

// ---------- Boden ----------

// Satter Rasen mit Mähstreifen, Flecken, Halmbüscheln und kleinen Blüten.
export function drawGrass(ctx, x, y, w, h, seed = 1) {
  const R = rng(seed * 7919 + 13);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const g = ctx.createLinearGradient(x, y, x + w * 0.3, y + h);
  if (STYLE.clean) {
    // ruhiger, heller Lavendel-Grau-Boden
    g.addColorStop(0, '#dadded');
    g.addColorStop(1, '#c9cde0');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    return;
  }
  g.addColorStop(0, '#83dc5a');
  g.addColorStop(1, '#5fc64c');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);

  // Mähstreifen, diagonal, an globalen Koordinaten ausgerichtet
  const sw = 26;
  ctx.fillStyle = 'rgba(255,255,140,0.075)';
  ctx.beginPath();
  const k0 = Math.floor((x - h) / (sw * 2)) - 1;
  const k1 = Math.ceil((x + w + y + h) / (sw * 2)) + 1;
  for (let k = k0; k <= k1; k++) {
    const a = k * sw * 2 - y * 0.6;
    ctx.moveTo(a, y);
    ctx.lineTo(a + sw, y);
    ctx.lineTo(a + sw - h * 0.6, y + h);
    ctx.lineTo(a - h * 0.6, y + h);
    ctx.closePath();
  }
  ctx.fill();

  const area = w * h;
  // Weiche Flecken (heller/dunkler)
  const nb = Math.max(2, area / 5000);
  for (let i = 0; i < nb; i++) {
    const px = x + R() * w, py = y + R() * h, r = 14 + R() * 30;
    const gg = ctx.createRadialGradient(px, py, 0, px, py, r);
    const dark = R() < 0.55;
    gg.addColorStop(0, dark ? 'rgba(40,120,40,0.16)' : 'rgba(200,255,120,0.14)');
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(px - r, py - r, r * 2, r * 2);
  }
  // Körnung
  const ns = area / 22;
  ctx.fillStyle = 'rgba(30,110,40,0.28)';
  ctx.beginPath();
  for (let i = 0; i < ns; i++) ctx.rect(x + R() * w, y + R() * h, 1, 1);
  ctx.fill();
  ctx.fillStyle = 'rgba(220,255,170,0.35)';
  ctx.beginPath();
  for (let i = 0; i < ns * 0.6; i++) ctx.rect(x + R() * w, y + R() * h, 0.9, 0.9);
  ctx.fill();
  // Halmbüschel
  const nt = area / 260;
  ctx.lineCap = 'round';
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#3f9f3c';
  ctx.beginPath();
  const lights = [];
  for (let i = 0; i < nt; i++) {
    const px = x + R() * w, py = y + R() * h, s = 2 + R() * 2.5;
    ctx.moveTo(px, py); ctx.lineTo(px - s * 0.6, py - s);
    ctx.moveTo(px, py); ctx.lineTo(px + 0.2, py - s * 1.25);
    ctx.moveTo(px, py); ctx.lineTo(px + s * 0.6, py - s * 0.9);
    if (R() < 0.5) lights.push(px + 0.6, py - 0.3, s);
  }
  ctx.stroke();
  ctx.strokeStyle = '#a9ef7c';
  ctx.beginPath();
  for (let i = 0; i < lights.length; i += 3) {
    ctx.moveTo(lights[i], lights[i + 1]);
    ctx.lineTo(lights[i] + lights[i + 2] * 0.5, lights[i + 1] - lights[i + 2]);
  }
  ctx.stroke();
  // Kleeblätter und Gänseblümchen
  const nf = area / 2600;
  for (let i = 0; i < nf; i++) {
    const px = x + R() * w, py = y + R() * h;
    if (R() < 0.5) {
      ctx.fillStyle = '#4fb348';
      for (let j = 0; j < 3; j++) circle(ctx, px + Math.cos(j * 2.1) * 1.4, py + Math.sin(j * 2.1) * 1.4, 1.3, '#4caf45');
    } else {
      const n = 1 + (R() * 4) | 0;
      for (let j = 0; j < n; j++) {
        const fx = px + (R() - 0.5) * 9, fy = py + (R() - 0.5) * 6;
        circle(ctx, fx, fy, 1.25, R() < 0.75 ? '#ffffff' : '#fff27a');
        circle(ctx, fx, fy, 0.5, '#ffc928');
      }
    }
  }
  ctx.restore();
}

// Heller Beton mit Plattenfugen, Tönungen, Flecken und Haarrissen.
// o = { joints: true, slab: 64 }
export function drawConcrete(ctx, x, y, w, h, seed = 1, o = {}) {
  const R = rng(seed * 104729 + 7);
  const S = o.slab || 64;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  // kühles, sauberes Grau-Blau: passt zum blauen UI und lässt die Farben strahlen
  g.addColorStop(0, o.c0 || (STYLE.clean ? '#eceef6' : '#e8eef6'));
  g.addColorStop(1, o.c1 || (STYLE.clean ? '#e0e3ef' : '#d6dfeb'));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  if (STYLE.clean) {
    if (o.joints !== false) {
      // feine Dehnfugen: dunkle Linie + helle Kante (gefaste Betonplatten)
      const sx0 = Math.floor(x / S) * S, sy0 = Math.floor(y / S) * S;
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = 'rgba(90,96,140,0.16)';
      ctx.beginPath();
      for (let sx = sx0; sx <= x + w; sx += S) { ctx.moveTo(sx, y); ctx.lineTo(sx, y + h); }
      for (let sy = sy0; sy <= y + h; sy += S) { ctx.moveTo(x, sy); ctx.lineTo(x + w, sy); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      for (let sx = sx0; sx <= x + w; sx += S) { ctx.moveTo(sx + 0.8, y); ctx.lineTo(sx + 0.8, y + h); }
      for (let sy = sy0; sy <= y + h; sy += S) { ctx.moveTo(x, sy + 0.8); ctx.lineTo(x + w, sy + 0.8); }
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  // Plattentönung
  const sx0 = Math.floor(x / S) * S, sy0 = Math.floor(y / S) * S;
  for (let sy = sy0; sy < y + h; sy += S) {
    for (let sx = sx0; sx < x + w; sx += S) {
      const v = R();
      ctx.fillStyle = v < 0.5 ? `rgba(80,100,135,${(0.5 - v) * 0.09})` : `rgba(255,255,255,${(v - 0.5) * 0.25})`;
      ctx.fillRect(sx, sy, S, S);
    }
  }
  const area = w * h;
  // Flecken
  for (let i = 0; i < area / 9000 + 1; i++) {
    const px = x + R() * w, py = y + R() * h, r = 10 + R() * 28;
    const gg = ctx.createRadialGradient(px, py, 0, px, py, r);
    gg.addColorStop(0, `rgba(80,95,125,${0.04 + R() * 0.05})`);
    gg.addColorStop(1, 'rgba(80,95,125,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(px - r, py - r, r * 2, r * 2);
  }
  // Ölflecken
  for (let i = 0; i < area / 30000; i++) {
    const px = x + R() * w, py = y + R() * h, r = 2 + R() * 5;
    ellipse(ctx, px, py, r * 1.3, r, 'rgba(60,60,70,0.08)');
    ellipse(ctx, px + r * 0.3, py, r * 0.6, r * 0.5, 'rgba(50,50,60,0.08)');
  }
  // Körnung
  ctx.fillStyle = 'rgba(90,85,75,0.16)';
  ctx.beginPath();
  for (let i = 0; i < area / 18; i++) ctx.rect(x + R() * w, y + R() * h, 1, 1);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  for (let i = 0; i < area / 30; i++) ctx.rect(x + R() * w, y + R() * h, 0.8, 0.8);
  ctx.fill();
  // Haarrisse
  ctx.strokeStyle = 'rgba(100,92,80,0.22)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let i = 0; i < area / 22000; i++) {
    let px = x + R() * w, py = y + R() * h, a = R() * TAU;
    ctx.moveTo(px, py);
    for (let j = 0; j < 5; j++) {
      a += (R() - 0.5) * 1.2;
      px += Math.cos(a) * 4; py += Math.sin(a) * 4;
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
  // Fugen
  if (o.joints !== false) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(120,110,95,0.22)';
    ctx.beginPath();
    for (let sx = sx0; sx <= x + w; sx += S) { ctx.moveTo(sx + 0.5, y); ctx.lineTo(sx + 0.5, y + h); }
    for (let sy = sy0; sy <= y + h; sy += S) { ctx.moveTo(x, sy + 0.5); ctx.lineTo(x + w, sy + 0.5); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    for (let sx = sx0; sx <= x + w; sx += S) { ctx.moveTo(sx + 1.5, y); ctx.lineTo(sx + 1.5, y + h); }
    for (let sy = sy0; sy <= y + h; sy += S) { ctx.moveTo(x, sy + 1.5); ctx.lineTo(x + w, sy + 1.5); }
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- Straße ----------

// Äußere Kontur der Ringstraße im Abstand d zur Mittellinie (optional mit Ausfahrt rechts).
function ringOuter(ctx, X, Y, W, H, R, d, exit) {
  const r = R + d;
  if (!exit) { rr(ctx, X - d, Y - d, W + 2 * d, H + 2 * d, r); return; }
  const ex = X + W + exit;
  ctx.moveTo(X + R, Y - d);
  ctx.lineTo(ex, Y - d);
  ctx.lineTo(ex, Y + d);
  ctx.arcTo(X + W + d, Y + d, X + W + d, Y + H, Math.max(2, Math.min(R - d, R * 0.6)));
  ctx.arcTo(X + W + d, Y + H + d, X, Y + H + d, r);
  ctx.arcTo(X - d, Y + H + d, X - d, Y, r);
  ctx.arcTo(X - d, Y - d, X + W, Y - d, r);
  ctx.closePath();
}

function ringInner(ctx, X, Y, W, H, R, d) {
  rr(ctx, X + d, Y + d, W - 2 * d, H - 2 * d, Math.max(2, R - d));
}

// Mittellinie der Ringstraße als Punktliste im Uhrzeigersinn (oben links → rechts).
export function ringPoints(rect, cornerR) {
  const { x: X, y: Y, w: W, h: H } = rect;
  const R = cornerR, n = 10;
  return [
    { x: X + R, y: Y },
    ...arcPoints(X + W - R, Y + R, R, R, -Math.PI / 2, 0, n),
    ...arcPoints(X + W - R, Y + H - R, R, R, 0, Math.PI / 2, n),
    ...arcPoints(X + R, Y + H - R, R, R, Math.PI / 2, Math.PI, n),
    ...arcPoints(X + R, Y + R, R, R, Math.PI, Math.PI * 1.5, n),
  ];
}

// Ringstraße (Einbahn im Uhrzeigersinn) mit Bordsteinen, Belag, Randlinien und Pfeilen.
// rect = Mittellinien-Rechteck, o = { exitRight, arrowGap: 120, seed }
export function drawRingRoad(ctx, rect, roadW, cornerR, o = {}) {
  const { x: X, y: Y, w: W, h: H } = rect;
  const R = cornerR, ex = o.exitRight ? (o.exitLen || 200) : 0;
  const d0 = roadW / 2, cw = Math.max(3, roadW * 0.13), d1 = d0 + cw;
  const band = (d) => { ctx.beginPath(); ringOuter(ctx, X, Y, W, H, R, d, ex); ringInner(ctx, X, Y, W, H, R, d); };
  ctx.save();
  // Schatten der Bordsteine auf Gras/Beton
  if (STYLE.clean) {
    // weicher Schatten: außen nach rechts unten, innen als Verdeckung
    for (const [k, a] of [[3.5, 0.06], [2, 0.08], [0.8, 0.12]]) {
      ctx.save();
      ctx.translate(k * 0.5, k);
      ctx.beginPath(); ringOuter(ctx, X, Y, W, H, R, d1 + k, ex); ringInner(ctx, X, Y, W, H, R, d1 + k);
      ctx.fillStyle = `rgba(40,44,80,${a})`;
      ctx.fill('evenodd');
      ctx.restore();
    }
  } else {
    ctx.save();
    ctx.translate(1.5, 3);
    band(d1 + 1);
    ctx.fillStyle = 'rgba(30,40,30,0.18)';
    ctx.fill('evenodd');
    ctx.restore();
  }
  // Bordstein-Seitenfläche, dann Oberseite
  ctx.save();
  ctx.translate(0, 2);
  band(d1);
  ctx.fillStyle = '#9ea5b0';
  ctx.fill('evenodd');
  ctx.restore();
  band(d1);
  ctx.fillStyle = '#e4e7ec';
  ctx.fill('evenodd');
  // Bordstein-Segmente
  if (STYLE.clean) {
    // Bordstein: Lichtkante außen, feine Steinfugen
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ringOuter(ctx, X, Y, W, H, R, d1 - 0.5, ex); ctx.stroke();
    ctx.beginPath(); ringInner(ctx, X, Y, W, H, R, d1 - 0.5); ctx.stroke();
    ctx.lineWidth = cw * 0.9;
    ctx.setLineDash([0.7, 15]);
    ctx.strokeStyle = 'rgba(110,116,140,0.45)';
    ctx.beginPath(); ringOuter(ctx, X, Y, W, H, R, d0 + cw / 2, ex); ctx.stroke();
    ctx.beginPath(); ringInner(ctx, X, Y, W, H, R, d0 + cw / 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.lineWidth = cw * 0.8;
  ctx.setLineDash(STYLE.clean ? [] : [3, 9]);
  ctx.strokeStyle = STYLE.clean ? 'rgba(0,0,0,0)' : 'rgba(150,158,170,0.55)';
  ctx.beginPath(); ringOuter(ctx, X, Y, W, H, R, d0 + cw / 2, ex); ctx.stroke();
  ctx.beginPath(); ringInner(ctx, X, Y, W, H, R, d0 + cw / 2); ctx.stroke();
  ctx.setLineDash([]);
  // Innere Bordsteinkante dunkler (Stufe zur Fahrbahn)
  band(d0 + 1.2);
  ctx.fillStyle = '#7d8591';
  ctx.fill('evenodd');
  // Asphalt
  band(d0);
  const ag = ctx.createLinearGradient(X, Y, X + W, Y + H);
  ag.addColorStop(0, STYLE.clean ? '#8a8fab' : '#5a606c');
  ag.addColorStop(1, STYLE.clean ? '#7c819e' : '#4d535e');
  ctx.fillStyle = ag;
  ctx.fill('evenodd');
  ctx.save();
  ctx.clip('evenodd');
  const cp = conveyorPath([...ringPoints(rect, R), { x: X + R, y: Y }]);
  if (STYLE.clean) {
    // weicher Lichtverlauf (Fahrbahn leicht gewölbt) + Verdeckung an den Bordsteinen
    ctx.lineWidth = roadW * 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath(); ringOuter(ctx, X, Y, W, H, R, -roadW * 0.12, ex); ringInner(ctx, X, Y, W, H, R, -roadW * 0.12); ctx.stroke();
    ctx.lineWidth = roadW * 0.18;
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.beginPath(); ringOuter(ctx, X, Y, W, H, R, -roadW * 0.05, ex); ringInner(ctx, X, Y, W, H, R, -roadW * 0.05); ctx.stroke();
    for (const [lw, a] of [[7, 0.07], [3.5, 0.1], [1.4, 0.16]]) {
      ctx.lineWidth = lw;
      ctx.strokeStyle = `rgba(30,32,70,${a})`;
      ctx.beginPath(); ringOuter(ctx, X, Y, W, H, R, d0, ex); ctx.stroke();
      ctx.beginPath(); ringInner(ctx, X, Y, W, H, R, d0); ctx.stroke();
    }
  } else {
  // Reifenspuren
  ctx.lineJoin = 'round';
  ctx.lineWidth = roadW * 0.17;
  ctx.strokeStyle = 'rgba(25,28,35,0.14)';
  ctx.beginPath();
  ringOuter(ctx, X, Y, W, H, R, -roadW * 0.2, ex);
  ringInner(ctx, X, Y, W, H, R, -roadW * 0.2);
  ringOuter(ctx, X, Y, W, H, R, roadW * 0.2, ex);
  ringInner(ctx, X, Y, W, H, R, roadW * 0.2);
  ctx.stroke();
  // Körnung entlang der Mittellinie
  const Rn = rng((o.seed || 3) * 31 + 5);
  const pts = [];
  for (let s = 0; s < cp.length; s += 1.2) pts.push(cp.at(s));
  if (ex) for (let xx = X + W - R; xx < X + W + ex; xx += 1.2) pts.push({ x: xx, y: Y, a: 0 });
  ctx.fillStyle = 'rgba(20,22,28,0.35)';
  ctx.beginPath();
  for (const p of pts) for (let k = 0; k < 3; k++) { const off = (Rn() - 0.5) * roadW; ctx.rect(p.x - Math.sin(p.a) * off + (Rn() - 0.5), p.y + Math.cos(p.a) * off, 1, 1); }
  ctx.fill();
  ctx.fillStyle = 'rgba(200,205,215,0.28)';
  ctx.beginPath();
  for (const p of pts) for (let k = 0; k < 2; k++) { const off = (Rn() - 0.5) * roadW; ctx.rect(p.x - Math.sin(p.a) * off, p.y + Math.cos(p.a) * off + (Rn() - 0.5), 0.9, 0.9); }
  ctx.fill();
  // Ausbesserungsflicken
  for (let i = 0; i < 5; i++) {
    const p = cp.at(Rn() * cp.length);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    const pw = 10 + Rn() * 16, ph = roadW * (0.3 + Rn() * 0.3);
    ctx.fillStyle = 'rgba(30,33,40,0.22)';
    ctx.fillRect(-pw / 2, -ph / 2 + (Rn() - 0.5) * roadW * 0.3, pw, ph);
    ctx.restore();
  }
  }
  ctx.restore();
  // Randlinien
  ctx.lineWidth = Math.max(1.5, roadW * 0.06);
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  const el = d0 - Math.max(2.5, roadW * 0.1);
  ctx.beginPath(); ringOuter(ctx, X, Y, W, H, R, el, ex); ctx.stroke();
  ctx.beginPath(); ringInner(ctx, X, Y, W, H, R, el); ctx.stroke();
  // Abdeckung der Randlinie am Ende der Ausfahrt (senkrechtes Stück)
  // Pfeile entlang der Fahrtrichtung
  const gap = o.arrowGap || 120;
  const as = roadW * 0.62;
  for (let s = gap * 0.45; s < cp.length - gap * 0.3; s += gap) {
    const p = cp.at(s);
    drawRoadArrow(ctx, p.x, p.y, p.a, as);
  }
  if (ex) {
    // Gestrichelte Leitlinie und Pfeil auf der Ausfahrt
    ctx.setLineDash([7, 7]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.moveTo(X + W - R * 0.4, Y + d0 - 0.5);
    ctx.lineTo(X + W + d0 + 4, Y + d0 - 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    drawRoadArrow(ctx, X + W + 30, Y, 0, as);
  }
  ctx.restore();
}

// Weißer Fahrbahnpfeil (gemalt), Spitze zeigt in Richtung angle. s = Länge.
export function drawRoadArrow(ctx, x, y, angle, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const l = s / 2, hw = s * 0.32, sw = s * 0.11;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(l, 0);
    ctx.lineTo(l - s * 0.42, -hw);
    ctx.lineTo(l - s * 0.42, -sw);
    ctx.lineTo(-l, -sw);
    ctx.lineTo(-l, sw);
    ctx.lineTo(l - s * 0.42, sw);
    ctx.lineTo(l - s * 0.42, hw);
    ctx.closePath();
  };
  ctx.translate(0.6, 0.6);
  path();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fill();
  ctx.translate(-0.6, -0.6);
  path();
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fill();
  ctx.restore();
}

// ---------- Halle ----------

// Hallenfassade: Dach mit Oberlichtern und Lüftern, farbige Attika, Trapezblechwand,
// Fenster, Schild und offene Rolltore. o = { gates: [{ cx, w }], sign: 'PALLET RUSH', signX }
export function drawHallFacade(ctx, x, y, w, h, o = {}) {
  const gates = o.gates || [];
  // roofH/capH optional absolut: so liegt die Wand mit den Toren genau unter der HUD-Leiste
  const roofH = o.roofH ?? Math.round(h * 0.3);
  const capH = o.capH ?? Math.max(3, h * 0.07);
  const wy = y + roofH + capH, wh = y + h - wy;
  const R = rng(4711);
  ctx.save();
  // Bodenschatten vor der Wand
  const sg = ctx.createLinearGradient(0, y + h, 0, y + h + 10);
  sg.addColorStop(0, 'rgba(20,30,40,0.28)');
  sg.addColorStop(1, 'rgba(20,30,40,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(x, y + h, w, 10);

  // Dach
  const rg = ctx.createLinearGradient(0, y, 0, y + roofH);
  rg.addColorStop(0, '#8d99a8');
  rg.addColorStop(1, '#a9b4c1');
  ctx.fillStyle = rg;
  ctx.fillRect(x, y, w, roofH);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let xx = x + 3; xx < x + w; xx += 6) { ctx.moveTo(xx + 0.5, y); ctx.lineTo(xx + 0.5, y + roofH); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(40,50,65,0.18)';
  ctx.beginPath();
  for (let xx = x + 5; xx < x + w; xx += 6) { ctx.moveTo(xx + 0.5, y); ctx.lineTo(xx + 0.5, y + roofH); }
  ctx.stroke();
  // Oberlichter
  const nSky = Math.max(2, Math.floor(w / 70));
  for (let i = 0; i < nSky; i++) {
    const sx = x + (i + 0.5) * (w / nSky) - 13;
    if (roofH < 8) break;
    fillRR(ctx, sx, y + roofH * 0.22, 26, roofH * 0.5, 2, '#d7e1ea');
    const kg = ctx.createLinearGradient(sx, 0, sx + 26, 0);
    kg.addColorStop(0, '#7fc4ff');
    kg.addColorStop(0.5, '#c9ecff');
    kg.addColorStop(1, '#6fb2f0');
    fillRR(ctx, sx + 1.5, y + roofH * 0.22 + 1.5, 23, roofH * 0.5 - 3, 1.5, kg);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    for (let k = 1; k < 4; k++) { ctx.moveTo(sx + 1.5 + k * 5.75, y + roofH * 0.22 + 1.5); ctx.lineTo(sx + 1.5 + k * 5.75, y + roofH * 0.72 - 1.5); }
    ctx.stroke();
  }
  // Lüftungsaggregate
  for (let i = 0; i < nSky - 1; i++) {
    const ax = x + (i + 1) * (w / nSky) - 7, ay = y + roofH * 0.18;
    if (roofH < 10) break;
    box(ctx, ax, ay, 14, roofH * 0.42, 3, '#e9edf2', '#a9b2bd', 1.5);
    circle(ctx, ax + 7, ay + roofH * 0.21, roofH * 0.17, '#59626e');
    ctx.strokeStyle = '#c8d0da';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + i;
      ctx.moveTo(ax + 7, ay + roofH * 0.21);
      ctx.lineTo(ax + 7 + Math.cos(a) * roofH * 0.15, ay + roofH * 0.21 + Math.sin(a) * roofH * 0.15);
    }
    ctx.stroke();
  }
  // Attika (blau mit oranger Kante)
  const cg = ctx.createLinearGradient(0, y + roofH, 0, y + roofH + capH);
  cg.addColorStop(0, '#4b93ff');
  cg.addColorStop(1, '#1a5fd6');
  ctx.fillStyle = cg;
  ctx.fillRect(x, y + roofH - 1, w, capH + 1);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillRect(x, y + roofH - 1, w, 1);

  // Wand: Trapezblech
  const wg = ctx.createLinearGradient(0, wy, 0, y + h);
  wg.addColorStop(0, '#f6f9fd');
  wg.addColorStop(1, '#dfe7f1');
  ctx.fillStyle = wg;
  ctx.fillRect(x, wy, w, wh);
  ctx.fillStyle = 'rgba(80,110,150,0.13)';
  ctx.beginPath();
  for (let xx = x; xx < x + w; xx += 5) ctx.rect(xx + 3, wy, 1.4, wh);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  for (let xx = x; xx < x + w; xx += 5) ctx.rect(xx + 2, wy, 0.8, wh);
  ctx.fill();
  // Farbbänder
  ctx.fillStyle = '#ff8a00';
  ctx.fillRect(x, wy, w, Math.max(1.5, wh * 0.05));
  ctx.fillStyle = '#1f6fe8';
  ctx.fillRect(x, y + h - wh * 0.16, w, wh * 0.1);
  ctx.fillStyle = '#ffcc00';
  ctx.fillRect(x, y + h - wh * 0.06, w, wh * 0.025);
  // Sockel
  ctx.fillStyle = '#b7bec8';
  ctx.fillRect(x, y + h - wh * 0.035, w, wh * 0.035 + 0.5);

  // Fensterband, Gattore ausgespart
  const winY = wy + wh * 0.14, winH = wh * 0.16;
  const signX = o.signX ?? x + w / 2;
  // Schild passt zwischen die benachbarten Tore
  let gl0 = x, gr0 = x + w;
  for (const gt of gates) {
    if (gt.cx < signX) gl0 = Math.max(gl0, gt.cx + gt.w / 2 + 4);
    else gr0 = Math.min(gr0, gt.cx - gt.w / 2 - 4);
  }
  const signW = Math.max(40, Math.min(w * 0.36, 150, (Math.min(signX - gl0, gr0 - signX) - 6) * 2));
  const free = (a, b) => {
    for (const gt of gates) if (b > gt.cx - gt.w / 2 - 8 && a < gt.cx + gt.w / 2 + 8) return false;
    if (o.sign !== '' && b > signX - signW / 2 - 4 && a < signX + signW / 2 + 4) return false;
    return true;
  };
  if (STYLE.clean) {
    // Schatten der Attika auf der Wand (Dachüberstand)
    const eg = ctx.createLinearGradient(0, wy, 0, wy + Math.max(4, wh * 0.18));
    eg.addColorStop(0, 'rgba(30,40,90,0.22)');
    eg.addColorStop(1, 'rgba(30,40,90,0)');
    ctx.fillStyle = eg;
    ctx.fillRect(x, wy, w, Math.max(4, wh * 0.18));
    // Sockel mit Höhe: helle Oberkante, dunkle Unterkante
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(x, y + h - wh * 0.035, w, 0.6);
    ctx.fillStyle = 'rgba(30,40,70,0.25)';
    ctx.fillRect(x, y + h - 0.8, w, 0.8);
  }
  for (let xx = x + 6; xx + 14 < x + w; xx += 18) {
    if (!free(xx, xx + 14)) continue;
    if (STYLE.clean) {
      // Fensterlaibung: Schatten oben links, Fensterbank unten
      ctx.fillStyle = 'rgba(30,40,80,0.18)';
      ctx.fillRect(xx - 1, winY + winH + 1, 17, 1.6);
    }
    fillRR(ctx, xx - 1, winY - 1, 16, winH + 2, 1.5, '#9aa9bb');
    const gl = ctx.createLinearGradient(xx, winY, xx + 14, winY + winH);
    gl.addColorStop(0, '#2c6bc7');
    gl.addColorStop(0.45, '#8ccaff');
    gl.addColorStop(0.55, '#3c82dd');
    gl.addColorStop(1, '#1d4f9e');
    fillRR(ctx, xx, winY, 14, winH, 1, gl);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillRect(xx + 7, winY, 0.8, winH);
    if (STYLE.clean) {
      ctx.fillStyle = 'rgba(10,30,80,0.35)';
      ctx.fillRect(xx, winY, 14, Math.max(0.8, winH * 0.12));
      ctx.fillRect(xx, winY, 1, winH);
      ctx.fillStyle = '#eef3f9';
      ctx.fillRect(xx - 1.5, winY + winH + 0.2, 17, 1.1);
    }
  }

  // Tore
  for (const gt of gates) {
    const gx = gt.cx - gt.w / 2, gw = gt.w;
    const gTop = wy + wh * 0.13, gH = y + h - gTop;
    // Torrahmen (Warnstreifen)
    hazard(ctx, gx - 4, gTop - 2, 4, gH + 2, 3);
    hazard(ctx, gx + gw, gTop - 2, 4, gH + 2, 3);
    // Innenraum
    const ig = ctx.createLinearGradient(0, gTop, 0, y + h);
    ig.addColorStop(0, '#0f141d');
    ig.addColorStop(0.6, '#1f2a3a');
    ig.addColorStop(1, '#34435a');
    ctx.fillStyle = ig;
    ctx.fillRect(gx, gTop, gw, gH);
    // Regale im Inneren
    ctx.fillStyle = 'rgba(255,140,0,0.35)';
    for (let k = 0; k < 3; k++) ctx.fillRect(gx + 2, gTop + gH * (0.3 + k * 0.17), gw * 0.25, 1);
    for (let k = 0; k < 3; k++) ctx.fillRect(gx + gw * 0.73, gTop + gH * (0.3 + k * 0.17), gw * 0.25, 1);
    const cols = ['#ff0a1e', '#0a5cff', '#ffe000', '#14d200', '#9410ff', '#00c8ff'];
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = rgba(cols[(k + (gt.cx | 0)) % 6], 0.45);
      const side = k < 3 ? gx + 2.5 : gx + gw * 0.74;
      ctx.fillRect(side + (k % 3) * 3.4, gTop + gH * (0.3 + (k % 2) * 0.17) - 2.5, 2.8, 2.5);
    }
    // Lichtkegel von innen
    const lg = ctx.createRadialGradient(gt.cx, gTop + 2, 0, gt.cx, gTop + 2, gH);
    lg.addColorStop(0, 'rgba(255,240,200,0.28)');
    lg.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(gx, gTop, gw, gH);
    if (STYLE.clean) {
      // Torlaibung: linke Innenwand im Licht, rechte im Schatten (Tiefe)
      const jd = Math.min(5, gw * 0.08);
      ctx.fillStyle = 'rgba(160,180,210,0.35)';
      ctx.beginPath(); ctx.moveTo(gx, gTop); ctx.lineTo(gx + jd, gTop + jd); ctx.lineTo(gx + jd, y + h); ctx.lineTo(gx, y + h); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.moveTo(gx + gw, gTop); ctx.lineTo(gx + gw - jd, gTop + jd); ctx.lineTo(gx + gw - jd, y + h); ctx.lineTo(gx + gw, y + h); ctx.fill();
      // Torabdichtung (schwarzer Gummirahmen) außen
      ctx.fillStyle = '#1b1e24';
      ctx.fillRect(gx - 5.5, gTop - 2, 1.5, gH + 2);
      ctx.fillRect(gx + gw + 4, gTop - 2, 1.5, gH + 2);
    }
    // Rolltor: aufgerollte Walze im Kasten
    const bx = gx - 3, bw = gw + 6, bh = Math.max(4, wh * 0.13);
    const bg = ctx.createLinearGradient(0, gTop - bh * 0.6, 0, gTop + bh * 0.6);
    bg.addColorStop(0, '#e5e9ee');
    bg.addColorStop(0.5, '#a7b0bb');
    bg.addColorStop(1, '#6d7682');
    fillRR(ctx, bx, gTop - bh * 0.55, bw, bh, bh * 0.45, bg);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(bx + 2, gTop - bh * 0.4, bw - 4, 0.8);
    // Torlamellen-Unterkante sichtbar
    ctx.fillStyle = '#c3cad4';
    ctx.fillRect(gx, gTop + bh * 0.45, gw, 2);
    ctx.fillStyle = '#ff8a00';
    ctx.fillRect(gx, gTop + bh * 0.45 + 2, gw, 1.2);
    // Schwelle
    ctx.fillStyle = '#8a93a0';
    ctx.fillRect(gx, y + h - 1.5, gw, 1.5);
    // Wandleuchte über dem Tor
    const lx = gt.cx, ly = gTop - bh * 0.55 - 3;
    if (ly > wy + 1) {
      fillRR(ctx, lx - 4, ly - 1.5, 8, 3, 1, '#39424f');
      ctx.fillStyle = '#fff6c2';
      ctx.fillRect(lx - 3, ly + 0.5, 6, 1);
    }
  }
  // Schild
  if (o.sign !== '') {
    const text = o.sign || 'PALLET RUSH';
    const sh = Math.max(10, wh * 0.46), sw2 = signW;
    const sx = signX - sw2 / 2, sy = wy + wh * 0.12;
    fillRR(ctx, sx + 1.5, sy + 2.5, sw2, sh, 4, 'rgba(20,40,80,0.25)');
    fillRR(ctx, sx, sy, sw2, sh, 4, '#0f4fc4');
    const pg = ctx.createLinearGradient(0, sy, 0, sy + sh);
    pg.addColorStop(0, '#3d8bff');
    pg.addColorStop(1, '#1559d6');
    fillRR(ctx, sx + 1.5, sy + 1.5, sw2 - 3, sh - 3, 3, pg);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(sx + 3, sy + 2, sw2 - 6, sh * 0.35);
    // Logo: gestapelte Paletten in Spielfarben
    const ls = sh * 0.62, lx = sx + sh * 0.25, ly = sy + (sh - ls) / 2;
    const lc = ['#ff0a1e', '#ffe000', '#14d200', '#00c8ff'];
    for (let k = 0; k < 4; k++) {
      const cx2 = lx + (k % 2) * ls * 0.52, cy2 = ly + Math.floor(k / 2) * ls * 0.52;
      fillRR(ctx, cx2, cy2, ls * 0.46, ls * 0.46, 1.5, lc[k]);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(cx2 + 1, cy2 + 1, ls * 0.46 - 2, ls * 0.1);
    }
    const tx = sx + sh * 0.25 + ls + (sw2 - sh * 0.25 - ls) / 2;
    let px = sh * 0.52;
    ctx.font = font(px);
    const maxW = sw2 - ls - sh * 0.6;
    const mw = ctx.measureText(text).width;
    if (mw > maxW) px *= maxW / mw;
    outlinedText(ctx, text, tx, sy + sh / 2 + px * 0.04, px, '#ffffff', '#0a3a99', px * 0.18);
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(sx + 3, sy + sh - 3.5, sw2 - 6, 1.5);
  }
  ctx.restore();
}

// ---------- Förderbänder ----------

// Polylinie → abgetasteter Pfad { pts:[{x,y,a,s}], length, at(s) → {x,y,a} }.
export function conveyorPath(points) {
  const pts = [];
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0) {
      const q = points[i - 1];
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < 1e-6) continue;
      s += d;
    }
    pts.push({ x: p.x, y: p.y, a: 0, s });
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.min(i, pts.length - 2)], b = pts[Math.min(i + 1, pts.length - 1)];
    pts[i].a = pts.length > 1 ? Math.atan2(b.y - a.y, b.x - a.x) : 0;
  }
  const length = s;
  const at = (q) => {
    if (pts.length === 1) return { x: pts[0].x, y: pts[0].y, a: 0 };
    q = Math.max(0, Math.min(length, q));
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].s <= q) lo = m; else hi = m; }
    const A = pts[lo], B = pts[hi];
    const t = (q - A.s) / ((B.s - A.s) || 1);
    return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, a: A.a };
  };
  return { pts, length, at, _off: new Map() };
}

// Ellipsenbogen als Punktliste (Winkel in Bogenmaß, Bildschirmkoordinaten).
export function arcPoints(cx, cy, rx, ry, a0, a1, n = 24) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + (a1 - a0) * (i / n);
    out.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
  }
  return out;
}

// Parallel versetzte Polylinie (gecacht im Pfadobjekt). d > 0 = links der Laufrichtung.
function offsetPts(path, d) {
  let v = path._off && path._off.get(d);
  if (v) return v;
  const P = path.pts, n = P.length;
  v = new Array(n);
  for (let i = 0; i < n; i++) {
    const a0 = P[Math.max(0, i - 1)], a1 = P[i], a2 = P[Math.min(n - 1, i + 1)];
    let n1x = 0, n1y = 0;
    if (i > 0) { const l = Math.hypot(a1.x - a0.x, a1.y - a0.y) || 1; n1x += (a1.y - a0.y) / l; n1y -= (a1.x - a0.x) / l; }
    if (i < n - 1) { const l = Math.hypot(a2.x - a1.x, a2.y - a1.y) || 1; n1x += (a2.y - a1.y) / l; n1y -= (a2.x - a1.x) / l; }
    const l = Math.hypot(n1x, n1y) || 1;
    let nx = n1x / l, ny = n1y / l;
    // Gehrungsfaktor
    let k = 1;
    if (i > 0 && i < n - 1) {
      const ll = Math.hypot(a2.y - a1.y, a2.x - a1.x) || 1;
      const dot = nx * ((a2.y - a1.y) / ll) + ny * (-(a2.x - a1.x) / ll);
      k = 1 / Math.max(0.5, dot);
    }
    v[i] = { x: a1.x - nx * d * k, y: a1.y - ny * d * k };
  }
  if (path._off) path._off.set(d, v);
  return v;
}

function polyline(ctx, P, dx = 0, dy = 0) {
  ctx.moveTo(P[0].x + dx, P[0].y + dy);
  for (let i = 1; i < P.length; i++) ctx.lineTo(P[i].x + dx, P[i].y + dy);
}

// Statischer Unterbau eines Förderbands (clean): Wurfschatten, Stützen mit Fußplatten,
// abgestufte Seitenwange, Geländer mit Licht oben links, Schrauben.
function conveyorBase3D(ctx, path, width, depth, col) {
  const P = path.pts, hw = width / 2;
  const legH = depth + 6;
  // Wurfschatten (weich, mehrstufig), nach rechts unten versetzt
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    polyline(ctx, P, legH * 0.4, legH * 0.55 + 1);
    ctx.lineWidth = width + 7 + k * 3.5;
    ctx.strokeStyle = `rgba(40,44,80,${0.1 - k * 0.025})`;
    ctx.stroke();
  }
  // Stützen: Fußschatten, Rohr (zylindrisch), Fußplatte
  const legs = [];
  for (let s = 10; s < path.length - 4; s += 30) {
    const p = path.at(s);
    const nx = -Math.sin(p.a), ny = Math.cos(p.a);
    for (const sg of [-1, 1]) legs.push([p.x + nx * (hw + 1) * sg, p.y + ny * (hw + 1) * sg]);
  }
  ctx.fillStyle = 'rgba(40,44,80,0.25)';
  ctx.beginPath();
  for (const [lx, ly] of legs) { ctx.moveTo(lx + 4.5, ly + legH + 0.5); ctx.ellipse(lx + 1.5, ly + legH + 0.5, 3, 1.3, 0, 0, TAU); }
  ctx.fill();
  ctx.fillStyle = '#4a525e';
  ctx.beginPath();
  for (const [lx, ly] of legs) ctx.rect(lx - 1.4, ly, 2.8, legH);
  ctx.fill();
  ctx.fillStyle = '#aab3bf';
  ctx.beginPath();
  for (const [lx, ly] of legs) ctx.rect(lx - 1.4, ly, 0.9, legH);
  ctx.fill();
  ctx.fillStyle = '#6c7582';
  ctx.beginPath();
  for (const [lx, ly] of legs) ctx.rect(lx - 2.6, ly + legH - 1.2, 5.2, 1.6);
  ctx.fill();
  // Seitenwange: von unten (dunkel) nach oben (heller) gestuft → wirkt gewölbt
  ctx.lineJoin = 'round';
  const steps = [[1, -0.5], [0.75, -0.42], [0.5, -0.33], [0.25, -0.24]];
  for (const [f, sh] of steps) {
    ctx.beginPath();
    polyline(ctx, P, 0, depth * f);
    ctx.lineWidth = width + 6;
    ctx.strokeStyle = shade(col, sh);
    ctx.stroke();
  }
  // Geländer oben
  ctx.beginPath();
  polyline(ctx, P);
  ctx.lineWidth = width + 6;
  ctx.strokeStyle = col;
  ctx.stroke();
  // Profil des Geländers: Außenlippe hell (Licht), Innenkante dunkel (Falz zum Band)
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = shade(col, 0.5);
  ctx.beginPath(); polyline(ctx, offsetPts(path, hw + 2.3)); ctx.stroke();
  ctx.beginPath(); polyline(ctx, offsetPts(path, -hw - 2.3)); ctx.stroke();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = shade(col, 0.22);
  ctx.beginPath(); polyline(ctx, offsetPts(path, hw + 1.2)); ctx.stroke();
  ctx.beginPath(); polyline(ctx, offsetPts(path, -hw - 1.2)); ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = shade(col, -0.45);
  ctx.beginPath(); polyline(ctx, offsetPts(path, hw + 0.3)); ctx.stroke();
  ctx.beginPath(); polyline(ctx, offsetPts(path, -hw - 0.3)); ctx.stroke();
  // Schrauben mit Glanzpunkt
  const bolts = [];
  for (let s = 6; s < path.length; s += 15) {
    const p = path.at(s);
    const nx = -Math.sin(p.a), ny = Math.cos(p.a);
    for (const sg of [-1, 1]) bolts.push([p.x + nx * (hw + 1.6) * sg, p.y + ny * (hw + 1.6) * sg]);
  }
  ctx.fillStyle = shade(col, -0.55);
  ctx.beginPath();
  for (const [bx, by] of bolts) { ctx.moveTo(bx + 0.85, by); ctx.arc(bx, by, 0.85, 0, TAU); }
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  for (const [bx, by] of bolts) ctx.rect(bx - 0.5, by - 0.5, 0.45, 0.45);
  ctx.fill();
  // Bandbett (falls das Band einmal nicht gezeichnet wird)
  ctx.beginPath();
  polyline(ctx, P);
  ctx.lineWidth = width;
  ctx.strokeStyle = '#2b3038';
  ctx.stroke();
}

// Förderband entlang eines Pfades. phase = zurückgelegte Strecke in px.
// o = { color: Akzentfarbe Geländer, flowDir: 1|-1, depth, layer: 'all'|'base'|'belt', pitch }
// layer 'base' = statischer Teil (Schatten, Stützen, Geländer) für den Hintergrund-Cache,
// layer 'belt' = nur das laufende Gurtband (pro Frame).
export function drawConveyor(ctx, path, width, phase = 0, o = {}) {
  const col = o.color || '#ff8a00';
  const dir = o.flowDir ?? 1;
  const depth = o.depth ?? Math.max(3, width * 0.32);
  const layer = o.layer || 'all';
  const P = path.pts, hw = width / 2;
  if (P.length < 2) return;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  if (layer !== 'belt' && STYLE.clean) {
    conveyorBase3D(ctx, path, width, depth, col);
  } else if (layer !== 'belt') {
    // Schatten
    ctx.beginPath();
    polyline(ctx, P, width * 0.18, depth + width * 0.28);
    ctx.lineWidth = width + 8;
    ctx.strokeStyle = 'rgba(25,35,45,0.18)';
    ctx.stroke();
    // Stützen
    ctx.fillStyle = '#5b6470';
    ctx.beginPath();
    const step = 28;
    for (let s = 10; s < path.length - 4; s += step) {
      const p = path.at(s);
      const nx = -Math.sin(p.a), ny = Math.cos(p.a);
      for (const sg of [-1, 1]) {
        const lx = p.x + nx * (hw + 1.5) * sg, ly = p.y + ny * (hw + 1.5) * sg;
        ctx.rect(lx - 1.1, ly, 2.2, depth + 3.5);
      }
    }
    ctx.fill();
    // Seitenfläche
    ctx.beginPath();
    polyline(ctx, P, 0, depth);
    ctx.lineWidth = width + 6;
    ctx.strokeStyle = shade(col, -0.42);
    ctx.stroke();
    ctx.beginPath();
    polyline(ctx, P, 0, depth * 0.5);
    ctx.strokeStyle = shade(col, -0.28);
    ctx.stroke();
    // Geländer (Akzentfarbe)
    ctx.beginPath();
    polyline(ctx, P);
    ctx.lineWidth = width + 6;
    ctx.strokeStyle = col;
    ctx.stroke();
    // Glanzkanten der Geländer
    ctx.lineWidth = 1;
    ctx.strokeStyle = shade(col, 0.45);
    ctx.beginPath(); polyline(ctx, offsetPts(path, hw + 2.2)); ctx.stroke();
    ctx.beginPath(); polyline(ctx, offsetPts(path, -hw - 2.2)); ctx.stroke();
    ctx.strokeStyle = shade(col, -0.35);
    ctx.beginPath(); polyline(ctx, offsetPts(path, hw + 0.4)); ctx.stroke();
    ctx.beginPath(); polyline(ctx, offsetPts(path, -hw - 0.4)); ctx.stroke();
    // Schrauben
    ctx.fillStyle = shade(col, -0.5);
    ctx.beginPath();
    for (let s = 6; s < path.length; s += 14) {
      const p = path.at(s);
      const nx = -Math.sin(p.a), ny = Math.cos(p.a);
      for (const sg of [-1, 1]) {
        const bx = p.x + nx * (hw + 1.5) * sg, by = p.y + ny * (hw + 1.5) * sg;
        ctx.moveTo(bx + 0.8, by);
        ctx.arc(bx, by, 0.8, 0, TAU);
      }
    }
    ctx.fill();
  }
  if (layer !== 'base') {
    // Gurtband
    ctx.beginPath();
    polyline(ctx, P);
    ctx.lineWidth = width;
    ctx.strokeStyle = '#2b3038';
    ctx.stroke();
    ctx.lineWidth = width * 0.45;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.stroke();
    // Querrippen, laufen mit phase
    const pitch = o.pitch || Math.max(4.5, width * 0.3);
    const off = (((phase * dir) % pitch) + pitch) % pitch;
    const rl = hw - 1.2;
    const hi = new Path2D(), lo = new Path2D();
    let seg = 0;
    for (let s = off; s < path.length; s += pitch) {
      while (seg < P.length - 2 && P[seg + 1].s <= s) seg++;
      const A = P[seg], B = P[seg + 1];
      const t = (s - A.s) / ((B.s - A.s) || 1);
      const x = A.x + (B.x - A.x) * t, y = A.y + (B.y - A.y) * t;
      const nx = -Math.sin(A.a), ny = Math.cos(A.a), tx = Math.cos(A.a), ty = Math.sin(A.a);
      hi.moveTo(x + nx * rl, y + ny * rl);
      hi.lineTo(x - nx * rl, y - ny * rl);
      lo.moveTo(x + nx * rl + tx * 1.2, y + ny * rl + ty * 1.2);
      lo.lineTo(x - nx * rl + tx * 1.2, y - ny * rl + ty * 1.2);
    }
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#151820';
    ctx.stroke(lo);
    ctx.strokeStyle = '#5b6371';
    ctx.stroke(hi);
    if (STYLE.clean) {
      // Wölbung des Gurts: heller Mittelstreifen, Seitenwangen werfen Schatten aufs Band
      ctx.lineWidth = width * 0.22;
      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.beginPath(); polyline(ctx, offsetPts(path, hw * 0.25)); ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath(); polyline(ctx, offsetPts(path, hw - 1.5)); ctx.stroke();
      ctx.beginPath(); polyline(ctx, offsetPts(path, -hw + 1.5)); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); polyline(ctx, offsetPts(path, hw - 0.5)); ctx.stroke();
      ctx.beginPath(); polyline(ctx, offsetPts(path, -hw + 0.5)); ctx.stroke();
    } else {
      // Kantenschatten zum Geländer
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); polyline(ctx, offsetPts(path, hw - 0.5)); ctx.stroke();
    }
  }
  ctx.restore();
}

// Weiche (Klappe), an der beide Spuren zusammenlaufen. side −1 = links ist dran, 1 = rechts
// (Zwischenwerte für Animation erlaubt). s = Durchmesser.
export function drawMergeSwitch(ctx, x, y, s, side = -1) {
  const r = s / 2;
  ctx.save();
  // Grundplatte mit Warnring
  ellipse(ctx, x + 1, y + 3, r * 1.02, r * 0.95, 'rgba(20,30,40,0.25)');
  ellipse(ctx, x, y + r * 0.18, r, r * 0.92, '#3b4350');
  circle(ctx, x, y, r, '#1d1f24');
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r - 0.5, 0, TAU);
  ctx.arc(x, y, r * 0.74, 0, TAU, true);
  ctx.clip();
  ctx.lineWidth = r * 0.3;
  ctx.strokeStyle = '#ffcc00';
  ctx.setLineDash([r * 0.32, r * 0.32]);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.87, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  const pg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r * 0.75);
  pg.addColorStop(0, '#e9eef3');
  pg.addColorStop(1, '#8e98a5');
  circle(ctx, x, y, r * 0.72, pg);
  // Klappe zeigt zur gesperrten Seite
  const ang = -Math.PI / 2 - side * 0.62;
  const L = r * 0.95;
  ctx.save();
  ctx.translate(x, y + r * 0.35);
  ctx.rotate(ang + Math.PI / 2);
  fillRR(ctx, -r * 0.13 + 1, -L + 2, r * 0.26, L, r * 0.12, 'rgba(0,0,0,0.3)');
  fillRR(ctx, -r * 0.13, -L, r * 0.26, L, r * 0.12, '#ff8a00');
  ctx.fillStyle = '#ffd08a';
  ctx.fillRect(-r * 0.06, -L + r * 0.1, r * 0.05, L - r * 0.25);
  ctx.restore();
  circle(ctx, x, y + r * 0.35, r * 0.16, '#39414c');
  circle(ctx, x - r * 0.04, y + r * 0.31, r * 0.07, '#c9d1da');
  // Pfeillicht zur aktiven Seite
  const lx = x, ly = y - r * 0.1;
  const dirx = side < 0 ? -1 : 1;
  fillRR(ctx, lx - r * 0.34, ly - r * 0.2, r * 0.68, r * 0.4, r * 0.12, '#15181d');
  ctx.beginPath();
  ctx.moveTo(lx + dirx * r * 0.26, ly);
  ctx.lineTo(lx - dirx * r * 0.02, ly - r * 0.15);
  ctx.lineTo(lx - dirx * r * 0.02, ly - r * 0.05);
  ctx.lineTo(lx - dirx * r * 0.24, ly - r * 0.05);
  ctx.lineTo(lx - dirx * r * 0.24, ly + r * 0.05);
  ctx.lineTo(lx - dirx * r * 0.02, ly + r * 0.05);
  ctx.lineTo(lx - dirx * r * 0.02, ly + r * 0.15);
  ctx.closePath();
  ctx.fillStyle = '#4dff8a';
  ctx.fill();
  ellipse(ctx, lx, ly, r * 0.45, r * 0.3, 'rgba(77,255,138,0.18)');
  ctx.restore();
}

// Ladestation: Scannerbogen mit gelb-schwarzem Rahmen und Ampel. t = Zeit in s.
// ok = true → grün, false → rot.
export function drawLoadingStation(ctx, x, y, s, t = 0, ok = true) {
  const w = s, ph = s * 0.12, h = s * 0.5;
  ctx.save();
  // Schatten
  fillRR(ctx, x - w / 2 + 2, y - ph + 3, w + 2, ph * 2, 2, 'rgba(20,30,40,0.22)');
  // Pfosten (Säulen) mit Seitenfläche
  for (const sg of [-1, 1]) {
    const px = x + sg * (w / 2 - ph / 2) - ph / 2;
    fillRR(ctx, px, y - h, ph, h + ph * 0.6, 1.5, '#2a2e35');
    hazard(ctx, px + 0.6, y - h + 1, ph - 1.2, h - 1, ph * 0.55);
    fillRR(ctx, px - 0.5, y + ph * 0.1, ph + 1, ph * 0.6, 1, '#6c7480');
  }
  // Querträger
  const by = y - h - ph * 0.9;
  fillRR(ctx, x - w / 2 - 1, by + ph * 0.5, w + 2, ph * 1.2, 2, '#1e2229');
  const bg = ctx.createLinearGradient(0, by, 0, by + ph * 1.2);
  bg.addColorStop(0, '#ffe066');
  bg.addColorStop(1, '#f2b500');
  fillRR(ctx, x - w / 2 - 1, by, w + 2, ph * 1.2, 2, bg);
  ctx.fillStyle = '#20242b';
  ctx.fillRect(x - w * 0.22, by + ph * 0.3, w * 0.44, ph * 0.6);
  // Scannerlinie (rot, wandert)
  const sweep = (Math.sin(t * 5) * 0.5 + 0.5);
  const sy = y - h + 2 + sweep * (h - 2);
  ctx.fillStyle = 'rgba(255,40,60,0.85)';
  ctx.fillRect(x - w / 2 + ph, sy, w - ph * 2, 1);
  ctx.fillStyle = 'rgba(255,40,60,0.18)';
  ctx.fillRect(x - w / 2 + ph, sy - 1.5, w - ph * 2, 4);
  // Display
  ctx.fillStyle = ok ? '#55ff9a' : '#ff5a5a';
  const blink = (Math.sin(t * 8) > 0.2) ? 1 : 0.35;
  ctx.globalAlpha = blink;
  ctx.fillRect(x - w * 0.18, by + ph * 0.45, w * 0.36 * (0.4 + 0.6 * sweep), ph * 0.3);
  ctx.globalAlpha = 1;
  // Ampel auf dem Träger
  const lr = Math.max(1.6, ph * 0.55);
  const lx = x + w / 2 - ph * 0.2;
  fillRR(ctx, lx - lr * 1.2, by - lr * 3.9, lr * 2.4, lr * 4.2, lr * 0.6, '#262a31');
  circle(ctx, lx, by - lr * 2.8, lr * 0.75, ok ? '#5a1a1a' : '#ff3b3b');
  circle(ctx, lx, by - lr * 0.95, lr * 0.75, ok ? '#3dff7e' : '#1d4a2a');
  const gx = lx, gy = ok ? by - lr * 0.95 : by - lr * 2.8;
  circle(ctx, gx, gy, lr * 1.8, ok ? 'rgba(61,255,126,0.22)' : 'rgba(255,59,59,0.22)');
  circle(ctx, gx - lr * 0.25, gy - lr * 0.25, lr * 0.25, 'rgba(255,255,255,0.8)');
  ctx.restore();
}

// Horizontale Rollenbahn entlang der Rampen. phase = Laufstrecke in px.
export function drawDockConveyor(ctx, x1, x2, y, width, phase = 0, o = {}) {
  const hw = width / 2, depth = Math.max(3, width * 0.35);
  const layer = o.layer || 'all';
  ctx.save();
  if (layer !== 'belt' && STYLE.clean) {
    const W = x2 - x1, top = y - hw - 3, fh = width + 6;
    // Wurfschatten (weich) nach rechts unten
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = `rgba(40,44,80,${0.12 - k * 0.03})`;
      ctx.fillRect(x1 + 2 - k, top + depth + 4 - k * 0.5, W + 4 + k * 2, fh + 2 + k * 2);
    }
    // Stützen mit Fußplatte
    for (let xx = x1 + 10; xx < x2 - 4; xx += 34) {
      ellipse(ctx, xx + 2.5, y + hw + depth + 6, 3.2, 1.2, 'rgba(40,44,80,0.25)');
      ctx.fillStyle = '#4a525e'; ctx.fillRect(xx, y + hw, 2.6, depth + 6);
      ctx.fillStyle = '#aab3bf'; ctx.fillRect(xx, y + hw, 0.9, depth + 6);
      ctx.fillStyle = '#6c7582'; ctx.fillRect(xx - 1.2, y + hw + depth + 5, 5, 1.4);
    }
    // Rahmen: Seitenwange (Verlauf) und Oberkante
    const sg = ctx.createLinearGradient(0, top + fh, 0, top + fh + depth);
    sg.addColorStop(0, '#2a6fe0');
    sg.addColorStop(1, '#0d3d9c');
    ctx.fillStyle = sg;
    ctx.fillRect(x1 - 2, top + depth, W + 4, fh);
    const tg = ctx.createLinearGradient(0, top, 0, top + fh);
    tg.addColorStop(0, '#5d9cff');
    tg.addColorStop(0.25, '#2f7bf0');
    tg.addColorStop(1, '#1a62da');
    ctx.fillStyle = tg;
    ctx.fillRect(x1 - 2, top, W + 4, fh);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(x1 - 2, top, W + 4, 0.9);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x1 - 2, y + hw + 0.4, W + 4, 0.7);
    ctx.fillStyle = 'rgba(0,20,70,0.5)';
    ctx.fillRect(x1 - 2, y - hw - 0.7, W + 4, 0.8);
    ctx.fillStyle = 'rgba(0,10,40,0.45)';
    ctx.fillRect(x1 - 2, top + fh + depth - 0.8, W + 4, 0.8);
    // Endkappen (gelb, mit Höhe)
    for (const ex of [x1 - 5, x2 + 1]) {
      fillRR(ctx, ex, top - 0.5 + depth, 4.5, fh + 1, 1.5, '#c99400');
      fillRR(ctx, ex, top - 0.5, 4.5, fh + 1, 1.5, '#ffd21a');
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(ex + 0.8, top, 1, fh);
    }
  } else if (layer !== 'belt') {
    // Schatten und Stützen
    ctx.fillStyle = 'rgba(25,35,45,0.2)';
    ctx.fillRect(x1 + 2, y - hw + depth + 2, x2 - x1, width + 3);
    ctx.fillStyle = '#56606c';
    for (let xx = x1 + 8; xx < x2 - 4; xx += 30) {
      ctx.fillRect(xx, y + hw, 2.2, depth + 3);
    }
    // Rahmen mit Seitenfläche
    ctx.fillStyle = '#1559d6';
    ctx.fillRect(x1 - 2, y - hw - 3 + depth, x2 - x1 + 4, width + 6);
    ctx.fillStyle = '#1f6fe8';
    ctx.fillRect(x1 - 2, y - hw - 3, x2 - x1 + 4, width + 6);
    ctx.fillStyle = '#7fb2ff';
    ctx.fillRect(x1 - 2, y - hw - 3, x2 - x1 + 4, 1);
    ctx.fillRect(x1 - 2, y + hw, x2 - x1 + 4, 0.8);
    ctx.fillStyle = '#0c3c9a';
    ctx.fillRect(x1 - 2, y - hw - 0.6, x2 - x1 + 4, 0.8);
    // Endkappen
    fillRR(ctx, x1 - 4, y - hw - 3.5, 4, width + 7 + depth, 1.5, '#ffcc00');
    fillRR(ctx, x2, y - hw - 3.5, 4, width + 7 + depth, 1.5, '#ffcc00');
  }
  if (layer !== 'base') {
    // Rollenbett
    ctx.fillStyle = '#20242b';
    ctx.fillRect(x1, y - hw, x2 - x1, width);
    const pitch = Math.max(4, width * 0.42);
    const off = ((phase % pitch) + pitch) % pitch;
    ctx.beginPath();
    for (let xx = x1 + off; xx < x2; xx += pitch) ctx.rect(xx, y - hw + 0.8, pitch * 0.62, width - 1.6);
    ctx.fillStyle = '#9aa3ae';
    ctx.fill();
    if (STYLE.clean) {
      // Rollen zylindrisch: dunkle rechte Hälfte, heller Glanzstreifen links
      ctx.beginPath();
      for (let xx = x1 + off; xx < x2; xx += pitch) ctx.rect(xx + pitch * 0.36, y - hw + 0.8, pitch * 0.26, width - 1.6);
      ctx.fillStyle = '#6d7683';
      ctx.fill();
    }
    ctx.beginPath();
    for (let xx = x1 + off; xx < x2; xx += pitch) ctx.rect(xx + pitch * 0.12, y - hw + 0.8, pitch * 0.18, width - 1.6);
    ctx.fillStyle = '#e8edf2';
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x1, y + hw - 1.5, x2 - x1, 1.5);
    if (STYLE.clean) {
      // Schatten der Oberkante des Rahmens auf die Rollen
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x1, y - hw, x2 - x1, 1.6);
    }
  }
  ctx.restore();
}

// ---------- Rampen ----------

// Rampenkante (erhöhte Plattform) mit Stahlkante, Warnstreifen und Puffern.
// o = { bumpersAt: [x, ...] } optionale Pufferpositionen.
export function drawDockWall(ctx, x, y, w, h, o = {}) {
  ctx.save();
  // Schatten auf den Boden
  const sg = ctx.createLinearGradient(0, y + h, 0, y + h + 7);
  sg.addColorStop(0, 'rgba(20,30,40,0.3)');
  sg.addColorStop(1, 'rgba(20,30,40,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(x, y + h, w, 7);
  // Stahlkante oben
  ctx.fillStyle = '#c6cdd6';
  ctx.fillRect(x, y, w, h * 0.3);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w, 0.8);
  // Stirnfläche mit Warnstreifen
  hazard(ctx, x, y + h * 0.3, w, h * 0.45, Math.max(3, h * 0.45));
  ctx.fillStyle = '#5d6672';
  ctx.fillRect(x, y + h * 0.75, w, h * 0.25);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x, y + h * 0.3, w, 0.8);
  for (const bx of o.bumpersAt || []) {
    fillRR(ctx, bx - 3, y + h * 0.15, 6, h * 0.95, 1.2, '#1a1c20');
    ctx.fillStyle = '#3b3f47';
    ctx.fillRect(bx - 2, y + h * 0.2, 4, 1);
  }
  ctx.restore();
}

// Cleane Parkbucht: abgerundete, leicht vertiefte Fläche in LKW-Breite.
function drawDockBayClean(ctx, cx, top, w, h, o) {
  const hl = o.highlight || 0, occ = !!o.occupied;
  const x = cx - w / 2, y = top + 3, hh = h - 5, r = Math.min(9, w * 0.3);
  ctx.save();
  // Vertiefung: dunkler Rand oben, heller unten (wirkt eingelassen)
  ctx.beginPath(); rr(ctx, x, y, w, hh, r);
  const g = ctx.createLinearGradient(0, y, 0, y + hh);
  g.addColorStop(0, o.extra ? '#a9d8ea' : '#aeb3c9');
  g.addColorStop(1, o.extra ? '#bfe6f3' : '#bfc3d6');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(60,66,100,0.16)';
  ctx.beginPath(); rr(ctx, x - 1, y - 2, w + 2, hh + 4, r + 1); ctx.stroke();
  ctx.restore();
  // Lichtkante unten (Stufe zurück auf den Hof) + Umgebungsverdeckung oben
  ctx.save();
  ctx.beginPath(); rr(ctx, x, y, w, hh, r); ctx.clip();
  const ao = ctx.createLinearGradient(0, y, 0, y + 14);
  ao.addColorStop(0, 'rgba(40,44,80,0.28)');
  ao.addColorStop(1, 'rgba(40,44,80,0)');
  ctx.fillStyle = ao;
  ctx.fillRect(x, y, w, 14);
  // Fahrspuren der Räder: zwei sehr dezente, hellere Bahnen
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(cx - w * 0.3, y + 10, w * 0.14, hh - 18);
  ctx.fillRect(cx + w * 0.16, y + 10, w * 0.14, hh - 18);
  ctx.restore();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  if (o.extra) ctx.setLineDash([5, 4]);
  ctx.beginPath(); rr(ctx, x + 0.75, y + 0.75, w - 1.5, hh - 1.5, r); ctx.stroke();
  ctx.setLineDash([]);
  // Gelbe Einweislinien mit Schlagschatten
  const gl = Math.min(hh * 0.45, 46);
  for (const sx of [cx - w * 0.36, cx + w * 0.36 - 2]) {
    ctx.fillStyle = 'rgba(40,44,80,0.18)';
    ctx.fillRect(sx + 0.6, y + 12.6, 2, gl);
    ctx.fillStyle = o.extra ? '#3fd8f5' : '#ffc928';
    ctx.fillRect(sx, y + 12, 2, gl);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(sx, y + 12, 0.7, gl);
  }
  // Rampenleveller (Stahlplatte mit Riffeln und Warnkante)
  const lw = w * 0.56, lx = cx - lw / 2, lh = 6;
  fillRR(ctx, lx + 0.8, top + 1.5, lw, lh, 1.2, 'rgba(40,44,80,0.3)');
  const lg = ctx.createLinearGradient(0, top, 0, top + lh);
  lg.addColorStop(0, '#e3e7ee');
  lg.addColorStop(1, '#9aa2b0');
  fillRR(ctx, lx, top, lw, lh, 1.2, lg);
  ctx.strokeStyle = 'rgba(80,90,110,0.45)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let px = lx + 2; px < lx + lw - 1.5; px += 3) {
    ctx.moveTo(px - 0.7, top + 1.6); ctx.lineTo(px + 0.7, top + 2.6);
    ctx.moveTo(px + 0.7, top + 3.2); ctx.lineTo(px - 0.7, top + 4.2);
  }
  ctx.stroke();
  hazard(ctx, lx, top + lh - 1.5, lw, 1.5, 2);
  // Gummipuffer links/rechts (Quader mit heller Oberseite)
  for (const sg of [-1, 1]) {
    const bx = cx + sg * (lw / 2 + 3.2) - 2.6;
    fillRR(ctx, bx + 1, top + 1.5, 5.2, 6.5, 1.2, 'rgba(40,44,80,0.3)');
    fillRR(ctx, bx, top - 1, 5.2, 7.5, 1.2, '#15171b');
    fillRR(ctx, bx, top - 1, 5.2, 3.2, 1.2, '#3d424b');
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(bx + 0.8, top - 0.6, 3.6, 0.6);
  }
  // Rampenampel: Gehäuse mit Linse und Lichtschein
  const ax = cx, ay = top + 12.5;
  fillRR(ctx, ax - 3.6 + 0.8, ay - 3.6 + 1.2, 7.2, 7.2, 2, 'rgba(40,44,80,0.3)');
  fillRR(ctx, ax - 3.6, ay - 3.6, 7.2, 7.2, 2, '#23262d');
  const lc = occ ? ['#ffb3ba', '#ff3b4e', '#b0102a'] : ['#c8ffd8', '#2ee86a', '#0f8a3a'];
  circle(ctx, ax, ay, 5.5, occ ? 'rgba(255,59,78,0.2)' : 'rgba(46,232,106,0.22)');
  const lgr = ctx.createRadialGradient(ax - 0.8, ay - 0.8, 0.2, ax, ay, 2.6);
  lgr.addColorStop(0, lc[0]); lgr.addColorStop(0.5, lc[1]); lgr.addColorStop(1, lc[2]);
  circle(ctx, ax, ay, 2.5, lgr);
  // Nummer: aufgemalt, leicht vertieft
  ctx.font = font(Math.min(13, w * 0.45));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const num = o.extra ? '+' : String((o.index ?? 0) + 1);
  ctx.fillStyle = 'rgba(40,44,80,0.18)';
  ctx.fillText(num, cx + 0.6, y + hh - 10.4);
  ctx.fillStyle = occ ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.92)';
  ctx.fillText(num, cx, y + hh - 11);
  if (hl > 0) {
    for (let i = 0; i < 3; i++) {
      ctx.lineWidth = 6 - i * 2;
      ctx.strokeStyle = rgba(o.extra ? '#00e5ff' : '#fff27a', (0.18 + i * 0.25) * hl);
      ctx.beginPath(); rr(ctx, x, y, w, hh, r); ctx.stroke();
    }
  }
  ctx.restore();
}

// Eine Parkbucht vor der Rampe. top = Oberkante (= Unterkante Rampenwand).
// o = { index, highlight: 0..1, occupied, extra, floor: true, t }
export function drawDockBay(ctx, cx, top, w, h, o = {}) {
  if (STYLE.clean) return drawDockBayClean(ctx, cx, top, w, h, o);
  const hl = o.highlight || 0;
  const acc = o.extra ? '#00c8ff' : '#ffcc00';
  const x = cx - w / 2;
  ctx.save();
  // Boden der Bucht
  if (o.floor !== false) {
    const fg = ctx.createLinearGradient(0, top, 0, top + h);
    fg.addColorStop(0, '#cfd3d9');
    fg.addColorStop(1, '#dde0e5');
    ctx.fillStyle = fg;
    ctx.fillRect(x + 2, top, w - 4, h);
    // Reifenspuren
    ctx.fillStyle = 'rgba(40,45,55,0.045)';
    ctx.fillRect(cx - w * 0.26, top + 8, w * 0.1, h - 10);
    ctx.fillRect(cx + w * 0.16, top + 8, w * 0.1, h - 10);
    ctx.fillStyle = 'rgba(40,45,55,0.05)';
    ctx.fillRect(cx - w * 0.3, top + h * 0.1, w * 0.6, h * 0.1);
  }
  // Rampenleveller (Riffelblech) mit Gummi-Puffern
  const lw = w * 0.5, lh = Math.max(6, h * 0.075);
  const lx = cx - lw / 2;
  fillRR(ctx, lx - 1, top, lw + 2, lh + 2, 1.5, '#5d6672');
  const lg = ctx.createLinearGradient(0, top, 0, top + lh);
  lg.addColorStop(0, '#d9dee5');
  lg.addColorStop(1, '#9fa8b4');
  fillRR(ctx, lx, top, lw, lh, 1, lg);
  ctx.strokeStyle = 'rgba(80,90,105,0.5)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let i = 0; i < lw / 3.5; i++) {
    for (let j = 0; j < lh / 3; j++) {
      const px = lx + 1.8 + i * 3.5, py = top + 1.5 + j * 3;
      if (px > lx + lw - 1.5) continue;
      if ((i + j) % 2) { ctx.moveTo(px - 0.8, py - 0.6); ctx.lineTo(px + 0.8, py + 0.6); } else { ctx.moveTo(px - 0.8, py + 0.6); ctx.lineTo(px + 0.8, py - 0.6); }
    }
  }
  ctx.stroke();
  hazard(ctx, lx, top + lh - 1.6, lw, 1.6, 2);
  for (const sg of [-1, 1]) {
    const bx = cx + sg * (lw / 2 + 4.5) - 3;
    box(ctx, bx, top, 6, 5, 4, '#2c3038', '#111317', 1.2);
    ctx.fillStyle = '#4a505a';
    ctx.fillRect(bx + 1, top + 1, 4, 1);
  }
  // Rampenampel
  const occ = !!o.occupied;
  const sx = x + 6, sy = top + 4;
  fillRR(ctx, sx - 2.6, sy - 2.6, 5.2, 5.2, 1.5, '#23262c');
  circle(ctx, sx, sy, 1.8, occ ? '#ff3b3b' : '#3dff7e');
  circle(ctx, sx, sy, 4, occ ? 'rgba(255,59,59,0.2)' : 'rgba(61,255,126,0.22)');
  // Buchtlinien
  ctx.fillStyle = acc;
  ctx.fillRect(x + 1, top + 2, 2.6, h - 4);
  ctx.fillRect(x + w - 3.6, top + 2, 2.6, h - 4);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(x + 1, top + h - 2, 2.6, 1);
  ctx.fillRect(x + w - 3.6, top + h - 2, 2.6, 1);
  // Einweis-Winkel
  ctx.strokeStyle = rgba(acc, 0.85);
  ctx.lineWidth = 2;
  ctx.lineJoin = 'miter';
  for (let k = 0; k < 2; k++) {
    const yy = top + h * 0.28 + k * 7;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.12, yy + w * 0.07);
    ctx.lineTo(cx, yy);
    ctx.lineTo(cx + w * 0.12, yy + w * 0.07);
    ctx.stroke();
  }
  // Große Nummer auf dem Boden
  const num = String((o.index ?? 0) + 1);
  const px = Math.min(w * 0.46, h * 0.36);
  ctx.font = font(px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillText(num, cx + 1, top + h * 0.68 + 1.5);
  ctx.fillStyle = occ ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.95)';
  ctx.fillText(num, cx, top + h * 0.68);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = rgba(acc, occ ? 0.4 : 0.9);
  ctx.strokeText(num, cx, top + h * 0.68);
  if (o.extra) {
    // Plus-Plakette für Extra-Rampe
    drawBadge(ctx, x + w - 9, top + 12, 6, '#00b8d4', '+');
  }
  // Auswahl-Leuchten
  if (hl > 0) {
    ctx.fillStyle = rgba(o.extra ? '#00e5ff' : '#ffe14d', 0.18 * hl);
    ctx.fillRect(x + 3, top + 2, w - 6, h - 4);
    for (let i = 0; i < 3; i++) {
      ctx.lineWidth = 6 - i * 2;
      ctx.strokeStyle = rgba(o.extra ? '#00e5ff' : '#fff27a', (0.18 + i * 0.25) * hl);
      ctx.beginPath();
      rr(ctx, x + 3, top + 2, w - 6, h - 4, 6);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------- Pflanzen ----------

const TREES = [
  { c: ['#2a8f3e', '#43b14c', '#6cd25a', '#b2f07c'] },               // 0 Laubbaum
  { c: ['#1d6f3b', '#2a8c47', '#46ad5c', '#86d784'] },               // 1 dunkler Laubbaum
  { c: ['#c93f86', '#ec65a6', '#ff98c6', '#ffd6ea'], blossom: true }, // 2 Blütenbaum
  { c: ['#2f9a3c', '#4dba47', '#79d655', '#c0f287'], fruit: true },   // 3 Obstbaum
  { c: ['#7f9e16', '#a8c823', '#cde445', '#f2fa96'] },               // 4 hellgrün
  { c: ['#17633a', '#227a45', '#35995a', '#6cc47c'], pine: true },    // 5 Nadelbaum
];
export const TREE_VARIANTS = TREES.length;

// Laubkugel mit Licht von oben links: heller Kern, dunkle Unterseite rechts unten.
function leafBall(ctx, x, y, r, c) {
  const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x - r * 0.1, y - r * 0.1, r * 1.12);
  g.addColorStop(0, c[3]);
  g.addColorStop(0.32, c[2]);
  g.addColorStop(0.7, c[1]);
  g.addColorStop(1, c[0]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
}

// Weicher Schlagschatten eines runden Objekts nach rechts unten (Kontakt + Wurf).
function castShadow(ctx, x, y, r, len, a = 0.3) {
  // Wurfschatten: gestreckte Ellipse von der Basis nach rechts unten
  ctx.save();
  ctx.translate(x + len * 0.55, y + len * 0.22);
  ctx.rotate(0.38);
  ctx.scale(1, 0.55);
  const R1 = r + len * 0.45;
  const g = ctx.createRadialGradient(0, 0, R1 * 0.15, 0, 0, R1);
  g.addColorStop(0, `rgba(40,44,80,${a})`);
  g.addColorStop(0.55, `rgba(40,44,80,${a * 0.75})`);
  g.addColorStop(1, 'rgba(40,44,80,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R1, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// Baum in Schrägaufsicht: Schlagschatten, sichtbarer Stamm, Krone aus schattierten Kugeln.
export function drawTree(ctx, x, y, r, variant = 0) {
  if (STYLE.clean) return drawTree3D(ctx, x, y, r, variant);
  return drawTreeFlat(ctx, x, y, r, variant);
}

function drawTree3D(ctx, x, y, r, variant) {
  const v = TREES[((variant % TREES.length) + TREES.length) % TREES.length];
  const R = rng(((x * 13 + y * 7) | 0) + variant * 101);
  const lift = r * 1.0;          // Kronenmitte über dem Fußpunkt
  const cy = y - lift;
  ctx.save();
  // Schlagschatten der Krone (nach rechts unten) und Kontaktschatten am Stamm
  castShadow(ctx, x - r * 0.05, y - r * 0.08, r * 0.85, r * 0.95, 0.34);
  ellipse(ctx, x + r * 0.05, y + r * 0.02, r * 0.3, r * 0.12, 'rgba(40,40,70,0.35)');
  // Stamm (zylindrisch schattiert) mit Wurzelansatz
  const tw = r * 0.24;
  const tg = ctx.createLinearGradient(x - tw / 2, 0, x + tw / 2, 0);
  tg.addColorStop(0, '#a26d3e');
  tg.addColorStop(0.4, '#8a5a31');
  tg.addColorStop(1, '#4e2f17');
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(x - tw * 0.42, cy + r * 0.3);
  ctx.lineTo(x + tw * 0.42, cy + r * 0.3);
  ctx.lineTo(x + tw * 0.5, y - tw * 0.2);
  ctx.quadraticCurveTo(x + tw * 0.62, y + tw * 0.05, x + tw * 0.85, y + tw * 0.12);
  ctx.lineTo(x - tw * 0.85, y + tw * 0.12);
  ctx.quadraticCurveTo(x - tw * 0.62, y + tw * 0.05, x - tw * 0.5, y - tw * 0.2);
  ctx.closePath();
  ctx.fill();
  if (v.pine) {
    // Nadelbaum: gestufte, schattierte Sterne
    for (let k = 0; k < 4; k++) {
      const rr2 = r * (1.0 - k * 0.22), yy = cy + r * 0.15 - k * r * 0.24;
      const g = ctx.createRadialGradient(x - rr2 * 0.4, yy - rr2 * 0.45, rr2 * 0.05, x, yy, rr2 * 1.05);
      g.addColorStop(0, v.c[3]); g.addColorStop(0.4, v.c[2]); g.addColorStop(0.8, v.c[1]); g.addColorStop(1, v.c[0]);
      ctx.beginPath();
      const n = 9;
      for (let i = 0; i <= n * 2; i++) {
        const a = (i / (n * 2)) * TAU + k * 0.3;
        const rad = i % 2 ? rr2 * 0.7 : rr2;
        ctx.lineTo(x + Math.cos(a) * rad, yy + Math.sin(a) * rad * 0.9);
      }
      ctx.fillStyle = 'rgba(10,40,20,0.35)';
      ctx.save(); ctx.translate(r * 0.04, r * 0.08); ctx.fill(); ctx.restore();
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  // Kronenkugeln: hintere/obere zuerst, vordere/untere zuletzt
  const balls = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R() * 0.4 - 0.3;
    balls.push([x + Math.cos(a) * r * 0.52, cy + Math.sin(a) * r * 0.42, r * (0.5 + R() * 0.1)]);
  }
  balls.push([x - r * 0.06, cy - r * 0.12, r * 0.62]);
  balls.push([x - r * 0.2, cy - r * 0.42, r * 0.38]);
  balls.sort((a, b) => a[1] - b[1]);
  // dunkle Grundmasse (Eigenschatten im Inneren der Krone)
  ctx.fillStyle = v.c[0];
  ctx.beginPath();
  for (const b of balls) { ctx.moveTo(b[0] + b[2] + r * 0.04, b[1] + r * 0.08); ctx.arc(b[0] + r * 0.04, b[1] + r * 0.08, b[2], 0, TAU); }
  ctx.fill();
  for (const b of balls) leafBall(ctx, b[0], b[1], b[2] * 0.96, v.c);
  // Blattbüschel-Kanten: kleine helle Bögen oben links auf jeder Kugel
  ctx.strokeStyle = rgba(v.c[3], 0.55);
  ctx.lineWidth = Math.max(0.6, r * 0.045);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const b of balls) {
    ctx.moveTo(b[0] - b[2] * 0.62, b[1] - b[2] * 0.18);
    ctx.arc(b[0], b[1], b[2] * 0.66, Math.PI * 1.08, Math.PI * 1.42);
  }
  ctx.stroke();
  if (v.blossom) {
    for (let i = 0; i < 22; i++) {
      const a = R() * TAU, d = Math.sqrt(R()) * r * 0.8;
      const bx = x + Math.cos(a) * d, by = cy + Math.sin(a) * d * 0.85;
      const lit = (bx - x) + (by - cy) < 0;
      circle(ctx, bx, by, r * 0.065, lit ? '#ffffff' : '#ffd0e6');
      circle(ctx, bx, by, r * 0.025, '#ffcf3d');
    }
  }
  if (v.fruit) {
    for (let i = 0; i < 8; i++) {
      const a = R() * TAU, d = Math.sqrt(R()) * r * 0.7;
      const bx = x + Math.cos(a) * d, by = cy + Math.sin(a) * d * 0.85;
      circle(ctx, bx + r * 0.02, by + r * 0.03, r * 0.1, 'rgba(90,20,0,0.35)');
      circle(ctx, bx, by, r * 0.09, '#ff5a1f');
      circle(ctx, bx - r * 0.03, by - r * 0.03, r * 0.032, '#ffd0a0');
    }
  }
  ctx.restore();
}

function drawTreeFlat(ctx, x, y, r, variant) {
  const v = TREES[((variant % TREES.length) + TREES.length) % TREES.length];
  const R = rng(((x * 13 + y * 7) | 0) + variant * 101);
  const lift = r * 0.6;
  const cy = y - lift;
  ctx.save();
  softShadow(ctx, x + r * 0.45, y + r * 0.05, r * 1.15, r * 0.62, 0.32);
  // Stamm
  const tw = r * 0.22;
  const tg = ctx.createLinearGradient(x - tw, 0, x + tw, 0);
  tg.addColorStop(0, '#6b4226');
  tg.addColorStop(0.5, '#9a6538');
  tg.addColorStop(1, '#5a361f');
  fillRR(ctx, x - tw / 2, cy, tw, lift + r * 0.05, tw * 0.4, tg);
  ellipse(ctx, x, y + r * 0.04, tw * 0.9, tw * 0.35, 'rgba(60,35,20,0.4)');
  if (v.pine) {
    // Nadelbaum: gestufte Sterne
    for (let k = 0; k < 4; k++) {
      const rr2 = r * (1.05 - k * 0.24), yy = cy + r * 0.1 - k * r * 0.18;
      ctx.beginPath();
      const n = 9;
      for (let i = 0; i <= n * 2; i++) {
        const a = (i / (n * 2)) * TAU + k * 0.3;
        const rad = i % 2 ? rr2 * 0.68 : rr2;
        ctx.lineTo(x + Math.cos(a) * rad, yy + Math.sin(a) * rad * 0.92);
      }
      ctx.fillStyle = v.c[Math.min(3, k)];
      ctx.fill();
      if (k < 3) {
        ctx.beginPath();
        ctx.arc(x - rr2 * 0.25, yy - rr2 * 0.25, rr2 * 0.35, 0, TAU);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fill();
      }
    }
    circle(ctx, x - r * 0.08, cy - r * 0.48, r * 0.12, v.c[3]);
    ctx.restore();
    return;
  }
  // Untere dunkle Krone
  const blobs = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R() * 0.5;
    blobs.push([x + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.5, r * (0.45 + R() * 0.12)]);
  }
  ctx.fillStyle = v.c[0];
  ctx.beginPath();
  ctx.arc(x, cy + r * 0.08, r * 0.92, 0, TAU);
  for (const b of blobs) { ctx.moveTo(b[0] + b[2], b[1] + r * 0.08); ctx.arc(b[0], b[1] + r * 0.08, b[2], 0, TAU); }
  ctx.fill();
  // Mittelton
  ctx.fillStyle = v.c[1];
  ctx.beginPath();
  ctx.arc(x - r * 0.05, cy - r * 0.02, r * 0.82, 0, TAU);
  for (const b of blobs) { const bx = b[0] - r * 0.06, by = b[1] - r * 0.06; ctx.moveTo(bx + b[2] * 0.9, by); ctx.arc(bx, by, b[2] * 0.9, 0, TAU); }
  ctx.fill();
  // Helle Ballen oben links
  ctx.fillStyle = v.c[2];
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * 1.25 + (i - 2) * 0.55;
    const bx = x - r * 0.18 + Math.cos(a) * r * 0.38, by = cy - r * 0.15 + Math.sin(a) * r * 0.32;
    const br = r * (0.3 + R() * 0.1);
    ctx.moveTo(bx + br, by);
    ctx.arc(bx, by, br, 0, TAU);
  }
  ctx.fill();
  // Glanzlichter
  ctx.fillStyle = v.c[3];
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const bx = x - r * 0.38 + R() * r * 0.4, by = cy - r * 0.48 + R() * r * 0.3, br = r * (0.08 + R() * 0.08);
    ctx.moveTo(bx + br, by);
    ctx.arc(bx, by, br, 0, TAU);
  }
  ctx.fill();
  // Blattstruktur (kleine dunkle Bögen)
  ctx.strokeStyle = 'rgba(0,40,10,0.18)';
  ctx.lineWidth = Math.max(0.6, r * 0.04);
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const a = R() * TAU, d = R() * r * 0.75;
    const bx = x + Math.cos(a) * d, by = cy + Math.sin(a) * d * 0.9;
    ctx.moveTo(bx - r * 0.1, by);
    ctx.quadraticCurveTo(bx, by + r * 0.08, bx + r * 0.1, by);
  }
  ctx.stroke();
  if (v.blossom) {
    for (let i = 0; i < 26; i++) {
      const a = R() * TAU, d = Math.sqrt(R()) * r * 0.85;
      const bx = x + Math.cos(a) * d, by = cy + Math.sin(a) * d * 0.9;
      circle(ctx, bx, by, r * 0.07, R() < 0.5 ? '#ffffff' : '#ffe3f1');
      circle(ctx, bx, by, r * 0.025, '#ffcf3d');
    }
    // Abgefallene Blüten
    for (let i = 0; i < 8; i++) circle(ctx, x + (R() - 0.3) * r * 2, y + (R() - 0.2) * r * 0.6, r * 0.05, '#ffc2df');
  }
  if (v.fruit) {
    for (let i = 0; i < 9; i++) {
      const a = R() * TAU, d = Math.sqrt(R()) * r * 0.75;
      const bx = x + Math.cos(a) * d, by = cy + Math.sin(a) * d * 0.9;
      circle(ctx, bx, by, r * 0.1, '#ff5a1f');
      circle(ctx, bx - r * 0.03, by - r * 0.03, r * 0.035, '#ffd0a0');
    }
  }
  ctx.restore();
}

// Busch aus mehreren Laubballen, manche mit Blüten.
export function drawBush(ctx, x, y, r, seed = 1) {
  if (STYLE.clean) {
    const R = rng(seed * 977 + 3);
    const pal = R() < 0.5 ? ['#1e7a36', '#3aa84a', '#6fd25c', '#c4f59a'] : ['#18703f', '#2f9c56', '#5cc874', '#b8f0c0'];
    ctx.save();
    castShadow(ctx, x + r * 0.1, y + r * 0.1, r * 1.0, r * 0.9, 0.3);
    const lift = r * 0.45;
    const balls = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + R() * 0.6;
      balls.push([x + Math.cos(a) * r * 0.48, y - lift + Math.sin(a) * r * 0.3, r * (0.5 + R() * 0.15)]);
    }
    balls.push([x - r * 0.08, y - lift - r * 0.12, r * 0.6]);
    balls.sort((a, b) => a[1] - b[1]);
    ctx.fillStyle = pal[0];
    ctx.beginPath();
    for (const b of balls) { ctx.moveTo(b[0] + b[2] + r * 0.05, b[1] + r * 0.1); ctx.arc(b[0] + r * 0.05, b[1] + r * 0.1, b[2], 0, TAU); }
    ctx.fill();
    for (const b of balls) leafBall(ctx, b[0], b[1], b[2] * 0.95, pal);
    if (R() < 0.6) {
      const fc = ['#ff4f7a', '#ffd23f', '#ffffff', '#b36bff', '#ff8a3d'][(R() * 5) | 0];
      for (let i = 0; i < 6; i++) {
        const a = R() * TAU, d = Math.sqrt(R()) * r * 0.7;
        const fx = x + Math.cos(a) * d, fy = y - lift + Math.sin(a) * d * 0.5;
        circle(ctx, fx + 0.3, fy + 0.4, r * 0.1, 'rgba(0,40,10,0.3)');
        circle(ctx, fx, fy, r * 0.09, fc);
      }
    }
    ctx.restore();
    return;
  }
  const R = rng(seed * 977 + 3);
  const pal = R() < 0.5 ? ['#2a8f3e', '#47b54d', '#7ad85d'] : ['#22804a', '#35a35a', '#64c977'];
  ctx.save();
  softShadow(ctx, x + r * 0.35, y + r * 0.3, r * 1.25, r * 0.6, 0.3);
  const lift = r * 0.25;
  const blobs = [];
  for (let i = 0; i < 6; i++) {
    const a = R() * TAU, d = R() * r * 0.5;
    blobs.push([x + Math.cos(a) * d * 1.3, y - lift + Math.sin(a) * d * 0.7, r * (0.45 + R() * 0.25)]);
  }
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = pal[k];
    ctx.beginPath();
    for (const b of blobs) {
      const off = k * r * 0.1;
      const br = b[2] * (1 - k * 0.25);
      ctx.moveTo(b[0] - off + br, b[1] - off);
      ctx.arc(b[0] - off, b[1] - off + (k === 0 ? r * 0.1 : 0), br, 0, TAU);
    }
    ctx.fill();
  }
  if (R() < 0.6) {
    const fc = ['#ff4f7a', '#ffd23f', '#ffffff', '#b36bff', '#ff8a3d'][(R() * 5) | 0];
    for (let i = 0; i < 7; i++) {
      const a = R() * TAU, d = Math.sqrt(R()) * r * 0.8;
      circle(ctx, x + Math.cos(a) * d, y - lift + Math.sin(a) * d * 0.6, r * 0.09, fc);
    }
  }
  ctx.restore();
}

// Rasenfläche mit erhöhter Betonkante (Bordstein): Wurfschatten nach rechts unten,
// sichtbare Seitenfläche, helle Oberkante, sattes Grün mit ruhigen Mähbahnen.
export function drawLawn(ctx, x, y, w, h, r = 10, o = {}) {
  const curb = o.curb ?? 3, side = o.side ?? 2.5;
  ctx.save();
  // Wurfschatten
  for (let k = 0; k < 3; k++) fillRR(ctx, x + 1.5 + k, y + side + 1 + k, w, h, r, 'rgba(40,44,80,0.07)');
  // Bordstein: Seitenfläche und Oberseite
  fillRR(ctx, x, y + side, w, h, r, '#9aa1b8');
  const cg = ctx.createLinearGradient(0, y, 0, y + h);
  cg.addColorStop(0, '#ffffff');
  cg.addColorStop(1, '#e3e6f0');
  fillRR(ctx, x, y, w, h, r, cg);
  // Rasen
  const gx = x + curb, gy = y + curb, gw = w - curb * 2, gh = h - curb * 2, gr = Math.max(1, r - curb);
  const gg = ctx.createLinearGradient(gx, gy, gx + gw * 0.4, gy + gh);
  gg.addColorStop(0, '#7fe05a');
  gg.addColorStop(1, '#3fb84a');
  fillRR(ctx, gx, gy, gw, gh, gr, gg);
  ctx.save();
  ctx.beginPath(); rr(ctx, gx, gy, gw, gh, gr); ctx.clip();
  // Mähbahnen (breit, sehr dezent)
  ctx.fillStyle = 'rgba(255,255,200,0.09)';
  const sw = o.stripe ?? 9;
  for (let k = 0; k * sw < gw + gh; k += 2) {
    ctx.beginPath();
    ctx.moveTo(gx + k * sw, gy); ctx.lineTo(gx + (k + 1) * sw, gy);
    ctx.lineTo(gx + (k + 1) * sw - gh * 0.5, gy + gh); ctx.lineTo(gx + k * sw - gh * 0.5, gy + gh);
    ctx.fill();
  }
  // Umgebungsverdeckung an der Kante oben links (Bordstein wirft Schatten)
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(20,70,30,0.22)';
  ctx.beginPath(); rr(ctx, gx - 1, gy - 1, gw + 1, gh + 1, gr); ctx.stroke();
  ctx.restore();
  ctx.restore();
}

// Pflanzkübel (Beton, rund) mit kleinem Busch.
export function drawPlanter(ctx, x, y, r = 7, seed = 1) {
  ctx.save();
  castShadow(ctx, x, y + r * 0.2, r, r * 1.1, 0.3);
  const H = r * 0.7;
  ellipse(ctx, x, y + H, r, r * 0.55, '#8e95ab');
  ctx.fillStyle = '#a7aec2';
  ctx.fillRect(x - r, y, r * 2, H);
  const sg = ctx.createLinearGradient(x - r, 0, x + r, 0);
  sg.addColorStop(0, 'rgba(255,255,255,0.35)');
  sg.addColorStop(0.5, 'rgba(255,255,255,0)');
  sg.addColorStop(1, 'rgba(30,30,70,0.25)');
  ctx.fillStyle = sg;
  ctx.fillRect(x - r, y, r * 2, H);
  ellipse(ctx, x, y, r, r * 0.55, '#eef0f6');
  ellipse(ctx, x, y + 0.3, r * 0.8, r * 0.42, '#5b4030');
  ctx.restore();
  drawBush(ctx, x, y + r * 0.2, r * 0.85, seed);
}

// Hochbeet mit Holzrand und bunten Blumen.
export function drawFlowerBed(ctx, x, y, w, h, seed = 1) {
  const R = rng(seed * 7717 + 1);
  const rim = Math.max(2.5, Math.min(w, h) * 0.1), side = Math.max(2.5, h * 0.12);
  ctx.save();
  fillRR(ctx, x + 2, y + 3, w + 1, h + side, 3, 'rgba(20,40,20,0.22)');
  fillRR(ctx, x, y + side, w, h, 3, '#8a5a2e');
  // Bretterfugen an der Seitenfläche
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let xx = x + 10; xx < x + w - 2; xx += 12) ctx.fillRect(xx, y + h, 0.8, side);
  fillRR(ctx, x, y, w, h, 3, '#c98d4f');
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x + 2, y + 0.6, w - 4, 0.8);
  // Erde
  const sg = ctx.createLinearGradient(0, y + rim, 0, y + h - rim);
  sg.addColorStop(0, '#4a3020');
  sg.addColorStop(1, '#6b4a33');
  fillRR(ctx, x + rim, y + rim, w - rim * 2, h - rim * 2, 2, sg);
  const ix = x + rim, iy = y + rim, iw = w - rim * 2, ih = h - rim * 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ix - 2, iy - 3, iw + 4, ih + 4);
  ctx.clip();
  // Blätter
  const n = Math.max(6, (iw * ih) / 14);
  ctx.fillStyle = '#3b9c45';
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const px = ix + R() * iw, py = iy + R() * ih;
    ctx.moveTo(px + 2, py); ctx.ellipse(px, py, 2.2, 1.3, R() * 3, 0, TAU);
  }
  ctx.fill();
  ctx.fillStyle = '#6cd068';
  ctx.beginPath();
  for (let i = 0; i < n * 0.5; i++) {
    const px = ix + R() * iw, py = iy + R() * ih;
    ctx.moveTo(px + 1.3, py); ctx.ellipse(px, py, 1.4, 0.9, R() * 3, 0, TAU);
  }
  ctx.fill();
  // Blüten (5 Blätter)
  const cols = ['#ff4f7a', '#ffd23f', '#ffffff', '#b36bff', '#ff8a3d', '#4fc3ff', '#ff2d55'];
  const nf = Math.max(4, (iw * ih) / 22);
  for (let i = 0; i < nf; i++) {
    const px = ix + 1.5 + R() * (iw - 3), py = iy + 1 + R() * (ih - 2);
    const c = cols[(R() * cols.length) | 0], fr = 1.1 + R() * 0.7;
    ctx.fillStyle = c;
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = k * TAU / 5;
      ctx.moveTo(px + Math.cos(a) * fr + fr * 0.6, py + Math.sin(a) * fr);
      ctx.arc(px + Math.cos(a) * fr, py + Math.sin(a) * fr, fr * 0.6, 0, TAU);
    }
    ctx.fill();
    circle(ctx, px, py, fr * 0.45, c === '#ffd23f' ? '#ff7a00' : '#ffe14d');
  }
  ctx.restore();
  ctx.restore();
}

// ---------- Kleine Requisiten ----------

// Straßenlaterne. (x,y) = Fußpunkt, s = Größe (~Höhe/2).
export function drawLamp(ctx, x, y, s = 14) {
  const H = s * 1.9;
  ctx.save();
  // Lichtkegel am Boden
  const g = ctx.createRadialGradient(x + s * 0.5, y + s * 0.15, 0, x + s * 0.5, y + s * 0.15, s * 1.2);
  g.addColorStop(0, 'rgba(255,245,190,0.35)');
  g.addColorStop(1, 'rgba(255,245,190,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - s, y - s, s * 3, s * 2.4);
  // Schatten des Mastes
  ctx.strokeStyle = 'rgba(20,30,30,0.22)';
  ctx.lineWidth = s * 0.14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + H * 0.55, y + H * 0.28);
  ctx.stroke();
  // Sockel
  ellipse(ctx, x, y, s * 0.22, s * 0.12, '#4b535e');
  // Mast
  const mg = ctx.createLinearGradient(x - s * 0.08, 0, x + s * 0.08, 0);
  mg.addColorStop(0, '#5e6773');
  mg.addColorStop(0.4, '#c9d1da');
  mg.addColorStop(1, '#4a525d');
  ctx.fillStyle = mg;
  ctx.fillRect(x - s * 0.07, y - H, s * 0.14, H);
  // Ausleger und Kopf
  ctx.strokeStyle = '#4a525d';
  ctx.lineWidth = s * 0.1;
  ctx.beginPath();
  ctx.moveTo(x, y - H);
  ctx.quadraticCurveTo(x + s * 0.1, y - H - s * 0.2, x + s * 0.45, y - H - s * 0.12);
  ctx.stroke();
  fillRR(ctx, x + s * 0.2, y - H - s * 0.24, s * 0.6, s * 0.22, s * 0.1, '#2f3640');
  fillRR(ctx, x + s * 0.25, y - H - s * 0.06, s * 0.5, s * 0.07, s * 0.03, '#fff6b8');
  circle(ctx, x + s * 0.5, y - H - s * 0.02, s * 0.32, 'rgba(255,240,170,0.25)');
  ctx.restore();
}

// Leitkegel (orange, weiß gestreift). s = Höhe.
export function drawCone(ctx, x, y, s = 10) {
  const b = s * 0.42;
  ctx.save();
  ctx.fillStyle = 'rgba(20,30,30,0.22)';
  ctx.beginPath();
  ctx.moveTo(x - b * 0.6, y + b * 0.3);
  ctx.lineTo(x + s * 0.6, y + s * 0.25);
  ctx.lineTo(x + b * 0.6, y - b * 0.1);
  ctx.fill();
  fillRR(ctx, x - b, y - b * 0.45, b * 2, b * 0.9 + 1.5, b * 0.2, '#b84a00');
  fillRR(ctx, x - b, y - b * 0.45, b * 2, b * 0.9, b * 0.2, '#ff7a00');
  // Kegelkörper
  const top = y - s;
  const cg = ctx.createLinearGradient(x - b * 0.7, 0, x + b * 0.7, 0);
  cg.addColorStop(0, '#ffa040');
  cg.addColorStop(0.45, '#ff7300');
  cg.addColorStop(1, '#d24e00');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.moveTo(x - b * 0.12, top);
  ctx.lineTo(x + b * 0.12, top);
  ctx.lineTo(x + b * 0.7, y);
  ctx.quadraticCurveTo(x, y + b * 0.25, x - b * 0.7, y);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - b, top + s * 0.28, b * 2, s * 0.16);
  ctx.fillRect(x - b, top + s * 0.6, b * 2, s * 0.12);
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(x + b * 0.25, top, b, s);
  ctx.restore();
  ellipse(ctx, x, top, b * 0.13, b * 0.06, '#ffb066');
  ctx.restore();
}

// Ein stehendes Fass. (x,y) = Bodenmitte.
function barrel(ctx, x, y, r, col) {
  const ry = r * 0.5, H = r * 1.25;
  ellipse(ctx, x + r * 0.35, y + ry * 0.4, r * 1.1, ry * 1.1, 'rgba(20,30,30,0.22)');
  const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
  g.addColorStop(0, shade(col, -0.25));
  g.addColorStop(0.35, shade(col, 0.25));
  g.addColorStop(1, shade(col, -0.45));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - r, y - H);
  ctx.lineTo(x - r, y);
  ctx.ellipse(x, y, r, ry, 0, Math.PI, 0, true);
  ctx.lineTo(x + r, y - H);
  ctx.closePath();
  ctx.fill();
  // Sicken
  ctx.strokeStyle = shade(col, -0.5);
  ctx.lineWidth = Math.max(0.7, r * 0.09);
  for (const f of [0.33, 0.66]) {
    ctx.beginPath();
    ctx.ellipse(x, y - H * f, r, ry, 0, 0, Math.PI);
    ctx.stroke();
  }
  // Deckel
  ellipse(ctx, x, y - H, r, ry, shade(col, -0.1));
  ellipse(ctx, x, y - H, r * 0.84, ry * 0.8, shade(col, 0.2));
  circle(ctx, x + r * 0.4, y - H, r * 0.12, shade(col, -0.4));
  ellipse(ctx, x - r * 0.3, y - H - ry * 0.3, r * 0.3, ry * 0.18, 'rgba(255,255,255,0.4)');
}

// Fassgruppe (blau, rot, gelb).
export function drawBarrels(ctx, x, y, s = 10) {
  ctx.save();
  barrel(ctx, x - s * 0.55, y - s * 0.35, s * 0.5, '#2f7ff0');
  barrel(ctx, x + s * 0.5, y - s * 0.3, s * 0.5, '#ffc21a');
  barrel(ctx, x - s * 0.02, y + s * 0.35, s * 0.5, '#ef3b3b');
  ctx.restore();
}

// Eine leere Holzpalette als Quader. (x,y) = Mitte der Deckfläche.
function woodPallet(ctx, x, y, w, d, hp, top = true) {
  // Stirnseite mit Öffnungen
  ctx.fillStyle = '#b07a42';
  ctx.fillRect(x - w / 2, y + d / 2, w, hp);
  ctx.fillStyle = '#4b3018';
  const gw = w * 0.3;
  ctx.fillRect(x - w / 2 + w * 0.1, y + d / 2 + hp * 0.3, gw, hp * 0.5);
  ctx.fillRect(x + w / 2 - w * 0.1 - gw, y + d / 2 + hp * 0.3, gw, hp * 0.5);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x - w / 2, y + d / 2, w, Math.max(0.6, hp * 0.18));
  if (!top) return;
  // Deckbretter quer, dazwischen dunkle Fugen mit sichtbaren Längsträgern
  ctx.fillStyle = '#5a3a1c';
  ctx.fillRect(x - w / 2, y - d / 2, w, d);
  ctx.fillStyle = '#9a6a3a';
  for (const f of [0.08, 0.5, 0.92]) ctx.fillRect(x - w / 2 + w * f - w * 0.06, y - d / 2, w * 0.12, d);
  const n = 4, ph = d / (n + (n - 1) * 0.45);
  for (let i = 0; i < n; i++) {
    const py = y - d / 2 + i * ph * 1.45;
    const g = ctx.createLinearGradient(0, py, 0, py + ph);
    g.addColorStop(0, '#ebbd84');
    g.addColorStop(1, '#c99458');
    ctx.fillStyle = g;
    ctx.fillRect(x - w / 2, py, w, ph);
    ctx.fillStyle = 'rgba(90,55,25,0.55)';
    for (const f of [0.08, 0.5, 0.92]) ctx.fillRect(x - w / 2 + w * f - 0.4, py + ph * 0.35, 0.8, 0.8);
  }
}

// Stapel leerer Holzpaletten (Deko).
// Holzpalette (clean): Stirnseite mit Klötzen + Einfahröffnungen, Deckbretter mit Fugen.
function woodPallet3D(ctx, x, y, w, d, hp, top) {
  const x0 = x - w / 2, fy = y + d / 2;
  // Stirnseite: unteres Brett, Klötze, oberes Brett
  const fg = ctx.createLinearGradient(0, fy, 0, fy + hp);
  fg.addColorStop(0, '#c48a4c');
  fg.addColorStop(1, '#94602f');
  ctx.fillStyle = fg;
  ctx.fillRect(x0, fy, w, hp);
  ctx.fillStyle = '#3a240f';
  const gw = w * 0.31, gy = fy + hp * 0.3, gh = hp * 0.46;
  ctx.fillRect(x0 + w * 0.085, gy, gw, gh);
  ctx.fillRect(x0 + w - w * 0.085 - gw, gy, gw, gh);
  ctx.fillStyle = 'rgba(255,230,190,0.45)';
  ctx.fillRect(x0, fy, w, Math.max(0.5, hp * 0.12));
  ctx.fillStyle = 'rgba(60,30,10,0.35)';
  ctx.fillRect(x0, fy + hp - Math.max(0.5, hp * 0.12), w, Math.max(0.5, hp * 0.12));
  if (!top) return;
  // Deck: dunkle Fugen, darüber helle Bretter (Licht von oben links)
  ctx.fillStyle = '#6e4622';
  ctx.fillRect(x0, y - d / 2, w, d);
  const nb = 5, bh = d / (nb + (nb - 1) * 0.3);
  for (let i = 0; i < nb; i++) {
    const py = y - d / 2 + i * bh * 1.3;
    const g = ctx.createLinearGradient(x0, py, x0 + w, py + bh);
    g.addColorStop(0, '#f2cb92');
    g.addColorStop(1, '#d4a265');
    ctx.fillStyle = g;
    ctx.fillRect(x0, py, w, bh);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x0, py, w, Math.max(0.4, bh * 0.14));
    ctx.fillStyle = 'rgba(90,55,25,0.6)';
    for (const f of [0.07, 0.5, 0.93]) ctx.fillRect(x0 + w * f - 0.35, py + bh * 0.4, 0.7, 0.7);
  }
}

export function drawPalletStack(ctx, x, y, s = 16, n = 4) {
  const w = s, d = s * 0.72, hp = s * 0.17;
  const R = rng((x * 3 + y * 5) | 0);
  ctx.save();
  if (STYLE.clean) {
    const H = n * hp;
    // Kontaktschatten und weicher Wurfschatten nach rechts unten
    boxCastShadow(ctx, x - w / 2, y - d / 2, w, d, H);
    ellipse(ctx, x + 0.5, y + d / 2 + 0.3, w * 0.58, 1.6, 'rgba(30,30,60,0.35)');
    for (let i = 0; i < n; i++) {
      const ox = (R() - 0.5) * s * 0.06;
      woodPallet3D(ctx, x + ox, y - (i + 1) * hp, w, d, hp, i === n - 1);
      // Fuge zwischen den Paletten (Umgebungsverdeckung)
      if (i < n - 1) { ctx.fillStyle = 'rgba(40,20,5,0.35)'; ctx.fillRect(x + ox - w / 2, y - (i + 1) * hp + d / 2, w, 0.6); }
    }
    ctx.restore();
    return;
  }
  // Schlagschatten nach rechts, Länge wächst mit der Stapelhöhe
  ctx.fillStyle = 'rgba(20,30,30,0.22)';
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + 1, y + d / 2);
  ctx.lineTo(x + w / 2, y + d / 2);
  ctx.lineTo(x + w / 2 + n * hp * 0.55, y + d / 2 + 2);
  ctx.lineTo(x + w / 2 + n * hp * 0.55, y - d / 2 + 2 - n * hp * 0.3);
  ctx.lineTo(x + w / 2, y - d / 2 - n * hp);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < n; i++) {
    const ox = (R() - 0.5) * s * 0.08;
    const yy = y - (i + 1) * hp;
    woodPallet(ctx, x + ox, yy, w, d, hp, i === n - 1);
  }
  ctx.restore();
}

// Parkbank mit Holzlatten. s = Breite.
export function drawBench(ctx, x, y, s = 20, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const w = s, d = s * 0.32;
  fillRR(ctx, -w / 2 + 2, -d / 2 + 3, w, d + 2, 2, 'rgba(20,30,20,0.25)');
  // Beine
  ctx.fillStyle = '#2f3540';
  ctx.fillRect(-w * 0.42, -d * 0.2, s * 0.06, d * 0.9);
  ctx.fillRect(w * 0.36, -d * 0.2, s * 0.06, d * 0.9);
  // Sitzlatten
  for (let i = 0; i < 3; i++) {
    const yy = -d / 2 + i * d * 0.3 - s * 0.06;
    fillRR(ctx, -w / 2, yy + 1, w, d * 0.24, 1, '#8a5326');
    fillRR(ctx, -w / 2, yy, w, d * 0.24, 1, i === 0 ? '#e09a54' : '#d48a45');
  }
  // Lehne
  fillRR(ctx, -w / 2, -d / 2 - s * 0.2, w, d * 0.22, 1, '#b8743a');
  fillRR(ctx, -w / 2, -d / 2 - s * 0.24, w, d * 0.2, 1, '#eaa865');
  ctx.fillStyle = '#2f3540';
  ctx.fillRect(-w * 0.42, -d / 2 - s * 0.22, s * 0.05, s * 0.2);
  ctx.fillRect(w * 0.37, -d / 2 - s * 0.22, s * 0.05, s * 0.2);
  ctx.restore();
}

// Metallzaun (grün beschichtet) von (x1,y1) nach (x2,y2), Pfosten ragen nach oben.
export function drawFence(ctx, x1, y1, x2, y2, o = {}) {
  const H = o.h || 11, gap = o.gap || 14;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.max(1, Math.round(len / gap));
  const dx = (x2 - x1) / n, dy = (y2 - y1) / n;
  ctx.save();
  ctx.lineCap = 'round';
  // Schatten am Boden
  ctx.strokeStyle = 'rgba(20,30,20,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1 + H * 0.4, y1 + H * 0.2);
  ctx.lineTo(x2 + H * 0.4, y2 + H * 0.2);
  ctx.stroke();
  // Gitter
  ctx.strokeStyle = 'rgba(30,110,70,0.55)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  const steps = Math.max(2, Math.round(len / 3));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t;
    ctx.moveTo(px, py - H * 0.15);
    ctx.lineTo(px, py - H * 0.9);
  }
  ctx.stroke();
  // Holme
  ctx.strokeStyle = '#2e9b5f';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x1, y1 - H * 0.9); ctx.lineTo(x2, y2 - H * 0.9);
  ctx.moveTo(x1, y1 - H * 0.15); ctx.lineTo(x2, y2 - H * 0.15);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(200,255,220,0.6)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x1, y1 - H * 0.9 - 0.5); ctx.lineTo(x2, y2 - H * 0.9 - 0.5);
  ctx.stroke();
  // Pfosten
  for (let i = 0; i <= n; i++) {
    const px = x1 + dx * i, py = y1 + dy * i;
    ctx.strokeStyle = '#1d6b40';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py - H);
    ctx.stroke();
    circle(ctx, px, py - H, 1.3, '#3fc27a');
  }
  ctx.restore();
}

// ---------- Fahrzeuge / Geräte ----------

// Gabelstapler in Draufsicht. angle = Fahrtrichtung (Gabel vorne), s = Länge.
// o = { forkLift: 0..1, carrying: bool, cargo: Farbe der Ladung }
export function drawForklift(ctx, x, y, angle = 0, s = 30, o = {}) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const P = (lx, ly, lift = 0) => [x + ca * lx * s - sa * ly * s, y + sa * lx * s + ca * ly * s - lift * s];
  const layer = (lift, fn) => {
    ctx.save();
    ctx.translate(x, y - lift * s);
    ctx.rotate(angle);
    ctx.scale(s, s);
    fn();
    ctx.restore();
  };
  const fl = 0.04 + (o.forkLift || 0) * 0.32;
  ctx.save();
  // Schatten
  layer(-0.0, () => {
    ctx.translate(0.08, 0.1);
    ctx.fillStyle = 'rgba(20,25,30,0.25)';
    ctx.beginPath(); rr(ctx, -0.5, -0.3, 0.82, 0.6, 0.12); ctx.fill();
    ctx.fillRect(0.3, -0.18, 0.45, 0.36);
  });
  // Räder
  layer(0, () => {
    ctx.fillStyle = '#16181c';
    for (const [wx, wy] of [[0.12, -0.3], [0.12, 0.22], [-0.36, -0.28], [-0.36, 0.2]]) { ctx.beginPath(); rr(ctx, wx, wy, 0.18, 0.08, 0.03); ctx.fill(); }
    ctx.fillStyle = '#555c66';
    for (const [wx, wy] of [[0.17, -0.28], [0.17, 0.24], [-0.31, -0.26], [-0.31, 0.22]]) ctx.fillRect(wx, wy, 0.08, 0.04);
  });
  // Gabeln
  const forks = () => {
    ctx.fillStyle = '#3a3f47';
    ctx.fillRect(0.28, -0.24, 0.05, 0.48);
    ctx.fillStyle = '#8d96a1';
    ctx.fillRect(0.31, -0.17, 0.44, 0.06);
    ctx.fillRect(0.31, 0.11, 0.44, 0.06);
    ctx.fillStyle = '#c3cad3';
    ctx.fillRect(0.31, -0.17, 0.44, 0.02);
    ctx.fillRect(0.31, 0.11, 0.44, 0.02);
  };
  layer(fl, forks);
  if (o.carrying) {
    layer(fl + 0.04, () => {
      ctx.fillStyle = '#8a5a2e';
      ctx.fillRect(0.32, -0.27, 0.46, 0.54);
      ctx.fillStyle = '#d9a66c';
      for (let i = 0; i < 4; i++) ctx.fillRect(0.33 + i * 0.115, -0.27, 0.085, 0.54);
    });
    const cc = o.cargo || '#0a5cff';
    layer(fl + 0.08, () => { ctx.fillStyle = shade(cc, -0.35); ctx.beginPath(); rr(ctx, 0.35, -0.24, 0.4, 0.48, 0.04); ctx.fill(); });
    layer(fl + 0.22, () => {
      ctx.fillStyle = cc; ctx.beginPath(); rr(ctx, 0.35, -0.24, 0.4, 0.48, 0.04); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0.37, -0.22, 0.36, 0.06);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.02; ctx.beginPath(); ctx.moveTo(0.55, -0.24); ctx.lineTo(0.55, 0.24); ctx.stroke();
    });
  }
  // Fahrgestell: Seitenfläche, Deckfläche
  const body = () => { ctx.beginPath(); rr(ctx, -0.48, -0.27, 0.76, 0.54, 0.1); };
  layer(0.02, () => { body(); ctx.fillStyle = '#b88600'; ctx.fill(); });
  layer(0.08, () => { body(); ctx.fillStyle = '#d9a000'; ctx.fill(); });
  layer(0.13, () => {
    body();
    const g = ctx.createLinearGradient(0, -0.27, 0, 0.27);
    g.addColorStop(0, '#ffe04a');
    g.addColorStop(1, '#ffbf00');
    ctx.fillStyle = g;
    ctx.fill();
    // Gegengewicht
    ctx.fillStyle = '#3b414b';
    ctx.beginPath(); rr(ctx, -0.5, -0.25, 0.16, 0.5, 0.08); ctx.fill();
    ctx.fillStyle = '#5c6470';
    ctx.fillRect(-0.47, -0.2, 0.04, 0.4);
    // Warnstreifen hinten
    ctx.fillStyle = '#1d1f24';
    for (let i = -2; i < 3; i++) ctx.fillRect(-0.34, i * 0.1 - 0.03, 0.03, 0.05);
    // Sitz und Lenkrad
    ctx.fillStyle = '#23262c';
    ctx.beginPath(); rr(ctx, -0.28, -0.13, 0.2, 0.26, 0.05); ctx.fill();
    ctx.fillStyle = '#3a3f48';
    ctx.beginPath(); rr(ctx, -0.25, -0.1, 0.12, 0.2, 0.04); ctx.fill();
    ctx.strokeStyle = '#1b1d22'; ctx.lineWidth = 0.03;
    ctx.beginPath(); ctx.arc(0.04, 0, 0.07, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(-0.44, -0.25, 0.68, 0.03);
    // Scheinwerfer und Rücklichter
    ctx.fillStyle = '#fffbe0';
    ctx.fillRect(0.2, -0.25, 0.06, 0.06);
    ctx.fillRect(0.2, 0.19, 0.06, 0.06);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-0.36, -0.27, 0.05, 0.04);
    ctx.fillRect(-0.36, 0.23, 0.05, 0.04);
  });
  // Hubmast (senkrecht in Bildschirmrichtung)
  ctx.lineCap = 'round';
  for (const ly of [-0.2, 0.2]) {
    const a = P(0.29, ly, 0.05), b = P(0.29, ly, 0.46);
    ctx.strokeStyle = '#2a2e35';
    ctx.lineWidth = s * 0.06;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.strokeStyle = '#6b7380';
    ctx.lineWidth = s * 0.02;
    ctx.beginPath(); ctx.moveTo(a[0] - 0.5, a[1]); ctx.lineTo(b[0] - 0.5, b[1]); ctx.stroke();
  }
  layer(0.46, () => { ctx.fillStyle = '#2a2e35'; ctx.fillRect(0.26, -0.22, 0.06, 0.44); });
  // Schutzdach: Pfosten und Gitterdach
  ctx.strokeStyle = '#1f2228';
  ctx.lineWidth = s * 0.035;
  for (const [lx, ly] of [[-0.3, -0.22], [-0.3, 0.22], [0.12, -0.22], [0.12, 0.22]]) {
    const a = P(lx, ly, 0.13), b = P(lx, ly, 0.48);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  layer(0.48, () => {
    ctx.strokeStyle = '#1f2228';
    ctx.lineWidth = 0.045;
    ctx.beginPath(); rr(ctx, -0.32, -0.24, 0.46, 0.48, 0.05); ctx.stroke();
    ctx.lineWidth = 0.025;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) { ctx.moveTo(-0.32 + i * 0.115, -0.24); ctx.lineTo(-0.32 + i * 0.115, 0.24); }
    ctx.stroke();
    // Rundumleuchte
    ctx.fillStyle = '#ff8a00';
    ctx.beginPath(); ctx.arc(-0.26, 0, 0.055, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd59a';
    ctx.beginPath(); ctx.arc(-0.275, -0.015, 0.02, 0, TAU); ctx.fill();
  });
  ctx.restore();
}

// Mobilkran: Unterwagen mit Stützen bei (baseX, baseY), Gitterausleger bis über den Haken.
// o = { baseX, baseY, hookX, hookY, s: Maßstab (1 ≈ 40 px Fahrzeug), cable: Seillänge px }
export function drawCrane(ctx, o) {
  const s = o.s || 1;
  const bx = o.baseX, by = o.baseY, hx = o.hookX, hy = o.hookY;
  const cable = o.cable ?? 46 * s;
  const tipX = hx, tipY = hy - cable;
  const pivX = bx, pivY = by - 10 * s;
  const ang = Math.atan2(hy - by, hx - bx);
  ctx.save();
  // Schatten des Auslegers am Boden
  ctx.strokeStyle = 'rgba(20,25,30,0.18)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 5 * s;
  ctx.beginPath();
  ctx.moveTo(bx + 4 * s, by + 4 * s);
  ctx.lineTo(hx + 10 * s, hy + 6 * s);
  ctx.stroke();
  // Unterwagen
  fillRR(ctx, bx - 24 * s + 3, by - 11 * s + 4, 48 * s, 22 * s, 4 * s, 'rgba(20,25,30,0.28)');
  // Abstützungen
  ctx.fillStyle = '#3b414b';
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    ctx.fillRect(bx + sx * 16 * s - 1.5 * s, by + (sy < 0 ? -15 * s : 8 * s), 3 * s, 7 * s);
    fillRR(ctx, bx + sx * 16 * s - 3.5 * s, by + sy * 15 * s - 1.5 * s + (sy > 0 ? 0 : 0), 7 * s, 3.5 * s, 1, '#22252b');
  }
  box(ctx, bx - 22 * s, by - 9 * s, 44 * s, 16 * s, 4 * s, '#ff8a00', '#b35a00', 3 * s);
  hazard(ctx, bx - 22 * s, by + 7 * s, 44 * s, 2.2 * s, 2.5 * s);
  // Fahrerhaus
  box(ctx, bx + 12 * s, by - 8 * s, 9 * s, 13 * s, 3 * s, '#ffb13d', '#c26a00', 2 * s);
  fillRR(ctx, bx + 18 * s, by - 7 * s, 2.5 * s, 11 * s, 1, '#6fc3ff');
  // Drehkranz und Oberwagen (zum Haken gedreht)
  ctx.save();
  ctx.translate(pivX, pivY);
  ctx.rotate(ang);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); rr(ctx, -10 * s, -7 * s + 2, 18 * s, 14 * s, 2.5 * s); ctx.fill();
  ctx.fillStyle = '#ffc21a';
  ctx.beginPath(); rr(ctx, -10 * s, -7 * s, 18 * s, 14 * s, 2.5 * s); ctx.fill();
  ctx.fillStyle = '#3b414b';
  ctx.beginPath(); rr(ctx, -12 * s, -6 * s, 5 * s, 12 * s, 1.5 * s); ctx.fill();
  ctx.fillStyle = '#7fd0ff';
  ctx.beginPath(); rr(ctx, 1 * s, 2.5 * s, 5 * s, 3.5 * s, 1); ctx.fill();
  ctx.restore();
  // Gitterausleger von Drehpunkt zu Spitze
  const dx = tipX - pivX, dy = tipY - pivY, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const w0 = 5 * s, w1 = 2 * s;
  const A = (t, side) => {
    const w = w0 + (w1 - w0) * t;
    return [pivX + dx * t + nx * w * side, pivY + dy * t + ny * w * side];
  };
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#b37d00';
  ctx.lineWidth = 1.2 * s;
  ctx.beginPath();
  const segs = Math.max(4, Math.round(L / (7 * s)));
  for (let i = 0; i < segs; i++) {
    const a = A(i / segs, i % 2 ? 1 : -1), b = A((i + 1) / segs, i % 2 ? -1 : 1);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
  ctx.strokeStyle = '#ffc21a';
  ctx.lineWidth = 2 * s;
  for (const sd of [-1, 1]) {
    const a = A(0, sd), b = A(1, sd);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  ctx.strokeStyle = '#fff0a8';
  ctx.lineWidth = 0.6 * s;
  { const a = A(0, -1), b = A(1, -1); ctx.beginPath(); ctx.moveTo(a[0], a[1] - 0.6); ctx.lineTo(b[0], b[1] - 0.6); ctx.stroke(); }
  circle(ctx, pivX, pivY, 3 * s, '#3b414b');
  circle(ctx, tipX, tipY, 2.6 * s, '#3b414b');
  circle(ctx, tipX, tipY, 1.2 * s, '#c9d1da');
  // Seile
  ctx.strokeStyle = '#2a2e35';
  ctx.lineWidth = Math.max(0.7, 0.8 * s);
  ctx.beginPath();
  ctx.moveTo(tipX - 1 * s, tipY); ctx.lineTo(hx - 1.6 * s, hy - 5 * s);
  ctx.moveTo(tipX + 1 * s, tipY); ctx.lineTo(hx + 1.6 * s, hy - 5 * s);
  ctx.stroke();
  // Hakenflasche
  fillRR(ctx, hx - 4 * s, hy - 6 * s, 8 * s, 7 * s, 1.5 * s, '#1d1f24');
  hazard(ctx, hx - 3.3 * s, hy - 5.3 * s, 6.6 * s, 5.6 * s, 2 * s);
  // Haken
  ctx.strokeStyle = '#aab3be';
  ctx.lineWidth = 1.8 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hx, hy + 1 * s);
  ctx.lineTo(hx, hy + 3 * s);
  ctx.arc(hx - 2 * s, hy + 3.5 * s, 2 * s, 0, Math.PI * 0.95);
  ctx.stroke();
  ctx.restore();
}

// ---------- Spielmechanik-Objekte (Größe nach Feldgröße cell) ----------

// Garage/Tor auf einem Feld, aus dem wartende LKWs kommen. (x,y) = Feldmitte,
// angle = Öffnungsrichtung (0 = rechts, π/2 = unten), o = { count }
export function drawGarage(ctx, x, y, angle = Math.PI / 2, cell = 30, o = {}) {
  const S = cell * 0.94, H = cell * 0.24;
  const L = x - S / 2, T = y - S / 2;
  const dx = Math.round(Math.cos(angle)), dy = Math.round(Math.sin(angle));
  ctx.save();
  fillRR(ctx, L + cell * 0.08, T + cell * 0.12, S, S, cell * 0.08, 'rgba(20,25,30,0.28)');
  // Wand (Seitenfläche) und Dach
  const wallG = ctx.createLinearGradient(0, T + S - H, 0, T + S);
  wallG.addColorStop(0, '#e8edf3');
  wallG.addColorStop(1, '#b9c3cf');
  fillRR(ctx, L, T + S * 0.3, S, S * 0.7, cell * 0.07, wallG);
  const rh = S - H;
  const roofG = ctx.createLinearGradient(L, T, L + S, T + rh);
  roofG.addColorStop(0, '#5b6ee0');
  roofG.addColorStop(1, '#3443b8');
  fillRR(ctx, L, T, S, rh, cell * 0.07, roofG);
  // Dachrippen
  ctx.save();
  ctx.beginPath();
  rr(ctx, L, T, S, rh, cell * 0.07);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (let i = 1; i < 6; i++) ctx.fillRect(L + (i * S) / 6, T, Math.max(0.8, cell * 0.03), rh);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(L, T, S, Math.max(1, cell * 0.035));
  ctx.restore();
  // Orange Dachkante
  ctx.strokeStyle = '#ff8a00';
  ctx.lineWidth = Math.max(1, cell * 0.05);
  ctx.beginPath();
  rr(ctx, L + cell * 0.025, T + cell * 0.025, S - cell * 0.05, rh - cell * 0.05, cell * 0.06);
  ctx.stroke();
  // Toröffnung
  const ow = S * 0.66, dep = S * 0.2;
  const shutter = (x0, y0, w0, h0, horiz) => {
    hazard(ctx, x0 - 1, y0 - 1, w0 + 2, h0 + 2, Math.max(1.5, cell * 0.07));
    const g = ctx.createLinearGradient(x0, y0, horiz ? x0 : x0 + w0, horiz ? y0 + h0 : y0);
    g.addColorStop(0, '#0e1219');
    g.addColorStop(1, '#2b3546');
    ctx.fillStyle = g;
    ctx.fillRect(x0 + 0.6, y0 + 0.6, w0 - 1.2, h0 - 1.2);
  };
  if (dy === 1) {
    shutter(x - ow / 2, T + rh + H * 0.08 - 1, ow, H * 0.92, true);
    ctx.fillStyle = '#9aa4b1';
    ctx.fillRect(x - ow / 2 + 0.6, T + rh + H * 0.06, ow - 1.2, H * 0.22);
  } else if (dy === -1) {
    shutter(x - ow / 2, T + 1, ow, dep, true);
  } else if (dx === 1) {
    shutter(L + S - dep - 1, y - ow / 2 - H / 2, dep, ow, false);
  } else {
    shutter(L + 1, y - ow / 2 - H / 2, dep, ow, false);
  }
  // Pfeil auf dem Dach
  ctx.save();
  ctx.translate(x - dx * S * 0.05, T + rh / 2 - dy * S * 0.05);
  ctx.rotate(angle);
  const a = S * 0.2;
  ctx.beginPath();
  ctx.moveTo(a, 0);
  ctx.lineTo(-a * 0.2, -a * 0.8);
  ctx.lineTo(-a * 0.2, -a * 0.3);
  ctx.lineTo(-a, -a * 0.3);
  ctx.lineTo(-a, a * 0.3);
  ctx.lineTo(-a * 0.2, a * 0.3);
  ctx.lineTo(-a * 0.2, a * 0.8);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fill();
  ctx.restore();
  if (o.count != null) drawBadge(ctx, L + S - cell * 0.06, T + cell * 0.04, cell * 0.22, '#ff0a1e', String(o.count));
  ctx.restore();
}

// Schranke auf einem Feld. o = { open: 0..1, count } (count = noch nötige Abfahrten)
export function drawBarrier(ctx, x, y, cell = 30, o = {}) {
  const open = Math.max(0, Math.min(1, o.open || 0));
  const S = cell * 0.94, L = x - S / 2, T = y - S / 2;
  ctx.save();
  // Sperrfläche
  ctx.save();
  ctx.beginPath();
  rr(ctx, L + 1, T + 1, S - 2, S - 2, cell * 0.08);
  ctx.clip();
  ctx.globalAlpha = 0.85 - open * 0.55;
  hazard(ctx, L, T, S, S, cell * 0.11, '#ffcc00', '#2b2e35');
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = Math.max(1, cell * 0.04);
  ctx.beginPath();
  rr(ctx, L + 1, T + 1, S - 2, S - 2, cell * 0.08);
  ctx.stroke();
  // Auflagepfosten rechts
  box(ctx, L + S * 0.8, y - S * 0.08, S * 0.12, S * 0.08, S * 0.12, '#e9edf2', '#8f99a5', 1);
  // Antriebssäule links
  const pw = S * 0.22;
  box(ctx, L + S * 0.03, y - S * 0.2, pw, pw * 0.75, S * 0.22, '#ff3b30', '#a8160d', cell * 0.04);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(L + S * 0.05, y - S * 0.19, pw - S * 0.04, Math.max(0.8, cell * 0.03));
  // Schlagbaum
  const px = L + S * 0.14, py = y - S * 0.12;
  const len = S * 0.8;
  const a = -open * Math.PI * 0.42;
  const tx = px + Math.cos(a) * len, ty = py + Math.sin(a) * len * 1.05;
  const bw = Math.max(2.5, cell * 0.12);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(20,25,30,0.25)';
  ctx.lineWidth = bw;
  ctx.beginPath(); ctx.moveTo(px + 2, py + 4 + open * cell * 0.25); ctx.lineTo(tx + 2 + open * 2, ty + 4 + open * cell * 0.5); ctx.stroke();
  ctx.lineCap = 'butt';
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    ctx.strokeStyle = i % 2 ? '#ffffff' : '#ff0a1e';
    ctx.lineWidth = bw;
    ctx.beginPath();
    ctx.moveTo(px + (tx - px) * (i / segs), py + (ty - py) * (i / segs));
    ctx.lineTo(px + (tx - px) * ((i + 1) / segs), py + (ty - py) * ((i + 1) / segs));
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 0.7;
  const nx = -(ty - py) / len, ny = (tx - px) / len;
  ctx.beginPath();
  ctx.moveTo(px + nx * bw / 2, py + ny * bw / 2);
  ctx.lineTo(tx + nx * bw / 2, ty + ny * bw / 2);
  ctx.stroke();
  circle(ctx, px, py, bw * 0.75, '#2b2e35');
  circle(ctx, px, py, bw * 0.3, '#c9d1da');
  // Signallicht
  const lc = open >= 1 ? '#3dff7e' : '#ff3b3b';
  circle(ctx, L + S * 0.14, y - S * 0.3, cell * 0.07, '#1d1f24');
  circle(ctx, L + S * 0.14, y - S * 0.3, cell * 0.045, lc);
  if (o.count != null) drawBadge(ctx, L + S - cell * 0.06, T + cell * 0.04, cell * 0.22, '#ff8a00', String(o.count));
  ctx.restore();
}

// Drehscheibe aus Riffelblech mit Pfeilen. rot = Drehwinkel (rad).
export function drawTurntable(ctx, x, y, r, rot = 0) {
  ctx.save();
  // Grube
  ellipse(ctx, x + 1.5, y + 3, r * 1.06, r * 1.0, 'rgba(20,25,30,0.25)');
  circle(ctx, x, y, r * 1.06, '#2b2f36');
  circle(ctx, x, y + r * 0.05, r * 0.98, '#14171c');
  // Scheibe
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#eef2f6');
  g.addColorStop(0.7, '#b4bcc7');
  g.addColorStop(1, '#8b95a2');
  circle(ctx, x, y, r * 0.95, g);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.93, 0, TAU);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(rot);
  // Riffelmuster
  const st = Math.max(3, r * 0.14);
  ctx.strokeStyle = 'rgba(70,80,95,0.35)';
  ctx.lineWidth = Math.max(0.6, r * 0.03);
  ctx.beginPath();
  for (let i = -r; i < r; i += st) for (let j = -r; j < r; j += st) {
    const o = ((i + j) / st) & 1;
    const d = st * 0.25;
    if (o) { ctx.moveTo(i - d, j - d); ctx.lineTo(i + d, j + d); } else { ctx.moveTo(i - d, j + d); ctx.lineTo(i + d, j - d); }
  }
  ctx.stroke();
  // Fahrspur-Markierung
  ctx.fillStyle = 'rgba(255,204,0,0.9)';
  ctx.fillRect(-r, -r * 0.42, r * 2, r * 0.07);
  ctx.fillRect(-r, r * 0.35, r * 2, r * 0.07);
  // Drehpfeile (im Uhrzeigersinn)
  ctx.strokeStyle = '#ff8a00';
  ctx.fillStyle = '#ff8a00';
  ctx.lineWidth = r * 0.11;
  for (let k = 0; k < 2; k++) {
    ctx.save();
    ctx.rotate(k * Math.PI);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.7, -Math.PI * 0.85, -Math.PI * 0.25);
    ctx.stroke();
    const ex = Math.cos(-Math.PI * 0.25) * r * 0.7, ey = Math.sin(-Math.PI * 0.25) * r * 0.7;
    ctx.translate(ex, ey);
    ctx.rotate(Math.PI * 0.25);
    ctx.beginPath();
    ctx.moveTo(0, r * 0.2);
    ctx.lineTo(-r * 0.15, -r * 0.03);
    ctx.lineTo(r * 0.15, -r * 0.03);
    ctx.closePath();
    ctx.rotate(0);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // Rand und Nabe
  ctx.strokeStyle = '#5d6672';
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath(); ctx.arc(x, y, r * 0.94, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = Math.max(0.6, r * 0.025);
  ctx.beginPath(); ctx.arc(x, y, r * 0.9, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
  circle(ctx, x, y, r * 0.16, '#3b414b');
  circle(ctx, x, y, r * 0.09, '#ffcc00');
  circle(ctx, x - r * 0.03, y - r * 0.03, r * 0.035, '#fff3b0');
  ctx.restore();
}

// ---------- Symbole ----------

// Runde Plakette mit Zahl/Text.
export function drawBadge(ctx, x, y, r, color = '#ff0a1e', text = '') {
  ctx.save();
  circle(ctx, x + r * 0.08, y + r * 0.18, r * 1.08, 'rgba(0,0,0,0.25)');
  circle(ctx, x, y, r * 1.08, '#ffffff');
  circle(ctx, x, y + r * 0.08, r * 0.9, shade(color, -0.3));
  circle(ctx, x, y, r * 0.88, color);
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.38, r * 0.6, r * 0.32, 0, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fill();
  const t = String(text);
  if (t) {
    const px = r * (t.length > 2 ? 0.8 : t.length > 1 ? 1.0 : 1.25);
    outlinedText(ctx, t, x, y + r * 0.05, px, '#ffffff', shade(color, -0.55), px * 0.2);
  }
  ctx.restore();
}

// Vorhängeschloss (gold). s = Höhe.
export function drawPadlock(ctx, x, y, s = 16, color = '#ffc21a') {
  const w = s * 0.72, h = s * 0.55;
  ctx.save();
  // Bügel
  ctx.lineWidth = s * 0.12;
  ctx.strokeStyle = '#6f7884';
  ctx.beginPath();
  ctx.arc(x, y - h * 0.2, w * 0.3, Math.PI, 0);
  ctx.lineTo(x + w * 0.3, y - h * 0.05);
  ctx.moveTo(x - w * 0.3, y - h * 0.2);
  ctx.lineTo(x - w * 0.3, y - h * 0.05);
  ctx.stroke();
  ctx.lineWidth = s * 0.045;
  ctx.strokeStyle = '#d7dde4';
  ctx.beginPath();
  ctx.arc(x, y - h * 0.2, w * 0.3, Math.PI * 1.1, Math.PI * 1.55);
  ctx.stroke();
  // Körper
  fillRR(ctx, x - w / 2, y - h * 0.05 + s * 0.06, w, h, s * 0.1, shade(color, -0.4));
  const g = ctx.createLinearGradient(0, y - h * 0.05, 0, y + h);
  g.addColorStop(0, shade(color, 0.35));
  g.addColorStop(1, shade(color, -0.1));
  fillRR(ctx, x - w / 2, y - h * 0.05, w, h, s * 0.1, g);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillRect(x - w / 2 + s * 0.06, y - h * 0.05 + s * 0.04, w - s * 0.12, s * 0.04);
  // Schlüsselloch
  circle(ctx, x, y + h * 0.35, s * 0.065, '#3a2a05');
  ctx.fillStyle = '#3a2a05';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.035, y + h * 0.38);
  ctx.lineTo(x + s * 0.035, y + h * 0.38);
  ctx.lineTo(x + s * 0.05, y + h * 0.7);
  ctx.lineTo(x - s * 0.05, y + h * 0.7);
  ctx.fill();
  ctx.restore();
}

// Schlüssel (gold). s = Länge.
export function drawKey(ctx, x, y, s = 16, color = '#ffc21a', angle = -0.6) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const draw = (c, ox, oy) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(-s * 0.3 + ox, oy, s * 0.2, 0, TAU);
    ctx.arc(-s * 0.3 + ox, oy, s * 0.08, 0, TAU, true);
    ctx.fill();
    ctx.fillRect(-s * 0.12 + ox, -s * 0.05 + oy, s * 0.58, s * 0.1);
    ctx.fillRect(s * 0.3 + ox, s * 0.04 + oy, s * 0.07, s * 0.13);
    ctx.fillRect(s * 0.16 + ox, s * 0.04 + oy, s * 0.07, s * 0.09);
  };
  draw('rgba(0,0,0,0.25)', s * 0.04, s * 0.06);
  draw(shade(color, -0.35), 0, s * 0.03);
  draw(color, 0, 0);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(-s * 0.1, -s * 0.045, s * 0.5, s * 0.03);
  ctx.beginPath();
  ctx.arc(-s * 0.3, 0, s * 0.15, Math.PI * 1.1, Math.PI * 1.6);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = s * 0.03;
  ctx.stroke();
  ctx.restore();
}

// Grüner Haken mit Strahlenkranz. s = Durchmesser.
export function drawCheck(ctx, x, y, s = 20) {
  const r = s / 2;
  ctx.save();
  ctx.beginPath();
  const n = 12;
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * TAU - Math.PI / 2;
    const rad = i % 2 ? r * 0.78 : r;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.fillStyle = '#b6ff8a';
  ctx.fill();
  circle(ctx, x, y + r * 0.06, r * 0.7, '#0f8f45');
  circle(ctx, x, y, r * 0.68, '#14d200');
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.3, r * 0.45, r * 0.22, 0, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fill();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0b6b33';
  ctx.lineWidth = r * 0.24;
  const path = () => { ctx.beginPath(); ctx.moveTo(x - r * 0.32, y + r * 0.02); ctx.lineTo(x - r * 0.08, y + r * 0.26); ctx.lineTo(x + r * 0.35, y - r * 0.22); };
  ctx.save(); ctx.translate(0, r * 0.05); path(); ctx.stroke(); ctx.restore();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = r * 0.18;
  path();
  ctx.stroke();
  ctx.restore();
}

// Abgas-/Staubwolke. alpha 0..1 (zum Ausblenden).
export function drawPuff(ctx, x, y, r, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  const b = [[0, 0, 1], [-0.55, 0.2, 0.7], [0.55, 0.15, 0.75], [0.1, -0.45, 0.65]];
  ctx.fillStyle = 'rgba(120,128,140,0.45)';
  ctx.beginPath();
  for (const [ox, oy, k] of b) { ctx.moveTo(x + ox * r + k * r * 0.6, y + oy * r + r * 0.12); ctx.arc(x + ox * r, y + oy * r + r * 0.12, k * r * 0.6, 0, TAU); }
  ctx.fill();
  ctx.fillStyle = 'rgba(235,238,243,0.9)';
  ctx.beginPath();
  for (const [ox, oy, k] of b) { ctx.moveTo(x + ox * r + k * r * 0.55, y + oy * r); ctx.arc(x + ox * r, y + oy * r, k * r * 0.55, 0, TAU); }
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(x - r * 0.2, y - r * 0.25, r * 0.22, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// Funkeln (4-zackiger Stern), t = Zeit in s für Drehen/Pulsieren.
export function drawSparkle(ctx, x, y, r, t = 0, color = '#fff6a8') {
  const k = 0.75 + 0.25 * Math.sin(t * 6);
  const rr2 = r * k;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 1.5);
  circle(ctx, 0, 0, rr2 * 0.7, rgba(color, 0.25));
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const d = i % 2 ? rr2 * 0.22 : rr2;
    ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  circle(ctx, 0, 0, rr2 * 0.18, '#ffffff');
  ctx.restore();
}
