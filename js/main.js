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
// Schwierigkeit: folgt dem Levelplan (js/data/levelplan.js): Das 10. Level jeder Welt
// ist ein Boss-Level (am wenigsten Spielraum), das 6. ist knackig. Schwere Level geben mehr Münzen.
const DIFF_MULT = { normal: 1, hard: 1.5, vhard: 2 };
export function difficulty(n) {
  if (n >= 20 && n % 10 === 0) return 'vhard';
  if (n === 10 || (n > 10 && n % 10 === 6)) return 'hard';
  return 'normal';
}
const diffBadge = (d) => (d === 'normal' ? '' : `<span class="diff-badge ${d}">${t(d)}</span>`);
const DEV = new URLSearchParams(location.search).has('dev');

const $ = (s) => document.querySelector(s);

// iOS-Homescreen-App: Fensterhöhe ist dort teils um die Statusleiste zu klein.
// Die Lücke zum echten Bildschirm messen und per CSS-Variable ausgleichen.
let vgap = 0;
function fixViewportGap() {
  const standalone = navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const portrait = window.innerHeight >= window.innerWidth;
  const gap = standalone && ios && portrait ? Math.max(screen.height, screen.width) - window.innerHeight : 0;
  vgap = gap > 0 && gap < 100 ? gap : 0;
  document.documentElement.style.setProperty('--vgap', vgap + 'px');
}
fixViewportGap();
window.addEventListener('resize', fixViewportGap);
window.addEventListener('orientationchange', () => setTimeout(fixViewportGap, 300));

let save = loadSave();
setLang(save.settings.lang || detectLang());
configureAudio(save.settings);

const view = new GameView($('#game'), {
  onTap: handleTap,
  onDockTap: handleDockTap,
  onWon: handleWon,
  onLost: handleLost,
  onRampsChanged: updateWarn,
  onDepart: () => { updateProgress(); updateGuide(); },
});

let game = null;
let levelNo = 1;
let hintShown = false;
let warnOn = false;
let pending = false; // Bonus wartet auf Ende der Animationen
let selecting = null; // 'crane' | 'forklift'
let attempt = 1;      // Versuch im aktuellen Level (für Sterne)
let usedBoosters = 0; // eingesetzte Boni im aktuellen Versuch (für Sterne)

// ---------- Menü ----------
function showMenu() {
  if (game) fadeScreen();
  game = null;
  hideBanner();
  view.setInsets(0, 0);
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
  if (!game) fadeScreen();
  attempt = n === levelNo && game && game.status !== 'won' ? attempt + 1 : 1;
  usedBoosters = 0;
  levelNo = n;
  game = new Game(LEVELS[n - 1]);
  pending = false;
  setSelecting(null);
  $('#menu').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  $('#boosters').classList.remove('hidden');
  setHudLevel();
  updateCoins();
  refreshBoosters();
  measureInsets();
  view.setGame(game, { symbols: save.settings.symbols });
  updateGuide();
  warnOn = false;
  $('#warn').classList.add('hidden');
  save.stats.played++;
  writeSave(save);
  hintShown = false;
  updateProgress();
  showIntros(n);
}

function setHudLevel() {
  const d = difficulty(levelNo);
  const el = $('#hud-level');
  el.className = 'hud-level ' + d;
  el.innerHTML = `${d === 'normal' ? '' : `<span class="lv-diff ${d}"></span>`}${t('level')} ${levelNo}`;
  el.title = d === 'normal' ? '' : t(d);
}

// Fortschritt: abgefahrene LKWs / alle LKWs (nur lesend aus Spiel und Ansicht)
let progShown = -1;
function updateProgress() {
  if (!game) return;
  const total = game.trucks.length || 1;
  const done = Math.min(total, view.departedShown());
  const pct = Math.round((done / total) * 100);
  const bar = $('#hud-progress');
  bar.setAttribute('aria-valuenow', pct);
  bar.firstElementChild.style.width = pct + '%';
  bar.classList.toggle('full', done >= total);
  if (done > progShown && progShown >= 0) {
    bar.classList.remove('tick');
    void bar.offsetWidth;
    bar.classList.add('tick');
  }
  progShown = done;
}

