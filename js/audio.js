// Sound, Musik und Vibration. Alles per Web Audio synthetisiert – keine Audiodateien.
//
// Signalfluss:
//   SFX-Stimmen ──► sfx ───────────────────────────────┐
//        └─(Send)─► sfxRev ─┐                          ├─► master ─► Limiter ─► Ausgang
//   Musik-Stimmen ─► music ─► duck ─► musicGate ───────┤
//                                        └─► musicRev ─┴─► Convolver (Hall) ─► revOut ─┘

const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;

const state = { sound: true, music: true, vibration: true };
const VOL = { master: 0.9, sfx: 0.8, music: 0.22, reverb: 0.5, musicRev: 0.22 };
const MAX_SFX_VOICES = 48; // Obergrenze gleichzeitiger SFX-Oszillatoren/Quellen

let G = null;        // aktuell verwendeter Graph (live oder offline beim Testen)
let liveG = null;    // Graph des echten AudioContext
let masterVol = 1;   // externe Master-Lautstärke (0 = stumm, z. B. für Tests)
let userSuspended = false;
let silentPlayed = false;
let sfxVoices = 0;
let trim = 1; // Abmisch-Faktor des gerade gespielten Effekts
const lastPlay = Object.create(null);

const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const jitter = (amt) => 1 + (Math.random() * 2 - 1) * amt;
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function quiet(p) {
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

// ---------- Graph ----------
function gainNode(c, v, dest) {
  const g = c.createGain();
  g.gain.value = v;
  if (dest) g.connect(dest);
  return g;
}

function makeNoise(c) {
  const len = c.sampleRate; // 1 s weißes Rauschen, wird für alle Rausch-Effekte wiederverwendet
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// Kurzer, weicher Raumhall: abklingendes Rauschen, das mit der Zeit dunkler wird.
function makeImpulse(c, secs = 1.4, decay = 3) {
  const rate = c.sampleRate;
  const len = Math.floor(rate * secs);
  const pre = Math.floor(rate * 0.012);
  const buf = c.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = (i - pre) / (len - pre);
      const k = 0.85 - 0.7 * x; // Dämpfung: Höhen klingen schneller ab
      lp += ((Math.random() * 2 - 1) - lp) * k;
      const fadeIn = Math.min(1, (i - pre) / (rate * 0.004));
      d[i] = lp * Math.pow(1 - x, decay) * fadeIn * 0.5;
    }
  }
  return buf;
}

function buildGraph(c, opts = {}) {
  const g = { ctx: c };
  let out = c.destination;
  if (!opts.noLimiter) {
    try {
      const lim = c.createDynamicsCompressor();
      lim.threshold.value = -5;
      lim.knee.value = 4;
      lim.ratio.value = 14;
      lim.attack.value = 0.002;
      lim.release.value = 0.2;
      lim.connect(c.destination);
      out = lim;
    } catch { /* ohne Limiter */ }
  }
  g.master = gainNode(c, VOL.master * masterVol, out);
  g.sfx = gainNode(c, VOL.sfx, g.master);
  g.musicGate = gainNode(c, 0, g.master);
  g.duck = gainNode(c, 1, g.musicGate);
  g.music = gainNode(c, VOL.music, g.duck);
  g.noise = makeNoise(c);
  try {
    const conv = c.createConvolver();
    conv.normalize = true;
    conv.buffer = makeImpulse(c);
    const revOut = gainNode(c, VOL.reverb, g.master);
    conv.connect(revOut);
    g.sfxRev = gainNode(c, VOL.sfx, conv);
    const mr = gainNode(c, VOL.musicRev, conv);
    g.musicGate.connect(mr);
  } catch {
    g.sfxRev = null;
  }
  return g;
}

// ---------- Stimmen ----------
// Hüllkurve: 0 → Attack (linear) → Hold → exponentielles Abklingen → 0. Keine Knackser.
function env(param, when, a, hold, dur, vol) {
  param.setValueAtTime(0, when);
  param.linearRampToValueAtTime(vol, when + a);
  if (hold > 0) param.setValueAtTime(vol, when + a + hold);
  const end = when + Math.max(dur, a + hold + 0.02);
  param.exponentialRampToValueAtTime(Math.max(vol * 0.002, 1e-5), end);
  param.linearRampToValueAtTime(0, end + 0.015);
  return end + 0.02;
}

function finish(src, nodes, counted) {
  if (counted) sfxVoices++;
  src.onended = () => {
    for (const n of nodes) { try { n.disconnect(); } catch { /* egal */ } }
    if (counted) sfxVoices = Math.max(0, sfxVoices - 1);
  };
}

function route(node, o, nodes) {
  const c = G.ctx;
  let n = node;
  if (o.pan && c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = o.pan;
    n.connect(p);
    nodes.push(p);
    n = p;
  }
  n.connect(o.bus || G.sfx);
  if (o.rev && G.sfxRev && !o.bus) {
    const s = gainNode(c, o.rev, G.sfxRev);
    n.connect(s);
    nodes.push(s);
  }
}

