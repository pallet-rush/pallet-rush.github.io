// Einstieg: verbindet Spielstand, Menüs, Spiellogik und Darstellung.

import { VERSION } from './version.js';
import { LEVELS } from './data/levels.js';
import { Game } from './core/model.js';
import { GameView } from './render/view.js';
import { loadSave, writeSave } from './save.js';
import { t, setLang, detectLang, applyTexts, getLang } from './i18n.js';
import { sfx, vibrate, unlockAudio, configureAudio, suspendAudio } from './audio.js';

// Bonus-Items: Freischalt-Level und Münzpreis (siehe DESIGN.md).
export const BOOSTERS = [
  { key: 'ramp', unlock: 10, price: 250 },
  { key: 'shuffle', unlock: 20, price: 200 },
  { key: 'crane', unlock: 30, price: 300 },
  { key: 'forklift', unlock: 40, price: 400 },
];
// Erstes Level jeder neuen Mechanik
const MECH_INTRO = { 11: 'hidden', 21: 'gate', 31: 'barrier', 41: 'rush', 51: 'trailer', 61: 'chain', 71: 'covered', 81: 'turntable', 91: 'master' };
const REWARD = { win: 50, firstTry: 25, replay: 10 };
const DEV = new URLSearchParams(location.search).has('dev');

const $ = (s) => document.querySelector(s);

let save = loadSave();
setLang(save.settings.lang || detectLang());
configureAudio(save.settings);

const view = new GameView($('#game'), {
  onTap: handleTap,
  onDockTap: handleDockTap,
  onWon: handleWon,
  onLost: handleLost,
  onRampsChanged: updateWarn,
});

let game = null;
let levelNo = 1;
let hintShown = false;
let warnOn = false;
let pending = false; // Bonus wartet auf Ende der Animationen
let selecting = null; // 'crane' | 'forklift'

// ---------- Menü ----------
function showMenu() {
  game = null;
  view.setGame(null);
  $('#menu').classList.remove('hidden');
  $('#hud').classList.add('hidden');
  $('#boosters').classList.add('hidden');
  $('#warn').classList.add('hidden');
  hideToast();
  hideModal();
  refreshMenu();
}

function refreshMenu() {
  applyTexts();
  $('#menu-coins').textContent = save.coins;
  $('#play-level').textContent = `${t('level')} ${Math.min(save.level, LEVELS.length)}`;
  $('#version').textContent = 'v' + VERSION;
}

// ---------- Level ----------
function startLevel(n) {
  hideModal();
  hideToast();
  if (n > LEVELS.length) {
    showDialog({ title: '🎉', text: t('allDone'), actions: [{ label: t('menu'), cls: 'primary', fn: showMenu }] });
    return;
  }
  levelNo = n;
  game = new Game(LEVELS[n - 1]);
  pending = false;
  setSelecting(null);
  $('#menu').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  $('#boosters').classList.remove('hidden');
  $('#hud-level').textContent = `${t('level')} ${n}`;
  updateCoins();
  refreshBoosters();
  measureInsets();
  view.setGame(game, { symbols: save.settings.symbols });
  warnOn = false;
  $('#warn').classList.add('hidden');
  save.stats.played++;
  writeSave(save);
  hintShown = false;
  showIntros(n);
}

// Erklärfenster: neue Mechanik, neuer Bonus (jeweils nur einmal).
function showIntros(n) {
  const queue = [];
  const mech = MECH_INTRO[n];
  if (mech && !save.seenTips['m_' + mech]) queue.push({ key: 'm_' + mech, title: t('newMech'), text: t('mech_' + mech) });
  for (const b of BOOSTERS) {
    if (b.unlock === n && !save.seenTips['b_' + b.key]) {
      queue.push({ key: 'b_' + b.key, title: t('boosterNew'), text: `${t('bdesc_' + b.key)}`, extra: `<div class="reward">${t('booster_' + b.key)} <small>${t('boosterFree')}</small></div>` });
    }
  }
  const next = () => {
    const tip = queue.shift();
    if (!tip) {
      hideModal();
      if (n === 1) { hintShown = true; toast(t('tutorial1'), 4000); }
      return;
    }
    save.seenTips[tip.key] = true;
    writeSave(save);
    showDialog({ title: tip.title, text: tip.text, html: tip.extra || '', actions: [{ label: t('gotIt'), cls: 'primary', fn: next }] });
  };
  next();
}

function measureInsets() {
  const hud = $('#hud').getBoundingClientRect();
  const b = $('#boosters').getBoundingClientRect();
  view.setInsets(hud.bottom, window.innerHeight - b.top);
}

