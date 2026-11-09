// Sound, Musik und Vibration. Alles per Web Audio erzeugt, keine Audiodateien.

let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
const state = { sound: true, music: true, vibration: true };
let lastPallet = 0;
let musicTimer = null;
let musicStep = 0;
let nextNoteTime = 0;

export function configureAudio(settings) {
  state.sound = settings.sound;
  state.vibration = settings.vibration;
  const wantMusic = settings.music;
  if (wantMusic !== state.music) {
    state.music = wantMusic;
    if (wantMusic) startMusic();
    else stopMusic();
  }
}

// Muss nach der ersten Berührung aufgerufen werden (iOS/Android-Regel).
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.55;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.16;
    musicBus.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  if (state.music) startMusic();
}

export function suspendAudio(s) {
  if (!ctx) return;
  if (s) ctx.suspend();
  else ctx.resume();
}

function tone({ type = 'sine', f = 440, f2 = null, t = 0, dur = 0.15, vol = 0.5, attack = 0.005, bus = sfxBus, filter = null }) {
  if (!ctx) return;
  const now = ctx.currentTime + t;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, now);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, now + dur);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  let node = o;
  if (filter) {
    const fl = ctx.createBiquadFilter();
    fl.type = filter.type || 'lowpass';
    fl.frequency.value = filter.f;
    fl.Q.value = filter.q || 1;
    o.connect(fl);
    node = fl;
  }
  node.connect(g);
  g.connect(bus);
  o.start(now);
  o.stop(now + dur + 0.05);
}

function noise({ t = 0, dur = 0.05, vol = 0.4, f = 1000, q = 2, type = 'bandpass' }) {
  if (!ctx) return;
  const now = ctx.currentTime + t;
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = f;
  fl.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(fl);
  fl.connect(g);
  g.connect(sfxBus);
  src.start(now);
}

export const sfx = {
  tap() {
    if (!state.sound) return;
    tone({ type: 'triangle', f: 520, f2: 380, dur: 0.07, vol: 0.25 });
  },
  start() {
    if (!state.sound) return;
    // Motor anlassen: kurzes tiefes Brummen
    tone({ type: 'sawtooth', f: 70, f2: 110, dur: 0.35, vol: 0.18, filter: { f: 400 } });
  },
  blocked() {
    if (!state.sound) return;
    tone({ type: 'sine', f: 160, f2: 90, dur: 0.14, vol: 0.45 });
  },
  noRamp() {
    if (!state.sound) return;
    tone({ type: 'triangle', f: 330, dur: 0.1, vol: 0.25 });
    tone({ type: 'triangle', f: 262, t: 0.11, dur: 0.14, vol: 0.25 });
  },
  pallet(fill = 0) {
    if (!state.sound || !ctx) return;
    const now = performance.now();
    if (now - lastPallet < 35) return;
    lastPallet = now;
    noise({ dur: 0.045, vol: 0.5, f: 700 + fill * 600, q: 4 });
    tone({ type: 'sine', f: 220 + fill * 160, dur: 0.06, vol: 0.12 });
  },
  full() {
    if (!state.sound) return;
    [523, 659, 784].forEach((f, i) => tone({ type: 'triangle', f, t: i * 0.07, dur: 0.22, vol: 0.22 }));
  },
  horn() {
    if (!state.sound) return;
    tone({ type: 'sawtooth', f: 311, dur: 0.22, vol: 0.12, filter: { f: 1400 } });
    tone({ type: 'sawtooth', f: 392, dur: 0.22, vol: 0.12, filter: { f: 1400 } });
  },
  depart() {
    if (!state.sound) return;
    tone({ type: 'sawtooth', f: 60, f2: 140, dur: 0.9, vol: 0.16, filter: { f: 500 } });
  },
  warn() {
    if (!state.sound) return;
    tone({ type: 'sine', f: 880, dur: 0.12, vol: 0.18 });
    tone({ type: 'sine', f: 880, t: 0.18, dur: 0.12, vol: 0.18 });
  },
  win() {
    if (!state.sound) return;
    [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f, t: i * 0.11, dur: 0.35, vol: 0.25 }));
    tone({ type: 'sine', f: 1568, t: 0.5, dur: 0.6, vol: 0.12 });
  },
  lose() {
    if (!state.sound) return;
    [392, 330, 262].forEach((f, i) => tone({ type: 'triangle', f, t: i * 0.16, dur: 0.3, vol: 0.22 }));
  },
  coin() {
    if (!state.sound) return;
    tone({ type: 'square', f: 988, dur: 0.07, vol: 0.08 });
    tone({ type: 'square', f: 1319, t: 0.07, dur: 0.18, vol: 0.08 });
  },
};

export function vibrate(ms) {
  if (state.vibration && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch { /* ignorieren */ }
  }
}

// ---------- Musik: ruhige, generative Schleife (C-Dur pentatonisch) ----------
const BPM = 88;
const STEP = 60 / BPM / 2; // Achtelnoten
const CHORDS = [
  [261.63, 329.63, 392.0],   // C
  [220.0, 261.63, 329.63],   // Am
  [174.61, 220.0, 261.63],   // F
  [196.0, 246.94, 293.66],   // G
];
const MELODY = [0, 2, 4, 7, 9, 7, 4, 2];
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0];

function scheduleMusic() {
  if (!ctx) return;
  while (nextNoteTime < ctx.currentTime + 0.3) {
    const bar = Math.floor(musicStep / 16) % CHORDS.length;
    const s = musicStep % 16;
    const tOff = nextNoteTime - ctx.currentTime;
    const chord = CHORDS[bar];
    if (s === 0) {
      chord.forEach((f) => tone({ type: 'sine', f: f / 2, t: tOff, dur: STEP * 15, vol: 0.18, attack: 0.4, bus: musicBus }));
      tone({ type: 'triangle', f: chord[0] / 4, t: tOff, dur: STEP * 6, vol: 0.35, attack: 0.02, bus: musicBus });
    }
    if (s === 8) tone({ type: 'triangle', f: chord[0] / 4 * 1.5, t: tOff, dur: STEP * 6, vol: 0.28, attack: 0.02, bus: musicBus });
    if (s % 2 === 0 && ((musicStep * 7919) % 5) < 3) {
      const idx = (MELODY[(musicStep / 2) % MELODY.length] + bar) % PENTA.length;
      tone({ type: 'triangle', f: PENTA[idx], t: tOff, dur: STEP * 1.6, vol: 0.13, attack: 0.01, bus: musicBus });
    }
    if (s % 4 === 2) {
      // leiser Shaker
      if (ctx) {
        const now = nextNoteTime;
        const len = Math.ceil(ctx.sampleRate * 0.04);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const fl = ctx.createBiquadFilter();
        fl.type = 'highpass';
        fl.frequency.value = 6000;
        const g = ctx.createGain();
        g.gain.value = 0.25;
        src.connect(fl); fl.connect(g); g.connect(musicBus);
        src.start(now);
      }
    }
    nextNoteTime += STEP;
    musicStep++;
  }
}

function startMusic() {
  if (!ctx || musicTimer || !state.music) return;
  nextNoteTime = ctx.currentTime + 0.1;
  musicTimer = setInterval(scheduleMusic, 100);
}

function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}