function addFilter(c, head, nodes, o, when, end) {
  if (o.lp) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(o.lp, when);
    if (o.lp2) f.frequency.exponentialRampToValueAtTime(o.lp2, when + (o.lpT || end - when));
    f.Q.value = o.q || 0.7;
    head.connect(f);
    nodes.push(f);
    head = f;
  }
  if (o.hp) {
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = o.hp;
    f.Q.value = 0.7;
    head.connect(f);
    nodes.push(f);
    head = f;
  }
  return head;
}

function lfo(c, when, end, freq, freq2, depth, target, nodes) {
  const l = c.createOscillator();
  const lg = c.createGain();
  l.frequency.setValueAtTime(freq, when);
  if (freq2) l.frequency.linearRampToValueAtTime(freq2, end);
  lg.gain.value = depth;
  l.connect(lg);
  lg.connect(target);
  l.start(when);
  l.stop(end);
  nodes.push(l, lg);
}

// Oszillator-Stimme
// o: when, type, f, f2, glide, dur, vol, a, hold, detune, lp, lp2, lpT, q, hp, vib:[hz,cent], trem:[hz,tiefe,hz2], pan, rev, bus
function tone(o) {
  const g = G;
  if (!g) return;
  const c = g.ctx;
  const when = Math.max(o.when, c.currentTime);
  const src = c.createOscillator();
  const nodes = [src];
  src.type = o.type || 'sine';
  src.frequency.setValueAtTime(o.f, when);
  if (o.f2) src.frequency.exponentialRampToValueAtTime(o.f2, when + (o.glide || o.dur));
  if (o.detune) src.detune.setValueAtTime(o.detune, when);
  const amp = c.createGain();
  nodes.push(amp);
  const end = env(amp.gain, when, o.a ?? 0.005, o.hold || 0, o.dur, o.bus ? o.vol : o.vol * trim);
  if (o.vib) lfo(c, when, end, o.vib[0], 0, o.vib[1], src.detune, nodes);
  let head = addFilter(c, src, nodes, o, when, end);
  if (o.trem) {
    const tg = gainNode(c, 1 - o.trem[1]);
    lfo(c, when, end, o.trem[0], o.trem[2], o.trem[1], tg.gain, nodes);
    head.connect(tg);
    nodes.push(tg);
    head = tg;
  }
  head.connect(amp);
  route(amp, o, nodes);
  finish(src, nodes, !o.bus);
  src.start(when);
  src.stop(end);
}

// Rausch-Stimme (gefiltert). o: when, dur, vol, ft, f, f2, q, a, hold, pan, rev, bus
function noise(o) {
  const g = G;
  if (!g) return;
  const c = g.ctx;
  const when = Math.max(o.when, c.currentTime);
  const src = c.createBufferSource();
  src.buffer = g.noise;
  const fl = c.createBiquadFilter();
  fl.type = o.ft || 'bandpass';
  fl.frequency.setValueAtTime(o.f || 1000, when);
  if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, when + o.dur);
  fl.Q.value = o.q ?? 1;
  const amp = c.createGain();
  const nodes = [src, fl, amp];
  const end = env(amp.gain, when, o.a ?? 0.002, o.hold || 0, o.dur, o.bus ? o.vol : o.vol * trim);
  src.connect(fl);
  fl.connect(amp);
  route(amp, o, nodes);
  finish(src, nodes, !o.bus);
  const offset = Math.random() * Math.max(0, g.noise.duration - (end - when) - 0.01);
  src.start(when, offset);
  src.stop(end);
}

// Kleine Bausteine
function bell(when, f, vol, dur, extra = {}) {
  tone({ when, type: 'sine', f, dur, vol, a: 0.003, ...extra });
  tone({ when, type: 'sine', f: f * 2, dur: dur * 0.45, vol: vol * 0.28, a: 0.002, ...extra });
  tone({ when, type: 'sine', f: f * 3.01, dur: dur * 0.2, vol: vol * 0.12, a: 0.001, ...extra });
}

function hornVoice(when, len, vol = 0.06, pitch = 1) {
  for (const f of [392, 494]) {
    tone({ when, type: 'sawtooth', f: f * pitch, dur: len + 0.07, hold: len, a: 0.012, vol, lp: 1700, q: 1.2, vib: [7, 9], rev: 0.06 });
    tone({ when, type: 'square', f: f * pitch * 0.5, dur: len + 0.06, hold: len, a: 0.012, vol: vol * 0.45, lp: 900 });
  }
}

function duck(level, holdSec) {
  if (!liveG || G !== liveG) return;
  try {
    const p = liveG.duck.gain;
    const t = liveG.ctx.currentTime;
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
    else { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); }
    p.setTargetAtTime(level, t, 0.06);
    p.setTargetAtTime(1, t + holdSec, 0.7);
  } catch { /* egal */ }
}