function updateCoins() {
  $('#hud-coins').textContent = save.coins;
  $('#menu-coins').textContent = save.coins;
}

function canAct() {
  return game && game.status === 'playing' && $('#modal').classList.contains('hidden') && !pending;
}

function handleTap(id) {
  if (!canAct()) return;
  unlockAudio();
  if (selecting === 'crane') {
    useCrane(id);
    return;
  }
  const res = game.tap(id);
  if (res.ok) {
    if (hintShown) { hideToast(); hintShown = false; }
    sfx.tap();
    view.play(res.events);
    updateWarn();
    refreshBoosters();
    return;
  }
  if (res.reason === 'blocked') {
    view.nudge(id, res.blocker);
    sfx.blocked();
    vibrate(15);
  } else if (res.reason === 'locked') {
    view.nudge(id, res.key);
    sfx.blocked();
    toast(t('locked2'));
  } else if (res.reason === 'noRamp') {
    view.nudge(id, -1);
    sfx.noRamp();
    toast(t('noRamp'));
  }
}

function handleDockTap(r) {
  if (!canAct() || selecting !== 'forklift') return;
  useForklift(r);
}

function updateWarn() {
  if (!game) return;
  const on = game.status === 'playing' && game.freeRampCount() === 1 && game.lotCount() > 0;
  const el = $('#warn');
  if (on && !warnOn) {
    const [x, y] = view.warnAnchor();
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.textContent = t('oneRamp');
    el.classList.remove('hidden', 'pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
    sfx.warn();
  } else if (!on && warnOn) {
    el.classList.add('hidden');
  }
  warnOn = on;
}

function levelRecord(n) {
  if (!save.levels[n]) save.levels[n] = { won: false, fails: 0 };
  return save.levels[n];
}

function handleWon() {
  if (!game) return;
  setSelecting(null);
  const rec = levelRecord(levelNo);
  const firstWin = !rec.won;
  const firstTry = firstWin && rec.fails === 0;
  const reward = firstWin ? REWARD.win + (firstTry ? REWARD.firstTry : 0) : REWARD.replay;
  rec.won = true;
  if (!rec.best || game.moves < rec.best) rec.best = game.moves;
  save.coins += reward;
  save.stats.won++;
  if (levelNo >= save.level) save.level = levelNo + 1;
  save.maxLevel = Math.max(save.maxLevel, levelNo + 1);
  unlockBoosters();
  writeSave(save);
  $('#warn').classList.add('hidden');
  sfx.win();
  setTimeout(() => sfx.coin(), 500);
  updateCoins();
  showDialog({
    title: t('won'),
    html: `<p>${t('wonText')}</p><div class="reward"><span class="coin"></span>+${reward}${firstTry ? ` <small>${t('firstTry')}</small>` : ''}</div>`,
    actions: [
      { label: t('next'), cls: 'primary', fn: () => startLevel(levelNo + 1) },
      { label: t('menu'), fn: showMenu },
    ],
  });
}

function handleLost(reason) {
  if (!game) return;
  setSelecting(null);
  levelRecord(levelNo).fails++;
  save.stats.lost++;
  writeSave(save);
  $('#warn').classList.add('hidden');
  sfx.lose();
  vibrate(60);
  const text = reason === 'rush' ? t('lostRush') : reason === 'stuck' ? t('lostStuck') : t('lostText');
  showDialog({
    title: reason === 'rush' ? t('lostRushTitle') : t('lost'),
    text,
    actions: [
      { label: t('retry'), cls: 'primary', fn: () => startLevel(levelNo) },
      { label: t('menu'), fn: showMenu },
    ],
  });
}

function restartLevel() {
  if (game && game.moves > 0 && game.status === 'playing') {
    levelRecord(levelNo).fails++;
    writeSave(save);
  }
  startLevel(levelNo);
}

// ---------- Boni ----------
function unlockBoosters() {
  for (const b of BOOSTERS) {
    const st = save.boosters[b.key];
    if (!st.unlocked && save.maxLevel >= b.unlock) {
      st.unlocked = true;
      st.count += 3;
    }
  }
}

function boosterAvailable(def) {
  return save.boosters[def.key].unlocked || DEV || levelNo >= def.unlock;
}

function refreshBoosters() {
  document.querySelectorAll('.booster').forEach((el) => {
    const def = BOOSTERS.find((b) => b.key === el.dataset.b);
    const st = save.boosters[def.key];
    const unlocked = boosterAvailable(def);
    const cnt = el.querySelector('.b-count');
    el.classList.toggle('locked', !unlocked);
    el.classList.toggle('active', selecting === def.key);
    el.classList.toggle('used', def.key === 'ramp' && !!game?.extraUsed);
    cnt.classList.toggle('price', unlocked && st.count === 0);
    if (!unlocked) cnt.textContent = `Lv ${def.unlock}`;
    else if (st.count > 0) cnt.textContent = st.count;
    else cnt.innerHTML = `<span class="coin small"></span>${def.price}`;
    el.onclick = () => onBooster(def);
  });
}

function onBooster(def) {
  unlockAudio();
  if (!boosterAvailable(def)) {
    toast(`${t('booster_' + def.key)}: ${t('locked')} ${def.unlock}`);
    return;
  }
  if (!game || game.status !== 'playing' || pending) return;
  // Auswahl abbrechen
  if (selecting === def.key) { setSelecting(null); return; }
  // Vorbedingungen prüfen, bevor etwas bezahlt wird
  if (def.key === 'ramp' && game.extraUsed) { toast(t('onlyOnce')); return; }
  if (def.key === 'crane' && game.freeRampCount() === 0) { toast(t('noRamp')); return; }
  if (def.key === 'forklift' && !game.ramps.some((id) => id >= 0)) { toast(t('noDocked')); return; }
  const st = save.boosters[def.key];
  if (st.count > 0) { activate(def); return; }
  if (save.coins < def.price) { toast(`${t('notEnough')} (${def.price})`); sfx.noRamp(); return; }
  showDialog({
    title: t('booster_' + def.key),
    text: t('bdesc_' + def.key),
    html: `<div class="reward"><span class="coin"></span>${def.price}</div>`,
    actions: [
      { label: t('buy'), cls: 'primary', fn: () => { save.coins -= def.price; st.count++; writeSave(save); updateCoins(); sfx.coin(); hideModal(); activate(def); } },
      { label: t('cancel'), fn: hideModal },
    ],
  });
}

function activate(def) {
  if (def.key === 'crane') { setSelecting('crane'); toast(t('pickTruck'), 2500); return; }
  if (def.key === 'forklift') {
    const docked = game.ramps.map((id, r) => (id >= 0 ? r : -1)).filter((r) => r >= 0);
    if (docked.length === 1) { useForklift(docked[0]); return; }
    setSelecting('forklift');
    toast(t('pickDock'), 2500);
    return;
  }
  runWhenIdle(() => {
    const ev = def.key === 'ramp' ? game.useExtraRamp() : game.useShuffle(levelNo);
    if (ev) consume(def.key, ev);
  });
}

function useCrane(id) {
  setSelecting(null);
  runWhenIdle(() => {
    const ev = game.useCrane(id);
    if (ev) consume('crane', ev);
  });
}

function useForklift(r) {
  setSelecting(null);
  runWhenIdle(() => {
    const ev = game.useForklift(r);
    if (ev) consume('forklift', ev);
  });
}

// Bonus erst ausführen, wenn alle Animationen fertig sind (Anzeige = Logik).
function runWhenIdle(fn) {
  pending = true;
  view.whenIdle(() => {
    pending = false;
    if (game && game.status === 'playing') fn();
  });
}

function consume(key, ev) {
  save.boosters[key].count = Math.max(0, save.boosters[key].count - 1);
  save.stats.boostersUsed++;
  writeSave(save);
  sfx.full();
  vibrate(20);
  view.play(ev);
  if (key === 'ramp') measureInsets();
  updateWarn();
  refreshBoosters();
}

function setSelecting(mode) {
  selecting = mode;
  view.select = mode === 'crane' ? 'truck' : mode === 'forklift' ? 'dock' : null;
  if (!mode) hideToast();
  refreshBoosters();
}

// ---------- Dialoge ----------
function showDialog({ title, text, html, actions = [] }) {
  const p = $('#modal-panel');
  p.innerHTML = `<h2>${title}</h2>${text ? `<p>${text}</p>` : ''}${html || ''}<div class="actions"></div>`;
  const box = p.querySelector('.actions');
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.cls || '');
    b.textContent = a.label;
    b.onclick = () => { sfx.tap(); a.fn(); };
    box.appendChild(b);
  }
  $('#modal').classList.remove('hidden');
}

