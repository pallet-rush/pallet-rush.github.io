// Stau-Dauertest (ab v0.7.6): spielt Level im Zeitraffer (Referenzlösung mit zufälligem Tipp-Tempo,
// oder policy: 'rand' = zufällige Züge)
// und meldet, wenn LKWs auf der Straße dauerhaft stehen bleiben.
// Aufruf in der Browser-Konsole auf einer Seite des Spiels:
//   const t = await import('/tools/traffictest.js'); await t.run({ from: 1, to: 300, w: 390, h: 844 })
// Ergebnis: window.trafficResult = { done, stalls: [{ level, seed, t, trucks }] }
import { GameView } from '../js/render/view.js';
import { Game } from '../js/core/model.js';
import { LEVELS } from '../js/data/levels.js';
import { makeRng } from '../js/core/rng.js';

export async function run({ from = 1, to = LEVELS.length, w = 390, h = 844, seeds = 1, maxSim = 400000, stallMs = 15000, levels = null, policy = 'sol' } = {}) {
  const realNow = performance.now.bind(performance);
  let clock = realNow();
  performance.now = () => clock;
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = () => 0;
  const cv = document.createElement('canvas');
  cv.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;visibility:hidden;pointer-events:none;z-index:-1`;
  document.body.appendChild(cv);
  const st = { end: null };
  const view = new GameView(cv, { onWon: () => { st.end = 'won'; }, onLost: () => { st.end = 'lost'; } });
  window.requestAnimationFrame = raf;
  view.quiet = true;
  // Zeichnen überspringen; nur drawQueue läuft (Paletten-Nachrücken passiert dort),
  // mit einem Platzhalter-Kontext, der alles schluckt.
  const noop = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : noop), apply: () => noop, set: () => true });
  view.draw = (now) => { const g = view.game; if (g) view.drawQueue(noop, now, g); };
  view.setInsets(h > w ? 70 : 56, h > w ? 90 : 4, h > w ? 0 : 4, h > w ? 0 : 74);
  const out = { done: 0, stalls: [], won: 0, lost: 0, timeouts: 0, taps: 0, frames: 0 };
  window.trafficResult = out;
  const list = levels || Array.from({ length: to - from + 1 }, (_, i) => from + i);
  try {
    for (const n of list) {
      for (let sd = 1; sd <= seeds; sd++) {
        const rng = makeRng(n * 977 + sd).next;
        const g = new Game(LEVELS[n - 1]);
        st.end = null;
        view.setGame(g);
        let t = 0, nextTap = 300, still = 0, solI = 0;
        const pos = new Map();
        let stalled = false;
        while (t < maxSim && !st.end) {
          clock += 16; t += 16;
          view.frame(clock);
          out.frames++;
          // Ende: Logik fertig und alle Animationen durch (Hooks kämen erst per setTimeout)
          if (g.status !== 'playing' && view.isIdle()) { st.end = g.status; break; }
          if (g.status === 'playing' && t >= nextTap && view.canDispatch()) {
            // Konvoi braucht zwei sichtbar freie Buchten (wie im Spiel, ab v0.8.0)
            const fits = (tr) => view.canDispatch(g.partner(tr) ? 2 : 1);
            // 'sol': Referenzlösung der Reihe nach (Level wird gewonnen, voller Verkehr);
            // 'rand': zufällige erlaubte Züge
            let cand;
            if (policy === 'sol') {
              const id = g.level.sol[solI];
              cand = id != null && g.canExit(g.trucks[id]) && fits(g.trucks[id]) ? [g.trucks[id]] : [];
            } else cand = g.trucks.filter((tr) => tr.state === 0 && g.canExit(tr) && fits(tr));
            if (cand.length) {
              if (policy === 'sol') solI++;
              const tr = cand[Math.floor(rng() * cand.length)];
              const res = g.tap(tr.id);
              if (res.ok) { view.play(res.events); out.taps++; }
            }
            nextTap = t + 60 + Math.floor(rng() * (sd % 2 ? 500 : 1600));
          }
          // Stillstand: bewegliche LKWs (Fahrt/Abfahrt), keiner bewegt sich
          const movers = view.tvs.filter((v) => v.state === 'drive' || v.state === 'leave');
          let moved = false;
          for (const v of movers) {
            const p = pos.get(v);
            if (!p || Math.abs(p.x - v.x) > 0.01 || Math.abs(p.y - v.y) > 0.01) moved = true;
            pos.set(v, { x: v.x, y: v.y });
          }
          if (movers.length && !moved) still += 16; else still = 0;
          if (still > stallMs) {
            stalled = true;
            out.stalls.push({ level: n, seed: sd, t, trucks: movers.map((v) => ({ id: v.id, st: v.state, ph: v.phase, bay: v.bay, x: Math.round(v.x), y: Math.round(v.y), s: Math.round(v.s), lim: Math.round(v.limit), len: Math.round(v.path?.length || 0), order: v.order, occ: view.bayOcc.map((o) => (o ? o.id : -1)).join(',') })),
              docks: view.tvs.filter((v) => v.state === 'dock').map((v) => ({ id: v.id, bay: v.bay, full: !!v.fullAt, pend: !!v.pendingDepart })), ramps: g.ramps.join(',') });
            break;
          }
        }
        if (st.end === 'won') out.won++; else if (st.end === 'lost') out.lost++; else if (!stalled) out.timeouts++;
      }
      out.done++;
      window.trafficProgress = `${out.done}/${list.length}`;
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    performance.now = realNow;
    view.setGame(null);
    cv.remove();
  }
  out.finished = true;
  return out;
}