// ---------- Soundeffekte ----------
// Jede Funktion bekommt als ersten Parameter die Startzeit t (AudioContext-Zeit).
let palletStreak = 0;
let lastPalletMs = -1e9;
let fullStreak = 0;
let lastFullMs = -1e9;
let coinStreak = 0;
let lastCoinMs = -1e9;
const PENTA = [67, 69, 72, 74, 76, 79, 81, 84, 86, 88, 91]; // G-Dur/C-Dur-pentatonisch ab G4

const SFX = {
  // Antippen (LKW angetippt / allgemeiner Klick): weicher „Pop“
  tap(t) {
    const r = jitter(0.04);
    tone({ when: t, type: 'sine', f: 900 * r, f2: 560 * r, glide: 0.05, dur: 0.09, vol: 0.3, a: 0.002 });
    tone({ when: t, type: 'triangle', f: 1800 * r, dur: 0.03, vol: 0.05, a: 0.001 });
  },

  // UI-Knopf: etwas runder und tiefer als tap
  button(t) {
    const r = jitter(0.03);
    tone({ when: t, type: 'sine', f: 640 * r, f2: 430 * r, glide: 0.06, dur: 0.1, vol: 0.32, a: 0.002 });
    noise({ when: t, ft: 'highpass', f: 3500, dur: 0.018, vol: 0.06 });
  },

  // Losfahren: kurzes Diesel-Brummen, gelegentlich ein kleines Hupen
  start(t) {
    const r = jitter(0.08);
    const pan = (Math.random() - 0.5) * 0.4;
    tone({ when: t, type: 'sawtooth', f: 46 * r, f2: 84 * r, glide: 0.25, dur: 0.42, vol: 0.2, a: 0.02, lp: 240, lp2: 950, lpT: 0.22, q: 2, trem: [22 * r, 0.45, 34 * r], pan });
    tone({ when: t, type: 'sine', f: 55 * r, f2: 78 * r, glide: 0.25, dur: 0.34, vol: 0.2, a: 0.02, pan });
    noise({ when: t, ft: 'lowpass', f: 380, dur: 0.16, vol: 0.12, a: 0.004, pan });
    if (Math.random() < 0.18) hornVoice(t + 0.2, 0.06, 0.035, jitter(0.05));
  },

  // Blockiert: zwei dumpfe Ruckler
  blocked(t) {
    tone({ when: t, type: 'sine', f: 150, f2: 68, glide: 0.1, dur: 0.13, vol: 0.45, a: 0.002 });
    tone({ when: t, type: 'triangle', f: 230, f2: 180, glide: 0.08, dur: 0.09, vol: 0.09, lp: 900 });
    noise({ when: t, ft: 'lowpass', f: 650, dur: 0.06, vol: 0.18 });
    tone({ when: t + 0.1, type: 'sine', f: 120, f2: 58, glide: 0.1, dur: 0.13, vol: 0.32, a: 0.002 });
    noise({ when: t + 0.1, ft: 'lowpass', f: 500, dur: 0.05, vol: 0.1 });
  },

  // Keine Rampe frei: sanftes „uh-uh“
  noRamp(t) {
    const o = { type: 'triangle', lp: 1800, a: 0.01, rev: 0.12 };
    tone({ ...o, when: t, f: mf(76), dur: 0.12, vol: 0.17 });
    tone({ ...o, when: t + 0.13, f: mf(72), f2: mf(70.6), glide: 0.2, dur: 0.24, vol: 0.17 });
  },

  // Palette verladen: holziges „Klonk“, Tonhöhe steigt mit Füllstand und Serie
  pallet(t, fill = 0) {
    const ms = nowMs();
    palletStreak = ms - lastPalletMs < 650 ? palletStreak + 1 : 0;
    lastPalletMs = ms;
    const idx = Math.min(PENTA.length - 1, Math.round(clamp01(+fill || 0) * 6) + Math.min(palletStreak >> 2, 3));
    const f = mf(PENTA[idx]);
    const pan = (Math.random() - 0.5) * 0.3;
    tone({ when: t, type: 'triangle', f: f / 2, f2: f / 2 * 0.985, dur: 0.15, vol: 0.3, a: 0.001, lp: 1400, pan, rev: 0.07 });
    tone({ when: t, type: 'sine', f, dur: 0.09, vol: 0.15, a: 0.001, pan, rev: 0.07 });
    tone({ when: t, type: 'sine', f: 120, f2: 55, glide: 0.08, dur: 0.1, vol: 0.32, a: 0.001 });
    noise({ when: t, ft: 'bandpass', f: 2400, q: 1.3, dur: 0.028, vol: 0.28, pan });
  },

  // LKW voll: fröhlicher Dur-Akkord (steigt bei mehreren LKWs kurz hintereinander)
  full(t) {
    const ms = nowMs();
    fullStreak = ms - lastFullMs < 4500 ? Math.min(fullStreak + 1, 4) : 0;
    lastFullMs = ms;
    const base = 72 + [0, 2, 4, 5, 7][fullStreak];
    [0, 4, 7, 12].forEach((n, i) => bell(t + i * 0.055, mf(base + n), 0.13, 0.5, { pan: (i - 1.5) * 0.15, rev: 0.25 }));
    [-12, -8, -5].forEach((n) => tone({ when: t, type: 'triangle', f: mf(base + n), dur: 0.6, a: 0.02, hold: 0.08, vol: 0.06, lp: 2000, rev: 0.2 }));
    bell(t + 0.24, mf(base + 24), 0.035, 0.35, { rev: 0.4 });
  },

  // Combo (n = Kettenlänge): Wusch + aufsteigendes Arpeggio
  combo(t, n = 2) {
    const k = Math.max(2, Math.min(+n || 2, 8));
    const base = 72 + Math.min(k - 2, 5) * 2;
    noise({ when: t, ft: 'bandpass', f: 500, f2: 3500, q: 1.4, dur: 0.28, a: 0.06, vol: 0.12, rev: 0.2 });
    const notes = [0, 4, 7, 12, 16, 19].slice(0, Math.min(k + 1, 6));
    notes.forEach((s, i) => bell(t + 0.05 + i * 0.045, mf(base + s), 0.11, 0.35, { pan: (i / notes.length - 0.5) * 0.4, rev: 0.25 }));
  },

  // Hupe beim Abfahren: freundliches Doppel-Hupen
  horn(t) {
    hornVoice(t, 0.07);
    hornVoice(t + 0.15, 0.17);
  },

  // Abfahrt: Motor dreht hoch und entfernt sich
  depart(t) {
    const r = jitter(0.06);
    tone({ when: t, type: 'sawtooth', f: 50 * r, f2: 125 * r, glide: 0.8, dur: 1.0, hold: 0.25, vol: 0.15, a: 0.04, lp: 260, lp2: 1100, lpT: 0.6, q: 1.5, trem: [18 * r, 0.4, 40 * r] });
    tone({ when: t, type: 'sine', f: 45 * r, f2: 92 * r, glide: 0.8, dur: 0.85, hold: 0.2, vol: 0.16, a: 0.04 });
    noise({ when: t, ft: 'lowpass', f: 400, f2: 1400, dur: 0.75, vol: 0.06, a: 0.08 });
  },

  // Warnung (nur noch eine Rampe frei): sanftes „Ding-Dong“
  warn(t) {
    bell(t, mf(81), 0.13, 0.4, { rev: 0.2 });
    bell(t + 0.17, mf(76), 0.13, 0.55, { rev: 0.2 });
  },

  // Sieg-Jingle
  win(t) {
    duck(0.2, 2.2);
    const lead = { type: 'sawtooth', lp: 2400, q: 0.8, a: 0.008, rev: 0.22 };
    [[0, 67], [0.1, 72], [0.2, 76], [0.3, 79]].forEach(([d, m]) => {
      tone({ ...lead, when: t + d, f: mf(m), dur: 0.16, vol: 0.07 });
      tone({ when: t + d, type: 'triangle', f: mf(m), dur: 0.16, vol: 0.12, a: 0.005, rev: 0.2 });
    });
    const t2 = t + 0.42;
    tone({ ...lead, when: t2, f: mf(84), dur: 0.9, hold: 0.25, vol: 0.075, vib: [5.5, 12] });
    tone({ when: t2, type: 'triangle', f: mf(84), dur: 0.9, hold: 0.25, vol: 0.12, a: 0.005, rev: 0.25 });
    [60, 64, 67, 72].forEach((m) => tone({ when: t2, type: 'triangle', f: mf(m), dur: 1.3, hold: 0.3, a: 0.03, vol: 0.055, lp: 2200, rev: 0.25 }));
    tone({ when: t2, type: 'sine', f: mf(48), dur: 0.9, hold: 0.15, vol: 0.28, a: 0.01 });
    tone({ when: t2, type: 'sine', f: 150, f2: 48, glide: 0.1, dur: 0.28, vol: 0.4, a: 0.002 });
    noise({ when: t2, ft: 'highpass', f: 5500, dur: 0.9, vol: 0.05, a: 0.003 });
    [[0.55, 88], [0.68, 91], [0.81, 96]].forEach(([d, m], i) => bell(t + d, mf(m), 0.045, 0.45, { pan: (i - 1) * 0.4, rev: 0.4 }));
  },

  // Niederlage: sanft und tröstlich statt frustrierend
  lose(t) {
    duck(0.25, 2.0);
    const o = { type: 'triangle', lp: 1500, a: 0.02, rev: 0.28, vib: [5, 6] };
    tone({ ...o, when: t, f: mf(67), dur: 0.3, vol: 0.15 });
    tone({ ...o, when: t + 0.22, f: mf(64), dur: 0.3, vol: 0.15 });
    tone({ ...o, when: t + 0.44, f: mf(62), f2: mf(61.3), glide: 0.6, dur: 0.75, hold: 0.15, vol: 0.15 });
    [53, 57, 60].forEach((m) => tone({ when: t + 0.5, type: 'triangle', f: mf(m), dur: 1.3, hold: 0.25, a: 0.12, vol: 0.05, lp: 900, rev: 0.3 }));
    tone({ when: t + 0.5, type: 'sine', f: mf(41), dur: 1.1, hold: 0.2, a: 0.05, vol: 0.18 });
  },

  // Münze: klassisches „Ding-Ding“, steigt bei schneller Folge
  coin(t) {
    const ms = nowMs();
    coinStreak = ms - lastCoinMs < 700 ? Math.min(coinStreak + 1, 6) : 0;
    lastCoinMs = ms;
    const tr = coinStreak * 2;
    const a = mf(83 + tr);
    const b = mf(88 + tr);
    tone({ when: t, type: 'square', f: a, dur: 0.08, vol: 0.045, a: 0.001, lp: 5000 });
    tone({ when: t, type: 'sine', f: a, dur: 0.08, vol: 0.12, a: 0.001 });
    tone({ when: t + 0.07, type: 'square', f: b, dur: 0.34, vol: 0.045, a: 0.001, lp: 5000, rev: 0.15 });
    tone({ when: t + 0.07, type: 'sine', f: b, dur: 0.38, vol: 0.13, a: 0.001, rev: 0.15 });
  },

  // Booster aktiviert: Wusch + funkelndes Arpeggio
  booster(t) {
    noise({ when: t, ft: 'bandpass', f: 300, f2: 4000, q: 1.6, dur: 0.38, a: 0.08, vol: 0.16, rev: 0.2 });
    tone({ when: t, type: 'sine', f: 200, f2: 800, glide: 0.3, dur: 0.32, vol: 0.12, a: 0.03 });
    [72, 76, 79, 84, 88].forEach((m, i) => bell(t + 0.12 + i * 0.045, mf(m), 0.09, 0.35, { pan: (i - 2) * 0.15, rev: 0.3 }));
  },
};