function hideModal() {
  $('#modal').classList.add('hidden');
}

let toastTimer = null;
function toast(msg, ms = 1400) {
  const el = $('#toast');
  el.textContent = msg;
  const long = msg.length > 40;
  el.style.whiteSpace = long ? 'normal' : 'nowrap';
  el.style.width = long ? 'min(320px, 90vw)' : '';
  el.style.textAlign = 'center';
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms);
}
function hideToast() {
  $('#toast').classList.add('hidden');
}

function showPause() {
  setSelecting(null);
  showDialog({
    title: t('pause'),
    actions: [
      { label: t('resume'), cls: 'primary', fn: hideModal },
      { label: t('restart'), fn: restartLevel },
      { label: t('settings'), fn: () => showSettings(showPause) },
      { label: t('menu'), fn: showMenu },
    ],
  });
}

function showSettings(back) {
  const s = save.settings;
  const row = (key, label, note = '') => `<div class="setting"><span>${label} ${note ? `<small>${note}</small>` : ''}</span><button class="switch ${s[key] ? 'on' : ''}" data-key="${key}"></button></div>`;
  const lang = getLang();
  showDialog({
    title: t('settings'),
    html: row('sound', t('sound')) + row('music', t('music')) + row('vibration', t('vibration'), t('vibrationNote')) + row('symbols', t('symbols'))
      + `<div class="setting"><span>${t('language')}</span><div class="seg"><button data-lang="de" class="${lang === 'de' ? 'on' : ''}">DE</button><button data-lang="en" class="${lang === 'en' ? 'on' : ''}">EN</button></div></div>`,
    actions: [{ label: t('back'), cls: 'primary', fn: () => (back ? back() : hideModal()) }],
  });
  const p = $('#modal-panel');
  p.querySelectorAll('.switch').forEach((sw) => {
    sw.onclick = () => {
      unlockAudio();
      const k = sw.dataset.key;
      s[k] = !s[k];
      sw.classList.toggle('on', s[k]);
      writeSave(save);
      configureAudio(s);
      if (k === 'symbols') view.symbols = s.symbols;
      sfx.tap();
    };
  });
  p.querySelectorAll('[data-lang]').forEach((b) => {
    b.onclick = () => {
      s.lang = b.dataset.lang;
      setLang(s.lang);
      writeSave(save);
      applyTexts();
      if (game) $('#hud-level').textContent = `${t('level')} ${levelNo}`;
      refreshMenu();
      showSettings(back);
    };
  });
}