// Animiertes „Level N“-Banner beim Start
let bannerTimer = null;
function showBanner(n) {
  const d = difficulty(n);
  const el = $('#level-banner');
  el.className = 'level-banner ' + d;
  el.innerHTML = `<div class="lb-inner"><b>${t('level')} ${n}</b>${d === 'normal' ? '' : `<span class="lb-diff">${t(d)}</span><small>${t('hardBonus')} <span class="coin small"></span>×${DIFF_MULT[d]}</small>`}</div>`;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(hideBanner, d === 'normal' ? 1500 : 2200);
  if (d !== 'normal') sfx.warn();
}
function hideBanner() {
  clearTimeout(bannerTimer);
  const el = $('#level-banner');
  if (el.classList.contains('hidden') || el.classList.contains('out')) return;
  el.classList.add('out');
  bannerTimer = setTimeout(() => el.classList.add('hidden'), 260);
}

// Kurze Überblendung beim Wechsel Menü <-> Spiel
function fadeScreen() {
  const f = $('#fader');
  f.classList.remove('go');
  void f.offsetWidth;
  f.classList.add('go');
}

// Erklärfenster: neue Mechanik, neuer Bonus (jeweils nur einmal).
function showIntros(n) {
  const queue = [];
  const mech = MECH_INTRO[n];
  if (mech && !save.seenTips['m_' + mech]) queue.push({ key: 'm_' + mech, title: t('newMech'), text: t('mech_' + mech) });
  for (const b of BOOSTERS) {
    if (b.unlock === n && !save.seenTips['b_' + b.key]) {
      queue.push({ key: 'b_' + b.key, title: t('boosterNew'), text: `${t('bdesc_' + b.key)}`, extra: `<img class="reward-ico" src="assets/boosters/${b.key}.png" alt=""><div class="reward">${t('booster_' + b.key)} <small>${t('boosterFree')}</small></div>` });
    }
  }
  const next = () => {
    const tip = queue.shift();
    if (!tip) {
      hideModal();
      if (levelNo !== n || !game) return;
      showBanner(n);
      if (n === 1) setTimeout(() => { if (game && levelNo === 1 && game.moves === 0) { hintShown = true; toast(t('tutorial1'), 4000); } }, 1300);
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
  view.setInsets(hud.bottom, window.innerHeight + vgap - b.top);
}

function updateCoins() {
  $('#hud-coins').textContent = save.coins;
  $('#menu-coins').textContent = save.coins;
}

function canAct() {
  return game && game.status === 'playing' && !modalOpen() && !pending;
}

function handleTap(id) {
  if (!canAct()) return;
  unlockAudio();
  if (selecting === 'crane') {
    useCrane(id);
    return;
  }
  // Alle Buchten sichtbar belegt: LKW bleibt stehen (wie bei „Keine Rampe frei“)
  if (!view.canDispatch() && game.canExit(game.trucks[id])) {
    view.nudge(id, -1);
    sfx.noRamp();
    toast(t('noRamp'));
    return;
  }
  const res = game.tap(id);
  if (res.ok) {
    if (hintShown) { hideToast(); hintShown = false; }
    updateGuide();
    hideBanner();
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

// Tutorial-Hand in den ersten Leveln: zeigt auf den nächsten LKW der Referenzlösung
const GUIDE_LEVELS = 2;
function updateGuide() {
  view.guideId = null;
  if (!game || levelNo > GUIDE_LEVELS || game.status !== 'playing') return;
  if (save.levels[levelNo]?.won) return;
  const sol = LEVELS[levelNo - 1].sol || [];
  for (const id of sol) {
    const tr = game.trucks[id];
    if (!tr || tr.state !== 0) continue; // schon weg (nicht mehr im Hof)
    if (game.canExit(tr)) view.guideId = id;
    return;
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
  const diff = difficulty(levelNo);
  const reward = Math.round((firstWin ? REWARD.win + (firstTry ? REWARD.firstTry : 0) : REWARD.replay) * DIFF_MULT[diff]);
  const coinsBefore = save.coins;
  rec.won = true;
  if (!rec.best || game.moves < rec.best) rec.best = game.moves;
  // Sterne: 3 = ohne Bonus und ohne Neustart, je ein Stern weniger für Bonus bzw. neuen Versuch
  const stars = Math.max(1, 3 - (usedBoosters > 0 ? 1 : 0) - (attempt > 1 ? 1 : 0));
  rec.stars = Math.max(rec.stars || 0, stars);
  save.coins += reward;
  save.stats.won++;
  if (levelNo >= save.level) save.level = levelNo + 1;
  save.maxLevel = Math.max(save.maxLevel, levelNo + 1);
  unlockBoosters();
  writeSave(save);
  $('#warn').classList.add('hidden');
  sfx.win();
  for (let k = 1; k <= stars; k++) setTimeout(() => sfx.coin(), 350 + k * 280);
  view.celebrate?.();
  updateProgress();
  showDialog({
    title: t('won'),
    cls: 'win',
    html: `<div class="win-stars">${[1, 2, 3].map((k) => `<span class="star ${k <= stars ? 'on' : ''}" style="animation-delay:${0.25 + k * 0.28}s"></span>`).join('')}</div><img class="result-art" src="assets/win.png" alt=""><p>${stars < 3 ? t(usedBoosters > 0 ? 'starHintBooster' : 'starHintRetry') : t('wonText')}</p><div class="reward"><span class="coin"></span><span class="reward-num">+0</span>${firstTry ? ` <small>${t('firstTry')}</small>` : ''}${diff !== 'normal' ? ` <small class="diff-tag ${diff}">${t(diff)} ×${DIFF_MULT[diff]}</small>` : ''}</div>`,
    actions: [
      { label: t('next'), cls: 'primary pulse', fn: () => startLevel(levelNo + 1) },
      { label: t('menu'), fn: showMenu },
    ],
  });
  // Münzen zählen nach den Sternen hoch (Dialog und Münzanzeige)
  const num = $('#modal-panel .reward-num');
  setTimeout(() => {
    countUp(num, 0, reward, 900, (v) => '+' + v);
    countUp($('#hud-coins'), coinsBefore, save.coins, 900);
    countUp($('#menu-coins'), coinsBefore, save.coins, 900);
  }, 450 + stars * 280);
}

// Zahl animiert hochzählen (im Dialog mit leisem Münzklang)
function countUp(el, from, to, ms, fmt = (v) => String(v)) {
  if (!el) return;
  const t0 = performance.now();
  const loud = el.classList.contains('reward-num');
  let lastTick = 0;
  const step = (now) => {
    if (!el.isConnected) return;
    const k = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(Math.round(from + (to - from) * e));
    if (loud && now - lastTick > 120 && k < 1) { lastTick = now; sfx.coin(); }
    if (k < 1) requestAnimationFrame(step);
    else if (loud) { const r = el.parentElement; r.classList.remove('bump'); void r.offsetWidth; r.classList.add('bump'); }
  };
  requestAnimationFrame(step);
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
  // Weiterspielen mit Extra-Rampe: nur wenn alle Rampen voll waren und die Extra-Rampe noch frei ist
  const actions = [];
  const canContinue = reason !== 'rush' && reason !== 'stuck' && !game.extraUsed;
  if (canContinue) {
    const def = BOOSTERS[0];
    const st = save.boosters.ramp;
    const free = st.count > 0;
    const price = continuePrice();
    const afford = free || save.coins >= price;
    actions.push({
      html: `<span class="cont-ico"><img src="assets/boosters/ramp.png" alt=""></span><span class="cont-label">${t('continueRamp')}</span><span class="cont-price">${free ? `${t('continueFree')}` : `<span class="coin small"></span>${price}`}</span>`,
      cls: 'primary continue' + (afford ? ' pulse' : ' poor'),
      fn: () => continueWithRamp(def, free),
    });
  }
  actions.push({ label: t('restart'), cls: canContinue ? '' : 'primary', fn: () => startLevel(levelNo) });
  actions.push({ label: t('menu'), cls: 'quiet', fn: showMenu });
  showDialog({
    title: canContinue ? t('continueTitle') : reason === 'rush' ? t('lostRushTitle') : t('lost'),
    cls: 'lose',
    html: `<img class="result-art lose" src="assets/lose.png" alt=""><p>${text}</p>${canContinue ? `<p class="cont-text">${t('continueText')}</p>` : ''}`,
    actions,
  });
}

// Weiterspielen wird mit den Leveln teurer (früh günstig, später wie die Extra-Rampe)
function continuePrice() {
  return Math.min(BOOSTERS[0].price, 100 + 10 * Math.floor((levelNo - 1) / 7));
}

// Niederlage aufheben: Extra-Rampe einsetzen (Bonus-Vorrat oder Münzen) und weiterspielen
function continueWithRamp(def, free) {
  if (!game || game.extraUsed) return;
  if (!free) {
    const price = continuePrice();
    if (save.coins < price) { toast(`${t('notEnough')} (${price})`); sfx.noRamp(); return; }
    save.coins -= price;
    save.boosters.ramp.count++;
    updateCoins();
    sfx.coin();
  }
  // Fehlversuch zurücknehmen: es geht im selben Versuch weiter
  const rec = levelRecord(levelNo);
  rec.fails = Math.max(0, rec.fails - 1);
  save.stats.lost = Math.max(0, save.stats.lost - 1);
  hideModal();
  game.status = 'playing';
  const ev = game.useExtraRamp();
  if (ev) consume('ramp', ev);
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
  if (def.key === 'crane' && (game.freeRampCount() === 0 || !view.canDispatch())) { toast(t('noRamp')); return; }
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
  usedBoosters++;
  writeSave(save);
  sfx.booster();
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
let modalTimer = null;
function showDialog({ title, text, html, actions = [], cls = '' }) {
  const p = $('#modal-panel');
  const m = $('#modal');
  clearTimeout(modalTimer);
  const wasOpen = !m.classList.contains('hidden') && !m.classList.contains('closing');
  p.className = 'panel ' + cls;
  p.innerHTML = `<h2>${title}</h2>${text ? `<p>${text}</p>` : ''}${html || ''}<div class="actions"></div>`;
  const box = p.querySelector('.actions');
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.cls || '');
    if (a.html) b.innerHTML = a.html; else b.textContent = a.label;
    b.onclick = () => a.fn();
    box.appendChild(b);
  }
  m.classList.remove('hidden', 'closing');
  // Dialog-Wechsel ohne Schließen: Panel kurz neu einblenden
  if (wasOpen) { void p.offsetWidth; p.classList.add('swap'); }
  p.scrollTop = 0;
}

function hideModal() {
  const m = $('#modal');
  if (m.classList.contains('hidden')) return;
  m.classList.add('closing');
  clearTimeout(modalTimer);
  modalTimer = setTimeout(() => { m.classList.add('hidden'); m.classList.remove('closing'); }, 170);
}
function modalOpen() {
  const m = $('#modal');
  return !m.classList.contains('hidden') && !m.classList.contains('closing');
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
    };
  });
  p.querySelectorAll('[data-lang]').forEach((b) => {
    b.onclick = () => {
      s.lang = b.dataset.lang;
      setLang(s.lang);
      writeSave(save);
      applyTexts();
      if (game) setHudLevel();
      refreshMenu();
      showSettings(back);
    };
  });
}

function showLevels() {
  let html = '';
  for (let w = 0; w * 10 < LEVELS.length; w++) {
    const got = Array.from({ length: 10 }, (_, k) => save.levels[w * 10 + k + 1]?.stars || 0).reduce((a, b) => a + b, 0);
    html += `<div class="world-banner" style="--wb:url('../assets/worlds/w${w + 1}.webp')"><div class="wb-text"><small>${t('world')} ${w + 1}</small><b>${t('wname' + (w + 1))}</b></div><div class="wb-stars"><span class="star on"></span>${got}/30</div></div><div class="level-grid">`;
    for (let i = w * 10 + 1; i <= Math.min(LEVELS.length, w * 10 + 10); i++) {
      const rec = save.levels[i];
      const open = DEV || i <= save.maxLevel;
      const d = difficulty(i);
      const cls = (rec?.won ? 'won' : i === save.level ? 'current' : '') + (d !== 'normal' ? ' ' + d : '');
      const st = rec?.won ? `<span class="mini-stars">${[1, 2, 3].map((k) => `<i class="${k <= (rec.stars || 1) ? 'on' : ''}"></i>`).join('')}</span>` : '';
      const badge = d !== 'normal' ? `<span class="lv-diff" title="${t(d)}"></span>` : '';
      html += `<button data-l="${i}" class="${cls.trim()}" ${open ? '' : 'disabled'} aria-label="${t('level')} ${i}${d !== 'normal' ? ' – ' + t(d) : ''}">${i}${badge}${st}</button>`;
    }
    html += '</div>';
  }
  html += `<div class="diff-legend"><span><i class="lv-diff hard"></i>${t('hard')}</span><span><i class="lv-diff vhard"></i>${t('vhard')}</span><span><span class="coin small"></span>${t('hardBonus')}</span></div>`;
  showDialog({ title: t('levels'), cls: 'levels', html, actions: [{ label: t('back'), fn: hideModal }] });
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
$('#btn-play').onclick = () => { unlockAudio(); goFullscreen(); startLevel(Math.min(save.level, LEVELS.length)); };
$('#btn-levels').onclick = () => { unlockAudio(); showLevels(); };
$('#btn-settings').onclick = () => { unlockAudio(); showSettings(); };
$('#btn-pause').onclick = () => showPause();
$('#btn-restart').onclick = () => restartLevel();
// Ein zentraler UI-Klickton für alle Buttons (Menü, Dialoge, Pause, Levelauswahl, Boni)
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('button');
  if (!b || b.disabled) return;
  unlockAudio();
  sfx.button();
}, true);
$('#modal').addEventListener('pointerdown', (e) => e.stopPropagation());