// Abmischung (lineare Faktoren), per renderOffline auf ähnliche Lautheit gebracht
const TRIM = { pallet: 0.85, blocked: 0.8, noRamp: 1.35, combo: 1.6, horn: 1.25, depart: 0.7, warn: 1.25, win: 0.7, lose: 0.85, coin: 1.15, booster: 1.5 };

// Diese Effekte werden auch bei vollem Stimmen-Budget gespielt
const PRIORITY = { win: 1, lose: 1, full: 1 };

// Mindestabstand je Effekt in ms (verhindert Lautstärke-Explosionen bei Serien)
const GAP = { tap: 30, button: 30, start: 70, blocked: 90, noRamp: 120, pallet: 35, full: 60, combo: 120, horn: 120, depart: 150, warn: 300, win: 500, lose: 500, coin: 40, booster: 150 };

function canPlay() {
  if (!state.sound || !G) return false;
  const st = G.ctx.state;
  if (st === 'closed') return false;
  if (st !== 'running' && (userSuspended || (typeof document !== 'undefined' && document.hidden))) return false;
  return true;
}

export const sfx = {};
for (const name of Object.keys(SFX)) {
  sfx[name] = (...args) => {
    if (!canPlay()) return;
    const ms = nowMs();
    if (ms - (lastPlay[name] ?? -1e9) < (GAP[name] || 0)) return;
    if (sfxVoices > MAX_SFX_VOICES && !PRIORITY[name]) return;
    lastPlay[name] = ms;
    trim = TRIM[name] || 1;
    try { SFX[name](G.ctx.currentTime + 0.008, ...args); } catch { /* Audio-Fehler nie nach außen geben */ }
    trim = 1;
  };
}

