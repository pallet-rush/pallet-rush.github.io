import { LEVEL_PLAN } from '../js/data/levelplan.js';
import { findLevel, replaySolution } from '../js/core/generator.js';
import { playoutRate } from '../js/core/solver.js';
import { validateLevel } from '../js/core/model.js';

const $ = (s) => document.querySelector(s);
const tbody = $('#tbl tbody');
const log = (m) => { $('#log').textContent += m + '\n'; };
// Pause ohne Timer-Drosselung (läuft auch im Hintergrund-Tab weiter)
const pause = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
let levels = [];

function mechs(lv) {
  const m = [];
  if (lv.trucks.some((t) => t.h)) m.push('Plane');
  if (lv.gates) m.push('Tor');
  if (lv.barriers) m.push('Schranke');
  if (lv.trucks.some((t) => t.r)) m.push('Eil');
  if (lv.trucks.some((t) => t.s === 'T')) m.push('Anh.');
  if (lv.trucks.some((t) => t.k !== undefined)) m.push('Kette');
  if (/[a-h]/.test(lv.supply)) m.push('Karton');
  if (lv.trucks.some((t) => t.tt)) m.push('Dreh');
  return m.join(' ');
}

function row(i, lv, seed, fair, rate, nodes, ok, note = '') {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${i + 1}</td><td>${lv ? lv.trucks.length : '-'}</td><td>${lv ? lv.supply.length : '-'}</td><td>${seed ?? '-'}</td>`
    + `<td>${fair ?? '-'}</td><td>${rate ?? '-'}</td><td>${nodes ?? '-'}</td><td>${lv ? mechs(lv) : ''}</td>`
    + `<td class="${ok ? 'ok' : 'bad'}">${ok ? 'OK' : 'FEHLER'} ${note}</td>`;
  tbody.appendChild(tr);
}

async function loadExisting() {
  try {
    const m = await import('../js/data/levels.js?t=' + Date.now());
    return m.LEVELS.slice();
  } catch {
    return [];
  }
}

// Erzeugt Level from..to (1-basiert) neu und ersetzt sie im Bestand.
async function generate(from = 1, to = LEVEL_PLAN.length) {
  tbody.innerHTML = '';
  $('#log').textContent = '';
  levels = await loadExisting();
  window.genStatus = 'running';
  window.genFailed = [];
  for (let i = from - 1; i < to; i++) {
    await pause();
    const p = LEVEL_PLAN[i];
    const t0 = performance.now();
    const res = findLevel(p, (i + 1) * 1000);
    const ms = Math.round(performance.now() - t0);
    window.genProgress = `${i + 1}/${to}`;
    if (!res) {
      row(i, null, null, null, null, null, false, `kein Seed (${ms} ms)`);
      window.genFailed.push(i + 1);
      continue;
    }
    levels[i] = { id: i + 1, ...res.level };
    (window.genStats ||= {})[i + 1] = { ...res.stats, n: res.level.trucks.length, ms };
    row(i, levels[i], res.seed, levels[i].w + '×' + levels[i].h + ' ' + (p.shape || '') + ' ' + (p.angle || 0) + '°', res.stats.rate, res.stats.moves, true, `${ms} ms`);
  }
  const failed = window.genFailed.length;
  log(failed ? `Fehlgeschlagen: ${window.genFailed.join(', ')}` : 'Alle OK.');
  window.genStatus = failed ? 'failed' : 'done';
  $('#save').disabled = false;
}

async function save() {
  const out = levels.filter(Boolean);
  if (out.length !== levels.length) { log('Lücken im Bestand, nicht gespeichert.'); return; }
  const lines = out.map((l) => '  ' + JSON.stringify(l));
  const body = '// AUTOMATISCH ERZEUGT von tools/levelgen.html – nicht von Hand bearbeiten.\n'
    + '// Jedes Level enthält eine nachgespielte Lösung (sol), lösbar ohne Boni.\n'
    + 'export const LEVELS = [\n' + lines.join(',\n') + '\n];\n';
  const r = await fetch('/__save?file=levels.js', { method: 'POST', body });
  log(r.ok ? `Gespeichert: ${out.length} Level` : 'Speichern fehlgeschlagen: ' + r.status);
  window.saveStatus = r.ok ? 'saved' : 'error';
}

async function check() {
  tbody.innerHTML = '';
  $('#log').textContent = '';
  const LEVELS = await loadExisting();
  let bad = [];
  window.checkStatus = 'running';
  for (let i = 0; i < LEVELS.length; i++) {
    await pause();
    const lv = LEVELS[i];
    const errs = validateLevel(lv);
    const solved = replaySolution(lv);
    const rate = playoutRate(lv, 100, 7).toFixed(2);
    const ok = !errs.length && solved;
    if (!ok) bad.push(i + 1);
    row(i, lv, '-', lv.w + '×' + lv.h + ' ' + (lv.angle || 0) + '°', rate, lv.sol ? lv.sol.length : '-', ok, errs.join('; ') + (solved ? '' : ' Lösung geht nicht auf'));
    window.checkProgress = `${i + 1}/${LEVELS.length}`;
  }
  log(bad.length ? `NICHT ok: ${bad.join(', ')}` : `Alle ${LEVELS.length} Level lösbar.`);
  window.checkStatus = bad.length ? 'failed' : 'done';
  window.checkBad = bad;
}

$('#gen').onclick = () => generate(+$('#from').value, +$('#to').value);
$('#save').onclick = save;
$('#check').onclick = check;
window.lg = { generate, save, check };