document.addEventListener('visibilitychange', () => suspendAudio(document.hidden));
window.addEventListener('resize', () => { if (game) measureInsets(); });

unlockBoosters();
writeSave(save);
showMenu();
bootSplash().then(() => setTimeout(checkDaily, 700));
registerSW();

// ---------- Ladebildschirm ----------
// Wartet, bis die wichtigsten Bilder geladen sind (max. 6 s), dann sanftes Ausblenden.
function bootSplash() {
  const IMGS = ['assets/logo.png', 'assets/menu-bg2.jpg', 'assets/win.png', 'assets/lose.png',
    ...BOOSTERS.map((b) => `assets/boosters/${b.key}.png`)];
  const fill = $('#splash-fill');
  $('#splash-text').textContent = t('loading');
  let done = 0;
  const tick = () => { done++; fill.style.width = Math.round((done / IMGS.length) * 100) + '%'; };
  const load = (src) => new Promise((res) => {
    const im = new Image();
    im.onload = im.onerror = () => { tick(); res(); };
    im.src = src;
    if (im.decode) im.decode().catch(() => {});
  });
  const minTime = new Promise((r) => setTimeout(r, 650));
  const maxTime = new Promise((r) => setTimeout(r, 6000));
  return Promise.race([Promise.all([...IMGS.map(load), minTime]), maxTime]).then(() => new Promise((res) => {
    fill.style.width = '100%';
    const sp = $('#splash');
    setTimeout(() => {
      sp.classList.add('out');
      document.body.classList.remove('booting');
      setTimeout(() => { sp.remove(); res(); }, 450);
    }, 180);
  }));
}