export function vibrate(ms) {
  if (state.vibration && typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch { /* ignorieren */ }
  }
}

// ---------- Musik ----------
// Zwei nahtlos loopende 8-Takt-Stücke in C-Dur. Menü: ruhig, Spiel: lebendiger mit Beat.
// Akkorde: [Bass-MIDI, [Akkordtöne]]; Melodie pro Takt: [Schritt (16tel), MIDI, Länge in 16teln]
const SONGS = {
  game: {
    bpm: 104,
    drums: true,
    chords: [
      [48, [60, 64, 67]], [43, [59, 62, 67]], [45, [60, 64, 69]], [41, [60, 65, 69]],
      [48, [60, 64, 67]], [43, [59, 62, 67]], [41, [60, 65, 69]], [43, [59, 62, 65]],
    ],
    melody: [
      [[0, 76, 2], [2, 79, 2], [4, 81, 2], [6, 79, 2], [8, 76, 4], [12, 72, 4]],
      [[0, 74, 2], [2, 76, 2], [4, 79, 4], [8, 74, 2], [10, 71, 2], [12, 74, 4]],
      [[0, 72, 2], [2, 76, 2], [4, 81, 4], [8, 79, 2], [10, 76, 2], [12, 72, 4]],
      [[0, 69, 2], [2, 72, 2], [4, 77, 4], [8, 76, 4], [12, 74, 4]],
      [[0, 79, 2], [2, 76, 2], [4, 79, 2], [6, 84, 6], [12, 79, 4]],
      [[0, 83, 2], [2, 81, 2], [4, 79, 4], [8, 74, 4]],
      [[0, 81, 2], [2, 79, 2], [4, 77, 2], [6, 81, 2], [8, 84, 4], [12, 81, 4]],
      [[0, 79, 4], [4, 77, 2], [6, 76, 2], [8, 74, 4], [12, 71, 4]],
    ],
  },
  menu: {
    bpm: 82,
    drums: false,
    chords: [
      [41, [57, 60, 64]], [40, [55, 59, 62]], [38, [57, 60, 65]], [36, [55, 59, 64]],
      [41, [57, 60, 64]], [40, [55, 59, 62]], [38, [57, 60, 65]], [36, [55, 59, 64]],
    ],
    melody: [
      [[0, 76, 6], [6, 72, 2], [8, 69, 8]],
      [[0, 74, 6], [6, 71, 2], [8, 67, 8]],
      [[0, 72, 6], [6, 69, 2], [8, 77, 8]],
      [[0, 76, 8], [8, 74, 4], [12, 71, 4]],
      [[0, 81, 6], [6, 79, 2], [8, 76, 8]],
      [[0, 79, 6], [6, 74, 2], [8, 71, 8]],
      [[0, 77, 4], [4, 76, 4], [8, 74, 8]],
      [[0, 71, 8], [8, 72, 8]],
    ],
  },
};