function showLevels() {
  let html = '';
  for (let w = 0; w * 10 < LEVELS.length; w++) {
    html += `<div class="world-title">${t('world')} ${w + 1}</div><div class="level-grid">`;
    for (let i = w * 10 + 1; i <= Math.min(LEVELS.length, w * 10 + 10); i++) {
      const rec = save.levels[i];
      const open = DEV || i <= save.maxLevel;
      const cls = rec?.won ? 'won' : i === save.level ? 'current' : '';
      html += `<button data-l="${i}" class="${cls}" ${open ? '' : 'disabled'}>${i}</button>`;
    }
    html += '</div>';
  }
  showDialog({ title: t('levels'), html, actions: [{ label: t('back'), fn: hideModal }] });
  $('#modal-panel').querySelectorAll('[data-l]').forEach((b) => {
    b.onclick = () => { unlockAudio(); goFullscreen(); startLevel(+b.dataset.l); };
  });
  const cur = $('#modal-panel').querySelector('.current');
  if (cur) cur.scrollIntoView({ block: 'center' });
}

function goFullscreen() {
  const el = document.documentElement;
  if (matchMedia('(pointer: coarse)').matches && el.requestFullscreen && !document.fullscreenElement) {
    el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }
}

// ---------- Verkabelung ----------
$('#btn-play').onclick = () => { unlockAudio(); goFullscreen(); sfx.tap(); startLevel(Math.min(save.level, LEVELS.length)); };
$('#btn-levels').onclick = () => { unlockAudio(); sfx.tap(); showLevels(); };
$('#btn-settings').onclick = () => { unlockAudio(); sfx.tap(); showSettings(); };
$('#btn-pause').onclick = () => { sfx.tap(); showPause(); };
$('#btn-restart').onclick = () => { sfx.tap(); restartLevel(); };
$('#modal').addEventListener('pointerdown', (e) => e.stopPropagation());

document.addEventListener('visibilitychange', () => suspendAudio(document.hidden));
window.addEventListener('resize', () => { if (game) measureInsets(); });

unlockBoosters();
writeSave(save);
showMenu();

// Für Tests in der Konsole
window.__pr = { get game() { return game; }, view, startLevel, get save() { return save; }, onBooster: (k) => onBooster(BOOSTERS.find((b) => b.key === k)) };