// ---------- Offline (Service Worker) ----------
// Nur über https. Auf localhost bleibt die Entwicklung ohne Cache (außer mit ?sw zum Testen).
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (local && !new URLSearchParams(location.search).has('sw')) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    if (window.caches) caches.keys().then((ks) => ks.filter((k) => k.startsWith('pallet-rush')).forEach((k) => caches.delete(k))).catch(() => {});
    return;
  }
  if (location.protocol !== 'https:' && !local) return;
  const reg = () => navigator.serviceWorker.register('sw.js?v=' + encodeURIComponent(VERSION)).catch(() => {});
  if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg);
}

// ---------- Tägliche Belohnung ----------
const DAILY = [30, 40, 50, 60, 80, 100, 150]; // Tag 1–7 der Serie, danach bleibt es bei Tag 7
function dayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function checkDaily() {
  if (game || modalOpen()) return;
  const today = dayKey();
  const d = save.daily;
  if (d.last === today) return;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const streak = d.last === dayKey(y) ? d.streak + 1 : 1;
  const idx = Math.min(streak, DAILY.length) - 1;
  const days = DAILY.map((c, i) => `<div class="day ${i < idx ? 'done' : i === idx ? 'today' : ''}"><small>${t('day')} ${i + 1}</small><span class="coin"></span><b>${c}</b></div>`).join('');
  showDialog({
    title: t('dailyTitle'),
    html: `<p>${t('dailyText')}</p><div class="daily-row">${days}</div>`,
    actions: [{ label: `${t('collect')} +${DAILY[idx]}`, cls: 'primary', fn: () => {
      save.daily = { last: today, streak };
      save.coins += DAILY[idx];
      writeSave(save);
      sfx.coin();
      hideModal();
      refreshMenu();
      coinBurst($('#menu-coins'));
    } }],
  });
}

// Münzen fliegen von der Mitte zur Münzanzeige
function coinBurst(target) {
  const r = target.getBoundingClientRect();
  const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  for (let i = 0; i < 10; i++) {
    const c = document.createElement('span');
    c.className = 'coin fly-coin';
    c.style.left = cx + 'px';
    c.style.top = cy + 'px';
    c.style.setProperty('--dx', (r.left + r.width / 2 - cx) + 'px');
    c.style.setProperty('--dy', (r.top + r.height / 2 - cy) + 'px');
    c.style.setProperty('--sx', ((Math.random() - 0.5) * 180) + 'px');
    c.style.setProperty('--sy', ((Math.random() - 0.5) * 180) + 'px');
    c.style.animationDelay = i * 0.05 + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 1500 + i * 50);
  }
  setTimeout(() => { target.parentElement.classList.remove('bump'); void target.offsetWidth; target.parentElement.classList.add('bump'); }, 900);
}

// Für Tests in der Konsole
window.__pr = { get game() { return game; }, view, startLevel, get save() { return save; }, onBooster: (k) => onBooster(BOOSTERS.find((b) => b.key === k)) };