const music = { timer: null, mode: 'menu', forced: null, step: 0, bar: 0, loop: 0, next: 0 };
const stepDur = (song) => 60 / song.bpm / 4;

function playStep(song, bar, s, loop, when) {
  const bus = G.music;
  const sd = stepDur(song);
  const [root, chord] = song.chords[bar];
  const mel = song.melody[bar];

  if (song.drums) {
    // --- Spiel-Variante ---
    if (s === 0 || s === 8 || (bar === 7 && s === 14)) {
      tone({ bus, when, type: 'sine', f: 140, f2: 46, glide: 0.09, dur: 0.24, vol: 0.55, a: 0.002 });
    }
    if (s === 4 || s === 12 || (bar === 7 && s === 15)) {
      noise({ bus, when, ft: 'bandpass', f: 1900, q: 0.8, dur: 0.13, vol: 0.2 });
      tone({ bus, when, type: 'triangle', f: 190, f2: 150, glide: 0.06, dur: 0.07, vol: 0.08, a: 0.001 });
    }
    if (s % 2 === 0) noise({ bus, when, ft: 'highpass', f: 8000, dur: 0.035, vol: s % 4 === 2 ? 0.07 : 0.035 });

    const bassPat = { 0: [0, 3], 6: [0, 2], 8: [7, 2], 12: [12, 2], 14: [7, 2] };
    const bp = bassPat[s];
    if (bp) {
      const f = mf(root + bp[0]);
      const dur = bp[1] * sd * 0.95;
      tone({ bus, when, type: 'triangle', f, dur, vol: 0.32, a: 0.006, lp: 700 });
      tone({ bus, when, type: 'sine', f, dur, vol: 0.26, a: 0.006 });
    }
    if (s === 0) {
      chord.forEach((m) => tone({ bus, when, type: 'triangle', f: mf(m), dur: sd * 16, hold: sd * 6, a: 0.12, vol: 0.03, lp: 1000 }));
    }
    if (loop % 2 === 0) {
      // Akkord-Stabs auf den Offbeats + Melodie
      if (s % 4 === 2) chord.forEach((m) => tone({ bus, when, type: 'triangle', f: mf(m), dur: 0.14, vol: 0.05, a: 0.004, lp: 1900 }));
      for (const [st, m, len] of mel) {
        if (st !== s) continue;
        const dur = Math.max(0.22, len * sd * 1.1);
        tone({ bus, when, type: 'sine', f: mf(m), dur, vol: 0.15, a: 0.004 });
        tone({ bus, when, type: 'triangle', f: mf(m + 12), dur: dur * 0.35, vol: 0.035, a: 0.003 });
      }
    } else {
      // Durchatmen: nur leises Arpeggio
      const m = chord[[0, 1, 2, 1][(s >> 1) % 4]] + 12;
      if (s % 2 === 0) tone({ bus, when, type: 'sine', f: mf(m), dur: 0.2, vol: 0.06, a: 0.004 });
    }
  } else {
    // --- Menü-Variante ---
    if (s === 0) {
      chord.forEach((m) => {
        tone({ bus, when, type: 'triangle', f: mf(m), dur: sd * 17, hold: sd * 8, a: 0.4, vol: 0.04, lp: 900 });
        tone({ bus, when, type: 'triangle', f: mf(m), detune: 9, dur: sd * 17, hold: sd * 8, a: 0.4, vol: 0.035, lp: 900 });
      });
      tone({ bus, when, type: 'sine', f: mf(root), dur: sd * 9, hold: sd * 3, vol: 0.24, a: 0.02 });
    }
    if (s === 8) tone({ bus, when, type: 'sine', f: mf(root + 7), dur: sd * 7, hold: sd * 2, vol: 0.17, a: 0.02 });
    if (s % 4 === 2) {
      const m = chord[[0, 1, 2, 1][(s >> 2) % 4]] + 12;
      tone({ bus, when, type: 'sine', f: mf(m), dur: 0.35, vol: 0.05, a: 0.005 });
      noise({ bus, when, ft: 'highpass', f: 6500, dur: 0.05, vol: 0.035, a: 0.01 });
    }
    if (loop % 2 === 0 || bar >= 4) {
      for (const [st, m, len] of mel) {
        if (st !== s) continue;
        const dur = Math.max(0.4, len * sd * 1.3);
        tone({ bus, when, type: 'sine', f: mf(m), dur, vol: 0.13, a: 0.006 });
        tone({ bus, when, type: 'sine', f: mf(m) * 3.01, dur: dur * 0.18, vol: 0.02, a: 0.003 });
      }
    }
  }
}

function wantedMode() {
  if (music.forced) return music.forced;
  if (typeof document === 'undefined') return 'game';
  const el = document.getElementById('menu');
  return el && !el.classList.contains('hidden') ? 'menu' : 'game';
}

function musicTick() {
  const g = liveG;
  if (!g || G !== g || !music.timer) return;
  const c = g.ctx;
  if (c.state !== 'running') return;
  try {
    if (music.next < c.currentTime) music.next = c.currentTime + 0.05; // nach Hängern neu einrasten
    while (music.next < c.currentTime + 0.25) {
      if (music.step === 0) {
        const m = wantedMode();
        if (m !== music.mode) { music.mode = m; music.bar = 0; music.loop = 0; }
      }
      const song = SONGS[music.mode];
      playStep(song, music.bar, music.step, music.loop, music.next);
      music.next += stepDur(song);
      if (++music.step === 16) {
        music.step = 0;
        if (++music.bar === 8) { music.bar = 0; music.loop++; }
      }
    }
  } catch { /* nie werfen */ }
}

function startMusic() {
  if (!liveG || music.timer || !state.music) return;
  const c = liveG.ctx;
  try {
    const p = liveG.musicGate.gain;
    p.cancelScheduledValues(c.currentTime);
    p.setValueAtTime(p.value, c.currentTime);
    p.setTargetAtTime(1, c.currentTime, 0.4);
  } catch { /* egal */ }
  music.mode = wantedMode();
  music.step = 0;
  music.bar = 0;
  music.loop = 0;
  music.next = c.currentTime + 0.1;
  music.timer = setInterval(musicTick, 50);
  musicTick();
}

function stopMusic() {
  if (music.timer) clearInterval(music.timer);
  music.timer = null;
  if (!liveG) return;
  try {
    const c = liveG.ctx;
    const p = liveG.musicGate.gain;
    p.cancelScheduledValues(c.currentTime);
    p.setValueAtTime(p.value, c.currentTime);
    p.setTargetAtTime(0, c.currentTime, 0.08);
  } catch { /* egal */ }
}

// ---------- Öffentliche Steuerung ----------
export function configureAudio(settings) {
  const s = settings || {};
  state.sound = s.sound !== false;
  state.vibration = s.vibration !== false;
  const wantMusic = s.music !== false;
  if (wantMusic !== state.music) {
    state.music = wantMusic;
    if (wantMusic) startMusic();
    else stopMusic();
  }
}

// Muss bei einer Nutzer-Geste aufgerufen werden (iOS/Android-Regel). Mehrfachaufruf ist harmlos.
export function unlockAudio() {
  if (!AC) return;
  try {
    if (!liveG) {
      try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch { /* egal */ }
      let c;
      try { c = new AC({ latencyHint: 'interactive' }); } catch { c = new AC(); }
      liveG = buildGraph(c);
      G = liveG;
    }
    const c = liveG.ctx;
    const hidden = typeof document !== 'undefined' && document.hidden;
    if (c.state !== 'running' && c.state !== 'closed' && !hidden) {
      userSuspended = false;
      quiet(c.resume());
    }
    if (!silentPlayed) {
      // Ältere iOS-Versionen geben Audio erst frei, wenn in der Geste etwas abgespielt wurde
      const b = c.createBuffer(1, 1, 22050);
      const src = c.createBufferSource();
      src.buffer = b;
      src.connect(c.destination);
      src.start(0);
      silentPlayed = true;
    }
    if (state.music) startMusic();
  } catch { /* Audio nicht verfügbar – Spiel läuft stumm weiter */ }
}

// true = pausieren (z. B. Tab verborgen), false = fortsetzen
export function suspendAudio(s) {
  userSuspended = !!s;
  if (!liveG) return;
  const c = liveG.ctx;
  try {
    if (s) { if (c.state === 'running') quiet(c.suspend()); }
    else if (c.state !== 'running' && c.state !== 'closed') quiet(c.resume());
  } catch { /* egal */ }
}

// Master-Lautstärke 0..1 (zusätzlich zu den Ein/Aus-Schaltern)
export function setMasterVolume(v) {
  masterVol = Math.max(0, Math.min(1, +v || 0));
  if (!liveG) return;
  try { liveG.master.gain.setTargetAtTime(VOL.master * masterVol, liveG.ctx.currentTime, 0.02); } catch { /* egal */ }
}

// Musikvariante erzwingen ('menu' | 'game') oder null = automatisch (Menü sichtbar → Menü-Musik)
export function setMusicMode(mode) {
  music.forced = mode === 'menu' || mode === 'game' ? mode : null;
}

// Diagnose (Konsole/Tests)
export function audioInfo() {
  return {
    ctx: liveG ? liveG.ctx.state : 'none',
    sfxVoices,
    music: !!music.timer,
    mode: music.mode,
    master: masterVol,
  };
}

// Test-/Abmischhilfe: rendert einen Effekt (Name aus sfx) oder 'music:game' / 'music:menu'
// stumm in einem OfflineAudioContext und liefert Pegel. raw = ohne Limiter messen.
export async function renderOffline(name, args = [], seconds = 2, raw = true) {
  const OAC = typeof window !== 'undefined' && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
  if (!OAC) return null;
  const rate = 44100;
  const oc = new OAC(2, Math.ceil(seconds * rate), rate);
  const prev = G;
  G = buildGraph(oc, { noLimiter: raw });
  G.musicGate.gain.value = 1;
  G.master.gain.value = VOL.master;
  try {
    if (name.startsWith('music:')) {
      const song = SONGS[name.slice(6)];
      const sd = stepDur(song);
      for (let i = 0, t = 0.02; t < seconds - 0.05; i++, t += sd) playStep(song, (i >> 4) % 8, i % 16, Math.floor(i / 128), t);
    } else {
      trim = TRIM[name] || 1;
      SFX[name](0.02, ...args);
    }
  } finally {
    G = prev;
    trim = 1;
  }
  const buf = await oc.startRendering();
  let peak = 0;
  let sum = 0;
  let n = 0;
  let loud = 0; // lauteste 100-ms-Strecke (RMS) – grobes Lautheitsmaß für kurze Effekte
  const win = Math.floor(rate * 0.1);
  const chans = [];
  for (let ch = 0; ch < buf.numberOfChannels; ch++) chans.push(buf.getChannelData(ch));
  for (let start = 0; start < buf.length; start += win) {
    let ws = 0;
    let wn = 0;
    for (const d of chans) {
      const e = Math.min(d.length, start + win);
      for (let i = start; i < e; i++) {
        const v = d[i];
        if (!Number.isFinite(v)) return { name, error: 'NaN' };
        const a = Math.abs(v);
        if (a > peak) peak = a;
        ws += v * v;
        wn++;
      }
    }
    sum += ws;
    n += wn;
    if (wn) loud = Math.max(loud, Math.sqrt(ws / wn));
  }
  const rms = Math.sqrt(sum / n);
  const db = (x) => Math.round(20 * Math.log10(Math.max(x, 1e-9)) * 10) / 10;
  return { name, peak: +peak.toFixed(3), peakDb: db(peak), loudDb: db(loud), rmsDb: db(rms) };
}

// ---------- Automatisches Entsperren & Pausieren ----------
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  const onGesture = () => {
    if (document.hidden) return;
    if (!liveG) { unlockAudio(); return; }
    const st = liveG.ctx.state;
    // auch iOS-Zustand „interrupted“ (z. B. nach Anruf) beim nächsten Touch beheben
    if (st !== 'running' && st !== 'closed') { userSuspended = false; unlockAudio(); }
  };
  for (const ev of ['touchend', 'pointerup', 'pointerdown', 'mousedown', 'keydown', 'click']) {
    document.addEventListener(ev, onGesture, { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', () => suspendAudio(document.hidden));
  window.addEventListener('pagehide', () => suspendAudio(true));
  window.addEventListener('pageshow', () => { if (!document.hidden) suspendAudio(false); });
}
